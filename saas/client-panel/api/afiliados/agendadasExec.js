/**
 * Executor das mensagens agendadas (fase 2.2) e o motor que olha o relogio a cada 20 s.
 * - Link de marketplace no texto e trocado pelo do cliente (origem 'agendada'); link de convite
 *   de grupo e preservado (aqui o cliente pode querer divulgar o proprio grupo).
 * - Envio grupo a grupo com pausa aleatoria; falha em um nao para os outros.
 * - Antes de enviar confere que cada grupo ainda e destino salvo e nao virou fonte.
 * - WhatsApp fora: nada e reservado, entao tenta de novo no proximo ciclo ate a tolerancia (30 min).
 */
const agendadas = require('./agendadas')
const conversor = require('./conversor')
const auditoria = require('./auditoria')
const links = require('./links')
const cupons = require('./cupons')

const emExecucao = new Set()
const CONVITE_RE = /https?:\/\/chat\.whatsapp\.com\/\S+/gi
const LIM = { maxGrupos: [1, 30, 10], pausaMin: [3, 60, 6], pausaMax: [3, 120, 12] }

const licencaAtiva = (cfg) => !!(cfg && cfg.license && cfg.license.active && new Date(cfg.license.expiresAt) > new Date())
const dormirReal = (ms) => new Promise((r) => setTimeout(r, ms))

function limites(c) {
  const x = c || {}
  const n = (k) => {
    const [min, max, padrao] = LIM[k]
    const v = Number(x[k])
    return Number.isInteger(v) && v >= min && v <= max ? v : padrao
  }
  const pausaMin = n('pausaMin')
  return { maxGrupos: n('maxGrupos'), pausaMin, pausaMax: Math.max(pausaMin, n('pausaMax')) }
}

// Troca so os links de marketplace; convites de grupo passam intactos
async function converter(texto, ctx) {
  const convites = []
  const protegido = texto.replace(CONVITE_RE, (m) => { convites.push(m); return 'NAMYCONVITE' + (convites.length - 1) + 'X' })
  const restaura = (t) => t.replace(/NAMYCONVITE(\d+)X/g, (_, i) => convites[Number(i)] || '')
  if (!links.extrairUrls(protegido).length) return { ok: true, texto, links: 0 }
  const conv = await conversor.converterTexto(protegido, ctx)
  const semLinkDeLoja = !conv.ok && !conv.trocas.length && conv.erros.every((e) => !e.url)
  if (semLinkDeLoja) return { ok: true, texto, links: 0 }
  if (!conv.ok) return { ok: false, motivo: 'link: ' + conv.erros.map((e) => e.motivo).join('; ') }
  return { ok: true, texto: restaura(conv.texto), links: conv.trocas.length }
}

/**
 * deps: { sessions, logs, DATA, random?, dormir? }; cfg: configuracao ATUAL da conta.
 * Devolve o registro gravado no historico ({ resultado: ok | parcial | falhou, enviados, falhas, grupos }).
 */
async function executar(deps, userId, cfg, item, { manual = false, prevista = '' } = {}) {
  const random = deps.random || Math.random
  const dormir = deps.dormir || dormirReal
  const lim = limites(cfg.agendadas)
  const dataDir = deps.DATA
  const salvos = new Map((cfg.groups || []).map((g) => [g && g.jid, g]))
  const fontes = new Set((cfg.sources || []).map((g) => g && g.jid))
  const grupos = []
  const reg = { em: new Date().toISOString(), prevista, origem: manual ? 'manual' : 'agenda', resultado: 'falhou', enviados: 0, falhas: 0, motivo: '', grupos }

  const fim = async (motivo) => {
    reg.motivo = reg.motivo || motivo || ''
    reg.resultado = reg.enviados && !reg.falhas ? 'ok' : reg.enviados ? 'parcial' : 'falhou'
    await agendadas.registrarExecucao(dataDir, userId, item.id, reg)
    return reg
  }

  if (!licencaAtiva(cfg)) return fim('Licenca expirada ou inativa.')

  const validos = []
  for (const jid of item.destinos) {
    const g = salvos.get(jid)
    if (!g) grupos.push({ jid, name: jid, ok: false, erro: 'nao e mais um destino salvo' })
    else if (fontes.has(jid)) grupos.push({ jid, name: g.name || jid, ok: false, erro: 'virou grupo de captura (fonte)' })
    else validos.push(g)
  }
  const aEnviar = validos.slice(0, lim.maxGrupos)
  for (const g of validos.slice(lim.maxGrupos)) grupos.push({ jid: g.jid, name: g.name || g.jid, ok: false, erro: 'acima do limite de ' + lim.maxGrupos + ' grupos por execucao' })
  reg.falhas = grupos.length
  if (!aEnviar.length) return fim('Nenhum grupo valido para enviar.')

  // {cupom}: so sai com cupom cadastrado e vigente; sem ele a mensagem NAO e enviada
  let textoItem = item.texto
  if (/\{cupom\}/.test(textoItem)) {
    const c = cupons.escolher(dataDir, userId, {})
    if (!c) {
      for (const g of aEnviar) grupos.push({ jid: g.jid, name: g.name || g.jid, ok: false, erro: 'sem cupom vigente' })
      reg.falhas = grupos.length
      return fim('A mensagem usa {cupom}, mas nao ha cupom vigente. Cadastre ou renove em Cupons.')
    }
    textoItem = textoItem.replace(/\{cupom\}/g, c.codigo + (c.regra ? ' — ' + c.regra : ''))
  }
  const porGrupo = !!(cfg.comissoes && cfg.comissoes.porGrupo)
  const ctx = { userId, cfg, dataDir }
  const base = await converter(textoItem, Object.assign({}, ctx, { atribuicao: { origem: 'agendada', nicho: 'geral' } }))
  if (!base.ok) {
    for (const g of aEnviar) grupos.push({ jid: g.jid, name: g.name || g.jid, ok: false, erro: base.motivo })
    reg.falhas = grupos.length
    return fim(base.motivo)
  }

  for (let i = 0; i < aEnviar.length; i++) {
    const g = aEnviar[i]
    const nome = g.name || g.jid
    try {
      let texto = base.texto
      if (porGrupo && base.links) {
        const cv = await converter(textoItem, Object.assign({}, ctx, { atribuicao: { origem: 'agendada', nicho: g.niche || 'geral', grupo: g.jid } }))
        if (!cv.ok) throw new Error(cv.motivo)
        texto = cv.texto
      }
      await deps.sessions.sendOffer(userId, g.jid, { text: texto, imageUrl: item.imagemUrl || '' })
      grupos.push({ jid: g.jid, name: nome, ok: true })
      reg.enviados++
      await auditoria.registrar(dataDir, userId, { tipo: 'enviado', grupo: nome, jid: g.jid, nicho: g.niche, fonte: 'agendada', produtoKey: 'agenda:' + item.id, nome: item.nome, links: base.links })
      if (deps.logs) deps.logs.append(dataDir, userId, { source: 'agendada', level: 'info', ok: true, group: nome, jid: g.jid, message: 'Agendada: ' + item.nome.slice(0, 100) })
    } catch (e) {
      const wa = e.code === 'WA' || /conectado/i.test(e.message || '')
      grupos.push({ jid: g.jid, name: nome, ok: false, erro: String(e.message || 'falha no envio').slice(0, 160) })
      reg.falhas++
      await auditoria.registrar(dataDir, userId, { tipo: 'falha', motivo: (wa ? 'WhatsApp: ' : '') + (e.message || 'falha no envio'), grupo: nome, jid: g.jid, nicho: g.niche, fonte: 'agendada', produtoKey: 'agenda:' + item.id, nome: item.nome })
      if (deps.logs) deps.logs.append(dataDir, userId, { source: wa ? 'whatsapp' : 'agendada', level: 'error', ok: false, group: nome, jid: g.jid, message: (wa ? 'WhatsApp: ' : '') + (e.message || 'Falha no envio') })
      if (wa && e.code === 'WA' && /conectado/i.test(e.message || '')) {
        // Sessao caiu: nao martela os outros grupos
        for (const resto of aEnviar.slice(i + 1)) { grupos.push({ jid: resto.jid, name: resto.name || resto.jid, ok: false, erro: 'WhatsApp caiu antes do envio' }); reg.falhas++ }
        return fim('O WhatsApp caiu durante o envio.')
      }
    }
    if (i < aEnviar.length - 1) await dormir((lim.pausaMin + random() * (lim.pausaMax - lim.pausaMin)) * 1000)
  }
  return fim('')
}

/** Um ciclo do motor para um cliente (exportado para teste). Devolve quantas agendas rodou. */
async function ciclo(deps, userId, cfg, agora = Date.now()) {
  if (!cfg || !licencaAtiva(cfg) || emExecucao.has(userId)) return 0
  if (!agendadas.temAgendas(deps.DATA, userId)) return 0
  if (!deps.sessions.publicState(userId).connected) return 0 // nada reservado: tenta no proximo ciclo
  emExecucao.add(userId)
  try {
    const vencidas = await agendadas.reservarVencidas(deps.DATA, userId, agora)
    for (const it of vencidas) {
      const atual = (deps.readJson(deps.CONFIGS, {})[userId]) || cfg
      await executar(deps, userId, atual, it, { prevista: it.prevista })
    }
    return vencidas.length
  } finally { emExecucao.delete(userId) }
}

function iniciar(deps) {
  async function tick() {
    const configs = deps.readJson(deps.CONFIGS, {})
    for (const userId of Object.keys(configs)) {
      ciclo(deps, userId, configs[userId]).catch((e) => console.error('[AGENDADAS]', e.message))
    }
  }
  setInterval(tick, 20000)
  setTimeout(tick, 20000)
}

module.exports = { executar, ciclo, iniciar, limites, licencaAtiva, emExecucao }
