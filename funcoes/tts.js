const fs = require('fs')
const path = require('path')
const axios = require('axios')
const { execFile } = require('child_process')
const { promisify } = require('util')
const config = require('../config')

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

async function mp3ParaOgg(mp3Path) {
  const oggPath = mp3Path.replace(/\.mp3$/i, '.ogg')
  await execFileAsync('ffmpeg', [
    '-y',
    '-i', mp3Path,
    '-c:a', 'libopus',
    '-b:a', '64k',
    '-vbr', 'on',
    oggPath
  ], { timeout: 60000 })
  return oggPath
}

// =========================
// MOTOR 1: NORMAL (edge-tts)
// =========================
async function ttsNormal(texto) {
  garantirTmp()
  const textoLimpo = limparTextoParaVoz(texto)
  if (!textoLimpo) return null

  const id = Date.now()
  const mp3 = path.join(tmpDir, `voz_normal_${id}.mp3`)

  await execFileAsync('edge-tts', [
    '--voice', 'pt-BR-FranciscaNeural',
    '--rate', '+5%',
    '--pitch', '+2Hz',
    '--text', textoLimpo,
    '--write-media', mp3
  ], { timeout: 60000 })

  const ogg = await mp3ParaOgg(mp3)
  const buffer = fs.readFileSync(ogg)
  limpar(mp3, ogg)
  return buffer
}

// =========================
// MOTOR 2: GROK (xAI TTS)
// =========================
async function ttsGrok(texto) {
  garantirTmp()
  const textoLimpo = limparTextoParaVoz(texto)
  if (!textoLimpo) return null

  // 1) tenta voz oficial xAI
  if (config.xaiApiKey) {
    try {
      const response = await axios.post(
        'https://api.x.ai/v1/tts',
        {
          text: textoLimpo,
          voice_id: 'ara',   // feminina
          language: 'pt-BR'
        },
        {
          headers: {
            Authorization: `Bearer ${config.xaiApiKey}`,
            'Content-Type': 'application/json'
          },
          responseType: 'arraybuffer',
          timeout: 60000
        }
      )

      // se veio JSON de erro, cai no fallback
      const head = Buffer.from(response.data).slice(0, 20).toString('utf8')
      if (!head.includes('{')) {
        const id = Date.now()
        const mp3 = path.join(tmpDir, `voz_grok_${id}.mp3`)
        fs.writeFileSync(mp3, Buffer.from(response.data))
        const ogg = await mp3ParaOgg(mp3)
        const buffer = fs.readFileSync(ogg)
        limpar(mp3, ogg)
        return buffer
      }
    } catch (e) {
      console.error('TTS xAI falhou, usando fallback:', e.message)
    }
  }

  // 2) fallback: edge-tts com “voz diferente” pro modo grok
  const id = Date.now()
  const mp3 = path.join(tmpDir, `voz_grok_fb_${id}.mp3`)

  await execFileAsync('edge-tts', [
    '--voice', 'pt-BR-FranciscaNeural',
    '--rate', '+3%',
    '--pitch', '+1Hz',
    '--text', textoLimpo,
    '--write-media', mp3
  ], { timeout: 60000 })

  const ogg = await mp3ParaOgg(mp3)
  const buffer = fs.readFileSync(ogg)
  limpar(mp3, ogg)
  return buffer
}

// =========================
// ENTRADA PRINCIPAL
// =========================
async function textoParaAudio(texto, modo = 'groq') {
  if (modo === 'grok') return ttsGrok(texto)
  return ttsNormal(texto)
}

module.exports = {
  textoParaAudio
}