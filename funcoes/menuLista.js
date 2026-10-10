// Envia uma lista interativa (single_select) estilo "MENU - CATEGORIAS".
// Esse formato não é oficial no WhatsApp: pode não aparecer em alguns aparelhos/versões.
// Por isso quem chama sempre tem um fallback em texto.
const {
    generateWAMessageFromContent,
    prepareWAMessageMedia
} = require('@whiskeysockets/baileys')

async function cabecalho(client, titulo, imagem) {
    if (!imagem) return { title: titulo, hasMediaAttachment: false }
    try {
        const media = await prepareWAMessageMedia(
            { image: { url: imagem } },
            { upload: client.waUploadToServer }
        )
        return { title: titulo, hasMediaAttachment: true, imageMessage: media.imageMessage }
    } catch (_) {
        return { title: titulo, hasMediaAttachment: false }
    }
}

async function enviarLista(client, jid, { texto, rodape, titulo, botao, secoes, imagem, quoted }) {
    const interactiveMessage = {
        body: { text: texto },
        footer: { text: rodape || '' },
        header: await cabecalho(client, titulo || '', imagem),
        nativeFlowMessage: {
            buttons: [{
                name: 'single_select',
                buttonParamsJson: JSON.stringify({ title: botao || 'Selecionar', sections: secoes })
            }]
        }
    }

    const msg = generateWAMessageFromContent(jid, {
        viewOnceMessage: {
            message: {
                messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                interactiveMessage
            }
        }
    }, { userJid: client.user?.id, quoted })

    await client.relayMessage(jid, msg.message, { messageId: msg.key.id })
}

// Lê o id escolhido na lista. O id vira texto comum e passa pelas mesmas permissões de um comando digitado.
function lerResposta(message) {
    const r = message?.interactiveResponseMessage?.nativeFlowResponseMessage
    if (!r?.paramsJson) return ''
    try {
        const id = JSON.parse(r.paramsJson)?.id
        return typeof id === 'string' ? id.slice(0, 200) : ''
    } catch {
        return ''
    }
}

module.exports = { enviarLista, lerResposta }
