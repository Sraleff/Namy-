/**
 * Rotas do cérebro da Namy (D1). userId só do JWT.
 *   GET  /cerebro              comandos, moderação por grupo, assistente, grupos de destino e o que o plano libera
 *   POST /cerebro/comandos     { ativo }
 *   POST /cerebro/moderacao    { jid, antiLink, antiFlood, avisar, removerApos }   (Pro)
 *   POST /cerebro/ia           { ativo, grupos[], limiteHora }                      (Pro)
 */
const cerebro = require('./cerebro')
const limites = require('./limites')
const cofre = require('./cofre')
const copy = require('./copy')
const { criarLimitador } = require('./linkRoutes')

function mount(app, deps, opcoes = {}) {
  const { auth, readJson, CONFIGS, DATA, sessions } = deps
  const podeAlterar = criarLimitador(opcoes.alteracoesPorMin || 30, 60 * 1000)
  const falha = (res, e, padrao) => res.status(e.status && e.status < 600 ? e.status : 500).json({ error: e.message || padrao })
  const conta = (req, res) => {
    const cfg = readJson(CONFIGS, {})[req.user.id]
    if (!cfg) { res.status(404).json({ error: 'Conta não encontrada' }); return null }
    return cfg
  }

  function estado(userId, cfg) {
    const db = cerebro.carregar(DATA, userId)
    const destinos = cerebro.destinosValidos(cfg)
    const c = (cfg.copy && cfg.copy.ia) || {}
    const temChave = c.provedor === 'ollama' ? copy.ollamaPermitido(cfg) : !!((cofre.ler(DATA, userId, 'ia') || {})[c.provedor])
    const st = sessions ? sessions.publicState(userId) : { connected: false }
    return {
      comandos: db.comandos,
      moderacao: db.moderacao,
      ia: db.ia,
      iaPronta: !!(c.provedor && temChave),
      iaProvedor: c.provedor && copy.PROVEDORES[c.provedor] ? copy.PROVEDORES[c.provedor].rotulo : '',
      plano: { moderacao: limites.podeRecurso(cfg, 'moderacao'), assistente: limites.podeRecurso(cfg, 'assistente') },
      whatsapp: !!st.connected,
      destinos: (cfg.groups || []).filter((g) => g && destinos.has(g.jid)).map((g) => ({ jid: g.jid, name: g.name || g.jid }))
    }
  }

  function rota(caminho, recurso, fn) {
    app.post(caminho, auth, async (req, res) => {
      try {
        const cfg = conta(req, res)
        if (!cfg) return
        if (recurso && !limites.podeRecurso(cfg, recurso)) {
          return res.status(402).json({ error: (recurso === 'moderacao' ? 'A moderação' : 'O assistente com IA') + ' faz parte do plano Pro. Faça upgrade para usar.', upgrade: true })
        }
        if (!podeAlterar(req.user.id)) return res.status(429).json({ error: 'Muitas alterações seguidas. Espere um minuto.' })
        await fn(req.user.id, cfg, req.body || {})
        res.json(Object.assign({ ok: true }, estado(req.user.id, cfg)))
      } catch (e) { falha(res, e, 'Falha ao salvar') }
    })
  }

  app.get('/cerebro', auth, (req, res) => {
    try {
      const cfg = conta(req, res)
      if (!cfg) return
      res.json(estado(req.user.id, cfg))
    } catch (e) { falha(res, e, 'Falha ao ler') }
  })

  rota('/cerebro/comandos', null, (userId, _cfg, b) => cerebro.salvarComandos(DATA, userId, b))
  rota('/cerebro/moderacao', 'moderacao', (userId, cfg, b) => cerebro.salvarModeracao(DATA, userId, cfg, b))
  rota('/cerebro/ia', 'assistente', (userId, cfg, b) => cerebro.salvarIA(DATA, userId, cfg, b))
}

module.exports = { mount }
