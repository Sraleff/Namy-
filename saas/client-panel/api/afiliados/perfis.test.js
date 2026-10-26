const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

process.env.SAAS_MASTER_KEY = 'chave-mestra-so-para-teste-0123456789abcdef'

const links = require('./links')
const ofertas = require('../ofertas')
const perfis = require('./perfis')
const perfisRoutes = require('./perfisRoutes')
const publicador = require('./publicador')
const pool = require('./pool')
const afiliadosRoutes = require('./routes')

links.validarAoVivo = async () => ({ ok: true, motivo: '' })
ofertas.encurtar = async (a, s, url) => 'https://s.shopee.com.br/AFIL' + url.replace(/\D/g, '').slice(-4)
const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'namy-perfis-'))

test('perfis: o recomendado e o Seguro, e o risco sobe do Seguro ao Intenso', () => {
  const l = perfis.lista()
  assert.deepEqual(l.map((p) => p.id), ['seguro', 'equilibrado', 'intenso'])
  assert.equal(l.find((p) => p.recomendado).id, 'seguro')
  const r = (id, n = 3) => perfis.risco(perfis.PERFIS[id].ads, n)
  assert.equal(r('seguro').nivel, 'baixo')
  assert.equal(r('intenso').nivel, 'alto')
  assert.equal(r('intenso', 1).nivel, 'alto', 'o perfil Intenso e alto mesmo com um grupo so')
  assert.equal(r('equilibrado', 1).nivel, 'medio')
  assert.equal(r('seguro', 1).nivel, 'baixo')
  assert.ok(r('seguro').pontos < r('equilibrado').pontos || r('equilibrado').nivel === 'baixo')
  assert.ok(r('equilibrado').pontos < r('intenso').pontos)
  assert.ok(r('seguro').porGrupoPorDia <= 4)
})

test('perfilAtual reconhece cada perfil e chama o resto de personalizado', () => {
  for (const p of perfis.lista()) assert.equal(perfis.perfilAtual(p.ads), p.id)
  assert.equal(perfis.perfilAtual({ ...perfis.PERFIS.seguro.ads, dailyLimit: 9 }), 'personalizado')
  assert.equal(perfis.perfilAtual({ interval: '2h', dailyLimit: 5 }), 'personalizado')
  assert.equal(perfis.perfilAtual(undefined), 'personalizado')
})

test('risco: pausa entre grupos, rajada, intervalo curto, janela longa e entrada lixo', () => {
  const base = { ...perfis.PERFIS.seguro.ads }
  assert.ok(perfis.risco({ ...base, groupPauseMin: 0, groupPauseMax: 0 }, 5).pontos > perfis.risco(base, 5).pontos)
  assert.ok(perfis.risco({ ...base, groupPauseMin: 0, groupPauseMax: 0 }, 5).avisos.some((a) => /rajada/.test(a)))
  assert.equal(perfis.risco({ ...base, groupPauseMin: 0, groupPauseMax: 0 }, 1).avisos.some((a) => /rajada/.test(a)), false, 'um grupo so: nao ha rajada')
  assert.ok(perfis.risco({ ...base, intervalMin: 5, intervalMax: 10 }, 1).avisos.some((a) => /muito curto/.test(a)))
  assert.ok(perfis.risco({ ...base, window: { from: '00:00', to: '23:59' } }, 1).avisos.some((a) => /Janela de/.test(a)))
  assert.ok(perfis.risco({ ...base, window: { from: '22:00', to: '06:00' } }, 1).pontos <= perfis.risco(base, 1).pontos + 0, 'janela que cruza a meia-noite tem 8 h')
  // intervalo fixo vem do campo interval
  assert.equal(perfis.risco({ intervalMode: 'fixo', interval: '6h', dailyLimit: 3, window: { from: '09:00', to: '21:00' }, perRunMin: 1, perRunMax: 1 }, 1).nivel, 'baixo')
  // lixo nunca lanca
  for (const ruim of [{}, { dailyLimit: 'x', intervalMin: -5, perRunMax: 999, window: 5, groupPauseMax: 'zzz' }, null, 'texto']) {
    const r = perfis.risco(ruim, 2)
    assert.ok(['baixo', 'medio', 'alto'].includes(r.nivel), JSON.stringify(ruim))
  }
})

// ---------------------------------------------------------------- rotas

function rotas(cfgs, opcoes) {
  const R = {}
  const app = { get: (p, ...h) => { R['GET ' + p] = h[h.length - 1] }, post: (p, ...h) => { R['POST ' + p] = h[h.length - 1] } }
  perfisRoutes.mount(app, { auth: () => {}, readJson: () => cfgs, CONFIGS: 'x' }, opcoes)
  return async (m, c, userId, body) => {
    const res = { code: 200, body: null, status(x) { this.code = x; return this }, json(b) { this.body = b; return this } }
    await R[m + ' ' + c]({ user: { id: userId }, body: body || {} }, res)
    return res
  }
}

test('rotas: perfis da conta, risco do rascunho, validacao e limite; nada e gravado', async () => {
  const cfg = { ads: perfis.PERFIS.seguro.ads, groups: [{ jid: 'a@g.us' }, { jid: 'b@g.us' }, { jid: 'f@g.us' }], sources: [{ jid: 'f@g.us' }] }
  const antes = JSON.stringify(cfg)
  const chamar = rotas({ u1: cfg }, { calculosPorMin: 4 })
  assert.equal((await chamar('GET', '/automacoes/perfis', 'nao-existe')).code, 404)
  const p = await chamar('GET', '/automacoes/perfis', 'u1')
  assert.equal(p.body.atual, 'seguro')
  assert.equal(p.body.risco.nGrupos, 2, 'grupo fonte nao conta como destino')
  assert.equal(p.body.perfis.length, 3)
  assert.equal((await chamar('POST', '/automacoes/risco', 'u1', {})).code, 400)
  assert.equal((await chamar('POST', '/automacoes/risco', 'u1', { ads: [1] })).code, 400)
  const r = await chamar('POST', '/automacoes/risco', 'u1', { ads: perfis.PERFIS.intenso.ads })
  assert.equal(r.body.risco.nivel, 'alto')
  assert.equal(r.body.atual, 'intenso')
  assert.equal((await chamar('POST', '/automacoes/risco', 'u1', { ads: perfis.PERFIS.intenso.ads })).code, 200)
  assert.equal((await chamar('POST', '/automacoes/risco', 'u1', { ads: {} })).code, 429)
  assert.equal(JSON.stringify(cfg), antes, 'a conta nao foi alterada')
})

// ---------------------------------------------------------------- pausa entre grupos (publicador e PUT /config)

test('pausaEntreGrupos: ausente, invalida ou zero = sem pausa (conta antiga igual a antes)', () => {
  const p = publicador.pausaEntreGrupos
  assert.equal(p(undefined), 0)
  assert.equal(p({}), 0)
  assert.equal(p({ groupPauseMin: 0, groupPauseMax: 0 }), 0)
  assert.equal(p({ groupPauseMin: 5, groupPauseMax: 2 }), 0, 'faixa invertida')
  assert.equal(p({ groupPauseMin: 5, groupPauseMax: 99 }), 0, 'acima de 60')
  assert.equal(p({ groupPauseMin: 'x', groupPauseMax: 'y' }), 0)
  assert.equal(p({ groupPauseMin: 4, groupPauseMax: 8 }, () => 0), 4000)
  assert.equal(p({ groupPauseMin: 4, groupPauseMax: 8 }, () => 0.5), 6000)
  assert.equal(p({ groupPauseMin: 4, groupPauseMax: 8 }, () => 1), 8000)
})

async function publicarComPausa(ads, nGrupos) {
  const d = dir()
  const groups = Array.from({ length: nGrupos }, (_, i) => ({ jid: 'g' + i + '@g.us', name: 'Casa ' + i, niche: 'casa' }))
  const cfg = { license: { active: true, expiresAt: new Date(Date.now() + 864e5).toISOString() }, shopee: { appId: 'A', secret: 'S' }, groups, sources: [], ads: Object.assign({ source: 'pool' }, ads) }
  await pool.adicionar(d, 'u1', cfg, { texto: 'Panela inox\nhttps://shopee.com.br/panela-i.9.4001', origem: 'manual' })
  const enviados = []
  const esperas = []
  const sessions = { sendOffer: async (u, jid) => { enviados.push({ jid, quando: esperas.length }) } }
  const out = await publicador.publicar({ userId: 'u1', cfg, dataDir: d, sessions, dormir: async (ms) => { esperas.push(ms) }, random: () => 0.5 })
  return { out, enviados, esperas }
}

test('publicador: espera entre os grupos (n-1 pausas) e envia na ordem; sem configuracao, nao espera', async () => {
  const com = await publicarComPausa({ groupPauseMin: 4, groupPauseMax: 8 }, 3)
  assert.equal(com.out.enviados, 3)
  assert.deepEqual(com.esperas, [6000, 6000])
  assert.deepEqual(com.enviados.map((e) => e.quando), [0, 1, 2], 'cada envio so acontece depois da pausa anterior')
  const sem = await publicarComPausa({}, 3)
  assert.equal(sem.out.enviados, 3)
  assert.deepEqual(sem.esperas, [], 'conta antiga: sem pausa')
  const um = await publicarComPausa({ groupPauseMin: 4, groupPauseMax: 8 }, 1)
  assert.deepEqual(um.esperas, [], 'um grupo so: nada a esperar')
})

test('PUT /config valida a pausa entre grupos (0 a 60, minimo <= maximo, os dois juntos)', () => {
  const ok = (ads, cur) => { const c = cur || { ads: {} }; afiliadosRoutes.aplicarConfig(c, { ads }); return c.ads }
  assert.deepEqual([ok({ groupPauseMin: 4, groupPauseMax: 8 }).groupPauseMin, ok({ groupPauseMin: 4, groupPauseMax: 8 }).groupPauseMax], [4, 8])
  assert.equal(ok({ groupPauseMin: 0, groupPauseMax: 0 }).groupPauseMax, 0)
  assert.throws(() => ok({ groupPauseMin: 9, groupPauseMax: 3 }), /minimo nao pode ser maior/)
  assert.throws(() => ok({ groupPauseMin: 0, groupPauseMax: 61 }), /0 a 60/)
  assert.throws(() => ok({ groupPauseMin: -1, groupPauseMax: 5 }), /0 a 60/)
  assert.throws(() => ok({ groupPauseMin: 1.5, groupPauseMax: 5 }), /inteiros/)
  assert.throws(() => ok({ groupPauseMin: 3 }), /minimo e o maximo/)
  assert.equal(ok({ groupPauseMax: 20 }, { ads: { groupPauseMin: 5 } }).groupPauseMin, 5, 'completa com o valor salvo')
  assert.equal(ok({ dailyLimit: 5 }).groupPauseMin, undefined, 'sem o campo, nada muda')
})
