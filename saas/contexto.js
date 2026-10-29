// Qual cliente está sendo atendido agora. Tudo que roda dentro de executar()
// (IA, Shopee) usa as chaves desse cliente — nunca as da casa por acidente.
const { AsyncLocalStorage } = require('async_hooks')
const config = require('../config')

const als = new AsyncLocalStorage()

function executar(creds, fn) {
    return creds ? als.run(creds, fn) : fn()
}

function atual() {
    return als.getStore() || null
}

function tenantAtual() {
    return atual()?.tenant || null
}

function chaveIA(nome) {
    const c = atual()
    if (c) return String(c.ia?.[nome] || '')
    const casa = { groq: config.groqApiKey, xai: config.xaiApiKey, gemini: config.geminiApiKey }
    return String(casa[nome] || '')
}

function shopeeCreds() {
    const c = atual()
    if (c) return c.shopee || null
    const appId = String(process.env.SHOPEE_APP_ID || '').trim()
    const secret = String(process.env.SHOPEE_SECRET || '').trim()
    return appId && secret ? { appId, secret } : null
}

module.exports = { executar, atual, tenantAtual, chaveIA, shopeeCreds }
