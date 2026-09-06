const axios = require('axios')
const config = require('../config')

module.exports = async function ia(ctx) {
    const pergunta = ctx.args.join(' ')

    if (!pergunta) {
        return ctx.reply(
            `❌ Digite uma pergunta!\nEx: ${ctx.prefix}ia Qual é a capital do Brasil?`
        )
    }

    const apiKey = config.groqApiKey
    if (!apiKey) {
        return ctx.reply(
            '❌ A chave da API Groq não está configurada.\n\n' +
            '1. Acesse https://console.groq.com\n' +
            '2. Crie uma API Key\n' +
            '3. Coloque em config.js (groqApiKey)'
        )
    }

    try {
        await ctx.client.sendPresenceUpdate('composing', ctx.from)

        const response = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
                model: 'openai/gpt-oss-20b',
                messages: [
                    {
                        role: 'system',
                        content:
                            'Você é a Namy, uma assistente virtual fofa, divertida e prestativa do WhatsApp. ' +
                            'Responda sempre em português brasileiro, de forma clara, amigável e concisa. ' +
                            'Use emojis com moderação. Se não souber algo, diga com sinceridade.'
                    },
                    {
                        role: 'user',
                        content: pergunta
                    }
                ],
                temperature: 0.8,
                max_tokens: 1024
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        )

        const resposta = response.data?.choices?.[0]?.message?.content || 'Desculpe, não consegui gerar uma resposta agora.'

        await ctx.reply(`🤖 *Namy IA:*\n\n${resposta}`)
    } catch (erro) {
        console.error('Erro ao chamar Groq:', erro.response?.data || erro.message)

        const status = erro.response?.status
        if (status === 401 || status === 403) {
            return ctx.reply('❌ Chave da API inválida. Verifique sua groqApiKey.')
        }
        if (status === 429) {
            return ctx.reply('⏳ Muitas requisições. Aguarde um pouco e tente de novo.')
        }

        await ctx.reply('❌ Erro ao processar sua pergunta. Tente novamente em instantes.')
    }
}
