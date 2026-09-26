const axios = require('axios')
const config = require('../config')
const iaEstado = require('../funcoes/ia')
const { systemPromptNamy } = require('../funcoes/autonomia')
const memoria = require('../funcoes/memoria')

function capturarMemoria(jid, texto) {
  if (!jid || !texto) return

  // nome / apelido
  const nomeMatch = texto.match(
    /(?:meu nome [eé]|me chamo|eu sou(?: a| o)?|pode me chamar de)\s+([A-Za-zÀ-ÿ]{2,20})/i
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

  // interesse / curto...
  const interesseMatch = texto.match(/(?:me interesso por|curto)\s+(.+)/i)
  if (interesseMatch) {
    const atual = memoria.pegar(jid)
    const item = interesseMatch[1].trim().replace(/[!.?]+$/, '')
    const lista = Array.isArray(atual.interesses) ? [...atual.interesses] : []
    if (item && !lista.includes(item)) lista.push(item)
    memoria.atualizar(jid, { interesses: lista.slice(-10) })
  }
}

async function perguntarIA(texto, historico = [], jid = null, chatId = null, extras = {}) {
  const modo = chatId ? iaEstado.obterModo(chatId) : 'groq'
  const usarGrok = modo === 'grok'

  const apiKey = usarGrok ? config.xaiApiKey : config.groqApiKey
  const url = usarGrok
    ? 'https://api.x.ai/v1/chat/completions'
    : 'https://api.groq.com/openai/v1/chat/completions'
  const model = usarGrok
    ? (config.iaModelXai || 'grok-4.6')
    : (config.iaModelGroq || 'openai/gpt-oss-20b')

  if (!apiKey) {
    throw new Error(
      usarGrok
        ? 'XAI_API_KEY não configurada no .env'
        : 'GROQ_API_KEY não configurada no .env'
    )
  }

  // salva memória da pessoa
  if (jid) capturarMemoria(jid, texto)

  const historicoLimpo = historico
    .filter(m => m && m.role && m.content)
    .slice(-(config.maxHistorico || 12))

  // memória individual
  const dadosPessoa = jid ? memoria.pegar(jid) : {}
  const resumo = extras.memoriaTxt || (jid
    ? memoria.resumoMemoria(jid)
    : 'Ainda não há memória salva desta pessoa.')

  const nomePessoa =
    extras.nomePessoa ||
    dadosPessoa.nome ||
    'desconhecido'

  const system = systemPromptNamy(texto, {
    nomePessoa,
    memoria: resumo,
    contextoGrupo: extras.contextoGrupo || ''
  })

  const mensagens = [
    { role: 'system', content: system },
    ...historicoLimpo,
    { role: 'user', content: texto }
  ]

  const resposta = await axios.post(
    url,
    {
      model,
      messages: mensagens,
      temperature: 0.9,
      max_tokens: 600
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 35000
    }
  )

  return resposta.data.choices?.[0]?.message?.content?.trim() || null
}

async function comandoIA(ctx) {
  const acao = (ctx.args[0] || '').toLowerCase()
  const acoesControle = [
    'on', 'ligar', 'off', 'desligar',
    'status', 'limpar', 'clear', 'modo'
  ]

  if (acoesControle.includes(acao)) {
    if (acao === 'modo') {
      const qual = (ctx.args[1] || '').toLowerCase()
      const atual = iaEstado.obterModo(ctx.from)

      if (!qual) {
        return ctx.reply(
          `🧠 Modo atual: *${atual === 'grok' ? 'Namy Grok' : 'Namy normal'}*\n\n` +
          `Use:\n• !ia modo grok\n• !ia modo normal`
        )
      }

      if (qual === 'grok') {
        iaEstado.definirModo(ctx.from, 'grok')
        return ctx.reply('🚀 Modo *Namy Grok* ativado.')
      }

      if (qual === 'normal' || qual === 'groq') {
        iaEstado.definirModo(ctx.from, 'groq')
        return ctx.reply('🌸 Modo *Namy normal* ativado.')
      }

      return ctx.reply('Usa: !ia modo grok | !ia modo normal')
    }

    const iaControle = require('./iaControle')
    return iaControle(ctx)
  }

  const texto = ctx.args.join(' ').trim()

  if (!texto) {
    return ctx.reply(
      '🤖 *Como usar a IA da Namy*\n\n' +
      '• `!ia oi tudo bem?` → conversar\n' +
      '• `!ia on` → ligar IA automática\n' +
      '• `!ia off` → desligar\n' +
      '• `!ia modo grok` → usar Grok (xAI)\n' +
      '• `!ia modo normal` → usar Groq\n' +
      '• `!ia status` → ver status\n' +
      '• `!ia limpar` → apagar histórico'
    )
  }

  try {
    await ctx.client.sendPresenceUpdate('composing', ctx.from).catch(() => {})

    const jid = ctx.senderJid || ctx.participant || ctx.from
    const isGroup = ctx.from.endsWith('@g.us')
    const chaveHistorico = isGroup ? `\( {ctx.from}: \){jid}` : ctx.from

    const historico = iaEstado.obterHistorico(chaveHistorico)

    // contexto do grupo (se existir)
    let contextoGrupo = ''
    if (isGroup) {
      const histGrupo = iaEstado.obterHistorico(`grupo:${ctx.from}`).slice(-8)
      contextoGrupo = histGrupo
        .map(m => m.content)
        .join('\n')
    }

    const dadosPessoa = memoria.pegar(jid)
    const resposta = await perguntarIA(texto, historico, jid, ctx.from, {
      nomePessoa: dadosPessoa.nome || 'desconhecido',
      memoriaTxt: memoria.resumoMemoria(jid),
      contextoGrupo
    })

    if (!resposta) {
      return ctx.reply('🤔 Travou aqui... tenta de novo?')
    }

    const max = config.maxHistorico || 12
    iaEstado.adicionarMensagem(chaveHistorico, 'user', texto, max)
    iaEstado.adicionarMensagem(chaveHistorico, 'assistant', resposta, max)

    // salva no contexto do grupo
    if (isGroup) {
      const nome = dadosPessoa.nome || 'Alguém'
      iaEstado.adicionarMensagem(`grupo:\( {ctx.from}`, 'user', ` \){nome}: ${texto}`, 16)
      iaEstado.adicionarMensagem(`grupo:${ctx.from}`, 'assistant', `Namy: ${resposta}`, 16)
    }

    await ctx.reply(resposta)
  } catch (erro) {
    console.error('Erro na IA:', erro.response?.data || erro.message)

    const msg = erro.response?.data?.error?.message || erro.message || ''

    if (msg.includes('rate_limit') || msg.includes('429')) {
      return ctx.reply('⏳ Muitas mensagens. Espera um pouco e tenta de novo.')
    }

    if (msg.includes('XAI_API_KEY') || msg.includes('GROQ_API_KEY')) {
      return ctx.reply('❌ Chave da IA não configurada no `.env`.')
    }

    await ctx.reply('❌ Deu ruim na conexão com a IA. Tenta de novo daqui a pouco.')
  }
}

module.exports = comandoIA
module.exports.perguntarIA = perguntarIA