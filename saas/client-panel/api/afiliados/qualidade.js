/**
 * Filtro basico de qualidade e leitura de cupom.
 * So julga o que a fonte informou: sem nota ou sem desconto na API nao
 * reprova nem inventa numero.
 */

function regras(cfg) {
  const q = (cfg && cfg.ads && cfg.ads.quality) || {}
  return {
    minDiscount: limitar(q.minDiscount, 0, 90),
    minRating: limitar(q.minRating, 0, 5),
    minSales: limitar(q.minSales, 0, 1000000)
  }
}

function limitar(v, min, max) {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.min(max, Math.max(min, n))
}

// Oferta da API Shopee normalizada (ofertas.normalizar)
function avaliarApi(oferta, cfg) {
  const r = regras(cfg)
  if (r.minDiscount && !(oferta.desconto >= r.minDiscount)) {
    return { ok: false, motivo: 'desconto ' + (oferta.desconto || 0) + '% abaixo de ' + r.minDiscount + '%' }
  }
  const nota = Number(String(oferta.ratingStar || '').replace(',', '.'))
  if (r.minRating && Number.isFinite(nota) && nota > 0 && nota < r.minRating) {
    return { ok: false, motivo: 'nota ' + nota.toFixed(1) + ' abaixo de ' + r.minRating }
  }
  if (r.minSales && Number(oferta.sales) >= 0 && Number(oferta.sales) < r.minSales) {
    return { ok: false, motivo: (oferta.sales || 0) + ' vendas, mínimo ' + r.minSales }
  }
  return { ok: true, motivo: '' }
}

// "20% OFF", "-35%", "35% de desconto"
function descontoDoTexto(texto) {
  const m = String(texto || '').match(/(?:^|[^\d])(\d{1,2})\s?%\s?(?:off|de desconto|desconto)|-\s?(\d{1,2})\s?%/i)
  if (!m) return null
  return Number(m[1] || m[2])
}

// Oferta colada/capturada: so aplica desconto minimo se o texto informar
function avaliarTexto(texto, cfg) {
  const r = regras(cfg)
  const d = descontoDoTexto(texto)
  if (r.minDiscount && d !== null && d < r.minDiscount) {
    return { ok: false, motivo: 'texto diz ' + d + '% de desconto, mínimo ' + r.minDiscount + '%' }
  }
  return { ok: true, motivo: '' }
}

// Codigos de cupom citados no texto (para log e painel). Nao cria cupom.
function cupons(texto) {
  const out = new Set()
  const re = /(?:cupom|cupon|coupon|c[oó]digo|code)\s*(?:de desconto)?\s*[:\-–]?\s*\*?\s*([A-Z0-9][A-Z0-9_-]{3,24})/gi
  let m
  while ((m = re.exec(String(texto || '')))) {
    const c = m[1].replace(/\*/g, '')
    if (/[A-Z]/.test(c) && c === c.toUpperCase()) out.add(c)
  }
  return [...out].slice(0, 5)
}

module.exports = { regras, avaliarApi, avaliarTexto, descontoDoTexto, cupons }
