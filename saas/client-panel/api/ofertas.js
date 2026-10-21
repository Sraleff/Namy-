/**
 * Ofertas da API oficial Shopee Afiliados (productOfferV2).
 * Credenciais sao as da conta do cliente. Nao grava secret nem o payload.
 */
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const ENDPOINT = 'https://open-api.affiliate.shopee.com.br/graphql'
const NODES = 'itemId shopId productName productLink offerLink imageUrl priceMin priceMax priceDiscountRate sales ratingStar commissionRate shopName shopType periodStartTime periodEndTime'

function safeId(userId) {
  return String(userId || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80)
}

function texto(v) {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

function numeroPreco(v) {
  const n = Number(String(v == null ? '' : v).replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

function brl(n) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function normalizar(raw) {
  if (!raw || typeof raw !== 'object') return null
  const itemId = texto(raw.itemId)
  const nome = texto(raw.productName).slice(0, 180)
  const offerLink = texto(raw.offerLink)
  const productLink = texto(raw.productLink)
  const link = offerLink || productLink
  const min = numeroPreco(raw.priceMin)
  const max = numeroPreco(raw.priceMax)
  const precoNum = min || max
  if (!itemId || !nome || !link || !precoNum) return null
  const preco = max && min && max !== min ? brl(min) + ' – ' + brl(max) : brl(precoNum)
  const desconto = Number(raw.priceDiscountRate)
  const imagem = texto(raw.imageUrl)
  return {
    productId: itemId,
    nome,
    link,
    imageUrl: imagem.startsWith('https://') ? imagem : '',
    preco,
    desconto: Number.isFinite(desconto) && desconto > 0 ? Math.round(desconto) : null,
    ratingStar: texto(raw.ratingStar),
    shopName: texto(raw.shopName).slice(0, 80)
  }
}

function mensagem(p) {
  const linhas = ['🔥 OFERTA SHOPEE', '', p.nome, '', '💰 ' + p.preco]
  if (p.desconto) linhas.push('📉 ' + p.desconto + '% off')
  if (p.ratingStar) linhas.push('⭐ ' + p.ratingStar)
  if (p.shopName) linhas.push('🏪 ' + p.shopName)
  linhas.push('', '🔗 ' + p.link)
  return linhas.join('\n').slice(0, 3500)
}

function assinar(appId, secret, payload) {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = crypto.createHash('sha256').update(appId + timestamp + payload + secret).digest('hex')
  return 'SHA256 Credential=' + appId + ', Timestamp=' + timestamp + ', Signature=' + signature
}

function queryProdutos(keyword, page, limit) {
  const args = ['listType: 0', 'sortType: 5', 'page: ' + page, 'limit: ' + limit]
  const kw = String(keyword || '').trim().slice(0, 80)
  if (kw) args.unshift('keyword: ' + JSON.stringify(kw))
  return '{ productOfferV2(' + args.join(', ') + ') { nodes { ' + NODES + ' } } }'
}

async function graphql(appId, secret, query) {
  const payload = JSON.stringify({ query })
  let data = {}
  let status = 0
  try {
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: assinar(appId, secret, payload)
      },
      body: payload
    })
    status = r.status
    data = await r.json().catch(() => ({}))
  } catch {
    const err = new Error('Nao consegui falar com a API Shopee.')
    err.code = 'SHOPEE'
    err.status = 502
    throw err
  }
  if (data.errors && data.errors.length) {
    const err = new Error(data.errors[0].message || 'Erro na API Shopee')
    err.code = 'SHOPEE'
    err.status = 400
    throw err
  }
  if (status >= 400) {
    const err = new Error('API Shopee respondeu ' + status)
    err.code = 'SHOPEE'
    err.status = 502
    throw err
  }
  return data.data || {}
}

function histFile(dataDir, userId) {
  const dir = path.join(dataDir, 'ofertas')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, safeId(userId) + '.json')
}

function historico(dataDir, userId) {
  const corte = Date.now() - 7 * 86400000
  try {
    const list = JSON.parse(fs.readFileSync(histFile(dataDir, userId), 'utf8'))
    return (Array.isArray(list) ? list : []).filter((x) => x && x.id && new Date(x.at).getTime() > corte)
  } catch {
    return []
  }
}

function lembrar(dataDir, userId, productId) {
  if (!safeId(userId) || !productId) return
  const list = historico(dataDir, userId)
  list.unshift({ id: String(productId).slice(0, 40), at: new Date().toISOString() })
  fs.writeFileSync(histFile(dataDir, userId), JSON.stringify(list.slice(0, 400)))
}

async function encurtar(appId, secret, url) {
  if (!url) return null
  const query = 'mutation { generateShortLink(input: { originUrl: ' + JSON.stringify(url) + ', subIds: ["namy"] }) { shortLink } }'
  try {
    const data = await graphql(appId, secret, query)
    const link = data.generateShortLink && data.generateShortLink.shortLink
    return link && /^https:\/\//.test(link) ? link : null
  } catch {
    return null
  }
}

async function preparar(dataDir, userId, shopee) {
  if (!shopee || !shopee.appId || !shopee.secret) {
    const err = new Error('Salve App ID e Secret da Shopee. O anuncio sai da API desta conta.')
    err.code = 'SHOPEE'
    err.status = 400
    throw err
  }
  const keyword = String(shopee.keyword || '').trim()
  const page = 1 + Math.floor(Math.random() * 3)
  const data = await graphql(shopee.appId, shopee.secret, queryProdutos(keyword, page, 10))
  const nodes = data.productOfferV2 && data.productOfferV2.nodes
  const validos = (Array.isArray(nodes) ? nodes : []).map(normalizar).filter(Boolean)
  if (!validos.length) {
    const err = new Error(keyword ? 'Nenhuma oferta com link para "' + keyword + '".' : 'A API nao devolveu oferta com nome, preco e link.')
    err.code = 'SHOPEE'
    err.status = 400
    throw err
  }
  const recentes = new Set(historico(dataDir, userId).map((x) => x.id))
  const novos = validos.filter((p) => !recentes.has(p.productId))
  const pool = novos.length ? novos : validos
  const oferta = pool[Math.floor(Math.random() * pool.length)]
  const curto = await encurtar(shopee.appId, shopee.secret, oferta.link)
  if (curto) oferta.link = curto
  oferta.texto = mensagem(oferta)
  return oferta
}

module.exports = { normalizar, mensagem, preparar, lembrar }
