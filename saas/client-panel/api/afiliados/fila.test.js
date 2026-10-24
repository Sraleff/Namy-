const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const links = require('./links')
const ofertas = require('../ofertas')
const pool = require('./pool')
const fila = require('./fila')
const jsonStore = require('./jsonStore')
const publicador = require('./publicador')
const produtosRoutes = require('./produtosRoutes')

// Sem rede: a Shopee gera link fixo e a checagem ao vivo passa
ofertas.encurtar = async (appId, secret, url) => 'https://s.shopee.com.br/AFIL' + url.replace(/\D/g, '').slice(-4)
links.validarAoVivo = async () => ({ ok: true, motivo: '' })

function dir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'namy-fila-'))
}

function cfgBase(extra) {
  return Object.assign({
    amazon: { tag: 'namy-20' },
    ads: { source: 'pool' },
    groups: []
  }, extra || {})
}

let n = 0
const amazon = (nome) => nome + '\nhttps://www.amazon.com.br/dp/B0' + String(1000000 + (++n)) // ASIN distinto por oferta

async function novo(data, user, nome, cfg = cfgBase()) {
  return (await pool.adicionar(data, user, cfg, { texto: amazon(nome) })).item
}

// Muda campos direto no arquivo (simula o publicador/tempo)
function mexer(data, user, id, fn) {
  return jsonStore.update(data, 'pool', user, () => ({ itens: [] }), (db) => { fn(db.itens.find((i) => i.id === id)) })
}

function sessaoFalsa() {
  const enviados = []
  return { enviados, sendOffer: async (userId, jid, msg) => { enviados.push({ jid, msg }) } }
}

test('status: cada situacao cai no status certo, na ordem de precedencia', () => {
  const agora = Date.now()
  const base = () => ({ ativo: true, expiresAt: new Date(agora + 3600000).toISOString(), enviadoPara: {} })
  assert.equal(fila.statusDe(base(), agora), 'fila')
  assert.equal(fila.statusDe(Object.assign(base(), { ultimoPulo: { motivo: 'nicho' } }), agora), 'pulado')
  assert.equal(fila.statusDe(Object.assign(base(), { ultimoErro: { motivo: 'link' }, ultimoPulo: { motivo: 'x' } }), agora), 'erro')
  assert.equal(fila.statusDe(Object.assign(base(), { ultimoErro: { motivo: 'link' }, enviadoPara: { 'g@g.us': 'x' } }), agora), 'enviado')
  assert.equal(fila.statusDe(Object.assign(base(), { ativo: false, enviadoPara: { 'g@g.us': 'x' } }), agora), 'pausado')
  assert.equal(fila.statusDe(Object.assign(base(), { ativo: false, expiresAt: new Date(agora - 1).toISOString() }), agora), 'expirado')
  // item antigo, sem nenhum campo novo, continua valendo como "fila"
  assert.equal(fila.statusDe({ ativo: true, expiresAt: new Date(agora + 1000).toISOString() }, agora), 'fila')
})

test('listar: contadores, filtro por status, limite e ordem (prioridade, depois mais nova)', async () => {
  const data = dir(); const u = 'u1'
  const a = await novo(data, u, 'Oferta A antiga')
  const b = await novo(data, u, 'Oferta B')
  const c = await novo(data, u, 'Oferta C nova')
  await fila.editar(data, u, cfgBase(), a.id, { prioridade: 2 })
  await mexer(data, u, b.id, (i) => { i.enviadoPara = { 'g@g.us': new Date().toISOString() } })
  await mexer(data, u, c.id, (i) => { i.ativo = false })

  const todos = fila.listar(data, u)
  assert.deepEqual(todos.itens.map((i) => i.nome), ['Oferta A antiga', 'Oferta C nova', 'Oferta B'], 'urgente primeiro, depois a mais nova')
  assert.equal(todos.contadores.todos, 3)
  assert.equal(todos.contadores.fila, 1)
  assert.equal(todos.contadores.enviado, 1)
  assert.equal(todos.contadores.pausado, 1)
  assert.equal(todos.contadores.erro, 0)

  const so = fila.listar(data, u, { status: 'enviado' })
  assert.deepEqual(so.itens.map((i) => i.nome), ['Oferta B'])
  assert.equal(so.total, 1)
  assert.equal(so.contadores.todos, 3, 'contadores nao dependem do filtro')

  const curto = fila.listar(data, u, { limite: 1 })
  assert.equal(curto.itens.length, 1)
  assert.equal(curto.total, 3)
  assert.equal(fila.listar(data, u, { limite: 'abc' }).limite, fila.LIMITE_PADRAO)
  assert.equal(fila.listar(data, u, { limite: 999999 }).limite, fila.LIMITE_MAX)
  assert.equal(fila.listar(data, u, { status: 'inventado' }).total, 3, 'status desconhecido e ignorado')
  // o que sai para a tela nao carrega o mapa interno de envios
  assert.equal('enviadoPara' in todos.itens[0], false)
})

test('editar: valida a entrada e nao mexe em nada quando recusa', async () => {
  const data = dir(); const u = 'u1'
  const it = await novo(data, u, 'Panela inox')
  const cfg = cfgBase()
  const recusa = (campos, re) => assert.rejects(() => fila.editar(data, u, cfg, it.id, campos), re)
  await recusa({ nome: '' }, /Nome/)
  await recusa({ nome: 'x'.repeat(121) }, /Nome/)
  await recusa({ nome: 42 }, /Nome/)
  await recusa({ texto: 'Panela sem link nenhum' }, /link/i)
  await recusa({ texto: '   ' }, /Texto/)
  await recusa({ texto: 'x'.repeat(3501) + ' https://www.amazon.com.br/dp/B0AAAAAAAA' }, /Texto/)
  await recusa({ imagemUrl: 'http://inseguro.com/a.jpg' }, /https/)
  await recusa({ imagemUrl: 'javascript:alert(1)' }, /https/)
  await recusa({ prioridade: 3 }, /Prioridade/)
  await recusa({ prioridade: '1' }, /Prioridade/)
  await recusa({ prioridade: 1.5 }, /Prioridade/)
  await recusa({ renovarValidade: 'sim' }, /renovarValidade/)
  await assert.rejects(() => fila.editar(data, u, cfg, 'nao-existe', { nome: 'x' }), (e) => e.status === 404)
  const depois = fila.listar(data, u).itens[0]
  assert.equal(depois.nome, 'Panela inox')
  assert.equal(depois.prioridade, 0)
  assert.equal(depois.editadoEm, null)
})

test('editar texto: recalcula nicho/marketplaces/cupons, preserva envios e segue o titulo automatico', async () => {
  const data = dir(); const u = 'u1'
  const cfg = cfgBase()
  const it = (await pool.adicionar(data, u, cfg, { texto: 'Jogo de panelas inox\nhttps://www.amazon.com.br/dp/B0AAAAAAA1' })).item
  await mexer(data, u, it.id, (i) => { i.enviadoPara = { 'casa@g.us': 'ontem' } })
  const novoTexto = 'Pneu aro 15 para carro\nUse o cupom: PNEU10\nhttps://www.amazon.com.br/dp/B0AAAAAAA1 e https://shopee.com.br/Pneu-i.1.2222'
  const out = await fila.editar(data, u, cfg, it.id, { texto: novoTexto })
  assert.equal(out.nome, 'Pneu aro 15 para carro', 'nome automatico acompanha o texto novo')
  assert.deepEqual(out.marketplaces.sort(), ['amazon', 'shopee'])
  assert.ok(out.cupons.includes('PNEU10'))
  assert.equal(out.envios, 1, 'o que ja foi enviado fica')
  assert.ok(out.editadoEm)
  // nome que o usuario definiu NAO e sobrescrito por edicao de texto
  await fila.editar(data, u, cfg, it.id, { nome: 'Meu nome' })
  const out2 = await fila.editar(data, u, cfg, it.id, { texto: 'Outro texto\nhttps://www.amazon.com.br/dp/B0AAAAAAA9' })
  assert.equal(out2.nome, 'Meu nome')
})

test('editar texto: recusa duplicar outra oferta ativa, mas aceita igualar a propria', async () => {
  const data = dir(); const u = 'u1'
  const cfg = cfgBase()
  const a = (await pool.adicionar(data, u, cfg, { texto: 'Fone bluetooth\nhttps://www.amazon.com.br/dp/B0AAAAAAA1' })).item
  const b = (await pool.adicionar(data, u, cfg, { texto: 'Cafeteira\nhttps://www.amazon.com.br/dp/B0AAAAAAA2' })).item
  await assert.rejects(() => fila.editar(data, u, cfg, b.id, { texto: 'Fone  bluetooth\nhttps://www.amazon.com.br/dp/B0AAAAAAA1' }), (e) => e.status === 409)
  // igual a ela mesma nao e duplicata
  await fila.editar(data, u, cfg, a.id, { texto: 'Fone bluetooth\nhttps://www.amazon.com.br/dp/B0AAAAAAA1' })
  // duplicata de uma oferta VENCIDA nao conta
  await mexer(data, u, a.id, (i) => { i.expiresAt = new Date(Date.now() - 1000).toISOString() })
  await fila.editar(data, u, cfg, b.id, { texto: 'Fone  bluetooth\nhttps://www.amazon.com.br/dp/B0AAAAAAA1' })
})

test('editar imagem e prioridade; renovar validade; foto em arquivo e removida do disco', async () => {
  const data = dir(); const u = 'u1'
  const cfg = cfgBase({ ads: { source: 'pool', poolTtlHours: 100 } })
  const it = (await pool.adicionar(data, u, cfg, { texto: 'Mochila\nhttps://www.amazon.com.br/dp/B0AAAAAAA1', imagemBuffer: Buffer.from('jpegfalso'), imagemExt: 'jpg' })).item
  const arquivo = pool.caminhoMidia(data, u, it.imagem.valor)
  assert.ok(fs.existsSync(arquivo))
  let out = await fila.editar(data, u, cfg, it.id, { imagemUrl: 'https://img.exemplo.com/mochila.jpg', prioridade: 1 })
  assert.equal(out.imagemTipo, 'url')
  assert.equal(out.prioridade, 1)
  assert.equal(fs.existsSync(arquivo), false, 'a foto antiga foi apagada do disco')
  out = await fila.editar(data, u, cfg, it.id, { imagemUrl: '' })
  assert.equal(out.imagemTipo, '')
  // renovar validade: vencida volta a valer pelo prazo configurado (100h)
  await mexer(data, u, it.id, (i) => { i.expiresAt = new Date(Date.now() - 1000).toISOString() })
  assert.equal(fila.listar(data, u).itens[0].status, 'expirado')
  out = await fila.editar(data, u, cfg, it.id, { renovarValidade: true })
  assert.equal(out.status, 'fila')
  const horas = (new Date(out.expiresAt) - Date.now()) / 3600000
  assert.ok(horas > 99 && horas <= 100, 'validade renovada pelo prazo do cliente: ' + horas)
})

test('reenfileirar: esquece envios, erro e pulo, renova e reativa', async () => {
  const data = dir(); const u = 'u1'
  const cfg = cfgBase()
  const it = await novo(data, u, 'Tenis corrida')
  await mexer(data, u, it.id, (i) => {
    i.enviadoPara = { 'a@g.us': 'x', 'b@g.us': 'y' }
    i.ultimoErro = { at: 'x', motivo: 'link: falhou', jid: 'a@g.us' }
    i.ultimoPulo = { at: 'x', motivo: 'nicho', jid: 'b@g.us' }
    i.ativo = false
    i.expiresAt = new Date(Date.now() - 1000).toISOString()
  })
  assert.equal(fila.listar(data, u).itens[0].status, 'expirado')
  const out = await fila.reenfileirar(data, u, cfg, it.id)
  assert.equal(out.status, 'fila')
  assert.equal(out.envios, 0)
  assert.equal(out.ultimoErro, null)
  assert.equal(out.ultimoPulo, null)
  assert.equal(out.ativo, true)
  assert.equal(pool.candidatas(data, u, 'a@g.us').length, 1, 'voltou a ser candidata para quem ja tinha recebido')
  await assert.rejects(() => fila.reenfileirar(data, u, cfg, 'nao-existe'), (e) => e.status === 404)
})

test('o disparo respeita a prioridade: urgente sai antes da mais nova', async () => {
  const data = dir(); const u = 'u1'
  const cfg = cfgBase()
  const velha = await novo(data, u, 'Velha urgente')
  await novo(data, u, 'Nova 1')
  await novo(data, u, 'Nova 2')
  assert.equal(pool.candidatas(data, u, 'g@g.us')[0].nome, 'Nova 2', 'sem prioridade: a mais nova primeiro (como antes)')
  await fila.editar(data, u, cfg, velha.id, { prioridade: 2 })
  assert.deepEqual(pool.candidatas(data, u, 'g@g.us').map((i) => i.nome), ['Velha urgente', 'Nova 2', 'Nova 1'])
  const alta = (await pool.listar(data, u)).find((i) => i.nome === 'Nova 1')
  await fila.editar(data, u, cfg, alta.id, { prioridade: 1 })
  assert.deepEqual(pool.candidatas(data, u, 'g@g.us').map((i) => i.nome), ['Velha urgente', 'Nova 1', 'Nova 2'])
})

test('registrarPulos: link vira erro, nicho vira pulado, ignora o que nao e do banco e nunca lanca', async () => {
  const data = dir(); const u = 'u1'
  const a = await novo(data, u, 'Item A')
  const b = await novo(data, u, 'Item B')
  const c = await novo(data, u, 'Item C')
  await fila.registrarPulos(data, u, [
    { nome: 'A', produtoKey: 'pool:' + a.id, motivo: 'link: etiqueta do Mercado Livre invalida' },
    { nome: 'B', produtoKey: 'pool:' + b.id, motivo: 'nicho carros: nao bate' },
    { nome: 'X', produtoKey: 'shopee:12345', motivo: 'nicho casa: x' },
    { nome: 'Y', produtoKey: 'pool:nao-existe', motivo: 'qualidade: x' },
    { nome: 'Z' }
  ], 'grupo@g.us')
  const m = Object.fromEntries(fila.listar(data, u).itens.map((i) => [i.nome, i]))
  assert.equal(m['Item A'].status, 'erro')
  assert.match(m['Item A'].ultimoErro.motivo, /^link:/)
  assert.equal(m['Item A'].ultimoErro.jid, 'grupo@g.us')
  assert.equal(m['Item B'].status, 'pulado')
  assert.equal(m['Item C'].status, 'fila')
  // entradas estranhas e usuario sem arquivo nao derrubam o disparo
  await assert.doesNotReject(() => fila.registrarPulos(data, u, null, 'x'))
  await assert.doesNotReject(() => fila.registrarPulos(data, 'sem-banco', [{ produtoKey: 'pool:a', motivo: 'x' }], 'x'))
  await assert.doesNotReject(() => fila.registrarPulos('/caminho/que/nao/existe/\0', u, [{ produtoKey: 'pool:a', motivo: 'x' }], 'x'))
})

test('publicador: oferta com link que nao troca vira "erro", a seguinte e enviada e o texto antigo segue', async () => {
  const data = dir(); const u = 'u5'
  // sem etiqueta do Mercado Livre -> o link dessa oferta nao pode ser trocado
  const cfg = cfgBase({ groups: [{ jid: 'geral@g.us', name: 'Geral', niche: 'geral' }] })
  const boa = (await pool.adicionar(data, u, cfg, { texto: 'Liquidificador\nhttps://www.amazon.com.br/dp/B0CCCCCCC1' })).item
  const ruim = (await pool.adicionar(data, u, cfg, { texto: 'Ventilador\nhttps://produto.mercadolivre.com.br/MLB-1234567-ventilador' })).item
  const s = sessaoFalsa()
  const out = await publicador.publicar({ userId: u, cfg, dataDir: data, sessions: s })
  assert.equal(out.enviados, 1)
  assert.match(s.enviados[0].msg.text, /Liquidificador/)
  const m = Object.fromEntries(fila.listar(data, u).itens.map((i) => [i.id, i]))
  assert.equal(m[ruim.id].status, 'erro')
  assert.match(m[ruim.id].ultimoErro.motivo, /^link:/)
  assert.equal(m[ruim.id].ultimoErro.jid, 'geral@g.us')
  assert.equal(m[boa.id].status, 'enviado')
  // depois de corrigir (reenfileirar) a oferta volta limpa para a fila
  const volta = await fila.reenfileirar(data, u, cfg, ruim.id)
  assert.equal(volta.status, 'fila')
})

test('publicador: oferta fora do nicho do unico grupo vira "pulado" com o motivo', async () => {
  const data = dir(); const u = 'u6'
  const cfg = cfgBase({ groups: [{ jid: 'carros@g.us', name: 'Carros', niche: 'carros' }] })
  const it = (await pool.adicionar(data, u, cfg, { texto: '🍳 Jogo de panelas inox\nhttps://www.amazon.com.br/dp/B0BBBBBBB1' })).item
  const s = sessaoFalsa()
  const out = await publicador.publicar({ userId: u, cfg, dataDir: data, sessions: s })
  assert.equal(out.enviados, 0)
  const x = fila.listar(data, u).itens.find((i) => i.id === it.id)
  assert.equal(x.status, 'pulado')
  assert.match(x.ultimoPulo.motivo, /nicho/)
})

test('edicoes simultaneas nao se perdem e o arquivo fica sempre valido, sem .tmp sobrando', async () => {
  const data = dir(); const u = 'u1'
  const cfg = cfgBase()
  const itens = []
  for (let i = 0; i < 12; i++) itens.push(await novo(data, u, 'Produto ' + i))
  await Promise.all(itens.flatMap((it, i) => [
    fila.editar(data, u, cfg, it.id, { prioridade: i % 3 }),
    fila.editar(data, u, cfg, it.id, { nome: 'Renomeado ' + i }),
    mexer(data, u, it.id, (x) => { x.enviadoPara = Object.assign({}, x.enviadoPara, { ['g' + i + '@g.us']: 'agora' }) })
  ]))
  const lista = fila.listar(data, u, { limite: 300 }).itens
  assert.equal(lista.length, 12)
  for (let i = 0; i < 12; i++) {
    const x = lista.find((l) => l.nome === 'Renomeado ' + i)
    assert.ok(x, 'nome ' + i + ' perdido')
    assert.equal(x.prioridade, i % 3, 'prioridade ' + i + ' perdida')
    assert.equal(x.envios, 1, 'envio ' + i + ' perdido')
  }
  const pasta = path.join(data, 'pool')
  assert.deepEqual(fs.readdirSync(pasta), ['u1.json'])
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(pasta, 'u1.json'), 'utf8')))
})

// ---- rotas (sem Express: captura os handlers) ----
function rotasDe(DATA, cfgs) {
  const rotas = {}
  const app = { get: (p, ...h) => { rotas['GET ' + p] = h[h.length - 1] }, post: (p, ...h) => { rotas['POST ' + p] = h[h.length - 1] } }
  produtosRoutes.mount(app, { auth: () => {}, readJson: () => cfgs, CONFIGS: 'x', DATA }, { midiaUrl: (uid, item) => '/midia/' + uid + '/' + item.imagem.valor })
  return async function chamar(metodo, caminho, userId, { body, query } = {}) {
    const res = { code: 200, body: null, status(c) { this.code = c; return this }, json(b) { this.body = b; return this } }
    await rotas[metodo + ' ' + caminho]({ user: { id: userId }, body, query: query || {} }, res)
    return res
  }
}

test('rotas: userId so do JWT, entrada validada e uma conta nunca ve nem edita a outra', async () => {
  const data = dir()
  const cfg = cfgBase()
  const chamar = rotasDe(data, { u1: cfg, u2: cfg })
  const doU1 = (await pool.adicionar(data, 'u1', cfg, { texto: 'Oferta do u1\nhttps://www.amazon.com.br/dp/B0AAAAAAA1', imagemBuffer: Buffer.from('x'), imagemExt: 'jpg' })).item

  let r = await chamar('GET', '/produtos', 'u1')
  assert.equal(r.code, 200)
  assert.equal(r.body.itens.length, 1)
  assert.match(r.body.itens[0].imagemUrl, /^\/midia\/u1\//, 'usa a URL de midia da conta do JWT')
  assert.equal(r.body.prioridades[2], 'urgente')

  r = await chamar('GET', '/produtos', 'u2')
  assert.equal(r.body.itens.length, 0, 'u2 nao ve a fila do u1')

  r = await chamar('GET', '/produtos', 'u1', { query: { status: 'inventado' } })
  assert.equal(r.code, 400)

  // u2 tenta editar/reenfileirar o item do u1 mandando o id e ate um userId no body: 404 e nada muda
  r = await chamar('POST', '/produtos/editar', 'u2', { body: { id: doU1.id, nome: 'Invadido', userId: 'u1' } })
  assert.equal(r.code, 404)
  r = await chamar('POST', '/produtos/reenfileirar', 'u2', { body: { id: doU1.id } })
  assert.equal(r.code, 404)
  assert.equal(fila.listar(data, 'u1').itens[0].nome, 'Oferta do u1')

  r = await chamar('POST', '/produtos/editar', 'u1', { body: { nome: 'sem id' } })
  assert.equal(r.code, 400)
  r = await chamar('POST', '/produtos/editar', 'u1', { body: { id: { $ne: 1 }, nome: 'x' } })
  assert.equal(r.code, 400, 'id que nao e texto e recusado')
  r = await chamar('POST', '/produtos/editar', 'u1', { body: { id: doU1.id, prioridade: 9 } })
  assert.equal(r.code, 400)
  r = await chamar('POST', '/produtos/editar', 'u1', { body: { id: doU1.id, prioridade: 2, nome: 'Novo nome' } })
  assert.equal(r.code, 200)
  assert.equal(r.body.item.prioridade, 2)
  assert.equal(r.body.item.nome, 'Novo nome')
  r = await chamar('POST', '/produtos/reenfileirar', 'u1', { body: { id: doU1.id } })
  assert.equal(r.code, 200)
  assert.equal(r.body.item.status, 'fila')
})
