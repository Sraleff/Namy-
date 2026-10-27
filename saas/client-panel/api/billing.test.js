const test = require('node:test')
const assert = require('node:assert/strict')

process.env.MP_ACCESS_TOKEN = 'token-so-para-teste'
const billing = require('./billing')

const ENV = ['NAMY_PRICE_START_MENSAL', 'NAMY_PRICE_PRO_MENSAL', 'NAMY_PRICE_FUNDADOR', 'NAMY_FUNDADORES_VAGAS']
test.beforeEach(() => { for (const k of ENV) delete process.env[k] })

test('catalogo: Start e Pro, mensal e anual; sem trimestral e sem legado', () => {
  const ids = billing.catalog().map((p) => p.id)
  assert.deepEqual(ids, ['start_mensal', 'start_anual', 'pro_mensal', 'pro_anual'])
  assert.equal(ids.includes('trimestral'), false)
  assert.equal(ids.includes('mensal'), false)
})

test('precos padrao e anual = 2 meses gratis', () => {
  const por = Object.fromEntries(billing.catalog().map((p) => [p.id, p.price]))
  assert.deepEqual(por, { start_mensal: 19.9, start_anual: 199, pro_mensal: 59.9, pro_anual: 599 })
  assert.ok(Math.abs(por.start_mensal * 10 - por.start_anual) < 1)
  assert.ok(Math.abs(por.pro_mensal * 10 - por.pro_anual) < 1)
})

test('precos vem do .env e valor invalido volta ao padrao', () => {
  process.env.NAMY_PRICE_PRO_MENSAL = '64.5'
  assert.equal(billing.priceOf('pro_mensal'), 64.5)
  process.env.NAMY_PRICE_PRO_MENSAL = 'abc'
  assert.equal(billing.priceOf('pro_mensal'), 59.9)
  process.env.NAMY_PRICE_PRO_MENSAL = '-3'
  assert.equal(billing.priceOf('pro_mensal'), 59.9)
})

test('fundador so aparece com vaga e custa o preco de fundador', () => {
  assert.equal(billing.catalog().some((p) => p.fundador), false)
  const f = billing.catalog({ fundadorDisponivel: true }).find((p) => p.fundador)
  assert.equal(f.id, 'pro_fundador')
  assert.equal(f.price, 39.9)
  assert.equal(f.tier, 'pro')
})

test('vagas de fundador: padrao 20, configuravel', () => {
  assert.equal(billing.fundadorVagas(), 20)
  process.env.NAMY_FUNDADORES_VAGAS = '5'
  assert.equal(billing.fundadorVagas(), 5)
  process.env.NAMY_FUNDADORES_VAGAS = 'x'
  assert.equal(billing.fundadorVagas(), 20)
})

test('checkout recusa plano legado e inexistente', async () => {
  for (const planId of ['trimestral', 'mensal', 'ouro', '']) {
    await assert.rejects(() => billing.createCheckout({ userId: 'u1', planId, baseUrl: 'http://x' }), (e) => e.status === 400)
  }
})

async function comPagamento(pay, fn) {
  const real = global.fetch
  global.fetch = async () => ({ ok: true, status: 200, json: async () => pay })
  try { return await fn() } finally { global.fetch = real }
}

test('webhook: pagamento aprovado devolve tier, periodo e dias do plano', async () => {
  const r = await comPagamento({ id: 11, status: 'approved', transaction_amount: 599, external_reference: 'u1:pro_anual' },
    () => billing.inspectPayment({}, { type: 'payment', data: { id: '11' } }))
  assert.equal(r.approved, true)
  assert.equal(r.tier, 'pro')
  assert.equal(r.period, 'anual')
  assert.equal(r.days, 365)
  assert.equal(r.fundador, false)
})

test('webhook: valor menor que o preco do plano e ignorado', async () => {
  const r = await comPagamento({ id: 12, status: 'approved', transaction_amount: 19.9, external_reference: 'u1:pro_mensal' },
    () => billing.inspectPayment({}, { type: 'payment', data: { id: '12' } }))
  assert.equal(r.ignored, true)
  assert.equal(r.reason, 'valor')
})

test('webhook: pagamento fundador marca fundador; trimestral antigo ainda e reconhecido como pro', async () => {
  const f = await comPagamento({ id: 13, status: 'approved', transaction_amount: 39.9, external_reference: 'u1:pro_fundador' },
    () => billing.inspectPayment({}, { type: 'payment', data: { id: '13' } }))
  assert.equal(f.fundador, true)
  const t = await comPagamento({ id: 14, status: 'approved', transaction_amount: 129, external_reference: 'u1:trimestral' },
    () => billing.inspectPayment({}, { type: 'payment', data: { id: '14' } }))
  assert.equal(t.ignored, false)
  assert.equal(t.tier, 'pro')
  assert.equal(t.days, 90)
})
