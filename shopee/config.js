const botConfig = require('../config')

function envFlag(nome, padrao = '') {
    const v = process.env[nome]
    return v === undefined || v === null ? padrao : String(v)
}

function credenciaisOk() {
    return Boolean(envFlag('SHOPEE_APP_ID').trim() && envFlag('SHOPEE_SECRET').trim())
}

function temClientes() {
    try {
        return Object.keys(require('../saas/store').carregar().tenants).length > 0
    } catch {
        return false
    }
}

// Liga se a casa tiver chaves OU existir cliente (que usa as próprias chaves).
function habilitado() {
    const flag = envFlag('SHOPEE_ENABLED', '').toLowerCase()
    if (flag === 'false' || flag === '0' || flag === 'off') return false
    return credenciaisOk() || temClientes()
}

module.exports = {
    appId: () => envFlag('SHOPEE_APP_ID').trim(),
    secret: () => envFlag('SHOPEE_SECRET').trim(),
    endpoint: () => envFlag('SHOPEE_ENDPOINT', 'https://open-api.affiliate.shopee.com.br/graphql').trim(),
    habilitado,
    credenciaisOk,
    temClientes,
    keywordPadrao: () => envFlag('SHOPEE_KEYWORD', '').trim(),
    timeoutMs: 25000,
    tickMs: 60 * 1000,
    espacoEntreGruposMs: 20 * 1000,
    duplicidadeDias: 7,
    historicoMax: 2500,
    prefix: botConfig.prefix || '!'
}
