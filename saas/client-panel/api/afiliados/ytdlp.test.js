const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const express = require('express')
const ytdlp = require('./ytdlp')
const videos = require('./videos')
const biblioteca = require('./videosBiblioteca')
const videosRoutes = require('./videosRoutes')

const URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc1234567890'
const MP4URL = 'https://rr3---sn.googlevideo.com/videoplayback?id=segredo'
const JSON_OK = JSON.stringify({
  title: 'Fone bluetooth',
  thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
  duration: 42,
  webpage_url: URL,
  formats: [
    { ext: 'mp4', vcodec: 'avc1', acodec: 'mp4a', filesize: 8000, url: MP4URL },
    { ext: 'webm', vcodec: 'vp9', acodec: 'opus', filesize: 9000, url: MP4URL }
  ]
})
const mp4 = (n = 2048, marca = 'isom') => Buffer.concat([
  Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftyp' + marca, 'latin1'), Buffer.alloc(Math.max(0, n - 12), 7)
])

function preparar(responder) {
  const pedidos = []
  ytdlp._reset()
  ytdlp._dep.binario = null
  ytdlp._dep.disponivel = async () => true
  ytdlp._dep.resolver = async () => [{ address: '142.250.219.14', family: 4 }]
  ytdlp._dep.executar = async (args, op) => {
    pedidos.push({ args, op })
    if (responder) return responder(args, op, pedidos)
    return { code: 0, stdout: JSON_OK, stderr: '' }
  }
  return pedidos
}
test.beforeEach(() => preparar())

test('detectar: só https dos hosts do YouTube; parecido e playlist vazia não viram arquivo', () => {
  assert.equal(ytdlp.detectar('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'youtube')
  assert.equal(ytdlp.detectar('https://youtu.be/dQw4w9WgXcQ'), 'youtube')
  assert.equal(ytdlp.detectar('https://m.youtube.com/shorts/dQw4w9WgXcQ'), 'youtube')
  assert.equal(ytdlp.detectar('https://music.youtube.com/watch?v=dQw4w9WgXcQ'), 'youtube')
  assert.equal(ytdlp.detectar('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'), 'youtube')
  for (const ruim of [
    'http://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://notyoutube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ',
    'https://evil.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://sv.shopee.com.br/share-video/abc',
    'javascript:alert(1)',
    '',
    null
  ]) assert.equal(ytdlp.detectar(ruim), null, String(ruim))
  assert.equal(ytdlp.detectar('https://www.youtube.com/watch?v=ab'), 'youtube', 'host do YouTube cai neste módulo; o id curto é recusado no info')
})

test('o programa roda com argumentos em lista, sem shell, sem cookie e sem a URL de playlist', () => {
  const info = ytdlp.argsInfo('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  const baixar = ytdlp.argsBaixar('https://youtu.be/dQw4w9WgXcQ')
  for (const args of [info, baixar]) {
    assert.ok(Array.isArray(args))
    assert.equal(args.at(-2), '--')
    assert.equal(args.includes('--ignore-config'), true)
    assert.equal(args.includes('--no-playlist'), true)
    for (const proibido of ['--cookies', '--cookies-from-browser', '--username', '--password', '--netrc', '--exec']) {
      assert.equal(args.includes(proibido), false, proibido)
    }
  }
  const src = fs.readFileSync(path.join(__dirname, 'ytdlp.js'), 'utf8')
  assert.match(src, /shell:\s*false/)
  assert.doesNotMatch(src, /child_process['"]\)\.exec\(/)
  assert.doesNotMatch(src, /--cookies/)
})

test('info: id de uso único, capa só de host de miniatura, e a URL do arquivo não sai', async () => {
  const pedidos = preparar()
  const i = await ytdlp.info('u1', URL)
  assert.match(i.id, /^[0-9a-f]{24}$/)
  assert.equal(i.plataforma, 'youtube')
  assert.equal(i.titulo, 'Fone bluetooth')
  assert.match(i.capa, /^https:\/\/i\.ytimg\.com\//)
  const texto = JSON.stringify(i)
  assert.equal(texto.includes('googlevideo'), false)
  assert.equal(texto.includes('videoplayback'), false)
  assert.equal(texto.includes('list='), false)
  assert.equal(texto.includes('watch?v='), false)
  assert.equal(pedidos[0].args.at(-2), '--')
  assert.equal(pedidos[0].args.at(-1).includes('list='), false)
  assert.equal(pedidos[0].args.at(-1).startsWith('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), true)
  await assert.rejects(ytdlp.abrir('u2', i.id), /não é seu/)
})

test('info: host interno, programa ausente, erro do yt-dlp e tempo esgotado não vazam a URL', async () => {
  const pedidos = preparar()
  ytdlp._dep.resolver = async () => [{ address: '169.254.169.254' }]
  await assert.rejects(ytdlp.info('u1', URL), (e) => e.message === 'Host não permitido.' && e.status === 400)
  assert.equal(pedidos.length, 0, 'não chama o programa se o DNS não é público')

  preparar()
  ytdlp._dep.disponivel = async () => false
  await assert.rejects(ytdlp.info('u1', URL), (e) => e.status === 503 && e.message.includes('não está instalado') && !e.message.includes('youtube.com'))

  preparar()
  ytdlp._dep.executar = async () => { throw Object.assign(new Error('spawn yt-dlp ' + URL), { code: 'ENOENT' }) }
  await assert.rejects(ytdlp.info('u1', URL), (e) => e.status === 503 && !e.message.includes('dQw4w9WgXcQ'))

  preparar()
  ytdlp._dep.executar = async () => ({ code: 1, stdout: '', stderr: 'ERROR: ' + URL + ' Private video' })
  await assert.rejects(ytdlp.info('u1', URL), (e) => {
    assert.match(e.message, /privado/)
    assert.equal(e.message.includes('youtube.com'), false)
    assert.equal(e.message.includes(MP4URL), false)
    return true
  })

  preparar()
  ytdlp._dep.executar = async () => { throw Object.assign(new Error('timeout ' + URL), { killed: true }) }
  await assert.rejects(ytdlp.info('u1', URL), (e) => e.status === 504 && !e.message.includes('dQw4w9WgXcQ'))

  preparar()
  ytdlp._dep.executar = async () => ({ code: 1, stdout: '', stderr: 'Sign in to confirm your age ' + URL })
  await assert.rejects(ytdlp.info('u1', URL), (e) => e.status === 422 && /login ou confirmação/.test(e.message) && !e.message.includes('youtube.com'))
})

test('info: playlist, ao vivo, vídeo longo e MP4 acima de 64 MB', async () => {
  await assert.rejects(ytdlp.info('u1', 'https://www.youtube.com/playlist?list=PLabc1234567890'), /não é de um vídeo/)
  await assert.rejects(ytdlp.info('u1', 'https://www.youtube.com/@loja'), /não é de um vídeo/)
  await assert.rejects(ytdlp.info('u1', 'https://www.youtube.com/watch?v=ab'), /não é de um vídeo/)
  const casos = [
    [{ title: 'Ao vivo', is_live: true, duration: 10 }, /ao vivo/],
    [{ title: 'Longo', duration: 21 * 60 }, /20 minutos/],
    [{ title: 'Pesado', duration: 30, formats: [{ ext: 'mp4', vcodec: 'avc1', acodec: 'mp4a', filesize: biblioteca.LIMITES.arquivo + 5 }] }, /grande demais/]
  ]
  for (const [meta, re] of casos) {
    preparar()
    ytdlp._dep.executar = async () => ({ code: 0, stdout: JSON.stringify(meta), stderr: '' })
    await assert.rejects(ytdlp.info('u1', 'https://youtu.be/dQw4w9WgXcQ'), re)
  }
})

test('abrir: grava na pasta da conta, confere o MP4, apaga a pasta e o id é de uso único', async () => {
  let dir = ''
  preparar((args, op) => {
    if (args.includes('--skip-download')) return { code: 0, stdout: JSON_OK, stderr: '' }
    dir = op.cwd
    assert.equal(args.at(-2), '--')
    assert.equal(String(args.at(-1)).includes('list='), false)
    fs.writeFileSync(path.join(op.cwd, 'video.mp4'), mp4(5000))
    fs.writeFileSync(path.join(op.cwd, 'video.mp4.part'), Buffer.from('parcial'))
    return { code: 0, stdout: '', stderr: 'ERROR log ' + URL }
  })
  const i = await ytdlp.info('u1', URL)
  const v = await ytdlp.abrir('u1', i.id)
  assert.equal(v.plataforma, 'youtube')
  assert.equal(v.tamanho, 5000)
  assert.match(v.nome, /^namy-youtube-[0-9a-f]{8}\.mp4$/)
  let corpo = Buffer.alloc(0)
  for await (const parte of v.stream) corpo = Buffer.concat([corpo, parte])
  assert.equal(corpo.length, 5000)
  assert.equal(biblioteca.formatoDe(corpo), 'mp4')
  assert.equal(fs.existsSync(dir), false, 'pasta temporária some depois de ler')
  await assert.rejects(ytdlp.abrir('u1', i.id), /expirou/)
})

test('abrir: arquivo que não é vídeo ou passa de 64 MB não fica em disco', async () => {
  let dir = ''
  const gravar = (buf) => async (args, op) => {
    if (args.includes('--skip-download')) return { code: 0, stdout: JSON_OK, stderr: '' }
    dir = op.cwd
    fs.writeFileSync(path.join(op.cwd, 'video.mp4'), buf)
    return { code: 0, stdout: '', stderr: '' }
  }
  preparar()
  ytdlp._dep.executar = gravar(Buffer.from('MZ isto não é vídeo, só texto'))
  const a = await ytdlp.info('u1', 'https://youtu.be/dQw4w9WgXcQ')
  await assert.rejects(ytdlp.abrir('u1', a.id), /não é um vídeo MP4/)
  assert.equal(fs.existsSync(dir), false)

  const { LIMITES } = biblioteca
  const antes = LIMITES.arquivo
  LIMITES.arquivo = 1000
  try {
    preparar()
    ytdlp._dep.executar = async (args, op) => {
      if (args.includes('--skip-download')) return { code: 0, stdout: JSON.stringify({ title: 'P', duration: 3 }), stderr: '' }
      dir = op.cwd
      fs.writeFileSync(path.join(op.cwd, 'video.mp4'), mp4(4000))
      return { code: 0, stdout: '', stderr: '' }
    }
    const b = await ytdlp.info('u1', 'https://youtu.be/dQw4w9WgXcQ')
    await assert.rejects(ytdlp.abrir('u1', b.id), /grande demais/)
    assert.equal(fs.existsSync(dir), false)
  } finally { LIMITES.arquivo = antes }
})

test('um download por conta e dois no servidor', async () => {
  const soltar = []
  preparar()
  ytdlp._dep.executar = () => new Promise((ok) => { soltar.push(ok) })
  const p1 = ytdlp.info('u1', 'https://youtu.be/dQw4w9WgXcQ')
  await assert.rejects(ytdlp.info('u1', 'https://youtu.be/dQw4w9WgXcQ'), /Já tem um vídeo/)
  const p2 = ytdlp.info('u2', 'https://youtu.be/dQw4w9WgXcQ')
  await new Promise((resolve, reject) => {
    const t = setInterval(() => { if (soltar.length >= 2) { clearInterval(t); resolve() } }, 5)
    setTimeout(() => { clearInterval(t); reject(new Error('não ocupou')) }, 1000)
  })
  await assert.rejects(ytdlp.info('u3', 'https://youtu.be/dQw4w9WgXcQ'), /Muitos downloads/)
  for (const ok of soltar) ok({ code: 0, stdout: JSON_OK, stderr: '' })
  const a = await p1
  const b = await p2
  assert.match(a.id, /^[0-9a-f]{24}$/)
  assert.match(b.id, /^[0-9a-f]{24}$/)
  assert.notEqual(a.id, b.id)
})

test('spawn real: argumentos em lista, shell desligado, e a URL não vira comando', async () => {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'namy-bin-'))
  fs.writeFileSync(path.join(binDir, 'yt-dlp'), [
    '#!/bin/sh',
    'printf "%s\\n" "$@" > ' + JSON.stringify(path.join(binDir, 'args')),
    'if [ "$1" = "--version" ]; then echo 2026.1.1; exit 0; fi',
    'echo \'{"title":"Ok","duration":4}\'',
    ''
  ].join('\n'))
  fs.chmodSync(path.join(binDir, 'yt-dlp'), 0o755)
  ytdlp._reset()
  ytdlp._dep.binario = path.join(binDir, 'yt-dlp')
  ytdlp._dep.executar = null
  ytdlp._dep.disponivel = null
  ytdlp._dep.resolver = async () => [{ address: '142.250.219.14', family: 4 }]
  const link = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&x=$(id)'
  try {
    const i = await ytdlp.info('u9', link)
    assert.equal(i.titulo, 'Ok')
    assert.equal(i.plataforma, 'youtube')
    const args = fs.readFileSync(path.join(binDir, 'args'), 'utf8').split('\n').filter(Boolean)
    assert.equal(args[0], '--ignore-config')
    assert.equal(args.at(-2), '--')
    assert.match(args.at(-1), /\$\(id\)|%24\(id\)|%24%28id%29/, 'a URL foi argumento, não comando')
    assert.equal(/uid=/.test(args.at(-1)), false)
  } finally {
    ytdlp._dep.binario = null
    ytdlp._reset()
    fs.rmSync(binDir, { recursive: true, force: true })
  }
})

test('rotas: YouTube exige licença, não vaza a URL, guarda com origem youtube e tem limite próprio', async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'namy-ytdlp-'))
  let dir = ''
  preparar((args, op) => {
    if (args.includes('--skip-download')) return { code: 0, stdout: JSON_OK, stderr: '' }
    dir = op.cwd
    fs.writeFileSync(path.join(op.cwd, 'video.mp4'), mp4(3600))
    return { code: 0, stdout: '', stderr: '' }
  })
  const exp = (n) => new Date(Date.now() + n * 864e5).toISOString()
  const CONFIGS = {
    u1: { license: { active: true, expiresAt: exp(1) } },
    u3: { license: { active: true, expiresAt: exp(-1) } }
  }
  const app = express()
  app.use(express.json())
  const auth = (req, res, next) => (req.get('x-user') ? ((req.user = { id: req.get('x-user') }), next()) : res.status(401).json({ error: 'login' }))
  videosRoutes.mount(app, { auth, readJson: () => CONFIGS, CONFIGS: 'x', DATA: d, segredo: 'teste' }, { youtubePorHora: 2 })
  const srv = app.listen(0)
  const base = 'http://127.0.0.1:' + srv.address().port
  const post = (p, body, user) => fetch(base + p, {
    method: 'POST',
    headers: Object.assign({ 'content-type': 'application/json' }, user ? { 'x-user': user } : {}),
    body: JSON.stringify(body)
  })
  try {
    assert.equal((await post('/videos/info', { url: URL })).status, 401)
    assert.equal((await post('/videos/info', { url: URL }, 'u3')).status, 402)
    const r = await post('/videos/info', { url: URL }, 'u1')
    assert.equal(r.status, 200)
    const info = await r.json()
    assert.equal(info.plataforma, 'youtube')
    assert.equal(JSON.stringify(info).includes('googlevideo'), false)
    assert.equal(JSON.stringify(info).includes('watch?v='), false)
    assert.equal(JSON.stringify(info).includes('list='), false)
    const salvo = await post('/videos/salvar', { id: info.id, nome: 'Fone' }, 'u1')
    assert.equal(salvo.status, 200)
    const corpo = await salvo.json()
    assert.equal(corpo.item.origem, 'youtube')
    assert.equal(corpo.item.nome, 'Fone')
    assert.equal(corpo.item.tamanho, 3600)
    assert.equal(fs.existsSync(dir), false)
    const segundo = await post('/videos/info', { url: 'https://youtu.be/dQw4w9WgXcQ' }, 'u1')
    assert.equal(segundo.status, 200)
    assert.equal((await post('/videos/info', { url: 'https://youtu.be/dQw4w9WgXcQ' }, 'u1')).status, 429)
    assert.equal(videos.detectar('https://sv.shopee.com.br/share-video/abc'), 'shopee', 'Shopee continua no outro módulo')
  } finally { srv.close() }
})
