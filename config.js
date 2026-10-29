require('dotenv').config()

const prefix = '!'

function lerDonos() {
    return String(process.env.OWNERS || '')
        .split(',')
        .map((x) => x.trim().replace(/\D/g, ''))
        .filter(Boolean)
}

function lerLista(valor, padrao) {
    const bruto = valor === undefined ? padrao : valor
    return String(bruto || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
}

function lerInt(valor, padrao, min, max) {
    const n = Math.floor(Number(valor))
    if (!Number.isFinite(n)) return padrao
    return Math.min(max, Math.max(min, n))
}

module.exports = {
    botName: 'Namy',
    version: '3.1.0',
    prefix,
    developer: 'Aleff (mz)',

    owners: lerDonos(),

    // Chats que a Namy ignora (antes era um JID fixo no index.js; o padrão foi mantido)
    ignorarJids: lerLista(process.env.IGNORE_JIDS, '120363142999607164@g.us'),

    // Anti-flood de comandos por pessoa (donos não entram no limite)
    rateLimitMax: lerInt(process.env.RATE_LIMIT_MAX, 8, 1, 100),
    rateLimitJanelaSeg: lerInt(process.env.RATE_LIMIT_WINDOW_SEC, 60, 5, 3600),

    groqApiKey: process.env.GROQ_API_KEY,
    xaiApiKey: process.env.XAI_API_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY,

    iaModelGroq: process.env.IA_MODEL_GROQ || 'openai/gpt-oss-20b',
    iaModelXai: process.env.IA_MODEL_XAI || 'grok-4.6',
    iaModelGemini: process.env.IA_MODEL_GEMINI || 'gemini-2.0-flash',

    providers: ['groq', 'xai', 'gemini'],

    maxHistorico: 12,
    esperar: 700,
    iaNivelPadrao: 50,
    personalidadeMinutos: 8
}
