const test = require('node:test')
const assert = require('node:assert/strict')
const limites = require('./limites')

const conta = (license, extra = {}) => Object.assign({ license }, extra)

test('tierDe: trial, start, pro e licencas antigas (mensal/trimestral = pro)', () => {
  assert.equal(limites.tierDe(conta({ plan: 'trial' })), 'trial')
  assert.equal(limites.tierDe(conta({ plan: 'start_mensal', tier: 'start' })), 'start')
  assert.equal(limites.tierDe(conta({ plan: 'pro_anual', tier: 'pro' })), 'pro')
  assert.equal(limites.tierDe(conta({ plan: 'mensal' })), 'pro')
  assert.equal(limites.tierDe(conta({ plan: 'trimestral' })), 'pro')
  assert.equal(limites.tierDe({}), 'pro')
})

test('recursos: start nao tem os do pro; trial e pro tem', () => {
  for (const r of limites.RECURSOS_PRO) {
    assert.equal(limites.podeRecurso(conta({ tier: 'start' }), r), false)
    assert.equal(limites.podeRecurso(conta({ tier: 'pro' }), r), true)
    assert.equal(limites.podeRecurso(conta({ plan: 'trial' }), r), true)
  }
})

test('limite de envios por dia: so o teste tem; start e pro seguem o que o cliente configurou', () => {
  assert.equal(limites.limiteEnviosDoPlano(conta({ plan: 'trial' })), 20)
  assert.equal(limites.limiteEnviosDoPlano(conta({ tier: 'start' })), null)
  assert.equal(limites.limiteEnviosDoPlano(conta({ tier: 'pro' })), null)
})

test('checarQuantidade: start 2 destinos e 3 fontes; passou, 402 com upgrade', () => {
  const start = conta({ tier: 'start' })
  limites.checarQuantidade(start, 'destinos', 2)
  limites.checarQuantidade(start, 'fontes', 3)
  assert.throws(() => limites.checarQuantidade(start, 'destinos', 3), (e) => e.status === 402 && e.upgrade && /2 grupos de destino/.test(e.message))
  assert.throws(() => limites.checarQuantidade(start, 'fontes', 4), (e) => e.status === 402)
  const pro = conta({ tier: 'pro' })
  limites.checarQuantidade(pro, 'destinos', 30)
  assert.throws(() => limites.checarQuantidade(pro, 'destinos', 31), (e) => e.status === 402)
})

test('exigir: barra start com 402 e deixa pro e trial passarem', () => {
  const contas = { a: conta({ tier: 'start' }), b: conta({ tier: 'pro' }), c: conta({ plan: 'trial' }) }
  const mw = limites.exigir('cupons', { readJson: () => contas, CONFIGS: 'x' })
  for (const [id, passa] of [['a', false], ['b', true], ['c', true]]) {
    let status = null, corpo = null, seguiu = false
    mw({ user: { id } }, { status(s) { status = s; return this }, json(b) { corpo = b } }, () => { seguiu = true })
    assert.equal(seguiu, passa, id)
    if (!passa) { assert.equal(status, 402); assert.equal(corpo.upgrade, true); assert.match(corpo.error, /plano Pro/) }
  }
})

test('iniciarTrial: so inicia uma vez, no trial pendente, e conta 3 dias', () => {
  const agora = Date.parse('2026-11-01T12:00:00Z')
  const cfg = conta({ plan: 'trial', trialPendente: true, expiresAt: '2026-11-08T12:00:00Z' })
  assert.equal(limites.iniciarTrial(cfg, agora, 3), true)
  assert.equal(cfg.license.trialPendente, false)
  assert.equal(cfg.license.expiresAt, '2026-11-04T12:00:00.000Z')
  assert.equal(limites.iniciarTrial(cfg, agora + 1000, 3), false, 'segunda conexao nao reinicia')
  assert.equal(limites.iniciarTrial(conta({ plan: 'pro_mensal', trialPendente: true }), agora), false)
  assert.equal(limites.iniciarTrial({}, agora), false)
})

test('uso: mostra o consumo e os recursos', () => {
  const u = limites.uso(conta({ tier: 'start', fundador: false }, { groups: [{}, {}], sources: [{}] }))
  assert.deepEqual(u.destinos, { usado: 2, max: 2 })
  assert.deepEqual(u.fontes, { usado: 1, max: 3 })
  assert.equal(u.recursos.cupons, false)
  assert.equal(u.enviosPorDia, null)
})
