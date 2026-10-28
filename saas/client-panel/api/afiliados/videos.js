/**
 * Baixar vídeo de produto (Shopee e Pinterest) a partir do link público.
 * Lê só a página pública (sem login, sem cookie, sem programa externo), acha o MP4 e repassa
 * o arquivo para quem pediu. Nada é gravado em disco.
 *
 * Segurança: o navegador nunca manda o endereço do vídeo. /videos/info devolve um id de uso
 * curto, amarrado ao userId; /videos/baixar só aceita esse id e só busca nos domínios de vídeo
 * da plataforma (sem redirecionamento para fora, sem host interno).
 */
const crypto = require('crypto')
const { Readable } = require('stream')
const links = require('./links')

const PLATAFORMAS = {
  shopee: { rotulo: 'Shopee', paginas: ['sv.shopee.com.br', 'shp.ee', 'shopee.com.br'], videos: ['susercontent.com'] },
  pinterest: { rotulo: 'Pinterest', paginas: ['pinterest.com', 'pinterest.com.br', 'pin.it'], videos: ['pinimg.com'] }
}
const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36'
const MAX_HTML = 3 * 1024 * 1024
const MAX_VIDEO = 200 * 1024 * 1024
const ID_TTL = 10 * 60 * 1000
const ID_RE = /^[0-9a-f]{24}$/

const pendentes = new Map() // id -> { userId, plataforma, video, nome, exp }
const _dep = { buscar: links.buscarSeguro } // trocado nos testes

function erro(msg, status = 400) {
  return Object.assign(new Error(msg), { status })
}

const hostDe = (url) => {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' ? u.hostname.toLowerCase().replace(/^www\./, '') : ''
  } catch { return '' }
}
// br.pinterest.com, pt.pinterest.com etc. contam como pinterest.com
const casa = (host, lista) => lista.some((h) => host === h || host.endsWith('.' + h))

function detectar(url) {
  const host = hostDe(String(url || '').trim())
  if (!host) return null
  for (const [id, p] of Object.entries(PLATAFORMAS)) if (casa(host, p.paginas)) return id
  return null
}

const limpar = (s) => String(s || '').replace(/\\u002F/gi, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&')
const meta = (html, prop) => {
  const m = html.match(new RegExp('<meta[^>]+(?:property|name)=["\']' + prop.replace(/:/g, '\\:') + '["\'][^>]*content=["\']([^"\']+)["\']', 'i')) ||
    html.match(new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]*(?:property|name)=["\']' + prop.replace(/:/g, '\\:') + '["\']', 'i'))
  return m ? limpar(m[1]).trim() : ''
}
const decodificar = (s) => s.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')

/** Acha o MP4 no HTML público. Só aceita endereço nos domínios de vídeo da plataforma. */
function videoDoHtml(plataforma, html) {
  const p = PLATAFORMAS[plataforma]
  const texto = limpar(html)
  const candidatos = [meta(texto, 'og:video:secure_url'), meta(texto, 'og:video:url'), meta(texto, 'og:video')]
    .concat(texto.match(/https:\/\/[^"'<>\s]+?\.mp4(?:\?[^"'<>\s]*)?/gi) || [])
    .filter((u) => /\.mp4(\?|$)/i.test(u) && casa(hostDe(u), p.videos))
  if (!candidatos.length) return null
  // Pinterest publica várias qualidades: prefere 720p, depois a primeira
  const melhor = candidatos.find((u) => /720p|V_720P/i.test(u)) || candidatos[0]
  const titulo = decodificar(meta(texto, 'og:title') || meta(texto, 'twitter:title')).replace(/\s+/g, ' ').slice(0, 140)
  const capa = meta(texto, 'og:image')
  return { video: melhor, titulo, capa: /^https:\/\//.test(capa) ? capa.slice(0, 600) : '' }
}

async function lerTexto(response, max) {
  const leitor = response.body && response.body.getReader ? response.body.getReader() : null
  if (!leitor) return String(await response.text()).slice(0, max)
  const partes = []
  let total = 0
  for (;;) {
    const { done, value } = await leitor.read()
    if (done) break
    total += value.length
    if (total > max) { try { await leitor.cancel() } catch {} ; break }
    partes.push(Buffer.from(value))
  }
  return Buffer.concat(partes).toString('utf8')
}

/** Lê a página pública do link e guarda um id de uso único para o download. */
async function info(userId, url, agora = Date.now()) {
  const link = String(url || '').trim()
  const plataforma = detectar(link)
  if (!plataforma) throw erro('Cole um link de vídeo da Shopee ou do Pinterest.')
  const p = PLATAFORMAS[plataforma]
  const out = await _dep.buscar(link, { hostsPermitidos: p.paginas, timeoutMs: 10000, headers: { 'User-Agent': UA, Accept: 'text/html' } })
  if (out.status === 404 || out.status === 410) throw erro('Esse vídeo não existe mais ou é privado.', 404)
  if (out.status >= 400) throw erro('A ' + p.rotulo + ' não abriu o link agora (erro ' + out.status + '). Tente de novo em instantes.', 502)
  const achado = videoDoHtml(plataforma, await lerTexto(out.response, MAX_HTML))
  if (!achado) throw erro('Não achei um vídeo nessa página. Confira se o link é de um vídeo público da ' + p.rotulo + '.', 422)
  for (const [k, v] of pendentes) if (v.exp < agora) pendentes.delete(k)
  if (pendentes.size > 5000) throw erro('Muitos pedidos ao mesmo tempo. Tente em instantes.', 429)
  const id = crypto.randomBytes(12).toString('hex')
  const nome = 'namy-' + plataforma + '-' + id.slice(0, 8) + '.mp4'
  pendentes.set(id, { userId, plataforma, video: achado.video, nome, exp: agora + ID_TTL })
  return { id, plataforma, rotulo: p.rotulo, titulo: achado.titulo, capa: achado.capa, nome }
}

/** Busca o MP4 do id (só do próprio usuário) e devolve { nome, tamanho, tipo, stream }. */
async function abrir(userId, id, agora = Date.now()) {
  if (!ID_RE.test(String(id || ''))) throw erro('Pedido de download inválido.')
  const item = pendentes.get(id)
  if (!item || item.userId !== userId) throw erro('Esse download não é seu ou já expirou. Cole o link de novo.', 404)
  if (item.exp < agora) { pendentes.delete(id); throw erro('O download expirou. Cole o link de novo.', 410) }
  const p = PLATAFORMAS[item.plataforma]
  const out = await _dep.buscar(item.video, { hostsPermitidos: p.videos, timeoutMs: 20000, headers: { 'User-Agent': UA, Accept: 'video/*' } })
  if (out.status >= 400) throw erro('A ' + p.rotulo + ' não entregou o vídeo agora (erro ' + out.status + ').', 502)
  const tipo = String(out.response.headers.get('content-type') || '')
  if (!/^video\//i.test(tipo) && !/octet-stream/i.test(tipo)) throw erro('O endereço não devolveu um vídeo.', 502)
  const tamanho = Number(out.response.headers.get('content-length')) || 0
  if (tamanho > MAX_VIDEO) throw erro('Vídeo grande demais (acima de 200 MB).', 413)
  pendentes.delete(id) // uso único
  return { nome: item.nome, plataforma: item.plataforma, tamanho, tipo: /^video\//i.test(tipo) ? tipo : 'video/mp4', stream: Readable.fromWeb(out.response.body) }
}

module.exports = { PLATAFORMAS, detectar, videoDoHtml, info, abrir, MAX_VIDEO, _dep, _pendentes: pendentes }
