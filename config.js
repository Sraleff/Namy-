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

    // Modelo da Groq (rápido e bom)
    // Alternativas: 'llama-3.3-70b-versatile', 'openai/gpt-oss-20b', 'llama-3.1-8b-instant'
    iaModel: 'openai/gpt-oss-20b',

    // Quantidade máxima de mensagens de histórico por chat
    maxHistorico: 12,

    // Delay do "digitando..." em ms
    esperar: 700
}
