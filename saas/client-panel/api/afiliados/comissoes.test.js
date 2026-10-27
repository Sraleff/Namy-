const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

process.env.SAAS_MASTER_KEY = 'chave-mestra-so-para-teste-0123456789abcdef'

const links = require('./links')
const ofertas = require('../ofertas')
const atribuicao = require('./atribuicao')
const comissoes = require('./comissoes')
const comissoesRoutes = require('./comissoesRoutes')
const conversor = require('./conversor')
const pool = require('./pool')
const publicador = require('./publicador')
const vitrine = require('./vitrine')
const logs = require('../logs')

links.validarAoVivo = async () => ({ ok: true, motivo: '' })

const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'namy-comis-'))
const SEGREDO = 'SEGREDO-NAO-VAZAR'
const CFG = (extra) => Object.assign({
  license: { active: true, expiresAt: new Date(Date.now() + 864e5).toISOString() },
  shopee: { appId: 'APP123', secret: SEGREDO },
  groups: [{ jid: 'g1@g.us', name: 'Casa 1', niche: 'casa' }, { jid: 'g2@g.us', name: 'Casa 2', niche: 'casa' }],
  ads: { source: 'pool' }
}, extra || {})

// ---------------------------------------------------------------- subIds

test('subIdsDe: so letras e numeros, padrao namy sem origem, hash no lugar do jid', () => {
  assert.deepEqual(atribuicao.subIdsDe(), ['namy'])
  assert.deepEqual(atribuicao.subIdsDe({ origem: 'inventada', nicho: 'casa' }), ['namy'])
  assert.deepEqual(atribuicao.subIdsDe({ origem: 'api', nicho: 'casa' }), ['api', 'casa'])
  assert.deepEqual(atribuicao.subIdsDe({ origem: 'banco' }), ['banco', 'geral'])
  const ids = atribuicao.subIdsDe({ origem: 'vitrine', nicho: 'Casa-e_Cozinha!!', grupo: '120363000000000000@g.us' })
  assert.equal(ids.length, 3)
  assert.ok(ids.every((x) => /^[a-z0-9]{1,12}$/.test(x)), JSON.stringify(ids))
  assert.match(ids[2], /^g[0-9a-f]{8}$/)
  assert.equal(ids.join('').includes('120363'), false, 'o numero do grupo nao vai no link')
  assert.equal(atribuicao.hashGrupo('a@g.us'), atribuicao.hashGrupo('a@g.us'))
  assert.notEqual(atribuicao.hashGrupo('a@g.us'), atribuicao.hashGrupo('b@g.us'))
})

test('desfazer: le o utmContent no formato da Shopee (separado por hifen) e tolera o resto', () => {
  const h = atribuicao.hashGrupo('g1@g.us')
  assert.deepEqual(atribuicao.desfazer('api-casa-' + h + '--'), { origem: 'api', nicho: 'casa', grupoHash: h })
  assert.deepEqual(atribuicao.desfazer('namy----'), { origem: 'namy', nicho: '', grupoHash: '' })
  assert.deepEqual(atribuicao.desfazer(''), { origem: 'namy', nicho: '', grupoHash: '' })
  assert.deepEqual(atribuicao.desfazer(null), { origem: 'namy', nicho: '', grupoHash: '' })
  assert.equal(atribuicao.desfazer('qualquer-coisa').origem, 'outro')
})

test('encurtar manda subIds validos (e o padrao se nada servir)', async () => {
  const real = global.fetch
  const corpos = []
  global.fetch = async (url, init) => { corpos.push(JSON.parse(init.body).query); return { status: 200, json: async () => ({ data: { generateShortLink: { shortLink: 'https://s.shopee.com.br/X' } } }) } }
  try {
    assert.equal(await ofertas.encurtar('A', 'S', 'https://shopee.com.br/product/1/2', ['api', 'casa']), 'https://s.shopee.com.br/X')
    assert.match(corpos[0], /subIds: \["api","casa"\]/)
    await ofertas.encurtar('A', 'S', 'https://shopee.com.br/product/1/2')
    assert.match(corpos[1], /subIds: \["namy"\]/)
    await ofertas.encurtar('A', 'S', 'https://shopee.com.br/product/1/2', ['a-b', 'c_d', 'x'.repeat(21), '"; drop'])
    assert.match(corpos[2], /subIds: \["namy"\]/, 'nada valido = padrao; nada de injecao')
    assert.deepEqual(ofertas.subIdsValidos(['a', 'b', 'c', 'd', 'e', 'f']), ['a', 'b', 'c', 'd', 'e'])
  } finally { global.fetch = real }
})

// ---------------------------------------------------------------- relatorio

const T0 = Math.floor(Date.now() / 1000) - 3 * 86400
const venda = (id, status, liquida, utm, itens) => ({
  conversionId: String(id), purchaseTime: T0 + id, conversionStatus: status, totalCommission: String(liquida), netCommission: String(liquida), utmContent: utm,
  orders: [{ orderId: 'o' + id, items: itens || [{ itemId: '77', itemName: 'Panela', qty: 1, actualAmount: '100', itemTotalCommission: String(liquida) }] }]
})

function simularConversoes(paginas) {
  const chamadas = []
  const original = ofertas.conversoes
  ofertas.conversoes = async (shopee, args) => {
    chamadas.push(args)
    const lista = typeof paginas === 'function' ? paginas(args, chamadas.length) : paginas
    const i = args.scrollId ? Number(args.scrollId) : 0
    const nodes = lista[i] || []
    const prox = i + 1 < lista.length
    return { nodes, hasNextPage: prox, scrollId: prox ? String(i + 1) : '' }
  }
  return { chamadas, restaurar: () => { ofertas.conversoes = original } }
}

test('agregar: separa por status, origem, nicho e grupo; cancelada nao entra nas quebras; repetida conta uma vez', () => {
  const h1 = atribuicao.hashGrupo('g1@g.us')
  const nodes = [
    venda(1, 'COMPLETED', 10, 'api-casa-' + h1 + '--'),
    venda(2, 'PENDING', 5.5, 'banco-casa---'),
    venda(3, 'CANCELLED', 99, 'api-casa---'),
    venda(4, 'COMPLETED', 2, 'namy----'),
    venda(4, 'COMPLETED', 2, 'namy----'),
    venda(5, 'PENDING', 1, 'api-carros-' + atribuicao.hashGrupo('sumiu@g.us') + '--')
  ]
  const r = comissoes.agregar(nodes, [{ jid: 'g1@g.us', name: 'Casa 1' }])
  assert.deepEqual(r.totais, { pendente: 6.5, concluido: 12, cancelado: 99, outro: 0 })
  assert.deepEqual(r.vendas, { pendente: 2, concluido: 2, cancelado: 1, outro: 0 })
  assert.equal(r.estimado, 18.5)
  assert.deepEqual(r.porOrigem.map((x) => x.nome).sort(), ['api', 'banco', 'namy (antes da atribuicao)'])
  assert.equal(r.porOrigem.find((x) => x.nome === 'api').comissao, 11)
  assert.equal(r.porNicho.find((x) => x.nome === 'casa').comissao, 15.5)
  assert.equal(r.porGrupo.find((x) => x.nome === 'Casa 1').comissao, 10)
  assert.ok(r.porGrupo.some((x) => /grupo removido/.test(x.nome)))
  assert.equal(r.produtos[0].nome, 'Panela')
  assert.equal(r.porDia.reduce((s, d) => s + d.comissao, 0), 18.5)
})

test('statusDe e periodo', () => {
  assert.equal(comissoes.statusDe('COMPLETED'), 'concluido')
  assert.equal(comissoes.statusDe('PENDING'), 'pendente')
  assert.equal(comissoes.statusDe('CANCELLED'), 'cancelado')
  assert.equal(comissoes.statusDe('???'), 'outro')
  const agora = Date.parse('2026-10-25T15:00:00-03:00')
  assert.throws(() => comissoes.periodo('2026-01-01', '2026-10-25', agora), /máximo/)
  assert.throws(() => comissoes.periodo('2026-10-25', '2026-10-01', agora), /inválido/)
  assert.throws(() => comissoes.periodo('2027-01-01', '2027-01-05', agora), /futuro|inválido/)
  assert.ok(comissoes.periodo('2026-10-01', '2026-10-25', agora).fim > comissoes.periodo('2026-10-01', '2026-10-25', agora).inicio)
})

test('resumo: pagina por scrollId, divide 90 dias em janelas de 30, guarda cache e o ultimo resultado', async () => {
  const d = dir()
  const sim = simularConversoes((args) => [[venda(args.inicio, 'COMPLETED', 1, 'api-casa---')], [venda(args.inicio + 1, 'PENDING', 2, 'banco-casa---')]])
  try {
    const ctx = { userId: 'u1', cfg: CFG(), dataDir: d }
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
    const de = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() - 88 * 86400000))
    const r = await comissoes.resumo(ctx, { de, ate: hoje })
    assert.equal(r.ok, true)
    assert.equal(sim.chamadas.length, 6, '3 janelas x 2 paginas')
    assert.ok(sim.chamadas.every((c) => c.fim - c.inicio <= 30 * 86400))
    assert.equal(r.vendas.concluido, 3)
    assert.equal(r.vendas.pendente, 3)
    await comissoes.resumo(ctx, { de, ate: hoje })
    assert.equal(sim.chamadas.length, 6, 'segunda leitura sai do cache')
    await comissoes.resumo(ctx, { de, ate: hoje, forcar: true })
    assert.equal(sim.chamadas.length, 12, 'forcar ignora o cache')
    assert.equal(comissoes.ultimo(d, 'u1').vendas.pendente, 3)
    assert.equal(fs.existsSync(path.join(d, 'comissoes', 'u1.json')), true)
  } finally { sim.restaurar() }
})

test('resumo sem chave Shopee e com a API fora (sem vazar segredo, devolvendo o ultimo guardado)', async () => {
  const d = dir()
  await assert.rejects(() => comissoes.resumo({ userId: 'u1', cfg: { groups: [] }, dataDir: d }, {}), /App ID/)
  const sim = simularConversoes([[venda(1, 'COMPLETED', 3, 'api-casa---')]])
  const ctx = { userId: 'u9', cfg: CFG(), dataDir: d }
  try {
    await comissoes.resumo(ctx, { forcar: true })
  } finally { sim.restaurar() }
  const original = ofertas.conversoes
  ofertas.conversoes = async () => { throw Object.assign(new Error('falhou com ' + SEGREDO + ' e APP123'), { status: 502 }) }
  try {
    await assert.rejects(() => comissoes.resumo(ctx, { forcar: true }), (e) => {
      assert.equal(JSON.stringify(e.message).includes(SEGREDO), false)
      assert.equal(e.message.includes('APP123'), false)
      assert.equal(e.status, 502)
      assert.equal(e.ultimo.vendas.concluido, 1)
      return true
    })
  } finally { ofertas.conversoes = original }
})

test('ofertas.conversoes: monta a consulta so com numeros e recusa periodo invalido', async () => {
  const real = global.fetch
  const q = []
  global.fetch = async (u, init) => { q.push(JSON.parse(init.body).query); return { status: 200, json: async () => ({ data: { conversionReport: { nodes: [{ conversionId: '1' }], pageInfo: { hasNextPage: true, scrollId: 'abc"; x' } } } }) } }
  try {
    const r = await ofertas.conversoes({ appId: 'A', secret: 'S' }, { inicio: 1000, fim: 2000, scrollId: 'a"b' })
    assert.equal(r.nodes.length, 1)
    assert.equal(r.hasNextPage, true)
    assert.match(q[0], /purchaseTimeStart: 1000, purchaseTimeEnd: 2000, limit: 100, scrollId: "a\\"b"/)
    await assert.rejects(() => ofertas.conversoes({ appId: 'A', secret: 'S' }, { inicio: 'x', fim: 2 }), /Período/)
    await assert.rejects(() => ofertas.conversoes({ appId: 'A', secret: 'S' }, { inicio: 5, fim: 2 }), /Período/)
    await assert.rejects(() => ofertas.conversoes({}, { inicio: 1, fim: 2 }), /App ID/)
    assert.equal(q.length, 1)
  } finally { global.fetch = real }
})

// ---------------------------------------------------------------- rotas

function rotasDe(cfgs, d, opcoes) {
  const rotas = {}
  const app = { get: (p, ...h) => { rotas['GET ' + p] = h[h.length - 1] }, post: (p, ...h) => { rotas['POST ' + p] = h[h.length - 1] }, put: (p, ...h) => { rotas['PUT ' + p] = h[h.length - 1] } }
  const CONFIGS = path.join(d, 'configs.json')
  fs.writeFileSync(CONFIGS, JSON.stringify(cfgs))
  const readJson = (f, def) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return def } }
  const writeJson = (f, v) => fs.writeFileSync(f, JSON.stringify(v))
  comissoesRoutes.mount(app, { auth: () => {}, readJson, writeJson, CONFIGS, DATA: d }, opcoes)
  return { CONFIGS, readJson, chamar: async (m, c, userId, { body, query } = {}) => {
    const res = { code: 200, body: null, status(x) { this.code = x; return this }, json(b) { this.body = b; return this } }
    await rotas[m + ' ' + c]({ user: { id: userId }, body, query: query || {} }, res)
    return res
  } }
}

test('rotas: entrada validada, limite por minuto, config por grupo so do dono', async () => {
  const d = dir()
  const R = rotasDe({ u1: CFG(), u2: CFG() }, d, { atualizacoesPorMin: 2 })
  const sim = simularConversoes([[venda(1, 'COMPLETED', 4, 'api-casa---')]])
  try {
    assert.equal((await R.chamar('GET', '/comissoes', 'u1', { query: { de: '2026-1-1' } })).code, 400)
    assert.equal((await R.chamar('GET', '/comissoes', 'u1', { query: { de: "2026-10-01'; x" } })).code, 400)
    assert.equal((await R.chamar('GET', '/comissoes', 'nao-existe')).code, 404)
    const ok = await R.chamar('GET', '/comissoes', 'u1')
    assert.equal(ok.code, 200)
    assert.equal(ok.body.vendas.concluido, 1)
    assert.equal((await R.chamar('POST', '/comissoes/atualizar', 'u1', { body: {} })).code, 200)
    assert.equal((await R.chamar('POST', '/comissoes/atualizar', 'u1', { body: {} })).code, 200)
    assert.equal((await R.chamar('POST', '/comissoes/atualizar', 'u1', { body: {} })).code, 429)
    assert.equal((await R.chamar('POST', '/comissoes/atualizar', 'u2', { body: {} })).code, 200, 'limite e por usuario')
    assert.equal((await R.chamar('PUT', '/comissoes/config', 'u1', { body: { porGrupo: 'sim' } })).code, 400)
    assert.equal((await R.chamar('PUT', '/comissoes/config', 'u1', { body: {} })).code, 400)
    assert.equal((await R.chamar('PUT', '/comissoes/config', 'u1', { body: { porGrupo: true } })).code, 200)
    assert.equal((await R.chamar('GET', '/comissoes/config', 'u1')).body.porGrupo, true)
    assert.equal((await R.chamar('GET', '/comissoes/config', 'u2')).body.porGrupo, false, 'outra conta nao muda')
    assert.equal(R.readJson(R.CONFIGS, {}).u2.comissoes, undefined)
  } finally { sim.restaurar() }
})

// ---------------------------------------------------------------- envio com atribuicao

function espiarEncurtar() {
  const chamadas = []
  const original = ofertas.encurtar
  ofertas.encurtar = async (appId, secret, url, subIds) => { chamadas.push({ url, subIds }); return 'https://s.shopee.com.br/' + (subIds || ['namy']).join('') + 'X' + chamadas.length }
  return { chamadas, restaurar: () => { ofertas.encurtar = original } }
}
const sessaoFalsa = (falham = []) => {
  const enviados = []
  return { enviados, sendOffer: async (u, jid, msg) => { if (falham.includes(jid)) throw new Error('falha de teste'); enviados.push({ jid, msg }) } }
}

test('banco: o link sai com origem e nicho (modo padrao: um link para todos os grupos)', async () => {
  const d = dir()
  const cfg = CFG()
  await pool.adicionar(d, 'u1', cfg, { texto: 'Jogo de panelas inox\nhttps://shopee.com.br/panela-i.9.2001', origem: 'manual' })
  const esp = espiarEncurtar()
  try {
    const s = sessaoFalsa()
    const out = await publicador.publicar({ userId: 'u1', cfg, dataDir: d, sessions: s })
    assert.equal(out.enviados, 2)
    assert.equal(esp.chamadas.length, 1, 'um link so')
    assert.deepEqual(esp.chamadas[0].subIds, ['banco', 'casa'])
    assert.equal(s.enviados[0].msg.text, s.enviados[1].msg.text)
  } finally { esp.restaurar() }
})

test('banco com atribuicao por grupo: um link por grupo, cada um com o seu codigo; falha em um nao derruba o outro', async () => {
  const d = dir()
  const cfg = CFG({ comissoes: { porGrupo: true } })
  await pool.adicionar(d, 'u1', cfg, { texto: 'Jogo de panelas inox\nhttps://shopee.com.br/panela-i.9.2001', origem: 'manual' })
  const esp = espiarEncurtar()
  try {
    const s = sessaoFalsa()
    const out = await publicador.publicar({ userId: 'u1', cfg, dataDir: d, sessions: s })
    assert.equal(out.enviados, 2)
    const porGrupo = esp.chamadas.filter((c) => c.subIds.length === 3)
    assert.equal(porGrupo.length, 2)
    assert.deepEqual(porGrupo.map((c) => c.subIds[2]).sort(), [atribuicao.hashGrupo('g1@g.us'), atribuicao.hashGrupo('g2@g.us')].sort())
    assert.notEqual(s.enviados[0].msg.text, s.enviados[1].msg.text, 'links diferentes por grupo')
    for (const e of s.enviados) assert.equal(e.msg.text.includes(e.jid.split('@')[0] + '@'), false)
  } finally { esp.restaurar() }
})

test('atribuicao por grupo: erro ao gerar o link de um grupo vira falha so dele', async () => {
  const d = dir()
  const cfg = CFG({ comissoes: { porGrupo: true } })
  await pool.adicionar(d, 'u1', cfg, { texto: 'Jogo de panelas inox\nhttps://shopee.com.br/panela-i.9.2999', origem: 'manual' })
  const original = ofertas.encurtar
  const h2 = atribuicao.hashGrupo('g2@g.us')
  ofertas.encurtar = async (a, s, url, subIds) => (subIds[2] === h2 ? null : 'https://s.shopee.com.br/' + subIds.join(''))
  try {
    const s = sessaoFalsa()
    const out = await publicador.publicar({ userId: 'u1', cfg, dataDir: d, sessions: s })
    assert.equal(out.enviados, 1)
    assert.deepEqual(s.enviados.map((e) => e.jid), ['g1@g.us'])
    const r2 = out.results.find((r) => r.jid === 'g2@g.us')
    assert.equal(r2.ok, false)
    assert.match(r2.error, /link/)
  } finally { ofertas.encurtar = original }
})

test('API: o link sai com origem api e nicho; por grupo, o texto so sai depois de convertido', async () => {
  const d = dir()
  const real = global.fetch
  const subs = []
  global.fetch = async (u, init) => {
    const q = JSON.parse(init.body).query
    if (/generateShortLink/.test(q)) {
      const ids = JSON.parse(q.match(/subIds: (\[[^\]]*\])/)[1])
      subs.push(ids)
      return { status: 200, json: async () => ({ data: { generateShortLink: { shortLink: 'https://s.shopee.com.br/' + ids.join('') } } }) }
    }
    return { status: 200, json: async () => ({ data: { productOfferV2: { nodes: [{ itemId: '5001', productName: 'Panela inox 5 pecas antiaderente', offerLink: 'https://shopee.com.br/panela-i.9.5001', productLink: 'https://shopee.com.br/panela-i.9.5001', priceMin: '50', priceMax: '50', priceDiscountRate: 30, ratingStar: '4.8', sales: 100, shopName: 'Loja', shopId: '9', imageUrl: 'https://cf.shopee.com.br/x' }] } } }) }
  }
  try {
    let cfg = CFG({ ads: { source: 'api' } })
    let s = sessaoFalsa()
    let out = await publicador.publicar({ userId: 'u1', cfg, dataDir: d, sessions: s })
    assert.equal(out.enviados, 2, JSON.stringify(out))
    assert.deepEqual(subs[0], ['api', 'casa'])
    assert.match(s.enviados[0].msg.text, /s\.shopee\.com\.br\/apicasa/)

    subs.length = 0
    cfg = CFG({ ads: { source: 'api' }, comissoes: { porGrupo: true } })
    s = sessaoFalsa()
    out = await publicador.publicar({ userId: 'u7', cfg, dataDir: d, sessions: s })
    assert.equal(out.enviados, 2, JSON.stringify(out))
    assert.equal(subs.length, 2, 'um link por grupo, nenhum a mais')
    assert.ok(subs.every((x) => x.length === 3 && x[0] === 'api'), JSON.stringify(subs))
    for (const e of s.enviados) {
      assert.match(e.msg.text, /s\.shopee\.com\.br\//)
      assert.equal(e.msg.text.includes('shopee.com.br/panela-i.9.5001'), false, 'link original nunca sai')
    }
    assert.notEqual(s.enviados[0].msg.text, s.enviados[1].msg.text)
  } finally { global.fetch = real }
})

test('vitrine: link com origem vitrine e nicho; por grupo, um link para cada grupo', async () => {
  const o = { productId: '6001', shopId: '9', nome: 'Panela inox 5 pecas', link: 'https://shopee.com.br/panela-i.9.6001', imageUrl: '', preco: 'R$ 50,00', precoNum: 50, desconto: 30, ratingStar: '4.8', sales: 100, shopName: 'Loja' }
  const realBuscar = ofertas.buscar
  const realItem = ofertas.porItem
  ofertas.buscar = async () => ({ itens: [o], recebidos: 1 })
  ofertas.porItem = async () => ({ status: 'ok', oferta: o })
  const esp = espiarEncurtar()
  try {
    for (const porGrupo of [false, true]) {
      esp.chamadas.length = 0
      const d = dir()
      const cfg = CFG(porGrupo ? { comissoes: { porGrupo: true } } : {})
      const ctx = { userId: porGrupo ? 'v2' : 'v1', cfg, dataDir: d }
      const s = sessaoFalsa()
      const lista = await vitrine.buscar(ctx, {}, {})
      const r = await vitrine.enviar(ctx, { itemId: '6001', jids: ['g1@g.us', 'g2@g.us'] }, { sessions: Object.assign(s, { publicState: () => ({ connected: true }) }), logs, pausaMs: 0 })
      assert.equal(r.enviados, 2)
      if (!porGrupo) {
        assert.deepEqual(esp.chamadas.map((c) => c.subIds), [['vitrine', 'casa']])
        assert.equal(s.enviados[0].msg.text, s.enviados[1].msg.text)
      } else {
        assert.ok(esp.chamadas.filter((c) => c.subIds.length === 3).length >= 2)
        assert.notEqual(s.enviados[0].msg.text, s.enviados[1].msg.text)
      }
    }
  } finally { esp.restaurar(); ofertas.buscar = realBuscar; ofertas.porItem = realItem }
})
