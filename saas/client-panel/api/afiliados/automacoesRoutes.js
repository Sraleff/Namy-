/**
 * Rota "Executar agora" (Fase 1.4). userId so do JWT.
 * Roda uma execucao do disparo na hora: mesmo caminho do agendador (N produtos, pausa,
 * limite do dia), mas ignora intervalo, janela e dias. Limite de uma execucao a cada 20 s
 * por cliente; nunca duas ao mesmo tempo (a trava e do scheduler).
 */
const scheduler = require('../scheduler')
const { criarLimitador } = require('./linkRoutes')

function mount(app, deps, opcoes = {}) {
  const { auth } = deps
  const permitir = criarLimitador(1, opcoes.janelaMs || 20 * 1000)

  app.post('/automacoes/executar', auth, async (req, res) => {
    try {
      const userId = req.user.id
      const r = await scheduler.executarAgora(deps, userId, {
        liberar: () => permitir(userId),
        random: opcoes.random,
        dormir: opcoes.dormir
      })
      if (r.status >= 400) return res.status(r.status).json({ error: r.mensagem, codigo: r.codigo })
      res.json({ ok: r.ok, enviados: r.enviados, parou: r.parou, message: r.mensagem })
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Falha ao executar agora' })
    }
  })
}

module.exports = { mount }
