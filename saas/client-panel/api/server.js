/**
 * Namy Client Panel API
 * npm install && npm start
 * Cliente abre: http://localhost:3847
 */
const path = require('path')
const fs = require('fs')
const express = require('express')
const cors = require('cors')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { v4: uuidv4 } = require('uuid')

function loadEnvFile() {
  const file = path.join(__dirname, '..', '.env')
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 1) continue
    const key = t.slice(0, i).trim()
    if (!/^[A-Z0-9_]+$/.test(key)) continue
    let val = t.slice(i + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}
loadEnvFile()
const PORT = process.env.PORT || 3847
const JWT_SECRET = process.env.JWT_SECRET || 'namy-client-dev-secret-change-me'
const DATA = path.join(__dirname, 'data')
const USERS = path.join(DATA, 'users.json')
const CONFIGS = path.join(DATA, 'configs.json')

function ensure() {
  if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true })
  if (!fs.existsSync(USERS)) fs.writeFileSync(USERS, '[]')
  if (!fs.existsSync(CONFIGS)) fs.writeFileSync(CONFIGS, '{}')
}
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback }
}
function writeJson(file, data) {
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, file)
}
ensure()

function defaultConfig(userId, email) {
  const exp = new Date()
  exp.setDate(exp.getDate() + 30)
  return {
    tenantId: userId,
    email,
    botName: 'Namy',
    prefix: '!',
    phone: '',
    status: 'offline',
    affiliate: { link: '', template: 'Meu link: {link}' },
    shopee: { appId: '', secret: '', keyword: '' },
    ads: {
      enabled: false,
      interval: '2h',
      dailyLimit: 5,
      window: { from: '09:00', to: '22:00' }
    },
    ai: { mode: 'auto', usePlatformKeys: true },
    license: { plan: 'trial', active: true, expiresAt: exp.toISOString() },
    botToken: uuidv4().replace(/-/g, ''),
    updatedAt: new Date().toISOString()
  }
}

function publicConfig(cfg) {
  const c = JSON.parse(JSON.stringify(cfg))
  if (c.shopee) c.shopee.secret = c.shopee.secret ? '********' : ''
  if (c.license) delete c.license.lastPaymentId
  delete c.botToken
  return c
}

function horaOk(v) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || ''))
}

const INTERVALOS = new Set(['5m', '15m', '30m', '1h', '2h', '3h', '6h'])

const app = express()
app.use(cors())
app.use(express.json())
app.use(express.static(path.join(__dirname, '..', 'panel')))

function auth(req, res, next) {
  const h = req.headers.authorization || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Faca login de novo' })
  try {
    req.user = jwt.verify(token, JWT_SECRET)
    next()
  } catch {
    return res.status(401).json({ error: 'Sessao expirada' })
  }
}

app.post('/auth/register', async (req, res) => {
  const { email, password } = req.body || {}
  const mail = String(email || '').trim().toLowerCase().slice(0, 120)
  const pass = String(password || '')
  if (!mail.includes('@') || pass.length < 4 || pass.length > 72) {
    return res.status(400).json({ error: 'Email e senha (4 a 72) obrigatorios' })
  }
  const users = readJson(USERS, [])
  if (users.find((u) => u.email === mail)) {
    return res.status(409).json({ error: 'Email ja cadastrado' })
  }
  const id = uuidv4()
  users.push({
    id,
    email: mail,
    passwordHash: await bcrypt.hash(pass, 8),
    createdAt: new Date().toISOString()
  })
  writeJson(USERS, users)
  const configs = readJson(CONFIGS, {})
  configs[id] = defaultConfig(id, mail)
  writeJson(CONFIGS, configs)
  const token = jwt.sign({ id, email }, JWT_SECRET, { expiresIn: '30d' })
  res.json({ token, user: { id, email }, config: publicConfig(configs[id]) })
})

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {}
  const users = readJson(USERS, [])
  const user = users.find((u) => u.email === String(email || '').trim().toLowerCase())
  if (!user || !(await bcrypt.compare(password || '', user.passwordHash))) {
    return res.status(401).json({ error: 'Email ou senha invalidos' })
  }
  const configs = readJson(CONFIGS, {})
  if (!configs[user.id]) {
    configs[user.id] = defaultConfig(user.id, user.email)
    writeJson(CONFIGS, configs)
  }
  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' })
  res.json({ token, user: { id: user.id, email: user.email }, config: publicConfig(configs[user.id]) })
})

app.get('/me', auth, (req, res) => {
  const configs = readJson(CONFIGS, {})
  const cfg = configs[req.user.id]
  if (!cfg) return res.status(404).json({ error: 'Conta nao encontrada' })
  res.json({ user: req.user, config: publicConfig(cfg) })
})

app.get('/config', auth, (req, res) => {
  const configs = readJson(CONFIGS, {})
  const cfg = configs[req.user.id]
  if (!cfg) return res.status(404).json({ error: 'Config nao encontrada' })
  res.json(publicConfig(cfg))
})

app.put('/config', auth, (req, res) => {
  const configs = readJson(CONFIGS, {})
  const cur = configs[req.user.id]
  if (!cur) return res.status(404).json({ error: 'Config nao encontrada' })
  const body = req.body || {}

  if (body.botName != null) cur.botName = String(body.botName).slice(0, 40)
  if (body.phone != null) cur.phone = String(body.phone).replace(/\D/g, '')
  if (body.affiliate) {
    if (body.affiliate.link != null) cur.affiliate.link = String(body.affiliate.link).trim().slice(0, 500)
    if (body.affiliate.template != null) cur.affiliate.template = String(body.affiliate.template).slice(0, 500)
  }
  if (body.shopee) {
    cur.shopee = cur.shopee || { appId: '', secret: '', keyword: '' }
    if (body.shopee.appId != null) cur.shopee.appId = String(body.shopee.appId).trim()
    if (body.shopee.secret != null && body.shopee.secret !== '********' && body.shopee.secret !== '') {
      cur.shopee.secret = String(body.shopee.secret).trim()
    }
    if (body.shopee.keyword != null) cur.shopee.keyword = String(body.shopee.keyword).trim()
  }
  if (body.ads) {
    cur.ads = cur.ads || {}
    if (body.ads.enabled != null) cur.ads.enabled = !!body.ads.enabled
    if (body.ads.interval != null && INTERVALOS.has(String(body.ads.interval))) {
      cur.ads.interval = String(body.ads.interval)
    }
    if (body.ads.dailyLimit != null) {
      const n = Number(body.ads.dailyLimit)
      cur.ads.dailyLimit = Number.isFinite(n) ? Math.min(200, Math.max(1, Math.round(n))) : cur.ads.dailyLimit
    }
    if (body.ads.window) {
      const from = horaOk(body.ads.window.from) ? body.ads.window.from : (cur.ads.window && cur.ads.window.from) || '09:00'
      const to = horaOk(body.ads.window.to) ? body.ads.window.to : (cur.ads.window && cur.ads.window.to) || '22:00'
      cur.ads.window = { from, to }
    }
  }
  if (body.ai && body.ai.mode) {
    cur.ai = cur.ai || {}
    cur.ai.mode = body.ai.mode
  }
  cur.updatedAt = new Date().toISOString()
  configs[req.user.id] = cur
  writeJson(CONFIGS, configs)
  res.json(publicConfig(cur))
})

app.get('/subscription', auth, (req, res) => {
  const configs = readJson(CONFIGS, {})
  const cfg = configs[req.user.id]
  if (!cfg) return res.status(404).json({ error: 'Nao encontrado' })
  const exp = new Date(cfg.license.expiresAt)
  const active = cfg.license.active && exp > new Date()
  res.json({
    ...cfg.license,
    active,
    daysLeft: Math.max(0, Math.ceil((exp - Date.now()) / 86400000))
  })
})

const logs = require('./logs')
const billing = require('./billing')

function ativarLicenca(userId, info) {
  const configs = readJson(CONFIGS, {})
  const cur = configs[userId]
  if (!cur || !info || !info.approved) return null
  cur.license = cur.license || {}
  if (cur.license.lastPaymentId && cur.license.lastPaymentId === info.paymentId) {
    return cur
  }
  const now = Date.now()
  const atual = new Date(cur.license.expiresAt || 0).getTime()
  const base = cur.license.active && atual > now ? atual : now
  const exp = new Date(base + info.days * 86400000)
  cur.license.plan = info.planId
  cur.license.active = true
  cur.license.expiresAt = exp.toISOString()
  cur.license.lastPaymentId = info.paymentId
  cur.license.paidAt = new Date().toISOString()
  cur.updatedAt = new Date().toISOString()
  configs[userId] = cur
  writeJson(CONFIGS, configs)
  logs.append(DATA, userId, {
    source: 'pagamento',
    level: 'info',
    ok: true,
    message: 'Pagamento aprovado. Plano ' + info.planId + ' ate ' + exp.toLocaleDateString('pt-BR') + '.'
  })
  return cur
}

app.get('/billing/plans', auth, (req, res) => {
  const configs = readJson(CONFIGS, {})
  const cfg = configs[req.user.id]
  res.json({
    configured: !!process.env.MP_ACCESS_TOKEN,
    plans: billing.catalog(),
    license: cfg ? publicConfig(cfg).license : null
  })
})

app.post('/billing/checkout', auth, async (req, res) => {
  try {
    const planId = String((req.body && req.body.plan) || '')
    const out = await billing.createCheckout({
      userId: req.user.id,
      email: req.user.email,
      planId,
      baseUrl: billingPublicBase(req)
    })
    logs.append(DATA, req.user.id, {
      source: 'pagamento',
      level: 'info',
      message: 'Checkout aberto: ' + planId
    })
    res.json(out)
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Falha no checkout' })
  }
})

app.post('/billing/sync', auth, async (req, res) => {
  try {
    const paymentId = String((req.body && req.body.paymentId) || '').replace(/\D/g, '')
    if (!paymentId) return res.status(400).json({ error: 'paymentId obrigatorio' })
    const info = await billing.inspectPayment({}, { type: 'payment', data: { id: paymentId } })
    if (info.ignored || info.userId !== req.user.id) {
      return res.status(400).json({ error: 'Pagamento nao encontrado para esta conta.' })
    }
    if (!info.approved) return res.json({ ok: true, status: info.status, license: null })
    const cur = ativarLicenca(req.user.id, info)
    res.json({ ok: true, status: 'approved', config: cur ? publicConfig(cur) : null })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Falha ao confirmar pagamento' })
  }
})

app.post('/webhooks/mercadopago', async (req, res) => {
  res.status(200).json({ ok: true })
  try {
    const info = await billing.inspectPayment(req.query, req.body)
    if (!info.ignored && info.approved) ativarLicenca(info.userId, info)
  } catch (e) {
    console.error('[MP] webhook', e.message)
  }
})

app.get('/webhooks/mercadopago', async (req, res) => {
  res.status(200).json({ ok: true })
  try {
    const info = await billing.inspectPayment(req.query, req.body)
    if (!info.ignored && info.approved) ativarLicenca(info.userId, info)
  } catch (e) {
    console.error('[MP] webhook', e.message)
  }
})

function billingPublicBase(req) {
  const fromEnv = String(process.env.PUBLIC_URL || '').trim().replace(/\/$/, '')
  if (fromEnv) return fromEnv
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http'
  return proto + '://' + req.get('host')
}

app.get('/logs', auth, (req, res) => {
  res.json({ logs: logs.read(DATA, req.user.id) })
})

const wa = require('./waRoutes')(app, { auth, readJson, writeJson, CONFIGS, DATA, logs })
require('./scheduler').start({ readJson, writeJson, CONFIGS, DATA, logs })

app.get('/bot/config', (req, res) => {
  const token = req.headers['x-bot-token'] || req.query.token
  if (!token) return res.status(401).json({ error: 'x-bot-token obrigatorio' })
  const configs = readJson(CONFIGS, {})
  const cfg = Object.values(configs).find((c) => c.botToken === token)
  if (!cfg) return res.status(404).json({ error: 'Bot nao encontrado' })
  const exp = new Date(cfg.license.expiresAt)
  if (!cfg.license.active || exp < new Date()) {
    return res.status(403).json({ error: 'Licenca expirada', license: cfg.license })
  }
  res.json({
    tenantId: cfg.tenantId,
    botName: cfg.botName,
    phone: cfg.phone,
    affiliate: cfg.affiliate,
    shopee: cfg.shopee,
    ads: cfg.ads,
    ai: cfg.ai,
    license: cfg.license
  })
})

app.post('/bot/status', (req, res) => {
  const token = req.headers['x-bot-token']
  if (!token) return res.status(401).json({ error: 'x-bot-token obrigatorio' })
  const configs = readJson(CONFIGS, {})
  const id = Object.keys(configs).find((k) => configs[k].botToken === token)
  if (!id) return res.status(404).json({ error: 'Bot nao encontrado' })
  configs[id].status = (req.body && req.body.status) || 'offline'
  configs[id].updatedAt = new Date().toISOString()
  writeJson(CONFIGS, configs)
  res.json({ ok: true, status: configs[id].status })
})

app.get('/health', (_, res) => res.json({ ok: true, product: 'namy-client-panel' }))

app.listen(PORT, () => {
  console.log('')
  console.log('Namy Client Panel')
  console.log('  Cliente abre: http://localhost:' + PORT)
  console.log('  WhatsApp: sessao real no servidor')
  console.log('')
  if (process.env.RESTORE_SESSIONS === '1') {
    require('./sessions').restoreRegistered(wa.gravarStatus)
  }
})
