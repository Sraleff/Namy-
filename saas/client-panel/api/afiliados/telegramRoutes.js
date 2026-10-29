/**
 * Rotas do Telegram (D4). userId só do JWT; recurso do Pro (barrado em server.js).
 *   GET  /telegram                       estado (sem o token), destinos e nichos
 *   POST /telegram/conectar              { token }  confere no getMe e guarda cifrado
 *   POST /telegram/desconectar           apaga o token e os destinos
 *   POST /telegram/destinos              { chat: "@canal" | "-100...", nicho }
 *   POST /telegram/destinos/remover      { id }
 *   POST /telegram/destinos/nicho        { id, nicho }
 *   POST /telegram/ativo                 { ativo }  liga/desliga o espelho das ofertas
 *   POST /telegram/testar                { id }  manda uma mensagem de teste (ação do próprio cliente)
 */
const telegram = require('./telegram')
const nichos = require('./nichos')
const { criarLimitador } = require('./linkRoutes')

function mount(app, deps, opcoes = {}) {
  const { auth, readJson, CONFIGS, DATA, logs } = deps
  const podeAlterar = criarLimitador(opcoes.alteracoesPorMin || 10, 60 * 1000)
  const podeTestar = criarLimitador(opcoes.testesPorMin || 3, 60 * 1000)
  const falha = (res, e, padrao) => res.status(e.status && e.status < 600 ? e.status : 500).json({ error: e.message || padrao })

  function conta(req, res) {
    if (!readJson(CONFIGS, {})[req.user.id]) { res.status(404).json({ error: 'Conta não encontrada' }); return false }
    return true
  }
  const resposta = (userId) => Object.assign({ ok: true }, telegram.estado(DATA, userId), {
    nichos: [{ id: 'todos', label: 'Todos (1 oferta por rodada)' }].concat(nichos.catalogo().map((n) => ({ id: n.id, label: n.label })))
  })

  function rota(caminho, fn, { limitador = podeAlterar, padrao } = {}) {
    app.post(caminho, auth, async (req, res) => {
      try {
        if (!conta(req, res)) return
        if (!limitador(req.user.id)) return res.status(429).json({ error: 'Muitas tentativas seguidas. Espere um minuto.' })
        await fn(req.user.id, req.body || {})
        res.json(resposta(req.user.id))
      } catch (e) { falha(res, e, padrao) }
    })
  }

  app.get('/telegram', auth, (req, res) => {
    try {
      if (!conta(req, res)) return
      res.json(resposta(req.user.id))
    } catch (e) { falha(res, e, 'Falha ao ler o Telegram') }
  })

  rota('/telegram/conectar', async (userId, b) => {
    const db = await telegram.conectar(DATA, userId, b.token)
    try { logs && logs.append(DATA, userId, { source: 'telegram', level: 'info', ok: true, message: 'Bot do Telegram conectado: @' + db.bot.username }) } catch {}
  }, { padrao: 'Falha ao conectar o bot' })
  rota('/telegram/desconectar', (userId) => telegram.desconectar(DATA, userId), { padrao: 'Falha ao desconectar' })
  rota('/telegram/destinos', (userId, b) => telegram.adicionarDestino(DATA, userId, { chat: b.chat, nicho: b.nicho }), { padrao: 'Falha ao adicionar o canal' })
  rota('/telegram/destinos/remover', (userId, b) => telegram.removerDestino(DATA, userId, b.id), { padrao: 'Falha ao remover' })
  rota('/telegram/destinos/nicho', (userId, b) => telegram.nichoDoDestino(DATA, userId, b.id, b.nicho), { padrao: 'Falha ao trocar o nicho' })
  rota('/telegram/ativo', (userId, b) => telegram.ligar(DATA, userId, b.ativo), { padrao: 'Falha ao salvar' })
  rota('/telegram/testar', (userId, b) => telegram.testar(DATA, userId, b.id), { limitador: podeTestar, padrao: 'Falha no teste' })
}

module.exports = { mount }
