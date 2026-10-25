/**
 * Publica ofertas de cada cliente (API Shopee e/ou banco de ofertas) no ritmo salvo.
 * Se o WhatsApp caiu, nao trata como erro da Shopee: so adia.
 *
 * Disparo v2 (fase 1.4). Tudo opcional: conta antiga, sem os campos novos, funciona
 * exatamente como antes (intervalo fixo, 1 produto por execucao).
 *  - ads.intervalMode 'fixo' (padrao: o intervalo ads.interval) ou 'aleatorio'
 *    (ads.intervalMin..intervalMax, em minutos). No aleatorio, depois de cada execucao
 *    com envio o proximo horario e sorteado e gravado em ads.nextTryAt (sobrevive a reinicio).
 *  - ads.perRunMin..perRunMax (1..10, padrao 1): produtos publicados em sequencia por
 *    execucao, com pausa de 20 a 40 s entre eles.
 *  - executarAgora(): uma execucao imediata pedida pelo cliente. Ignora intervalo, janela
 *    e dias, mas respeita licenca, WhatsApp, grupos e o limite diario.
 *  - O limite diario conta PRODUTOS enviados (com 1 por execucao e igual ao de antes).
 *  - Cada cliente roda por conta propria: a pausa de um nunca trava os outros, e o mesmo
 *    cliente nunca tem duas execucoes ao mesmo tempo.
 */
const sessions = require('./sessions')
const publicador = require('./afiliados/publicador')

const INTERVAL_MS = {
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '2h': 2 * 60 * 60 * 1000,
  '3h': 3 * 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000
}

const PRODUTOS_MAX = 10
const INTERVALO_ALEATORIO_MAX = 720 // minutos
const PAUSA_ENTRE_PRODUTOS_MS = [20000, 40000]

// Clientes com uma execucao em andamento (agendada ou manual)
const emExecucao = new Set()

function diaBrasilia(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(date || new Date())
}

function minutosBrasilia(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date || new Date())
  const h = (parts.find((p) => p.type === 'hour') || {}).value || '00'
  const m = (parts.find((p) => p.type === 'minute') || {}).value || '00'
  return h + ':' + m
}

// 0 = domingo ... 6 = sabado, no fuso de Brasilia
function diaSemanaBrasilia(date) {
  const nome = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' }).format(date || new Date())
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(nome)
}

// Sem `days` salvo (contas antigas) = todos os dias
function diaPermitido(days, date) {
  if (!Array.isArray(days) || !days.length) return true
  return days.map(Number).includes(diaSemanaBrasilia(date))
}

function naJanela(from, to, agora) {
  if (!from || !to) return true
  if (from <= to) return agora >= from && agora <= to
  return agora >= from || agora <= to
}

function licencaAtiva(cfg) {
  if (!cfg || !cfg.license) return false
  return cfg.license.active && new Date(cfg.license.expiresAt) > new Date()
}

// Inteiro uniforme em [min, max]
function sortear(min, max, random = Math.random) {
  return min + Math.floor(random() * (max - min + 1))
}

// Faixa [min, max] valida (arquivo editado a mao nao quebra o disparo). Se QUALQUER lado
// for invalido, a faixa inteira volta ao padrao: nunca uma faixa "mista" que ninguem escolheu.
function faixa(ads, nomeMin, nomeMax, limMin, limMax, padraoMin, padraoMax) {
  const inteiro = (v) => {
    const n = Number(v)
    return v != null && v !== '' && Number.isInteger(n) && n >= limMin && n <= limMax ? n : null
  }
  const a = inteiro(ads[nomeMin])
  const b = inteiro(ads[nomeMax])
  if (a === null || b === null) return { min: padraoMin, max: padraoMax }
  return a <= b ? { min: a, max: b } : { min: b, max: a }
}

const produtosPorExecucao = (ads) => faixa(ads || {}, 'perRunMin', 'perRunMax', 1, PRODUTOS_MAX, 1, 1)
const intervaloAleatorio = (ads) => faixa(ads || {}, 'intervalMin', 'intervalMax', 1, INTERVALO_ALEATORIO_MAX, 30, 90)
const modoAleatorio = (ads) => !!ads && ads.intervalMode === 'aleatorio'

const limiteDiario = (ads) => Math.min(200, Math.max(1, Number(ads.dailyLimit) || 5))
const enviadosHoje = (ads) => (ads.sentDay === diaBrasilia() ? Number(ads.sentToday) || 0 : 0)
// Mesma regra do publicador: grupo FONTE (captura) nunca e destino. Sem isso o agendador
// tentava, o publicador recusava e o log enchia de erro a cada 2 minutos.
const destinosDe = (cfg) => {
  const fontes = new Set((cfg.sources || []).map((g) => g && g.jid))
  return (cfg.groups || []).filter((g) => g && /^[0-9A-Za-z._-]+@g\.us$/.test(g.jid) && !fontes.has(g.jid))
}

function origemPronta(cfg) {
  const ads = cfg.ads || {}
  if (ads.source === 'pool' || ads.source === 'misto') return true
  return !!(cfg.shopee && cfg.shopee.appId && cfg.shopee.secret)
}

function patchAds(deps, userId, patch) {
  const configs = deps.readJson(deps.CONFIGS, {})
  const cur = configs[userId]
  if (!cur) return
  cur.ads = Object.assign({}, cur.ads, patch)
  configs[userId] = cur
  deps.writeJson(deps.CONFIGS, configs)
}

function registrarEnvio(deps, userId) {
  const configs = deps.readJson(deps.CONFIGS, {})
  const cur = configs[userId]
  if (!cur) return
  const dia = diaBrasilia()
  const prev = cur.ads && cur.ads.sentDay === dia ? Number(cur.ads.sentToday) || 0 : 0
  patchAds(deps, userId, {
    lastSentAt: new Date().toISOString(),
    sentDay: dia,
    sentToday: prev + 1,
    nextTryAt: ''
  })
}

function adiar(deps, userId, ms) {
  patchAds(deps, userId, { nextTryAt: new Date(Date.now() + ms).toISOString() })
}

const dormirReal = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Uma execucao: sorteia N (produtos por execucao) e publica N vezes seguidas. Cada volta
 * le a configuracao de novo, entao o limite do dia e sempre o valor atual do arquivo.
 * deps.random e deps.dormir existem so para teste.
 * Devolve { enviados, parou } — parou: concluido | limite | sem-oferta | whatsapp | erro | nada | sem-conta
 */
async function rodar(deps, userId) {
  const random = deps.random || Math.random
  const dormir = deps.dormir || dormirReal
  const lerCfg = () => deps.readJson(deps.CONFIGS, {})[userId] || null

  let cfg = lerCfg()
  if (!cfg) return { enviados: 0, parou: 'sem-conta' }
  const faixaN = produtosPorExecucao(cfg.ads)
  const alvo = sortear(faixaN.min, faixaN.max, random)
  const espera = INTERVAL_MS[(cfg.ads || {}).interval] || INTERVAL_MS['2h']

  let enviados = 0
  let parou = 'concluido'
  for (let i = 0; i < alvo; i++) {
    cfg = lerCfg()
    if (!cfg) { parou = 'sem-conta'; break }
    const ads = cfg.ads || {}
    if (enviadosHoje(ads) >= limiteDiario(ads)) { parou = 'limite'; break }
    if (!sessions.publicState(userId).connected) { parou = 'whatsapp'; break }
    try {
      const out = await publicador.publicar({
        userId,
        cfg,
        groups: destinosDe(cfg),
        dataDir: deps.DATA,
        logs: deps.logs,
        sessions
      })
      if (out.enviados > 0) {
        registrarEnvio(deps, userId)
        enviados++
      } else if (out.semOferta) {
        // Sem oferta do nicho: nao martela a API a cada minuto
        parou = 'sem-oferta'
        if (!enviados) adiar(deps, userId, Math.min(espera, 15 * 60 * 1000))
        break
      } else {
        parou = 'nada'
        if (!enviados) adiar(deps, userId, 60 * 1000)
        break
      }
    } catch (e) {
      const wa = e.code === 'WA'
      parou = wa ? 'whatsapp' : 'erro'
      if (deps.logs) {
        deps.logs.append(deps.DATA, userId, {
          source: wa ? 'whatsapp' : 'shopee',
          level: 'error',
          ok: false,
          message: wa ? ('WhatsApp caiu. Anuncio adiado. ' + (e.message || '')) : (e.message || 'Falha na API')
        })
      }
      adiar(deps, userId, wa ? 60 * 1000 : 2 * 60 * 1000)
      break
    }
    if (i < alvo - 1) {
      // Se o proximo produto ja nao cabe no limite do dia, nem espera a pausa
      const depois = (lerCfg() || {}).ads || {}
      if (enviadosHoje(depois) >= limiteDiario(depois)) { parou = 'limite'; break }
      await dormir(sortear(PAUSA_ENTRE_PRODUTOS_MS[0], PAUSA_ENTRE_PRODUTOS_MS[1], random))
    }
  }

  // Intervalo aleatorio: sorteia a proxima execucao (erro/WhatsApp ja deixaram o proprio adiamento)
  const final = lerCfg()
  if (enviados > 0 && final && modoAleatorio(final.ads) && parou !== 'erro' && parou !== 'whatsapp') {
    const f = intervaloAleatorio(final.ads)
    patchAds(deps, userId, { nextTryAt: new Date(Date.now() + sortear(f.min, f.max, random) * 60000).toISOString() })
  }
  return { enviados, parou }
}

// Execucao agendada: so roda se TODAS as condicoes valerem agora (devolve null se nao for a hora)
async function um(deps, userId, cfg) {
  const ads = cfg.ads || {}
  if (!ads.enabled) return null
  if (!licencaAtiva(cfg)) return null
  if (!origemPronta(cfg)) return null
  if (!destinosDe(cfg).length) return null
  const agoraMs = Date.now()
  const next = ads.nextTryAt ? new Date(ads.nextTryAt).getTime() : 0
  if (next && agoraMs < next) return null
  if (!modoAleatorio(ads)) {
    const espera = INTERVAL_MS[ads.interval] || INTERVAL_MS['2h']
    const last = ads.lastSentAt ? new Date(ads.lastSentAt).getTime() : 0
    if (last && agoraMs - last < espera) return null
  }
  if (!diaPermitido(ads.days)) return null
  if (!naJanela(ads.window && ads.window.from, ads.window && ads.window.to, minutosBrasilia())) return null
  if (enviadosHoje(ads) >= limiteDiario(ads)) return null
  if (!sessions.publicState(userId).connected) return null
  return rodar(deps, userId)
}

const MENSAGENS = {
  concluido: (n) => 'Enviei ' + n + ' produto(s).',
  limite: (n) => (n ? 'Enviei ' + n + ' produto(s) e o limite do dia foi atingido.' : 'O limite de envios de hoje ja foi atingido.'),
  'sem-oferta': (n) => (n ? 'Enviei ' + n + ' produto(s); acabaram as ofertas do nicho.' : 'Nenhuma oferta relevante agora. Nada foi enviado.'),
  whatsapp: (n) => 'O WhatsApp caiu durante o envio.' + (n ? ' Enviei ' + n + ' produto(s) antes.' : ''),
  erro: (n) => 'Nao consegui enviar. Veja os Logs.' + (n ? ' Enviei ' + n + ' produto(s) antes.' : ''),
  nada: () => 'Nada foi enviado. Veja os Logs.',
  'sem-conta': () => 'Conta nao encontrada.'
}

/**
 * Execucao imediata a pedido do cliente. Devolve { ok, status, codigo?, enviados?, parou?, mensagem }.
 * status 4xx = nao executou (nada foi enviado); 200 = executou (ok=false se nao saiu nenhum produto).
 * opcoes: { liberar() -> bool (limite de uso), random, dormir } — random/dormir so para teste.
 */
async function executarAgora(deps, userId, opcoes = {}) {
  const cfg = deps.readJson(deps.CONFIGS, {})[userId]
  const recusa = (status, codigo, mensagem) => ({ ok: false, status, codigo, mensagem })
  if (!cfg) return recusa(404, 'sem-conta', 'Conta nao encontrada')
  if (!licencaAtiva(cfg)) return recusa(403, 'licenca', 'Licenca expirada ou inativa.')
  if (!origemPronta(cfg)) return recusa(400, 'sem-chave', 'Salve App ID e Secret da Shopee (ou use o banco de ofertas).')
  if (!destinosDe(cfg).length) return recusa(400, 'sem-grupos', 'Escolha pelo menos um grupo de destino em Grupos.')
  if (!sessions.publicState(userId).connected) return recusa(400, 'whatsapp', 'O WhatsApp nao esta conectado.')
  const ads = cfg.ads || {}
  if (enviadosHoje(ads) >= limiteDiario(ads)) {
    return { ok: false, status: 200, codigo: 'limite', enviados: 0, parou: 'limite', mensagem: MENSAGENS.limite(0) }
  }
  if (emExecucao.has(userId)) return recusa(409, 'ocupado', 'Ja existe uma execucao em andamento. Aguarde terminar.')
  if (typeof opcoes.liberar === 'function' && !opcoes.liberar()) return recusa(429, 'espere', 'Espere alguns segundos antes de executar de novo.')

  emExecucao.add(userId)
  try {
    const r = await rodar(Object.assign({}, deps, { random: opcoes.random || deps.random, dormir: opcoes.dormir || deps.dormir }), userId)
    const mensagem = (MENSAGENS[r.parou] || MENSAGENS.concluido)(r.enviados)
    return { ok: r.enviados > 0, status: 200, enviados: r.enviados, parou: r.parou, mensagem }
  } finally {
    emExecucao.delete(userId)
  }
}

function start(deps) {
  async function tick() {
    const configs = deps.readJson(deps.CONFIGS, {})
    for (const userId of Object.keys(configs)) {
      // Cada cliente por conta propria: a pausa entre produtos de um nao trava os outros
      if (emExecucao.has(userId)) continue
      emExecucao.add(userId)
      um(deps, userId, configs[userId])
        .catch((e) => console.error('[ADS]', e.message))
        .finally(() => emExecucao.delete(userId))
    }
  }
  setInterval(tick, 20000)
  setTimeout(tick, 15000)
  // Mensagens agendadas (fase 2.2): motor proprio, mesmo relogio de 20 s
  require('./afiliados/agendadasExec').iniciar(Object.assign({ sessions }, deps))
}

module.exports = {
  start,
  registrarEnvio,
  INTERVAL_MS,
  diaPermitido,
  diaSemanaBrasilia,
  naJanela,
  // disparo v2
  executarUsuario: um,
  executarAgora,
  sortear,
  produtosPorExecucao,
  intervaloAleatorio,
  PRODUTOS_MAX,
  INTERVALO_ALEATORIO_MAX,
  PAUSA_ENTRE_PRODUTOS_MS
}
