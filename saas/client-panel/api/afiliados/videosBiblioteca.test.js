const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { Readable } = require('stream')
const express = require('express')
const biblioteca = require('./videosBiblioteca')
const videosRoutes = require('./videosRoutes')
const pool = require('./pool')
const imagens = require('./imagens/store')

const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'namy-videos-'))
// MP4 mínimo: caixa ftyp "isom" + bytes quaisquer (o tipo é conferido pelo cabeçalho)
const mp4 = (n = 2048, marca = 'isom') => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftyp' + marca, 'latin1'), Buffer.alloc(Math.max(0, n - 12), 7)])
const corrente = (buf, pedacos = 4) => Readable.from(Array.from({ length: pedacos }, (_, i) => buf.subarray(Math.floor((i * buf.length) / pedacos), Math.floor(((i + 1) * buf.length) / pedacos))))
const sobra = (d) => fs.readdirSync(path.join(d, 'videos-arquivos')).flatMap((u) => fs.readdirSync(path.join(d, 'videos-arquivos', u)))

test('formatoDe: confere pelos bytes, não pela extensão', () => {
  assert.equal(biblioteca.formatoDe(mp4(64)), 'mp4')
  assert.equal(biblioteca.formatoDe(mp4(64, 'mp42')), 'mp4')
  assert.equal(biblioteca.formatoDe(mp4(64, 'qt  ')), 'mov')
  assert.equal(biblioteca.formatoDe(Buffer.from('<html><body>não sou vídeo</body>')), '')
  assert.equal(biblioteca.formatoDe(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), '', 'JPEG renomeado para .mp4 não passa')
  assert.equal(biblioteca.formatoDe(Buffer.alloc(4)), '')
})

test('salvar: grava na pasta da conta, recusa arquivo que não é vídeo e não deixa resto', async () => {
  const d = dir()
  const v = await biblioteca.salvar(d, 'u1', corrente(mp4(5000)), { nome: '../../etc/passwd<script>', origem: 'upload' })
  assert.match(v.id, biblioteca.ID_RE)
  assert.equal(v.tamanho, 5000)
  assert.equal(v.formato, 'mp4')
  assert.equal(v.nome.includes('/'), false, 'nome sem barra nem caminho')
  assert.equal(v.nome.includes('<'), false)
  const f = biblioteca.caminho(d, 'u1', v.id)
  assert.ok(f.startsWith(path.join(d, 'videos-arquivos', 'u1') + path.sep))
  assert.equal(fs.statSync(f).size, 5000)
  await assert.rejects(biblioteca.salvar(d, 'u1', corrente(Buffer.from('MZ executável disfarçado de vídeo ...'))), /não é um vídeo MP4/)
  await assert.rejects(biblioteca.salvar(d, 'u1', corrente(Buffer.alloc(0), 1)), /vazio/)
  assert.deepEqual(sobra(d), [v.id + '.mp4'], 'sem arquivo .parcial nem lixo')
  const mov = await biblioteca.salvar(d, 'u1', corrente(mp4(300, 'qt  ')))
  assert.equal(mov.formato, 'mov')
  assert.match(mov.aviso, /pode não tocar/)
})

test('salvar: limite de tamanho no meio do envio, de quantidade e um envio por vez por conta', async () => {
  const d = dir()
  const { LIMITES } = biblioteca
  const antes = { ...LIMITES }
  try {
    LIMITES.arquivo = 4000
    await assert.rejects(biblioteca.salvar(d, 'u1', corrente(mp4(9000), 9)), /grande demais/, 'corta durante o envio, sem confiar no tamanho declarado')
    await assert.rejects(biblioteca.salvar(d, 'u1', corrente(mp4(100)), { tamanhoDeclarado: 999999 }), /grande demais/)
    assert.equal(biblioteca.listar(d, 'u1').length, 0)
    assert.deepEqual(sobra(d), [])
    LIMITES.arquivo = antes.arquivo
    LIMITES.quantidade = 2
    await biblioteca.salvar(d, 'u1', corrente(mp4()))
    await biblioteca.salvar(d, 'u1', corrente(mp4()))
    await assert.rejects(biblioteca.salvar(d, 'u1', corrente(mp4())), /limite de 2 vídeos/)
    LIMITES.quantidade = antes.quantidade
    // Um envio lento ainda em curso: o segundo da mesma conta espera; outra conta não é afetada
    const lento = new Readable({ read() {} })
    const p1 = biblioteca.salvar(d, 'u2', lento)
    await assert.rejects(biblioteca.salvar(d, 'u2', corrente(mp4())), /Já tem um vídeo sendo enviado/)
    await biblioteca.salvar(d, 'u3', corrente(mp4()))
    lento.push(mp4(500)); lento.push(null)
    await p1
  } finally { Object.assign(LIMITES, antes) }
})

test('isolamento: uma conta não acha, não apaga e não usa o vídeo da outra', async () => {
  const d = dir()
  const a = await biblioteca.salvar(d, 'contaA', corrente(mp4()))
  assert.equal(biblioteca.caminho(d, 'contaB', a.id), '')
  assert.equal(biblioteca.obter(d, 'contaB', a.id), null)
  await assert.rejects(biblioteca.remover(d, 'contaB', a.id), /não encontrado/)
  assert.ok(biblioteca.caminho(d, 'contaA', a.id), 'continua lá para a dona')
  for (const ruim of ['../contaA/' + a.id, a.id + '/../../x', '', null, 'x'.repeat(36)]) assert.equal(biblioteca.caminho(d, 'contaA', ruim), '')
  await biblioteca.remover(d, 'contaA', a.id)
  assert.equal(biblioteca.caminho(d, 'contaA', a.id), '')
  assert.deepEqual(sobra(d), [])
})

test('publicador: oferta do banco com vídeo envia o vídeo; vídeo apagado volta para a imagem', async () => {
  const links = require('./links')
  const publicador = require('./publicador')
  const vivo = links.validarAoVivo
  links.validarAoVivo = async () => ({ ok: true, motivo: '' })
  const d = dir()
  const cfg = { ads: { source: 'pool' }, mercadolivre: { etiqueta: 'minha', toolId: '12345678' }, groups: [{ jid: 'g1@g.us', name: 'Geral', niche: 'geral' }] }
  try {
    const { item } = await pool.adicionar(d, 'u1', cfg, { texto: '🎧 Fone bluetooth\n💰 R$ 199,90\nhttps://produto.mercadolivre.com.br/MLB-1234567-fone' })
    const v = await biblioteca.salvar(d, 'u1', corrente(mp4()))
    await pool.definirVideo(d, 'u1', item.id, v.id)
    const enviados = []
    const sessions = { sendOffer: async (_u, jid, msg) => { enviados.push({ jid, msg }) } }
    const out = await publicador.publicar({ userId: 'u1', cfg, dataDir: d, sessions })
    assert.equal(out.enviados, 1)
    assert.equal(enviados[0].msg.videoPath, biblioteca.caminho(d, 'u1', v.id), 'o caminho do vídeo vai para o envio')
    assert.equal(require('./auditoria').listar(d, 'u1')[0].imagem, 'video')
    // Outro cliente com o mesmo id de vídeo no item não acha o arquivo
    assert.equal(biblioteca.caminho(d, 'u2', v.id), '')
    // Apagou da biblioteca: solta da oferta
    await biblioteca.remover(d, 'u1', v.id)
    assert.equal(await pool.soltarVideo(d, 'u1', v.id), 1)
    assert.equal(pool.listar(d, 'u1')[0].video, undefined)
  } finally { links.validarAoVivo = vivo }
})

test('rotas: login, tipo, upload em stream, pré-visualização assinada, associação só com vídeo próprio', async () => {
  const d = dir()
  const segredo = 'teste-segredo'
  const exp = (n) => new Date(Date.now() + n * 864e5).toISOString()
  const CONFIGS = { u1: { license: { active: true, expiresAt: exp(1) } }, u2: { license: { active: true, expiresAt: exp(1) } }, u3: { license: { active: true, expiresAt: exp(-1) } } }
  const app = express()
  app.use(express.json())
  const auth = (req, res, next) => (req.get('x-user') ? ((req.user = { id: req.get('x-user') }), next()) : res.status(401).json({ error: 'login' }))
  videosRoutes.mount(app, { auth, readJson: () => CONFIGS, CONFIGS: 'x', DATA: d, segredo })
  const srv = app.listen(0)
  const base = 'http://127.0.0.1:' + srv.address().port
  const enviar = (user, corpo, tipo = 'video/mp4') => fetch(base + '/videos/biblioteca', { method: 'POST', headers: Object.assign({ 'content-type': tipo, 'x-nome-arquivo': encodeURIComponent('Fone azul.mp4') }, user ? { 'x-user': user } : {}), body: corpo })
  const post = (p, body, user) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', 'x-user': user }, body: JSON.stringify(body) })
  try {
    assert.equal((await enviar(null, mp4())).status, 401)
    assert.equal((await enviar('u3', mp4())).status, 402, 'licença vencida')
    assert.equal((await enviar('u1', mp4(), 'image/png')).status, 415)
    const r = await enviar('u1', mp4(70000))
    assert.equal(r.status, 200)
    const corpo = await r.json()
    assert.equal(corpo.item.nome, 'Fone azul')
    assert.equal(corpo.item.tamanho, 70000)
    assert.equal(corpo.uso.quantidade, 1)
    const bad = await enviar('u1', Buffer.from('isto não é vídeo, só texto qualquer'))
    assert.equal(bad.status, 415)
    // Pré-visualização: assinada, com Range; assinatura errada ou de outra conta não abre
    const url = corpo.itens[0].url
    const ok = await fetch(base + url, { headers: { range: 'bytes=0-11' } })
    assert.equal(ok.status, 206)
    assert.equal(Buffer.from(await ok.arrayBuffer()).toString('latin1', 4, 8), 'ftyp')
    assert.equal((await fetch(base + url.replace(/s=[^&]+/, 's=xxx'))).status, 403)
    const deB = imagens.urlAssinada(segredo, 'u2', 'video:' + corpo.item.id, '/videos/biblioteca/arquivo/' + corpo.item.id)
    assert.equal((await fetch(base + deB)).status, 404, 'URL assinada para outra conta não acha o vídeo da u1')
    assert.equal((await (await fetch(base + '/videos/biblioteca', { headers: { 'x-user': 'u2' } })).json()).itens.length, 0, 'u2 não vê os vídeos da u1')
    // Associação à oferta
    const cfg = { mercadolivre: { etiqueta: 'minha', toolId: '12345678' } }
    const { item } = await pool.adicionar(d, 'u1', cfg, { texto: 'Fone\nhttps://produto.mercadolivre.com.br/MLB-1234567-fone' })
    const { item: deOutro } = await pool.adicionar(d, 'u2', cfg, { texto: 'Panela\nhttps://produto.mercadolivre.com.br/MLB-7654321-panela' })
    assert.equal((await post('/ofertas/banco/video', { itemId: deOutro.id, videoId: corpo.item.id }, 'u2')).status, 404, 'u2 não usa o vídeo da u1')
    assert.equal((await post('/ofertas/banco/video', { itemId: item.id, videoId: corpo.item.id }, 'u2')).status, 404, 'u2 não mexe na oferta da u1')
    const assoc = await post('/ofertas/banco/video', { itemId: item.id, videoId: corpo.item.id }, 'u1')
    assert.equal(assoc.status, 200)
    assert.deepEqual((await assoc.json()).itens[0].ofertas, [{ id: item.id, nome: item.nome }])
    // Apagar: solta da oferta
    const rem = await (await post('/videos/biblioteca/remover', { id: corpo.item.id }, 'u1')).json()
    assert.equal(rem.ofertasSemVideo, 1)
    assert.equal(pool.listar(d, 'u1')[0].video, undefined)
    assert.equal((await post('/videos/biblioteca/remover', { id: corpo.item.id }, 'u1')).status, 404)
  } finally { srv.close() }
})
