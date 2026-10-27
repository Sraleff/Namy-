const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

process.env.SAAS_MASTER_KEY = 'teste-chave-mestra-com-mais-de-32-caracteres!'

const telegram = require('./telegram')
const pool = require('./pool')
const auditoria = require('./auditoria')
const publicador = require('./publicador')
const conversor = require('./conversor')
const converterOriginal = conversor.converterTexto

const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'namy-telegram-'))
const TOKEN = '123456789:AAHsegredoDoBotQueNuncaPodeVazar_abcdefghij'
const BOT = { id: 123456789, is_bot: true, first_name: 'Ofertas', username: 'ofertas_bot' }

// Telegram simulado: responde por método; guarda as chamadas (sem o token)
function telegramFalso(respostas = {}) {
  const chamadas = []
  telegram._http.fetch = async (url, init) => {
    const metodo = url.split('/').pop()
    assert.ok(url.startsWith('https://api.telegram.org/bot'), 'só fala com a API oficial')
    const corpo = init.body instanceof FormData ? Object.fromEntries([...init.body.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : '[arquivo]'])) : JSON.parse(init.body)
    chamadas.push({ metodo, corpo })
    const r = typeof respostas[metodo] === 'function' ? respostas[metodo](corpo, chamadas) : respostas[metodo]
    const dados = r || { ok: true, result: { message_id: chamadas.length } }
    return { status: dados.ok ? 200 : (dados.error_code || 400), json: async () => dados }
  }
  return chamadas
}

const okGetMe = { ok: true, result: BOT }

async function contaConectada(d, user = 'u1', extra = {}) {
  telegramFalso({ getMe: okGetMe })
  await telegram.conectar(d, user, TOKEN)
  const canal = { ok: true, result: { id: -1001234567890, title: 'Canal Casa', type: 'channel' } }
  telegramFalso({ getChat: canal, getChatMember: { ok: true, result: { status: 'administrator', can_post_messages: true } } })
  await telegram.adicionarDestino(d, user, { chat: '@canalcasa', nicho: extra.nicho || 'casa' })
  return telegram.carregar(d, user)
}

// ---------------------------------------------------------------- formato

test('paraHtml: negrito, itálico, riscado e mono do WhatsApp; escapa < > &; não mexe em link', () => {
  const t = telegram.paraHtml('*Air Fryer* _só hoje_ ~R$ 300~ ```CUPOM10``` <b>&\nhttps://shopee.com.br/Air_Fryer_*top*-i.1.2')
  assert.match(t, /<b>Air Fryer<\/b>/)
  assert.match(t, /<i>só hoje<\/i>/)
  assert.match(t, /<s>R\$ 300<\/s>/)
  assert.match(t, /<code>CUPOM10<\/code>/)
  assert.match(t, /&lt;b&gt;&amp;/)
  assert.match(t, /https:\/\/shopee\.com\.br\/Air_Fryer_\*top\*-i\.1\.2/, 'link intacto')
})

// ---------------------------------------------------------------- token

test('o token nunca aparece em erro: rede, 401 e descrição da API', async () => {
  telegram._http.fetch = async (url) => { throw new Error('falhou ' + url) }
  await assert.rejects(() => telegram.chamar(TOKEN, 'getMe'), (e) => !e.message.includes(TOKEN) && !e.message.includes('AAHsegredo') && e.temporario)
  telegramFalso({ getMe: { ok: false, error_code: 401, description: 'Unauthorized ' + TOKEN } })
  await assert.rejects(() => telegram.chamar(TOKEN, 'getMe'), (e) => e.tokenInvalido && !e.message.includes(TOKEN))
  telegramFalso({ sendMessage: { ok: false, error_code: 403, description: 'Forbidden: bot is not a member' } })
  await assert.rejects(() => telegram.chamar(TOKEN, 'sendMessage', {}), (e) => e.semAcesso)
  telegramFalso({ sendMessage: { ok: false, error_code: 429, description: 'Too Many Requests: retry after 5' } })
  await assert.rejects(() => telegram.chamar(TOKEN, 'sendMessage', {}), (e) => e.status === 429 && e.temporario)
  telegramFalso({ getChat: { ok: false, error_code: 400, description: 'Bad Request: chat not found' } })
  await assert.rejects(() => telegram.chamar(TOKEN, 'getChat', {}), /não encontrado/)
  await assert.rejects(() => telegram.chamar('nao-e-token', 'getMe'), /inválido/)
})

test('conectar: formato errado não chama a API; token fica cifrado e o estado não devolve o token', async () => {
  const d = dir()
  const chamadas = telegramFalso({ getMe: okGetMe })
  await assert.rejects(() => telegram.conectar(d, 'u1', 'abc'), /token inteiro/)
  assert.equal(chamadas.length, 0)
  await telegram.conectar(d, 'u1', TOKEN)
  const e = telegram.estado(d, 'u1')
  assert.equal(e.conectado, true)
  assert.equal(e.bot.username, 'ofertas_bot')
  assert.equal(JSON.stringify(e).includes(TOKEN), false)
  for (const f of fs.readdirSync(d, { recursive: true })) {
    const p = path.join(d, f)
    if (fs.statSync(p).isFile()) assert.equal(fs.readFileSync(p, 'utf8').includes('AAHsegredo'), false, 'token em texto puro em ' + f)
  }
  telegramFalso({ getMe: { ok: true, result: { id: 1, is_bot: false } } })
  await assert.rejects(() => telegram.conectar(d, 'u1', TOKEN), /não é de um bot/)
})

test('destinos: canal exige admin que publica; grupo aceita membro; particular não; repetido e limite', async () => {
  const d = dir()
  telegramFalso({ getMe: okGetMe })
  await telegram.conectar(d, 'u1', TOKEN)
  const chat = (type, id = -1001000000001) => ({ ok: true, result: { id, title: 'X ' + id, type } })
  telegramFalso({ getChat: chat('channel'), getChatMember: { ok: true, result: { status: 'member' } } })
  await assert.rejects(() => telegram.adicionarDestino(d, 'u1', { chat: '@canalx', nicho: 'casa' }), /administrador/)
  telegramFalso({ getChat: chat('channel'), getChatMember: { ok: true, result: { status: 'administrator', can_post_messages: false } } })
  await assert.rejects(() => telegram.adicionarDestino(d, 'u1', { chat: '@canalx' }), /publicar/)
  telegramFalso({ getChat: chat('private'), getChatMember: { ok: true, result: { status: 'member' } } })
  await assert.rejects(() => telegram.adicionarDestino(d, 'u1', { chat: '-1001000000001' }), /particular/)
  telegramFalso({ getChat: chat('supergroup', -1002000000002), getChatMember: { ok: true, result: { status: 'member' } } })
  const db = await telegram.adicionarDestino(d, 'u1', { chat: 'https://t.me/grupox', nicho: 'todos' })
  assert.equal(db.destinos[0].id, '-1002000000002')
  assert.equal(db.destinos[0].nicho, 'todos')
  await assert.rejects(() => telegram.adicionarDestino(d, 'u1', { chat: '-1002000000002' }), (e) => e.status === 409)
  await assert.rejects(() => telegram.adicionarDestino(d, 'u1', { chat: 'grupo sem arroba' }), /Informe/)
  await assert.rejects(() => telegram.adicionarDestino(d, 'u1', { chat: '@canalx', nicho: 'inventado' }), /Nicho/)
  for (let i = 0; i < 9; i++) {
    telegramFalso({ getChat: chat('supergroup', -2000000000 - i), getChatMember: { ok: true, result: { status: 'member' } } })
    await telegram.adicionarDestino(d, 'u1', { chat: String(-2000000000 - i) })
  }
  telegramFalso({ getChat: chat('supergroup', -3000000000), getChatMember: { ok: true, result: { status: 'member' } } })
  await assert.rejects(() => telegram.adicionarDestino(d, 'u1', { chat: '-3000000000' }), /No máximo 10/)
  await assert.rejects(() => telegram.ligar(dir(), 'u9', true), /Conecte o bot/)
})

test('trocar de bot limpa os destinos (o bot novo não tem acesso a eles)', async () => {
  const d = dir()
  await contaConectada(d)
  telegramFalso({ getMe: { ok: true, result: Object.assign({}, BOT, { id: 999999 }) } })
  const db = await telegram.conectar(d, 'u1', TOKEN)
  assert.equal(db.destinos.length, 0)
})

// ---------------------------------------------------------------- espelho

const conversorOk = []
function stubConversor() {
  conversorOk.length = 0
  conversor.converterTexto = async (texto, ctx) => {
    conversorOk.push(ctx.atribuicao)
    if (/QUEBRADO/.test(texto)) return { ok: false, erros: [{ motivo: 'link quebrado' }], trocas: [] }
    return { ok: true, texto: texto.replace(/https:\/\/\S+/, 'https://s.shopee.com.br/TG'), trocas: [{ de: 'x', para: 'https://s.shopee.com.br/TG' }], marketplaces: ['shopee'] }
  }
}

const cfgPro = (extra = {}) => Object.assign({ license: { plan: 'pro_mensal', tier: 'pro', active: true, expiresAt: new Date(Date.now() + 864e5).toISOString() } }, extra)
const OFERTA = { fonte: 'pool', produtoKey: 'pool:1', nome: 'Panela', texto: '*Panela* R$ 50 https://shopee.com.br/p-i.1.1', imageUrl: 'https://cf.shopee.com.br/p.jpg' }

test('espelhar: só ligado, com plano que tem Telegram, no nicho certo; "todos" só na primeira da rodada', async () => {
  stubConversor()
  const d = dir()
  await contaConectada(d, 'u1', { nicho: 'casa' })
  telegramFalso({ getChat: { ok: true, result: { id: -1009000000009, title: 'Todos', type: 'supergroup' } }, getChatMember: { ok: true, result: { status: 'member' } } })
  await telegram.adicionarDestino(d, 'u1', { chat: '-1009000000009', nicho: 'todos' })
  const ctx = { userId: 'u1', cfg: cfgPro(), dataDir: d }
  let chamadas = telegramFalso()
  assert.deepEqual(await telegram.espelhar(ctx, OFERTA, 'casa', { primeira: true }), [], 'desligado: nada')
  await telegram.ligar(d, 'u1', true)
  assert.deepEqual(await telegram.espelhar(Object.assign({}, ctx, { cfg: cfgPro({ license: { tier: 'start', active: true, expiresAt: ctx.cfg.license.expiresAt } }) }), OFERTA, 'casa', { primeira: true }), [], 'Start não tem Telegram')
  chamadas = telegramFalso()
  const r = await telegram.espelhar(ctx, OFERTA, 'casa', { primeira: true })
  assert.deepEqual(r.map((x) => x.id).sort(), ['-1001234567890', '-1009000000009'])
  assert.ok(chamadas.every((c) => c.metodo === 'sendPhoto' && /<b>Panela<\/b>/.test(c.corpo.caption) && c.corpo.parse_mode === 'HTML'))
  assert.ok(chamadas.every((c) => c.corpo.caption.includes('https://s.shopee.com.br/TG')))
  assert.deepEqual(conversorOk[0], { origem: 'telegram', nicho: 'casa', grupo: undefined })
  chamadas = telegramFalso()
  await telegram.espelhar(ctx, OFERTA, 'casa', { primeira: false })
  assert.deepEqual(chamadas.map((c) => c.corpo.chat_id), ['-1001234567890'], 'todos: só a primeira oferta da rodada')
  chamadas = telegramFalso()
  await telegram.espelhar(ctx, OFERTA, 'pets', { primeira: false })
  assert.equal(chamadas.length, 0, 'nicho diferente não recebe')
  const rows = auditoria.listar(d, 'u1')
  assert.ok(rows.some((x) => x.tipo === 'enviado' && x.jid === 'tg:-1009000000009'))
})

test('espelhar: atribuição por destino; foto ruim cai para texto; texto longo vai sem foto', async () => {
  stubConversor()
  const d = dir()
  await contaConectada(d)
  await telegram.ligar(d, 'u1', true)
  const ctx = { userId: 'u1', cfg: cfgPro({ comissoes: { porGrupo: true } }), dataDir: d }
  let chamadas = telegramFalso({ sendPhoto: { ok: false, error_code: 400, description: 'Bad Request: wrong file identifier/HTTP URL specified' } })
  const r = await telegram.espelhar(ctx, OFERTA, 'casa')
  assert.equal(r[0].ok, true)
  assert.deepEqual(chamadas.map((c) => c.metodo), ['sendPhoto', 'sendMessage'])
  assert.deepEqual(conversorOk[0], { origem: 'telegram', nicho: 'casa', grupo: 'tg:-1001234567890' })
  chamadas = telegramFalso()
  await telegram.espelhar(ctx, Object.assign({}, OFERTA, { texto: 'x'.repeat(1100) + ' https://shopee.com.br/p-i.1.1' }), 'casa')
  assert.deepEqual(chamadas.map((c) => c.metodo), ['sendMessage'])
})

test('espelhar: token revogado para tudo até colar outro; link quebrado vira erro do destino', async () => {
  stubConversor()
  const d = dir()
  await contaConectada(d)
  await telegram.ligar(d, 'u1', true)
  const ctx = { userId: 'u1', cfg: cfgPro(), dataDir: d }
  const quebrado = await telegram.espelhar(ctx, Object.assign({}, OFERTA, { texto: 'QUEBRADO https://shopee.com.br/x-i.1.1' }), 'casa')
  assert.equal(quebrado[0].ok, false)
  assert.match(telegram.carregar(d, 'u1').destinos[0].ultimoErro, /link quebrado/)
  telegramFalso({ sendPhoto: { ok: false, error_code: 401, description: 'Unauthorized' } })
  const r = await telegram.espelhar(ctx, OFERTA, 'casa')
  assert.equal(r[0].ok, false)
  assert.equal(telegram.carregar(d, 'u1').tokenInvalido, true)
  const chamadas = telegramFalso()
  assert.deepEqual(await telegram.espelhar(ctx, OFERTA, 'casa'), [])
  assert.equal(chamadas.length, 0)
  telegramFalso({ getMe: okGetMe })
  await telegram.conectar(d, 'u1', TOKEN)
  assert.equal(telegram.carregar(d, 'u1').tokenInvalido, false, 'colar o token de novo libera')
})

test('publicador: oferta da automação vai ao WhatsApp e ao canal do Telegram do mesmo nicho', async () => {
  // conversor de verdade: link da Amazon troca a tag sem rede
  conversor.converterTexto = converterOriginal
  const d = dir()
  await contaConectada(d, 'u1', { nicho: 'casa' })
  await telegram.ligar(d, 'u1', true)
  const cfg = cfgPro({ ads: { source: 'pool' }, amazon: { tag: 'namy-20' }, groups: [{ jid: 'casa@g.us', name: 'Casa', niche: 'casa' }] })
  await pool.adicionar(d, 'u1', cfg, { texto: '🍳 Jogo de panelas inox\nhttps://www.amazon.com.br/dp/B0BBBBBBBB' })
  const enviadosWa = []
  const chamadas = telegramFalso()
  const out = await publicador.publicar({ userId: 'u1', cfg, dataDir: d, sessions: { sendOffer: async (_u, jid, msg) => { enviadosWa.push({ jid, msg }) } } })
  assert.equal(out.enviados, 1)
  assert.equal(enviadosWa[0].jid, 'casa@g.us')
  assert.equal(chamadas.length, 1)
  assert.equal(chamadas[0].metodo, 'sendMessage', 'oferta sem foto vai como texto')
  assert.match(chamadas[0].corpo.text, /tag=namy-20/)
})
