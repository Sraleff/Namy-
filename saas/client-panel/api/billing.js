/**
 * Mercado Pago — so ativa licenca depois de consultar o pagamento na API oficial.
 * O painel nunca manda "paguei" e o servidor acredita. Sem MP_ACCESS_TOKEN, o checkout responde 503.
 */
const PLANS = {
  mensal: { days: 30, label: 'Namy mensal', env: 'NAMY_PRICE_MENSAL', fallback: 49 },
  trimestral: { days: 90, label: 'Namy trimestral', env: 'NAMY_PRICE_TRIMESTRAL', fallback: 129 }
}

function catalog() {
  return Object.keys(PLANS).map((id) => ({
    id,
    label: PLANS[id].label,
    days: PLANS[id].days,
    price: priceOf(id),
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

async function createCheckout({ userId, email, planId, baseUrl }) {
  const plan = PLANS[planId]
  if (!plan) {
    const err = new Error('Plano invalido. Use mensal ou trimestral.')
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
        success: baseUrl + '/?pago=ok',
        failure: baseUrl + '/?pago=falhou',
        pending: baseUrl + '/?pago=pendente'
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
    approved: pay.status === 'approved'
  }
}

module.exports = { catalog, createCheckout, inspectPayment, PLANS }
