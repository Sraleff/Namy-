const test = require('node:test')
const { beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const sessions = require('../sessions')
const publicador = require('./publicador')
const scheduler = require('../scheduler')
const logs = require('../logs')
const { aplicarConfig } = require('./routes')
const automacoesRoutes = require('./automacoesRoutes')

// ---- Sem WhatsApp e sem rede: troca o estado da sessao e o publicador ----
let conectado = true
sessions.publicState = () => ({ connected: conectado })

const chamadas = []
let roteiro = []
let aoPublicar = null
publicador.publicar = async ({ userId }) => {
  chamadas.push(userId)
  if (aoPublicar) await aoPublicar(userId)
  const r = roteiro.length ? roteiro.shift() : { enviados: 1 }
  if (r instanceof Error) throw r
  return r
}

beforeEach(() => { chamadas.length = 0 })

let seq = 0
const hojeBR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const horaBR = () => {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date())
  return { h: Number(p.find((x) => x.type === 'hour').value), m: Number(p.find((x) => x.type === 'minute').value) }
}
const hhmm = (h, m) => String((h + 24) % 24).padStart(2, '0') + ':' + String(m).padStart(2, '0')
const diaSemanaBR = () => scheduler.diaSemanaBrasilia(new Date())
const minAtras = (min) => new Date(Date.now() - min * 60000).toISOString()

function ambiente(ads = {}, cfgExtra = {}, { random = () => 0 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'namy-sched-'))
  const CONFIGS = path.join(dir, 'configs.json')
  const userId = 'u' + (++seq)
  const base = {
    license: { active: true, expiresAt: new Date(Date.now() + 864e5).toISOString() },
    shopee: { appId: 'APP', secret: 'SEC' },
    groups: [{ jid: 'g1@g.us', name: 'G1', niche: 'geral' }],
    ads: Object.assign({
      enabled: true, interval: '2h', dailyLimit: 10, source: 'api',
      window: { from: '00:00', to: '23:59' }, days: [0, 1, 2, 3, 4, 5, 6]
    }, ads)
  }
  fs.writeFileSync(CONFIGS, JSON.stringify({ [userId]: Object.assign(base, cfgExtra) }))
  const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return d } }
  const writeJson = (f, d) => fs.writeFileSync(f, JSON.stringify(d))
  const dormidas = []
  const deps = { readJson, writeJson, CONFIGS, DATA: dir, logs, random, dormir: async (ms) => { dormidas.push(ms) } }
  roteiro = []
  aoPublicar = null
  conectado = true
  return {
    userId, deps, dormidas, dir,
    cfg: () => readJson(CONFIGS, {})[userId],
    ads: () => (readJson(CONFIGS, {})[userId] || {}).ads || {},
    rodar: () => scheduler.executarUsuario(deps, userId, readJson(CONFIGS, {})[userId]),
    mexer: (fn) => { const t = readJson(CONFIGS, {}); fn(t[userId]); writeJson(CONFIGS, t) }
  }
}

const minAte = (iso) => (new Date(iso).getTime() - Date.now()) / 60000

test('conta antiga (sem nenhum campo novo): intervalo fixo e 1 produto, igual a antes', async () => {
  const a = ambiente({ lastSentAt: minAtras(180) })
  const r = await a.rodar()
  assert.equal(r.enviados, 1)
  assert.equal(chamadas.length, 1)
  assert.equal(a.ads().sentToday, 1)
  assert.equal(a.ads().nextTryAt, '')
  assert.equal(a.dormidas.length, 0, 'com 1 produto nao ha pausa')
  assert.equal(await a.rodar(), null, 'acabou de enviar: o intervalo de 2h ainda nao passou')
  const b = ambiente({ lastSentAt: minAtras(60), interval: '2h' })
  assert.equal(await b.rodar(), null)
  assert.equal(chamadas.length, 1, 'a conta b (1h < 2h) nao publicou: so a primeira chamada existe')
  const c = ambiente({ lastSentAt: minAtras(130), interval: '2h' })
  assert.equal((await c.rodar()).enviados, 1)
})

test('intervalo aleatorio: sorteia entre o minimo e o maximo, grava em nextTryAt e ignora o intervalo fixo', async () => {
  const baixo = ambiente({ intervalMode: 'aleatorio', intervalMin: 5, intervalMax: 15, lastSentAt: minAtras(1) }, {}, { random: () => 0 })
  assert.equal((await baixo.rodar()).enviados, 1, 'lastSentAt recente nao trava no modo aleatorio')
  let faltam = minAte(baixo.ads().nextTryAt)
  assert.ok(faltam > 4.9 && faltam < 5.1, 'sorteio minimo = 5 min, deu ' + faltam)
  assert.equal(await baixo.rodar(), null, 'antes do horario sorteado nao roda')
  assert.equal(chamadas.length, 1)

  const alto = ambiente({ intervalMode: 'aleatorio', intervalMin: 5, intervalMax: 15 }, {}, { random: () => 0.999999 })
  await alto.rodar()
  faltam = minAte(alto.ads().nextTryAt)
  assert.ok(faltam > 14.9 && faltam < 15.1, 'sorteio maximo = 15 min, deu ' + faltam)

  // chegou a hora: roda de novo e sorteia o proximo
  baixo.mexer((c) => { c.ads.nextTryAt = minAtras(1) })
  assert.equal((await baixo.rodar()).enviados, 1)
  assert.equal(chamadas.length, 3, '1 do baixo + 1 do alto + a nova rodada do baixo')
  assert.ok(minAte(baixo.ads().nextTryAt) > 4.9)
})

test('intervalo aleatorio: valores fora da faixa ou invertidos no arquivo nao quebram (faixa segura)', () => {
  assert.deepEqual(scheduler.intervaloAleatorio({ intervalMin: 20, intervalMax: 10 }), { min: 10, max: 20 })
  assert.deepEqual(scheduler.intervaloAleatorio({ intervalMin: 0, intervalMax: 99999 }), { min: 30, max: 90 })
  assert.deepEqual(scheduler.intervaloAleatorio({}), { min: 30, max: 90 })
  assert.deepEqual(scheduler.produtosPorExecucao({ perRunMin: 3, perRunMax: 11 }), { min: 1, max: 1 }, 'acima de 10 cai no padrao')
  assert.deepEqual(scheduler.produtosPorExecucao({ perRunMin: '2', perRunMax: '4' }), { min: 2, max: 4 })
  assert.deepEqual(scheduler.produtosPorExecucao(undefined), { min: 1, max: 1 })
  assert.equal(scheduler.sortear(2, 4, () => 0), 2)
  assert.equal(scheduler.sortear(2, 4, () => 0.999999), 4)
  assert.equal(scheduler.sortear(7, 7, () => 0.5), 7)
})

test('produtos por execucao: sorteia N, publica N vezes, conta cada um e pausa 20-40 s entre eles', async () => {
  const min = ambiente({ perRunMin: 2, perRunMax: 4 }, {}, { random: () => 0 })
  assert.equal((await min.rodar()).enviados, 2)
  assert.equal(chamadas.length, 2)
  assert.equal(min.ads().sentToday, 2)
  assert.deepEqual(min.dormidas, [20000], 'uma pausa entre 2 produtos')

  const max = ambiente({ perRunMin: 2, perRunMax: 4 }, {}, { random: () => 0.999999 })
  assert.equal((await max.rodar()).enviados, 4)
  assert.equal(chamadas.length, 6)
  assert.equal(max.ads().sentToday, 4)
  assert.deepEqual(max.dormidas, [40000, 40000, 40000])
  assert.ok(max.dormidas.concat(min.dormidas).every((ms) => ms >= 20000 && ms <= 40000))
})

test('limite diario conta produtos e corta no meio da execucao (sem pausa inutil no fim)', async () => {
  const a = ambiente({ perRunMin: 5, perRunMax: 5, dailyLimit: 3, sentToday: 1, sentDay: hojeBR() })
  const r = await a.rodar()
  assert.equal(r.enviados, 2)
  assert.equal(r.parou, 'limite')
  assert.equal(a.ads().sentToday, 3)
  assert.equal(chamadas.length, 2)
  assert.equal(a.dormidas.length, 1, 'so uma pausa: depois do 2o produto o limite ja fechou')
  // dia seguinte: o contador antigo nao vale
  const b = ambiente({ dailyLimit: 1, sentToday: 1, sentDay: '2000-01-01' })
  assert.equal((await b.rodar()).enviados, 1)
  // limite ja atingido: nao roda
  const c = ambiente({ dailyLimit: 2, sentToday: 2, sentDay: hojeBR() })
  assert.equal(await c.rodar(), null)
  assert.equal(chamadas.length, 3)
})

test('sem oferta: 1o produto sem oferta adia ate 15 min; depois de enviar, o aleatorio sorteia a proxima', async () => {
  const a = ambiente({ perRunMin: 3, perRunMax: 3, interval: '2h' })
  roteiro = [{ enviados: 0, semOferta: true }]
  const r = await a.rodar()
  assert.equal(r.enviados, 0)
  assert.equal(r.parou, 'sem-oferta')
  assert.equal(chamadas.length, 1, 'parou na primeira, nao insiste')
  const faltam = minAte(a.ads().nextTryAt)
  assert.ok(faltam > 14.9 && faltam < 15.1, 'adiou 15 min: ' + faltam)
  assert.equal(a.ads().sentToday, undefined)

  const b = ambiente({ perRunMin: 3, perRunMax: 3, intervalMode: 'aleatorio', intervalMin: 20, intervalMax: 30 })
  roteiro = [{ enviados: 1 }, { enviados: 0, semOferta: true }]
  const r2 = await b.rodar()
  assert.equal(r2.enviados, 1)
  assert.equal(r2.parou, 'sem-oferta')
  assert.equal(chamadas.length, 3)
  const f2 = minAte(b.ads().nextTryAt)
  assert.ok(f2 > 19.9 && f2 < 20.1, 'enviou 1 antes de faltar oferta: proxima sorteada (20 min), nao o adiamento de 15: ' + f2)

  const c = ambiente({})
  roteiro = [{ enviados: 0 }]
  assert.equal((await c.rodar()).parou, 'nada')
  assert.ok(minAte(c.ads().nextTryAt) > 0.9 && minAte(c.ads().nextTryAt) < 1.1, 'nada enviado e sem motivo: tenta de novo em 1 min')
})

test('WhatsApp: desconectado nao roda; caiu no meio para; erro do publicador adia e registra no log', async () => {
  const a = ambiente({})
  conectado = false
  assert.equal(await a.rodar(), null)
  assert.equal(chamadas.length, 0)

  const b = ambiente({ perRunMin: 3, perRunMax: 3 })
  aoPublicar = async () => { conectado = false } // cai logo depois do 1o envio
  const r = await b.rodar()
  assert.equal(r.enviados, 1)
  assert.equal(r.parou, 'whatsapp')
  assert.equal(chamadas.length, 1)
  assert.equal(b.ads().sentToday, 1)

  const c = ambiente({})
  roteiro = [Object.assign(new Error('socket caiu'), { code: 'WA' })]
  const r3 = await c.rodar()
  assert.equal(r3.parou, 'whatsapp')
  assert.ok(minAte(c.ads().nextTryAt) > 0.9 && minAte(c.ads().nextTryAt) < 1.1, 'WhatsApp: adia 1 min')
  assert.ok(logs.read(c.dir, c.userId).some((l) => l.source === 'whatsapp' && /WhatsApp caiu/.test(l.message)))

  const d = ambiente({})
  roteiro = [new Error('API fora do ar')]
  const r4 = await d.rodar()
  assert.equal(r4.parou, 'erro')
  assert.ok(minAte(d.ads().nextTryAt) > 1.9 && minAte(d.ads().nextTryAt) < 2.1, 'erro de API: adia 2 min')
  assert.ok(logs.read(d.dir, d.userId).some((l) => l.source === 'shopee' && /API fora do ar/.test(l.message)))
  assert.equal(d.ads().sentToday, undefined)
})

test('condicoes que seguram o disparo agendado: desligado, licenca, janela, dia, grupos, chave, adiamento', async () => {
  const { h, m } = horaBR()
  const foraDaJanela = { from: hhmm(h + 2, m), to: hhmm(h + 3, m) }
  const hoje = diaSemanaBR()
  const casos = {
    desligado: [{ enabled: false }, {}],
    'licenca vencida': [{}, { license: { active: true, expiresAt: new Date(Date.now() - 1000).toISOString() } }],
    'fora da janela': [{ window: foraDaJanela }, {}],
    'dia nao permitido': [{ days: [(hoje + 1) % 7] }, {}],
    'sem grupos': [{}, { groups: [] }],
    'sem chave (origem api)': [{}, { shopee: { appId: '', secret: '' } }],
    'adiado (nextTryAt no futuro)': [{ nextTryAt: new Date(Date.now() + 600000).toISOString() }, {}]
  }
  for (const [nome, [ads, extra]] of Object.entries(casos)) {
    const a = ambiente(ads, extra)
    assert.equal(await a.rodar(), null, nome)
  }
  assert.equal(chamadas.length, 0, 'nenhum caso chegou a publicar')
  // origem "banco" dispensa a chave Shopee
  const b = ambiente({ source: 'pool' }, { shopee: { appId: '', secret: '' } })
  assert.equal((await b.rodar()).enviados, 1)
})

test('grupo fonte nunca e destino: se so sobrou fonte, nao tenta nem enche o log de erro', async () => {
  const a = ambiente({}, { sources: [{ jid: 'g1@g.us', name: 'G1 (fonte)' }] })
  assert.equal(await a.rodar(), null, 'o unico destino salvo e fonte: nada a publicar')
  assert.equal(chamadas.length, 0)
  assert.equal(logs.read(a.dir, a.userId).length, 0, 'e nenhum erro foi registrado')
  const r = await scheduler.executarAgora(a.deps, a.userId)
  assert.deepEqual([r.status, r.codigo], [400, 'sem-grupos'])
  // com um destino de verdade ao lado, so ele recebe
  const b = ambiente({}, { sources: [{ jid: 'g1@g.us', name: 'G1 (fonte)' }], groups: [{ jid: 'g1@g.us', name: 'G1', niche: 'geral' }, { jid: 'g2@g.us', name: 'G2', niche: 'geral' }] })
  assert.equal((await b.rodar()).enviados, 1)
})

test('aplicarConfig valida modo, faixas e minimo <= maximo', () => {
  const novo = () => ({ ads: {} })
  const ok = (ads) => { const cur = novo(); aplicarConfig(cur, { ads }); return cur.ads }
  const falha = (ads, re, cur = novo()) => assert.throws(() => aplicarConfig(cur, { ads }), (e) => e.status === 400 && re.test(e.message), JSON.stringify(ads))

  assert.deepEqual(ok({ intervalMode: 'aleatorio', intervalMin: 10, intervalMax: 30 }), { intervalMode: 'aleatorio', intervalMin: 10, intervalMax: 30 })
  assert.deepEqual(ok({ perRunMin: 1, perRunMax: 3 }), { perRunMin: 1, perRunMax: 3 })
  assert.deepEqual(ok({ intervalMode: 'fixo' }), { intervalMode: 'fixo' })
  assert.deepEqual(ok({ perRunMin: '2', perRunMax: '2' }), { perRunMin: 2, perRunMax: 2 }, 'numero em texto vira inteiro')
  assert.deepEqual(ok({}), {}, 'conta antiga: nada muda')

  falha({ intervalMode: 'maluco' }, /Modo de intervalo/)
  falha({ intervalMode: 'aleatorio' }, /mínimo e máximo/)
  falha({ intervalMode: 'aleatorio', intervalMin: 10 }, /mínimo e o máximo/)
  falha({ intervalMin: 30, intervalMax: 10 }, /mínimo não pode ser maior/)
  falha({ perRunMin: 5, perRunMax: 2 }, /mínimo não pode ser maior/)
  falha({ intervalMin: 0, intervalMax: 10 }, /inteiros de 1 a 720/)
  falha({ intervalMin: 1, intervalMax: 721 }, /inteiros de 1 a 720/)
  falha({ perRunMin: 1, perRunMax: 11 }, /inteiros de 1 a 10/)
  falha({ perRunMin: 1.5, perRunMax: 2 }, /inteiros/)
  falha({ perRunMin: 'abc', perRunMax: 2 }, /inteiros/)
  falha({ perRunMin: 0, perRunMax: 2 }, /inteiros/)
  // mandar so um dos lados valida contra o que ja estava salvo
  falha({ perRunMax: 1 }, /mínimo não pode ser maior/, { ads: { perRunMin: 3, perRunMax: 5 } })
  assert.deepEqual(ok2({ perRunMax: 6 }, { perRunMin: 3, perRunMax: 5 }), { perRunMin: 3, perRunMax: 6 })
  function ok2(ads, antes) { const cur = { ads: Object.assign({}, antes) }; aplicarConfig(cur, { ads }); return cur.ads }
})

test('executar agora: ignora intervalo, janela, dias, adiamento e ate o "desligado", e sorteia o proximo no aleatorio', async () => {
  const { h, m } = horaBR()
  const a = ambiente({
    enabled: false, interval: '6h', lastSentAt: minAtras(1),
    window: { from: hhmm(h + 2, m), to: hhmm(h + 3, m) }, days: [(diaSemanaBR() + 1) % 7],
    nextTryAt: new Date(Date.now() + 3600000).toISOString(),
    intervalMode: 'aleatorio', intervalMin: 10, intervalMax: 10, perRunMin: 2, perRunMax: 2
  })
  assert.equal(await a.rodar(), null, 'pelo agendador, nada disso passaria')
  const r = await scheduler.executarAgora(a.deps, a.userId)
  assert.equal(r.status, 200)
  assert.equal(r.ok, true)
  assert.equal(r.enviados, 2)
  assert.equal(r.parou, 'concluido')
  assert.match(r.mensagem, /2 produto/)
  assert.equal(a.ads().sentToday, 2)
  const faltam = minAte(a.ads().nextTryAt)
  assert.ok(faltam > 9.9 && faltam < 10.1, 'executar agora tambem reprograma o proximo disparo: ' + faltam)
})

test('executar agora: recusas (licenca, chave, grupos, WhatsApp) e limite do dia nao enviam nada', async () => {
  const antes = chamadas.length
  const lic = ambiente({}, { license: { active: true, expiresAt: new Date(Date.now() - 1000).toISOString() } })
  let r = await scheduler.executarAgora(lic.deps, lic.userId)
  assert.deepEqual([r.status, r.codigo], [403, 'licenca'])

  const chave = ambiente({}, { shopee: { appId: '', secret: '' } })
  r = await scheduler.executarAgora(chave.deps, chave.userId)
  assert.deepEqual([r.status, r.codigo], [400, 'sem-chave'])

  const grupos = ambiente({}, { groups: [] })
  r = await scheduler.executarAgora(grupos.deps, grupos.userId)
  assert.deepEqual([r.status, r.codigo], [400, 'sem-grupos'])

  const wa = ambiente({})
  conectado = false
  r = await scheduler.executarAgora(wa.deps, wa.userId)
  assert.deepEqual([r.status, r.codigo], [400, 'whatsapp'])
  conectado = true

  const lim = ambiente({ dailyLimit: 2, sentToday: 2, sentDay: hojeBR() })
  r = await scheduler.executarAgora(lim.deps, lim.userId)
  assert.equal(r.status, 200)
  assert.equal(r.ok, false)
  assert.equal(r.codigo, 'limite')
  assert.match(r.mensagem, /limite/i)

  r = await scheduler.executarAgora(lim.deps, 'conta-que-nao-existe')
  assert.equal(r.status, 404)
  assert.equal(chamadas.length, antes, 'nenhuma recusa chegou a publicar')
})

test('executar agora: nunca duas execucoes do mesmo cliente ao mesmo tempo, e o limite de uso', async () => {
  const a = ambiente({})
  let liberar
  const preso = new Promise((r) => { liberar = r })
  aoPublicar = () => preso // a 1a execucao fica parada dentro do publicador
  const primeira = scheduler.executarAgora(a.deps, a.userId)
  await new Promise((r) => setImmediate(r))
  const segunda = await scheduler.executarAgora(a.deps, a.userId)
  assert.deepEqual([segunda.status, segunda.codigo], [409, 'ocupado'])
  liberar()
  assert.equal((await primeira).enviados, 1)
  assert.equal(chamadas.length, 1, 'a 2a nao publicou')
  // terminou: o cliente pode executar de novo
  aoPublicar = null
  assert.equal((await scheduler.executarAgora(a.deps, a.userId)).enviados, 1)
  // limite de uso (a rota passa "liberar")
  const r = await scheduler.executarAgora(a.deps, a.userId, { liberar: () => false })
  assert.deepEqual([r.status, r.codigo], [429, 'espere'])
})

test('agendador: cada cliente roda por conta propria (a espera de um nao trava os outros) e nunca em dobro', async (t) => {
  const a = ambiente({})
  const b = ambiente({})
  // um unico arquivo de configuracao com os dois clientes
  const CONFIGS = path.join(a.dir, 'dois.json')
  const todos = {}
  for (const x of [a, b]) todos[x.userId] = x.cfg()
  fs.writeFileSync(CONFIGS, JSON.stringify(todos))
  const deps = Object.assign({}, a.deps, { CONFIGS })
  let liberarA
  const presoA = new Promise((r) => { liberarA = r })
  aoPublicar = (uid) => (uid === a.userId ? presoA : null)

  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] })
  scheduler.start(deps)
  t.mock.timers.tick(15000)
  for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r))
  const lido = () => JSON.parse(fs.readFileSync(CONFIGS, 'utf8'))
  assert.equal((lido()[b.userId].ads || {}).sentToday, 1, 'B terminou enquanto A ainda esta parado')
  assert.equal((lido()[a.userId].ads || {}).sentToday, undefined, 'A segue preso no publicador')

  t.mock.timers.tick(20000) // novo tick com A ainda executando
  for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r))
  assert.equal(chamadas.filter((u) => u === a.userId).length, 1, 'A nao foi iniciado em dobro')

  liberarA()
  for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r))
  assert.equal((lido()[a.userId].ads || {}).sentToday, 1)
})

// ---- rota POST /automacoes/executar ----
function rotaDe(a, opcoes = {}) {
  let handler
  const app = { post: (p, ...h) => { if (p === '/automacoes/executar') handler = h[h.length - 1] } }
  automacoesRoutes.mount(app, { auth: () => {}, readJson: a.deps.readJson, writeJson: a.deps.writeJson, CONFIGS: a.deps.CONFIGS, DATA: a.dir, logs }, Object.assign({ random: () => 0, dormir: async () => {} }, opcoes))
  return async (userId) => {
    const res = { code: 200, body: null, status(c) { this.code = c; return this }, json(b) { this.body = b; return this } }
    await handler({ user: { id: userId }, body: { userId: 'outro' } }, res)
    return res
  }
}

test('rota: executa, devolve mensagem, traduz as recusas em HTTP e limita a 1 execucao por janela', async () => {
  const a = ambiente({ perRunMin: 2, perRunMax: 2 })
  const chamar = rotaDe(a)
  let r = await chamar(a.userId)
  assert.equal(r.code, 200)
  assert.equal(r.body.ok, true)
  assert.equal(r.body.enviados, 2)
  assert.match(r.body.message, /2 produto/)
  r = await chamar(a.userId)
  assert.equal(r.code, 429, 'segunda execucao dentro da janela de 20 s')
  assert.equal(r.body.codigo, 'espere')

  const lic = ambiente({}, { license: { active: true, expiresAt: new Date(Date.now() - 1000).toISOString() } })
  r = await rotaDe(lic)(lic.userId)
  assert.equal(r.code, 403)
  assert.match(r.body.error, /Licença/)

  const semConta = await rotaDe(a)('nao-existe')
  assert.equal(semConta.code, 404)
  assert.equal(chamadas.length, 2, 'so a 1a execucao publicou (userId do corpo e ignorado)')
})
