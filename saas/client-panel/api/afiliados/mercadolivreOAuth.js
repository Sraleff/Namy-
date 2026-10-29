/**
 * Mercado Livre — capacidade 1: OAuth 2.0 oficial (Authorization Code + PKCE).
 * So cuida de token: conectar, trocar code, renovar e chamar a API com Bearer.
 * Gerar link de afiliado e outra capacidade (conectores/mercadolivre.js) e
 * funciona sem OAuth; com OAuth o link tambem e conferido na API.
 *
 * App da plataforma no .env: ML_CLIENT_ID, ML_CLIENT_SECRET, ML_REDIRECT_URI
 * (padrao PUBLIC_URL + /mercadolivre/callback). Token cifrado em data/marketplaces.
 */
const crypto = require('crypto')
const cofre = require('./cofre')

const AUTH_URL = 'https://auth.mercadolivre.com.br/authorization'
const TOKEN_URL = 'https://api.mercadolibre.com/oauth/token'
const API = 'https://api.mercadolibre.com'
const STATE_TTL = 10 * 60 * 1000

const estados = new Map()
const renovando = new Map()
const esperaAte = new Map()

function erroML(msg, status, code) {
  const e = new Error(msg)
  e.status = status || 400
  e.code = code || 'ML'
  return e
}

function app() {
  const clientId = String(process.env.ML_CLIENT_ID || '').trim()
  const clientSecret = String(process.env.ML_CLIENT_SECRET || '').trim()
  const base = String(process.env.PUBLIC_URL || '').trim().replace(/\/$/, '')
  const redirectUri = String(process.env.ML_REDIRECT_URI || (base ? base + '/mercadolivre/callback' : '')).trim()
  return { clientId, clientSecret, redirectUri, ok: !!(clientId && clientSecret && redirectUri) }
}

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function limparEstados() {
  const agora = Date.now()
  for (const [k, v] of estados) if (v.exp < agora) estados.delete(k)
}

// URL para o navegador do cliente. state e de uso unico e amarrado ao userId do JWT.
function urlDeConexao(userId) {
  const cfg = app()
  if (!cfg.ok) throw erroML('Mercado Livre não configurado no servidor (ML_CLIENT_ID, ML_CLIENT_SECRET, PUBLIC_URL).', 503, 'ML_CONFIG')
  if (!cofre.disponivel()) throw erroML('Defina SAAS_MASTER_KEY no .env do client-panel antes de conectar.', 503, 'ML_CONFIG')
  limparEstados()
  if (estados.size > 5000) throw erroML('Muitas conexões pendentes. Tente em alguns minutos.', 429, 'ML_RATE')
  const state = base64url(crypto.randomBytes(32))
  const verifier = base64url(crypto.randomBytes(48))
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest())
  estados.set(state, { userId, verifier, exp: Date.now() + STATE_TTL })
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  })
  return AUTH_URL + '?' + q.toString()
}

function consumirEstado(state) {
  limparEstados()
  const s = estados.get(String(state || ''))
  if (!s) return null
  estados.delete(String(state))
  return s.exp >= Date.now() ? s : null
}

async function postToken(params) {
  let r
  try {
    r = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString()
    })
  } catch {
    throw erroML('Não consegui falar com o Mercado Livre.', 502, 'ML_REDE')
  }
  const data = await r.json().catch(() => ({}))
  if (r.status === 429) throw erroML('Mercado Livre pediu para esperar (429).', 429, 'ML_RATE')
  if (!r.ok || !data.access_token) {
    const invalido = data.error === 'invalid_grant' || r.status === 400 || r.status === 401
    throw erroML('Mercado Livre recusou o token' + (data.error ? ' (' + data.error + ')' : '') + '.', invalido ? 401 : 502, invalido ? 'ML_RECONECTAR' : 'ML')
  }
  return data
}

function guardar(data, anterior) {
  return {
    access_token: data.access_token,
    // refresh_token do ML e de uso unico: sempre troca pelo novo
    refresh_token: data.refresh_token || (anterior && anterior.refresh_token) || '',
    expires_at: Date.now() + (Number(data.expires_in) || 21600) * 1000,
    user_id: String(data.user_id || (anterior && anterior.user_id) || ''),
    nickname: (anterior && anterior.nickname) || '',
    scope: String(data.scope || ''),
    connectedAt: (anterior && anterior.connectedAt) || new Date().toISOString()
  }
}

// Callback: valida state, troca code (com PKCE) e grava cifrado
async function concluir(dataDir, state, code) {
  const s = consumirEstado(state)
  if (!s) throw erroML('Conexão expirada ou inválida. Comece de novo pelo painel.', 400, 'ML_STATE')
  if (!code) throw erroML('Mercado Livre não devolveu o código.', 400, 'ML')
  const cfg = app()
  const data = await postToken({
    grant_type: 'authorization_code',
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code: String(code),
    redirect_uri: cfg.redirectUri,
    code_verifier: s.verifier
  })
  const tok = guardar(data)
  try {
    const me = await fetchJson(API + '/users/me', tok.access_token)
    if (me.ok) tok.nickname = String(me.data.nickname || '').slice(0, 60)
  } catch {}
  await cofre.gravar(dataDir, s.userId, 'mercadolivre', tok)
  return { userId: s.userId, nickname: tok.nickname }
}

async function renovar(dataDir, userId) {
  if (renovando.has(userId)) return renovando.get(userId)
  const job = (async () => {
    const atual = cofre.ler(dataDir, userId, 'mercadolivre')
    if (!atual.refresh_token) throw erroML('Conecte o Mercado Livre de novo.', 401, 'ML_RECONECTAR')
    const cfg = app()
    try {
      const data = await postToken({
        grant_type: 'refresh_token',
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        refresh_token: atual.refresh_token
      })
      const tok = guardar(data, atual)
      await cofre.gravar(dataDir, userId, 'mercadolivre', tok)
      return tok
    } catch (e) {
      if (e.code === 'ML_RECONECTAR') await cofre.apagar(dataDir, userId, 'mercadolivre')
      throw e
    }
  })()
  renovando.set(userId, job)
  try {
    return await job
  } finally {
    renovando.delete(userId)
  }
}

async function fetchJson(url, token) {
  let r
  try {
    r = await fetch(url, { headers: { Accept: 'application/json', Authorization: 'Bearer ' + token } })
  } catch {
    throw erroML('Não consegui falar com o Mercado Livre.', 502, 'ML_REDE')
  }
  const data = await r.json().catch(() => ({}))
  return { ok: r.ok, status: r.status, data, retryAfter: Number(r.headers.get('retry-after')) || 0 }
}

/**
 * GET na API com o token do cliente.
 * 401 -> renova uma vez e repete. 403 -> sem permissao (nao repete).
 * 429 -> pausa as chamadas desse cliente pelo Retry-After (min 30s).
 */
async function get(dataDir, userId, caminho) {
  const pausa = esperaAte.get(userId) || 0
  if (pausa > Date.now()) throw erroML('Mercado Livre limitou as chamadas. Tente em ' + Math.ceil((pausa - Date.now()) / 1000) + 's.', 429, 'ML_RATE')
  let tok = cofre.ler(dataDir, userId, 'mercadolivre')
  if (!tok.access_token) throw erroML('Mercado Livre não conectado.', 401, 'ML_DESCONECTADO')
  if (!tok.expires_at || tok.expires_at - 60000 < Date.now()) tok = await renovar(dataDir, userId)
  let out = await fetchJson(API + caminho, tok.access_token)
  if (out.status === 401) {
    tok = await renovar(dataDir, userId)
    out = await fetchJson(API + caminho, tok.access_token)
  }
  if (out.status === 429) {
    esperaAte.set(userId, Date.now() + Math.max(30, out.retryAfter) * 1000)
    throw erroML('Mercado Livre limitou as chamadas (429).', 429, 'ML_RATE')
  }
  if (out.status === 401) throw erroML('Token do Mercado Livre recusado. Conecte de novo.', 401, 'ML_RECONECTAR')
  if (out.status === 403) throw erroML('Mercado Livre negou acesso (403). Confira as permissões do app.', 403, 'ML_PROIBIDO')
  if (out.status === 404) throw erroML('Não encontrado no Mercado Livre.', 404, 'ML_404')
  if (!out.ok) throw erroML('Mercado Livre respondeu ' + out.status + '.', 502, 'ML')
  return out.data
}

function status(dataDir, userId) {
  const cfg = app()
  const tok = cofre.ler(dataDir, userId, 'mercadolivre')
  return {
    servidorPronto: cfg.ok && cofre.disponivel(),
    conectado: !!tok.access_token,
    nickname: tok.nickname || '',
    mlUserId: tok.user_id || '',
    expiraEm: tok.expires_at ? new Date(tok.expires_at).toISOString() : null,
    conectadoEm: tok.connectedAt || null
  }
}

function desconectar(dataDir, userId) {
  return cofre.apagar(dataDir, userId, 'mercadolivre')
}

module.exports = { app, urlDeConexao, concluir, renovar, get, status, desconectar, consumirEstado }
