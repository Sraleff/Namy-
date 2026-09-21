const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')
const { promisify } = require('util')

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

function limparTextoParaVoz(texto) {
    return String(texto || '')
        .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
        .replace(/[*_`\~]/g, '')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 400)
}

async function textoParaAudio(texto) {
    garantirTmp()

    const textoLimpo = limparTextoParaVoz(texto)
    if (!textoLimpo) return null

    const id = Date.now()
    const mp3 = path.join(tmpDir, `voz_${id}.mp3`)
    const ogg = path.join(tmpDir, `voz_${id}.ogg`)

    await execFileAsync('edge-tts', [
        '--voice', 'pt-BR-FranciscaNeural',
        '--rate', '+5%',
        '--pitch', '+2Hz',
        '--text', textoLimpo,
        '--write-media', mp3
    ], { timeout: 60000 })

    await execFileAsync('ffmpeg', [
        '-y',
        '-i', mp3,
        '-c:a', 'libopus',
        '-b:a', '64k',
        '-vbr', 'on',
        ogg
    ], { timeout: 60000 })

    const buffer = fs.readFileSync(ogg)
    limpar(mp3, ogg)
    return buffer
}

module.exports = {
    textoParaAudio,
    limparTextoParaVoz
}