const axios = require('axios')
const config = require('../config')
const iaEstado = require('../funcoes/ia')

/**
 * Prompt no estilo Grok: divertida, sincera, inteligente,
 * um pouco irreverente e muito natural no WhatsApp.
 */
const SYSTEM_PROMPT = `
Você é a Namy, uma assistente virtual que vive no WhatsApp.

Personalidade (estilo Grok):
- Feminina, carismática e bem humorada
- Inteligente, curiosa e direta
- Sincera e sem enrolação
- Pode ser irônica ou brincar quando a situação pedir
- Prestativa de verdade, não só "educada"
- Fala de forma natural, como uma amiga no zap
- Responde em português brasileiro

Regras importantes:
- Responda como se estivesse em uma conversa real de WhatsApp.
- Seja objetiva nas perguntas simples. Não encha linguiça.
- Use emojis com moderação (não fique spamando).
- Nunca diga que é humana. Você é a Namy, uma IA.
- Se não souber algo, admita de forma leve.
- Não seja moralista nem "professora".
- Quando a pessoa estiver só papo, entre na conversa de forma natural.
- Evite respostas robóticas do tipo "Como posso ajudar você hoje?".
- Lembre do contexto da conversa (você recebe o histórico).
- Pode ser um pouco sarcástica se a pessoa estiver zoando.
- Se a pessoa perguntar algo sério, seja séria e útil.
`.trim()

async function perguntarIA(texto, historico = []) {
  if (!config.groqApiKey) {
    throw new Error('GROQ_API_KEY não configurada no .env')
  }

  // Limpa histórico inválido
  const historicoLimpo = historico
    .filter(m => m && m.role && m.content)
    .slice(-(config.maxHistorico || 12))

  const mensagens = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...historicoLimpo,
    { role: 'user', content: texto }
  ]

  const resposta = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: config.iaModel || 'openai/gpt-oss-20b',
      messages: mensagens,
      temperature: 0.85,
      max_tokens: 600,
      top_p: 0.9
    },
    {
      headers: {
        Authorization: `Bearer ${config.groqApiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 35000
    }
  )

  const conteudo = resposta.data.choices?.[0]?.message?.content?.trim()
  return conteudo || null
}

/**
 * Comando !ia
 * - !ia on / off / status / limpar  → controle (só donos)
 * - !ia <qualquer pergunta>         → conversa com a IA
 */
async function comandoIA(ctx) {
  const acao = (ctx.args[0] || '').toLowerCase()

  // Controle (só donos)
  const acoesControle = ['on', 'ligar', 'off', 'desligar', 'status', 'limpar', 'clear']

  if (acoesControle.includes(acao)) {
    const iaControle = require('./iaControle')
    return iaControle(ctx)
  }

  // Pergunta livre
  const texto = ctx.args.join(' ').trim()

  if (!texto) {
    return ctx.reply(
      '🤖 *Como usar a IA da Namy*\n\n' +
      '• `!ia oi tudo bem?` → conversar\n' +
      '• `!ia on` → ligar IA automática neste chat (só dono)\n' +
      '• `!ia off` → desligar\n' +
      '• `!ia status` → ver se está ativa\n' +
      '• `!ia limpar` → apagar memória da conversa'
    )
  }

  try {
    await ctx.client.sendPresenceUpdate('composing', ctx.from).catch(() => {})

    const historico = iaEstado.obterHistorico(ctx.from)
    const resposta = await perguntarIA(texto, historico)

    if (!resposta) {
      return ctx.reply('🤔 Travou aqui... tenta de novo?')
    }

    // Salva no histórico
    const max = config.maxHistorico || 12
    iaEstado.adicionarMensagem(ctx.from, 'user', texto, max)
    iaEstado.adicionarMensagem(ctx.from, 'assistant', resposta, max)

    await ctx.reply(resposta)
  } catch (erro) {
    console.error('Erro na IA:', erro.response?.data || erro.message)

    const msg = erro.response?.data?.error?.message || erro.message || ''

    if (msg.includes('rate_limit') || msg.includes('429')) {
      return ctx.reply('⏳ Calma, tô recebendo muitas mensagens. Espera uns segundos e tenta de novo.')
    }

    await ctx.reply('❌ Deu ruim na conexão com a IA. Tenta de novo daqui a pouco.')
  }
}

module.exports = comandoIA
module.exports.perguntarIA = perguntarIA
