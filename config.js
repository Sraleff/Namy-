
require('dotenv').config()

const prefix = '!'

module.exports = {
    botName: 'Namy',
    version: '2.2.0',
    prefix,

    developer: 'Aleff (mz)',

    owners: [
        '5527997028631',
        '5527988671589'
    ],

    groqApiKey: process.env.GROQ_API_KEY,
    xaiApiKey: process.env.XAI_API_KEY,

    // modelos
    iaModelGroq: 'openai/gpt-oss-20b',
    iaModelXai: 'grok-4.6',

    maxHistorico: 12,
    esperar: 700
}