const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const links = require('./links')
const ofertas = require('../ofertas')
const logs = require('../logs')
const pool = require('./pool')
const fila = require('./fila')
const auditoria = require('./auditoria')
const vitrine = require('./vitrine')
const vitrineRoutes = require('./vitrineRoutes')

// ---- Sem rede: troca a busca na API, a geracao do link curto e a checagem ao vivo ----
const buscas = []
let resposta = null
ofertas.buscar = async (shopee, opts) => {
  buscas.push({ shopee, opts })
  if (resposta instanceof Error) throw resposta
  return resposta || { itens: [], recebidos: 0 }
}
// Conferencia antes de enviar (productOfferV2 por itemId): por padrao devolve a oferta como esta
let porItemModo = 'ok'
const porItemChamadas = []
ofertas.porItem = async (shopee, id) => {
  porItemChamadas.push(String(id))
  if (porItemModo === 'erro') throw new Error('API fora do ar')
  if (porItemModo === 'indisponivel') return { status: 'indisponivel' }
  const o = ((resposta && resposta.itens) || []).find((i) => i.productId === String(id))
  if (porItemModo === 'preco') return { status: 'ok', oferta: Object.assign({}, o, { preco: 'R$ 8,00', precoNum: 8 }) }
  return { status: 'ok', oferta: o }
}
ofertas.encurtar = async (appId, secret, url) => 'https://s.shopee.com.br/AFIL' + url.replace(/\D/g, '').slice(-4)
links.validarAoVivo = async () => ({ ok: true, motivo: '' })

const oferta = (n, extra) => Object.assign({
  productId: String(1000 + n),
  nome: 'Produto ' + n,
  link: 'https://shopee.com.br/produto-i.9.' + (1000 + n),
  imageUrl: 'https://cf.shopee.com.br/file/img' + n,
  preco: 'R$ 10,00',
  desconto: 20,
  ratingStar: '4.8',
  sales: 100 + n,
  shopName: 'Loja ' + n
}, extra || {})

function ambiente({ cfg, conectado = true, enviosFalham = [] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'namy-vitrine-'))
  const CONFIGS = path.join(dir, 'configs.json')
  const base = () => ({
    license: { active: true, expiresAt: new Date(Date.now() + 864e5).toISOString() },
    shopee: { appId: 'APP123', secret: 'SEGREDO-NAO-VAZAR' },
    groups: [
      { jid: 'geral@g.us', name: 'Geral', niche: 'geral' },
      { jid: 'geral2@g.us', name: 'Geral 2', niche: 'geral' },
      { jid: 'carros@g.us', name: 'Carros', niche: 'carros' },
      { jid: 'casa@g.us', name: 'Casa', niche: 'casa' }
    ],
    ads: { source: 'pool' }
  })
  fs.writeFileSync(CONFIGS, JSON.stringify({ u1: Object.assign(base(), cfg || {}), u2: base() }))
  const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return d } }
  const enviados = []
  const sessions = {
    publicState: () => ({ connected: conectado }),
    sendOffer: async (userId, jid, msg) => {
      if (enviosFalham.includes(jid)) throw Object.assign(new Error('WhatsApp nao esta conectado'), { code: 'WA' })
      enviados.push({ userId, jid, msg })
    }
  }
  return { dir, CONFIGS, readJson, sessions, enviados, cfgDe: (u) => readJson(CONFIGS, {})[u] }
}

function rotasDe(a, opcoes = {}) {
  const rotas = {}
  const app = { get: (p, ...h) => { rotas['GET ' + p] = h[h.length - 1] }, post: (p, ...h) => { rotas['POST ' + p] = h[h.length - 1] } }
  vitrineRoutes.mount(app, { auth: () => {}, readJson: a.readJson, CONFIGS: a.CONFIGS, DATA: a.dir, logs, sessions: a.sessions }, Object.assign({ pausaMs: 0 }, opcoes))
  return async function chamar(metodo, caminho, userId, { body, query } = {}) {
    const res = { code: 200, body: null, status(c) { this.code = c; return this }, json(b) { this.body = b; return this } }
    await rotas[metodo + ' ' + caminho]({ user: { id: userId }, body, query: query || {} }, res)
    return res
  }
}

test.beforeEach(() => { porItemModo = 'ok'; porItemChamadas.length = 0 })

test('ordenacoes liberadas sao so as validadas na API real', () => {
  assert.deepEqual(vitrine.ordens().map((o) => o.id), ['comissao', 'vendas', 'menor-preco', 'relevancia'])
  assert.deepEqual(vitrine.ORDENS.map((o) => o.sortType), [5, 2, 4, 1])
  assert.ok(vitrine.ORDENS.every((o) => ![0, 3, 6, 7].includes(o.sortType)), 'valores recusados/descartados nao entram')
  assert.ok(vitrine.ordens().find((o) => o.id === 'vendas').nota, 'a ordem aproximada avisa')
})

test('GET /vitrine: entrada invalida, sem chave, licenca vencida e sem login', async () => {
  const a = ambiente()
  const chamar = rotasDe(a)
  buscas.length = 0
  const recusa = async (query, re) => { const r = await chamar('GET', '/vitrine', 'u1', { query }); assert.equal(r.code, 400, JSON.stringify(query)); assert.match(r.body.error, re) }
  await recusa({ ordem: 'inventada' }, /Ordenacao/)
  await recusa({ ordem: 'preco-maior' }, /Ordenacao/)
  await recusa({ pagina: '0' }, /Pagina/)
  await recusa({ pagina: '51' }, /Pagina/)
  await recusa({ pagina: '1.5' }, /Pagina/)
  await recusa({ pagina: 'abc' }, /Pagina/)
  await recusa({ keyword: 'x'.repeat(81) }, /longa/)
  await recusa({ keyword: ['a', 'b'] }, /invalida/)
  assert.equal(buscas.length, 0, 'entrada invalida nunca chega na API')

  const semChave = ambiente({ cfg: { shopee: { appId: '', secret: '' } } })
  const r1 = await rotasDe(semChave)('GET', '/vitrine', 'u1', { query: {} })
  assert.equal(r1.code, 400)
  assert.equal(r1.body.codigo, 'SEM_CHAVE')

  const vencida = ambiente({ cfg: { license: { active: true, expiresAt: new Date(Date.now() - 1000).toISOString() } } })
  assert.equal((await rotasDe(vencida)('GET', '/vitrine', 'u1', { query: {} })).code, 403)
  assert.equal(buscas.length, 0)
})

test('busca: usa as chaves da conta, a ordem escolhida e marca "ja na fila" e "enviado recentemente"', async () => {
  const a = ambiente()
  const chamar = rotasDe(a)
  resposta = { itens: [oferta(1), oferta(2), oferta(3)], recebidos: 20 }
  buscas.length = 0
  // 1 ja esta na fila (mesmo texto) e 2 foi enviada ha pouco
  await pool.adicionar(a.dir, 'u1', a.cfgDe('u1'), { texto: ofertas.mensagem(oferta(1)), origem: 'vitrine' })
  await auditoria.registrar(a.dir, 'u1', { tipo: 'enviado', jid: 'geral@g.us', produtoKey: 'shopee:1002', nome: 'Produto 2' })

  const r = await chamar('GET', '/vitrine', 'u1', { query: { keyword: '  fone  ', ordem: 'menor-preco', pagina: '3' } })
  assert.equal(r.code, 200)
  assert.deepEqual(buscas[0].opts, { keyword: 'fone', page: 3, limit: 20, sortType: 4 })
  assert.equal(buscas[0].shopee.appId, 'APP123')
  assert.equal(r.body.ordem, 'menor-preco')
  assert.equal(r.body.pagina, 3)
  assert.equal(r.body.temMais, true)
  assert.equal(r.body.ordens.length, 4)
  const por = Object.fromEntries(r.body.itens.map((i) => [i.productId, i]))
  assert.equal(por['1001'].naFila, true)
  assert.equal(por['1002'].enviadoRecente, true)
  assert.equal(por['1003'].naFila, false)
  assert.equal(por['1003'].enviadoRecente, false)

  // padrao: sem parametros usa a comissao (sortType 5), como o painel sempre fez
  await chamar('GET', '/vitrine', 'u1', { query: {} })
  assert.equal(buscas[buscas.length - 1].opts.sortType, 5)
  assert.equal(buscas[buscas.length - 1].opts.page, 1)
  // o segredo nunca volta para o navegador
  assert.equal(JSON.stringify(r.body).includes('SEGREDO-NAO-VAZAR'), false)
})

test('busca: erro da API da Shopee chega como erro claro; ultima pagina nao oferece "proxima"', async () => {
  const a = ambiente()
  const chamar = rotasDe(a)
  resposta = Object.assign(new Error('API Shopee respondeu 502'), { status: 502 })
  let r = await chamar('GET', '/vitrine', 'u1', { query: {} })
  assert.equal(r.code, 502)
  assert.match(r.body.error, /Shopee/)
  resposta = { itens: [oferta(1)], recebidos: 7 }
  r = await chamar('GET', '/vitrine', 'u1', { query: {} })
  assert.equal(r.body.temMais, false)
})

test('limite de buscas por minuto: 429 e a API nao e chamada', async () => {
  const a = ambiente()
  const chamar = rotasDe(a, { buscasPorMin: 2 })
  resposta = { itens: [], recebidos: 0 }
  buscas.length = 0
  assert.equal((await chamar('GET', '/vitrine', 'u1', { query: {} })).code, 200)
  assert.equal((await chamar('GET', '/vitrine', 'u1', { query: {} })).code, 200)
  assert.equal((await chamar('GET', '/vitrine', 'u1', { query: {} })).code, 429)
  assert.equal(buscas.length, 2)
  assert.equal((await chamar('GET', '/vitrine', 'u2', { query: {} })).code, 200, 'outro cliente nao e afetado')
})

test('salvar: so pelo itemId do ultimo resultado; nada vem do navegador; repetida avisa duplicado', async () => {
  const a = ambiente()
  const chamar = rotasDe(a)
  resposta = { itens: [oferta(1), oferta(2)], recebidos: 2 }
  await chamar('GET', '/vitrine', 'u1', { query: {} })

  // tenta empurrar dados falsos junto: so o itemId vale
  let r = await chamar('POST', '/vitrine/salvar', 'u1', { body: { itemId: '1001', nome: 'HACK', link: 'https://evil.com/x', preco: 'R$ 0,01' } })
  assert.equal(r.code, 200)
  assert.equal(r.body.duplicado, false)
  const item = pool.listar(a.dir, 'u1').find((i) => i.id === r.body.item.id)
  assert.equal(item.origem, 'vitrine')
  assert.equal(item.nome, 'Produto 1', 'o nome da fila e o do produto, nao "OFERTA SHOPEE"')
  assert.equal(item.origemGrupo, 'Vitrine Shopee')
  assert.match(item.texto, /Produto 1/)
  assert.equal(item.texto.includes('evil.com'), false)
  assert.equal(item.texto.includes('HACK'), false)
  assert.deepEqual(item.marketplaces, ['shopee'])
  assert.equal(item.imagem.tipo, 'url')
  assert.equal(fila.listar(a.dir, 'u1').itens[0].status, 'fila', 'aparece na Fila de produtos')

  r = await chamar('POST', '/vitrine/salvar', 'u1', { body: { itemId: 1001 } })
  assert.equal(r.code, 200)
  assert.equal(r.body.duplicado, true, 'itemId numerico tambem e aceito; repetida nao duplica')
  assert.equal(pool.listar(a.dir, 'u1').length, 1)

  r = await chamar('POST', '/vitrine/salvar', 'u1', { body: { itemId: '9999' } })
  assert.equal(r.code, 404)
  assert.match(r.body.error, /expirou/)
  for (const ruim of [{}, { itemId: '' }, { itemId: 'abc' }, { itemId: { $ne: 1 } }, { itemId: '1'.repeat(30) }, { itemId: '12; DROP' }]) {
    assert.equal((await chamar('POST', '/vitrine/salvar', 'u1', { body: ruim })).code, 400, JSON.stringify(ruim))
  }
})

test('salvar: o resultado de um cliente nao serve para outro', async () => {
  const a = ambiente()
  const chamar = rotasDe(a)
  resposta = { itens: [oferta(1)], recebidos: 1 }
  await chamar('GET', '/vitrine', 'u1', { query: {} })
  const r = await chamar('POST', '/vitrine/salvar', 'u2', { body: { itemId: '1001' } })
  assert.equal(r.code, 404, 'u2 nunca buscou: nao enxerga o resultado do u1')
  assert.equal(pool.listar(a.dir, 'u2').length, 0)
})

test('resultado expira em 10 minutos', async () => {
  const a = ambiente()
  resposta = { itens: [oferta(1)], recebidos: 1 }
  const ctx = { userId: 'u1', cfg: a.cfgDe('u1'), dataDir: a.dir }
  await vitrine.buscar(ctx, {})
  const real = Date.now
  try {
    Date.now = () => real() + vitrine.CACHE_TTL + 1000
    await assert.rejects(() => vitrine.salvar(ctx, '1001'), (e) => e.status === 404)
  } finally { Date.now = real }
})

test('enviar: so grupos destino, escolha explicita, auditoria, log e historico', async () => {
  const a = ambiente()
  const chamar = rotasDe(a)
  resposta = { itens: [oferta(1)], recebidos: 1 }
  await chamar('GET', '/vitrine', 'u1', { query: {} })
  const r = await chamar('POST', '/vitrine/enviar', 'u1', { body: { itemId: '1001', jids: ['geral@g.us'], userId: 'u2' } })
  assert.equal(r.code, 200)
  assert.equal(r.body.ok, true)
  assert.equal(r.body.enviados, 1)
  assert.equal(a.enviados.length, 1)
  assert.equal(a.enviados[0].userId, 'u1', 'conta do JWT, nao a do corpo')
  assert.equal(a.enviados[0].jid, 'geral@g.us')
  assert.match(a.enviados[0].msg.text, /Produto 1/)
  assert.match(a.enviados[0].msg.text, /https:\/\/s\.shopee\.com\.br\/AFIL/, 'o link foi trocado pelo do cliente')
  assert.equal(a.enviados[0].msg.imageUrl, 'https://cf.shopee.com.br/file/img1')
  const rows = auditoria.listar(a.dir, 'u1')
  assert.ok(rows.some((x) => x.tipo === 'enviado' && x.fonte === 'vitrine' && x.produtoKey === 'shopee:1001' && x.jid === 'geral@g.us'))
  assert.ok(logs.read(a.dir, 'u1').some((l) => l.source === 'anuncio' && l.ok === true && /Vitrine: Produto 1/.test(l.message)))
  assert.equal(JSON.stringify(logs.read(a.dir, 'u1')).includes('SEGREDO-NAO-VAZAR'), false)
  assert.equal(auditoria.listar(a.dir, 'u2').length, 0)
  // o rodizio automatico passa a evitar esse produto nesse grupo
  assert.ok(auditoria.enviadosPara(a.dir, 'u1', 'geral@g.us', 7).has('shopee:1001'))
})

test('enviar: recusas antes de qualquer envio', async () => {
  const a = ambiente()
  const chamar = rotasDe(a)
  resposta = { itens: [oferta(1)], recebidos: 1 }
  await chamar('GET', '/vitrine', 'u1', { query: {} })
  const recusa = async (body, codigo, re) => {
    const r = await chamar('POST', '/vitrine/enviar', 'u1', { body })
    assert.equal(r.code, codigo, JSON.stringify(body) + ' -> ' + JSON.stringify(r.body))
    if (re) assert.match(r.body.error, re)
  }
  await recusa({ itemId: '1001' }, 400, /pelo menos um grupo/)
  await recusa({ itemId: '1001', jids: [] }, 400, /pelo menos um grupo/)
  await recusa({ itemId: '1001', jids: 'geral@g.us' }, 400, /pelo menos um grupo/)
  await recusa({ itemId: '1001', jids: [{ x: 1 }] }, 400, /invalido/)
  await recusa({ itemId: '1001', jids: ['outro-grupo@g.us'] }, 400, /destino/)
  await recusa({ itemId: '1001', jids: ['geral@g.us', 'outro-grupo@g.us'] }, 400, /destino/)
  await recusa({ itemId: '1001', jids: ['geral@g.us'], forcarNicho: 'sim' }, 400, /forcarNicho/)
  await recusa({ itemId: '9999', jids: ['geral@g.us'] }, 404, /expirou/)
  await recusa({ jids: ['geral@g.us'] }, 400, /invalida/)
  assert.equal(a.enviados.length, 0, 'nenhuma recusa chegou a enviar')
  // mais de 5 grupos
  const muitos = ambiente({ cfg: { groups: Array.from({ length: 7 }, (_, i) => ({ jid: 'g' + i + '@g.us', name: 'G' + i, niche: 'geral' })) } })
  const c2 = rotasDe(muitos)
  await c2('GET', '/vitrine', 'u1', { query: {} })
  const r = await c2('POST', '/vitrine/enviar', 'u1', { body: { itemId: '1001', jids: Array.from({ length: 6 }, (_, i) => 'g' + i + '@g.us') } })
  assert.equal(r.code, 400)
  assert.match(r.body.error, /maximo 5/i)
  assert.equal(muitos.enviados.length, 0)
})

test('enviar: WhatsApp desconectado e licenca vencida nao enviam nada', async () => {
  const off = ambiente({ conectado: false })
  const c1 = rotasDe(off)
  resposta = { itens: [oferta(1)], recebidos: 1 }
  await c1('GET', '/vitrine', 'u1', { query: {} })
  const r1 = await c1('POST', '/vitrine/enviar', 'u1', { body: { itemId: '1001', jids: ['geral@g.us'] } })
  assert.equal(r1.code, 400)
  assert.match(r1.body.error, /WhatsApp/)
  assert.equal(off.enviados.length, 0)

  const vencida = ambiente({ cfg: { license: { active: true, expiresAt: new Date(Date.now() - 1000).toISOString() } } })
  const r2 = await rotasDe(vencida)('POST', '/vitrine/enviar', 'u1', { body: { itemId: '1001', jids: ['geral@g.us'] } })
  assert.equal(r2.code, 403)
})

test('enviar: respeita o nicho do grupo, a menos que o cliente marque "enviar mesmo assim"', async () => {
  const a = ambiente()
  const chamar = rotasDe(a)
  resposta = { itens: [oferta(1, { nome: 'Jogo de panelas inox antiaderente' })], recebidos: 1 }
  await chamar('GET', '/vitrine', 'u1', { query: {} })
  let r = await chamar('POST', '/vitrine/enviar', 'u1', { body: { itemId: '1001', jids: ['carros@g.us', 'casa@g.us'] } })
  assert.equal(r.code, 200)
  assert.equal(r.body.enviados, 1)
  const carros = r.body.results.find((x) => x.jid === 'carros@g.us')
  assert.equal(carros.pulado, true)
  assert.match(carros.motivo, /nicho/)
  assert.deepEqual(a.enviados.map((e) => e.jid), ['casa@g.us'])
  assert.ok(auditoria.listar(a.dir, 'u1').some((x) => x.tipo === 'pulado' && x.jid === 'carros@g.us' && x.fonte === 'vitrine'))

  r = await chamar('POST', '/vitrine/enviar', 'u1', { body: { itemId: '1001', jids: ['carros@g.us'], forcarNicho: true } })
  assert.equal(r.body.enviados, 1)
  assert.deepEqual(a.enviados.map((e) => e.jid), ['casa@g.us', 'carros@g.us'])
})

test('enviar: falha em um grupo nao derruba os outros e o historico so conta o que saiu', async () => {
  const a = ambiente({ enviosFalham: ['geral@g.us'] })
  const chamar = rotasDe(a)
  resposta = { itens: [oferta(1)], recebidos: 1 }
  await chamar('GET', '/vitrine', 'u1', { query: {} })
  const r = await chamar('POST', '/vitrine/enviar', 'u1', { body: { itemId: '1001', jids: ['geral@g.us', 'geral2@g.us'] } })
  assert.equal(r.code, 200)
  assert.equal(r.body.enviados, 1)
  assert.equal(r.body.results.find((x) => x.jid === 'geral@g.us').ok, false)
  assert.equal(r.body.results.find((x) => x.jid === 'geral2@g.us').ok, true)
  const rows = auditoria.listar(a.dir, 'u1')
  assert.ok(rows.some((x) => x.tipo === 'falha' && x.jid === 'geral@g.us' && /WhatsApp/.test(x.motivo)))
  assert.ok(rows.some((x) => x.tipo === 'enviado' && x.jid === 'geral2@g.us'))
  // tudo falhando: ok=false
  const b = ambiente({ enviosFalham: ['geral@g.us'] })
  const c2 = rotasDe(b)
  await c2('GET', '/vitrine', 'u1', { query: {} })
  const r2 = await c2('POST', '/vitrine/enviar', 'u1', { body: { itemId: '1001', jids: ['geral@g.us'] } })
  assert.equal(r2.body.ok, false)
  assert.equal(r2.body.enviados, 0)
})

test('enviar: link que nao da para trocar barra o envio inteiro', async () => {
  const a = ambiente()
  const chamar = rotasDe(a)
  resposta = { itens: [oferta(1, { link: 'https://shopee.com.br/' })], recebidos: 1 } // sem produto
  await chamar('GET', '/vitrine', 'u1', { query: {} })
  const r = await chamar('POST', '/vitrine/enviar', 'u1', { body: { itemId: '1001', jids: ['geral@g.us'] } })
  assert.equal(r.code, 400)
  assert.match(r.body.error, /link/i)
  assert.equal(a.enviados.length, 0)
})

test('limite de envios por minuto: 429 sem enviar', async () => {
  const a = ambiente()
  const chamar = rotasDe(a, { enviosPorMin: 1 })
  resposta = { itens: [oferta(1), oferta(2)], recebidos: 2 }
  await chamar('GET', '/vitrine', 'u1', { query: {} })
  assert.equal((await chamar('POST', '/vitrine/enviar', 'u1', { body: { itemId: '1001', jids: ['geral@g.us'] } })).code, 200)
  const r = await chamar('POST', '/vitrine/enviar', 'u1', { body: { itemId: '1002', jids: ['geral@g.us'] } })
  assert.equal(r.code, 429)
  assert.equal(a.enviados.length, 1)
})

test('pedido recusado por validacao nao gasta a cota de envios nem de buscas', async () => {
  const a = ambiente()
  const chamar = rotasDe(a, { enviosPorMin: 2, buscasPorMin: 2 })
  resposta = { itens: [oferta(1)], recebidos: 1 }
  buscas.length = 0
  for (let i = 0; i < 6; i++) assert.equal((await chamar('GET', '/vitrine', 'u1', { query: { ordem: 'inventada' } })).code, 400)
  assert.equal((await chamar('GET', '/vitrine', 'u1', { query: {} })).code, 200, 'as 6 buscas invalidas nao gastaram a cota')
  for (let i = 0; i < 6; i++) assert.equal((await chamar('POST', '/vitrine/enviar', 'u1', { body: { itemId: '1001', jids: ['grupo-que-nao-e-meu@g.us'] } })).code, 400)
  assert.equal((await chamar('POST', '/vitrine/enviar', 'u1', { body: { itemId: '1001', jids: ['geral@g.us'] } })).code, 200)
  assert.equal(a.enviados.length, 1)
  assert.equal(buscas.length, 1, 'so a busca valida chegou na API')
})

test('salvar guarda de onde a oferta veio (itemId, loja e preco) para conferir depois', async () => {
  const a = ambiente()
  const chamar = rotasDe(a)
  resposta = { itens: [oferta(1, { shopId: '55', precoNum: 10 })], recebidos: 1 }
  await chamar('GET', '/vitrine', 'u1', { query: {} })
  const r = await chamar('POST', '/vitrine/salvar', 'u1', { body: { itemId: '1001' } })
  const item = pool.listar(a.dir, 'u1').find((i) => i.id === r.body.item.id)
  assert.deepEqual(item.shopee, { itemId: '1001', shopId: '55', precoNum: 10 })
})

test('enviar confere na Shopee antes: sumiu = recusa sem enviar; API fora = recusa sem enviar', async () => {
  const a = ambiente()
  const chamar = rotasDe(a)
  resposta = { itens: [oferta(1)], recebidos: 1 }
  await chamar('GET', '/vitrine', 'u1', { query: {} })
  porItemModo = 'indisponivel'
  let r = await chamar('POST', '/vitrine/enviar', 'u1', { body: { itemId: '1001', jids: ['geral@g.us'] } })
  assert.equal(r.code, 409)
  assert.match(r.body.error, /nao esta mais disponivel/)
  porItemModo = 'erro'
  r = await chamar('POST', '/vitrine/enviar', 'u1', { body: { itemId: '1001', jids: ['geral@g.us'] } })
  assert.equal(r.code, 502)
  assert.match(r.body.error, /Nao consegui conferir/)
  assert.equal(JSON.stringify(r.body).includes('API fora do ar'), false, 'detalhe interno nao vaza')
  assert.equal(a.enviados.length, 0)
})

test('enviar com o preco que mudou: a mensagem sai com o preco de agora', async () => {
  const a = ambiente()
  const chamar = rotasDe(a)
  resposta = { itens: [oferta(1)], recebidos: 1 }
  await chamar('GET', '/vitrine', 'u1', { query: {} })
  porItemModo = 'preco'
  const r = await chamar('POST', '/vitrine/enviar', 'u1', { body: { itemId: '1001', jids: ['geral@g.us'] } })
  assert.equal(r.code, 200)
  assert.equal(r.body.enviados, 1)
  assert.match(a.enviados[0].msg.text, /R\$ 8,00/)
  assert.equal(a.enviados[0].msg.text.includes('R$ 10,00'), false, 'o preco antigo nao sai')
})

test('a cota recusada (429) nao gasta consulta na Shopee', async () => {
  const a = ambiente()
  const chamar = rotasDe(a, { enviosPorMin: 1 })
  resposta = { itens: [oferta(1)], recebidos: 1 }
  await chamar('GET', '/vitrine', 'u1', { query: {} })
  assert.equal((await chamar('POST', '/vitrine/enviar', 'u1', { body: { itemId: '1001', jids: ['geral@g.us'] } })).code, 200)
  assert.equal(porItemChamadas.length, 1)
  assert.equal((await chamar('POST', '/vitrine/enviar', 'u1', { body: { itemId: '1001', jids: ['geral@g.us'] } })).code, 429)
  assert.equal(porItemChamadas.length, 1, 'recusado pela cota: nenhuma consulta nova')
})
