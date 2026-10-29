/**
 * Links de marketplace: achar no texto, saber de quem e, resolver link curto
 * e validar. So segue redirect para hosts de marketplace conhecidos e nunca
 * para IP privado (o texto vem de grupo de terceiros).
 */
const dns = require('dns').promises
const net = require('net')

const MARKETPLACES = {
  shopee: {
    label: 'Shopee',
    hosts: ['shopee.com.br', 'shope.ee', 'shp.ee', 's.shopee.com.br', 'br.shp.ee'],
    curtos: ['shope.ee', 'shp.ee', 's.shopee.com.br', 'br.shp.ee']
  },
  mercadolivre: {
    label: 'Mercado Livre',
    hosts: ['mercadolivre.com.br', 'mercadolivre.com', 'mercadolibre.com', 'meli.la', 'mlb.am'],
    curtos: ['meli.la', 'mlb.am', 'mercadolivre.com/sec']
  },
  amazon: {
    label: 'Amazon',
    hosts: ['amazon.com.br', 'amzn.to', 'a.co', 'amzn.com'],
    curtos: ['amzn.to', 'a.co', 'amzn.com']
  }
}

// URL termina antes de espaco, quebra de linha ou pontuacao de fim de frase
const URL_RE = /https?:\/\/[^\s<>"'`]+/gi
const SOBRA_FINAL = /[)\]}.,;:!?*_~]+$/

// Links de marketplace colados sem "https://" (ex.: s.shopee.com.br/AbC, amzn.to/x).
// Exige caminho depois do host; nao casa dentro de uma URL que ja tem esquema.
let SEM_ESQUEMA_RE = null
function semEsquemaRe() {
  if (SEM_ESQUEMA_RE) return SEM_ESQUEMA_RE
  const hosts = Object.values(MARKETPLACES).flatMap((m) => m.hosts)
    .sort((a, b) => b.length - a.length)
    .map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  SEM_ESQUEMA_RE = new RegExp('(?<![\\w./@:-])((?:[a-z0-9-]+\\.)*(?:' + hosts.join('|') + ')\\/[^\\s<>"\'`]+)', 'gi')
  return SEM_ESQUEMA_RE
}

function extrairUrls(texto) {
  const out = []
  const s = String(texto || '')
  let m
  URL_RE.lastIndex = 0
  while ((m = URL_RE.exec(s))) {
    let url = m[0]
    const sobra = url.match(SOBRA_FINAL)
    if (sobra) url = url.slice(0, -sobra[0].length)
    out.push({ url, inicio: m.index, fim: m.index + url.length })
  }
  const re = semEsquemaRe()
  re.lastIndex = 0
  while ((m = re.exec(s))) {
    let bruto = m[1]
    const sobra = bruto.match(SOBRA_FINAL)
    if (sobra) bruto = bruto.slice(0, -sobra[0].length)
    // inicio/fim apontam para o texto original; a troca usa os indices, nao a string
    out.push({ url: 'https://' + bruto, inicio: m.index, fim: m.index + bruto.length })
  }
  return out.sort((a, b) => a.inicio - b.inicio)
}

function hostDe(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

function casaHost(host, lista) {
  return lista.some((h) => host === h || host.endsWith('.' + h))
}

function marketplaceDe(url) {
  const host = hostDe(url)
  if (!host) return null
  for (const id of Object.keys(MARKETPLACES)) {
    if (casaHost(host, MARKETPLACES[id].hosts)) return id
  }
  return null
}

function ehCurto(url) {
  const mk = marketplaceDe(url)
  if (!mk) return false
  const host = hostDe(url)
  let caminho = ''
  try { caminho = new URL(url).pathname } catch {}
  return MARKETPLACES[mk].curtos.some((c) => {
    const [h, p] = c.split('/')
    return (host === h || host.endsWith('.' + h)) && (!p || caminho.startsWith('/' + p))
  })
}

function ipPrivado(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number)
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
  }
  const v = ip.toLowerCase()
  if (v.startsWith('::ffff:')) return ipPrivado(v.slice(7))
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')
}

// true/false; DNS fora do ar vira erro temporario (nao e culpa do link)
async function hostPublico(host) {
  if (net.isIP(host)) return !ipPrivado(host)
  let lista
  try {
    lista = await dns.lookup(host, { all: true })
  } catch (e) {
    if (e.code === 'ENOTFOUND') return false
    throw erroLink('Não consegui resolver ' + host, true)
  }
  return lista.length > 0 && lista.every((r) => !ipPrivado(r.address))
}

/**
 * GET/HEAD com redirect manual. So aceita https e host publico.
 * hostsPermitidos: lista de hosts aceitos em cada salto (null = qualquer publico).
 */
async function buscarSeguro(url, { method = 'GET', hostsPermitidos = null, saltos = 5, timeoutMs = 7000, headers = {} } = {}) {
  let atual = url
  for (let i = 0; i <= saltos; i++) {
    let u
    try { u = new URL(atual) } catch { throw erroLink('Link inválido') }
    if (u.protocol !== 'https:') throw erroLink('Só aceito link https')
    const host = u.hostname.toLowerCase().replace(/^www\./, '')
    if (hostsPermitidos && !casaHost(host, hostsPermitidos)) throw erroLink('Redirecionou para fora do marketplace: ' + host)
    if (!(await hostPublico(u.hostname))) throw erroLink('Host não permitido')
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    let r
    try {
      r = await fetch(atual, {
        method,
        redirect: 'manual',
        signal: ctrl.signal,
        headers: Object.assign({ 'User-Agent': 'Mozilla/5.0 (Namy link check)', Accept: '*/*' }, headers)
      })
    } catch (e) {
      throw erroLink(e.name === 'AbortError' ? 'Tempo esgotado ao abrir o link' : 'Não consegui abrir o link', true)
    } finally {
      clearTimeout(t)
    }
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
      atual = new URL(r.headers.get('location'), atual).toString()
      continue
    }
    return { url: atual, status: r.status, response: r }
  }
  throw erroLink('Redirecionamentos demais')
}

function erroLink(msg, temporario) {
  const e = new Error(msg)
  e.code = 'LINK'
  e.temporario = !!temporario
  return e
}

// Link curto -> URL final do produto (sem baixar a pagina inteira)
async function resolver(url) {
  if (!ehCurto(url)) return url
  const mk = marketplaceDe(url)
  const out = await buscarSeguro(url, { method: 'GET', hostsPermitidos: MARKETPLACES[mk].hosts })
  try { if (out.response.body) await out.response.body.cancel() } catch {}
  return out.url
}

// Validacao estrutural: https, host do marketplace esperado, sem espaco
function validarFormato(url, marketplace) {
  if (!/^https:\/\/[^\s]+$/.test(String(url || ''))) return { ok: false, motivo: 'link sem https' }
  const mk = marketplaceDe(url)
  if (!mk) return { ok: false, motivo: 'host fora dos marketplaces suportados' }
  if (marketplace && mk !== marketplace) return { ok: false, motivo: 'link não é de ' + MARKETPLACES[marketplace].label }
  return { ok: true, motivo: '' }
}

// Abre o link e confirma que responde (2xx/3xx). Erro de rede vira "temporario".
async function validarAoVivo(url) {
  const mk = marketplaceDe(url)
  try {
    const out = await buscarSeguro(url, { method: 'GET', hostsPermitidos: mk ? MARKETPLACES[mk].hosts : null, saltos: 4 })
    try { if (out.response.body) await out.response.body.cancel() } catch {}
    if (out.status >= 400 && out.status !== 403 && out.status !== 429) return { ok: false, motivo: 'link respondeu ' + out.status }
    return { ok: true, motivo: '', final: out.url }
  } catch (e) {
    return { ok: false, temporario: !!e.temporario, motivo: e.message }
  }
}

module.exports = {
  MARKETPLACES,
  extrairUrls,
  hostDe,
  casaHost,
  marketplaceDe,
  ehCurto,
  ipPrivado,
  buscarSeguro,
  resolver,
  validarFormato,
  validarAoVivo,
  erroLink
}
