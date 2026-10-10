/**
 * Avisa o painel SaaS se este processo esta online/offline.
 * So age se NAMY_SAAS_URL e NAMY_BOT_TOKEN estiverem no .env.
 */
const axios = require('axios')

function baseUrl() {
  return String(process.env.NAMY_SAAS_URL || '').replace(/\/$/, '')
}

function token() {
  return process.env.NAMY_BOT_TOKEN || ''
}

async function avisar(status) {
  const base = baseUrl()
  const tok = token()
  if (!base || !tok) return { skipped: true }
  try {
    const { data } = await axios.post(base + '/bot/status', { status }, {
      headers: { 'x-bot-token': tok },
      timeout: 8000
    })
    console.log('[SAAS] painel status:', status)
    return data
  } catch (e) {
    console.error('[SAAS] nao avisou o painel:', e.response?.status || e.message)
    return { ok: false }
  }
}

async function licencaOk() {
  const base = baseUrl()
  const tok = token()
  if (!base || !tok) return { skipped: true, ok: true }
  try {
    const { data } = await axios.get(base + '/bot/config', {
      headers: { 'x-bot-token': tok },
      timeout: 8000
    })
    return { ok: true, config: data }
  } catch (e) {
    const status = e.response && e.response.status
    if (status === 403) {
      console.error('[SAAS] licenca vencida ou inativa. !link fica bloqueado.')
      return { ok: false, motivo: 'licenca' }
    }
    console.error('[SAAS] painel fora:', e.message)
    return { ok: true, painelFora: true }
  }
}

module.exports = { avisar, licencaOk }
