const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

process.env.SAAS_MASTER_KEY = 'chave-mestra-so-para-teste-0123456789abcdef'

const links = require('./links')
const pool = require('./pool')
const perfis = require('./perfis')
const onboarding = require('./onboarding')

links.validarAoVivo = async () => ({ ok: true, motivo: '' })
const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'namy-onb-'))
const on = { publicState: () => ({ connected: true }) }
const off = { publicState: () => ({ connected: false }) }
const ctx = (d, cfg, sessions) => ({ userId: 'u1', cfg, dataDir: d, sessions: sessions || on })
const feito = (r, id) => r.etapas.find((e) => e.id === id).feito

const CFG = (extra) => Object.assign({
  shopee: { appId: 'A', secret: 'SEGREDO-NAO-VAZAR' },
  groups: [{ jid: 'g1@g.us', name: 'Casa' }], sources: [],
  ads: { enabled: false, source: 'api' }
}, extra || {})

test('conta nova: so o que ja existe aparece como feito, e nada vaza', () => {
  const r = onboarding.etapas(ctx(dir(), { ads: {}, groups: [], sources: [] }, off))
  assert.equal(r.feitas, 0)
  assert.equal(r.total, 5)
  assert.equal(r.completo, false)
  assert.deepEqual(r.etapas.map((e) => e.id), ['whatsapp', 'ofertas', 'grupos', 'perfil', 'automacao'])
  assert.ok(r.etapas.every((e) => e.pagina && e.detalhe))
  const cheio = onboarding.etapas(ctx(dir(), CFG(), on))
  assert.equal(JSON.stringify(cheio).includes('SEGREDO-NAO-VAZAR'), false)
})

test('cada etapa muda de estado com a configuracao real', async () => {
  const d = dir()
  assert.equal(feito(onboarding.etapas(ctx(d, CFG(), off)), 'whatsapp'), false)
  assert.equal(feito(onboarding.etapas(ctx(d, CFG(), on)), 'whatsapp'), true)
  assert.equal(feito(onboarding.etapas(ctx(d, CFG({ shopee: {} }), on)), 'ofertas'), false)
  assert.equal(feito(onboarding.etapas(ctx(d, CFG(), on)), 'ofertas'), true)
  // grupo fonte nao conta como destino
  assert.equal(feito(onboarding.etapas(ctx(d, CFG({ sources: [{ jid: 'g1@g.us' }] }), on)), 'grupos'), false)
  assert.equal(feito(onboarding.etapas(ctx(d, CFG({ groups: [] }), on)), 'grupos'), false)
  assert.equal(feito(onboarding.etapas(ctx(d, CFG(), on)), 'grupos'), true)
  // perfil: preset, ou personalizado com pausa entre grupos; o padrao antigo nao conta
  assert.equal(feito(onboarding.etapas(ctx(d, CFG(), on)), 'perfil'), false)
  assert.equal(feito(onboarding.etapas(ctx(d, CFG({ ads: { ...perfis.PERFIS.seguro.ads, enabled: false, source: 'api' } }), on)), 'perfil'), true)
  assert.equal(feito(onboarding.etapas(ctx(d, CFG({ ads: { dailyLimit: 3, groupPauseMin: 2, groupPauseMax: 5, source: 'api' } }), on)), 'perfil'), true)
  assert.equal(feito(onboarding.etapas(ctx(d, CFG({ ads: { enabled: true, source: 'api' } }), on)), 'automacao'), true)
})

test('origem pelo banco de ofertas: a etapa pede ofertas e some quando ha uma elegivel', async () => {
  const d = dir()
  const cfg = CFG({ ads: { enabled: false, source: 'pool' }, shopee: {} })
  let r = onboarding.etapas(ctx(d, cfg, on))
  assert.equal(feito(r, 'ofertas'), false)
  assert.match(r.etapas.find((e) => e.id === 'ofertas').titulo, /ofertas no banco/)
  await pool.adicionar(d, 'u1', cfg, { texto: 'Panela inox\nhttps://shopee.com.br/panela-i.9.5001', origem: 'manual' })
  r = onboarding.etapas(ctx(d, cfg, on))
  assert.equal(feito(r, 'ofertas'), true)
})

test('tudo pronto = completo; GET /onboarding exige conta e devolve so estado', () => {
  const cfg = CFG({ ads: { ...perfis.PERFIS.seguro.ads, enabled: true, source: 'api' } })
  const r = onboarding.etapas(ctx(dir(), cfg, on))
  assert.equal(r.completo, true)
  assert.equal(r.feitas, 5)
  let h
  onboarding.mount({ get: (p, ...f) => { if (p === '/onboarding') h = f[f.length - 1] } }, { auth: () => {}, readJson: () => ({ u1: cfg }), CONFIGS: 'x', DATA: dir(), sessions: on })
  const chamar = (id) => { const res = { code: 200, body: null, status(c) { this.code = c; return this }, json(b) { this.body = b; return this } }; h({ user: { id } }, res); return res }
  assert.equal(chamar('nao-existe').code, 404)
  const ok = chamar('u1')
  assert.equal(ok.code, 200)
  assert.equal(ok.body.completo, true)
  assert.equal(JSON.stringify(ok.body).includes('SEGREDO'), false)
})
