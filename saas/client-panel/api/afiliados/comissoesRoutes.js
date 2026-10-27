/**
 * Rotas de Comissoes (fase 2.1). userId so do JWT.
 *  GET  /comissoes?de=YYYY-MM-DD&ate=YYYY-MM-DD   resumo (cache de 10 min; ate 90 dias)
 *  POST /comissoes/atualizar                      ignora o cache (3 por minuto)
 *  GET  /comissoes/config   PUT /comissoes/config { porGrupo: boolean }
 */
const comissoes = require('./comissoes')
const { criarLimitador } = require('./linkRoutes')

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/

function mount(app, deps, opcoes = {}) {
  const { auth, readJson, writeJson, CONFIGS, DATA } = deps
  const podeAtualizar = criarLimitador(opcoes.atualizacoesPorMin || 3, 60 * 1000)
  const podeLer = criarLimitador(opcoes.leiturasPorMin || 20, 60 * 1000)
  const falha = (res, e, padrao) => res.status(e.status || 500).json({ error: e.message || padrao, ultimo: e.ultimo || undefined })

  function contexto(req, res) {
    const cfg = readJson(CONFIGS, {})[req.user.id]
    if (!cfg) { res.status(404).json({ error: 'Conta não encontrada' }); return null }
    return { userId: req.user.id, cfg, dataDir: DATA }
  }

  function datas(q) {
    const de = q.de == null || q.de === '' ? undefined : String(q.de)
    const ate = q.ate == null || q.ate === '' ? undefined : String(q.ate)
    if ((de && !DATA_RE.test(de)) || (ate && !DATA_RE.test(ate))) return null
    return { de, ate }
  }

  async function entregar(req, res, forcar) {
    try {
      const ctx = contexto(req, res)
      if (!ctx) return
      const d = datas(forcar ? (req.body || {}) : (req.query || {}))
      if (!d) return res.status(400).json({ error: 'Datas no formato AAAA-MM-DD.' })
      if (!(forcar ? podeAtualizar : podeLer)(ctx.userId)) return res.status(429).json({ error: 'Muitas consultas seguidas. Espere um minuto.' })
      res.json(await comissoes.resumo(ctx, { de: d.de, ate: d.ate, forcar }))
    } catch (e) { falha(res, e, 'Falha ao ler as comissões') }
  }

  app.get('/comissoes', auth, (req, res) => entregar(req, res, false))
  app.post('/comissoes/atualizar', auth, (req, res) => entregar(req, res, true))

  app.get('/comissoes/config', auth, (req, res) => {
    const ctx = contexto(req, res)
    if (ctx) res.json({ ok: true, porGrupo: !!(ctx.cfg.comissoes && ctx.cfg.comissoes.porGrupo) })
  })

  app.put('/comissoes/config', auth, (req, res) => {
    try {
      const ctx = contexto(req, res)
      if (!ctx) return
      const v = (req.body || {}).porGrupo
      if (typeof v !== 'boolean') return res.status(400).json({ error: 'porGrupo deve ser verdadeiro ou falso.' })
      const todos = readJson(CONFIGS, {})
      todos[ctx.userId].comissoes = Object.assign({}, todos[ctx.userId].comissoes, { porGrupo: v })
      todos[ctx.userId].updatedAt = new Date().toISOString()
      writeJson(CONFIGS, todos)
      res.json({ ok: true, porGrupo: v })
    } catch (e) { falha(res, e, 'Falha ao salvar') }
  })
}

module.exports = { mount }
