/**
 * Publica ofertas da API Shopee de cada cliente no intervalo salvo.
 * Se o WhatsApp caiu, nao trata como erro da Shopee: so adia.
 */
const sessions = require('./sessions')
const { publicarOferta } = require('./divulgar')

const INTERVAL_MS = {
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '2h': 2 * 60 * 60 * 1000,
  '3h': 3 * 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000
}

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

function naJanela(from, to, agora) {
  if (!from || !to) return true
  if (from <= to) return agora >= from && agora <= to
  return agora >= from || agora <= to
}

function licencaAtiva(cfg) {
  if (!cfg || !cfg.license) return false
  return cfg.license.active && new Date(cfg.license.expiresAt) > new Date()
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

async function um(deps, userId, cfg) {
  const ads = cfg.ads || {}
  if (!ads.enabled) return
  if (!licencaAtiva(cfg)) return
  if (!cfg.shopee || !cfg.shopee.appId || !cfg.shopee.secret) return
  const groups = (cfg.groups || []).filter((g) => g && /^[0-9A-Za-z._-]+@g\.us$/.test(g.jid))
  if (!groups.length) return
  const agoraMs = Date.now()
  const next = ads.nextTryAt ? new Date(ads.nextTryAt).getTime() : 0
  if (next && agoraMs < next) return
  const espera = INTERVAL_MS[ads.interval] || INTERVAL_MS['2h']
  const last = ads.lastSentAt ? new Date(ads.lastSentAt).getTime() : 0
  if (last && agoraMs - last < espera) return
  if (!naJanela(ads.window && ads.window.from, ads.window && ads.window.to, minutosBrasilia())) return
  const dia = diaBrasilia()
  const hoje = ads.sentDay === dia ? Number(ads.sentToday) || 0 : 0
  const limite = Math.min(200, Math.max(1, Number(ads.dailyLimit) || 5))
  if (hoje >= limite) return
  if (!sessions.publicState(userId).connected) return
  try {
    const out = await publicarOferta({
      userId,
      cfg,
      groups,
      dataDir: deps.DATA,
      logs: deps.logs,
      sessions
    })
    if (out.enviados > 0) registrarEnvio(deps, userId)
    else adiar(deps, userId, 60 * 1000)
  } catch (e) {
    const wa = e.code === 'WA'
    if (deps.logs) {
      deps.logs.append(deps.DATA, userId, {
        source: wa ? 'whatsapp' : 'shopee',
        level: 'error',
        ok: false,
        message: wa ? ('WhatsApp caiu. Anuncio adiado. ' + (e.message || '')) : (e.message || 'Falha na API')
      })
    }
    adiar(deps, userId, wa ? 60 * 1000 : 2 * 60 * 1000)
  }
}

function start(deps) {
  let ocupado = false
  async function tick() {
    if (ocupado) return
    ocupado = true
    try {
      const configs = deps.readJson(deps.CONFIGS, {})
      for (const userId of Object.keys(configs)) {
        try {
          await um(deps, userId, configs[userId])
        } catch (e) {
          console.error('[ADS]', e.message)
        }
      }
    } finally {
      ocupado = false
    }
  }
  setInterval(tick, 20000)
  setTimeout(tick, 15000)
}

module.exports = { start, registrarEnvio, INTERVAL_MS }
