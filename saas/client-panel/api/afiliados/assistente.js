/**
 * Assistente com IA nos grupos de destino (D1). Desligado por padrão.
 * Responde SÓ quando alguém menciona o número conectado ou responde a uma mensagem dele, com a
 * IA e a chave que o cliente já salvou em Inteligência Artificial (BYOK; ou a IA local liberada).
 *
 * Trava: a IA recebe só os nomes das últimas ofertas enviadas ao grupo e os cupons vigentes; a
 * resposta não pode ter link nem preço (preço muda: quem decide é a oferta). Reprovou ou falhou:
 * resposta padrão, curta e segura. Limites: N respostas por hora por grupo, 1 por minuto por pessoa.
 * PRIVACIDADE: perguntas e respostas não são gravadas; os Logs só contam respostas por grupo.
 */
const crypto = require('crypto')
const whatsMsg = require('./whatsMsg')
const cerebro = require('./cerebro')
const limites = require('./limites')
const auditoria = require('./auditoria')
const cupons = require('./cupons')
const copy = require('./copy')
const cofre = require('./cofre')

const PERGUNTA_MAX = 500
const RESPOSTA_MAX = 400
const PADRAO = 'Não tenho essa informação aqui 🙂 Fique de olho nas ofertas que chegam no grupo!'
const porGrupo = new Map() // userId|jid -> [ts]
const porPessoa = new Map() // hash -> ts
const logs = new Map() // userId|jid -> { at, n }

/** Foi chamado? Menção ao número conectado ou resposta a uma mensagem dele. */
function chamado(sock, msg) {
  const ctx = whatsMsg.contextoDe(msg)
  if (!ctx) return false
  if ((ctx.mentionedJid || []).some((j) => whatsMsg.ehProprio(sock, j))) return true
  return !!(ctx.participant && whatsMsg.ehProprio(sock, ctx.participant) && ctx.quotedMessage)
}

function limparPergunta(texto, sock) {
  let t = String(texto || '')
  for (const id of whatsMsg.proprios(sock)) t = t.split('@' + id).join('')
  return t.replace(/\s+/g, ' ').trim().slice(0, PERGUNTA_MAX)
}

function contexto(dataDir, userId, jid, nicho) {
  const ofertas = auditoria.listar(dataDir, userId, { tipo: 'enviado', limite: 80 }).filter((r) => r.jid === jid).map((r) => r.nome).filter(Boolean)
  const nomes = [...new Set(ofertas)].slice(0, 5)
  const vigentes = cupons.listar(dataDir, userId).filter((c) => cupons.situacao(c) === 'vigente' || cupons.situacao(c) === 'vence-em-breve')
    .filter((c) => !c.nichos || !c.nichos.length || c.nichos.includes(nicho)).slice(0, 3)
  return { nomes, cupons: vigentes.map((c) => c.codigo + (c.regra ? ' (' + c.regra + ')' : '')) }
}

function promptDe(nomeGrupo, ctx, pergunta) {
  const sistema = 'Voce e a assistente do grupo de ofertas "' + nomeGrupo + '" no WhatsApp. Responda em portugues do Brasil, ' +
    'curto (no maximo 3 frases), simpatico, com no maximo 1 emoji. Use SOMENTE as informacoes abaixo. ' +
    'NUNCA escreva link, preco, valor em reais, frete, prazo ou estoque: isso muda e voce nao sabe. ' +
    'Se perguntarem preco ou link, diga para conferir a ultima oferta enviada no grupo. ' +
    'Se nao souber, diga que nao sabe. Nao fale de outros assuntos alem das ofertas do grupo.'
  const dados = 'ULTIMAS OFERTAS ENVIADAS: ' + (ctx.nomes.length ? ctx.nomes.join(' | ') : 'nenhuma') +
    '\nCUPONS VIGENTES: ' + (ctx.cupons.length ? ctx.cupons.join(' | ') : 'nenhum')
  return { sistema, usuario: dados + '\n\nPERGUNTA: ' + pergunta + '\n\nResposta:' }
}

/** Resposta da IA só passa sem link, sem preço e sem @menção; senão, a padrão. */
function travar(bruto) {
  const t = copy.limparSaida(String(bruto || '')).replace(/\s+\n/g, '\n').trim()
  if (!t) return { ok: false, texto: PADRAO, motivo: 'vazia' }
  if (/(https?:\/\/|www\.)|\b[a-z0-9-]+\.(com|com\.br|net|ly|ee|la)\b/i.test(t)) return { ok: false, texto: PADRAO, motivo: 'link' }
  if (/R\$\s?\d|\d+\s?reais|\d+[,.]\d{2}\b/i.test(t)) return { ok: false, texto: PADRAO, motivo: 'preço' }
  if (/@\d{5,}/.test(t)) return { ok: false, texto: PADRAO, motivo: 'menção' }
  return { ok: true, texto: t.slice(0, RESPOSTA_MAX) }
}

function chaveIA(dataDir, userId, cfg) {
  const c = (cfg.copy && cfg.copy.ia) || {}
  const provedor = c.provedor
  if (provedor === 'ollama') return copy.ollamaPermitido(cfg) ? { provedor, chave: '' } : null
  if (!copy.NUVEM.includes(provedor)) return null
  const chave = String((cofre.ler(dataDir, userId, 'ia') || {})[provedor] || '')
  return chave ? { provedor, chave } : null
}

function logResposta(deps, userId, jid, nome, agora) {
  if (!deps.logs) return
  const k = userId + '|' + jid
  const st = logs.get(k) || { at: 0, n: 0 }
  st.n++
  if (agora - st.at > 30 * 60 * 1000) {
    try { deps.logs.append(deps.DATA, userId, { source: 'assistente', level: 'info', ok: true, group: nome, jid, message: 'Assistente respondeu ' + st.n + ' pergunta(s) em ' + nome + '.' }) } catch {}
    st.at = agora
    st.n = 0
  }
  logs.set(k, st)
}

/**
 * deps: { DATA, logs, chamar (só teste) }. Responde no grupo citando a pergunta.
 * Devolve { respondeu, motivo }.
 */
async function talvezResponder(deps, userId, cfg, m, sock, texto, agora = Date.now()) {
  const jid = String((m && m.key && m.key.remoteJid) || '')
  if (!jid.endsWith('@g.us') || !m.key || m.key.fromMe) return { respondeu: false }
  if (!limites.podeRecurso(cfg, 'assistente')) return { respondeu: false }
  const db = cerebro.carregar(deps.DATA, userId)
  if (!cerebro.iaNoGrupo(db, cfg, jid)) return { respondeu: false }
  const msg = whatsMsg.desembrulhar(m.message)
  if (!chamado(sock, msg)) return { respondeu: false }
  const pergunta = limparPergunta(texto, sock)
  if (!pergunta) return { respondeu: false }

  const pessoa = crypto.createHash('sha1').update(userId + '|' + jid + '|' + whatsMsg.base(m.key.participant)).digest('hex')
  if (agora - (porPessoa.get(pessoa) || 0) < 60 * 1000) return { respondeu: false, motivo: 'pessoa' }
  const kg = userId + '|' + jid
  const hora = (porGrupo.get(kg) || []).filter((t) => agora - t < 3600 * 1000)
  if (hora.length >= db.ia.limiteHora) return { respondeu: false, motivo: 'limite' }

  const ia = chaveIA(deps.DATA, userId, cfg)
  if (!ia) return { respondeu: false, motivo: 'sem-chave' }
  porPessoa.set(pessoa, agora)
  if (porPessoa.size > 20000) porPessoa.delete(porPessoa.keys().next().value)
  hora.push(agora)
  porGrupo.set(kg, hora)

  const grupo = (cfg.groups || []).find((g) => g.jid === jid) || {}
  const nome = grupo.name || 'Ofertas'
  let resposta = PADRAO
  let motivo = ''
  try {
    const p = promptDe(nome, contexto(deps.DATA, userId, jid, grupo.niche), pergunta)
    const chamar = deps.chamar || copy.chamarProvedor
    const t = travar(await chamar(ia.provedor, ia.chave, null, { prompt: p }))
    resposta = t.texto
    motivo = t.ok ? '' : t.motivo
  } catch (e) {
    motivo = 'ia: ' + String(e.message || 'falha').slice(0, 60)
  }
  try { await sock.sendMessage(jid, { text: resposta }, { quoted: m }) } catch (e) { return { respondeu: false, motivo: 'envio' } }
  logResposta(deps, userId, jid, nome, agora)
  return { respondeu: true, motivo, texto: resposta }
}

module.exports = { chamado, travar, promptDe, talvezResponder, PADRAO, _cache: { porGrupo, porPessoa, logs } }
