/**
 * Trava de preço (D2/D3): o texto promete um preço e a loja, conferida pela API (Mercado Livre com
 * OAuth, Amazon com a Creators API), está mais cara agora -> motivo para pular a oferta.
 * Só quando há exatamente um link com preço conferido e o texto tem um preço (o primeiro "R$").
 * Preço igual ou menor passa; até 1% de diferença passa (arredondamento).
 */
const LOJA = { mercadolivre: 'no Mercado Livre', amazon: 'na Amazon', shopee: 'na Shopee' }

const brl = (n) => 'R$ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const numeroBrl = (s) => Number(String(s).replace(/[^\d,]/g, '').replace(',', '.'))

function precoSubiu(texto, trocas) {
  const conferidas = (trocas || []).filter((t) => t && Number(t.preco) > 0)
  if (conferidas.length !== 1) return ''
  const m = String(texto || '').match(/R\$\s?(\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\d+(?:,\d{2})?)/)
  if (!m) return ''
  const doTexto = numeroBrl(m[1])
  const agora = Number(conferidas[0].preco)
  if (!(doTexto > 0) || agora <= doTexto * 1.01 + 0.01) return ''
  return 'preço subiu ' + (LOJA[conferidas[0].marketplace] || 'na loja') + ': ' + brl(doTexto) + ' no texto, ' + brl(agora) + ' agora'
}

module.exports = { precoSubiu, brl, numeroBrl }
