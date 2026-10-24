/**
 * Troca os links de marketplace de um texto pelos links de afiliado do cliente.
 * So mexe nos trechos da URL: emojis, quebras de linha, cupons e espacos ficam
 * exatamente como vieram. Se um link de marketplace nao puder ser trocado e
 * validado, a mensagem inteira e barrada (nunca divulga link de outra pessoa).
 */
const links = require('./links')
const shopee = require('./conectores/shopee')
const mercadolivre = require('./conectores/mercadolivre')
const amazon = require('./conectores/amazon')

const CONECTORES = { shopee, mercadolivre, amazon }

// Encurtadores genericos podem esconder o link de afiliado de outra pessoa
const ENCURTADORES = ['bit.ly', 'tinyurl.com', 'cutt.ly', 'encurtador.com.br', 'is.gd', 'rebrand.ly', 't.co', 'ow.ly', 'l.linklyhq.com', 'tiny.cc', 'shorturl.at', 'abre.ai', 'compre.link', 'linktr.ee']
const CONVITE_WA = /^https:\/\/chat\.whatsapp\.com\//i

function conectorDe(marketplace) {
  return CONECTORES[marketplace] || null
}

// Quais marketplaces este cliente consegue converter agora
function prontos(ctx) {
  const out = {}
  for (const id of Object.keys(CONECTORES)) out[id] = CONECTORES[id].configurado(ctx)
  return out
}

async function classificarUrl(url) {
  const mk = links.marketplaceDe(url)
  if (mk) return { url, marketplace: mk }
  if (CONVITE_WA.test(url)) return { url, convite: true }
  const host = links.hostDe(url)
  if (links.casaHost(host, ENCURTADORES)) {
    try {
      const out = await links.buscarSeguro(url, { method: 'GET', saltos: 6 })
      try { if (out.response.body) await out.response.body.cancel() } catch {}
      const mk2 = links.marketplaceDe(out.url)
      if (mk2) return { url, resolvido: out.url, marketplace: mk2 }
    } catch {}
    return { url, bloqueado: 'encurtador que nao leva a marketplace suportado' }
  }
  return { url, desconhecido: true }
}

// Tira a linha inteira onde estava o convite de grupo de quem postou
function semLinhasDeConvite(texto) {
  return texto.split('\n').filter((l) => !/https:\/\/chat\.whatsapp\.com\//i.test(l)).join('\n')
}

/**
 * ctx: { userId, cfg, dataDir }
 * Retorna { ok, texto, trocas, erros, ignorados, marketplaces }
 */
async function converterTexto(textoOriginal, ctx) {
  const texto = String(textoOriginal || '')
  const achados = links.extrairUrls(texto)
  const trocas = []
  const erros = []
  const ignorados = []
  const cache = new Map()

  for (const a of achados) {
    if (cache.has(a.url)) continue
    const info = await classificarUrl(a.url)
    if (info.convite) { cache.set(a.url, { remover: true }); continue }
    if (info.bloqueado) { erros.push({ url: a.url, motivo: info.bloqueado }); cache.set(a.url, null); continue }
    if (info.desconhecido) { ignorados.push(a.url); cache.set(a.url, { manter: true }); continue }
    const con = conectorDe(info.marketplace)
    const pronto = con.configurado(ctx)
    if (!pronto.ok) {
      erros.push({ url: a.url, marketplace: info.marketplace, motivo: pronto.motivo })
      cache.set(a.url, null)
      continue
    }
    try {
      const para = await con.converter(info.resolvido || a.url, ctx)
      const v = await con.validar(para, ctx)
      if (!v.ok) {
        erros.push({ url: a.url, marketplace: info.marketplace, motivo: 'link gerado nao passou: ' + v.motivo })
        cache.set(a.url, null)
        continue
      }
      const troca = { de: a.url, para, marketplace: info.marketplace, aviso: v.aviso || '' }
      trocas.push(troca)
      cache.set(a.url, troca)
    } catch (e) {
      erros.push({ url: a.url, marketplace: info.marketplace, motivo: e.message || 'falha ao gerar link', temporario: !!e.temporario })
      cache.set(a.url, null)
    }
  }

  // Substitui de tras para frente para os indices continuarem certos
  let saida = texto
  for (const a of [...achados].reverse()) {
    const t = cache.get(a.url)
    if (t && t.para) saida = saida.slice(0, a.inicio) + t.para + saida.slice(a.fim)
  }
  if (achados.some((a) => cache.get(a.url) && cache.get(a.url).remover)) saida = semLinhasDeConvite(saida)

  const marketplaces = [...new Set(trocas.map((t) => t.marketplace))]
  let ok = erros.length === 0 && trocas.length > 0
  if (!trocas.length && !erros.length) erros.push({ url: '', motivo: 'mensagem sem link de Shopee, Mercado Livre ou Amazon' })
  if (erros.length) ok = false
  return { ok, texto: saida.slice(0, 4000), trocas, erros, ignorados, marketplaces }
}

module.exports = { converterTexto, prontos, conectorDe, CONECTORES, ENCURTADORES }
