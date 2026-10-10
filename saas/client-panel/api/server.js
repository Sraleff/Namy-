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
  fs.writeFileSync(file, JSON.stringify(data, null, 2))
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
  if (c.shopee && c.shopee.secret) {
    c.shopee.secret = c.shopee.secret ? '********' : ''
  }
  return c
}

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
  if (!email || !password || String(password).length < 4) {
    return res.status(400).json({ error: 'Email e senha (min. 4) obrigatorios' })
  }
  const users = readJson(USERS, [])
  if (users.find((u) => u.email === String(email).toLowerCase())) {
    return res.status(409).json({ error: 'Email ja cadastrado' })
  }
  const id = uuidv4()
  users.push({
    id,
    email: String(email).toLowerCase(),
    passwordHash: await bcrypt.hash(password, 8),
    createdAt: new Date().toISOString()
  })
  writeJson(USERS, users)
  const configs = readJson(CONFIGS, {})
  configs[id] = defaultConfig(id, email)
  writeJson(CONFIGS, configs)
  const token = jwt.sign({ id, email }, JWT_SECRET, { expiresIn: '30d' })
  res.json({ token, user: { id, email }, config: publicConfig(configs[id]) })
})

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {}
  const users = readJson(USERS, [])
  const user = users.find((u) => u.email === String(email || '').toLowerCase())
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
    if (body.affiliate.link != null) cur.affiliate.link = String(body.affiliate.link).trim()
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
    cur.ads = Object.assign({}, cur.ads || {}, body.ads)
    if (body.ads.window) cur.ads.window = body.ads.window
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

const wa = require('./waRoutes')(app, { auth, readJson, writeJson, CONFIGS })

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
