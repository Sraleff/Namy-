/**
 * Provedor de imagem: Gemini (edicao com foto de referencia).
 * .env do client-panel: GEMINI_API_KEY, NAMY_IMAGE_MODEL (padrao gemini-2.5-flash-image).
 * Interface: gerar({ referencia: {buffer, mime}, prompt }) -> { buffer, mime }
 * Trocar de provedor = outro arquivo com a mesma interface.
 */
function config() {
  return {
    chave: String(process.env.GEMINI_API_KEY || '').trim(),
    modelo: String(process.env.NAMY_IMAGE_MODEL || 'gemini-2.5-flash-image').trim().replace(/[^a-zA-Z0-9._-]/g, '')
  }
}

function disponivel() {
  return !!config().chave
}

function erroImg(msg, status) {
  const e = new Error(msg)
  e.status = status || 502
  e.code = 'IMAGEM'
  return e
}

async function gerar({ referencia, prompt }) {
  const { chave, modelo } = config()
  if (!chave) throw erroImg('Gerador de imagens desligado: defina GEMINI_API_KEY no .env do client-panel.', 503)
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelo + ':generateContent'
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 90000)
  let r
  try {
    r = await fetch(url, {
      method: 'POST',
      signal: ctrl.signal,
      // chave no header, nao na URL (URL costuma parar em log de erro)
      headers: { 'x-goog-api-key': chave, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: referencia.mime, data: referencia.buffer.toString('base64') } }
          ]
        }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
      })
    })
  } catch (e) {
    throw erroImg(e.name === 'AbortError' ? 'O gerador demorou demais. Tente de novo.' : 'Nao consegui falar com o gerador de imagens.')
  } finally {
    clearTimeout(t)
  }
  const data = await r.json().catch(() => ({}))
  if (r.status === 429) throw erroImg('Limite do gerador de imagens atingido. Tente mais tarde.', 429)
  if (r.status === 401 || r.status === 403) throw erroImg('Chave do gerador de imagens recusada.', 503)
  if (!r.ok) throw erroImg('Gerador respondeu ' + r.status + ((data.error && data.error.message) ? ': ' + String(data.error.message).slice(0, 120) : ''))
  const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || []
  const img = parts.map((p) => p.inlineData || p.inline_data).find((d) => d && d.data)
  if (!img) {
    const bloqueio = data.promptFeedback && data.promptFeedback.blockReason
    throw erroImg(bloqueio ? 'O gerador recusou esta imagem (' + bloqueio + ').' : 'O gerador nao devolveu imagem.', 422)
  }
  return { buffer: Buffer.from(img.data, 'base64'), mime: img.mimeType || img.mime_type || 'image/png' }
}

module.exports = { gerar, disponivel, config }
