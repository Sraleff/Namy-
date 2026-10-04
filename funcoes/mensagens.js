function obterTipoMensagem(message) {
    if (!message) return null
    const tipos = Object.keys(message)

    if (tipos[0] === 'senderKeyDistributionMessage' && tipos[1] === 'messageContextInfo') {
        return tipos[2] || null
    }
    if (tipos[0] === 'senderKeyDistributionMessage') {
        return tipos[1] || null
    }
    return tipos[0]
}

function obterBody(info) {
    const message = info?.message
    if (!message) return ''
    const type = obterTipoMensagem(message)

    switch (type) {
        case 'conversation':
            return message.conversation || ''
        case 'extendedTextMessage':
            return message.extendedTextMessage?.text || ''
        case 'imageMessage':
            return message.imageMessage?.caption || ''
        case 'videoMessage':
            return message.videoMessage?.caption || ''
        case 'buttonsResponseMessage':
            return message.buttonsResponseMessage?.selectedButtonId || ''
        case 'listResponseMessage':
            return message.listResponseMessage?.singleSelectReply?.selectedRowId || ''
        case 'templateButtonReplyMessage':
            return message.templateButtonReplyMessage?.selectedId || ''
        case 'messageContextInfo':
            return (
                message.buttonsResponseMessage?.selectedButtonId ||
                message.listResponseMessage?.singleSelectReply?.selectedRowId ||
                message.extendedTextMessage?.text ||
                ''
            )
        default:
            return ''
    }
}

function obterNomeRemetente(info) {
    const pushName = info.pushName || info.verifiedBizName
    if (pushName && String(pushName).trim()) return String(pushName).trim()
    const jid = info.key?.participant || info.key?.remoteJid || ''
    return jid.split('@')[0] || 'amigo(a)'
}

function obterContextInfo(info) {
    const msg = info?.message || {}
    return (
        msg.extendedTextMessage?.contextInfo ||
        msg.imageMessage?.contextInfo ||
        msg.videoMessage?.contextInfo ||
        msg.conversation?.contextInfo ||
        {}
    )
}

function criarContexto({ client, info, prefix, esperar }) {
    const from = info.key.remoteJid
    const body = obterBody(info).trim()
    const isCmd = body.startsWith(prefix)
    const partes = isCmd
        ? body.slice(prefix.length).trim().split(/\s+/).filter(Boolean)
        : []
    const comando = (partes.shift() || '').toLowerCase()
    const args = partes
    const texto = args.join(' ')
    const isGroup = from.endsWith('@g.us')
    const senderName = obterNomeRemetente(info)
    const senderJid = info.key.participant || from
    const contextInfo = obterContextInfo(info)
    const mentionedJid = contextInfo.mentionedJid || []
    const quotedParticipant = contextInfo.participant || null
    const quotedMessage = contextInfo.quotedMessage || null

    const reply = async (textoResposta) => {
        return client.sendMessage(
            from,
            { text: String(textoResposta) },
            { quoted: info }
        )
    }

    const escrever = async (textoResposta) => {
        try {
            await client.sendPresenceUpdate('composing', from)
        } catch (_) {}
        await new Promise((resolve) => setTimeout(resolve, esperar))
        return reply(textoResposta)
    }

    return {
        client,
        info,
        from,
        body,
        prefix,
        isCmd,
        comando,
        args,
        texto,
        isGroup,
        senderName,
        senderJid,
        participant: senderJid,
        mentionedJid,
        quotedParticipant,
        quotedMessage,
        contextInfo,
        reply,
        escrever
    }
}

module.exports = {
    criarContexto,
    obterBody,
    obterTipoMensagem,
    obterNomeRemetente,
    obterContextInfo
}
