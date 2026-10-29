/**
 * Amazon Creators API (D3): substituta oficial da PA-API 5 (descontinuada em 2026).
 * Docs: https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction
 *
 *   token:  POST https://api.amazon.com/auth/o2/token  (credencial 3.1 / América do Norte, vale para o BR)
 *           { grant_type: "client_credentials", client_id, client_secret, scope: "creatorsapi::default" }
 *           -> { access_token, expires_in: 3600 }
 *   itens:  POST https://creatorsapi.amazon/catalog/v1/getItems
 *           headers Authorization: Bearer <token>, x-marketplace: www.amazon.com.br
 *           { itemIds (até 10), itemIdType: "ASIN", marketplace, partnerTag, resources }
 *
 * Acesso exige conta de Associado do mercado e 10 vendas qualificadas nos últimos 30 dias.
 * Sem credencial ou sem acesso, nada trava: o link continua sendo montado com a tag do cliente.
 * Credenciais cifradas no cofre (chave "amazon"); o segredo nunca vai para log nem resposta.
 */
const cofre = require('./cofre')

const TOKEN_URL = 'https://api.amazon.com/auth/o2/token'
const API = 'https://creatorsapi.amazon/catalog/v1'
const MARKETPLACE = 'www.amazon.com.br'
const ASIN_RE = /^[A-Z0-9]{10}$/
const CLIENT_ID_RE = /^[A-Za-z0-9._:-]{8,200}$/
const SEGREDO_RE = /^[A-Za-z0-9._:/+=-]{8,300}$/
const CACHE_ITEM_MS = 30 * 60 * 1000
const RECURSOS = ['itemInfo.title', 'images.primary.large', 'offersV2.listings.price', 'offersV2.listings.availability']
const SEM_ESTOQUE = new Set(['OUT_OF_STOCK', 'UNAVAILABLE'])

const http = { fetch: (...a) => fetch(...a) }
const tokens = new Map() // userId -> { token, ate }
const itens = new Map() // "userId|ASIN" -> { ate, item }
const erro = (msg, status = 400, extra = {}) => Object.assign(new Error(msg), { status }, extra)

const credenciais = (dataDir, userId) => {
  const c = cofre.ler(dataDir, userId, 'amazon') || {}
  return c.clientId && c.clientSecret ? { clientId: String(c.clientId), clientSecret: String(c.clientSecret) } : null
}
const configurada = (dataDir, userId) => !!(dataDir && userId && credenciais(dataDir, userId))

function semSegredo(texto, c) {
  let t = String(texto == null ? '' : texto)
  if (c) for (const v of [c.clientSecret, c.clientId]) if (v) t = t.split(v).join('***')
  return t
}

async function pedir(url, init, c) {
  let r
  try {
    r = await http.fetch(url, Object.assign({ signal: AbortSignal.timeout(15000) }, init))
  } catch (e) {
    throw erro('Não consegui falar com a Amazon agora (' + semSegredo(e && (e.name === 'TimeoutError' ? 'tempo esgotado' : e.message), c).slice(0, 80) + ').', 502, { temporario: true })
  }
  const dados = await r.json().catch(() => ({}))
  return { status: r.status, dados }
}

function motivoDe(dados) {
  const e = (dados && (dados.errors || dados.Errors) || [])[0] || {}
  return String(e.message || e.Message || dados.error_description || dados.message || dados.error || '').slice(0, 160)
}

async function token(c, userId) {
  const hit = userId && tokens.get(userId)
  if (hit && hit.ate > Date.now()) return hit.token
  const { status, dados } = await pedir(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: c.clientId, client_secret: c.clientSecret, scope: 'creatorsapi::default' })
  }, c)
  if (status !== 200 || !dados.access_token) {
    throw erro('A Amazon recusou as credenciais da Creators API (' + semSegredo(motivoDe(dados) || 'HTTP ' + status, c) + '). Gere outras na Central de Associados.', 400, { credencial: true })
  }
  const ttl = Math.max(60, Number(dados.expires_in) || 3600) - 60
  if (userId) tokens.set(userId, { token: dados.access_token, ate: Date.now() + ttl * 1000 })
  return dados.access_token
}

/** Item da resposta -> forma do painel. Aceita itemsResult (doc) e itemResults (variação vista em exemplo). */
function normalizar(it) {
  if (!it || !ASIN_RE.test(String(it.asin || ''))) return null
  const listagens = (it.offersV2 && it.offersV2.listings) || []
  const l = listagens.find((x) => x && x.isBuyBoxWinner) || listagens[0] || null
  const preco = l && l.price && l.price.money ? Number(l.price.money.amount) : NaN
  const de = l && l.price && l.price.savingBasis && l.price.savingBasis.money ? Number(l.price.savingBasis.money.amount) : NaN
  const disponibilidade = l ? String((l.availability && l.availability.type) || 'UNKNOWN') : 'OUT_OF_STOCK'
  const img = it.images && it.images.primary && (it.images.primary.large || it.images.primary.medium || it.images.primary.small)
  return {
    asin: it.asin,
    titulo: String((it.itemInfo && it.itemInfo.title && it.itemInfo.title.displayValue) || '').slice(0, 200),
    imagem: img && /^https:\/\//.test(String(img.url || '')) ? String(img.url) : '',
    preco: Number.isFinite(preco) && preco > 0 ? preco : null,
    precoTexto: l && l.price && l.price.money ? String(l.price.money.displayAmount || '') : '',
    de: Number.isFinite(de) && de > 0 ? de : null,
    desconto: l && l.price && l.price.savings ? Number(l.price.savings.percentage) || null : null,
    disponibilidade,
    semEstoque: SEM_ESTOQUE.has(disponibilidade)
  }
}

/** GetItems para até 10 ASINs. Devolve Map(ASIN -> item | null quando a Amazon disse que não dá). */
async function buscarItens(dataDir, userId, partnerTag, asins) {
  const c = credenciais(dataDir, userId)
  if (!c) throw erro('Creators API não configurada.', 400)
  const lista = [...new Set(asins.map((a) => String(a || '').toUpperCase()))].filter((a) => ASIN_RE.test(a))
  if (!lista.length || lista.length > 10) throw erro('Informe de 1 a 10 ASINs.')
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(String(partnerTag || ''))) throw erro('Salve sua tag de Associado Amazon.')
  const out = new Map()
  const faltam = []
  for (const a of lista) {
    const hit = itens.get(userId + '|' + a)
    if (hit && hit.ate > Date.now()) out.set(a, hit.item)
    else faltam.push(a)
  }
  if (!faltam.length) return out
  const t = await token(c, userId)
  const { status, dados } = await pedir(API + '/getItems', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json', 'x-marketplace': MARKETPLACE },
    body: JSON.stringify({ itemIds: faltam, itemIdType: 'ASIN', marketplace: MARKETPLACE, partnerTag, resources: RECURSOS })
  }, c)
  if (status === 401) tokens.delete(userId)
  if (status === 429) throw erro('A Amazon pediu um intervalo (limite de consultas).', 429, { temporario: true })
  if (status === 401 || status === 403) {
    throw erro('A Amazon negou o acesso à Creators API (' + semSegredo(motivoDe(dados) || 'HTTP ' + status, c) + '). O acesso exige 10 vendas qualificadas nos últimos 30 dias.', 403, { semAcesso: true })
  }
  if (status >= 500) throw erro('A Amazon está instável agora (HTTP ' + status + ').', 502, { temporario: true })
  const corpo = dados.itemsResult || dados.itemResults || dados.ItemsResult || {}
  const achados = new Map(((corpo.items || corpo.Items) || []).map(normalizar).filter(Boolean).map((i) => [i.asin, i]))
  if (status !== 200 && !achados.size) throw erro('Amazon: ' + semSegredo(motivoDe(dados) || 'HTTP ' + status, c), 400)
  for (const a of faltam) {
    const item = achados.get(a) || null
    itens.set(userId + '|' + a, { ate: Date.now() + CACHE_ITEM_MS, item })
    if (itens.size > 2000) itens.delete(itens.keys().next().value)
    out.set(a, item)
  }
  return out
}

/** Confere as credenciais (pega um token) e guarda cifrado. */
async function salvar(dataDir, userId, entrada = {}) {
  const clientId = String(entrada.clientId || '').trim()
  const clientSecret = String(entrada.clientSecret || '').trim()
  if (!CLIENT_ID_RE.test(clientId)) throw erro('Cole o Client ID da Creators API (Central de Associados > Creators API).')
  if (!SEGREDO_RE.test(clientSecret)) throw erro('Cole o Client Secret inteiro, sem espaços.')
  if (!cofre.disponivel()) throw erro('O servidor ainda não tem a chave mestra (SAAS_MASTER_KEY). Fale com o administrador.', 503)
  tokens.delete(userId)
  // O token de conferência já fica em cache para a primeira consulta
  await token({ clientId, clientSecret }, userId)
  await cofre.gravar(dataDir, userId, 'amazon', { clientId, clientSecret })
  for (const k of [...itens.keys()]) if (k.startsWith(userId + '|')) itens.delete(k)
  return { ok: true }
}

async function remover(dataDir, userId) {
  tokens.delete(userId)
  for (const k of [...itens.keys()]) if (k.startsWith(userId + '|')) itens.delete(k)
  await cofre.apagar(dataDir, userId, 'amazon')
  return { ok: true }
}

/** Máscara do Client ID para o painel (o segredo nunca volta). */
function estado(dataDir, userId) {
  const c = credenciais(dataDir, userId)
  return { configurada: !!c, clientId: c ? c.clientId.slice(0, 6) + '…' + c.clientId.slice(-4) : '', cofre: cofre.disponivel() }
}

module.exports = { MARKETPLACE, RECURSOS, TOKEN_URL, API, configurada, buscarItens, normalizar, salvar, remover, estado, semSegredo, _http: http, _cache: { tokens, itens } }
