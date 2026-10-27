/**
 * Rotas dos cupons (fase 2.3). userId so do JWT.
 *  GET  /cupons                 lista com a situacao de cada um (vigente, vence-em-breve, vencido...)
 *  POST /cupons/criar           { codigo, loja, regra?, validoDe?, validoAte, nichos? }
 *  POST /cupons/editar          { id, ...campos }
 *  POST /cupons/ativar          { id, ativo }
 *  POST /cupons/remover         { id }
 */
const cupons = require('./cupons')
const nichos = require('./nichos')
const { criarLimitador } = require('./linkRoutes')

function mount(app, deps, opcoes = {}) {
  const { auth, readJson, CONFIGS, DATA } = deps
  const podeEscrever = criarLimitador(opcoes.escritasPorMin || 30, 60 * 1000)
  const falha = (res, e, padrao) => res.status(e.status || 500).json({ error: e.message || padrao })

  function conta(req, res) {
    if (!readJson(CONFIGS, {})[req.user.id]) { res.status(404).json({ error: 'Conta não encontrada' }); return null }
    return req.user.id
  }
  const idDe = (b) => (typeof (b || {}).id === 'string' && /^[0-9a-f-]{36}$/.test(b.id) ? b.id : '')
  const publico = (c) => Object.assign({}, c, { situacao: cupons.situacao(c) })

  app.get('/cupons', auth, (req, res) => {
    try {
      const userId = conta(req, res)
      if (!userId) return
      res.json({
        ok: true,
        cupons: cupons.listar(DATA, userId).map(publico),
        lojas: cupons.LOJAS,
        nichos: Object.entries(nichos.NICHOS).map(([id, n]) => ({ id, label: n.label })),
        max: cupons.MAX_CUPONS
      })
    } catch (e) { falha(res, e, 'Falha ao listar') }
  })

  const escrever = (fn) => async (req, res) => {
    try {
      const userId = conta(req, res)
      if (!userId) return
      if (!podeEscrever(userId)) return res.status(429).json({ error: 'Muitas alterações seguidas. Espere um minuto.' })
      res.json(await fn(userId, req.body || {}, res))
    } catch (e) { falha(res, e, 'Falha ao salvar') }
  }

  app.post('/cupons/criar', auth, escrever(async (u, b) => ({ ok: true, cupom: publico(await cupons.criar(DATA, u, b)) })))
  app.post('/cupons/editar', auth, escrever(async (u, b) => {
    const id = idDe(b)
    if (!id) throw Object.assign(new Error('Cupom inválido.'), { status: 400 })
    return { ok: true, cupom: publico(await cupons.editar(DATA, u, id, b)) }
  }))
  app.post('/cupons/ativar', auth, escrever(async (u, b) => {
    const id = idDe(b)
    if (!id || typeof b.ativo !== 'boolean') throw Object.assign(new Error('Informe o cupom e ativo (verdadeiro ou falso).'), { status: 400 })
    return { ok: true, cupom: publico(await cupons.ativar(DATA, u, id, b.ativo)) }
  }))
  app.post('/cupons/remover', auth, escrever(async (u, b) => {
    const id = idDe(b)
    if (!id) throw Object.assign(new Error('Cupom inválido.'), { status: 400 })
    await cupons.remover(DATA, u, id)
    return { ok: true }
  }))
}

module.exports = { mount }
