/**
 * Rotas reais de WhatsApp. Montadas pelo server.js.
 * Sessao isolada por req.user.id (JWT). Nunca aceita userId do body.
 */
const sessions = require('./sessions')
const ofertas = require('./ofertas')
const { publicarOferta } = require('./divulgar')
const { registrarEnvio } = require('./scheduler')

function jidGrupo(jid) {
  return /^[0-9A-Za-z._-]+@g\.us$/.test(String(jid || ''))
}

const ultimoTeste = new Map()

function podeTestar(userId) {
  const agora = Date.now()
  const prev = ultimoTeste.get(userId) || 0
  if (agora - prev < 20000) return false
  ultimoTeste.set(userId, agora)
  return true
}

function licencaAtiva(cfg) {
  if (!cfg || !cfg.license) return false
  const exp = new Date(cfg.license.expiresAt)
  return cfg.license.active && exp > new Date()
}

module.exports = function mount(app, { auth, readJson, writeJson, CONFIGS, DATA, logs }) {
  function gravarStatus(userId, status) {
    const configs = readJson(CONFIGS, {})
    if (!configs[userId]) return
    const map = {
      connected: 'online',
      waiting_code: 'pairing',
      connecting: 'pairing',
      reconnecting: 'pairing',
      disconnected: 'offline',
      error: 'offline'
    }
    configs[userId].status = map[status] || 'offline'
    configs[userId].updatedAt = new Date().toISOString()
    writeJson(CONFIGS, configs)
  }

  app.get('/whatsapp/status', auth, (req, res) => {
    res.json(sessions.publicState(req.user.id))
  })

  app.post('/whatsapp/connect', auth, async (req, res) => {
    const phone = String((req.body && req.body.phone) || '').replace(/\D/g, '')
    if (phone.length < 10) return res.status(400).json({ error: 'Numero invalido. Use DDI+DDD+numero.' })
    const configs = readJson(CONFIGS, {})
    const cur = configs[req.user.id]
    if (!cur) return res.status(404).json({ error: 'Conta nao encontrada' })
    if (!licencaAtiva(cur)) return res.status(403).json({ error: 'Licenca expirada ou inativa.' })
    cur.phone = phone
    cur.updatedAt = new Date().toISOString()
    configs[req.user.id] = cur
    writeJson(CONFIGS, configs)
    try {
      const st = await sessions.start(req.user.id, phone, gravarStatus)
      res.json(Object.assign({ ok: true }, st))
    } catch (e) {
      console.error('[SESSAO] connect', e.message)
      res.status(500).json({ error: 'Nao consegui abrir o WhatsApp agora. Tente de novo.' })
    }
  })

  app.post('/whatsapp/disconnect', auth, async (req, res) => {
    const logout = !!(req.body && req.body.logout)
    const st = await sessions.stop(req.user.id, logout)
    gravarStatus(req.user.id, 'disconnected')
    res.json(Object.assign({ ok: true }, st))
  })

  app.post('/whatsapp/reconnect', auth, async (req, res) => {
    const configs = readJson(CONFIGS, {})
    const cur = configs[req.user.id]
    if (!cur) return res.status(404).json({ error: 'Conta nao encontrada' })
    if (!licencaAtiva(cur)) return res.status(403).json({ error: 'Licenca expirada ou inativa.' })
    try {
      await sessions.stop(req.user.id, false)
      const st = await sessions.start(req.user.id, cur.phone || '', gravarStatus)
      res.json(Object.assign({ ok: true }, st))
    } catch (e) {
      res.status(500).json({ error: e.message || 'Falha ao reconectar' })
    }
  })

  // --- Grupos e testes (cliente opera pelo painel) ---

  app.get('/whatsapp/groups', auth, async (req, res) => {
    try {
      const list = await sessions.listGroups(req.user.id)
      const configs = readJson(CONFIGS, {})
      const selected = (configs[req.user.id] && configs[req.user.id].groups) || []
      res.json({ ok: true, groups: list, selected })
    } catch (e) {
      res.status(400).json({ error: e.message || 'Falha ao listar grupos' })
    }
  })

  app.post('/whatsapp/groups', auth, (req, res) => {
    const groups = Array.isArray(req.body && req.body.groups) ? req.body.groups : []
    const configs = readJson(CONFIGS, {})
    const cur = configs[req.user.id]
    if (!cur) return res.status(404).json({ error: 'Conta nao encontrada' })
    cur.groups = groups.map((g) => ({
      jid: String(g.jid || '').slice(0, 80),
      name: String(g.name || g.jid || '').replace(/[<>]/g, '').slice(0, 120)
    })).filter((g) => jidGrupo(g.jid))
    cur.updatedAt = new Date().toISOString()
    configs[req.user.id] = cur
    writeJson(CONFIGS, configs)
    res.json({ ok: true, groups: cur.groups })
  })

  app.post('/ads/test', auth, async (req, res) => {
    const configs = readJson(CONFIGS, {})
    const cur = configs[req.user.id]
    if (!cur) return res.status(404).json({ error: 'Conta nao encontrada' })
    if (!licencaAtiva(cur)) return res.status(403).json({ error: 'Licenca expirada ou inativa.' })
    const jid = String((req.body && req.body.jid) || '')
    if (!jidGrupo(jid)) return res.status(400).json({ error: 'Escolha um grupo valido para o teste.' })
    if (!sessions.publicState(req.user.id).connected) {
      return res.status(400).json({ error: 'WhatsApp nao esta conectado.' })
    }
    if (!podeTestar(req.user.id)) return res.status(429).json({ error: 'Espere 20 segundos entre testes.' })
    const nome = ((cur.groups || []).find((g) => g.jid === jid) || {}).name || jid
    try {
      const out = await publicarOferta({
        userId: req.user.id,
        cfg: cur,
        groups: [{ jid, name: nome }],
        dataDir: DATA,
        logs,
        sessions
      })
      if (out.enviados) registrarEnvio({ readJson, writeJson, CONFIGS }, req.user.id)
      res.json(out)
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || 'Falha ao publicar oferta' })
    }
  })

  app.post('/bot/test', auth, async (req, res) => {
    const configs = readJson(CONFIGS, {})
    const cur = configs[req.user.id]
    if (!cur) return res.status(404).json({ error: 'Conta nao encontrada' })
    if (!licencaAtiva(cur)) return res.status(403).json({ error: 'Licenca expirada ou inativa.' })
    if (!sessions.publicState(req.user.id).connected) {
      return res.status(400).json({ error: 'WhatsApp nao esta conectado.' })
    }
    if (!podeTestar(req.user.id)) return res.status(429).json({ error: 'Espere 20 segundos entre testes.' })
    try {
      const out = await publicarOferta({
        userId: req.user.id,
        cfg: cur,
        dataDir: DATA,
        logs,
        sessions
      })
      if (out.enviados) registrarEnvio({ readJson, writeJson, CONFIGS }, req.user.id)
      res.json(Object.assign({ connected: true }, out))
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || 'Falha ao publicar oferta' })
    }
  })

  app.post('/shopee/test', auth, async (req, res) => {
    const configs = readJson(CONFIGS, {})
    const cur = configs[req.user.id]
    if (!cur) return res.status(404).json({ error: 'Conta nao encontrada' })
    if (!podeTestar(req.user.id)) return res.status(429).json({ error: 'Espere 20 segundos entre testes.' })
    let oferta
    try {
      oferta = await ofertas.preparar(DATA, req.user.id, cur.shopee)
    } catch (e) {
      return res.status(e.status || 400).json({ error: e.message || 'Falha na API Shopee' })
    }
    const groups = (Array.isArray(cur.groups) ? cur.groups : []).filter((g) => jidGrupo(g.jid))
    const conectado = sessions.publicState(req.user.id).connected
    if (!groups.length || !conectado) {
      const porque = !groups.length
        ? 'Salve um grupo na aba Anuncios para publicar.'
        : 'WhatsApp nao esta conectado.'
      return res.json({
        ok: true,
        message: 'Oferta da sua API: ' + oferta.nome + '. ' + porque,
        sample: oferta.nome,
        results: []
      })
    }
    try {
      const out = await publicarOferta({
        userId: req.user.id,
        cfg: cur,
        groups,
        dataDir: DATA,
        logs,
        sessions,
        oferta
      })
      if (out.enviados) registrarEnvio({ readJson, writeJson, CONFIGS }, req.user.id)
      res.json(out)
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || 'Falha ao publicar oferta' })
    }
  })

  app.post('/bot/pair', auth, async (req, res) => {
    const phone = String((req.body && req.body.phone) || '').replace(/\D/g, '')
    if (phone.length < 10) return res.status(400).json({ error: 'Numero invalido. Use DDI+DDD+numero.' })
    const configs = readJson(CONFIGS, {})
    const cur = configs[req.user.id]
    if (!cur) return res.status(404).json({ error: 'Conta nao encontrada' })
    if (!licencaAtiva(cur)) return res.status(403).json({ error: 'Licenca expirada ou inativa.' })
    cur.phone = phone
    configs[req.user.id] = cur
    writeJson(CONFIGS, configs)
    try {
      const st = await sessions.start(req.user.id, phone, gravarStatus)
      res.json({
        ok: true,
        code: st.pairingCode,
        status: st.status,
        message: 'Codigo real do WhatsApp. Se ainda nao apareceu, aguarde o status.'
      })
    } catch (e) {
      res.status(500).json({ error: e.message || 'Falha no pareamento' })
    }
  })

  return { gravarStatus, sessions }
}
