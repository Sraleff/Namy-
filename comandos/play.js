const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')
const { promisify } = require('util')

const execFileAsync = promisify(execFile)
const tmpDir = path.join(__dirname, '..', 'tmp')

function garantirTmp() {
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
}

function limparArquivo(arquivo) {
    try {
        if (arquivo && fs.existsSync(arquivo)) fs.unlinkSync(arquivo)
    } catch (_) {}
}

module.exports = async function play(ctx) {
    const query = (ctx.texto || ctx.args.join(' ') || '').trim()

    if (!query) {
        return ctx.reply('🎧 Uso: *!play nome da música*\nEx: !play believer')
    }

    garantirTmp()

    const id = Date.now()
    const outTemplate = path.join(tmpDir, `play_${id}.%(ext)s`)

    try {
        await ctx.reply(`🔎 Procurando: *${query}*`)

        await execFileAsync('yt-dlp', [
            `ytsearch1:${query}`,
            '-x',
            '--audio-format', 'mp3',
            '--audio-quality', '128K',
            '-o', outTemplate,
            '--no-playlist',
            '--js-runtimes', 'node',
            '--no-warnings'
        ], {
            timeout: 180000,
            maxBuffer: 1024 * 1024 * 10
        })

        const arquivos = fs.readdirSync(tmpDir)
            .filter(f => f.startsWith(`play_${id}`))
            .map(f => path.join(tmpDir, f))

        if (!arquivos.length) {
            return ctx.reply('❌ Não encontrei essa música.')
        }

        const arquivo = arquivos[0]

        await ctx.client.sendMessage(ctx.from, {
            audio: fs.readFileSync(arquivo),
            mimetype: 'audio/mpeg',
            ptt: false
        }, { quoted: ctx.info })

        limparArquivo(arquivo)
    } catch (erro) {
        console.error('Erro no !play:', erro.message || erro)
        await ctx.reply('❌ Falhou ao baixar. Tenta outro nome.')
    }
}