const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

process.env.SAAS_MASTER_KEY = 'teste-chave-mestra-com-mais-de-32-caracteres!'

const amazonApi = require('./amazonApi')
const amazon = require('./conectores/amazon')
const { precoSubiu } = require('./travaPreco')

const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'namy-amazon-'))
const CRED = { clientId: 'amzn1.application-oa2-client.abc123', clientSecret: 'amzn1.oa2-cs.v1.SEGREDO-NAO-VAZAR-123' }
const ASIN = 'B0CHX1W1XY'

function item(asin, { preco = 199.9, de = 249.9, tipo = 'IN_STOCK', semOferta = false } = {}) {
  return {
    asin,
    detailPageURL: 'https://www.amazon.com.br/dp/' + asin + '?tag=minha-20',
    itemInfo: { title: { displayValue: 'Fone Bluetooth' } },
    images: { primary: { large: { url: 'https://m.media-amazon.com/images/I/x.jpg' } } },
    offersV2: semOferta ? { listings: [] } : {
      listings: [{ isBuyBoxWinner: true, availability: { type: tipo }, price: { money: { amount: preco, currency: 'BRL', displayAmount: 'R$ ' + String(preco).replace('.', ',') }, savingBasis: { money: { amount: de } }, savings: { percentage: 20 } } }]
    }
  }
}

// Amazon simulada: token e getItems; guarda o que foi pedido
function amazonFalsa({ token = { status: 200, dados: { access_token: 'TOKEN-ACESSO', expires_in: 3600 } }, getItems } = {}) {
  const chamadas = []
  amazonApi._http.fetch = async (url, init) => {
    const corpo = JSON.parse(init.body)
    chamadas.push({ url, headers: init.headers, corpo })
    const r = url === amazonApi.TOKEN_URL ? token : (typeof getItems === 'function' ? getItems(corpo) : getItems || { status: 200, dados: { itemsResult: { items: corpo.itemIds.map((a) => item(a)) } } })
    return { status: r.status, json: async () => r.dados }
  }
  return chamadas
}

test.beforeEach(() => { amazonApi._cache.tokens.clear(); amazonApi._cache.itens.clear() })

test('salvar: confere pegando um token (client_credentials, scope creatorsapi::default) e guarda cifrado', async () => {
  const d = dir()
  const chamadas = amazonFalsa()
  await amazonApi.salvar(d, 'u1', CRED)
  assert.equal(chamadas[0].url, 'https://api.amazon.com/auth/o2/token')
  assert.deepEqual(chamadas[0].corpo, { grant_type: 'client_credentials', client_id: CRED.clientId, client_secret: CRED.clientSecret, scope: 'creatorsapi::default' })
  assert.equal(amazonApi.configurada(d, 'u1'), true)
  const e = amazonApi.estado(d, 'u1')
  assert.equal(JSON.stringify(e).includes('SEGREDO'), false)
  assert.match(e.clientId, /^amzn1\.….{4}$/)
  for (const f of fs.readdirSync(d, { recursive: true })) {
    const p = path.join(d, f)
    if (fs.statSync(p).isFile()) assert.equal(fs.readFileSync(p, 'utf8').includes('SEGREDO-NAO-VAZAR'), false)
  }
  await assert.rejects(() => amazonApi.salvar(d, 'u1', { clientId: 'x', clientSecret: 'y' }), /Client ID/)
})

test('salvar: credencial recusada não grava e não vaza o segredo', async () => {
  const d = dir()
  amazonFalsa({ token: { status: 401, dados: { error: 'invalid_client', error_description: 'Client authentication failed ' + CRED.clientSecret } } })
  await assert.rejects(() => amazonApi.salvar(d, 'u1', CRED), (e) => /recusou as credenciais/.test(e.message) && !e.message.includes('SEGREDO'))
  assert.equal(amazonApi.configurada(d, 'u1'), false)
})

test('buscarItens: getItems no marketplace do Brasil, com a tag, recursos de preço/estoque; cache de 30 min', async () => {
  const d = dir()
  amazonFalsa()
  await amazonApi.salvar(d, 'u1', CRED)
  const chamadas = amazonFalsa()
  const r = await amazonApi.buscarItens(d, 'u1', 'minha-20', [ASIN, 'b0chx1w1xy'])
  assert.equal(r.size, 1, 'ASIN repetido conta uma vez')
  const it = r.get(ASIN)
  assert.equal(it.preco, 199.9)
  assert.equal(it.de, 249.9)
  assert.equal(it.desconto, 20)
  assert.equal(it.semEstoque, false)
  assert.equal(it.titulo, 'Fone Bluetooth')
  const pedido = chamadas.find((c) => c.url.endsWith('/getItems'))
  assert.equal(pedido.url, 'https://creatorsapi.amazon/catalog/v1/getItems')
  assert.equal(pedido.headers['x-marketplace'], 'www.amazon.com.br')
  assert.equal(pedido.headers.Authorization, 'Bearer TOKEN-ACESSO')
  assert.deepEqual(pedido.corpo, { itemIds: [ASIN], itemIdType: 'ASIN', marketplace: 'www.amazon.com.br', partnerTag: 'minha-20', resources: amazonApi.RECURSOS })
  assert.equal(chamadas.filter((c) => c.url === amazonApi.TOKEN_URL).length, 0, 'token do salvar ficou em cache')
  const antes = chamadas.length
  await amazonApi.buscarItens(d, 'u1', 'minha-20', [ASIN])
  assert.equal(chamadas.length, antes, 'segunda consulta sai do cache')
  await assert.rejects(() => amazonApi.buscarItens(d, 'u1', '', [ASIN]), /tag/)
  await assert.rejects(() => amazonApi.buscarItens(d, 'u1', 'minha-20', Array.from({ length: 11 }, (_, i) => 'B0000000' + String(i).padStart(2, '0'))), /1 a 10/)
})

test('sem acesso (menos de 10 vendas): erro claro; o conector não trava o envio, só avisa', async () => {
  const d = dir()
  amazonFalsa()
  await amazonApi.salvar(d, 'u1', CRED)
  amazonFalsa({ getItems: { status: 403, dados: { errors: [{ code: 'AccessDenied', message: 'Associate is not eligible' }] } } })
  await assert.rejects(() => amazonApi.buscarItens(d, 'u1', 'minha-20', [ASIN]), (e) => e.semAcesso && /10 vendas/.test(e.message))
  const ctx = { userId: 'u1', dataDir: d, cfg: { amazon: { tag: 'minha-20' } } }
  const v = await amazon.validar('https://www.amazon.com.br/dp/' + ASIN + '?tag=minha-20', ctx)
  assert.equal(v.ok, true)
  assert.match(v.aviso, /Creators API: .*10 vendas/)
})

test('conector: sem estoque reprova; preço vem para a trava; sem credencial nem consulta', async () => {
  const d = dir()
  amazonFalsa()
  await amazonApi.salvar(d, 'u1', CRED)
  const ctx = { userId: 'u1', dataDir: d, cfg: { amazon: { tag: 'minha-20' } } }
  const url = 'https://www.amazon.com.br/dp/' + ASIN + '?tag=minha-20'
  amazonFalsa({ getItems: (c) => ({ status: 200, dados: { itemsResult: { items: c.itemIds.map((a) => item(a, { tipo: 'OUT_OF_STOCK' })) } } }) })
  assert.match((await amazon.validar(url, ctx)).motivo, /sem estoque/)
  amazonApi._cache.itens.clear()
  amazonFalsa({ getItems: (c) => ({ status: 200, dados: { itemsResult: { items: c.itemIds.map((a) => item(a, { preco: 259.9 })) } } }) })
  const v = await amazon.validar(url, ctx)
  assert.equal(v.preco, 259.9)
  assert.match(precoSubiu('Fone R$ 199,90', [{ marketplace: 'amazon', preco: v.preco }]), /preço subiu na Amazon: R\$ 199,90 no texto, R\$ 259,90 agora/)
  amazonApi._cache.itens.clear()
  amazonFalsa({ getItems: (c) => ({ status: 200, dados: { itemsResult: { items: c.itemIds.map((a) => item(a, { semOferta: true })) } } }) })
  assert.match((await amazon.validar(url, ctx)).motivo, /sem estoque/, 'sem oferta nenhuma = sem estoque')
  const chamadas = amazonFalsa()
  const semCred = await amazon.validar(url, { userId: 'u2', dataDir: d, cfg: { amazon: { tag: 'minha-20' } } })
  assert.deepEqual(semCred, { ok: true, motivo: '' })
  assert.equal(chamadas.length, 0)
})

test('normalizar: aceita itemResults; item que a Amazon não devolve fica null (não trava)', async () => {
  const d = dir()
  amazonFalsa()
  await amazonApi.salvar(d, 'u1', CRED)
  amazonFalsa({ getItems: { status: 200, dados: { itemResults: { items: [item('B0AAAAAAAA')] }, errors: [{ code: 'ItemNotAccessible', message: 'not accessible' }] } } })
  const r = await amazonApi.buscarItens(d, 'u1', 'minha-20', ['B0AAAAAAAA', 'B0BBBBBBBB'])
  assert.equal(r.get('B0AAAAAAAA').preco, 199.9)
  assert.equal(r.get('B0BBBBBBBB'), null)
  amazonFalsa({ getItems: { status: 429, dados: {} } })
  amazonApi._cache.itens.clear()
  await assert.rejects(() => amazonApi.buscarItens(d, 'u1', 'minha-20', ['B0CCCCCCCC']), (e) => e.temporario && e.status === 429)
})
