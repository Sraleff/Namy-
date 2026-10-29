const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const videos = require('./videos')
const videosRoutes = require('./videosRoutes')

const MP4 = 'https://down-tx-br.vod.susercontent.com/api/v4/1/mms/br-1-abc.mp4'
const PAGINA_SHOPEE = '<html><head><meta property="og:title" content="loja__ on Shopee Video"/>' +
  '<meta property="og:image" content="https://mms.img.susercontent.com/capa.jpg"/></head>' +
  '<body><script>{"url":"' + MP4.replace(/\//g, '\\u002F') + '"}</script></body></html>'
const PAGINA_PIN = '<meta property="og:title" content="Bolo de pote"><meta property="og:video" content="https://v1.pinimg.com/videos/mc/hls/ab.m3u8">' +
  '<script>"V_HLSV4":{"url":"https://v1.pinimg.com/videos/mc/hls/ab.m3u8"},"V_720P":{"url":"https://v1.pinimg.com/videos/mc/720p/ab.mp4"},"V_240P":{"url":"https://v1.pinimg.com/videos/mc/240p/ab.mp4"}</script>'

// Troca o "fetch seguro" por respostas prontas; guarda o que foi pedido
function falso(rotas) {
  const pedidos = []
  videos._dep.buscar = async (url, op) => {
    pedidos.push({ url, op })
    const r = rotas[url]
    if (!r) throw Object.assign(new Error('não esperado: ' + url), { status: 500 })
    return { url, status: r.status || 200, response: new Response(r.corpo, { status: r.status || 200, headers: r.headers || {} }) }
  }
  return pedidos
}
test.beforeEach(() => videos._pendentes.clear())

test('detectar: só https de Shopee e Pinterest; host parecido não engana', () => {
  assert.equal(videos.detectar('https://sv.shopee.com.br/share-video/abc'), 'shopee')
  assert.equal(videos.detectar('https://shp.ee/xyz'), 'shopee')
  assert.equal(videos.detectar('https://br.pinterest.com/pin/123/'), 'pinterest')
  assert.equal(videos.detectar('https://pin.it/abc'), 'pinterest')
  for (const ruim of ['http://sv.shopee.com.br/share-video/abc', 'https://shopee.com.br.golpe.com/x', 'https://evilpinterest.com/pin/1', 'https://www.youtube.com/watch?v=1', 'javascript:alert(1)', '', null]) {
    assert.equal(videos.detectar(ruim), null, String(ruim))
  }
})

test('videoDoHtml: acha o MP4 da Shopee e prefere 720p no Pinterest; ignora m3u8 e domínio de fora', () => {
  const s = videos.videoDoHtml('shopee', PAGINA_SHOPEE)
  assert.equal(s.video, MP4)
  assert.equal(s.titulo, 'loja__ on Shopee Video')
  assert.equal(s.capa, 'https://mms.img.susercontent.com/capa.jpg')
  assert.equal(videos.videoDoHtml('pinterest', PAGINA_PIN).video, 'https://v1.pinimg.com/videos/mc/720p/ab.mp4')
  assert.equal(videos.videoDoHtml('shopee', '<script>"https://cdn.golpe.com/v.mp4"</script>'), null, 'MP4 fora do domínio da Shopee não vale')
  assert.equal(videos.videoDoHtml('pinterest', '<meta property="og:video" content="https://v1.pinimg.com/x.m3u8">'), null)
})

test('info + abrir: id de uso único, só do próprio usuário, só busca no domínio de vídeo', async () => {
  const link = 'https://sv.shopee.com.br/share-video/abc'
  const pedidos = falso({
    [link]: { corpo: PAGINA_SHOPEE },
    [MP4]: { corpo: 'MP4FALSO', headers: { 'content-type': 'video/mp4', 'content-length': '8' } }
  })
  const i = await videos.info('u1', link)
  assert.match(i.id, /^[0-9a-f]{24}$/)
  assert.equal(i.plataforma, 'shopee')
  assert.equal(JSON.stringify(i).includes('susercontent.com/api'), false, 'o endereço do vídeo não vai para o navegador')
  assert.deepEqual(pedidos[0].op.hostsPermitidos, videos.PLATAFORMAS.shopee.paginas)
  await assert.rejects(videos.abrir('u2', i.id), /não é seu/, 'outro usuário não usa o id')
  const v = await videos.abrir('u1', i.id)
  assert.deepEqual(pedidos[1].op.hostsPermitidos, ['susercontent.com'])
  let corpo = ''
  for await (const parte of v.stream) corpo += parte
  assert.equal(corpo, 'MP4FALSO')
  assert.match(v.nome, /^namy-shopee-[0-9a-f]{8}\.mp4$/)
  await assert.rejects(videos.abrir('u1', i.id), /expirou/, 'uso único')
})

test('abrir: id inventado, expirado, resposta que não é vídeo e arquivo grande demais', async () => {
  await assert.rejects(videos.abrir('u1', '../../etc/passwd'), /inválido/)
  await assert.rejects(videos.abrir('u1', 'a'.repeat(24)), /expirou/)
  const link = 'https://sv.shopee.com.br/share-video/abc'
  falso({ [link]: { corpo: PAGINA_SHOPEE }, [MP4]: { corpo: '<html>', headers: { 'content-type': 'text/html' } } })
  const a = await videos.info('u1', link)
  await assert.rejects(videos.abrir('u1', a.id), /não devolveu um vídeo/)
  const b = await videos.info('u1', link, Date.now() - 11 * 60 * 1000)
  await assert.rejects(videos.abrir('u1', b.id), /expirou/)
  falso({ [link]: { corpo: PAGINA_SHOPEE }, [MP4]: { corpo: 'x', headers: { 'content-type': 'video/mp4', 'content-length': String(videos.MAX_VIDEO + 1) } } })
  const c = await videos.info('u1', link)
  await assert.rejects(videos.abrir('u1', c.id), /grande demais/)
})

test('info: link de fora, página sem vídeo e vídeo removido dão mensagem clara', async () => {
  await assert.rejects(videos.info('u1', 'https://www.youtube.com/watch?v=1'), /Shopee ou do Pinterest/)
  const link = 'https://sv.shopee.com.br/share-video/vazio'
  falso({ [link]: { corpo: '<html>nada</html>' } })
  await assert.rejects(videos.info('u1', link), /Não achei um vídeo/)
  falso({ [link]: { corpo: '', status: 404 } })
  await assert.rejects(videos.info('u1', link), /não existe mais/)
})

test('rotas: sem login 401, licença vencida 402, isolamento entre contas e limite por minuto', async () => {
  const link = 'https://sv.shopee.com.br/share-video/abc'
  falso({ [link]: { corpo: PAGINA_SHOPEE }, [MP4]: { corpo: 'MP4FALSO', headers: { 'content-type': 'video/mp4' } } })
  const exp = (d) => new Date(Date.now() + d * 864e5).toISOString()
  const CONFIGS = { u1: { license: { active: true, expiresAt: exp(1) } }, u2: { license: { active: true, expiresAt: exp(1) } }, u3: { license: { active: true, expiresAt: exp(-1) } } }
  const app = express()
  app.use(express.json())
  const auth = (req, res, next) => (req.get('x-user') ? ((req.user = { id: req.get('x-user') }), next()) : res.status(401).json({ error: 'login' }))
  videosRoutes.mount(app, { auth, readJson: () => CONFIGS, CONFIGS: 'x' }, { leiturasPorMin: 3 })
  const srv = app.listen(0)
  const base = 'http://127.0.0.1:' + srv.address().port
  const post = (p, body, user) => fetch(base + p, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, user ? { 'x-user': user } : {}), body: JSON.stringify(body) })
  try {
    assert.equal((await post('/videos/info', { url: link })).status, 401)
    assert.equal((await post('/videos/info', { url: link }, 'u3')).status, 402)
    const r = await post('/videos/info', { url: link }, 'u1')
    assert.equal(r.status, 200)
    const { id } = await r.json()
    assert.equal((await post('/videos/baixar', { id }, 'u2')).status, 404, 'conta B não baixa o pedido da conta A')
    const d = await post('/videos/baixar', { id }, 'u1')
    assert.equal(d.status, 200)
    assert.match(d.headers.get('content-disposition'), /attachment; filename="namy-shopee-/)
    assert.equal(await d.text(), 'MP4FALSO')
    await post('/videos/info', { url: link }, 'u1')
    await post('/videos/info', { url: link }, 'u1')
    assert.equal((await post('/videos/info', { url: link }, 'u1')).status, 429)
  } finally { srv.close() }
})
