const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

process.env.SAAS_MASTER_KEY = 'chave-mestra-so-para-teste-0123456789abcdef'

const links = require('./links')
const ofertas = require('../ofertas')
const cupons = require('./cupons')
const cuponsRoutes = require('./cuponsRoutes')
const copy = require('./copy')
const publicador = require('./publicador')
const pool = require('./pool')
const vitrine = require('./vitrine')
const agendadas = require('./agendadas')
const exec = require('./agendadasExec')
const copyRoutes = require('./copyRoutes')

links.validarAoVivo = async () => ({ ok: true, motivo: '' })
ofertas.encurtar = async (a, s, url) => 'https://s.shopee.com.br/AFIL' + url.replace(/\D/g, '').slice(-4)

const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'namy-cupons-'))
const BRT = (s) => Date.parse(s + '-03:00')
const NOW = BRT('2026-10-25T12:00:00')
const CFG = (extra) => Object.assign({
  license: { active: true, expiresAt: new Date(Date.now() + 864e5).toISOString() },
  shopee: { appId: 'A', secret: 'S' },
  groups: [{ jid: 'g1@g.us', name: 'Casa 1', niche: 'casa' }, { jid: 'g2@g.us', name: 'Carros', niche: 'carros' }],
  copy: { modelo: '{nome}\n💰 {preco}\n🎟️ Cupom: {cupom}\n🔗 {link}' }
}, extra || {})
const hojeBR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const emDias = (n) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + n * 86400000))
const C = (extra) => Object.assign({ codigo: 'SHOPEE10', loja: 'shopee', regra: 'R$ 10 off acima de R$ 99', validoAte: emDias(10) }, extra || {})

// ---------------------------------------------------------------- validacao e vigencia

test('validar: codigo, loja, datas, regra e nichos', () => {
  assert.equal(cupons.validar(C({ codigo: ' shopee10 ' })).codigo, 'SHOPEE10')
  for (const ruim of ['', 'ab', 'tem espaco', 'x'.repeat(25), 'cod!go', "A'; drop", '-ABC']) assert.throws(() => cupons.validar(C({ codigo: ruim })), /Código/, ruim)
  assert.throws(() => cupons.validar(C({ loja: 'magalu' })), /Loja/)
  assert.throws(() => cupons.validar(C({ validoAte: '' })), /até quando/)
  assert.throws(() => cupons.validar(C({ validoAte: '2026-02-31' })), /até quando/)
  assert.throws(() => cupons.validar(C({ validoDe: '2026-13-01' })), /início/)
  assert.throws(() => cupons.validar(C({ validoDe: '2026-11-10', validoAte: '2026-11-01' })), /depois do fim/)
  assert.throws(() => cupons.validar(C({ regra: 'veja https://x.com' })), /link/)
  assert.throws(() => cupons.validar(C({ regra: 'a {b} c' })), /chaves/)
  assert.throws(() => cupons.validar(C({ regra: 'x'.repeat(121) })), /grande/)
  assert.throws(() => cupons.validar(C({ nichos: ['inventado'] })), /Nicho/)
  assert.equal(cupons.validar(C({ regra: 'linha1\nlinha2' })).regra, 'linha1 linha2')
  assert.equal(cupons.validar(C({ loja: undefined })).loja, 'shopee')
})

test('situacao: borda do dia no fuso de Brasilia, inicio futuro, desligado e vence em breve', () => {
  const c = (extra) => Object.assign({ ativo: true, validoDe: '', validoAte: '2026-10-25' }, extra)
  assert.equal(cupons.situacao(c(), BRT('2026-10-25T23:59:00')), 'vence-em-breve')
  assert.equal(cupons.situacao(c(), BRT('2026-10-26T00:00:01')), 'vencido')
  assert.equal(cupons.situacao(c({ validoAte: '2026-12-01' }), NOW), 'vigente')
  assert.equal(cupons.situacao(c({ validoDe: '2026-10-26', validoAte: '2026-12-01' }), NOW), 'aguardando')
  assert.equal(cupons.situacao(c({ validoDe: '2026-10-25', validoAte: '2026-12-01' }), BRT('2026-10-25T00:00:00')), 'vigente')
  assert.equal(cupons.situacao(c({ ativo: false, validoAte: '2026-12-01' }), NOW), 'desligado')
})

test('criar/editar/ativar/remover, duplicado, limite e isolamento por conta', async () => {
  const d = dir()
  const a = await cupons.criar(d, 'u1', C())
  assert.equal(a.ativo, true)
  await assert.rejects(() => cupons.criar(d, 'u1', C()), /já está cadastrado/)
  await cupons.criar(d, 'u1', C({ loja: 'amazon' }))
  const ed = await cupons.editar(d, 'u1', a.id, C({ regra: 'nova regra' }))
  assert.equal(ed.regra, 'nova regra')
  await assert.rejects(() => cupons.editar(d, 'u1', a.id, C({ loja: 'amazon' })), /já está cadastrado/)
  await assert.rejects(() => cupons.editar(d, 'u1', 'x', C()), /não encontrado/)
  assert.equal((await cupons.ativar(d, 'u1', a.id, false)).ativo, false)
  assert.equal(cupons.listar(d, 'u2').length, 0)
  await cupons.remover(d, 'u1', a.id)
  await assert.rejects(() => cupons.remover(d, 'u1', a.id), /não encontrado/)
  const d2 = dir()
  for (let i = 0; i < cupons.MAX_CUPONS; i++) await cupons.criar(d2, 'u1', C({ codigo: 'COD' + i }))
  await assert.rejects(() => cupons.criar(d2, 'u1', C({ codigo: 'COD-EXTRA' })), /Limite/)
})

test('escolher: so vigente, loja certa antes do geral, vence primeiro, respeita nicho', async () => {
  const d = dir()
  assert.equal(cupons.escolher(d, 'u1', { loja: 'shopee' }), null, 'sem cadastro')
  await cupons.criar(d, 'u1', C({ codigo: 'VELHO', validoDe: '2020-01-01', validoAte: '2020-02-01' }))
  await cupons.criar(d, 'u1', C({ codigo: 'FUTURO', validoDe: emDias(5), validoAte: emDias(20) }))
  assert.equal(cupons.escolher(d, 'u1', { loja: 'shopee' }), null, 'vencido e futuro nao entram')
  await cupons.criar(d, 'u1', C({ codigo: 'GERAL5', loja: 'geral', validoAte: emDias(3) }))
  await cupons.criar(d, 'u1', C({ codigo: 'SHOP20', validoAte: emDias(30), regra: '' }))
  assert.equal(cupons.escolher(d, 'u1', { loja: 'shopee' }).codigo, 'SHOP20', 'da loja antes do geral')
  assert.equal(cupons.escolher(d, 'u1', { loja: 'amazon' }).codigo, 'GERAL5', 'amazon so tem o geral')
  const so = await cupons.criar(d, 'u1', C({ codigo: 'CASA15', validoAte: emDias(1), nichos: ['casa'] }))
  assert.equal(cupons.escolher(d, 'u1', { loja: 'shopee', nicho: 'casa' }).codigo, 'CASA15', 'vence primeiro, nicho certo')
  assert.equal(cupons.escolher(d, 'u1', { loja: 'shopee', nicho: 'carros' }).codigo, 'SHOP20', 'nicho errado nao pega')
  assert.equal(cupons.escolher(d, 'u1', { loja: 'shopee' }).codigo, 'SHOP20', 'sem nicho nao pega o restrito')
  await cupons.ativar(d, 'u1', so.id, false)
  assert.equal(cupons.escolher(d, 'u1', { loja: 'shopee', nicho: 'casa' }).codigo, 'SHOP20', 'desligado nao entra')
  assert.equal(cupons.escolher(d, 'u2', { loja: 'shopee' }), null, 'outra conta')
})

test('vencidoNoTexto: so codigo cadastrado que nao vale; desconhecido passa; outro cadastro vigente salva', async () => {
  const d = dir()
  await cupons.criar(d, 'u1', C({ codigo: 'ACABOU', validoDe: '2020-01-01', validoAte: '2020-02-01' }))
  await cupons.criar(d, 'u1', C({ codigo: 'LIGADO', validoAte: emDias(9) }))
  const off = await cupons.criar(d, 'u1', C({ codigo: 'DESLIG', validoAte: emDias(9) }))
  await cupons.ativar(d, 'u1', off.id, false)
  assert.match(cupons.vencidoNoTexto(d, 'u1', 'Super oferta! Cupom ACABOU hoje').motivo, /vencido: ACABOU/)
  assert.match(cupons.vencidoNoTexto(d, 'u1', 'use o cupom DESLIG').motivo, /desligado: DESLIG/)
  assert.equal(cupons.vencidoNoTexto(d, 'u1', 'use o cupom LIGADO'), null)
  assert.equal(cupons.vencidoNoTexto(d, 'u1', 'use o cupom DESCONHECIDO'), null, 'nao cadastrado: nao e da nossa conta')
  assert.equal(cupons.vencidoNoTexto(d, 'u1', 'sem cupom nenhum'), null)
  await cupons.criar(d, 'u1', C({ codigo: 'ACABOU', loja: 'amazon', validoAte: emDias(5) }))
  assert.equal(cupons.vencidoNoTexto(d, 'u1', 'Cupom ACABOU'), null, 'o mesmo codigo vigente em outra loja')
})

// ---------------------------------------------------------------- mensagem

const OF = { productId: '9', nome: 'Panela Inox 5 Pecas', preco: 'R$ 50,00', desconto: 30, ratingStar: '4.8', sales: 100, shopName: 'Loja X', link: 'https://s.shopee.com.br/X' }

test('{cupom} no modelo: aparece com codigo e regra; sem cupom a linha some; variavel e valida', () => {
  assert.equal(copy.validarModelo('{nome} {cupom} {link}'), '')
  assert.ok(copy.VARIAVEIS.includes('cupom'))
  const cfg = CFG()
  const com = copy.baseTexto(cfg, Object.assign({}, OF, { cupom: { codigo: 'SHOPEE10', regra: 'R$ 10 off acima de R$ 99' } }))
  assert.match(com, /🎟️ Cupom: SHOPEE10 — R\$ 10 off acima de R\$ 99/)
  const sem = copy.baseTexto(cfg, OF)
  assert.equal(sem.includes('Cupom'), false)
  assert.match(sem, /💰 R\$ 50,00\n🔗/)
  assert.match(copy.baseTexto(cfg, Object.assign({}, OF, { cupom: { codigo: 'X1Y2Z3', regra: '' } })), /Cupom: X1Y2Z3\n/)
})

test('trava da IA: cupom so passa quando existe e o codigo e o cadastrado', () => {
  const texto = (extra) => '🍳 Panela Inox 5 Pecas por R$ 50,00 na Loja X! ' + extra
  assert.equal(copy.validarIA(texto('Use o cupom SHOPEE10 e economize.'), OF).ok, false, 'sem cupom cadastrado: proibido')
  const of = Object.assign({}, OF, { cupom: { codigo: 'SHOPEE10', regra: 'R$ 10 off acima de R$ 99' } })
  assert.equal(copy.validarIA(texto('Use o cupom SHOPEE10 e aproveite.'), of).ok, true)
  const errado = copy.validarIA(texto('Use o cupom SUPER50 e aproveite.'), of)
  assert.equal(errado.ok, false)
  assert.match(errado.motivo, /cupom que nao e o cadastrado: SUPER50/)
  assert.equal(copy.validarIA(texto('Cupom SHOPEE10 com R$ 10 off acima de R$ 99.'), of).ok, true, 'numeros da regra sao dados reais')
  assert.equal(copy.validarIA(texto('Cupom SHOPEE10 com R$ 25 off.'), of).ok, false, 'numero inventado continua barrado')
  assert.equal(copy.validarIA(texto('Frete gratis com cupom SHOPEE10.'), of).ok, false, 'frete continua proibido')
  assert.match(copy.promptDe(of).sistema, /copie o codigo EXATAMENTE/)
  assert.match(copy.promptDe(of).usuario, /cupom: SHOPEE10/)
  assert.match(copy.promptDe(OF).sistema, /PROIBIDO falar de frete, entrega, prazo, cupom/)
})

test('previa do modelo mostra o cupom real vigente, ou um de exemplo', async () => {
  const d = dir()
  const cfgs = { u1: CFG() }
  const rotas = {}
  const app = { get: (p, ...h) => { rotas['GET ' + p] = h[h.length - 1] }, post: (p, ...h) => { rotas['POST ' + p] = h[h.length - 1] }, put: (p, ...h) => { rotas['PUT ' + p] = h[h.length - 1] } }
  copyRoutes.mount(app, { auth: () => {}, readJson: () => cfgs, writeJson: () => {}, CONFIGS: 'x', DATA: d })
  const chamar = async () => { const res = { code: 200, body: null, status(c) { this.code = c; return this }, json(b) { this.body = b; return this } }; await rotas['POST /copy/previa']({ user: { id: 'u1' }, body: {} }, res); return res.body }
  assert.match((await chamar()).texto, /EXEMPLO10 — cupom de exemplo/)
  await cupons.criar(d, 'u1', C())
  assert.match((await chamar()).texto, /SHOPEE10 — R\$ 10 off/)
  assert.match(copyRoutes.MODELO_SUGERIDO, /Cupom: \{cupom\}/)
})

// ---------------------------------------------------------------- publicador, vitrine, agendadas

const sessaoFalsa = () => { const enviados = []; return { enviados, publicState: () => ({ connected: true }), sendOffer: async (u, jid, msg) => { enviados.push({ jid, msg }) } } }

test('publicador (banco): texto colado com cupom cadastrado vencido e pulado; cupom vigente e desconhecido passam', async () => {
  const d = dir()
  const cfg = CFG({ ads: { source: 'pool' }, groups: [{ jid: 'g1@g.us', name: 'Casa 1', niche: 'casa' }] })
  await cupons.criar(d, 'u1', C({ codigo: 'ACABOU', validoDe: '2020-01-01', validoAte: '2020-02-01' }))
  await pool.adicionar(d, 'u1', cfg, { texto: 'Panela inox\nCupom ACABOU\nhttps://shopee.com.br/panela-i.9.7001', origem: 'manual' })
  let s = sessaoFalsa()
  let out = await publicador.publicar({ userId: 'u1', cfg, dataDir: d, sessions: s })
  assert.equal(out.enviados, 0)
  assert.equal(s.enviados.length, 0)
  assert.match(JSON.stringify(out.pulados), /nenhuma oferta/)
  const aud = require('./auditoria').listar(d, 'u1', { tipo: 'pulado' })
  assert.ok(aud.some((r) => /cupom vencido: ACABOU/.test(r.motivo)), JSON.stringify(aud.map((r) => r.motivo)))
  const d2 = dir()
  await pool.adicionar(d2, 'u1', cfg, { texto: 'Panela inox\nCupom NAOCADASTRADO\nhttps://shopee.com.br/panela-i.9.7002', origem: 'manual' })
  s = sessaoFalsa()
  out = await publicador.publicar({ userId: 'u1', cfg, dataDir: d2, sessions: s })
  assert.equal(out.enviados, 1, 'codigo que nao e seu nao e bloqueado')
})

test('publicador (API) e Vitrine usam o cupom cadastrado no modelo', async () => {
  const d = dir()
  const cfg = CFG({ ads: { source: 'api' }, groups: [{ jid: 'g1@g.us', name: 'Casa 1', niche: 'casa' }] })
  await cupons.criar(d, 'u1', C({ nichos: ['casa'] }))
  const real = global.fetch
  global.fetch = async () => ({ status: 200, json: async () => ({ data: { productOfferV2: { nodes: [{ itemId: '8001', productName: 'Panela inox 5 pecas antiaderente', offerLink: 'https://shopee.com.br/panela-i.9.8001', productLink: 'https://shopee.com.br/panela-i.9.8001', priceMin: '50', priceMax: '50', priceDiscountRate: 30, ratingStar: '4.8', sales: 100, shopName: 'Loja', shopId: '9', imageUrl: 'https://cf.shopee.com.br/x' }] } } }) })
  try {
    const s = sessaoFalsa()
    const out = await publicador.publicar({ userId: 'u1', cfg, dataDir: d, sessions: s })
    assert.equal(out.enviados, 1)
    assert.match(s.enviados[0].msg.text, /🎟️ Cupom: SHOPEE10 — R\$ 10 off acima de R\$ 99/)
    const aud = require('./auditoria').listar(d, 'u1', { tipo: 'enviado' })
    assert.deepEqual(aud[0].cupons, ['SHOPEE10'])
  } finally { global.fetch = real }

  const o = { productId: '6001', shopId: '9', nome: 'Panela inox 5 pecas', link: 'https://shopee.com.br/panela-i.9.6001', imageUrl: '', preco: 'R$ 50,00', precoNum: 50, desconto: 30, ratingStar: '4.8', sales: 100, shopName: 'Loja' }
  const rb = ofertas.buscar; const ri = ofertas.porItem
  ofertas.buscar = async () => ({ itens: [o], recebidos: 1 })
  ofertas.porItem = async () => ({ status: 'ok', oferta: o })
  try {
    const ctx = { userId: 'u1', cfg, dataDir: d }
    await vitrine.buscar(ctx, {}, {})
    const s = sessaoFalsa()
    const r = await vitrine.enviar(ctx, { itemId: '6001', jids: ['g1@g.us'] }, { sessions: s, pausaMs: 0 })
    assert.equal(r.enviados, 1)
    assert.match(s.enviados[0].msg.text, /Cupom: SHOPEE10/)
    // nicho errado: o cupom restrito a "casa" nao vai para um grupo de carros
    const cfg2 = Object.assign({}, cfg, { groups: [{ jid: 'g2@g.us', name: 'Carros', niche: 'carros' }] })
    await vitrine.buscar({ userId: 'u1', cfg: cfg2, dataDir: d }, {}, {})
    const s2 = sessaoFalsa()
    await vitrine.enviar({ userId: 'u1', cfg: cfg2, dataDir: d }, { itemId: '6001', jids: ['g2@g.us'], forcarNicho: true }, { sessions: s2, pausaMs: 0 })
    assert.equal(s2.enviados[0].msg.text.includes('Cupom'), false)
  } finally { ofertas.buscar = rb; ofertas.porItem = ri }
})

test('agendada com {cupom}: troca pelo vigente; sem cupom vigente NAO envia', async () => {
  const d = dir()
  const cfg = CFG({ copy: undefined, groups: [{ jid: 'g1@g.us', name: 'Casa 1', niche: 'casa' }], sources: [] })
  const s = sessaoFalsa()
  const deps = { sessions: s, DATA: d, dormir: async () => {}, random: () => 0.5 }
  const it = await agendadas.criar(d, 'u1', cfg, { nome: 'Cupom do dia', texto: 'Hoje use o cupom {cupom}!', destinos: ['g1@g.us'], recorrencia: { tipo: 'diaria', hora: '09:00' } })
  let reg = await exec.executar(deps, 'u1', cfg, it)
  assert.equal(reg.resultado, 'falhou')
  assert.match(reg.motivo, /não há cupom vigente/)
  assert.equal(s.enviados.length, 0, 'nunca sai "use o cupom" sem cupom')
  await cupons.criar(d, 'u1', C({ codigo: 'DIA10', regra: '' }))
  reg = await exec.executar(deps, 'u1', cfg, it)
  assert.equal(reg.resultado, 'ok')
  assert.equal(s.enviados[0].msg.text, 'Hoje use o cupom DIA10!')
})

// ---------------------------------------------------------------- rotas

function rotas(cfgs, opcoes) {
  const d = dir()
  const R = {}
  const app = { get: (p, ...h) => { R['GET ' + p] = h[h.length - 1] }, post: (p, ...h) => { R['POST ' + p] = h[h.length - 1] } }
  const readJson = (f, def) => (f === 'x' ? cfgs : def)
  cuponsRoutes.mount(app, { auth: () => {}, readJson, CONFIGS: 'x', DATA: d }, opcoes)
  return { d, chamar: async (m, c, userId, body) => {
    const res = { code: 200, body: null, status(x) { this.code = x; return this }, json(b) { this.body = b; return this } }
    await R[m + ' ' + c]({ user: { id: userId }, body: body || {}, query: {} }, res)
    return res
  } }
}

test('rotas: validacao, dono, situacao na lista e limite por minuto', async () => {
  const R = rotas({ u1: {}, u2: {} }, { escritasPorMin: 8 })
  assert.equal((await R.chamar('GET', '/cupons', 'nao-existe')).code, 404)
  assert.equal((await R.chamar('POST', '/cupons/criar', 'u1', C({ codigo: '!!' }))).code, 400)
  const c = await R.chamar('POST', '/cupons/criar', 'u1', C())
  assert.equal(c.code, 200)
  assert.equal(c.body.cupom.situacao, 'vigente')
  const id = c.body.cupom.id
  assert.equal((await R.chamar('POST', '/cupons/ativar', 'u1', { id, ativo: 'x' })).code, 400)
  assert.equal((await R.chamar('POST', '/cupons/ativar', 'u1', { id: '../x', ativo: true })).code, 400)
  assert.equal((await R.chamar('POST', '/cupons/ativar', 'u2', { id, ativo: false })).code, 404, 'outra conta nao acha')
  assert.equal((await R.chamar('POST', '/cupons/ativar', 'u1', { id, ativo: false })).body.cupom.situacao, 'desligado')
  assert.equal((await R.chamar('POST', '/cupons/editar', 'u1', Object.assign({ id }, C({ regra: 'outra' })))).body.cupom.regra, 'outra')
  const l = await R.chamar('GET', '/cupons', 'u1')
  assert.equal(l.body.cupons.length, 1)
  assert.ok(l.body.nichos.some((n) => n.id === 'casa'))
  assert.equal((await R.chamar('GET', '/cupons', 'u2')).body.cupons.length, 0)
  assert.equal((await R.chamar('POST', '/cupons/remover', 'u2', { id })).code, 404)
  assert.equal((await R.chamar('POST', '/cupons/remover', 'u1', { id })).code, 200)
  assert.equal((await R.chamar('POST', '/cupons/criar', 'u1', C({ codigo: 'AAA1' }))).code, 200)
  assert.equal((await R.chamar('POST', '/cupons/criar', 'u1', C({ codigo: 'AAA2' }))).code, 429, 'nona escrita na janela')
})
