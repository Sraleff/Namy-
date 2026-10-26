/**
 * Rotas dos upgrades de afiliado. userId sai so do JWT (req.user.id).
 * Excecoes sem JWT, cada uma com sua prova:
 *   /mercadolivre/callback  -> state de uso unico amarrado ao userId
 *   /imagens/arquivo, /ofertas/banco/midia -> URL assinada (HMAC) com validade
 */
const fs = require('fs')
const nichos = require('./nichos')
const links = require('./links')
const conversor = require('./conversor')
const pool = require('./pool')
const auditoria = require('./auditoria')
const oauth = require('./mercadolivreOAuth')
const amazon = require('./conectores/amazon')
const mercadolivre = require('./conectores/mercadolivre')
const cenarios = require('./imagens/cenarios')
const gerador = require('./imagens/gerador')
const imagens = require('./imagens/store')
const linkRoutes = require('./linkRoutes')
const produtosRoutes = require('./produtosRoutes')
const vitrineRoutes = require('./vitrineRoutes')
const automacoesRoutes = require('./automacoesRoutes')
const copyRoutes = require('./copyRoutes')
const comissoesRoutes = require('./comissoesRoutes')
const agendadasRoutes = require('./agendadasRoutes')
const cuponsRoutes = require('./cuponsRoutes')
const membrosRoutes = require('./membrosRoutes')
const diagnosticoRoutes = require('./diagnosticoRoutes')
const perfisRoutes = require('./perfisRoutes')
const onboarding = require('./onboarding')

const JID_RE = /^[0-9A-Za-z._-]+@g\.us$/
const DIAS = [0, 1, 2, 3, 4, 5, 6]
const FONTES = new Set(['api', 'pool', 'misto'])

function licencaAtiva(cfg) {
  if (!cfg || !cfg.license) return false
  return !!cfg.license.active && new Date(cfg.license.expiresAt) > new Date()
}

function falha(res, e, padrao) {
  res.status(e.status || 400).json({ error: e.message || padrao })
}

/**
 * Campos novos do PUT /config. Chamado pelo server.js antes de gravar.
 * Lanca erro 400 com mensagem clara quando o valor e invalido.
 */
function aplicarConfig(cur, body) {
  if (body.ads) {
    cur.ads = cur.ads || {}
    if (Array.isArray(body.ads.days)) {
      const dias = [...new Set(body.ads.days.map(Number).filter((d) => DIAS.includes(d)))].sort()
      if (!dias.length) throw Object.assign(new Error('Escolha pelo menos um dia da semana'), { status: 400 })
      cur.ads.days = dias
    }
    if (body.ads.source != null && FONTES.has(String(body.ads.source))) cur.ads.source = String(body.ads.source)
    if (body.ads.useGeneratedImages != null) cur.ads.useGeneratedImages = !!body.ads.useGeneratedImages
    if (body.ads.poolTtlHours != null) {
      const n = Number(body.ads.poolTtlHours)
      if (Number.isFinite(n)) cur.ads.poolTtlHours = Math.min(168, Math.max(1, Math.round(n)))
    }
    if (body.ads.quality && typeof body.ads.quality === 'object') {
      const q = body.ads.quality
      const num = (v, min, max) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : 0 }
      cur.ads.quality = {
        minDiscount: num(q.minDiscount, 0, 90),
        minRating: num(q.minRating, 0, 5),
        minSales: Math.round(num(q.minSales, 0, 1000000))
      }
    }
    // Disparo v2 (fase 1.4): modo do intervalo e faixas (minimo <= maximo, inteiros)
    if (body.ads.intervalMode != null) {
      if (!['fixo', 'aleatorio'].includes(body.ads.intervalMode)) throw Object.assign(new Error('Modo de intervalo invalido (fixo ou aleatorio).'), { status: 400 })
      cur.ads.intervalMode = body.ads.intervalMode
    }
    const faixa = (nomeMin, nomeMax, min, max, rotulo) => {
      if (body.ads[nomeMin] == null && body.ads[nomeMax] == null) return
      const a0 = body.ads[nomeMin] != null ? body.ads[nomeMin] : cur.ads[nomeMin]
      const b0 = body.ads[nomeMax] != null ? body.ads[nomeMax] : cur.ads[nomeMax]
      if (a0 == null || a0 === '' || b0 == null || b0 === '') throw Object.assign(new Error(rotulo + ': informe o minimo e o maximo.'), { status: 400 })
      const a = Number(a0)
      const b = Number(b0)
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < min || b < min || a > max || b > max) {
        throw Object.assign(new Error(rotulo + ': use numeros inteiros de ' + min + ' a ' + max + '.'), { status: 400 })
      }
      if (a > b) throw Object.assign(new Error(rotulo + ': o minimo nao pode ser maior que o maximo.'), { status: 400 })
      cur.ads[nomeMin] = a
      cur.ads[nomeMax] = b
    }
    faixa('intervalMin', 'intervalMax', 1, 720, 'Intervalo aleatorio (minutos)')
    faixa('perRunMin', 'perRunMax', 1, 10, 'Produtos por execucao')
    // Pausa entre grupos no envio automatico (C1): 0 = sem pausa, como era antes
    faixa('groupPauseMin', 'groupPauseMax', 0, 60, 'Pausa entre grupos (segundos)')
    if (cur.ads.intervalMode === 'aleatorio' && !(Number.isInteger(cur.ads.intervalMin) && Number.isInteger(cur.ads.intervalMax))) {
      throw Object.assign(new Error('Informe o intervalo minimo e maximo (em minutos) para o modo aleatorio.'), { status: 400 })
    }
  }
  if (body.amazon) {
    const tag = String(body.amazon.tag || '').trim()
    if (tag && !amazon.TAG_RE.test(tag)) throw Object.assign(new Error('Tag Amazon invalida (ex.: seunome-20)'), { status: 400 })
    cur.amazon = { tag }
  }
  if (body.mercadolivre) {
    const etiqueta = String(body.mercadolivre.etiqueta || '').trim()
    const toolId = String(body.mercadolivre.toolId || '').replace(/\D/g, '')
    if (etiqueta && !mercadolivre.ETIQUETA_RE.test(etiqueta)) throw Object.assign(new Error('Etiqueta do Mercado Livre invalida'), { status: 400 })
    cur.mercadolivre = { etiqueta, toolId }
  }
}

function desembrulhar(message) {
  let msg = message || {}
  for (let i = 0; i < 3; i++) {
    const dentro = (msg.ephemeralMessage && msg.ephemeralMessage.message) ||
      (msg.viewOnceMessage && msg.viewOnceMessage.message) ||
      (msg.viewOnceMessageV2 && msg.viewOnceMessageV2.message) ||
      (msg.documentWithCaptionMessage && msg.documentWithCaptionMessage.message)
    if (!dentro) break
    msg = dentro
  }
  return msg
}

function textoDe(msg) {
  return msg.conversation || (msg.extendedTextMessage && msg.extendedTextMessage.text) ||
    (msg.imageMessage && msg.imageMessage.caption) || (msg.videoMessage && msg.videoMessage.caption) || ''
}

function mount(app, deps) {
  const { auth, readJson, writeJson, CONFIGS, DATA, logs, sessions, segredo } = deps

  function cfgDe(userId) {
    return readJson(CONFIGS, {})[userId] || null
  }

  function salvarCfg(userId, fn) {
    const configs = readJson(CONFIGS, {})
    const cur = configs[userId]
    if (!cur) throw Object.assign(new Error('Conta nao encontrada'), { status: 404 })
    const out = fn(cur)
    cur.updatedAt = new Date().toISOString()
    configs[userId] = cur
    writeJson(CONFIGS, configs)
    return out
  }

  function ctxDe(req) {
    return { userId: req.user.id, cfg: cfgDe(req.user.id) || {}, dataDir: DATA }
  }

  // --- Nichos e grupos ---

  app.get('/afiliados/resumo', auth, (req, res) => {
    const ctx = ctxDe(req)
    res.json({
      ok: true,
      nichos: nichos.catalogo(),
      cenarios: cenarios.catalogo(),
      marketplaces: conversor.prontos(ctx),
      mercadolivre: oauth.status(DATA, req.user.id),
      imagens: { disponivel: gerador.disponivel() },
      grupos: (ctx.cfg.groups || []).map((g) => ({ jid: g.jid, name: g.name, niche: nichos.normalizar(g.niche), keywords: g.keywords || [] })),
      fontes: ctx.cfg.sources || [],
      disparos: auditoria.resumo(DATA, req.user.id)
    })
  })

  app.post('/whatsapp/groups/nicho', auth, (req, res) => {
    try {
      const body = req.body || {}
      const jid = String(body.jid || '')
      if (!JID_RE.test(jid)) return res.status(400).json({ error: 'Grupo invalido' })
      const pedido = body.niche != null ? nichos.semAcento(body.niche).replace(/[^a-z]/g, '') : null
      if (pedido != null && !nichos.existe(pedido)) return res.status(400).json({ error: 'Nicho invalido' })
      const grupo = salvarCfg(req.user.id, (cur) => {
        const g = (cur.groups || []).find((x) => x.jid === jid)
        if (!g) throw Object.assign(new Error('Marque o grupo na divulgacao antes de escolher o nicho'), { status: 400 })
        if (pedido != null) g.niche = pedido
        if (body.keywords != null) g.keywords = nichos.palavrasExtras(body.keywords)
        return g
      })
      res.json({ ok: true, group: grupo })
    } catch (e) { falha(res, e, 'Falha ao salvar nicho') }
  })

  // Grupos fonte: de onde o bot copia ofertas para o banco. Nunca recebem disparo.
  app.post('/afiliados/fontes', auth, (req, res) => {
    try {
      const lista = Array.isArray(req.body && req.body.groups) ? req.body.groups : []
      const fontes = salvarCfg(req.user.id, (cur) => {
        const destinos = new Set((cur.groups || []).map((g) => g.jid))
        const limpa = lista.map((g) => ({ jid: String(g.jid || '').slice(0, 80), name: String(g.name || g.jid || '').replace(/[<>]/g, '').slice(0, 120) }))
          .filter((g) => JID_RE.test(g.jid)).slice(0, 20)
        const conflito = limpa.find((g) => destinos.has(g.jid))
        if (conflito) throw Object.assign(new Error('"' + conflito.name + '" ja recebe anuncios. Um grupo nao pode ser fonte e destino.'), { status: 400 })
        cur.sources = limpa
        return limpa
      })
      res.json({ ok: true, sources: fontes })
    } catch (e) { falha(res, e, 'Falha ao salvar grupos fonte') }
  })

  // --- Banco de ofertas (coladas ou capturadas) ---

  function midiaUrl(userId, item) {
    if (!item.imagem) return ''
    if (item.imagem.tipo === 'url') return item.imagem.valor
    return imagens.urlAssinada(segredo, userId, 'midia:' + item.imagem.valor, '/ofertas/banco/midia/' + item.imagem.valor)
  }

  app.get('/ofertas/banco', auth, (req, res) => {
    const itens = pool.listar(DATA, req.user.id).map((i) => Object.assign({}, i, { imagemUrl: midiaUrl(req.user.id, i), enviadoPara: undefined }))
    res.json({ ok: true, itens })
  })

  app.post('/ofertas/banco', auth, async (req, res) => {
    try {
      const body = req.body || {}
      const out = await pool.adicionar(DATA, req.user.id, cfgDe(req.user.id), { texto: body.texto, imageUrl: body.imageUrl, origem: 'manual' })
      res.json({ ok: true, item: out.item, duplicado: out.duplicado })
    } catch (e) { falha(res, e, 'Falha ao guardar oferta') }
  })

  app.post('/ofertas/banco/remover', auth, async (req, res) => {
    try {
      await pool.remover(DATA, req.user.id, String((req.body || {}).id || ''))
      res.json({ ok: true })
    } catch (e) { falha(res, e, 'Falha ao remover') }
  })

  app.post('/ofertas/banco/ativo', auth, async (req, res) => {
    try {
      const item = await pool.alternar(DATA, req.user.id, String((req.body || {}).id || ''), (req.body || {}).ativo)
      res.json({ ok: true, item })
    } catch (e) { falha(res, e, 'Falha ao alterar') }
  })

  // Previa sem enviar: mostra o texto com os links ja trocados e o que barrou
  const ultimaPrevia = new Map()
  app.post('/ofertas/previa', auth, async (req, res) => {
    try {
      const agora = Date.now()
      if (agora - (ultimaPrevia.get(req.user.id) || 0) < 3000) return res.status(429).json({ error: 'Espere alguns segundos.' })
      ultimaPrevia.set(req.user.id, agora)
      const body = req.body || {}
      let texto = String(body.texto || '')
      if (body.id) {
        const item = pool.listar(DATA, req.user.id).find((i) => i.id === body.id)
        if (!item) return res.status(404).json({ error: 'Oferta nao encontrada' })
        texto = item.texto
      }
      if (!texto.trim()) return res.status(400).json({ error: 'Cole o texto da oferta' })
      const conv = await conversor.converterTexto(texto.slice(0, 3500), ctxDe(req))
      const nicho = nichos.classificar(texto)
      res.json({ ok: true, previa: conv, nichoProvavel: nicho.nicho })
    } catch (e) { falha(res, e, 'Falha na previa') }
  })

  app.get('/ofertas/banco/midia/:arquivo', (req, res) => {
    const arquivo = String(req.params.arquivo || '')
    const userId = String(req.query.u || '')
    if (!imagens.conferirAssinatura(segredo, userId, 'midia:' + arquivo, req.query.e, req.query.s)) return res.status(403).end()
    const file = pool.caminhoMidia(DATA, userId, arquivo)
    if (!file || !fs.existsSync(file)) return res.status(404).end()
    res.set('Cache-Control', 'private, max-age=3600')
    res.sendFile(file)
  })

  // --- Auditoria ---

  app.get('/afiliados/disparos', auth, (req, res) => {
    const tipo = ['enviado', 'pulado', 'falha'].includes(req.query.tipo) ? req.query.tipo : ''
    res.json({ ok: true, rows: auditoria.listar(DATA, req.user.id, { tipo, limite: req.query.limite }), resumo: auditoria.resumo(DATA, req.user.id) })
  })

  // --- Mercado Livre (OAuth) ---

  app.get('/mercadolivre/status', auth, (req, res) => {
    const cfg = cfgDe(req.user.id) || {}
    res.json(Object.assign({ ok: true }, oauth.status(DATA, req.user.id), { etiqueta: (cfg.mercadolivre && cfg.mercadolivre.etiqueta) || '', toolId: (cfg.mercadolivre && cfg.mercadolivre.toolId) || '' }))
  })

  app.post('/mercadolivre/conectar', auth, (req, res) => {
    try {
      const cfg = cfgDe(req.user.id)
      if (!licencaAtiva(cfg)) return res.status(403).json({ error: 'Licenca expirada ou inativa.' })
      res.json({ ok: true, url: oauth.urlDeConexao(req.user.id) })
    } catch (e) { falha(res, e, 'Falha ao iniciar conexao') }
  })

  app.get('/mercadolivre/callback', async (req, res) => {
    const volta = (q) => res.redirect('/app/#configuracoes/' + q)
    if (req.query.error) {
      oauth.consumirEstado(req.query.state)
      return volta('ml-recusado')
    }
    try {
      const out = await oauth.concluir(DATA, String(req.query.state || ''), String(req.query.code || ''))
      if (logs) logs.append(DATA, out.userId, { source: 'mercadolivre', level: 'info', ok: true, message: 'Mercado Livre conectado' + (out.nickname ? ' (' + out.nickname + ')' : '') + '.' })
      volta('ml-ok')
    } catch (e) {
      console.error('[ML] callback', e.code || '', e.message)
      volta(e.code === 'ML_STATE' ? 'ml-expirado' : 'ml-erro')
    }
  })

  app.post('/mercadolivre/desconectar', auth, async (req, res) => {
    try {
      await oauth.desconectar(DATA, req.user.id)
      res.json({ ok: true })
    } catch (e) { falha(res, e, 'Falha ao desconectar') }
  })

  // --- Imagens por cenario ---

  function comUrl(userId, item) {
    return Object.assign({}, item, { url: imagens.urlAssinada(segredo, userId, item.id), arquivo: undefined })
  }

  app.get('/imagens/produtos', auth, (req, res) => {
    const doBanco = pool.listar(DATA, req.user.id)
      .filter((i) => i.imagem)
      .map((i) => ({ produtoKey: 'pool:' + i.id, nome: i.nome, imageUrl: midiaUrl(req.user.id, i), origem: 'banco' }))
    const daApi = auditoria.produtosRecentes(DATA, req.user.id, 30).map((p) => Object.assign({ origem: 'api' }, p))
    const lista = imagens.listar(DATA, req.user.id)
    res.json({ ok: true, produtos: doBanco.concat(daApi), geradasHoje: lista.geradasHoje, limiteDiario: lista.limiteDiario, disponivel: gerador.disponivel() })
  })

  app.get('/imagens', auth, (req, res) => {
    const key = String(req.query.produtoKey || '')
    const out = imagens.listar(DATA, req.user.id, key)
    res.json({ ok: true, itens: out.itens.map((i) => comUrl(req.user.id, i)), geradasHoje: out.geradasHoje, limiteDiario: out.limiteDiario })
  })

  app.post('/imagens/gerar', auth, async (req, res) => {
    try {
      const cfg = cfgDe(req.user.id)
      if (!licencaAtiva(cfg)) return res.status(403).json({ error: 'Licenca expirada ou inativa.' })
      const body = req.body || {}
      const produtoKey = String(body.produtoKey || '')
      // URL da foto: so a que o proprio servidor conhece para esse produto
      let imageUrl = ''
      if (produtoKey.startsWith('shopee:')) {
        const p = auditoria.produtosRecentes(DATA, req.user.id, 200).find((x) => x.produtoKey === produtoKey)
        if (!p) return res.status(404).json({ error: 'Produto nao encontrado nos envios recentes' })
        imageUrl = p.imageUrl
      }
      const item = await imagens.gerar(DATA, req.user.id, { produtoKey, nome: String(body.nome || '').slice(0, 180), imageUrl, cenario: String(body.cenario || '') })
      if (logs) logs.append(DATA, req.user.id, { source: 'imagens', level: 'info', ok: true, message: 'Imagem gerada (' + cenarios.CENARIOS[item.cenario].label + '): ' + (item.nome || item.produtoKey) })
      res.json({ ok: true, item: comUrl(req.user.id, item) })
    } catch (e) { falha(res, e, 'Falha ao gerar imagem') }
  })

  app.post('/imagens/preferida', auth, async (req, res) => {
    try {
      const item = await imagens.preferir(DATA, req.user.id, String((req.body || {}).id || ''))
      res.json({ ok: true, item: comUrl(req.user.id, item) })
    } catch (e) { falha(res, e, 'Falha ao marcar') }
  })

  app.post('/imagens/remover', auth, async (req, res) => {
    try {
      await imagens.remover(DATA, req.user.id, String((req.body || {}).id || ''))
      res.json({ ok: true })
    } catch (e) { falha(res, e, 'Falha ao remover') }
  })

  app.get('/imagens/arquivo/:id', (req, res) => {
    const id = String(req.params.id || '')
    const userId = String(req.query.u || '')
    if (!imagens.conferirAssinatura(segredo, userId, id, req.query.e, req.query.s)) return res.status(403).end()
    const item = imagens.obter(DATA, userId, id)
    const file = item && imagens.caminho(DATA, userId, item)
    if (!file || !fs.existsSync(file)) return res.status(404).end()
    res.set('Cache-Control', 'private, max-age=3600')
    res.sendFile(file)
  })

  // --- WhatsApp: captura de grupo fonte e comando !nicho ---

  async function responder(sock, jid, text) {
    try { await sock.sendMessage(jid, { text }) } catch (_) {}
  }

  async function comandoNicho(userId, jid, texto, sock) {
    const cfg = cfgDe(userId)
    if (!cfg) return
    const grupo = (cfg.groups || []).find((g) => g.jid === jid)
    const resto = texto.trim().replace(/^!nicho\s*/i, '')
    const lista = nichos.catalogo().map((n) => n.id).join(', ')
    if (!grupo) return responder(sock, jid, 'Este grupo nao esta na divulgacao. Marque ele no painel (Grupos) primeiro.')
    if (!resto) {
      const extras = (grupo.keywords || []).length ? '\nPalavras extras: ' + grupo.keywords.join(', ') : ''
      return responder(sock, jid, 'Nicho deste grupo: *' + nichos.normalizar(grupo.niche) + '*' + extras + '\n\nTrocar: !nicho <nome>\nOpcoes: ' + lista + '\nPalavras extras: !nicho palavras a, b, c')
    }
    if (/^palavras\b/i.test(resto)) {
      const kws = nichos.palavrasExtras(resto.replace(/^palavras\s*/i, ''))
      salvarCfg(userId, (cur) => { const g = (cur.groups || []).find((x) => x.jid === jid); if (g) g.keywords = kws })
      return responder(sock, jid, kws.length ? 'Palavras extras salvas: ' + kws.join(', ') : 'Palavras extras removidas.')
    }
    const pedido = nichos.semAcento(resto.split(/\s+/)[0]).replace(/[^a-z]/g, '')
    if (!nichos.existe(pedido)) return responder(sock, jid, 'Nicho "' + resto.split(/\s+/)[0] + '" nao existe.\nOpcoes: ' + lista)
    salvarCfg(userId, (cur) => { const g = (cur.groups || []).find((x) => x.jid === jid); if (g) g.niche = pedido })
    if (logs) logs.append(DATA, userId, { source: 'anuncio', level: 'info', ok: true, group: grupo.name, jid, message: 'Nicho trocado pelo WhatsApp para ' + pedido + '.' })
    return responder(sock, jid, 'Pronto. Este grupo agora so recebe ofertas de *' + nichos.NICHOS[pedido].label + '*.')
  }

  // Diagnostico da captura nos Logs: no maximo 1 linha por grupo+motivo a cada 10 min
  const ultimoAviso = new Map()
  function avisarCaptura(userId, fonte, motivo, message, extra = {}) {
    const chave = userId + '|' + fonte.jid + '|' + motivo
    const agora = Date.now()
    if (motivo !== 'ok' && agora - (ultimoAviso.get(chave) || 0) < 600000) return
    ultimoAviso.set(chave, agora)
    if (logs) logs.append(DATA, userId, Object.assign({ source: 'captura', level: 'info', group: fonte.name, jid: fonte.jid, message }, extra))
  }

  async function capturar(userId, m, cfg, msg, texto) {
    const jid = m.key.remoteJid
    const fonte = (cfg.sources || []).find((g) => g.jid === jid)
    if (!fonte) return
    if (!licencaAtiva(cfg)) return avisarCaptura(userId, fonte, 'licenca', 'Captura parada: licenca inativa.', { level: 'warn', ok: false })
    if (!links.extrairUrls(texto).some((u) => links.marketplaceDe(u.url))) {
      return avisarCaptura(userId, fonte, 'semlink', 'Mensagem ignorada: sem link da Shopee, Mercado Livre ou Amazon.')
    }
    let imagemBuffer = null
    if (msg.imageMessage) {
      try {
        const { downloadMediaMessage } = require('@whiskeysockets/baileys')
        imagemBuffer = await downloadMediaMessage({ key: m.key, message: msg }, 'buffer', {})
      } catch (e) {
        console.error('[CAPTURA] imagem', e.message)
      }
    }
    try {
      const out = await pool.adicionar(DATA, userId, cfg, { texto, imagemBuffer, imagemExt: 'jpg', origem: 'grupo', origemGrupo: fonte.name })
      if (out && out.duplicado) avisarCaptura(userId, fonte, 'repetida', 'Oferta repetida: ja estava no banco.')
      else avisarCaptura(userId, fonte, 'ok', 'Oferta capturada: ' + ((out && out.item && out.item.nome) || 'sem titulo'), { ok: true })
    } catch (e) {
      if (e.status !== 400) console.error('[CAPTURA]', e.message)
      avisarCaptura(userId, fonte, 'erro', 'Falha ao guardar oferta: ' + (e.message || 'erro'), { level: 'warn', ok: false })
    }
  }

  // Ofertas que chegaram com o painel desligado (type 'append') entram se forem recentes
  const RECENTE_MS = 6 * 3600 * 1000
  // Mesma mensagem pode chegar 2x (ilegivel e depois recuperada pelo reenvio): processa 1x
  const vistas = new Map()
  function jaVista(userId, m) {
    const id = String((m.key && m.key.id) || '')
    if (!id) return false
    let s = vistas.get(userId)
    if (!s) { s = new Set(); vistas.set(userId, s) }
    if (s.has(id)) return true
    s.add(id)
    if (s.size > 5000) s.delete(s.values().next().value)
    return false
  }

  if (sessions && typeof sessions.onMensagem === 'function') {
    sessions.onMensagem(async (userId, m, sock, type) => {
      const jid = String((m.key && m.key.remoteJid) || '')
      if (!jid.endsWith('@g.us')) return
      const ts = Number(m.messageTimestamp) * 1000
      const recente = !ts || Date.now() - ts < RECENTE_MS
      if (type !== 'notify' && !m.key.fromMe && !recente) return
      const cfg = cfgDe(userId)
      const fonte = cfg && (cfg.sources || []).find((g) => g.jid === jid)
      // Chegou sem conteudo legivel: o Baileys pede reenvio ao remetente sozinho
      // (precisa da memoria em api/memoria.js); se recuperar, chega de novo aqui
      if (!m.message) {
        if (fonte && !m.key.fromMe) avisarCaptura(userId, fonte, 'ilegivel', 'Mensagem chegou ilegivel; pedindo reenvio ao remetente. Se recuperar, entra no banco sozinha.', { level: 'warn', ok: false })
        return
      }
      if (jaVista(userId, m)) return
      const msg = desembrulhar(m.message)
      const texto = String(textoDe(msg) || '')
      if (!texto) return
      // Comando so do dono da conta (mensagem enviada pelo proprio numero), e recente
      if (m.key.fromMe) {
        if (/^!nicho\b/i.test(texto.trim()) && (!ts || Date.now() - ts < 120000)) await comandoNicho(userId, jid, texto, sock)
        else if (fonte) avisarCaptura(userId, fonte, 'fromme', 'Mensagem ignorada: foi enviada pelo seu proprio numero (o bot so copia ofertas de outras pessoas).')
        return
      }
      if (fonte) await capturar(userId, m, cfg, msg, texto)
    })
  }

  // Conversor de link (Fase 1.1)
  linkRoutes.mount(app, { auth, readJson, CONFIGS, DATA, logs })
  // Fila de produtos (Fase 1.2)
  produtosRoutes.mount(app, { auth, readJson, CONFIGS, DATA }, { midiaUrl })
  // Vitrine de ofertas (Fase 1.3)
  vitrineRoutes.mount(app, { auth, readJson, CONFIGS, DATA, logs, sessions })
  // Executar agora (Fase 1.4)
  automacoesRoutes.mount(app, { auth, readJson, writeJson, CONFIGS, DATA, logs })
  // Mensagem das ofertas: modelo e IA (Fase 1.5a)
  copyRoutes.mount(app, { auth, readJson, writeJson, CONFIGS, DATA })
  comissoesRoutes.mount(app, { auth, readJson, writeJson, CONFIGS, DATA })
  agendadasRoutes.mount(app, { auth, readJson, writeJson, CONFIGS, DATA, logs, sessions })
  cuponsRoutes.mount(app, { auth, readJson, CONFIGS, DATA })
  membrosRoutes.mount(app, { auth, readJson, writeJson, CONFIGS, DATA, sessions })
  diagnosticoRoutes.mount(app, { auth, readJson, CONFIGS, DATA, sessions })
  perfisRoutes.mount(app, { auth, readJson, CONFIGS })
  onboarding.mount(app, { auth, readJson, CONFIGS, DATA, sessions })

  return { aplicarConfig }
}

module.exports = { mount, aplicarConfig, desembrulhar, textoDe }
