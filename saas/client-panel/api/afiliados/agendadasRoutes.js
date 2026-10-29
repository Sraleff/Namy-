/**
 * Rotas das mensagens agendadas (fase 2.2). userId so do JWT.
 *  GET  /agendadas                 lista + grupos de destino + limites
 *  POST /agendadas/criar           { nome, texto, imagemUrl?, destinos[], recorrencia }  (nasce PAUSADA)
 *  POST /agendadas/editar          { id, ...campos da criacao }
 *  POST /agendadas/ativar          { id, ativo, confirmo:true }   (ligar exige confirmo)
 *  POST /agendadas/remover         { id }
 *  POST /agendadas/enviar-agora    { id, confirmo:true }          (3 por minuto)
 *  POST /agendadas/previa          { recorrencia }                proximas 5 execucoes
 *  POST /agendadas/config          { maxGrupos, pausaMin, pausaMax }
 */
const agendadas = require('./agendadas')
const exec = require('./agendadasExec')
const { criarLimitador } = require('./linkRoutes')

function mount(app, deps, opcoes = {}) {
  const { auth, readJson, writeJson, CONFIGS, DATA, logs, sessions } = deps
  const podeEnviar = criarLimitador(opcoes.enviosPorMin || 3, 60 * 1000)
  const podeEscrever = criarLimitador(opcoes.escritasPorMin || 40, 60 * 1000)

  const falha = (res, e, padrao) => res.status(e.status || 500).json({ error: e.message || padrao })

  function contexto(req, res, { licenca = false } = {}) {
    const cfg = readJson(CONFIGS, {})[req.user.id]
    if (!cfg) { res.status(404).json({ error: 'Conta não encontrada' }); return null }
    if (licenca && !exec.licencaAtiva(cfg)) { res.status(403).json({ error: 'Licença expirada ou inativa.' }); return null }
    return { userId: req.user.id, cfg }
  }
  const idDe = (body) => (typeof (body || {}).id === 'string' && /^[0-9a-f-]{36}$/.test(body.id) ? body.id : '')

  const publica = (it) => ({
    id: it.id, nome: it.nome, texto: it.texto, imagemUrl: it.imagemUrl, destinos: it.destinos, recorrencia: it.recorrencia,
    ativo: !!it.ativo, proximaEm: it.proximaEm, ultimaExecucao: it.ultimaExecucao, historico: (it.historico || []).slice(0, 10), criadoEm: it.criadoEm
  })

  function visao(ctx) {
    const fontes = new Set((ctx.cfg.sources || []).map((g) => g && g.jid))
    return {
      ok: true,
      agendas: agendadas.listar(DATA, ctx.userId).map(publica),
      grupos: (ctx.cfg.groups || []).filter((g) => g && !fontes.has(g.jid)).map((g) => ({ jid: g.jid, name: g.name || g.jid, niche: g.niche || 'geral' })),
      limites: exec.limites(ctx.cfg.agendadas),
      tolerancia: Math.round(agendadas.TOLERANCIA_MS / 60000),
      maxAgendas: agendadas.MAX_AGENDAS
    }
  }

  app.get('/agendadas', auth, (req, res) => {
    try { const ctx = contexto(req, res); if (ctx) res.json(visao(ctx)) } catch (e) { falha(res, e, 'Falha ao listar') }
  })

  app.post('/agendadas/criar', auth, async (req, res) => {
    try {
      const ctx = contexto(req, res, { licenca: true })
      if (!ctx) return
      if (!podeEscrever(ctx.userId)) return res.status(429).json({ error: 'Muitas alterações seguidas. Espere um minuto.' })
      const item = await agendadas.criar(DATA, ctx.userId, ctx.cfg, req.body)
      res.json({ ok: true, agenda: publica(item) })
    } catch (e) { falha(res, e, 'Falha ao criar') }
  })

  app.post('/agendadas/editar', auth, async (req, res) => {
    try {
      const ctx = contexto(req, res, { licenca: true })
      if (!ctx) return
      const id = idDe(req.body)
      if (!id) return res.status(400).json({ error: 'Agenda inválida.' })
      if (!podeEscrever(ctx.userId)) return res.status(429).json({ error: 'Muitas alterações seguidas. Espere um minuto.' })
      res.json({ ok: true, agenda: publica(await agendadas.editar(DATA, ctx.userId, ctx.cfg, id, req.body)) })
    } catch (e) { falha(res, e, 'Falha ao editar') }
  })

  app.post('/agendadas/ativar', auth, async (req, res) => {
    try {
      const ctx = contexto(req, res, { licenca: true })
      if (!ctx) return
      const id = idDe(req.body)
      const { ativo, confirmo } = req.body || {}
      if (!id || typeof ativo !== 'boolean') return res.status(400).json({ error: 'Informe a agenda e ativo (verdadeiro ou falso).' })
      if (ativo && confirmo !== true) return res.status(400).json({ error: 'Para ligar, confirme que entende que a mensagem será enviada aos grupos escolhidos.' })
      res.json({ ok: true, agenda: publica(await agendadas.ativar(DATA, ctx.userId, id, ativo)) })
    } catch (e) { falha(res, e, 'Falha ao alterar') }
  })

  app.post('/agendadas/remover', auth, async (req, res) => {
    try {
      const ctx = contexto(req, res)
      if (!ctx) return
      const id = idDe(req.body)
      if (!id) return res.status(400).json({ error: 'Agenda inválida.' })
      await agendadas.remover(DATA, ctx.userId, id)
      res.json({ ok: true })
    } catch (e) { falha(res, e, 'Falha ao remover') }
  })

  app.post('/agendadas/enviar-agora', auth, async (req, res) => {
    try {
      const ctx = contexto(req, res, { licenca: true })
      if (!ctx) return
      const id = idDe(req.body)
      if (!id) return res.status(400).json({ error: 'Agenda inválida.' })
      if ((req.body || {}).confirmo !== true) return res.status(400).json({ error: 'Confirme o envio: a mensagem vai agora para os grupos escolhidos.' })
      const item = agendadas.listar(DATA, ctx.userId).find((i) => i.id === id)
      if (!item) return res.status(404).json({ error: 'Agenda não encontrada.' })
      if (!sessions || !sessions.publicState(ctx.userId).connected) return res.status(400).json({ error: 'O WhatsApp não está conectado.' })
      if (exec.emExecucao.has(ctx.userId)) return res.status(409).json({ error: 'Já existe um envio de agenda em andamento. Aguarde.' })
      if (!podeEnviar(ctx.userId)) return res.status(429).json({ error: 'Espere um minuto antes de enviar de novo.' })
      exec.emExecucao.add(ctx.userId)
      try {
        const reg = await exec.executar({ sessions, logs, DATA, dormir: opcoes.dormir, random: opcoes.random }, ctx.userId, ctx.cfg, item, { manual: true })
        res.json({ ok: reg.enviados > 0, registro: reg })
      } finally { exec.emExecucao.delete(ctx.userId) }
    } catch (e) { falha(res, e, 'Falha ao enviar') }
  })

  app.post('/agendadas/previa', auth, (req, res) => {
    try {
      const ctx = contexto(req, res)
      if (!ctx) return
      const rec = agendadas.validarRecorrencia((req.body || {}).recorrencia)
      res.json({ ok: true, proximas: agendadas.proximas(rec, Date.now(), 5).map((t) => new Date(t).toISOString()) })
    } catch (e) { falha(res, e, 'Falha na previa') }
  })

  app.post('/agendadas/config', auth, (req, res) => {
    try {
      const ctx = contexto(req, res)
      if (!ctx) return
      const b = req.body || {}
      const novo = { maxGrupos: b.maxGrupos, pausaMin: b.pausaMin, pausaMax: b.pausaMax }
      for (const [k, [min, max]] of Object.entries({ maxGrupos: [1, 30], pausaMin: [3, 60], pausaMax: [3, 120] })) {
        if (!Number.isInteger(novo[k]) || novo[k] < min || novo[k] > max) return res.status(400).json({ error: k + ' deve ser um inteiro de ' + min + ' a ' + max + '.' })
      }
      if (novo.pausaMax < novo.pausaMin) return res.status(400).json({ error: 'A pausa máxima não pode ser menor que a mínima.' })
      const todos = readJson(CONFIGS, {})
      todos[ctx.userId].agendadas = novo
      todos[ctx.userId].updatedAt = new Date().toISOString()
      writeJson(CONFIGS, todos)
      ctx.cfg = todos[ctx.userId]
      res.json(visao(ctx))
    } catch (e) { falha(res, e, 'Falha ao salvar') }
  })
}

module.exports = { mount }
