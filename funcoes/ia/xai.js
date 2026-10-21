const axios = require('axios')
const config = require('../../config')
const { chaveIA } = require('../../saas/contexto')

module.exports = {
    nome: 'xai',
    rotulo: 'Grok/xAI',
    async chamar(mensagens) {
        const resposta = await axios.post(
            'https://api.x.ai/v1/chat/completions',
            {
                model: config.iaModelXai,
                messages: mensagens,
                temperature: 0.9,
                max_tokens: 600
            },
            {
                headers: {
                    Authorization: `Bearer ${chaveIA('xai')}`,
                    'Content-Type': 'application/json'
                },
                timeout: 35000
            }
        )
        return resposta.data.choices?.[0]?.message?.content?.trim() || null
    }
}
