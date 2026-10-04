const db = require('../db')
const { montarLista } = require('./providers')

function erroDeFallback(erro) {
    const status = erro?.response?.status
    const msg = String(erro?.response?.data?.error?.message || erro?.message || '').toLowerCase()
    if (!status) return true
    if (status === 408 || status === 409 || status === 429 || status >= 500) return true
    if (/(rate limit|quota|timeout|overloaded|unavailable)/.test(msg)) return true
    return false
}

async function perguntarComFallback({ mensagens, modo, chatId }) {
    const ultimo = chatId ? db.get('settings', `provedor:${chatId}`, null) : null
    const provedores = montarLista(modo, ultimo)
    if (!provedores.length) {
        throw new Error('Nenhuma chave de IA configurada. Configure GROQ_API_KEY, XAI_API_KEY ou GEMINI_API_KEY no .env.')
    }

    let ultimoErro = null
    for (const provedor of provedores) {
        try {
            const resposta = await provedor.chamar(mensagens)
            if (resposta) {
                if (chatId) db.set('settings', `provedor:${chatId}`, provedor.nome)
                db.increment('ai_usage', provedor.nome)
                db.increment('ai_usage', 'total')
                return { texto: resposta, provedor: provedor.nome }
            }
        } catch (erro) {
            ultimoErro = erro
            console.error(`IA ${provedor.nome} falhou:`, erro.response?.data || erro.message)
            if (!erroDeFallback(erro) && modo !== 'auto') throw erro
        }
    }
    throw ultimoErro || new Error('Nenhum provedor conseguiu responder.')
}

module.exports = {
    perguntarComFallback,
    erroDeFallback
}
