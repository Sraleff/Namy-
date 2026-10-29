/**
 * Rotas da Fila de Produtos (Fase 1.2). userId sai so do JWT (req.user.id).
 * Criar, pausar, remover e a previa continuam nas rotas do banco de ofertas
 * (/ofertas/banco*, /ofertas/previa); aqui ficam listar com status, editar e reenfileirar.
 */
const fila = require('./fila')

function mount(app, deps, opcoes = {}) {
  const { auth, readJson, CONFIGS, DATA } = deps

  function falha(res, e, padrao) {
    res.status(e.status || 500).json({ error: e.message || padrao })
  }

  function cfgDe(userId) {
    return readJson(CONFIGS, {})[userId] || {}
  }

  function idDe(body) {
    const id = (body || {}).id
    return typeof id === 'string' ? id.slice(0, 80) : ''
  }

  app.get('/produtos', auth, (req, res) => {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : ''
      if (status && !fila.STATUS.includes(status)) return res.status(400).json({ error: 'Status inválido.' })
      const out = fila.listar(DATA, req.user.id, { status, limite: req.query.limite, midiaUrl: opcoes.midiaUrl })
      res.json({ ok: true, prioridades: fila.PRIORIDADES, ...out })
    } catch (e) { falha(res, e, 'Falha ao listar a fila') }
  })

  app.post('/produtos/editar', auth, async (req, res) => {
    try {
      const id = idDe(req.body)
      if (!id) return res.status(400).json({ error: 'Informe a oferta.' })
      const item = await fila.editar(DATA, req.user.id, cfgDe(req.user.id), id, req.body)
      res.json({ ok: true, item })
    } catch (e) { falha(res, e, 'Falha ao editar a oferta') }
  })

  app.post('/produtos/reenfileirar', auth, async (req, res) => {
    try {
      const id = idDe(req.body)
      if (!id) return res.status(400).json({ error: 'Informe a oferta.' })
      const item = await fila.reenfileirar(DATA, req.user.id, cfgDe(req.user.id), id)
      res.json({ ok: true, item })
    } catch (e) { falha(res, e, 'Falha ao reenfileirar') }
  })
}

module.exports = { mount }
