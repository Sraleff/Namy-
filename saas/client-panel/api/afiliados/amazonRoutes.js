/**
 * Rotas da Amazon Creators API (D3). userId só do JWT. Opcional: sem ela o link Amazon continua
 * sendo montado com a tag do cliente; com ela o envio confere estoque e preço antes.
 *   GET  /amazon/creators            { configurada, clientId (mascarado), cofre }
 *   POST /amazon/creators            { clientId, clientSecret }  confere pegando um token e guarda cifrado
 *   POST /amazon/creators/remover
 *   POST /amazon/creators/testar     { url }  consulta um produto (estoque, preço) com a sua conta
 */
const amazonApi = require('./amazonApi')
const amazon = require('./conectores/amazon')
const links = require('./links')
const { criarLimitador } = require('./linkRoutes')

function mount(app, deps, opcoes = {}) {
  const { auth, readJson, CONFIGS, DATA, logs } = deps
  const podeAlterar = criarLimitador(opcoes.alteracoesPorMin || 6, 60 * 1000)
  const podeTestar = criarLimitador(opcoes.testesPorMin || 6, 60 * 1000)
  const falha = (res, e, padrao) => res.status(e.status && e.status < 600 ? e.status : 500).json({ error: e.message || padrao })
  const conta = (req, res) => {
    const cfg = readJson(CONFIGS, {})[req.user.id]
    if (!cfg) { res.status(404).json({ error: 'Conta não encontrada' }); return null }
    return cfg
  }

  app.get('/amazon/creators', auth, (req, res) => {
    if (!conta(req, res)) return
    res.json(amazonApi.estado(DATA, req.user.id))
  })

  app.post('/amazon/creators', auth, async (req, res) => {
    try {
      if (!conta(req, res)) return
      if (!podeAlterar(req.user.id)) return res.status(429).json({ error: 'Muitas tentativas seguidas. Espere um minuto.' })
      await amazonApi.salvar(DATA, req.user.id, req.body || {})
      try { logs && logs.append(DATA, req.user.id, { source: 'amazon', level: 'info', ok: true, message: 'Creators API da Amazon conectada.' }) } catch {}
      res.json(Object.assign({ ok: true }, amazonApi.estado(DATA, req.user.id)))
    } catch (e) { falha(res, e, 'Falha ao salvar as credenciais') }
  })

  app.post('/amazon/creators/remover', auth, async (req, res) => {
    try {
      if (!conta(req, res)) return
      await amazonApi.remover(DATA, req.user.id)
      res.json(Object.assign({ ok: true }, amazonApi.estado(DATA, req.user.id)))
    } catch (e) { falha(res, e, 'Falha ao remover') }
  })

  app.post('/amazon/creators/testar', auth, async (req, res) => {
    try {
      const cfg = conta(req, res)
      if (!cfg) return
      if (!podeTestar(req.user.id)) return res.status(429).json({ error: 'Espere alguns segundos antes de testar de novo.' })
      const url = String((req.body && req.body.url) || '').trim().slice(0, 600)
      if (links.marketplaceDe(url) !== 'amazon') return res.status(400).json({ error: 'Cole o link de um produto da Amazon.' })
      const final = await links.resolver(url)
      const asin = amazon.asinDe(final)
      if (!asin) return res.status(400).json({ error: 'Não achei o ASIN do produto nesse link.' })
      const tag = String((cfg.amazon && cfg.amazon.tag) || '')
      const item = (await amazonApi.buscarItens(DATA, req.user.id, tag, [asin])).get(asin)
      if (!item) return res.json({ ok: false, asin, mensagem: 'A Creators API não devolveu este produto (pode não estar disponível pela API).' })
      res.json({ ok: true, item })
    } catch (e) { falha(res, e, 'Falha ao consultar a Amazon') }
  })
}

module.exports = { mount }
