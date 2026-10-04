const config = require('../../config')
const groq = require('./groq')
const xai = require('./xai')
const gemini = require('./gemini')

const CATALOGO = {
    groq,
    xai,
    gemini
}

function montarLista(modo, ultimo) {
    const disponiveis = []
    if (config.groqApiKey) disponiveis.push(CATALOGO.groq)
    if (config.xaiApiKey) disponiveis.push(CATALOGO.xai)
    if (config.geminiApiKey) disponiveis.push(CATALOGO.gemini)
    if (!disponiveis.length) return []

    const porNome = Object.fromEntries(disponiveis.map((p) => [p.nome, p]))

    if (modo === 'grok' || modo === 'xai') {
        return [porNome.xai, porNome.groq, porNome.gemini].filter(Boolean)
    }
    if (modo === 'groq') {
        return [porNome.groq, porNome.xai, porNome.gemini].filter(Boolean)
    }
    if (modo === 'gemini') {
        return [porNome.gemini, porNome.groq, porNome.xai].filter(Boolean)
    }

    const ordem = [...(config.providers || ['groq', 'xai', 'gemini'])]
    if (ultimo && ordem.includes(ultimo)) {
        const i = ordem.indexOf(ultimo)
        const rotacionada = ordem.slice(i + 1).concat(ordem.slice(0, i + 1))
        return rotacionada.map((n) => porNome[n]).filter(Boolean)
    }
    return ordem.map((n) => porNome[n]).filter(Boolean)
}

function statusProvedores() {
    return [
        `Groq: ${config.groqApiKey ? '✅ configurado' : '❌ ausente'}`,
        `Grok/xAI: ${config.xaiApiKey ? '✅ configurado' : '❌ ausente'}`,
        `Gemini: ${config.geminiApiKey ? '✅ configurado' : '❌ ausente'}`
    ].join('\n')
}

module.exports = {
    CATALOGO,
    montarLista,
    statusProvedores
}
