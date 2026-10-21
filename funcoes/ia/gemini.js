const axios = require('axios')
const config = require('../../config')
const { chaveIA } = require('../../saas/contexto')

function paraGemini(mensagens) {
    const system = mensagens.filter((m) => m.role === 'system').map((m) => m.content).join('\n')
    const contents = mensagens
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }))
    return { system, contents }
}

module.exports = {
    nome: 'gemini',
    rotulo: 'Gemini',
    async chamar(mensagens) {
        const { system, contents } = paraGemini(mensagens)
        const url =
            `https://generativelanguage.googleapis.com/v1beta/models/` +
            `${config.iaModelGemini}:generateContent`

        const resposta = await axios.post(
            url,
            {
                systemInstruction: { parts: [{ text: system }] },
                contents,
                generationConfig: {
                    temperature: 0.9,
                    maxOutputTokens: 600
                }
            },
            {
                // chave no header, não na URL (URL costuma parar em log de erro)
                headers: { 'x-goog-api-key': chaveIA('gemini'), 'Content-Type': 'application/json' },
                timeout: 35000
            }
        )

        const parts = resposta.data?.candidates?.[0]?.content?.parts || []
        return parts.map((p) => p.text || '').join('').trim() || null
    }
}
