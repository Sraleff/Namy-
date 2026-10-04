const { execFile } = require('child_process')

function tem(cmd, args = ['-version']) {
    return new Promise((resolve) => {
        execFile(cmd, args, { timeout: 8000 }, (erro) => resolve(!erro))
    })
}

async function checar() {
    const ffmpeg = await tem('ffmpeg', ['-version'])
    const ytdlp = (await tem('yt-dlp', ['--version'])) || (await tem('yt-dlp', ['-v']))
    const edge = await tem('edge-tts', ['--help'])
    return { ffmpeg, ytdlp, edge }
}

async function imprimir() {
    const d = await checar()
    console.log('╭────────── dependências ──────────╮')
    console.log(`│ ffmpeg   ${d.ffmpeg ? 'ok' : 'AUSENTE  (!s / voz)'}`.padEnd(37) + '│')
    console.log(`│ yt-dlp   ${d.ytdlp ? 'ok' : 'AUSENTE  (!play)'}`.padEnd(37) + '│')
    console.log(`│ edge-tts ${d.edge ? 'ok' : 'AUSENTE  (voz)'}`.padEnd(37) + '│')
    console.log('╰──────────────────────────────────╯')
    if (!d.ffmpeg || !d.ytdlp) {
        console.log('👉 Instale com o script instalar-termux.sh (veja o hub da Namy 3.0).')
    }
}

module.exports = { checar, imprimir }
