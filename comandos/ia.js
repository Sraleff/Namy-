const axios = require('axios')
const config = require('../config')
const iaEstado = require('../funcoes/ia')
const { systemPromptNamy } = require('../funcoes/autonomia')
const memoria = require('../funcoes/memoria')

function capturarMemoria(jid, texto) {
  if (!jid || !texto) return

  // nome
  const nomeMatch = texto.match(
    /(?:meu nome [eé]|me chamo|eu sou(?: a| o)?)\s+([A-Za-zÀ-ÿ]{2,20})/i
  )
  if (nomeMatch) {
    memoria.atualizar(jid, { nome: nomeMatch[1] })
  }

  // gosto de...
  const gostoMatch = texto.match(/gosto de\s+(.+)/i)
  if (gostoMatch) {
    const atual = memoria.pegar(jid)
    const gosto = gostoMatch[1].trim().replace(/[!.?]+$/, '')
    const lista = Array.isArray(atual.gostos) ? [...atual.gostos] : []
    if (gosto && !lista.includes(gosto)) lista.push(gosto)
    memoria.atualizar(jid, { gostos: lista.slice(-10) })
  }

  // me interesso por... / curto...
  const interesseMatch = texto.match(/(?:me interesso por|curto)\s+(.+)/i)
  if (interesseMatch) {
    const atual = memoria.pegar(jid)
    const item = interesseMatch[1].trim().replace(/[!.?]+$/, '')
    const lista = Array.isArray(atual.interesses) ? [...atual.interesses] : []
    if (item && !lista.includes(item)) lista.push(item)
    memoria.atualizar(jid, { interesses: lista.slice(-10) })
  }
}

async function perguntarIA(texto, historico = [], jid = null) {
  if (!config.groqApiKey) {
    throw new Error('GROQ_API_KEY não configurada no .env')
  }

  // salva memórias simples automaticamente
  if (jid) capturarMemoria(jid, texto)

  const historicoLimpo = historico
    .filter(m => m && m.role && m.content)
    .slice(-(config.maxHistorico || 12))

  const resumo = jid ? memoria.resumoMemoria(jid) : 'Ainda não há memória salva desta pessoa.'

  const system = `
${systemPromptNamy(texto)}

${resumo}
`.trim()

  const mensagens = [
    { role: 'system', content: system },
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

async function comandoIA(ctx) {
  const acao = (ctx.args[0] || '').toLowerCase()
  const acoesControle = ['on', 'ligar', 'off', 'desligar', 'status', 'limpar', 'clear']

  if (acoesControle.includes(acao)) {
    const iaControle = require('./iaControle')
    return iaControle(ctx)
  }

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

    const jid = ctx.senderJid || ctx.from
    const historico = iaEstado.obterHistorico(ctx.from)
    const resposta = await perguntarIA(texto, historico, jid)

    if (!resposta) {
      return ctx.reply('🤔 Travou aqui... tenta de novo?')
    }

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