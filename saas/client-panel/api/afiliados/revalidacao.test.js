const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

process.env.SAAS_MASTER_KEY = 'chave-mestra-so-para-teste-0123456789abcdef'

const links = require('./links')
const ofertas = require('../ofertas')
const pool = require('./pool')
const revalidacao = require('./revalidacao')

links.validarAoVivo = async () => ({ ok: true, motivo: '' })

const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'namy-reval-'))
const CHAVES = { appId: '123', secret: 'segredo-shopee-NAO-VAZAR' }
const TEXTO = (preco) => '🔥 OFERTA SHOPEE\n\nProduto X\n\n💰 ' + preco + '\n\n🔗 https://s.shopee.com.br/AAAA'

let n = 0
async function novoItem(d, cfg, shopee) {
  const r = await pool.adicionar(d, 'u1', cfg, { texto: TEXTO('R$ 10,00') + n++, origem: 'vitrine', shopee })
  return r.item
}

// ao vivo simulado: porItem
let modo = 'ok'
let precoAgora = 10
const chamadas = []
const porItemOriginal = ofertas.porItem
ofertas.porItem = async (shopee, id) => {
  chamadas.push(String(id))
  if (modo === 'erro') throw new Error('falha com ' + shopee.secret)
  if (modo === 'indisponivel') return { status: 'indisponivel' }
  return { status: 'ok', oferta: { productId: String(id), nome: 'Produto X', link: 'https://shopee.com.br/x-i.1.' + id, preco: 'R$ ' + precoAgora.toFixed(2).replace('.', ','), precoNum: precoAgora, desconto: null, ratingStar: '', sales: 0, shopName: '' } }
}
test.beforeEach(() => { modo = 'ok'; precoAgora = 10; chamadas.length = 0 })

// o cache e por userId:itemId; cada teste usa um item novo (itemId proprio)
let seq = 5000
const meta = (precoNum = 10) => ({ itemId: String(++seq), shopId: '9', precoNum })

test('sem meta da Shopee: segue como antes e nao consulta a API', async () => {
  const d = dir()
  const cfg = { shopee: CHAVES }
  const item = (await pool.adicionar(d, 'u1', cfg, { texto: TEXTO('R$ 1,00'), origem: 'manual' })).item
  const r = await revalidacao.revalidar({ userId: 'u1', cfg, dataDir: d }, item)
  assert.deepEqual(r, { ok: true, conferida: false })
  assert.equal(chamadas.length, 0)
})

test('sem chaves da Shopee na conta: segue como antes e nao consulta', async () => {
  const d = dir()
  const item = await novoItem(d, {}, meta())
  const r = await revalidacao.revalidar({ userId: 'u1', cfg: {}, dataDir: d }, item)
  assert.equal(r.ok, true)
  assert.equal(chamadas.length, 0)
})

test('preco igual: ok, sem mudar nada, e o cache evita a segunda consulta', async () => {
  const d = dir()
  const cfg = { shopee: CHAVES }
  const item = await novoItem(d, cfg, meta(10))
  const ctx = { userId: 'u1', cfg, dataDir: d }
  assert.deepEqual(await revalidacao.revalidar(ctx, item), { ok: true, mudou: false })
  assert.deepEqual(await revalidacao.revalidar(ctx, item), { ok: true, mudou: false })
  assert.equal(chamadas.length, 1, 'segunda conferencia sai do cache')
})

test('preco mudou: reescreve o texto, grava na fila e avisa', async () => {
  const d = dir()
  const cfg = { shopee: CHAVES }
  const item = await novoItem(d, cfg, meta(10))
  precoAgora = 8
  const r = await revalidacao.revalidar({ userId: 'u1', cfg, dataDir: d }, item)
  assert.equal(r.ok, true)
  assert.equal(r.mudou, true)
  assert.match(r.texto, /R\$\s?8,00/)
  assert.match(r.aviso, /preço atualizado/)
  const salvo = pool.listar(d, 'u1').find((i) => i.id === item.id)
  assert.match(salvo.texto, /R\$\s?8,00/)
  assert.equal(salvo.shopee.precoNum, 8)
  assert.equal(salvo.sig, pool.assinatura(salvo.texto))
  assert.ok(salvo.revalidadoEm)
})

test('oferta sumiu: pausa o item e pula', async () => {
  const d = dir()
  const cfg = { shopee: CHAVES }
  const item = await novoItem(d, cfg, meta())
  modo = 'indisponivel'
  const r = await revalidacao.revalidar({ userId: 'u1', cfg, dataDir: d }, item)
  assert.equal(r.ok, false)
  assert.equal(r.pausada, true)
  assert.match(r.motivo, /indisponível/)
  assert.equal(pool.listar(d, 'u1').find((i) => i.id === item.id).ativo, false)
})

test('API fora: pula so desta vez, nao pausa e nao vaza o segredo', async () => {
  const d = dir()
  const cfg = { shopee: CHAVES }
  const item = await novoItem(d, cfg, meta())
  modo = 'erro'
  const r = await revalidacao.revalidar({ userId: 'u1', cfg, dataDir: d }, item)
  assert.equal(r.ok, false)
  assert.equal(r.temporario, true)
  assert.equal(pool.listar(d, 'u1').find((i) => i.id === item.id).ativo, true)
  // a mensagem de erro da API pode citar o segredo; ele nao pode sair dai
  assert.equal(JSON.stringify(r).includes(CHAVES.secret), false)
})

// ---------------------------------------------------------------- ofertas.js de verdade

test('normalizar expõe shopId e precoNum', () => {
  const o = ofertas.normalizar({ itemId: '77', shopId: 55, productName: 'P', offerLink: 'https://s.shopee.com.br/x', priceMin: '12.5', priceMax: '12.5' })
  assert.equal(o.shopId, '55')
  assert.equal(o.precoNum, 12.5)
})

test('porItem: monta a consulta so com digitos, devolve a oferta ou indisponivel', async () => {
  ofertas.porItem = porItemOriginal
  const real = global.fetch
  const corpos = []
  let nodes = [{ itemId: '4242', productName: 'P', offerLink: 'https://s.shopee.com.br/x', priceMin: '9.9', priceMax: '9.9', shopId: '1' }]
  global.fetch = async (url, init) => { corpos.push(JSON.parse(init.body).query); return { status: 200, json: async () => ({ data: { productOfferV2: { nodes } } }) } }
  try {
    const ok = await ofertas.porItem(CHAVES, '4242')
    assert.equal(ok.status, 'ok')
    assert.equal(ok.oferta.productId, '4242')
    assert.match(corpos[0], /productOfferV2\(itemId: 4242, limit: 1\)/)
    nodes = []
    assert.deepEqual(await ofertas.porItem(CHAVES, '4242'), { status: 'indisponivel' })
    nodes = [{ itemId: '1', productName: 'Outro', offerLink: 'https://s.shopee.com.br/y', priceMin: '1', priceMax: '1' }]
    assert.deepEqual(await ofertas.porItem(CHAVES, '4242'), { status: 'indisponivel' }, 'item diferente do pedido nao vale')
    for (const ruim of ['', 'abc', '12; drop', '1 } { x', '1'.repeat(21), null, undefined]) {
      await assert.rejects(() => ofertas.porItem(CHAVES, ruim), /itemId inválido/)
    }
    await assert.rejects(() => ofertas.porItem({}, '1'), /App ID/)
    assert.equal(corpos.length, 3, 'id invalido nunca chega na rede')
  } finally { global.fetch = real; ofertas.porItem = async (...a) => { throw new Error('stub') } }
})

test('pool.adicionar higieniza a meta da Shopee', async () => {
  const d = dir()
  const lixo = (await pool.adicionar(d, 'u1', {}, { texto: TEXTO('R$ 2,00') + 'a', origem: 'vitrine', shopee: { itemId: '12; x', shopId: 'zz', precoNum: 'abc' } })).item
  assert.equal(lixo.shopee, undefined)
  const bom = (await pool.adicionar(d, 'u1', {}, { texto: TEXTO('R$ 2,00') + 'b', origem: 'vitrine', shopee: { itemId: '12', shopId: 'zz', precoNum: '5.5', extra: 'x' } })).item
  assert.deepEqual(bom.shopee, { itemId: '12', shopId: '', precoNum: 5.5 })
})
