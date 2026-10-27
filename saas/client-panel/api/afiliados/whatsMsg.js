/**
 * Ajudantes para ler mensagens do Baileys (texto, menções, resposta) e reconhecer o próprio
 * número da conta (inclusive pelo LID, que o WhatsApp usa em grupos novos).
 */
function desembrulhar(message) {
  let msg = message || {}
  for (let i = 0; i < 3; i++) {
    const dentro = (msg.ephemeralMessage && msg.ephemeralMessage.message) ||
      (msg.viewOnceMessage && msg.viewOnceMessage.message) ||
      (msg.viewOnceMessageV2 && msg.viewOnceMessageV2.message) ||
      (msg.documentWithCaptionMessage && msg.documentWithCaptionMessage.message)
    if (!dentro) break
    msg = dentro
  }
  return msg
}

function textoDe(msg) {
  return msg.conversation || (msg.extendedTextMessage && msg.extendedTextMessage.text) ||
    (msg.imageMessage && msg.imageMessage.caption) || (msg.videoMessage && msg.videoMessage.caption) || ''
}

/** contextInfo da mensagem (menções e mensagem citada), venha de texto, foto ou vídeo. */
function contextoDe(msg) {
  for (const k of ['extendedTextMessage', 'imageMessage', 'videoMessage', 'documentMessage']) {
    if (msg && msg[k] && msg[k].contextInfo) return msg[k].contextInfo
  }
  return null
}

/** "5511999:12@s.whatsapp.net" -> "5511999"; "123:4@lid" -> "123". */
const base = (jid) => String(jid || '').split('@')[0].split(':')[0]

/** Identidades do número conectado (telefone e LID). */
function proprios(sock) {
  const u = (sock && sock.user) || {}
  return [base(u.id), base(u.lid)].filter(Boolean)
}

const ehProprio = (sock, jid) => { const b = base(jid); return !!b && proprios(sock).includes(b) }

/** Chat "Mensagem para você mesmo": a conversa do número com ele mesmo. */
const chatProprio = (sock, jid) => !String(jid || '').endsWith('@g.us') && ehProprio(sock, jid)

module.exports = { desembrulhar, textoDe, contextoDe, base, proprios, ehProprio, chatProprio }
