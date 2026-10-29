/**
 * Rotas da captação (D5).
 * Públicas (sem login; o endereço é o slug aleatório):
 *   GET /g/:slug            página do link de grupos
 *   GET /g/:slug/entrar     leva ao próximo grupo com vaga (302 para o convite do WhatsApp)
 *   GET /v/:slug            vitrine pública
 *   GET /v/:slug/ir/:id     leva à oferta (302 só para link de marketplace guardado)
 * Painel (JWT; recurso do Pro, barrado em server.js):
 *   GET  /captacao                   endereços, config, situação dos grupos, ofertas e cliques de 7 dias
 *   POST /captacao/grupos            { ativo, titulo, descricao, jids[], limite, modo }
 *   POST /captacao/vitrine           { ativo, titulo, descricao, horas, botaoGrupo }
 *   POST /captacao/endereco          endereço novo (o antigo para de funcionar)
 *   POST /captacao/testar            qual grupo o link escolheria agora (não conta clique)
 *   POST /captacao/vitrine/remover   { id }
 */
const captacao = require('./captacao')
const paginas = require('./captacaoPaginas')
const limites = require('./limites')
const { criarLimitador } = require('./linkRoutes')

const AVISO_MS = 30 * 60 * 1000
const licencaAtiva = (cfg) => !!(cfg && cfg.license && cfg.license.active && new Date(cfg.license.expiresAt) > new Date())

function baseDe(req) {
  const env = String(process.env.PUBLIC_URL || '').trim().replace(/\/$/, '')
  if (env) return env
  const proto = String(req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim()
  return proto + '://' + req.get('host')
}

function cabecalhos(res) {
  res.set('Content-Security-Policy', "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'")
  res.set('X-Content-Type-Options', 'nosniff')
  res.set('X-Frame-Options', 'DENY')
  res.set('Referrer-Policy', 'no-referrer')
  res.set('X-Robots-Tag', 'noindex')
  res.set('Cache-Control', 'no-store')
}

function mount(app, deps, opcoes = {}) {
  const { auth, readJson, CONFIGS, DATA, sessions, logs } = deps
  // O IP só vive na memória do limitador (alguns minutos); nunca vai para disco
  const porIp = criarLimitador(opcoes.visitasPorMin || 60, 60 * 1000)
  const porPagina = criarLimitador(opcoes.visitasPorPaginaMin || 600, 60 * 1000)
  const podeEscrever = criarLimitador(opcoes.alteracoesPorMin || 20, 60 * 1000)
  const podeTestar = criarLimitador(opcoes.testesPorMin || 6, 60 * 1000)
  const avisados = new Map()
  if (opcoes.timer !== false) captacao.iniciar(DATA)

  const falha = (res, e, padrao) => res.status(e.status || 500).json({ error: e.message || padrao })
  const conectado = (userId) => !!(sessions && sessions.publicState(userId).connected)

  function avisarUmaVez(userId, chave, message) {
    const k = userId + '|' + chave
    if (Date.now() - (avisados.get(k) || 0) < AVISO_MS) return
    avisados.set(k, Date.now())
    try { logs && logs.append(DATA, userId, { source: 'captacao', level: 'warn', ok: false, message }) } catch {}
  }

  // ---------------------------------------------------------------- públicas

  function contaDoSlug(slug) {
    const userId = captacao.donoDoSlug(DATA, slug)
    if (!userId) return null
    const cfg = readJson(CONFIGS, {})[userId]
    // Licença vencida ou plano sem captação: a página some (não mostra nada do cliente)
    if (!cfg || !licencaAtiva(cfg) || !limites.podeRecurso(cfg, 'captacao')) return null
    return { userId, cfg, db: captacao.carregar(DATA, userId) }
  }

  function liberar(req, res, slug) {
    const ip = String(req.ip || (req.socket && req.socket.remoteAddress) || '?')
    if (porIp('ip:' + ip) && porPagina('slug:' + slug)) return true
    cabecalhos(res)
    res.status(429).type('html').send(paginas.muitasVisitas())
    return false
  }

  const naoAchou = (res) => { cabecalhos(res); res.status(404).type('html').send(paginas.naoEncontrada()) }

  async function escolher(c) {
    try {
      const r = await captacao.escolherGrupo({ sessions }, c.userId, c.cfg, c.db.grupos)
      if (!r) avisarUmaVez(c.userId, 'sem-vaga', 'Link de grupos: nenhum grupo com vaga e convite agora. Veja a situação em Captação.')
      return r
    } catch (e) {
      console.error('[CAPTACAO] escolher', e.message)
      return null
    }
  }

  app.get('/g/:slug', async (req, res) => {
    const slug = String(req.params.slug || '')
    if (!liberar(req, res, slug)) return
    const c = contaDoSlug(slug)
    if (!c || !c.db.grupos.ativo) return naoAchou(res)
    const r = await escolher(c)
    cabecalhos(res)
    res.type('html').send(paginas.grupos({ titulo: c.db.grupos.titulo, descricao: c.db.grupos.descricao, entrarHref: '/g/' + slug + '/entrar', disponivel: !!r }))
  })

  app.get('/g/:slug/entrar', async (req, res) => {
    const slug = String(req.params.slug || '')
    if (!liberar(req, res, slug)) return
    const c = contaDoSlug(slug)
    if (!c || !c.db.grupos.ativo) return naoAchou(res)
    const r = await escolher(c)
    cabecalhos(res)
    if (!r || !captacao.CONVITE_RE.test(r.url)) {
      return res.status(503).type('html').send(paginas.grupos({ titulo: c.db.grupos.titulo, descricao: c.db.grupos.descricao, entrarHref: '', disponivel: false }))
    }
    captacao.registrarEntrada(c.userId, r.jid)
    captacao.contarClique(c.userId, 'g', r.jid)
    res.redirect(302, r.url)
  })

  app.get('/v/:slug', (req, res) => {
    const slug = String(req.params.slug || '')
    if (!liberar(req, res, slug)) return
    const c = contaDoSlug(slug)
    if (!c || !c.db.vitrine.ativo) return naoAchou(res)
    const grupoHref = c.db.vitrine.botaoGrupo && c.db.grupos.ativo && c.db.grupos.jids.length ? '/g/' + slug : ''
    cabecalhos(res)
    res.type('html').send(paginas.vitrine({
      titulo: c.db.vitrine.titulo,
      descricao: c.db.vitrine.descricao,
      itens: captacao.visiveis(c.db),
      irHref: (id) => '/v/' + slug + '/ir/' + id,
      grupoHref
    }))
  })

  app.get('/v/:slug/ir/:id', (req, res) => {
    const slug = String(req.params.slug || '')
    if (!liberar(req, res, slug)) return
    const c = contaDoSlug(slug)
    if (!c || !c.db.vitrine.ativo) return naoAchou(res)
    const url = captacao.linkDoItem(c.db, String(req.params.id || ''))
    if (!url) return naoAchou(res)
    captacao.contarClique(c.userId, 'v', req.params.id)
    cabecalhos(res)
    res.redirect(302, url)
  })

  // ---------------------------------------------------------------- painel

  function conta(req, res) {
    const cfg = readJson(CONFIGS, {})[req.user.id]
    if (!cfg) { res.status(404).json({ error: 'Conta não encontrada' }); return null }
    return cfg
  }

  async function estado(req, cfg) {
    const userId = req.user.id
    await captacao.gravarCliques(DATA)
    const slug = await captacao.garantirSlug(DATA, userId)
    const db = captacao.carregar(DATA, userId)
    const base = baseDe(req)
    const cliques = captacao.resumoCliques(db, 7)
    const fontes = new Set((cfg.sources || []).map((g) => g && g.jid))
    return {
      slug,
      urls: { grupos: base + '/g/' + slug, vitrine: base + '/v/' + slug },
      // Sem PUBLIC_URL e com o painel no próprio computador, o endereço só abre nesta máquina
      local: /^https?:\/\/(localhost|127\.|\[::1\]|0\.0\.0\.0)/i.test(base),
      whatsapp: conectado(userId),
      grupos: db.grupos,
      status: await captacao.statusGrupos({ sessions }, userId, cfg, db.grupos),
      vitrine: db.vitrine,
      itens: captacao.visiveis(db).map((i) => ({ id: i.id, nome: i.nome, preco: i.preco, imageUrl: i.imageUrl, marketplace: i.marketplace, link: i.link, at: i.at, cliques: cliques.porItem[i.id] || 0 })),
      cliques: { porDia: cliques.porDia, porGrupo: cliques.porGrupo },
      destinos: (cfg.groups || []).filter((g) => g && !fontes.has(g.jid)).map((g) => ({ jid: g.jid, name: g.name || g.jid }))
    }
  }

  app.get('/captacao', auth, async (req, res) => {
    try {
      const cfg = conta(req, res)
      if (!cfg) return
      res.json(await estado(req, cfg))
    } catch (e) { falha(res, e, 'Falha ao ler a captação') }
  })

  app.post('/captacao/grupos', auth, async (req, res) => {
    try {
      const cfg = conta(req, res)
      if (!cfg) return
      if (!podeEscrever(req.user.id)) return res.status(429).json({ error: 'Muitas alterações seguidas. Espere um minuto.' })
      await captacao.salvarGrupos(DATA, req.user.id, cfg, req.body)
      res.json(Object.assign({ ok: true }, await estado(req, cfg)))
    } catch (e) { falha(res, e, 'Falha ao salvar o link de grupos') }
  })

  app.post('/captacao/vitrine', auth, async (req, res) => {
    try {
      const cfg = conta(req, res)
      if (!cfg) return
      if (!podeEscrever(req.user.id)) return res.status(429).json({ error: 'Muitas alterações seguidas. Espere um minuto.' })
      await captacao.salvarVitrine(DATA, req.user.id, req.body)
      res.json(Object.assign({ ok: true }, await estado(req, cfg)))
    } catch (e) { falha(res, e, 'Falha ao salvar a vitrine') }
  })

  app.post('/captacao/endereco', auth, async (req, res) => {
    try {
      const cfg = conta(req, res)
      if (!cfg) return
      if (!podeEscrever(req.user.id)) return res.status(429).json({ error: 'Muitas alterações seguidas. Espere um minuto.' })
      if (!req.body || req.body.confirmo !== true) return res.status(400).json({ error: 'Confirme que o endereço antigo vai parar de funcionar.' })
      await captacao.trocarSlug(DATA, req.user.id)
      res.json(Object.assign({ ok: true }, await estado(req, cfg)))
    } catch (e) { falha(res, e, 'Falha ao trocar o endereço') }
  })

  app.post('/captacao/testar', auth, async (req, res) => {
    try {
      const cfg = conta(req, res)
      if (!cfg) return
      if (!podeTestar(req.user.id)) return res.status(429).json({ error: 'Espere alguns segundos antes de testar de novo.' })
      const db = captacao.carregar(DATA, req.user.id)
      if (!db.grupos.jids.length) return res.status(400).json({ error: 'Escolha os grupos do link primeiro.' })
      const r = await captacao.escolherGrupo({ sessions }, req.user.id, cfg, db.grupos)
      const status = await captacao.statusGrupos({ sessions }, req.user.id, cfg, db.grupos)
      if (!r) return res.json({ ok: false, mensagem: 'Nenhum grupo com vaga e convite agora. Veja a situação de cada grupo.', status })
      res.json({ ok: true, grupo: { jid: r.jid, nome: r.nome, tamanho: r.tamanho }, url: r.url, status })
    } catch (e) { falha(res, e, 'Falha ao testar o link') }
  })

  app.post('/captacao/vitrine/remover', auth, async (req, res) => {
    try {
      const cfg = conta(req, res)
      if (!cfg) return
      if (!podeEscrever(req.user.id)) return res.status(429).json({ error: 'Muitas alterações seguidas. Espere um minuto.' })
      await captacao.removerItem(DATA, req.user.id, String((req.body && req.body.id) || ''))
      res.json(Object.assign({ ok: true }, await estado(req, cfg)))
    } catch (e) { falha(res, e, 'Falha ao remover a oferta') }
  })
}

module.exports = { mount, baseDe }
