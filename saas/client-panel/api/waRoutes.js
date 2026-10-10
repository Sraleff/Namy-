/**
 * Rotas reais de WhatsApp. Montadas pelo server.js.
 * Sessao isolada por req.user.id (JWT). Nunca aceita userId do body.
 */
const sessions = require('./sessions')

function licencaAtiva(cfg) {
  if (!cfg || !cfg.license) return false
  const exp = new Date(cfg.license.expiresAt)
  return cfg.license.active && exp > new Date()
}

module.exports = function mount(app, { auth, readJson, writeJson, CONFIGS }) {
  function gravarStatus(userId, status) {
    const configs = readJson(CONFIGS, {})
    if (!configs[userId]) return
    const map = {
      connected: 'online',
      waiting_code: 'pairing',
      connecting: 'pairing',
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
