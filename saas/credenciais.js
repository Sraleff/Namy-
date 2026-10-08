const config = require('../config')
const tenants = require('./tenants')
const planos = require('./planos')
const cripto = require('./cripto')

const PROVEDORES_IA = ['groq', 'xai', 'gemini']

function lerProprias(id) {
    return cripto.decifrar(tenants.obter(id)?.cred)
}

function alterar(id, fn) {
    const atual = lerProprias(id)
    const novo = fn({ ...atual }) || atual
    tenants.patch(id, { cred: cripto.cifrar(novo) })
}

function setShopee(id, appId, secret) {
    alterar(id, (c) => { c.shopee = { appId, secret }; return c })
}

function setIA(id, provedor, chave) {
    alterar(id, (c) => { c[provedor] = chave; return c })
}

function remover(id, campo) {
    alterar(id, (c) => { delete c[campo]; return c })
}

function mascara(v) {
    const s = String(v || '')
    if (!s) return '—'
    if (s.length < 12) return '••••'
    return `${s.slice(0, 4)}…${s.slice(-4)}`
}

function casaPermitida(t) {
    const p = planos.obter(t?.plano)
    return Boolean(t?.usarChaveCasa && p?.permiteChaveCasa)
}

function casa() {
    const appId = String(process.env.SHOPEE_APP_ID || '').trim()
    const secret = String(process.env.SHOPEE_SECRET || '').trim()
    return {
        shopee: appId && secret ? { appId, secret } : null,
        ia: { groq: config.groqApiKey || '', xai: config.xaiApiKey || '', gemini: config.geminiApiKey || '' }
    }
}

function vazio(id) {
    return { tenant: id, shopee: null, ia: {} }
}

// Chaves efetivas do cliente: as próprias; as da casa só se o plano incluir e ele ligou.
function montar(id) {
    const t = tenants.obter(id)
    if (!t || !tenants.ativoEmDia(t)) return vazio(id)
    const own = lerProprias(id)
    const usaCasa = casaPermitida(t)
    const h = casa()
    const ia = {}
    for (const p of PROVEDORES_IA) ia[p] = own[p] || (usaCasa ? h.ia[p] : '')
    const shopee = own.shopee?.appId && own.shopee?.secret ? own.shopee : (usaCasa ? h.shopee : null)
    return { tenant: id, shopee, ia }
}

// Contexto para mensagens de um chat. null = grupo da plataforma (chaves da casa).
function paraChat(jid) {
    const id = tenants.donoDoGrupo(jid)
    return id ? montar(id) : null
}

function paraGrupoShopee(jid) {
    const p = tenants.podePublicar(jid)
    if (!p.ok) return { ok: false, motivo: p.motivo }
    if (!p.tenant) {
        return casa().shopee ? { ok: true, creds: null } : { ok: false, motivo: 'sem_credenciais' }
    }
    const creds = montar(p.tenant)
    if (!creds.shopee) return { ok: false, motivo: 'cliente_sem_shopee' }
    return { ok: true, creds }
}

function resumo(id) {
    const own = lerProprias(id)
    return {
        shopee: own.shopee?.appId ? `AppId ${mascara(own.shopee.appId)}` : '—',
        groq: mascara(own.groq),
        xai: mascara(own.xai),
        gemini: mascara(own.gemini)
    }
}

module.exports = {
    PROVEDORES_IA, setShopee, setIA, remover, mascara, casaPermitida,
    montar, paraChat, paraGrupoShopee, resumo
}
