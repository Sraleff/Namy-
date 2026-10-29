const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

process.env.SAAS_MASTER_KEY = 'teste-chave-mestra-com-mais-de-32-caracteres!'

const whatsMsg = require('./whatsMsg')
const cerebro = require('./cerebro')
const comandos = require('./comandos')
const moderacao = require('./moderacao')
const assistente = require('./assistente')
const pool = require('./pool')
const cofre = require('./cofre')
const auditoria = require('./auditoria')
const { criarLimitador } = require('./linkRoutes')

const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'namy-cerebro-'))
const EU = '5511999990000'
const MEU_LID = '87654321'
const G1 = '120363000000000001@g.us'
const G2 = '120363000000000002@g.us'
const FONTE = '120363000000000009@g.us'
const exp = () => new Date(Date.now() + 864e5).toISOString()
const contaPro = (extra = {}) => Object.assign({
  license: { plan: 'pro_mensal', tier: 'pro', active: true, expiresAt: exp() },
  ads: { enabled: true, dailyLimit: 5 },
  groups: [{ jid: G1, name: 'Ofertas Casa', niche: 'casa' }, { jid: G2, name: 'Ofertas 2', niche: 'geral' }],
  sources: [{ jid: FONTE, name: 'Fonte' }],
  copy: { ia: { ativo: false, provedor: 'groq' } }
}, extra)

function sockFalso({ admins = [], euAdmin = true } = {}) {
  const enviados = []
  const removidos = []
  return {
    enviados,
    removidos,
    user: { id: EU + ':12@s.whatsapp.net', lid: MEU_LID + ':12@lid' },
    sendMessage: async (jid, conteudo, opcoes) => { enviados.push({ jid, conteudo, opcoes }) },
    groupMetadata: async () => ({ participants: [{ id: MEU_LID + '@lid', phoneNumber: EU + '@s.whatsapp.net', admin: euAdmin ? 'admin' : null }].concat(admins.map((a) => ({ id: a + '@lid', admin: 'admin' }))).concat([{ id: '11111@lid', admin: null }]) }),
    groupParticipantsUpdate: async (jid, lista, acao) => { removidos.push({ jid, lista, acao }) }
  }
}

function ambiente(cfg) {
  const d = dir()
  const CONFIGS = path.join(d, 'configs.json')
  fs.writeFileSync(CONFIGS, JSON.stringify({ u1: cfg || contaPro() }))
  const readJson = (f, padrao) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return padrao } }
  const linhas = []
  const logs = { append: (_d, _u, l) => linhas.push(l) }
  const execucoes = []
  const deps = {
    readJson, CONFIGS, DATA: d, logs, linhas,
    limitador: criarLimitador(100, 60000),
    limitadorEnvio: criarLimitador(1, 20000),
    sessions: { publicState: () => ({ connected: true }) },
    salvarCfg: (userId, fn) => { const all = readJson(CONFIGS, {}); fn(all[userId]); fs.writeFileSync(CONFIGS, JSON.stringify(all)) },
    executarAgora: async (userId, op) => { execucoes.push(userId); return op.liberar() ? { ok: true, mensagem: 'Enviei 1 produto.' } : { ok: false, mensagem: 'Espere alguns segundos.' } },
    execucoes
  }
  return { d, deps, cfg: () => readJson(CONFIGS, {}).u1 }
}

const doDono = (texto, extra = {}) => Object.assign({ key: { remoteJid: EU + '@s.whatsapp.net', fromMe: true, id: 'M' + Math.random() }, messageTimestamp: Math.floor(Date.now() / 1000), message: { conversation: texto } }, extra)
const noGrupo = (texto, extra = {}) => ({ key: { remoteJid: G1, fromMe: false, id: 'G' + Math.random(), participant: '11111@lid' }, message: Object.assign({ conversation: texto }, extra.message || {}) })

test.beforeEach(() => {
  for (const m of Object.values(moderacao._cache)) m.clear()
  for (const m of Object.values(assistente._cache)) m.clear()
})

// ---------------------------------------------------------------- whatsMsg

test('chat próprio: reconhece o número pelo telefone e pelo LID; grupo e outra pessoa não', () => {
  const sock = sockFalso()
  assert.equal(whatsMsg.chatProprio(sock, EU + '@s.whatsapp.net'), true)
  assert.equal(whatsMsg.chatProprio(sock, MEU_LID + '@lid'), true)
  assert.equal(whatsMsg.chatProprio(sock, '5511888880000@s.whatsapp.net'), false)
  assert.equal(whatsMsg.chatProprio(sock, G1), false)
  assert.equal(whatsMsg.ehProprio(sock, MEU_LID + ':3@lid'), true)
})

// ---------------------------------------------------------------- comandos

test('ehComando: só mensagem própria, recente, no chat consigo mesmo e com "!"', () => {
  const sock = sockFalso()
  assert.equal(comandos.ehComando(sock, doDono('!status'), '!status'), true)
  assert.equal(comandos.ehComando(sock, doDono('status'), 'status'), false)
  assert.equal(comandos.ehComando(sock, doDono('!status', { key: { remoteJid: '5511888880000@s.whatsapp.net', fromMe: true } }), '!status'), false, 'conversa com outra pessoa')
  assert.equal(comandos.ehComando(sock, doDono('!status', { key: { remoteJid: EU + '@s.whatsapp.net', fromMe: false } }), '!status'), false, 'não foi o dono')
  assert.equal(comandos.ehComando(sock, doDono('!status', { messageTimestamp: Math.floor(Date.now() / 1000) - 600 }), '!status'), false, 'mensagem antiga')
})

test('comandos: status, pausar, retomar, enviar (com trava), ajuda e desconhecido', async () => {
  const a = ambiente()
  const st = await comandos.responder(a.deps, 'u1', doDono('!status'), '!status')
  assert.match(st, /Automação: ligada/)
  assert.match(st, /Hoje: 0 de 5 envios/)
  assert.match(st, /Plano: Pro/)
  assert.match(await comandos.responder(a.deps, 'u1', doDono('!pausar'), '!pausar'), /pausada/)
  assert.equal(a.cfg().ads.enabled, false)
  assert.ok(a.deps.linhas.some((l) => /pausada pelo celular/.test(l.message)))
  assert.match(await comandos.responder(a.deps, 'u1', doDono('!retomar'), '!retomar'), /ligada/)
  assert.equal(a.cfg().ads.enabled, true)
  assert.match(await comandos.responder(a.deps, 'u1', doDono('!enviar'), '!enviar'), /✅ Enviei 1 produto/)
  assert.match(await comandos.responder(a.deps, 'u1', doDono('!enviar'), '!enviar'), /⚠️ Espere/, 'um envio a cada 20 s')
  assert.match(await comandos.responder(a.deps, 'u1', doDono('!AJUDA'), '!AJUDA'), /Comandos da Namy/)
  assert.match(await comandos.responder(a.deps, 'u1', doDono('!xyz'), '!xyz'), /!ajuda/)
  for (const r of [st]) assert.equal(/^!/.test(r), false, 'resposta nunca começa com "!" (não vira comando)')
})

test('comandos: !oferta guarda no banco (texto ou mensagem citada) e !fila lista', async () => {
  const a = ambiente()
  assert.match(await comandos.responder(a.deps, 'u1', doDono('!oferta'), '!oferta'), /Mande !oferta/)
  assert.match(await comandos.responder(a.deps, 'u1', doDono('!oferta sem link'), '!oferta sem link'), /⚠️/)
  const r = await comandos.responder(a.deps, 'u1', doDono('x'), '!oferta 🍳 Panela inox https://www.amazon.com.br/dp/B0BBBBBBBB')
  assert.match(r, /guardada no banco/)
  const citada = doDono('!oferta', { message: { extendedTextMessage: { text: '!oferta', contextInfo: { quotedMessage: { conversation: '🎧 Fone https://www.amazon.com.br/dp/B0CCCCCCCC' } } } } })
  assert.match(await comandos.responder(a.deps, 'u1', citada, '!oferta'), /guardada no banco: 🎧 Fone/)
  assert.match(await comandos.responder(a.deps, 'u1', citada, '!oferta'), /já estava/)
  assert.equal(pool.listar(a.d, 'u1').length, 2)
  assert.match(await comandos.responder(a.deps, 'u1', doDono('!fila'), '!fila'), /1\. .*\n2\. /)
})

test('comandos: licença vencida só deixa !status e !ajuda; desligados não respondem; Start sem !comissao', async () => {
  const vencida = ambiente(contaPro({ license: { plan: 'trial', active: true, expiresAt: '2020-01-01T00:00:00Z' } }))
  assert.match(await comandos.responder(vencida.deps, 'u1', doDono('!pausar'), '!pausar'), /licença venceu/)
  assert.match(await comandos.responder(vencida.deps, 'u1', doDono('!status'), '!status'), /Namy agora/)
  const start = ambiente(contaPro({ license: { tier: 'start', active: true, expiresAt: exp() } }))
  assert.match(await comandos.responder(start.deps, 'u1', doDono('!comissao'), '!comissão'), /plano Pro/)
  const pro = ambiente()
  assert.match(await comandos.responder(pro.deps, 'u1', doDono('!comissao'), '!comissao'), /Ainda não há resumo/)
  await cerebro.salvarComandos(pro.d, 'u1', { ativo: false })
  assert.equal(await comandos.responder(pro.deps, 'u1', doDono('!status'), '!status'), '')
})

// ---------------------------------------------------------------- moderação

async function comModeracao(conf, cfg) {
  const a = ambiente(cfg)
  await cerebro.salvarModeracao(a.d, 'u1', a.cfg(), Object.assign({ jid: G1 }, conf))
  return a
}

test('config da moderação: só grupo de destino; fonte e grupo estranho recusados; desligar tudo apaga a config', async () => {
  const a = ambiente()
  assert.throws(() => cerebro.salvarModeracao(a.d, 'u1', a.cfg(), { jid: FONTE, antiLink: true }), /fonte/)
  assert.throws(() => cerebro.salvarModeracao(a.d, 'u1', a.cfg(), { jid: '999@g.us', antiLink: true }), /destino/)
  assert.throws(() => cerebro.salvarModeracao(a.d, 'u1', a.cfg(), { jid: G1, antiLink: true, removerApos: 2 }), /3 ou 5/)
  await cerebro.salvarModeracao(a.d, 'u1', a.cfg(), { jid: G1, antiLink: true })
  assert.ok(cerebro.carregar(a.d, 'u1').moderacao.grupos[G1])
  await cerebro.salvarModeracao(a.d, 'u1', a.cfg(), { jid: G1 })
  assert.equal(cerebro.carregar(a.d, 'u1').moderacao.grupos[G1], undefined)
})

test('moderação: apaga link de quem não é admin, avisa 1 vez por 2 min, ignora admin e mensagem sem link', async () => {
  const a = await comModeracao({ antiLink: true, avisar: true })
  const sock = sockFalso({ admins: ['22222'] })
  const r = await moderacao.avaliar(a.deps, 'u1', a.cfg(), noGrupo('compre aqui https://site.com/x'), sock, 'compre aqui https://site.com/x')
  assert.equal(r.acao, 'apagada')
  assert.ok(sock.enviados[0].conteudo.delete, 'apagou')
  assert.match(sock.enviados[1].conteudo.text, /só os administradores enviam links/)
  await moderacao.avaliar(a.deps, 'u1', a.cfg(), noGrupo('chat.whatsapp.com/ABC'), sock, 'entra: chat.whatsapp.com/ABC')
  assert.equal(sock.enviados.filter((e) => e.conteudo.text).length, 1, 'aviso no máximo 1 a cada 2 min')
  const admin = noGrupo('https://site.com'); admin.key.participant = '22222@lid'
  assert.equal((await moderacao.avaliar(a.deps, 'u1', a.cfg(), admin, sock, 'https://site.com')).acao, 'nada')
  assert.equal((await moderacao.avaliar(a.deps, 'u1', a.cfg(), noGrupo('bom dia'), sock, 'bom dia')).acao, 'nada')
  assert.ok(a.deps.linhas.some((l) => l.source === 'moderacao' && /1 mensagem\(ns\) apagada/.test(l.message)))
  assert.equal(JSON.stringify(a.deps.linhas).includes('11111'), false, 'quem mandou não vai para o log')
})

test('moderação: sem ser admin não apaga e avisa nos Logs; grupo sem config, fonte e Start não fazem nada', async () => {
  const a = await comModeracao({ antiLink: true })
  const sock = sockFalso({ euAdmin: false })
  assert.equal((await moderacao.avaliar(a.deps, 'u1', a.cfg(), noGrupo('https://x.com/a'), sock, 'https://x.com/a')).acao, 'sem-admin')
  assert.equal(sock.enviados.length, 0)
  assert.ok(a.deps.linhas.some((l) => /não é admin/.test(l.message)))
  const outro = noGrupo('https://x.com/a'); outro.key.remoteJid = G2
  assert.equal((await moderacao.avaliar(a.deps, 'u1', a.cfg(), outro, sockFalso(), 'https://x.com/a')).acao, 'nada')
  const start = Object.assign(a.cfg(), { license: { tier: 'start', active: true, expiresAt: exp() } })
  assert.equal((await moderacao.avaliar(a.deps, 'u1', start, noGrupo('https://x.com/a'), sockFalso(), 'https://x.com/a')).acao, 'nada')
  const virouFonte = Object.assign(a.cfg(), { sources: [{ jid: G1 }] })
  assert.equal((await moderacao.avaliar(a.deps, 'u1', virouFonte, noGrupo('https://x.com/a'), sockFalso(), 'https://x.com/a')).acao, 'nada')
})

test('moderação: flood apaga a partir da 6ª em 30 s; remover após 3 infrações', async () => {
  const a = await comModeracao({ antiFlood: true, antiLink: true, removerApos: 3 })
  const sock = sockFalso()
  const agora = Date.now()
  const acoes = []
  for (let i = 0; i < 7; i++) acoes.push((await moderacao.avaliar(a.deps, 'u1', a.cfg(), noGrupo('oi ' + i), sock, 'oi ' + i, agora + i * 1000)).acao)
  assert.deepEqual(acoes, ['nada', 'nada', 'nada', 'nada', 'nada', 'apagada', 'apagada'])
  const r = await moderacao.avaliar(a.deps, 'u1', a.cfg(), noGrupo('https://x.com/a'), sock, 'https://x.com/a', agora + 8000)
  assert.equal(r.removida, true, '3ª infração (2 flood + 1 link) remove')
  assert.deepEqual(sock.removidos[0], { jid: G1, lista: ['11111@lid'], acao: 'remove' })
})

// ---------------------------------------------------------------- assistente

async function comAssistente(cfgExtra = {}) {
  const a = ambiente(contaPro(cfgExtra))
  await cofre.gravar(a.d, 'u1', 'ia', { groq: 'gsk_chave_do_cliente_123456789' })
  await cerebro.salvarIA(a.d, 'u1', a.cfg(), { ativo: true, grupos: [G1], limiteHora: 2 })
  await auditoria.registrar(a.d, 'u1', { tipo: 'enviado', jid: G1, grupo: 'Ofertas Casa', nome: 'Air Fryer 4L' })
  return a
}
const mencao = (texto) => noGrupo(texto, { message: { conversation: undefined, extendedTextMessage: { text: texto, contextInfo: { mentionedJid: [MEU_LID + '@lid'] } } } })

test('travar: resposta com link, preço ou menção vira a resposta padrão', () => {
  assert.equal(assistente.travar('A última foi a Air Fryer 4L! 🙂').ok, true)
  for (const ruim of ['Custa R$ 199,90', 'veja em https://x.com', 'sai por 199,90', 'entra em shopee.com.br', 'fale com @5511999990000']) {
    assert.equal(assistente.travar(ruim).texto, assistente.PADRAO, ruim)
  }
})

test('assistente: responde só quando mencionado; usa a chave do cliente; contexto só com nomes; limites', async () => {
  const a = await comAssistente()
  const sock = sockFalso()
  const pedidos = []
  a.deps.chamar = async (provedor, chave, _o, op) => { pedidos.push({ provedor, chave, prompt: op.prompt }); return 'A última oferta foi a Air Fryer 4L 🙂' }
  assert.equal((await assistente.talvezResponder(a.deps, 'u1', a.cfg(), noGrupo('alguém aí?'), sock, 'alguém aí?')).respondeu, false, 'sem menção')
  const r = await assistente.talvezResponder(a.deps, 'u1', a.cfg(), mencao('@' + MEU_LID + ' qual foi a última oferta?'), sock, '@' + MEU_LID + ' qual foi a última oferta?')
  assert.equal(r.respondeu, true)
  assert.equal(pedidos[0].provedor, 'groq')
  assert.equal(pedidos[0].chave, 'gsk_chave_do_cliente_123456789')
  assert.match(pedidos[0].prompt.usuario, /Air Fryer 4L/)
  assert.doesNotMatch(pedidos[0].prompt.usuario, new RegExp(MEU_LID), 'a menção sai da pergunta')
  assert.equal(sock.enviados[0].opcoes.quoted.key.remoteJid, G1, 'responde citando a pergunta')
  assert.equal((await assistente.talvezResponder(a.deps, 'u1', a.cfg(), mencao('e agora?'), sock, 'e agora?')).motivo, 'pessoa', '1 por minuto por pessoa')
  const outra = mencao('oi'); outra.key.participant = '33333@lid'
  await assistente.talvezResponder(a.deps, 'u1', a.cfg(), outra, sock, 'oi')
  const terceira = mencao('oi'); terceira.key.participant = '44444@lid'
  assert.equal((await assistente.talvezResponder(a.deps, 'u1', a.cfg(), terceira, sock, 'oi')).motivo, 'limite', 'limite por hora no grupo')
})

test('assistente: IA que inventa preço cai na padrão; sem chave não responde; desligado/Start/grupo fora não', async () => {
  const a = await comAssistente()
  const sock = sockFalso()
  a.deps.chamar = async () => 'Está R$ 99,90 hoje!'
  const r = await assistente.talvezResponder(a.deps, 'u1', a.cfg(), mencao('quanto custa?'), sock, 'quanto custa?')
  assert.equal(r.texto, assistente.PADRAO)
  assert.equal(r.motivo, 'preço')
  const semChave = ambiente()
  await cerebro.salvarIA(semChave.d, 'u1', semChave.cfg(), { ativo: true, grupos: [G1] })
  const nova = mencao('oi'); nova.key.participant = '55555@lid'
  assert.equal((await assistente.talvezResponder(semChave.deps, 'u1', semChave.cfg(), nova, sockFalso(), 'oi')).motivo, 'sem-chave')
  const start = Object.assign(a.cfg(), { license: { tier: 'start', active: true, expiresAt: exp() } })
  assert.equal((await assistente.talvezResponder(a.deps, 'u1', start, mencao('oi'), sockFalso(), 'oi')).respondeu, false)
  const fora = mencao('oi'); fora.key.remoteJid = G2
  assert.equal((await assistente.talvezResponder(a.deps, 'u1', a.cfg(), fora, sockFalso(), 'oi')).respondeu, false)
  assert.throws(() => cerebro.salvarIA(a.d, 'u1', Object.assign(a.cfg(), { copy: {} }), { ativo: true, grupos: [G1] }), /chave/)
  assert.throws(() => cerebro.salvarIA(a.d, 'u1', a.cfg(), { ativo: true, grupos: [] }), /pelo menos um grupo/)
})

test('ligação no ouvinte real (routes.js): !status no chat próprio responde; link em grupo moderado é apagado; fonte não modera', async () => {
  const routes = require('./routes')
  const a = ambiente()
  await cerebro.salvarModeracao(a.d, 'u1', a.cfg(), { jid: G1, antiLink: true })
  let ouvinte = null
  const sessions = { onMensagem: (fn) => { ouvinte = fn }, onMembros: () => {}, publicState: () => ({ connected: true }) }
  const app = { get: () => {}, post: () => {}, use: () => {}, put: () => {}, delete: () => {} }
  routes.mount(app, { auth: (q, r, n) => n(), readJson: a.deps.readJson, writeJson: (f, v) => fs.writeFileSync(f, JSON.stringify(v)), CONFIGS: a.deps.CONFIGS, DATA: a.d, logs: a.deps.logs, sessions, segredo: 'x' })
  assert.equal(typeof ouvinte, 'function')
  const sock = sockFalso()
  await ouvinte('u1', doDono('!status'), sock, 'notify')
  assert.equal(sock.enviados.length, 1)
  assert.equal(sock.enviados[0].jid, EU + '@s.whatsapp.net')
  assert.match(sock.enviados[0].conteudo.text, /Namy agora/)
  const outraPessoa = doDono('!status'); outraPessoa.key.remoteJid = '5511888880000@s.whatsapp.net'
  await ouvinte('u1', outraPessoa, sock, 'notify')
  assert.equal(sock.enviados.length, 1, 'comando em conversa com outra pessoa é ignorado')
  await ouvinte('u1', noGrupo('olha https://outro-afiliado.com/x'), sock, 'notify')
  assert.ok(sock.enviados[1] && sock.enviados[1].conteudo.delete, 'link apagado no grupo moderado')
  const daFonte = noGrupo('https://outro-afiliado.com/y'); daFonte.key.remoteJid = FONTE
  await ouvinte('u1', daFonte, sock, 'notify')
  assert.equal(sock.enviados.filter((e) => e.conteudo.delete).length, 1, 'grupo fonte nunca é moderado')
  await ouvinte('u1', noGrupo('https://outro-afiliado.com/z'), sock, 'append')
  assert.equal(sock.enviados.filter((e) => e.conteudo.delete).length, 1, 'mensagem antiga (append) não é moderada')
})
