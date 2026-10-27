const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

process.env.SAAS_MASTER_KEY = 'chave-mestra-so-para-teste-0123456789abcdef'

const links = require('./links')
const ofertas = require('../ofertas')
const agendadas = require('./agendadas')
const exec = require('./agendadasExec')
const routes = require('./agendadasRoutes')
const atribuicao = require('./atribuicao')

links.validarAoVivo = async () => ({ ok: true, motivo: '' })
const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'namy-agenda-'))
const BRT = (s) => Date.parse(s + '-03:00')
const CFG = (extra) => Object.assign({
  license: { active: true, expiresAt: new Date(Date.now() + 864e5).toISOString() },
  shopee: { appId: 'APP1', secret: 'SEG' },
  groups: [{ jid: 'g1@g.us', name: 'Casa 1', niche: 'casa' }, { jid: 'g2@g.us', name: 'Casa 2', niche: 'casa' }, { jid: 'fonte@g.us', name: 'Fonte', niche: 'geral' }],
  sources: [{ jid: 'fonte@g.us', name: 'Fonte' }]
}, extra || {})
const ENTRADA = (extra) => Object.assign({ nome: 'Bom dia', texto: 'Bom dia, pessoal!', destinos: ['g1@g.us'], recorrencia: { tipo: 'diaria', hora: '09:00' } }, extra || {})

// ---------------------------------------------------------------- recorrencia

test('proxima: diaria, estritamente depois, virada de dia e de mes', () => {
  const r = { tipo: 'diaria', hora: '09:00' }
  assert.equal(agendadas.proxima(r, BRT('2026-10-25T08:59:00')), BRT('2026-10-25T09:00:00'))
  assert.equal(agendadas.proxima(r, BRT('2026-10-25T09:00:00')), BRT('2026-10-26T09:00:00'), 'no minuto exato ja passou')
  assert.equal(agendadas.proxima(r, BRT('2026-10-31T23:59:00')), BRT('2026-11-01T09:00:00'))
  assert.equal(agendadas.proxima({ tipo: 'diaria', hora: '00:30' }, BRT('2026-12-31T23:00:00')), BRT('2027-01-01T00:30:00'))
})

test('proxima: dia da semana, a cada N dias e unica', () => {
  // 2026-10-25 e domingo (0)
  const sem = { tipo: 'semanal', hora: '10:00', dias: [1, 3] }
  assert.equal(agendadas.proxima(sem, BRT('2026-10-25T12:00:00')), BRT('2026-10-26T10:00:00'))
  assert.equal(agendadas.proxima(sem, BRT('2026-10-26T10:00:00')), BRT('2026-10-28T10:00:00'))
  assert.equal(agendadas.proxima(sem, BRT('2026-10-28T10:00:01')), BRT('2026-11-02T10:00:00'))
  const cada = { tipo: 'cada', hora: '08:00', cadaDias: 3, inicio: '2026-10-20' }
  assert.equal(agendadas.proxima(cada, BRT('2026-10-20T07:00:00')), BRT('2026-10-20T08:00:00'))
  assert.equal(agendadas.proxima(cada, BRT('2026-10-20T08:00:00')), BRT('2026-10-23T08:00:00'))
  assert.equal(agendadas.proxima(cada, BRT('2026-10-24T00:00:00')), BRT('2026-10-26T08:00:00'))
  assert.equal(agendadas.proxima({ tipo: 'cada', hora: '08:00', cadaDias: 2, inicio: '2026-11-10' }, BRT('2026-10-25T00:00:00')), BRT('2026-11-10T08:00:00'), 'inicio no futuro')
  const uma = { tipo: 'uma', hora: '18:00', data: '2026-10-30' }
  assert.equal(agendadas.proxima(uma, BRT('2026-10-25T00:00:00')), BRT('2026-10-30T18:00:00'))
  assert.equal(agendadas.proxima(uma, BRT('2026-10-30T18:00:00')), null)
  assert.equal(agendadas.proximas({ tipo: 'diaria', hora: '09:00' }, BRT('2026-10-25T10:00:00'), 3).length, 3)
  assert.equal(agendadas.proximas(uma, BRT('2026-11-01T00:00:00'), 5).length, 0)
})

test('validarRecorrencia e validar recusam entrada ruim', () => {
  const v = (r) => agendadas.validarRecorrencia(r, BRT('2026-10-25T10:00:00'))
  assert.throws(() => v(null), /quando/)
  assert.throws(() => v({ tipo: 'diaria', hora: '25:00' }), /Horário/)
  assert.throws(() => v({ tipo: 'diaria', hora: '9:00' }), /Horário/)
  assert.throws(() => v({ tipo: 'diaria' }), /Horário/)
  assert.throws(() => v({ tipo: 'foo', hora: '09:00' }), /Tipo/)
  assert.throws(() => v({ tipo: 'uma', hora: '09:00', data: '2026-02-31' }), /Data/)
  assert.throws(() => v({ tipo: 'uma', hora: '09:00' }), /Data/)
  assert.throws(() => v({ tipo: 'semanal', hora: '09:00', dias: [] }), /dia da semana/)
  assert.throws(() => v({ tipo: 'semanal', hora: '09:00', dias: [7] }), /dia da semana/)
  assert.throws(() => v({ tipo: 'cada', hora: '09:00', cadaDias: 0 }), /N de 1 a 60/)
  assert.throws(() => v({ tipo: 'cada', hora: '09:00', cadaDias: 61 }), /N de 1 a 60/)
  assert.deepEqual(v({ tipo: 'semanal', hora: '09:00', dias: ['3', 1, 1] }), { tipo: 'semanal', hora: '09:00', dias: [1, 3] })
  assert.equal(v({ tipo: 'cada', hora: '09:00', cadaDias: 2 }).inicio, '2026-10-25')
  const cfg = CFG()
  assert.throws(() => agendadas.validar(ENTRADA({ nome: ' ' }), cfg), /nome/)
  assert.throws(() => agendadas.validar(ENTRADA({ texto: '' }), cfg), /mensagem/)
  assert.throws(() => agendadas.validar(ENTRADA({ texto: 'x'.repeat(3501) }), cfg), /grande/)
  assert.throws(() => agendadas.validar(ENTRADA({ imagemUrl: 'http://x/y.jpg' }), cfg), /https/)
  assert.throws(() => agendadas.validar(ENTRADA({ destinos: [] }), cfg), /grupo/)
  assert.throws(() => agendadas.validar(ENTRADA({ destinos: ['outro@g.us'] }), cfg), /salvou/)
  assert.throws(() => agendadas.validar(ENTRADA({ destinos: ['fonte@g.us'] }), cfg), /fonte/)
  assert.throws(() => agendadas.validar(ENTRADA({ destinos: ['x; drop'] }), cfg), /inválido/)
  assert.throws(() => agendadas.validar(ENTRADA({ destinos: 'g1@g.us' }), cfg), /grupo/)
})

// ---------------------------------------------------------------- armazenamento

test('criar nasce pausada; ativar calcula a proxima; unica no passado nao liga; editar recalcula; remover', async () => {
  const d = dir()
  const cfg = CFG()
  const a = await agendadas.criar(d, 'u1', cfg, ENTRADA())
  assert.equal(a.ativo, false)
  assert.equal(a.proximaEm, null)
  const on = await agendadas.ativar(d, 'u1', a.id, true)
  assert.equal(on.ativo, true)
  assert.ok(Date.parse(on.proximaEm) > Date.now())
  const ed = await agendadas.editar(d, 'u1', cfg, a.id, ENTRADA({ recorrencia: { tipo: 'diaria', hora: '21:30' } }))
  assert.match(ed.proximaEm, /T(00:30|24:30|0[0-9]:30)|:30:00/)
  assert.equal((await agendadas.ativar(d, 'u1', a.id, false)).proximaEm, null)
  const velha = await agendadas.criar(d, 'u1', cfg, ENTRADA({ recorrencia: { tipo: 'uma', hora: '09:00', data: '2020-01-01' } }))
  await assert.rejects(() => agendadas.ativar(d, 'u1', velha.id, true), /já passou/)
  await assert.rejects(() => agendadas.ativar(d, 'u1', 'naoexiste', true), /não encontrada/)
  await agendadas.remover(d, 'u1', a.id)
  assert.equal(agendadas.listar(d, 'u1').length, 1)
  await assert.rejects(() => agendadas.remover(d, 'u1', a.id), /não encontrada/)
  assert.equal(agendadas.listar(d, 'u2').length, 0, 'isolada por conta')
})

test('limite de agendas por conta', async () => {
  const d = dir()
  const cfg = CFG()
  for (let i = 0; i < agendadas.MAX_AGENDAS; i++) await agendadas.criar(d, 'u1', cfg, ENTRADA({ nome: 'a' + i }))
  await assert.rejects(() => agendadas.criar(d, 'u1', cfg, ENTRADA()), /Limite/)
})

test('reservarVencidas: dentro da tolerancia roda, fora vira perdida, unica desliga, e nunca duas vezes', async () => {
  const d = dir()
  const cfg = CFG()
  const a = await agendadas.criar(d, 'u1', cfg, ENTRADA())
  await agendadas.ativar(d, 'u1', a.id, true)
  const prevista = Date.parse(agendadas.listar(d, 'u1')[0].proximaEm)
  assert.equal((await agendadas.reservarVencidas(d, 'u1', prevista - 1000)).length, 0, 'ainda nao e a hora')
  const [r1, r2] = await Promise.all([agendadas.reservarVencidas(d, 'u1', prevista + 5000), agendadas.reservarVencidas(d, 'u1', prevista + 5000)])
  assert.equal(r1.length + r2.length, 1, 'duas chamadas simultaneas: so uma recebe')
  const run = [...r1, ...r2][0]
  assert.equal(run.prevista, new Date(prevista).toISOString())
  assert.ok(Date.parse(agendadas.listar(d, 'u1')[0].proximaEm) > prevista, 'ja avancou para a proxima')
  // perdida: passou de 30 min
  const prox = Date.parse(agendadas.listar(d, 'u1')[0].proximaEm)
  assert.equal((await agendadas.reservarVencidas(d, 'u1', prox + agendadas.TOLERANCIA_MS + 60000)).length, 0)
  const it = agendadas.listar(d, 'u1')[0]
  assert.equal(it.ultimaExecucao.resultado, 'perdida')
  assert.equal(it.ativo, true)
  // unica: depois de rodar desliga
  const u = await agendadas.criar(d, 'u2', cfg, ENTRADA({ recorrencia: { tipo: 'uma', hora: '09:00', data: agendadas.ymdBR(Date.now() + 86400000) } }))
  await agendadas.ativar(d, 'u2', u.id, true)
  const quando = Date.parse(agendadas.listar(d, 'u2')[0].proximaEm)
  assert.equal((await agendadas.reservarVencidas(d, 'u2', quando + 1000)).length, 1)
  const depois = agendadas.listar(d, 'u2')[0]
  assert.equal(depois.ativo, false)
  assert.equal(depois.proximaEm, null)
})

// ---------------------------------------------------------------- executor

function ambiente(extraDeps) {
  const enviados = []
  const pausas = []
  const sessions = {
    publicState: () => ({ connected: true }),
    sendOffer: async (u, jid, msg) => { enviados.push({ jid, msg }) }
  }
  const deps = Object.assign({ sessions, DATA: dir(), dormir: async (ms) => { pausas.push(ms) }, random: () => 0.5 }, extraDeps || {})
  return { deps, enviados, pausas }
}
const itemDe = async (deps, cfg, extra) => agendadas.criar(deps.DATA, 'u1', cfg, ENTRADA(extra))

test('executar: envia a todos os grupos com pausa so entre eles e registra no historico', async () => {
  const cfg = CFG()
  const { deps, enviados, pausas } = ambiente()
  const it = await itemDe(deps, cfg, { destinos: ['g1@g.us', 'g2@g.us'], texto: 'Oi pessoal' })
  const reg = await exec.executar(deps, 'u1', cfg, it)
  assert.equal(reg.resultado, 'ok')
  assert.equal(reg.enviados, 2)
  assert.deepEqual(enviados.map((e) => e.jid), ['g1@g.us', 'g2@g.us'])
  assert.equal(enviados[0].msg.text, 'Oi pessoal')
  assert.equal(pausas.length, 1)
  assert.equal(pausas[0], 9000, 'meio da faixa 6 a 12 s')
  assert.equal(agendadas.listar(deps.DATA, 'u1')[0].ultimaExecucao.enviados, 2)
})

test('executar: link de loja vira o do cliente (origem agendada) e convite de grupo fica intacto', async () => {
  const cfg = CFG()
  const { deps, enviados } = ambiente()
  const chamadas = []
  const original = ofertas.encurtar
  ofertas.encurtar = async (a, s, url, subIds) => { chamadas.push(subIds); return 'https://s.shopee.com.br/MEULINK' }
  try {
    const it = await itemDe(deps, cfg, { texto: 'Oferta https://shopee.com.br/panela-i.9.3001\nEntre no grupo: https://chat.whatsapp.com/ABCdef123' })
    const reg = await exec.executar(deps, 'u1', cfg, it)
    assert.equal(reg.resultado, 'ok')
    assert.match(enviados[0].msg.text, /https:\/\/s\.shopee\.com\.br\/MEULINK/)
    assert.match(enviados[0].msg.text, /https:\/\/chat\.whatsapp\.com\/ABCdef123/)
    assert.equal(enviados[0].msg.text.includes('panela-i.9.3001'), false)
    assert.deepEqual(chamadas[0], ['agendada', 'geral'])
  } finally { ofertas.encurtar = original }
})

test('executar: link de loja que nao converte NAO e enviado; texto sem link ou so com link comum segue normal', async () => {
  const cfg = CFG()
  const { deps, enviados } = ambiente()
  const original = ofertas.encurtar
  ofertas.encurtar = async () => null
  try {
    const it = await itemDe(deps, cfg, { texto: 'Veja https://shopee.com.br/panela-i.9.3002' })
    const reg = await exec.executar(deps, 'u1', cfg, it)
    assert.equal(reg.resultado, 'falhou')
    assert.match(reg.motivo, /link/)
    assert.equal(enviados.length, 0)
    const sem = await itemDe(deps, cfg, { texto: 'Siga nosso site https://exemplo.com.br/loja' })
    assert.equal((await exec.executar(deps, 'u1', cfg, sem)).resultado, 'ok')
    assert.equal(enviados[0].msg.text, 'Siga nosso site https://exemplo.com.br/loja')
  } finally { ofertas.encurtar = original }
})

test('executar: grupo removido, virou fonte e acima do limite ficam no registro sem enviar', async () => {
  const { deps, enviados } = ambiente()
  const cfg0 = CFG({ groups: [{ jid: 'g1@g.us', name: 'Casa 1' }, { jid: 'g2@g.us', name: 'Casa 2' }, { jid: 'g3@g.us', name: 'Casa 3' }] })
  const it = await itemDe(deps, cfg0, { destinos: ['g1@g.us', 'g2@g.us', 'g3@g.us'] })
  const cfg = Object.assign({}, cfg0, { groups: cfg0.groups.slice(1), sources: [{ jid: 'g3@g.us' }], agendadas: { maxGrupos: 1, pausaMin: 3, pausaMax: 3 } })
  const reg = await exec.executar(deps, 'u1', cfg, it)
  assert.equal(reg.enviados, 1)
  assert.deepEqual(enviados.map((e) => e.jid), ['g2@g.us'])
  const porJid = Object.fromEntries(reg.grupos.map((g) => [g.jid, g]))
  assert.match(porJid['g1@g.us'].erro, /não é mais um destino/)
  assert.match(porJid['g3@g.us'].erro, /fonte/)
  assert.equal(reg.resultado, 'parcial')
  // todos invalidos
  const reg2 = await exec.executar(deps, 'u1', Object.assign({}, cfg, { groups: [] }), it)
  assert.equal(reg2.resultado, 'falhou')
  assert.equal(enviados.length, 1)
})

test('executar: falha em um grupo nao para os outros; WhatsApp caido interrompe o resto; licenca vencida nao envia', async () => {
  const cfg = CFG({ groups: [{ jid: 'g1@g.us', name: 'A' }, { jid: 'g2@g.us', name: 'B' }, { jid: 'g3@g.us', name: 'C' }] })
  const e1 = ambiente()
  e1.deps.sessions.sendOffer = async (u, jid, msg) => { if (jid === 'g1@g.us') throw new Error('falha de teste'); e1.enviados.push({ jid, msg }) }
  const it = await itemDe(e1.deps, cfg, { destinos: ['g1@g.us', 'g2@g.us', 'g3@g.us'] })
  const reg = await exec.executar(e1.deps, 'u1', cfg, it)
  assert.equal(reg.resultado, 'parcial')
  assert.equal(reg.enviados, 2)
  assert.equal(reg.falhas, 1)

  const e2 = ambiente()
  e2.deps.sessions.sendOffer = async (u, jid) => { throw Object.assign(new Error('WhatsApp nao esta conectado'), { code: 'WA' }) }
  const it2 = await itemDe(e2.deps, cfg, { destinos: ['g1@g.us', 'g2@g.us', 'g3@g.us'] })
  const r2 = await exec.executar(e2.deps, 'u1', cfg, it2)
  assert.equal(r2.resultado, 'falhou')
  assert.equal(r2.grupos.length, 3)
  assert.equal(e2.pausas.length, 0, 'nao espera nem martela os outros grupos')

  const e3 = ambiente()
  const it3 = await itemDe(e3.deps, cfg, {})
  const vencida = Object.assign({}, cfg, { license: { active: true, expiresAt: '2020-01-01T00:00:00Z' } })
  assert.equal((await exec.executar(e3.deps, 'u1', vencida, it3)).resultado, 'falhou')
  assert.equal(e3.enviados.length, 0)
})

test('executar com atribuicao por grupo: um link por grupo', async () => {
  const cfg = CFG({ comissoes: { porGrupo: true }, groups: [{ jid: 'g1@g.us', name: 'A', niche: 'casa' }, { jid: 'g2@g.us', name: 'B', niche: 'casa' }] })
  const { deps, enviados } = ambiente()
  const original = ofertas.encurtar
  ofertas.encurtar = async (a, s, url, subIds) => 'https://s.shopee.com.br/' + subIds.join('')
  try {
    const it = await itemDe(deps, cfg, { destinos: ['g1@g.us', 'g2@g.us'], texto: 'Veja https://shopee.com.br/panela-i.9.3003' })
    const reg = await exec.executar(deps, 'u1', cfg, it)
    assert.equal(reg.enviados, 2)
    assert.match(enviados[0].msg.text, new RegExp('agendadacasa' + atribuicao.hashGrupo('g1@g.us')))
    assert.match(enviados[1].msg.text, new RegExp('agendadacasa' + atribuicao.hashGrupo('g2@g.us')))
  } finally { ofertas.encurtar = original }
})

test('limites: valores fora da faixa voltam ao padrao e pausaMax nunca fica abaixo da minima', () => {
  assert.deepEqual(exec.limites(undefined), { maxGrupos: 10, pausaMin: 6, pausaMax: 12 })
  assert.deepEqual(exec.limites({ maxGrupos: 99, pausaMin: 1, pausaMax: 'x' }), { maxGrupos: 10, pausaMin: 6, pausaMax: 12 })
  assert.deepEqual(exec.limites({ maxGrupos: 5, pausaMin: 20, pausaMax: 10 }), { maxGrupos: 5, pausaMin: 20, pausaMax: 20 })
})

// ---------------------------------------------------------------- motor

test('ciclo: WhatsApp fora nao reserva nada (tenta no proximo ciclo); conectado executa uma vez', async () => {
  const cfg = CFG()
  const e = ambiente()
  const configs = { u1: cfg }
  e.deps.readJson = () => configs
  e.deps.CONFIGS = 'x'
  const it = await itemDe(e.deps, cfg, {})
  await agendadas.ativar(e.deps.DATA, 'u1', it.id, true)
  const prevista = Date.parse(agendadas.listar(e.deps.DATA, 'u1')[0].proximaEm)
  e.deps.sessions.publicState = () => ({ connected: false })
  assert.equal(await exec.ciclo(e.deps, 'u1', cfg, prevista + 1000), 0)
  assert.equal(agendadas.listar(e.deps.DATA, 'u1')[0].proximaEm, new Date(prevista).toISOString(), 'continua devida')
  e.deps.sessions.publicState = () => ({ connected: true })
  assert.equal(await exec.ciclo(e.deps, 'u1', cfg, prevista + 2000), 1)
  assert.equal(e.enviados.length, 1)
  assert.equal(await exec.ciclo(e.deps, 'u1', cfg, prevista + 3000), 0, 'ja rodou')
  assert.equal(e.enviados.length, 1)
  assert.equal(agendadas.listar(e.deps.DATA, 'u1')[0].ultimaExecucao.origem, 'agenda')
  // sem arquivo de agendas: nem toca no disco
  assert.equal(await exec.ciclo(e.deps, 'u-sem', cfg, Date.now()), 0)
  assert.equal(fs.existsSync(path.join(e.deps.DATA, 'agendadas', 'u-sem.json')), false)
})

// ---------------------------------------------------------------- rotas

function rotas(cfgs, opcoes) {
  const d = dir()
  const R = {}
  const app = { get: (p, ...h) => { R['GET ' + p] = h[h.length - 1] }, post: (p, ...h) => { R['POST ' + p] = h[h.length - 1] } }
  const CONFIGS = path.join(d, 'configs.json')
  fs.writeFileSync(CONFIGS, JSON.stringify(cfgs))
  const readJson = (f, def) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return def } }
  const writeJson = (f, v) => fs.writeFileSync(f, JSON.stringify(v))
  const enviados = []
  const sessions = { publicState: () => ({ connected: true }), sendOffer: async (u, jid, msg) => { enviados.push({ u, jid, msg }) } }
  routes.mount(app, { auth: () => {}, readJson, writeJson, CONFIGS, DATA: d, logs: null, sessions }, Object.assign({ dormir: async () => {} }, opcoes))
  return { d, enviados, readJson, CONFIGS, chamar: async (m, c, userId, body) => {
    const res = { code: 200, body: null, status(x) { this.code = x; return this }, json(b) { this.body = b; return this } }
    await R[m + ' ' + c]({ user: { id: userId }, body: body || {}, query: {} }, res)
    return res
  } }
}

test('rotas: criar pausada, ligar exige confirmacao, so o dono mexe, enviar agora com confirmacao e limite', async () => {
  const R = rotas({ u1: CFG(), u2: CFG() }, { enviosPorMin: 1 })
  assert.equal((await R.chamar('POST', '/agendadas/criar', 'nao-existe', ENTRADA())).code, 404)
  assert.equal((await R.chamar('POST', '/agendadas/criar', 'u1', ENTRADA({ texto: '' }))).code, 400)
  const c = await R.chamar('POST', '/agendadas/criar', 'u1', ENTRADA())
  assert.equal(c.code, 200)
  assert.equal(c.body.agenda.ativo, false)
  const id = c.body.agenda.id
  assert.equal((await R.chamar('POST', '/agendadas/ativar', 'u1', { id, ativo: true })).code, 400, 'sem confirmo')
  assert.equal((await R.chamar('POST', '/agendadas/ativar', 'u1', { id, ativo: true, confirmo: 'sim' })).code, 400)
  assert.equal((await R.chamar('POST', '/agendadas/ativar', 'u1', { id, ativo: 'x' })).code, 400)
  assert.equal((await R.chamar('POST', '/agendadas/ativar', 'u1', { id: '../x', ativo: true, confirmo: true })).code, 400)
  assert.equal((await R.chamar('POST', '/agendadas/ativar', 'u2', { id, ativo: true, confirmo: true })).code, 404, 'outra conta nao acha')
  const on = await R.chamar('POST', '/agendadas/ativar', 'u1', { id, ativo: true, confirmo: true })
  assert.equal(on.body.agenda.ativo, true)
  assert.equal((await R.chamar('POST', '/agendadas/ativar', 'u1', { id, ativo: false })).body.agenda.ativo, false, 'pausar nao pede confirmacao')
  assert.equal((await R.chamar('POST', '/agendadas/enviar-agora', 'u1', { id })).code, 400, 'sem confirmo nada e enviado')
  assert.equal(R.enviados.length, 0)
  assert.equal((await R.chamar('POST', '/agendadas/enviar-agora', 'u2', { id, confirmo: true })).code, 404)
  const ag = await R.chamar('POST', '/agendadas/enviar-agora', 'u1', { id, confirmo: true })
  assert.equal(ag.code, 200)
  assert.equal(ag.body.registro.enviados, 1)
  assert.equal(R.enviados[0].msg.text, 'Bom dia, pessoal!')
  assert.equal((await R.chamar('POST', '/agendadas/enviar-agora', 'u1', { id, confirmo: true })).code, 429)
  const lista = await R.chamar('GET', '/agendadas', 'u1')
  assert.equal(lista.body.agendas.length, 1)
  assert.equal(lista.body.grupos.some((g) => g.jid === 'fonte@g.us'), false, 'fonte nao aparece como destino')
  assert.equal((await R.chamar('GET', '/agendadas', 'u2')).body.agendas.length, 0)
  assert.equal((await R.chamar('POST', '/agendadas/remover', 'u2', { id })).code, 404)
  assert.equal((await R.chamar('POST', '/agendadas/remover', 'u1', { id })).code, 200)
})

test('rotas: licenca vencida, WhatsApp fora, previa e limites', async () => {
  const vencida = CFG({ license: { active: true, expiresAt: '2020-01-01T00:00:00Z' } })
  const R = rotas({ u1: CFG(), u3: vencida })
  assert.equal((await R.chamar('POST', '/agendadas/criar', 'u3', ENTRADA())).code, 403)
  const c = await R.chamar('POST', '/agendadas/criar', 'u1', ENTRADA())
  const id = c.body.agenda.id
  const R2 = rotas({ u1: CFG() })
  R2.chamar.length // outra instancia, outro disco
  const pv = await R.chamar('POST', '/agendadas/previa', 'u1', { recorrencia: { tipo: 'diaria', hora: '09:00' } })
  assert.equal(pv.body.proximas.length, 5)
  assert.equal((await R.chamar('POST', '/agendadas/previa', 'u1', { recorrencia: { tipo: 'diaria', hora: '99:00' } })).code, 400)
  const l = await R.chamar('POST', '/agendadas/config', 'u1', { maxGrupos: 5, pausaMin: 5, pausaMax: 9 })
  assert.deepEqual(l.body.limites, { maxGrupos: 5, pausaMin: 5, pausaMax: 9 })
  assert.equal((await R.chamar('POST', '/agendadas/config', 'u1', { maxGrupos: 31, pausaMin: 5, pausaMax: 9 })).code, 400)
  assert.equal((await R.chamar('POST', '/agendadas/config', 'u1', { maxGrupos: 5, pausaMin: 2, pausaMax: 9 })).code, 400)
  assert.equal((await R.chamar('POST', '/agendadas/config', 'u1', { maxGrupos: 5, pausaMin: 20, pausaMax: 9 })).code, 400)
  assert.equal((await R.chamar('POST', '/agendadas/config', 'u1', { maxGrupos: 5.5, pausaMin: 5, pausaMax: 9 })).code, 400)
  assert.equal(R.readJson(R.CONFIGS, {}).u1.agendadas.maxGrupos, 5)
  assert.ok(id)
})
