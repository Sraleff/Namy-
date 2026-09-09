const config = require('../config')
const iaEstado = require('../funcoes/ia')

/**
 * Extrai somente o número de um JID.
 */
function extrairNumero(jid) {
  if (!jid) return ''
  const texto = String(jid)
  if (texto.endsWith('@lid')) return ''
  return texto.split('@')[0].replace(/\D/g, '')
}

/**
 * Verifica se o remetente é um dos donos cadastrados.
 */
function ehDono(ctx) {
  const donos = (config.owners || [])
    .map(extrairNumero)
    .filter(Boolean)

  const key = ctx.info?.key || {}

  const candidatos = [
    key.participant,
    key.participantAlt,
    key.remoteJidAlt,
    key.senderPn,
    ctx.info?.participantAlt,
    ctx.info?.remoteJidAlt,
    ctx.info?.senderPn,
    ctx.senderJid
  ]

  const numerosEncontrados = candidatos
    .map(extrairNumero)
    .filter(Boolean)

  return numerosEncontrados.some(numero => donos.includes(numero))
}

module.exports = async function iaControle(ctx) {
  if (!ehDono(ctx)) {
    return ctx.reply('🚫 Só os donos da Namy podem controlar a IA automática.')
  }

  const acao = (ctx.args[0] || '').toLowerCase()

  // ─── LIGAR ─────────────────────────────────────────────
  if (acao === 'on' || acao === 'ligar') {
    iaEstado.ativar(ctx.from)
    return ctx.reply(
      '🤖✨ *IA automática ativada!*\n\n' +
      'Agora a Namy participa sozinha das conversas neste chat.\n' +
      'Use `!ia off` para desligar.'
    )
  }

  // ─── DESLIGAR ──────────────────────────────────────────
  if (acao === 'off' || acao === 'desligar') {
    iaEstado.desativar(ctx.from)
    return ctx.reply('🔕 IA automática desativada neste chat.')
  }

  // ─── STATUS ────────────────────────────────────────────
  if (acao === 'status') {
    const ativa = iaEstado.estaAtiva(ctx.from)
    return ctx.reply(
      ativa
        ? '🤖 IA automática está *ATIVA* neste chat.'
        : '🔕 IA automática está *DESATIVADA* neste chat.'
    )
  }

  // ─── LIMPAR MEMÓRIA ────────────────────────────────────
  if (acao === 'limpar' || acao === 'clear') {
    iaEstado.limparHistorico(ctx.from)
    return ctx.reply('🧹 Memória da conversa apagada. Começamos do zero!')
  }

  // ─── AJUDA ─────────────────────────────────────────────
  return ctx.reply(
    '🤖 *Controle da IA da Namy*\n\n' +
    '`!ia on` → ligar IA automática\n' +
    '`!ia off` → desligar\n' +
    '`!ia status` → ver status\n' +
    '`!ia limpar` → apagar memória\n\n' +
    'Ou só digite `!ia sua pergunta` para conversar.'
  )
}
