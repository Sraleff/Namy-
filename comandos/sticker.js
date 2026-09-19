const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')
const { promisify } = require('util')
const { downloadMediaMessage } = require('@whiskeysockets/baileys')

const execFileAsync = promisify(execFile)
const tmpDir = path.join(__dirname, '..', 'tmp')

function garantirTmp() {
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
}

function limpar(...arquivos) {
    for (const a of arquivos) {
        try {
            if (a && fs.existsSync(a)) fs.unlinkSync(a)
        } catch (_) {}
    }
}

module.exports = async function sticker(ctx) {
    try {
        garantirTmp()

        const msg = ctx.info.message
        const quoted = msg?.extendedTextMessage?.contextInfo?.quotedMessage

        const temMidia =
            msg?.imageMessage ||
            msg?.videoMessage ||
            quoted?.imageMessage ||
            quoted?.videoMessage

        if (!temMidia) {
            return ctx.reply(
                '🎨 Marca uma *imagem/gif* e use *!s*\nOu envie a mídia com legenda *!s*'
            )
        }

        const mediaMsg = quoted
            ? {
                key: {
                    remoteJid: ctx.from,
                    id: msg.extendedTextMessage.contextInfo.stanzaId,
                    fromMe: false,
                    participant: msg.extendedTextMessage.contextInfo.participant
                },
                message: quoted
            }
            : ctx.info

        const buffer = await downloadMediaMessage(
            mediaMsg,
            'buffer',
            {},
            {
                logger: console,
                reuploadRequest: ctx.client.updateMediaMessage
            }
        )

        const id = Date.now()
        const entrada = path.join(tmpDir, `in_${id}`)
        const saida = path.join(tmpDir, `sticker_${id}.webp`)

        fs.writeFileSync(entrada, buffer)

        // converte pra sticker webp (512x512)
        await execFileAsync('ffmpeg', [
            '-y',
            '-i', entrada,
            '-vf', "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000",
            '-vcodec', 'libwebp',
            '-loop', '0',
            '-preset', 'default',
            '-an',
            '-vsync', '0',
            saida
        ], { timeout: 60000 })

        if (!fs.existsSync(saida)) {
            limpar(entrada, saida)
            return ctx.reply('❌ Não consegui gerar a figurinha.')
        }

        await ctx.client.sendMessage(
            ctx.from,
            { sticker: fs.readFileSync(saida) },
            { quoted: ctx.info }
        )

        limpar(entrada, saida)
    } catch (erro) {
        console.error('Erro no !s:', erro)
        await ctx.reply('❌ Falhou ao criar a figurinha. Manda uma imagem e tenta de novo.')
    }
}