/**
 * Mercado Pago — so ativa licenca depois de consultar o pagamento na API oficial.
 * O painel nunca manda "paguei" e o servidor acredita. Sem MP_ACCESS_TOKEN, o checkout responde 503.
 */
// Planos a venda: tier (start/pro) x periodo (mensal/anual) + o Pro de fundador (preco vitalicio).
// `mensal` e `trimestral` ficam so como legado: nao aparecem no catalogo, mas um pagamento
// antigo ainda em andamento continua sendo reconhecido (e conta como Pro).
const PLANS = {
  start_mensal: { tier: 'start', period: 'mensal', days: 30, label: 'Namy Start mensal', env: 'NAMY_PRICE_START_MENSAL', fallback: 19.9 },
  start_anual: { tier: 'start', period: 'anual', days: 365, label: 'Namy Start anual', env: 'NAMY_PRICE_START_ANUAL', fallback: 199 },
  pro_mensal: { tier: 'pro', period: 'mensal', days: 30, label: 'Namy Pro mensal', env: 'NAMY_PRICE_PRO_MENSAL', fallback: 59.9 },
  pro_anual: { tier: 'pro', period: 'anual', days: 365, label: 'Namy Pro anual', env: 'NAMY_PRICE_PRO_ANUAL', fallback: 599 },
  pro_fundador: { tier: 'pro', period: 'mensal', days: 30, label: 'Namy Pro fundador', env: 'NAMY_PRICE_FUNDADOR', fallback: 39.9, fundador: true },
  mensal: { tier: 'pro', period: 'mensal', days: 30, label: 'Namy mensal', env: 'NAMY_PRICE_MENSAL', fallback: 49, legado: true },
  trimestral: { tier: 'pro', period: 'trimestral', days: 90, label: 'Namy trimestral', env: 'NAMY_PRICE_TRIMESTRAL', fallback: 129, legado: true }
}

const fundadorVagas = () => {
  const n = Number(process.env.NAMY_FUNDADORES_VAGAS)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 20
}

// fundadorDisponivel: o servidor diz se ainda ha vaga (ou se o cliente ja e fundador e renova)
function catalog({ fundadorDisponivel = false } = {}) {
  return Object.keys(PLANS)
    .filter((id) => !PLANS[id].legado && (!PLANS[id].fundador || fundadorDisponivel))
    .map((id) => ({
      id,
      label: PLANS[id].label,
      tier: PLANS[id].tier,
      period: PLANS[id].period,
      days: PLANS[id].days,
      price: priceOf(id),
      fundador: !!PLANS[id].fundador,
      currency: 'BRL'
    }))
}

function priceOf(id) {
  const plan = PLANS[id]
  if (!plan) return 0
  const n = Number(process.env[plan.env])
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : plan.fallback
}

function token() {
  return String(process.env.MP_ACCESS_TOKEN || '').trim()
}

function publicBase(req) {
  const fromEnv = String(process.env.PUBLIC_URL || '').trim().replace(/\/$/, '')
  if (fromEnv) return fromEnv
  const host = req.get('host')
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http'
  return proto + '://' + host
}

async function mp(pathname, opts) {
  const access = token()
  if (!access) {
    const err = new Error('Mercado Pago ainda nao configurado no servidor (MP_ACCESS_TOKEN).')
    err.status = 503
    throw err
  }
  const r = await fetch('https://api.mercadopago.com' + pathname, {
    ...opts,
    headers: Object.assign(
      { Authorization: 'Bearer ' + access, 'Content-Type': 'application/json' },
      (opts && opts.headers) || {}
    )
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) {
    const msg = (data && (data.message || data.error)) || ('Mercado Pago ' + r.status)
    const err = new Error(typeof msg === 'string' ? msg : 'Falha no Mercado Pago')
    err.status = 502
    throw err
  }
  return data
}

async function createCheckout({ userId, email, planId, baseUrl, returnPath = '/' }) {
  const plan = PLANS[planId]
  if (!plan || plan.legado) {
    const err = new Error('Plano invalido. Use start_mensal, start_anual, pro_mensal ou pro_anual.')
    err.status = 400
    throw err
  }
  const price = priceOf(planId)
  const pref = await mp('/checkout/preferences', {
    method: 'POST',
    body: JSON.stringify({
      items: [{
        title: plan.label,
        quantity: 1,
        currency_id: 'BRL',
        unit_price: price
      }],
      payer: email ? { email } : undefined,
      external_reference: userId + ':' + planId,
      notification_url: baseUrl + '/webhooks/mercadopago',
      back_urls: {
        success: baseUrl + returnPath + '?pago=ok',
        failure: baseUrl + returnPath + '?pago=falhou',
        pending: baseUrl + returnPath + '?pago=pendente'
      },
      auto_return: 'approved',
      statement_descriptor: 'NAMY'
    })
  })
  return {
    plan: planId,
    price,
    initPoint: pref.init_point,
    sandboxInitPoint: pref.sandbox_init_point || null,
    preferenceId: pref.id
  }
}

function paymentIdFrom(query, body) {
  const q = query || {}
  const b = body || {}
  return String(
    (b.data && b.data.id) ||
    b.id ||
    q['data.id'] ||
    q.id ||
    ''
  ).replace(/\D/g, '')
}

function topicOf(query, body) {
  const q = query || {}
  const b = body || {}
  return String(b.type || b.topic || q.topic || q.type || 'payment')
}

async function inspectPayment(query, body) {
  const topic = topicOf(query, body)
  if (topic && topic !== 'payment') return { ignored: true, reason: 'topic' }
  const id = paymentIdFrom(query, body)
  if (!id) return { ignored: true, reason: 'sem id' }
  const pay = await mp('/v1/payments/' + id, { method: 'GET' })
  const ref = String(pay.external_reference || '')
  const parts = ref.split(':')
  const userId = parts[0] || ''
  const planId = parts[1] || ''
  if (!userId || !PLANS[planId]) return { ignored: true, reason: 'referencia' }
  const expected = priceOf(planId)
  const paid = Number(pay.transaction_amount)
  if (pay.status === 'approved' && Number.isFinite(paid) && paid + 0.01 < expected) {
    return { ignored: true, reason: 'valor', paymentId: String(pay.id), status: pay.status }
  }
  return {
    ignored: false,
    paymentId: String(pay.id),
    status: pay.status,
    userId,
    planId,
    days: PLANS[planId].days,
    tier: PLANS[planId].tier,
    period: PLANS[planId].period,
    fundador: !!PLANS[planId].fundador,
    approved: pay.status === 'approved'
  }
}

module.exports = { catalog, createCheckout, inspectPayment, priceOf, fundadorVagas, PLANS }
