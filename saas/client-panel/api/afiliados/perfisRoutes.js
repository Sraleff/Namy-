/**
 * Perfis de envio (C1). userId so do JWT. Somente leitura/calculo: nada e gravado aqui.
 *  GET  /automacoes/perfis   { perfis, atual, risco } da conta
 *  POST /automacoes/risco    { ads } -> risco do rascunho do formulario
 */
const perfis = require('./perfis')
const { criarLimitador } = require('./linkRoutes')

function mount(app, deps, opcoes = {}) {
  const { auth, readJson, CONFIGS } = deps
  const podeCalcular = criarLimitador(opcoes.calculosPorMin || 120, 60 * 1000)
  const JID_RE = /^[0-9A-Za-z._-]+@g\.us$/

  function destinos(cfg) {
    const fontes = new Set((cfg.sources || []).map((g) => g && g.jid))
    return (cfg.groups || []).filter((g) => g && JID_RE.test(g.jid) && !fontes.has(g.jid)).length || 1
  }

  app.get('/automacoes/perfis', auth, (req, res) => {
    const cfg = readJson(CONFIGS, {})[req.user.id]
    if (!cfg) return res.status(404).json({ error: 'Conta nao encontrada' })
    res.json({ ok: true, perfis: perfis.lista(), atual: perfis.perfilAtual(cfg.ads), risco: perfis.risco(cfg.ads, destinos(cfg)) })
  })

  app.post('/automacoes/risco', auth, (req, res) => {
    const cfg = readJson(CONFIGS, {})[req.user.id]
    if (!cfg) return res.status(404).json({ error: 'Conta nao encontrada' })
    if (!podeCalcular(req.user.id)) return res.status(429).json({ error: 'Muitas consultas seguidas. Espere um instante.' })
    const ads = (req.body || {}).ads
    if (!ads || typeof ads !== 'object' || Array.isArray(ads)) return res.status(400).json({ error: 'Informe as configuracoes (ads).' })
    res.json({ ok: true, atual: perfis.perfilAtual(ads), risco: perfis.risco(ads, destinos(cfg)) })
  })
}

module.exports = { mount }
