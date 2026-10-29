/**
 * GET /diagnostico  ("por que nao enviou?") userId so do JWT. Somente leitura.
 */
const diagnostico = require('./diagnostico')
const { criarLimitador } = require('./linkRoutes')

function mount(app, deps, opcoes = {}) {
  const { auth, readJson, CONFIGS, DATA, sessions } = deps
  const podeLer = criarLimitador(opcoes.leiturasPorMin || 30, 60 * 1000)
  app.get('/diagnostico', auth, (req, res) => {
    try {
      const cfg = readJson(CONFIGS, {})[req.user.id]
      if (!cfg) return res.status(404).json({ error: 'Conta não encontrada' })
      if (!podeLer(req.user.id)) return res.status(429).json({ error: 'Muitas consultas seguidas. Espere um minuto.' })
      res.json(diagnostico.diagnosticar({ userId: req.user.id, cfg, dataDir: DATA, sessions }))
    } catch (e) { res.status(e.status || 500).json({ error: e.message || 'Falha no diagnóstico' }) }
  })
}

module.exports = { mount }
