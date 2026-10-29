/**
 * Shopee: troca qualquer link de produto pelo link curto de afiliado do
 * cliente (generateShortLink da API oficial, credenciais da conta dele).
 */
const ofertas = require('../../ofertas')
const links = require('../links')
const atribuicao = require('../atribuicao')

const cacheGrupo = new Map()

function configurado(ctx) {
  const s = ctx.cfg && ctx.cfg.shopee
  if (!s || !s.appId || !s.secret) return { ok: false, motivo: 'salve App ID e Secret da Shopee' }
  return { ok: true, motivo: '' }
}

// Link final sem os parametros de afiliado de quem postou a oferta
function canonico(url) {
  let u
  try { u = new URL(url) } catch { return '' }
  const m = u.pathname.match(/-i\.(\d+)\.(\d+)/) || u.pathname.match(/\/product\/(\d+)\/(\d+)/)
  if (m) return 'https://shopee.com.br/product/' + m[1] + '/' + m[2]
  return 'https://shopee.com.br' + u.pathname
}

async function converter(url, ctx) {
  const final = await links.resolver(url)
  const origem = canonico(final)
  if (!origem || origem === 'https://shopee.com.br/') throw links.erroLink('Link Shopee sem produto')
  const s = ctx.cfg.shopee
  const subIds = atribuicao.subIdsDe(ctx.atribuicao)
  // Link por grupo: o mesmo produto sai varias vezes com o mesmo subId; guarda por 6 h
  const chave = ctx.atribuicao && ctx.atribuicao.grupo ? s.appId + '|' + origem + '|' + subIds.join('.') : ''
  const hit = chave && cacheGrupo.get(chave)
  if (hit && hit.ate > Date.now()) return hit.link
  const curto = await ofertas.encurtar(s.appId, s.secret, origem, subIds)
  if (!curto) throw links.erroLink('A API Shopee não gerou o link de afiliado', true)
  if (chave) {
    if (cacheGrupo.size > 2000) cacheGrupo.delete(cacheGrupo.keys().next().value)
    cacheGrupo.set(chave, { ate: Date.now() + 6 * 3600 * 1000, link: curto })
  }
  return curto
}

async function validar(url) {
  const f = links.validarFormato(url, 'shopee')
  if (!f.ok) return f
  const vivo = await links.validarAoVivo(url)
  // Link saiu da API oficial: queda de rede na checagem nao derruba o envio
  if (!vivo.ok && vivo.temporario) return { ok: true, motivo: '', aviso: 'checagem ao vivo falhou: ' + vivo.motivo }
  return vivo
}

module.exports = { id: 'shopee', configurado, converter, validar, canonico }
