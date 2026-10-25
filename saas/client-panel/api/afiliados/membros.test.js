const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const membros = require('./membros')
const membrosRoutes = require('./membrosRoutes')
const jsonStore = require('./jsonStore')

const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'namy-membros-'))
const BRT = (s) => Date.parse(s + '-03:00')
const CFG = (extra) => Object.assign({ groups: [{ jid: 'g1@g.us', name: 'Casa 1' }, { jid: 'g2@g.us', name: 'Casa 2' }] }, extra || {})
const NUM = '5527999998888@s.whatsapp.net'

function ambiente(cfg, tam) {
  const d = dir()
  const cfgs = { u1: cfg || CFG() }
  const sessions = {
    publicState: () => ({ connected: true }),
    listGroups: async () => tam || [{ jid: 'g1@g.us', name: 'Casa 1', participants: 100 }, { jid: 'g2@g.us', name: 'Casa 2', participants: 50 }, { jid: 'outro@g.us', name: 'Outro', participants: 9 }]
  }
  membros._buffer.clear()
  membros._cfgCache.clear()
  return { DATA: d, readJson: () => cfgs, CONFIGS: 'x', sessions, cfgs }
}
// formato do Baileys 7: participants sao objetos { id, phoneNumber, admin }
const ev = (action, n, id = 'g1@g.us') => ({ id, author: NUM, action, participants: Array.from({ length: n }, (_, i) => ({ id: i + '@lid', phoneNumber: NUM, admin: null })) })

test('registrarEvento: conta entradas e saidas so de grupo destino; ignora outras acoes e lixo', () => {
  const deps = ambiente()
  assert.equal(membros.registrarEvento(deps, 'u1', ev('add', 3)), true)
  assert.equal(membros.registrarEvento(deps, 'u1', ev('remove', 1)), true)
  assert.equal(membros.registrarEvento(deps, 'u1', ev('add', 2, 'outro@g.us')), false, 'nao e destino')
  assert.equal(membros.registrarEvento(deps, 'u1', ev('promote', 1)), false)
  assert.equal(membros.registrarEvento(deps, 'u1', ev('modify', 1)), false)
  assert.equal(membros.registrarEvento(deps, 'u1', ev('add', 0)), false, 'sem participantes')
  assert.equal(membros.registrarEvento(deps, 'u1', null), false)
  assert.equal(membros.registrarEvento(deps, 'u1', { id: 5, action: 'add', participants: [{}] }), false)
  assert.equal(membros.registrarEvento(deps, 'u1', { id: 'g1@g.us', action: 'add' }), false)
  const x = membros._buffer.get('u1').get(membros.ymdBR() + '|g1@g.us')
  assert.deepEqual(x, { e: 3, s: 1 })
  // participants como texto (formato antigo) tambem conta
  membros.registrarEvento(deps, 'u1', { id: 'g1@g.us', action: 'add', participants: ['a@s.whatsapp.net', 'b@s.whatsapp.net'] })
  assert.equal(membros._buffer.get('u1').get(membros.ymdBR() + '|g1@g.us').e, 5)
})

test('gravar acumula por dia, e NADA que identifique membro vai para o disco', async () => {
  const deps = ambiente()
  const agora = BRT('2026-10-25T12:00:00')
  membros.registrarEvento(deps, 'u1', ev('add', 4), agora)
  membros.registrarEvento(deps, 'u1', ev('remove', 1), agora)
  await membros.gravar(deps, 'u1', deps.cfgs.u1, agora)
  membros.registrarEvento(deps, 'u1', ev('add', 2), agora + 3600000)
  await membros.gravar(deps, 'u1', deps.cfgs.u1, agora + 3600000)
  const db = jsonStore.load(deps.DATA, membros.PASTA, 'u1', () => ({}))
  assert.deepEqual(db.dias['2026-10-25']['g1@g.us'], { e: 6, s: 1 })
  const bruto = fs.readFileSync(path.join(deps.DATA, membros.PASTA, 'u1.json'), 'utf8')
  assert.equal(bruto.includes('5527999998888'), false, 'numero de telefone nunca e gravado')
  assert.equal(bruto.includes('@lid'), false)
  assert.equal(bruto.includes('@s.whatsapp.net'), false)
  assert.equal((await membros.gravar(deps, 'u1', deps.cfgs.u1, agora)).length, 0, 'buffer vazio: nada a fazer')
})

test('virada do dia no fuso de Brasilia: 23:59 e 00:01 caem em dias diferentes', async () => {
  const deps = ambiente()
  membros.registrarEvento(deps, 'u1', ev('add', 1), BRT('2026-10-25T23:59:00'))
  membros.registrarEvento(deps, 'u1', ev('add', 1), BRT('2026-10-26T00:01:00'))
  await membros.gravar(deps, 'u1', deps.cfgs.u1, BRT('2026-10-26T00:02:00'))
  const db = jsonStore.load(deps.DATA, membros.PASTA, 'u1', () => ({}))
  assert.equal(db.dias['2026-10-25']['g1@g.us'].e, 1)
  assert.equal(db.dias['2026-10-26']['g1@g.us'].e, 1)
})

test('alerta: precisa de mais saidas que entradas e passar do maior entre minimo e porcentagem; so uma vez por dia', async () => {
  assert.equal(membros.emAlerta({ e: 0, s: 5 }, 40, undefined), true, 'minimo 5')
  assert.equal(membros.emAlerta({ e: 0, s: 4 }, 40, undefined), false)
  assert.equal(membros.emAlerta({ e: 0, s: 10 }, 400, undefined), false, '5% de 400 = 20')
  assert.equal(membros.emAlerta({ e: 0, s: 20 }, 400, undefined), true)
  assert.equal(membros.emAlerta({ e: 9, s: 9 }, 40, undefined), false, 'saldo zero nao alerta')
  assert.equal(membros.emAlerta({ e: 1, s: 3 }, 40, { minSaidas: 3, pct: 1 }), true, 'limites do cliente')
  assert.equal(membros.emAlerta(undefined, 40, undefined), false)
  assert.deepEqual(membros.limites({ minSaidas: 999, pct: 'x' }), { minSaidas: 5, pct: 5 })

  const deps = ambiente()
  const agora = BRT('2026-10-25T10:00:00')
  await membros.snapshot(deps, 'u1', deps.cfgs.u1, agora)
  membros.registrarEvento(deps, 'u1', ev('remove', 6), agora)
  const novos = await membros.gravar(deps, 'u1', deps.cfgs.u1, agora)
  assert.equal(novos.length, 1)
  assert.equal(novos[0].jid, 'g1@g.us')
  assert.equal(novos[0].tamanho, 100)
  membros.registrarEvento(deps, 'u1', ev('remove', 2), agora + 1000)
  assert.equal((await membros.gravar(deps, 'u1', deps.cfgs.u1, agora + 1000)).length, 0, 'ja avisou hoje')
  membros.registrarEvento(deps, 'u1', ev('remove', 9), agora + 86400000)
  assert.equal((await membros.gravar(deps, 'u1', deps.cfgs.u1, agora + 86400000)).length, 1, 'outro dia avisa de novo')
})

test('snapshot guarda o tamanho so dos grupos monitorados, um por dia, sobrescrevendo o do dia', async () => {
  const deps = ambiente()
  const agora = BRT('2026-10-25T10:00:00')
  assert.equal(await membros.snapshot(deps, 'u1', deps.cfgs.u1, agora), 3)
  deps.sessions.listGroups = async () => [{ jid: 'g1@g.us', participants: 120 }]
  await membros.snapshot(deps, 'u1', deps.cfgs.u1, agora + 3600000)
  await membros.snapshot(deps, 'u1', deps.cfgs.u1, agora + 86400000)
  const db = jsonStore.load(deps.DATA, membros.PASTA, 'u1', () => ({}))
  assert.deepEqual(db.tamanhos['g1@g.us'], [{ dia: '2026-10-25', n: 120 }, { dia: '2026-10-26', n: 120 }])
  assert.equal(db.tamanhos['outro@g.us'], undefined, 'grupo nao monitorado nao entra')
  deps.sessions.listGroups = async () => { throw new Error('rate-overlimit') }
  await assert.rejects(() => membros.snapshot(deps, 'u1', deps.cfgs.u1, agora), /rate-overlimit/)
})

test('resumo: totais, por dia, por grupo, saldo, tamanho e ordenacao; retencao de 120 dias', async () => {
  const deps = ambiente()
  const agora = BRT('2026-10-25T12:00:00')
  await membros.snapshot(deps, 'u1', deps.cfgs.u1, agora - 9 * 86400000)
  await membros.snapshot(deps, 'u1', deps.cfgs.u1, agora)
  for (const [dias, a, n, id] of [[0, 'add', 5, 'g1@g.us'], [0, 'remove', 8, 'g1@g.us'], [2, 'add', 3, 'g2@g.us'], [8, 'add', 4, 'g2@g.us']]) {
    membros.registrarEvento(deps, 'u1', ev(a, n, id), agora - dias * 86400000)
  }
  const r7 = await membros.resumo(deps, 'u1', deps.cfgs.u1, 7, agora)
  assert.equal(r7.porDia.length, 7)
  assert.equal(r7.entrou, 8)
  assert.equal(r7.saiu, 8)
  assert.equal(r7.saldo, 0)
  const g1 = r7.grupos.find((g) => g.jid === 'g1@g.us')
  assert.deepEqual([g1.entrou, g1.saiu, g1.saldo, g1.tamanho, g1.alerta], [5, 8, -3, 100, true])
  assert.equal(r7.grupos[0].jid, 'g1@g.us', 'alerta primeiro')
  assert.equal(r7.alertas, 1)
  const r30 = await membros.resumo(deps, 'u1', deps.cfgs.u1, 30, agora)
  assert.equal(r30.entrou, 12, 'o de 8 dias atras entra no periodo de 30')
  assert.equal(r30.monitorandoDesde, '2026-10-17')
  await assert.rejects(() => membros.resumo(deps, 'u1', deps.cfgs.u1, 15, agora), /Periodo/)
  // grupo sem nenhum evento aparece zerado
  deps.cfgs.u1 = CFG({ groups: [{ jid: 'g1@g.us', name: 'Casa 1' }, { jid: 'g3@g.us', name: 'Nova' }] })
  const r = await membros.resumo(deps, 'u1', deps.cfgs.u1, 7, agora)
  assert.equal(r.grupos.find((g) => g.jid === 'g3@g.us').entrou, 0)
  assert.equal(r.grupos.find((g) => g.jid === 'g2@g.us').name, 'grupo removido')
  // retencao
  membros.registrarEvento(deps, 'u1', ev('add', 1), agora - 130 * 86400000)
  deps.cfgs.u1 = CFG()
  await membros.gravar(deps, 'u1', deps.cfgs.u1, agora)
  const db = jsonStore.load(deps.DATA, membros.PASTA, 'u1', () => ({}))
  assert.equal(Object.keys(db.dias).some((d) => d < '2026-06-27'), false, 'dados com mais de 120 dias saem')
})

// ---------------------------------------------------------------- rotas

function rotas(cfgs, sessions, opcoes) {
  const d = dir()
  const R = {}
  const app = { get: (p, ...h) => { R['GET ' + p] = h[h.length - 1] }, post: (p, ...h) => { R['POST ' + p] = h[h.length - 1] } }
  const CONFIGS = path.join(d, 'configs.json')
  fs.writeFileSync(CONFIGS, JSON.stringify(cfgs))
  const readJson = (f, def) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return def } }
  const writeJson = (f, v) => fs.writeFileSync(f, JSON.stringify(v))
  membrosRoutes.mount(app, { auth: () => {}, readJson, writeJson, CONFIGS, DATA: d, sessions }, opcoes)
  return { d, CONFIGS, readJson, chamar: async (m, c, userId, { body, query } = {}) => {
    const res = { code: 200, body: null, status(x) { this.code = x; return this }, json(b) { this.body = b; return this } }
    await R[m + ' ' + c]({ user: { id: userId }, body: body || {}, query: query || {} }, res)
    return res
  } }
}

test('rotas: periodo validado, dono, atualizar com WhatsApp e limite, config validada', async () => {
  membros._buffer.clear()
  const sessions = { publicState: () => ({ connected: true }), listGroups: async () => [{ jid: 'g1@g.us', participants: 10 }] }
  const R = rotas({ u1: CFG(), u2: CFG() }, sessions, { atualizacoesPorMin: 1 })
  assert.equal((await R.chamar('GET', '/membros', 'nao-existe')).code, 404)
  assert.equal((await R.chamar('GET', '/membros', 'u1', { query: { dias: '15' } })).code, 400)
  assert.equal((await R.chamar('GET', '/membros', 'u1', { query: { dias: 'abc' } })).code, 400)
  const ok = await R.chamar('GET', '/membros', 'u1', { query: {} })
  assert.equal(ok.code, 200)
  assert.equal(ok.body.dias, 30)
  assert.equal(ok.body.whatsapp, true)
  const at = await R.chamar('POST', '/membros/atualizar', 'u1')
  assert.equal(at.code, 200)
  assert.equal(at.body.grupos.find((g) => g.jid === 'g1@g.us').tamanho, 10)
  assert.equal((await R.chamar('POST', '/membros/atualizar', 'u1')).code, 429)
  assert.equal((await R.chamar('POST', '/membros/atualizar', 'u2')).code, 200, 'limite por usuario')
  assert.equal((await R.chamar('POST', '/membros/config', 'u1', { body: { minSaidas: 0, pct: 5 } })).code, 400)
  assert.equal((await R.chamar('POST', '/membros/config', 'u1', { body: { minSaidas: 5, pct: 51 } })).code, 400)
  assert.equal((await R.chamar('POST', '/membros/config', 'u1', { body: { minSaidas: 5.5, pct: 5 } })).code, 400)
  const c = await R.chamar('POST', '/membros/config', 'u1', { body: { minSaidas: 8, pct: 10 } })
  assert.deepEqual(c.body.limites, { minSaidas: 8, pct: 10 })
  assert.equal(R.readJson(R.CONFIGS, {}).u2.membros, undefined)

  const fora = rotas({ u1: CFG() }, { publicState: () => ({ connected: false }), listGroups: async () => [] })
  assert.equal((await fora.chamar('POST', '/membros/atualizar', 'u1')).code, 400)
  assert.equal((await fora.chamar('GET', '/membros', 'u1', { query: {} })).body.whatsapp, false)
  const erro = rotas({ u1: CFG() }, { publicState: () => ({ connected: true }), listGroups: async () => { throw new Error('rate-overlimit') } })
  assert.equal((await erro.chamar('POST', '/membros/atualizar', 'u1')).code, 502)
})
