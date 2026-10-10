const config = require('../../config')
const { chaveIA } = require('../../saas/contexto')
const groq = require('./groq')
const xai = require('./xai')
const gemini = require('./gemini')

const CATALOGO = {
    groq,
    xai,
    gemini
}

// As chaves vêm do contexto: do cliente dono do grupo, ou da casa fora de grupos de cliente.
function montarLista(modo, ultimo) {
    const disponiveis = []
    if (chaveIA('groq')) disponiveis.push(CATALOGO.groq)
    if (chaveIA('xai')) disponiveis.push(CATALOGO.xai)
    if (chaveIA('gemini')) disponiveis.push(CATALOGO.gemini)
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
        `Groq: ${chaveIA('groq') ? '✅ configurado' : '❌ ausente'}`,
        `Grok/xAI: ${chaveIA('xai') ? '✅ configurado' : '❌ ausente'}`,
        `Gemini: ${chaveIA('gemini') ? '✅ configurado' : '❌ ausente'}`
    ].join('\n')
}

module.exports = {
    CATALOGO,
    montarLista,
    statusProvedores
}
