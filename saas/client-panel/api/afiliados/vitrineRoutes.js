/**
 * Rotas da Vitrine (Fase 1.3). userId so do JWT. Exigem licenca ativa e as chaves
 * Shopee da conta (a busca e o link saem da API do proprio cliente).
 * Limites por cliente: 20 buscas/min e 4 envios/min.
 */
const vitrine = require('./vitrine')
const shopee = require('./conectores/shopee')
const { criarLimitador } = require('./linkRoutes')

function licencaAtiva(cfg) {
  if (!cfg || !cfg.license) return false
  return !!cfg.license.active && new Date(cfg.license.expiresAt) > new Date()
}

function mount(app, deps, opcoes = {}) {
  const { auth, readJson, CONFIGS, DATA, logs, sessions } = deps
  const podeBuscar = criarLimitador(opcoes.buscasPorMin || 20, 60 * 1000)
  const podeEnviar = criarLimitador(opcoes.enviosPorMin || 4, 60 * 1000)

  function falha(res, e, padrao) {
    res.status(e.status || 500).json({ error: e.message || padrao })
  }

  // Conta + licenca + chaves Shopee; devolve o ctx ou ja responde o erro
  function contexto(req, res, { exigeChave = true } = {}) {
    const userId = req.user.id
    const cfg = readJson(CONFIGS, {})[userId]
    if (!cfg) { res.status(404).json({ error: 'Conta não encontrada' }); return null }
    if (!licencaAtiva(cfg)) { res.status(403).json({ error: 'Licença expirada ou inativa.' }); return null }
    if (exigeChave) {
      const pronto = shopee.configurado({ cfg })
      if (!pronto.ok) { res.status(400).json({ error: pronto.motivo, codigo: 'SEM_CHAVE' }); return null }
    }
    return { userId, cfg, dataDir: DATA }
  }

  function itemIdDe(body) {
    const v = (body || {}).itemId
    const s = typeof v === 'number' ? String(v) : v
    return typeof s === 'string' && /^\d{1,20}$/.test(s) ? s : ''
  }

  app.get('/vitrine', auth, async (req, res) => {
    try {
      const ctx = contexto(req, res)
      if (!ctx) return
      const out = await vitrine.buscar(ctx, { keyword: req.query.keyword, ordem: req.query.ordem, pagina: req.query.pagina }, { liberar: () => podeBuscar(ctx.userId) })
      res.json({ ok: true, ordens: vitrine.ordens(), ...out })
    } catch (e) { falha(res, e, 'Falha ao buscar ofertas') }
  })

  app.post('/vitrine/salvar', auth, async (req, res) => {
    try {
      const ctx = contexto(req, res, { exigeChave: false })
      if (!ctx) return
      const itemId = itemIdDe(req.body)
      if (!itemId) return res.status(400).json({ error: 'Oferta inválida.' })
      res.json({ ok: true, ...(await vitrine.salvar(ctx, itemId)) })
    } catch (e) { falha(res, e, 'Falha ao salvar na fila') }
  })

  app.post('/vitrine/enviar', auth, async (req, res) => {
    try {
      const ctx = contexto(req, res, { exigeChave: false })
      if (!ctx) return
      const itemId = itemIdDe(req.body)
      if (!itemId) return res.status(400).json({ error: 'Oferta inválida.' })
      const out = await vitrine.enviar(ctx, { itemId, jids: req.body.jids, forcarNicho: req.body.forcarNicho }, { sessions, logs, pausaMs: opcoes.pausaMs, liberar: () => podeEnviar(ctx.userId) })
      res.json({ ...out })
    } catch (e) { falha(res, e, 'Falha ao enviar a oferta') }
  })
}

module.exports = { mount }
