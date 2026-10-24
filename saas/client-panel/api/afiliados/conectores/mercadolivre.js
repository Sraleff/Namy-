/**
 * Mercado Livre — capacidade 2: link de afiliado pela etiqueta do cliente.
 * Nao usa cookie nem sessao de navegador. Monta o link do produto com os
 * parametros de rastreio do programa de afiliados:
 *   matt_word = etiqueta do cliente   matt_tool = ID da ferramenta (copiado
 *   de um link gerado uma vez no painel de afiliados).
 * Se o OAuth estiver conectado, confere na API se o anuncio existe e esta ativo.
 */
const links = require('../links')
const oauth = require('../mercadolivreOAuth')

const ETIQUETA_RE = /^[A-Za-z0-9_-]{2,60}$/
const TOOL_RE = /^\d{3,20}$/
const RASTREIO = ['matt_word', 'matt_tool', 'matt_source', 'matt_campaign', 'matt_ad_type', 'matt_d2id', 'forceInApp', 'ref', 'tracking_id', 'reco_id']

function ml(ctx) {
  const m = (ctx.cfg && ctx.cfg.mercadolivre) || {}
  return { etiqueta: String(m.etiqueta || '').trim(), toolId: String(m.toolId || '').trim() }
}

function configurado(ctx) {
  const m = ml(ctx)
  if (!m.etiqueta) return { ok: false, motivo: 'salve sua etiqueta de afiliado do Mercado Livre' }
  if (!ETIQUETA_RE.test(m.etiqueta)) return { ok: false, motivo: 'etiqueta do Mercado Livre invalida' }
  if (!TOOL_RE.test(m.toolId)) return { ok: false, motivo: 'salve o ID da ferramenta (matt_tool) do Mercado Livre' }
  return { ok: true, motivo: '' }
}

// MLB-123456789 (anuncio) ou /p/MLB123 (catalogo)
function idDe(url) {
  let u
  try { u = new URL(url) } catch { return null }
  const cat = u.pathname.match(/\/p\/(MLB\d{5,})/i)
  if (cat) return { tipo: 'produto', id: cat[1].toUpperCase() }
  const item = (u.pathname + ' ' + (u.searchParams.get('item_id') || '')).match(/MLB-?(\d{5,})/i)
  if (item) return { tipo: 'item', id: 'MLB' + item[1] }
  return null
}

// ---- Link curto da pagina social (meli.la -> /social/<afiliado>?ref=...) ----
// O link gerado no portal de afiliados nao leva ao produto: leva ao perfil do afiliado
// e o produto em destaque vai num parametro ref= opaco. A propria pagina mostra o
// produto (og:title + primeiro card), entao lemos o HTML publico, sem cookie nem login.
const HOSTS_ML = ['mercadolivre.com.br', 'mercadolivre.com']
const UA_PAGINA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36'
const PAGINA_MAX_BYTES = 2 * 1024 * 1024
const cachePagina = new Map() // url social -> { alvo, ate }
const CACHE_TTL = 6 * 3600 * 1000

function ehPaginaSocial(url) {
  try { return /^\/social\/[^/]+/.test(new URL(url).pathname) } catch { return false }
}

function decodeHtml(s) {
  return String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

// Devolve a URL do produto em destaque (sem rastreio de ninguem) ou null.
// So vale o card cujo titulo e o do destaque: os demais cards sao "relacionados".
function produtoDoHtml(html) {
  const og = String(html || '').match(/<meta property="og:title" content="([^"]+)"/)
  if (!og) return null
  const destaque = decodeHtml(og[1]).trim()
  const re = /<a href="([^"]+)"[^>]*class="poly-component__title"[^>]*>([^<]*)</g
  let m
  while ((m = re.exec(html))) {
    if (decodeHtml(m[2]).trim() !== destaque) continue
    try {
      const href = new URL(decodeHtml(m[1]))
      // o card aponta para um wrapper (ddnf.adj.st/webview/?url=<permalink>)
      const real = new URL(href.searchParams.get('url') || href.toString())
      if (links.marketplaceDe(real.toString()) === 'mercadolivre' && idDe(real.toString())) return real.origin + real.pathname
    } catch { /* tenta o proximo / o fallback */ }
  }
  // Fallback: id do destaque no estado da pagina (event_data da pagina de perfil)
  const ev = String(html).match(/"affiliates_event":\{[^{}]*"event_data":\{[^{}]*?"item_id":"(MLB\d{5,})"/)
  if (ev) {
    const digitos = ev[1].slice(3)
    return digitos.length <= 9 ? 'https://www.mercadolivre.com.br/p/' + ev[1] : 'https://produto.mercadolivre.com.br/MLB-' + digitos
  }
  return null
}

async function lerTexto(response, max) {
  const reader = response.body.getReader()
  const dec = new TextDecoder()
  let out = ''
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    out += dec.decode(value, { stream: true })
    if (total > max) { try { await reader.cancel() } catch { /* ja fechou */ } break }
  }
  return out
}

async function produtoDaPaginaSocial(urlSocial) {
  const hit = cachePagina.get(urlSocial)
  if (hit && hit.ate > Date.now()) return hit.alvo
  const out = await links.buscarSeguro(urlSocial, {
    method: 'GET', hostsPermitidos: HOSTS_ML, saltos: 3, timeoutMs: 10000,
    headers: { 'User-Agent': UA_PAGINA, Accept: 'text/html', 'Accept-Language': 'pt-BR,pt;q=0.9' }
  })
  if (out.status !== 200) {
    try { if (out.response.body) await out.response.body.cancel() } catch { /* ok */ }
    throw links.erroLink('Pagina do Mercado Livre respondeu ' + out.status, out.status >= 500 || out.status === 429)
  }
  let timer
  const html = await Promise.race([
    lerTexto(out.response, PAGINA_MAX_BYTES),
    new Promise((_, rej) => { timer = setTimeout(() => rej(links.erroLink('Tempo esgotado ao ler a pagina do Mercado Livre', true)), 12000) })
  ]).finally(() => clearTimeout(timer))
  const alvo = produtoDoHtml(html)
  if (!alvo) throw links.erroLink('Link Mercado Livre abre uma pagina de perfil e nao deu para identificar o produto')
  if (cachePagina.size > 500) cachePagina.delete(cachePagina.keys().next().value)
  cachePagina.set(urlSocial, { alvo, ate: Date.now() + CACHE_TTL })
  return alvo
}

async function converter(url, ctx) {
  let final = await links.resolver(url)
  if (links.marketplaceDe(final) !== 'mercadolivre') throw links.erroLink('Link curto nao levou para o Mercado Livre')
  if (!idDe(final) && ehPaginaSocial(final)) final = await produtoDaPaginaSocial(final)
  let u
  try { u = new URL(final) } catch { throw links.erroLink('Link Mercado Livre invalido') }
  if (!idDe(final)) throw links.erroLink('Link Mercado Livre sem produto (MLB)')
  const m = ml(ctx)
  const limpo = new URL(u.origin + u.pathname)
  for (const [k, v] of u.searchParams) {
    if (!RASTREIO.includes(k) && !/^(utm_|matt_)/.test(k)) limpo.searchParams.set(k, v)
  }
  limpo.hash = ''
  limpo.searchParams.set('matt_word', m.etiqueta)
  limpo.searchParams.set('matt_tool', m.toolId)
  return limpo.toString()
}

async function validar(url, ctx) {
  const f = links.validarFormato(url, 'mercadolivre')
  if (!f.ok) return f
  let u
  try { u = new URL(url) } catch { return { ok: false, motivo: 'link invalido' } }
  const m = ml(ctx)
  if (u.searchParams.get('matt_word') !== m.etiqueta) return { ok: false, motivo: 'etiqueta do link nao e a sua' }
  if (u.searchParams.get('matt_tool') !== m.toolId) return { ok: false, motivo: 'matt_tool do link nao e o seu' }
  const alvo = idDe(url)
  if (!alvo) return { ok: false, motivo: 'link sem produto MLB' }
  if (!ctx.dataDir || !ctx.userId || !oauth.status(ctx.dataDir, ctx.userId).conectado) {
    return { ok: true, motivo: '', aviso: 'sem OAuth: so conferi o formato' }
  }
  try {
    const caminho = alvo.tipo === 'produto' ? '/products/' + alvo.id : '/items/' + alvo.id
    const dados = await oauth.get(ctx.dataDir, ctx.userId, caminho)
    if (alvo.tipo === 'item' && dados.status && dados.status !== 'active') {
      return { ok: false, motivo: 'anuncio nao esta ativo (' + dados.status + ')' }
    }
    return { ok: true, motivo: '' }
  } catch (e) {
    if (e.code === 'ML_404') return { ok: false, motivo: 'produto nao existe mais no Mercado Livre' }
    // 429, rede, 403 ou token: o formato ja passou; nao trava o envio, so avisa
    return { ok: true, motivo: '', aviso: 'API do Mercado Livre: ' + e.message }
  }
}

module.exports = { id: 'mercadolivre', configurado, converter, validar, idDe, ehPaginaSocial, produtoDoHtml, ETIQUETA_RE, TOOL_RE }
