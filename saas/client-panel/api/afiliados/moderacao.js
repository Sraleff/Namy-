/**
 * Moderação dos grupos de destino do cliente (D1). Desligada por padrão; liga por grupo.
 *   antiLink   apaga mensagem com link (ou convite de grupo) de quem não é admin
 *   antiFlood  apaga a partir da 6ª mensagem da mesma pessoa em 30 s
 *   avisar     manda um aviso curto no grupo (no máximo 1 a cada 2 min por grupo)
 *   removerApos 3 ou 5 infrações em 24 h = remove a pessoa (0 = nunca)
 * O número conectado precisa ser admin do grupo. Admins nunca são moderados.
 *
 * PRIVACIDADE: nada sobre os participantes vai para o disco. Os contadores ficam só na memória,
 * com a chave em hash, e os Logs dizem só o grupo e quantas mensagens foram apagadas.
 */
const crypto = require('crypto')
const whatsMsg = require('./whatsMsg')
const cerebro = require('./cerebro')
const limites = require('./limites')

const FLOOD_MAX = 5
const FLOOD_JANELA = 30 * 1000
const INFRACAO_JANELA = 24 * 3600 * 1000
const AVISO_GRUPO_MS = 2 * 60 * 1000
const LOG_MS = 10 * 60 * 1000
const META_MS = 10 * 60 * 1000
const LINK_RE = /(https?:\/\/|www\.)\S+|chat\.whatsapp\.com\/\S+|\b[a-z0-9-]+\.(com|com\.br|net|org|io|me|ly|gl|la|ee)\/\S+/i

const flood = new Map() // hash -> [timestamps]
const infracoes = new Map() // hash -> [timestamps]
const avisos = new Map() // userId|jid -> ultimo aviso
const metas = new Map() // userId|jid -> { at, participantes }
const logGrupo = new Map() // userId|jid -> { at, pendentes: { link, flood, removidos } }

const chave = (userId, jid, participante) => crypto.createHash('sha1').update(userId + '|' + jid + '|' + whatsMsg.base(participante)).digest('hex')
const temLink = (texto) => LINK_RE.test(String(texto || ''))

function recentes(mapa, k, janela, agora, somar) {
  const lista = (mapa.get(k) || []).filter((t) => agora - t < janela)
  if (somar) lista.push(agora)
  if (lista.length) mapa.set(k, lista)
  else mapa.delete(k)
  if (mapa.size > 20000) mapa.delete(mapa.keys().next().value)
  return lista.length
}

async function participantes(sock, userId, jid, agora) {
  const k = userId + '|' + jid
  const hit = metas.get(k)
  if (hit && agora - hit.at < META_MS) return hit.participantes
  const meta = await sock.groupMetadata(jid)
  const lista = (meta && meta.participants) || []
  metas.set(k, { at: agora, participantes: lista })
  return lista
}

/** Ids do participante (telefone, LID) normalizados. */
const idsDe = (p) => [p.id, p.lid, p.jid, p.phoneNumber].map(whatsMsg.base).filter(Boolean)
const ehAdmin = (lista, ids) => lista.some((p) => (p.admin === 'admin' || p.admin === 'superadmin') && idsDe(p).some((x) => ids.includes(x)))

function registrarLog(deps, userId, jid, nome, tipo, agora) {
  if (!deps.logs) return
  const k = userId + '|' + jid
  const st = logGrupo.get(k) || { at: 0, pendentes: { link: 0, flood: 0, removidos: 0 } }
  st.pendentes[tipo] = (st.pendentes[tipo] || 0) + 1
  if (agora - st.at >= LOG_MS) {
    const p = st.pendentes
    const partes = []
    if (p.link) partes.push(p.link + ' com link')
    if (p.flood) partes.push(p.flood + ' por excesso')
    let message = 'Moderação em ' + nome + ': ' + (p.link + p.flood) + ' mensagem(ns) apagada(s)' + (partes.length ? ' (' + partes.join(', ') + ')' : '') + '.'
    if (p.removidos) message += ' ' + p.removidos + ' pessoa(s) removida(s).'
    try { deps.logs.append(deps.DATA, userId, { source: 'moderacao', level: 'info', ok: true, group: nome, jid, message }) } catch {}
    st.at = agora
    st.pendentes = { link: 0, flood: 0, removidos: 0 }
  }
  logGrupo.set(k, st)
}

/**
 * Avalia uma mensagem de grupo (de outra pessoa). deps: { DATA, logs }.
 * Devolve { acao: 'nada' | 'apagada' | 'sem-admin', motivo }.
 */
async function avaliar(deps, userId, cfg, m, sock, texto, agora = Date.now()) {
  const jid = String((m && m.key && m.key.remoteJid) || '')
  if (!jid.endsWith('@g.us') || !m.key || m.key.fromMe) return { acao: 'nada' }
  if (!limites.podeRecurso(cfg, 'moderacao')) return { acao: 'nada' }
  const conf = cerebro.moderacaoDe(cerebro.carregar(deps.DATA, userId), cfg, jid)
  if (!conf) return { acao: 'nada' }
  const participante = m.key.participant || m.participant || ''
  if (!participante) return { acao: 'nada' }
  const k = chave(userId, jid, participante)
  // Conta a mensagem no flood sempre (mesmo as sem link), para saber o ritmo da pessoa
  const ritmo = conf.antiFlood ? recentes(flood, k, FLOOD_JANELA, agora, true) : 0
  let motivo = ''
  if (conf.antiLink && temLink(texto)) motivo = 'link'
  else if (conf.antiFlood && ritmo > FLOOD_MAX) motivo = 'flood'
  if (!motivo) return { acao: 'nada' }

  let lista
  try { lista = await participantes(sock, userId, jid, agora) } catch { return { acao: 'nada' } }
  if (ehAdmin(lista, [whatsMsg.base(participante)].concat(m.key.participantAlt ? [whatsMsg.base(m.key.participantAlt)] : []))) return { acao: 'nada' }
  const nome = ((cfg.groups || []).find((g) => g.jid === jid) || {}).name || jid
  if (!ehAdmin(lista, whatsMsg.proprios(sock))) {
    const ka = userId + '|' + jid + '|semadmin'
    if (agora - (avisos.get(ka) || 0) > LOG_MS && deps.logs) {
      avisos.set(ka, agora)
      try { deps.logs.append(deps.DATA, userId, { source: 'moderacao', level: 'warn', ok: false, group: nome, jid, message: 'Moderação em ' + nome + ': o seu número não é admin do grupo, então não dá para apagar mensagens.' }) } catch {}
    }
    return { acao: 'sem-admin', motivo }
  }

  try { await sock.sendMessage(jid, { delete: m.key }) } catch (e) { return { acao: 'nada', motivo: 'falha ao apagar: ' + (e.message || '') } }
  registrarLog(deps, userId, jid, nome, motivo, agora)

  if (conf.avisar) {
    const ka = userId + '|' + jid
    if (agora - (avisos.get(ka) || 0) > AVISO_GRUPO_MS) {
      avisos.set(ka, agora)
      const texto = motivo === 'link'
        ? '⚠️ Mensagem com link apagada: neste grupo só os administradores enviam links.'
        : '⚠️ Mensagens demais em pouco tempo foram apagadas. Vá com calma 🙂'
      try { await sock.sendMessage(jid, { text: texto }) } catch {}
    }
  }

  if (conf.removerApos > 0) {
    const n = recentes(infracoes, k, INFRACAO_JANELA, agora, true)
    if (n >= conf.removerApos) {
      try {
        await sock.groupParticipantsUpdate(jid, [participante], 'remove')
        infracoes.delete(k)
        registrarLog(deps, userId, jid, nome, 'removidos', agora)
        return { acao: 'apagada', motivo, removida: true }
      } catch {}
    }
  }
  return { acao: 'apagada', motivo }
}

module.exports = { avaliar, temLink, FLOOD_MAX, _cache: { flood, infracoes, avisos, metas, logGrupo } }
