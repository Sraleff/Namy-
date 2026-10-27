/**
 * Amazon Associados: link canonico /dp/<ASIN>?tag=<tag do cliente>.
 * Tira a tag de quem postou. Nao abre a pagina da Amazon para validar
 * (ela bloqueia robo com 503); a validacao e de formato + ASIN + tag.
 */
const links = require('../links')

const TAG_RE = /^[A-Za-z0-9_-]{3,64}$/
const ASIN_RE = /^[A-Z0-9]{10}$/

function tagDe(ctx) {
  return String((ctx.cfg && ctx.cfg.amazon && ctx.cfg.amazon.tag) || '').trim()
}

function configurado(ctx) {
  const tag = tagDe(ctx)
  if (!tag) return { ok: false, motivo: 'salve sua tag de Associado Amazon' }
  if (!TAG_RE.test(tag)) return { ok: false, motivo: 'tag Amazon inválida' }
  return { ok: true, motivo: '' }
}

function asinDe(url) {
  let u
  try { u = new URL(url) } catch { return '' }
  const m = u.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/asin|o\/asin)\/([A-Z0-9]{10})(?:[/?]|$)/i)
  return m ? m[1].toUpperCase() : ''
}

async function converter(url, ctx) {
  const final = await links.resolver(url)
  if (links.marketplaceDe(final) !== 'amazon') throw links.erroLink('Link curto não levou para a Amazon')
  const asin = asinDe(final)
  if (!asin) throw links.erroLink('Link Amazon sem produto (ASIN)')
  return 'https://www.amazon.com.br/dp/' + asin + '?tag=' + encodeURIComponent(tagDe(ctx))
}

async function validar(url, ctx) {
  const f = links.validarFormato(url, 'amazon')
  if (!f.ok) return f
  let u
  try { u = new URL(url) } catch { return { ok: false, motivo: 'link inválido' } }
  if (u.hostname !== 'www.amazon.com.br') return { ok: false, motivo: 'link Amazon fora do dominio .com.br' }
  if (!ASIN_RE.test(asinDe(url))) return { ok: false, motivo: 'ASIN inválido' }
  if (u.searchParams.get('tag') !== tagDe(ctx)) return { ok: false, motivo: 'tag do link não é a sua' }
  return { ok: true, motivo: '' }
}

module.exports = { id: 'amazon', configurado, converter, validar, asinDe, TAG_RE }
