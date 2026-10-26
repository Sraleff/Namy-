const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

process.env.SAAS_MASTER_KEY = 'chave-mestra-so-para-teste-0123456789abcdef'

const links = require('./links')
const pool = require('./pool')
const auditoria = require('./auditoria')
const diagnostico = require('./diagnostico')
const diagRoutes = require('./diagnosticoRoutes')
const waRoutes = require('../waRoutes')

links.validarAoVivo = async () => ({ ok: true, motivo: '' })
const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'namy-diag-'))
const BRT = (s) => Date.parse(s + '-03:00')
const AGORA = BRT('2026-10-26T14:00:00') // segunda-feira
const CFG = (extra) => Object.assign({
  license: { active: true, expiresAt: new Date(AGORA + 30 * 86400000).toISOString() },
  shopee: { appId: 'A', secret: 'SEGREDO-NAO-VAZAR' },
  groups: [{ jid: 'g1@g.us', name: 'Casa 1', niche: 'casa' }, { jid: 'g2@g.us', name: 'Casa 2', niche: 'casa' }],
  sources: [],
  ads: { enabled: true, source: 'pool', interval: '2h', dailyLimit: 5, window: { from: '08:00', to: '20:00' }, days: [0, 1, 2, 3, 4, 5, 6] }
}, extra || {})
const conectado = { publicState: () => ({ connected: true }) }
const desconectado = { publicState: () => ({ connected: false }) }
const ctx = (d, cfg, sessions) => ({ userId: 'u1', cfg: cfg || CFG(), dataDir: d, sessions: sessions || conectado })
const nivel = (r, id) => (r.checks.find((c) => c.id === id) || {}).nivel

async function comOferta(d, cfg) {
  await pool.adicionar(d, 'u1', cfg || CFG(), { texto: 'Panela inox\nhttps://shopee.com.br/panela-i.9.1001', origem: 'manual' })
}

test('tudo certo: pode enviar, sem bloqueio e sem segredo na resposta', async () => {
  const d = dir()
  await comOferta(d)
  const r = diagnostico.diagnosticar(ctx(d), AGORA)
  assert.equal(r.pode, true)
  assert.match(r.frase, /Tudo certo/)
  assert.deepEqual(r.checks.filter((c) => c.nivel === 'bloqueio'), [])
  assert.equal(nivel(r, 'origem'), 'ok')
  assert.equal(JSON.stringify(r).includes('SEGREDO-NAO-VAZAR'), false)
  assert.deepEqual(r.hoje, { enviados: 0, limite: 5 })
})

test('bloqueios: licenca, WhatsApp, automacao desligada, sem destino', async () => {
  const d = dir()
  await comOferta(d)
  let r = diagnostico.diagnosticar(ctx(d, CFG({ license: { active: true, expiresAt: '2020-01-01T00:00:00Z' } })), AGORA)
  assert.equal(nivel(r, 'licenca'), 'bloqueio')
  assert.equal(r.pode, false)
  assert.match(r.frase, /licenca expirada/)
  r = diagnostico.diagnosticar(ctx(d, CFG(), desconectado), AGORA)
  assert.equal(nivel(r, 'whatsapp'), 'bloqueio')
  assert.match(r.frase, /whatsapp desconectado/)
  r = diagnostico.diagnosticar(ctx(d, CFG({ ads: Object.assign({}, CFG().ads, { enabled: false }) })), AGORA)
  assert.equal(nivel(r, 'automacao'), 'bloqueio')
  assert.match(r.checks.find((c) => c.id === 'automacao').detalhe, /Executar agora/)
  r = diagnostico.diagnosticar(ctx(d, CFG({ groups: [] })), AGORA)
  assert.equal(nivel(r, 'destinos'), 'bloqueio')
  r = diagnostico.diagnosticar({ userId: 'u1', cfg: CFG(), dataDir: d }, AGORA)
  assert.equal(nivel(r, 'whatsapp'), 'bloqueio', 'sem sessao = desconectado')
})

test('fonte x destino: todos em conflito bloqueia; parte em conflito avisa e diz quais', async () => {
  const d = dir()
  await comOferta(d)
  let r = diagnostico.diagnosticar(ctx(d, CFG({ sources: [{ jid: 'g1@g.us' }, { jid: 'g2@g.us' }] })), AGORA)
  assert.equal(nivel(r, 'destinos'), 'bloqueio')
  assert.match(r.checks.find((c) => c.id === 'destinos').detalhe, /Casa 1, Casa 2/)
  r = diagnostico.diagnosticar(ctx(d, CFG({ sources: [{ jid: 'g2@g.us' }] })), AGORA)
  assert.equal(r.pode, true)
  assert.equal(nivel(r, 'conflito'), 'aviso')
  assert.match(r.checks.find((c) => c.id === 'conflito').detalhe, /Casa 2/)
  assert.match(r.frase, /aviso: 1 grupo/)
})

test('origem: API sem chaves, banco vazio, e misto com banco vazio mas API pronta', async () => {
  const d = dir()
  let r = diagnostico.diagnosticar(ctx(d, CFG({ shopee: {}, ads: Object.assign({}, CFG().ads, { source: 'api' }) })), AGORA)
  assert.equal(nivel(r, 'origem'), 'bloqueio')
  assert.match(r.checks.find((c) => c.id === 'origem').titulo, /chaves da Shopee/)
  r = diagnostico.diagnosticar(ctx(d), AGORA)
  assert.equal(nivel(r, 'origem'), 'bloqueio', 'banco vazio')
  assert.match(r.checks.find((c) => c.id === 'origem').titulo, /sem ofertas/)
  r = diagnostico.diagnosticar(ctx(d, CFG({ ads: Object.assign({}, CFG().ads, { source: 'misto' }) })), AGORA)
  assert.equal(nivel(r, 'origem'), 'ok', 'misto: a API cobre')
  r = diagnostico.diagnosticar(ctx(d, CFG({ shopee: {}, ads: Object.assign({}, CFG().ads, { source: 'misto' }) })), AGORA)
  assert.equal(nivel(r, 'origem'), 'aviso')
  // oferta ja enviada a todos os grupos nao conta
  const cfg = CFG()
  const it = (await pool.adicionar(d, 'u1', cfg, { texto: 'Panela\nhttps://shopee.com.br/panela-i.9.2002', origem: 'manual' })).item
  await pool.marcarEnviado(d, 'u1', it.id, ['g1@g.us', 'g2@g.us'])
  assert.equal(nivel(diagnostico.diagnosticar(ctx(d, cfg), AGORA), 'origem'), 'bloqueio')
})

test('janela e dias: dentro, fora do horario, janela que cruza a meia-noite e dia nao permitido', async () => {
  const d = dir()
  await comOferta(d)
  const com = (ads) => CFG({ ads: Object.assign({}, CFG().ads, ads) })
  assert.equal(nivel(diagnostico.diagnosticar(ctx(d, com({})), AGORA), 'janela'), 'ok')
  let r = diagnostico.diagnosticar(ctx(d, com({ window: { from: '18:00', to: '22:00' } })), AGORA)
  assert.equal(nivel(r, 'janela'), 'aviso')
  assert.match(r.checks.find((c) => c.id === 'janela').detalhe, /18:00 as 22:00.*14:00/)
  assert.equal(nivel(diagnostico.diagnosticar(ctx(d, com({ window: { from: '22:00', to: '06:00' } })), AGORA), 'janela'), 'aviso')
  assert.equal(nivel(diagnostico.diagnosticar(ctx(d, com({ window: { from: '22:00', to: '06:00' } })), BRT('2026-10-26T23:30:00')), 'janela'), 'ok')
  r = diagnostico.diagnosticar(ctx(d, com({ days: [3, 5] })), AGORA)
  assert.equal(nivel(r, 'janela'), 'aviso')
  assert.match(r.checks.find((c) => c.id === 'janela').detalhe, /quarta/)
  assert.equal(nivel(diagnostico.diagnosticar(ctx(d, com({ window: undefined, days: undefined })), AGORA), 'janela'), 'ok', 'conta antiga sem janela')
})

test('limite diario e proxima execucao', async () => {
  const d = dir()
  await comOferta(d)
  const com = (ads) => CFG({ ads: Object.assign({}, CFG().ads, ads) })
  let r = diagnostico.diagnosticar(ctx(d, com({ sentDay: '2026-10-26', sentToday: 5 })), AGORA)
  assert.equal(nivel(r, 'limite'), 'bloqueio')
  assert.equal(r.pode, false)
  assert.equal(nivel(diagnostico.diagnosticar(ctx(d, com({ sentDay: '2026-10-25', sentToday: 5 })), AGORA), 'limite'), 'ok', 'contador de outro dia nao vale')
  r = diagnostico.diagnosticar(ctx(d, com({ nextTryAt: new Date(AGORA + 600000).toISOString() })), AGORA)
  assert.match(r.checks.find((c) => c.id === 'proxima').titulo, /previsto para hoje as 14:10/)
  assert.match(r.frase, /previsto/)
  r = diagnostico.diagnosticar(ctx(d, com({ lastSentAt: new Date(AGORA - 3600000).toISOString() })), AGORA)
  assert.match(r.checks.find((c) => c.id === 'proxima').titulo, /previsto para hoje as 15:00/)
  r = diagnostico.diagnosticar(ctx(d, com({ nextTryAt: new Date(AGORA + 86400000).toISOString() })), AGORA)
  assert.match(r.checks.find((c) => c.id === 'proxima').titulo, /amanha as 14:00/)
})

test('motivos reais das ultimas 24 h: agrupa, ordena e avisa quando nada saiu', async () => {
  const d = dir()
  await comOferta(d)
  const agora = Date.now()
  for (let i = 0; i < 3; i++) await auditoria.registrar(d, 'u1', { tipo: 'pulado', motivo: 'nicho casa: fora do nicho', grupo: 'Casa 1', jid: 'g1@g.us' })
  await auditoria.registrar(d, 'u1', { tipo: 'pulado', motivo: 'cupom vencido: ACABOU', grupo: 'Casa 1', jid: 'g1@g.us' })
  await auditoria.registrar(d, 'u1', { tipo: 'falha', motivo: 'WhatsApp: caiu', grupo: 'Casa 1', jid: 'g1@g.us' })
  let r = diagnostico.diagnosticar(ctx(d), agora)
  assert.deepEqual(r.motivosPulo[0], { motivo: 'nicho casa: fora do nicho', qtd: 3 })
  assert.equal(r.motivosPulo.length, 3)
  assert.equal(nivel(r, 'motivos'), 'aviso')
  assert.match(r.checks.find((c) => c.id === 'motivos').detalhe, /nicho casa/)
  assert.equal(r.ultimoEnvio, null)
  await auditoria.registrar(d, 'u1', { tipo: 'enviado', grupo: 'Casa 1', jid: 'g1@g.us', nome: 'Panela' })
  r = diagnostico.diagnosticar(ctx(d), agora)
  assert.equal(nivel(r, 'motivos'), 'info', 'saiu algo: so informa')
  assert.equal(r.ultimoEnvio.grupo, 'Casa 1')
  // registros de mais de 24 h nao entram
  assert.equal(diagnostico.diagnosticar(ctx(d), agora + 2 * 86400000).motivosPulo.length, 0)
  // outra conta
  assert.equal(diagnostico.diagnosticar({ userId: 'u2', cfg: CFG(), dataDir: d, sessions: conectado }, agora).motivosPulo.length, 0)
})

// ---------------------------------------------------------------- rotas

function rota(cfgs, sessions, opcoes) {
  const d = dir()
  let h
  const app = { get: (p, ...f) => { if (p === '/diagnostico') h = f[f.length - 1] } }
  diagRoutes.mount(app, { auth: () => {}, readJson: () => cfgs, CONFIGS: 'x', DATA: d, sessions: sessions || conectado }, opcoes)
  return async (userId) => {
    const res = { code: 200, body: null, status(c) { this.code = c; return this }, json(b) { this.body = b; return this } }
    await h({ user: { id: userId } }, res)
    return res
  }
}

test('GET /diagnostico: dono, 404 e limite por minuto', async () => {
  const chamar = rota({ u1: CFG() }, conectado, { leiturasPorMin: 2 })
  assert.equal((await chamar('u1')).code, 200)
  assert.equal((await chamar('nao-existe')).code, 404)
  assert.equal((await chamar('u1')).code, 200)
  assert.equal((await chamar('u1')).code, 429)
})

// ---------------------------------------------------------------- B4: salvar destino que e fonte

function rotasWa(cfgs) {
  const R = {}
  const app = { get: (p, ...h) => { R['GET ' + p] = h[h.length - 1] }, post: (p, ...h) => { R['POST ' + p] = h[h.length - 1] }, put: () => {}, delete: () => {} }
  const dados = JSON.parse(JSON.stringify(cfgs))
  // readJson real le o arquivo de novo a cada chamada: devolve uma copia, e so writeJson persiste
  waRoutes(app, { auth: () => {}, readJson: () => JSON.parse(JSON.stringify(dados)), writeJson: (f, v) => { Object.assign(dados, JSON.parse(JSON.stringify(v))) }, CONFIGS: 'x', DATA: dir(), logs: null })
  return { dados, chamar: async (m, c, userId, body) => {
    const res = { code: 200, body: null, status(x) { this.code = x; return this }, json(b) { this.body = b; return this } }
    await R[m + ' ' + c]({ user: { id: userId }, body: body || {}, query: {} }, res)
    return res
  } }
}

test('salvar grupos de destino recusa grupo que tambem e fonte, e nao grava nada', async () => {
  const base = { u1: CFG({ groups: [], sources: [{ jid: 'fonte@g.us', name: 'Fonte A' }, { jid: 'fonte2@g.us', name: 'Fonte B' }] }) }
  const R = rotasWa(base)
  const ok = await R.chamar('POST', '/whatsapp/groups', 'u1', { groups: [{ jid: 'g1@g.us', name: 'Casa 1' }] })
  assert.equal(ok.code, 200)
  const r = await R.chamar('POST', '/whatsapp/groups', 'u1', { groups: [{ jid: 'g1@g.us', name: 'Casa 1' }, { jid: 'fonte@g.us', name: 'Fonte A' }] })
  assert.equal(r.code, 400)
  assert.match(r.body.error, /"Fonte A" e grupo fonte/)
  assert.match(r.body.error, /nao pode ser fonte e destino/)
  assert.deepEqual(R.dados.u1.groups.map((g) => g.jid), ['g1@g.us'], 'recusado nao altera')
  const dois = await R.chamar('POST', '/whatsapp/groups', 'u1', { groups: [{ jid: 'fonte@g.us', name: 'Fonte A' }, { jid: 'fonte2@g.us', name: 'Fonte B' }] })
  assert.match(dois.body.error, /"Fonte A", "Fonte B" sao grupos fonte/)
})
