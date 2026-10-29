/**
 * Rotas de vídeo. userId só do JWT; vale para todos os planos com licença ativa.
 *
 * Baixador (Shopee/Pinterest pela página pública; YouTube pelo yt-dlp, se estiver instalado):
 *   POST /videos/info                 { url } -> { id, plataforma, rotulo, titulo, capa, nome }
 *   POST /videos/baixar               { id }  -> o MP4 para o aparelho (uso único)
 *   POST /videos/salvar               { id }  -> guarda o MP4 na biblioteca (uso único)
 * Biblioteca:
 *   GET  /videos/biblioteca                    itens + uso + URL assinada de pré-visualização
 *   POST /videos/biblioteca           (corpo = o arquivo; header X-Nome-Arquivo) -> envia um vídeo
 *   POST /videos/biblioteca/remover   { id }   (as ofertas que usavam voltam para a imagem)
 *   GET  /videos/biblioteca/arquivo/:id?u&e&s  pré-visualização (URL assinada, 1 h)
 * Oferta:
 *   POST /ofertas/banco/video         { itemId, videoId|null }
 */
const videos = require('./videos')
const ytdlp = require('./ytdlp')
const biblioteca = require('./videosBiblioteca')
const pool = require('./pool')
const imagens = require('./imagens/store')
const { criarLimitador } = require('./linkRoutes')

const licencaAtiva = (cfg) => !!(cfg && cfg.license && cfg.license.active && new Date(cfg.license.expiresAt) > new Date())
const TIPOS_UPLOAD = /^(video\/(mp4|quicktime|x-m4v)|application\/octet-stream)$/i

function mount(app, deps, opcoes = {}) {
  const { auth, readJson, CONFIGS, DATA, segredo } = deps
  const podeLer = criarLimitador(opcoes.leiturasPorMin || 20, 60 * 1000)
  const podeBaixar = criarLimitador(opcoes.downloadsPorHora || 40, 60 * 60 * 1000)
  const podeEnviar = criarLimitador(opcoes.uploadsPorHora || 30, 60 * 60 * 1000)
  const podeAlterar = criarLimitador(opcoes.alteracoesPorMin || 30, 60 * 1000)
  const podeYt = criarLimitador(opcoes.youtubePorHora || 12, 60 * 60 * 1000)
  const falha = (res, e, padrao) => {
    if (res.headersSent) return res.destroy()
    res.status(e.status && e.status < 600 ? e.status : 500).json({ error: e.message || padrao })
  }
  const conta = (req, res) => {
    const cfg = readJson(CONFIGS, {})[req.user.id]
    if (!cfg) { res.status(404).json({ error: 'Conta não encontrada' }); return null }
    if (!licencaAtiva(cfg)) { res.status(402).json({ error: 'Sua licença venceu. Renove em Configurações para usar os vídeos.', upgrade: true }); return null }
    return cfg
  }
  const urlPrevia = (userId, id) => imagens.urlAssinada(segredo, userId, 'video:' + id, '/videos/biblioteca/arquivo/' + id)
  const comUso = (userId) => {
    const ofertas = pool.listar(DATA, userId)
    return {
      itens: biblioteca.listar(DATA, userId).map((v) => Object.assign({}, v, {
        url: urlPrevia(userId, v.id),
        ofertas: ofertas.filter((o) => o.video && o.video.id === v.id).map((o) => ({ id: o.id, nome: o.nome }))
      })),
      uso: biblioteca.uso(DATA, userId)
    }
  }
  const lerPedido = async (userId, url) => {
    const link = String(url || '')
    if (videos.detectar(link)) return videos.info(userId, link)
    if (ytdlp.detectar(link)) return ytdlp.info(userId, link)
    throw Object.assign(new Error('Cole um link de vídeo da Shopee, do Pinterest ou do YouTube.'), { status: 400 })
  }
  const abrirPedido = (userId, id) => (ytdlp.tem(id) ? ytdlp.abrir(userId, id) : videos.abrir(userId, id))

  // ---------------------------------------------------------------- baixador

  app.post('/videos/info', auth, async (req, res) => {
    try {
      if (!conta(req, res)) return
      if (!podeLer(req.user.id)) return res.status(429).json({ error: 'Muitos links seguidos. Espere um minuto.' })
      const url = (req.body || {}).url
      if (ytdlp.detectar(url) && !podeYt(req.user.id)) return res.status(429).json({ error: 'Você chegou ao limite de vídeos do YouTube nesta hora. Tente mais tarde.' })
      res.json(Object.assign({ ok: true }, await lerPedido(req.user.id, url)))
    } catch (e) { falha(res, e, 'Não consegui ler o link') }
  })

  app.post('/videos/baixar', auth, async (req, res) => {
    try {
      if (!conta(req, res)) return
      if (!podeBaixar(req.user.id)) return res.status(429).json({ error: 'Você chegou ao limite de 40 downloads por hora. Tente mais tarde.' })
      const v = await abrirPedido(req.user.id, (req.body || {}).id)
      res.set('Content-Type', v.tipo)
      res.set('Content-Disposition', 'attachment; filename="' + v.nome + '"')
      res.set('Cache-Control', 'no-store')
      res.set('X-Content-Type-Options', 'nosniff')
      if (v.tamanho) res.set('Content-Length', String(v.tamanho))
      // Sem Content-Length confiável, corta se passar do limite enquanto repassa
      let total = 0
      v.stream.on('data', (parte) => {
        total += parte.length
        if (total > videos.MAX_VIDEO) v.stream.destroy(new Error('limite'))
      })
      v.stream.on('error', () => { if (!res.headersSent) res.status(502).end(); else res.destroy() })
      req.on('close', () => v.stream.destroy())
      v.stream.pipe(res)
    } catch (e) { falha(res, e, 'Não consegui baixar o vídeo') }
  })

  app.post('/videos/salvar', auth, async (req, res) => {
    let v
    try {
      if (!conta(req, res)) return
      if (!podeBaixar(req.user.id)) return res.status(429).json({ error: 'Você chegou ao limite de 40 downloads por hora. Tente mais tarde.' })
      v = await abrirPedido(req.user.id, (req.body || {}).id)
      const item = await biblioteca.salvar(DATA, req.user.id, v.stream, { nome: (req.body || {}).nome || v.nome, origem: v.plataforma, tamanhoDeclarado: v.tamanho })
      res.json(Object.assign({ ok: true, item }, comUso(req.user.id)))
    } catch (e) {
      if (v && v.stream) v.stream.destroy()
      falha(res, e, 'Não consegui salvar o vídeo')
    }
  })

  // ---------------------------------------------------------------- biblioteca

  app.get('/videos/biblioteca', auth, (req, res) => {
    try {
      if (!conta(req, res)) return
      res.json(Object.assign({ ok: true }, comUso(req.user.id)))
    } catch (e) { falha(res, e, 'Falha ao ler os vídeos') }
  })

  // O corpo é o próprio arquivo (sem multipart nem dependência nova); só o express.json da app
  // olha application/json, então o stream chega intacto aqui.
  app.post('/videos/biblioteca', auth, async (req, res) => {
    try {
      if (!conta(req, res)) return req.resume()
      if (!TIPOS_UPLOAD.test(String(req.get('content-type') || '').split(';')[0].trim())) {
        req.resume()
        return res.status(415).json({ error: 'Envie um vídeo MP4 (ou .mov do iPhone).' })
      }
      if (!podeEnviar(req.user.id)) { req.resume(); return res.status(429).json({ error: 'Muitos envios nesta hora. Tente mais tarde.' }) }
      req.setTimeout(10 * 60 * 1000)
      let nome = ''
      try { nome = decodeURIComponent(String(req.get('x-nome-arquivo') || '')).replace(/\.(mp4|mov|m4v)$/i, '') } catch {}
      const item = await biblioteca.salvar(DATA, req.user.id, req, { nome, origem: 'upload', tamanhoDeclarado: Number(req.get('content-length')) || 0 })
      res.json(Object.assign({ ok: true, item }, comUso(req.user.id)))
    } catch (e) {
      req.resume()
      falha(res, e, 'Não consegui receber o vídeo')
    }
  })

  app.post('/videos/biblioteca/remover', auth, async (req, res) => {
    try {
      if (!conta(req, res)) return
      if (!podeAlterar(req.user.id)) return res.status(429).json({ error: 'Muitas alterações seguidas. Espere um minuto.' })
      const id = String((req.body || {}).id || '')
      await biblioteca.remover(DATA, req.user.id, id)
      const soltas = await pool.soltarVideo(DATA, req.user.id, id)
      res.json(Object.assign({ ok: true, ofertasSemVideo: soltas }, comUso(req.user.id)))
    } catch (e) { falha(res, e, 'Não consegui apagar o vídeo') }
  })

  // Sem JWT no <video src>: a URL assinada (HMAC, 1 h) amarra o arquivo ao dono
  app.get('/videos/biblioteca/arquivo/:id', (req, res) => {
    const id = String(req.params.id || '')
    const userId = String(req.query.u || '')
    if (!imagens.conferirAssinatura(segredo, userId, 'video:' + id, req.query.e, req.query.s)) return res.status(403).end()
    const file = biblioteca.caminho(DATA, userId, id)
    if (!file) return res.status(404).end()
    res.set('Cache-Control', 'private, max-age=3600')
    res.set('X-Content-Type-Options', 'nosniff')
    res.type('video/mp4')
    res.sendFile(file) // aceita Range: o player pula para qualquer ponto
  })

  // ---------------------------------------------------------------- oferta

  app.post('/ofertas/banco/video', auth, async (req, res) => {
    try {
      if (!conta(req, res)) return
      if (!podeAlterar(req.user.id)) return res.status(429).json({ error: 'Muitas alterações seguidas. Espere um minuto.' })
      const b = req.body || {}
      const videoId = b.videoId ? String(b.videoId) : null
      if (videoId && !biblioteca.obter(DATA, req.user.id, videoId)) return res.status(404).json({ error: 'Vídeo não encontrado na sua biblioteca.' })
      const item = await pool.definirVideo(DATA, req.user.id, String(b.itemId || ''), videoId)
      res.json(Object.assign({ ok: true, oferta: { id: item.id, nome: item.nome, video: item.video || null } }, comUso(req.user.id)))
    } catch (e) { falha(res, e, 'Não consegui associar o vídeo') }
  })
}

module.exports = { mount }
