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
    shopId: texto(raw.shopId),
    nome,
    link,
    imageUrl: imagem.startsWith('https://') ? imagem : '',
    preco,
    precoNum,
    desconto: Number.isFinite(desconto) && desconto > 0 ? Math.round(desconto) : null,
    ratingStar: texto(raw.ratingStar),
    sales: Number(raw.sales) || 0,
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

function queryProdutos(keyword, page, limit, sortType = 5) {
  const args = ['listType: 0', 'sortType: ' + (Number.isInteger(sortType) ? sortType : 5), 'page: ' + page, 'limit: ' + limit]
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

// subIds: so letras e numeros (a API recusa o resto); sem nada valido, o padrao de sempre
function subIdsValidos(subIds) {
  const ok = (Array.isArray(subIds) ? subIds : []).map((x) => String(x)).filter((x) => /^[A-Za-z0-9]{1,20}$/.test(x)).slice(0, 5)
  return ok.length ? ok : ['namy']
}

async function encurtar(appId, secret, url, subIds) {
  if (!url) return null
  const query = 'mutation { generateShortLink(input: { originUrl: ' + JSON.stringify(url) + ', subIds: ' + JSON.stringify(subIdsValidos(subIds)) + ' }) { shortLink } }'
  try {
    const data = await graphql(appId, secret, query)
    const link = data.generateShortLink && data.generateShortLink.shortLink
    return link && /^https:\/\//.test(link) ? link : null
  } catch {
    return null
  }
}

/**
 * opts (todos opcionais, usados pelo publicador por nicho):
 *   keyword   busca no lugar de shopee.keyword
 *   aceitar   (oferta) => { ok, motivo }  filtro duro (nicho, qualidade)
 *   rejeitados  array que recebe { oferta, motivo } das recusadas
 *   evitar    itemIds ja enviados ao grupo (so preferencia, como o historico)
 * Com `aceitar`, devolve null quando nenhuma oferta passa.
 */
async function preparar(dataDir, userId, shopee, opts = {}) {
  if (!shopee || !shopee.appId || !shopee.secret) {
    const err = new Error('Salve App ID e Secret da Shopee. O anuncio sai da API desta conta.')
    err.code = 'SHOPEE'
    err.status = 400
    throw err
  }
  const keyword = opts.keyword != null ? String(opts.keyword).trim() : String(shopee.keyword || '').trim()
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
  let aceitos = validos
  if (typeof opts.aceitar === 'function') {
    aceitos = []
    for (const p of validos) {
      const r = opts.aceitar(p) || {}
      if (r.ok) aceitos.push(p)
      else if (Array.isArray(opts.rejeitados)) opts.rejeitados.push({ oferta: p, motivo: r.motivo || 'recusada' })
    }
    if (!aceitos.length) return null
  }
  const recentes = new Set(historico(dataDir, userId).map((x) => x.id))
  for (const id of opts.evitar || []) recentes.add(String(id))
  const novos = aceitos.filter((p) => !recentes.has(p.productId))
  const pool = novos.length ? novos : aceitos
  const oferta = pool[Math.floor(Math.random() * pool.length)]
  // semCurto: quem chama vai gerar o link depois (um por grupo); aqui fica o link original
  if (!opts.semCurto) {
    const curto = await encurtar(shopee.appId, shopee.secret, oferta.link, opts.subIds)
    if (curto) oferta.link = curto
  }
  oferta.texto = mensagem(oferta)
  return oferta
}

/**
 * Busca para a vitrine do painel: ofertas normalizadas, sem filtro de nicho nem de
 * historico. sortType e inteiro de 1 a 9 (os valores aceitos pela API sao validados
 * por quem chama); qualquer outra coisa cai no padrao 5, o mesmo de sempre.
 * Devolve { itens, recebidos } (recebidos = quantos nos a API mandou, antes de descartar os sem preco/link).
 */
async function buscar(shopee, { keyword = '', page = 1, limit = 20, sortType = 5 } = {}) {
  if (!shopee || !shopee.appId || !shopee.secret) {
    const err = new Error('Salve App ID e Secret da Shopee.')
    err.code = 'SHOPEE'
    err.status = 400
    throw err
  }
  const p = Math.min(50, Math.max(1, Math.floor(Number(page)) || 1))
  const l = Math.min(50, Math.max(1, Math.floor(Number(limit)) || 20))
  const s = Number.isInteger(sortType) && sortType >= 1 && sortType <= 9 ? sortType : 5
  const data = await graphql(shopee.appId, shopee.secret, queryProdutos(keyword, p, l, s))
  const nodes = data.productOfferV2 && data.productOfferV2.nodes
  const lista = Array.isArray(nodes) ? nodes : []
  return { itens: lista.map(normalizar).filter(Boolean), recebidos: lista.length }
}

/**
 * Confere UM produto na API (productOfferV2 por itemId; validado na conta real: devolve 1 item
 * igual ao da busca, e 0 itens quando o produto nao existe mais).
 * Devolve { status: 'ok', oferta } ou { status: 'indisponivel' }. Erro da API lanca.
 */
async function porItem(shopee, itemId) {
  if (!shopee || !shopee.appId || !shopee.secret) {
    const err = new Error('Salve App ID e Secret da Shopee.')
    err.code = 'SHOPEE'
    err.status = 400
    throw err
  }
  const id = String(itemId == null ? '' : itemId)
  if (!/^\d{1,20}$/.test(id)) {
    const err = new Error('itemId invalido')
    err.status = 400
    throw err
  }
  const data = await graphql(shopee.appId, shopee.secret, '{ productOfferV2(itemId: ' + id + ', limit: 1) { nodes { ' + NODES + ' } } }')
  const nodes = data.productOfferV2 && data.productOfferV2.nodes
  const oferta = (Array.isArray(nodes) ? nodes : []).map(normalizar).find((o) => o && o.productId === id)
  return oferta ? { status: 'ok', oferta } : { status: 'indisponivel' }
}

/**
 * Relatorio de conversoes (comissoes) de UMA pagina. Campos verificados por introspeccao na API real.
 * inicio/fim em segundos (epoch). Devolve { nodes, hasNextPage, scrollId }.
 */
async function conversoes(shopee, { inicio, fim, scrollId = '', limit = 100 } = {}) {
  if (!shopee || !shopee.appId || !shopee.secret) {
    const err = new Error('Salve App ID e Secret da Shopee.')
    err.code = 'SHOPEE'
    err.status = 400
    throw err
  }
  const i = Math.floor(Number(inicio))
  const f = Math.floor(Number(fim))
  if (!Number.isFinite(i) || !Number.isFinite(f) || i <= 0 || f <= i) throw Object.assign(new Error('Periodo invalido'), { status: 400 })
  const l = Math.min(100, Math.max(1, Math.floor(Number(limit)) || 100))
  const sc = scrollId ? ', scrollId: ' + JSON.stringify(String(scrollId).slice(0, 200)) : ''
  const query = '{ conversionReport(purchaseTimeStart: ' + i + ', purchaseTimeEnd: ' + f + ', limit: ' + l + sc + ') { nodes { conversionId purchaseTime conversionStatus totalCommission netCommission utmContent orders { orderId items { itemId itemName qty actualAmount itemTotalCommission } } } pageInfo { hasNextPage scrollId } } }'
  const data = await graphql(shopee.appId, shopee.secret, query)
  const rel = data.conversionReport || {}
  const pi = rel.pageInfo || {}
  return { nodes: Array.isArray(rel.nodes) ? rel.nodes : [], hasNextPage: !!pi.hasNextPage, scrollId: pi.scrollId ? String(pi.scrollId) : '' }
}

module.exports = { normalizar, mensagem, preparar, lembrar, encurtar, buscar, porItem, subIdsValidos, conversoes }
