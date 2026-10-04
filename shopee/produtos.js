const api = require('./api')
const cfg = require('./config')
const store = require('./store')
const historico = require('./historico')
const { log } = require('./log')

function texto(v) {
    if (v === null || v === undefined) return ''
    return String(v).trim()
}

function numeroPreco(v) {
    const n = Number(String(v).replace(',', '.'))
    return Number.isFinite(n) && n > 0 ? n : null
}

function formatarBRL(n) {
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function normalizar(raw) {
    if (!raw || typeof raw !== 'object') return null
    const itemId = texto(raw.itemId)
    const nome = texto(raw.productName)
    const offerLink = texto(raw.offerLink)
    const productLink = texto(raw.productLink)
    const link = offerLink || productLink
    const min = numeroPreco(raw.priceMin)
    const max = numeroPreco(raw.priceMax)
    const precoNum = min || max
    if (!itemId || !nome || !link || !precoNum) return null

    const precoTxt = max && min && max !== min
        ? `${formatarBRL(min)} – ${formatarBRL(max)}`
        : formatarBRL(precoNum)

    const desconto = raw.priceDiscountRate !== null && raw.priceDiscountRate !== undefined && raw.priceDiscountRate !== ''
        ? Number(raw.priceDiscountRate)
        : null

    return {
        productId: itemId,
        shopId: texto(raw.shopId),
        nome,
        link,
        productLink: productLink || '',
        imageUrl: texto(raw.imageUrl),
        preco: precoTxt,
        precoNum,
        priceMin: min,
        priceMax: max,
        desconto: Number.isFinite(desconto) && desconto > 0 ? desconto : null,
        sales: raw.sales != null ? Number(raw.sales) : null,
        ratingStar: texto(raw.ratingStar) || null,
        shopName: texto(raw.shopName) || null,
        commissionRate: texto(raw.commissionRate) || null
    }
}

function escolherKeyword(grupo) {
    if (grupo?.keyword) return grupo.keyword
    const g = store.carregar().global
    if (g.keyword) return g.keyword
    if (Array.isArray(g.keywords) && g.keywords.length) {
        return g.keywords[Math.floor(Math.random() * g.keywords.length)]
    }
    return cfg.keywordPadrao()
}

async function selecionar(grupoJid, grupoCfg) {
    const keyword = escolherKeyword(grupoCfg)
    const page = 1 + Math.floor(Math.random() * 3)
    log('buscando produtos' + (keyword ? ` (${keyword})` : ''))
    const brutos = await api.buscarProdutos({
        keyword: keyword || undefined,
        page,
        limit: 20,
        listType: 0,
        sortType: 5
    })
    const validos = brutos.map(normalizar).filter(Boolean)
    if (!validos.length) {
        log('nenhum produto válido nesta página')
        return null
    }
    const novos = validos.filter((p) => !historico.duplicado(grupoJid, p.productId))
    const pool = novos.length ? novos : validos
    const escolhido = pool[Math.floor(Math.random() * pool.length)]
    log('Produto encontrado')
    const curto = await api.encurtar(escolhido.link, ['namy', 'grupo'])
    if (curto) escolhido.link = curto
    return escolhido
}

module.exports = {
    normalizar,
    selecionar,
    escolherKeyword,
    formatarBRL
}
