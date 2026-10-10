const crypto = require('crypto')
const axios = require('axios')
const cfg = require('./config')
const { log } = require('./log')
const store = require('./store')
const contexto = require('../saas/contexto')

const NODES = `itemId shopId productName productLink offerLink imageUrl priceMin priceMax priceDiscountRate sales ratingStar commissionRate shopName shopType periodStartTime periodEndTime`

// Credenciais vêm do contexto: do cliente dono do grupo, ou da casa.
function assinar(payload, creds = contexto.shopeeCreds()) {
    const appId = creds?.appId || ''
    const secret = creds?.secret || ''
    const timestamp = String(Math.floor(Date.now() / 1000))
    const signature = crypto
        .createHash('sha256')
        .update(appId + timestamp + payload + secret)
        .digest('hex')
    return {
        timestamp,
        header: `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`
    }
}

function queryProdutos({ keyword, listType, sortType, page, limit }) {
    const args = [
        `listType: ${Number(listType) || 0}`,
        `sortType: ${Number(sortType) || 5}`,
        `page: ${Number(page) || 1}`,
        `limit: ${Math.min(50, Number(limit) || 20)}`
    ]
    if (keyword) args.unshift(`keyword: ${JSON.stringify(String(keyword).slice(0, 80))}`)
    return `{ productOfferV2(${args.join(', ')}) { nodes { ${NODES} } pageInfo { page limit hasNextPage } } }`
}

function mutationShort(originUrl, subIds) {
    const ids = (subIds || ['namy']).filter(Boolean).slice(0, 5).map((s) => JSON.stringify(String(s).slice(0, 40)))
    return `mutation { generateShortLink(input: { originUrl: ${JSON.stringify(originUrl)}, subIds: [${ids.join(', ')}] }) { shortLink } }`
}

function erroPermanenteAuth(codigo, mensagem) {
    const c = String(codigo || '')
    const m = String(mensagem || '').toLowerCase()
    if (['10020', '10032', '10033', '10034', '10035'].includes(c)) return true
    if (/invalid signature|invalid credential|no access|frozen|black list/.test(m)) return true
    return false
}

function erro(code, msg) {
    const e = new Error(msg || code)
    e.code = code
    return e
}

async function graphql(query, { retries = 1 } = {}) {
    const tenant = contexto.tenantAtual()
    const creds = contexto.shopeeCreds()
    if (!creds?.appId || !creds?.secret) throw erro('NO_CREDS', 'sem_credenciais')

    // A trava global só vale para as chaves da casa; cliente com chave ruim não derruba os outros.
    if (!tenant && store.carregar().authFailed) throw erro('AUTH_BLOCKED', 'autenticacao_bloqueada')

    const payload = JSON.stringify({ query })
    const { header } = assinar(payload, creds)

    let ultimo = null
    const tentativas = Math.max(1, retries + 1)

    for (let i = 0; i < tentativas; i++) {
        try {
            const resposta = await axios.post(cfg.endpoint(), payload, {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: header
                },
                timeout: cfg.timeoutMs,
                validateStatus: () => true
            })

            const status = resposta.status
            const data = resposta.data || {}

            if (status === 429 || status >= 500) {
                ultimo = new Error(`http_${status}`)
                if (i < tentativas - 1) {
                    await new Promise((r) => setTimeout(r, 1500 * (i + 1)))
                    continue
                }
                throw ultimo
            }

            const gqlErrors = Array.isArray(data.errors) ? data.errors : []
            if (gqlErrors.length) {
                const primeiro = gqlErrors[0]
                const codigo = primeiro?.extensions?.code || primeiro?.code || ''
                const mensagem = primeiro?.message || 'erro GraphQL'
                if (erroPermanenteAuth(codigo, mensagem)) {
                    if (tenant) {
                        log(`Chaves do cliente ${tenant} recusadas`)
                        throw erro('AUTH_TENANT', 'autenticacao_cliente')
                    }
                    store.atualizar((s) => {
                        s.authFailed = true
                        s.authFailedAt = Date.now()
                        s.lastError = 'autenticacao'
                        return s
                    })
                    log('Erro na API: autenticacao (modulo pausado, bot segue)')
                    throw erro('AUTH', 'autenticacao')
                }
                if (String(codigo) === '10030') throw erro('RATE', 'rate_limit')
                throw erro(codigo || 'GQL', mensagem)
            }

            return data.data || {}
        } catch (e) {
            if (['AUTH', 'AUTH_BLOCKED', 'AUTH_TENANT', 'RATE', 'NO_CREDS'].includes(e.code)) throw e
            ultimo = e
            const retryavel = !e.response || ['ECONNABORTED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET'].includes(e.code)
            if (retryavel && i < tentativas - 1) {
                await new Promise((r) => setTimeout(r, 1500 * (i + 1)))
                continue
            }
            throw e
        }
    }
    throw ultimo || new Error('falha_api')
}

async function buscarProdutos({ keyword = '', page = 1, limit = 20, listType = 0, sortType = 5 } = {}) {
    const data = await graphql(queryProdutos({ keyword, listType, sortType, page, limit }), { retries: 1 })
    const nodes = data?.productOfferV2?.nodes
    return Array.isArray(nodes) ? nodes : []
}

async function encurtar(originUrl, subIds = ['namy']) {
    if (!originUrl) return null
    try {
        const data = await graphql(mutationShort(originUrl, subIds), { retries: 0 })
        return data?.generateShortLink?.shortLink || null
    } catch {
        return null
    }
}

module.exports = {
    assinar,
    graphql,
    buscarProdutos,
    encurtar,
    erroPermanenteAuth,
    queryProdutos
}
