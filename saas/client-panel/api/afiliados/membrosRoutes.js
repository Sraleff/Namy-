/**
 * Rotas do monitor de membros (fase 2.4). userId so do JWT.
 *  GET  /membros?dias=7|30|90     resumo por grupo e por dia (so contagens)
 *  POST /membros/atualizar        guarda agora o tamanho dos grupos (3 por minuto)
 *  POST /membros/config           { minSaidas (1..200), pct (1..50) } limites do alerta
 */
const membros = require('./membros')
const { criarLimitador } = require('./linkRoutes')

function mount(app, deps, opcoes = {}) {
  const { auth, readJson, writeJson, CONFIGS, DATA, sessions } = deps
  const podeAtualizar = criarLimitador(opcoes.atualizacoesPorMin || 3, 60 * 1000)
  const podeLer = criarLimitador(opcoes.leiturasPorMin || 30, 60 * 1000)
  const falha = (res, e, padrao) => res.status(e.status || 500).json({ error: e.message || padrao })
  const base = { DATA, readJson, CONFIGS, sessions }

  function conta(req, res) {
    const cfg = readJson(CONFIGS, {})[req.user.id]
    if (!cfg) { res.status(404).json({ error: 'Conta não encontrada' }); return null }
    return cfg
  }

  app.get('/membros', auth, async (req, res) => {
    try {
      const cfg = conta(req, res)
      if (!cfg) return
      if (!podeLer(req.user.id)) return res.status(429).json({ error: 'Muitas consultas seguidas. Espere um minuto.' })
      const q = req.query || {}
      const dias = q.dias == null || q.dias === '' ? 30 : Number(q.dias)
      res.json(Object.assign(await membros.resumo(base, req.user.id, cfg, dias), { whatsapp: !!(sessions && sessions.publicState(req.user.id).connected) }))
    } catch (e) { falha(res, e, 'Falha ao ler os membros') }
  })

  app.post('/membros/atualizar', auth, async (req, res) => {
    try {
      const cfg = conta(req, res)
      if (!cfg) return
      if (!sessions || !sessions.publicState(req.user.id).connected) return res.status(400).json({ error: 'O WhatsApp não está conectado.' })
      if (!podeAtualizar(req.user.id)) return res.status(429).json({ error: 'Espere um minuto antes de atualizar de novo.' })
      await membros.snapshot(base, req.user.id, cfg)
      res.json(Object.assign(await membros.resumo(base, req.user.id, cfg, 30), { whatsapp: true }))
    } catch (e) { falha(res, Object.assign(e, { status: e.status || 502 }), 'Não consegui atualizar o tamanho dos grupos') }
  })

  app.post('/membros/config', auth, (req, res) => {
    try {
      const cfg = conta(req, res)
      if (!cfg) return
      const b = req.body || {}
      const ok = (v, min, max) => Number.isInteger(v) && v >= min && v <= max
      if (!ok(b.minSaidas, 1, 200)) return res.status(400).json({ error: 'minSaidas deve ser um inteiro de 1 a 200.' })
      if (!ok(b.pct, 1, 50)) return res.status(400).json({ error: 'pct deve ser um inteiro de 1 a 50.' })
      const todos = readJson(CONFIGS, {})
      todos[req.user.id].membros = { minSaidas: b.minSaidas, pct: b.pct }
      todos[req.user.id].updatedAt = new Date().toISOString()
      writeJson(CONFIGS, todos)
      res.json({ ok: true, limites: membros.limites(todos[req.user.id].membros) })
    } catch (e) { falha(res, e, 'Falha ao salvar') }
  })
}

module.exports = { mount }
