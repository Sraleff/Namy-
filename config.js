require('dotenv').config()

const prefix = '!'

function lerDonos() {
    return String(process.env.OWNERS || '')
        .split(',')
        .map((x) => x.trim().replace(/\D/g, ''))
        .filter(Boolean)
}

module.exports = {
    botName: 'Namy',
    version: '3.0.0',
    prefix,
    developer: 'Aleff (mz)',

    owners: lerDonos(),

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
