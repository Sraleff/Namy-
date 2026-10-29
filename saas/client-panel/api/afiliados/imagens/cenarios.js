/**
 * Cenarios para foto de produto. O prompt pede o MESMO produto da foto de
 * referencia (forma, cor, marca), so muda o ambiente.
 */
const CENARIOS = {
  cozinha: { label: 'Bancada da cozinha', cena: 'on a clean modern kitchen countertop, marble surface, blurred kitchen background' },
  sofa: { label: 'No sofá', cena: 'resting on a cozy living room sofa with cushions, warm home ambience' },
  cama: { label: 'Na cama', cena: 'on a neatly made bed with white linen, bright bedroom' },
  escritorio: { label: 'Mesa de escritório', cena: 'on a tidy wooden office desk next to a laptop, home office' },
  banheiro: { label: 'Banheiro', cena: 'on a bathroom sink counter with soft towels, spa-like bathroom' },
  penteadeira: { label: 'Penteadeira', cena: 'on a vanity table with a mirror, beauty and makeup setting' },
  quartoBebe: { label: 'Quarto de bebê', cena: 'in a soft pastel baby nursery room, next to a crib' },
  carro: { label: 'Dentro do carro', cena: 'inside a modern car interior, on the passenger seat or dashboard as appropriate' },
  arLivre: { label: 'Ao ar livre', cena: 'outdoors in a sunny garden or park, natural daylight' },
  estudio: { label: 'Estúdio fundo branco', cena: 'on a seamless pure white studio background, e-commerce product shot' }
}

function existe(id) {
  return Object.prototype.hasOwnProperty.call(CENARIOS, id)
}

function prompt(id, nomeProduto) {
  const c = CENARIOS[id]
  const nome = String(nomeProduto || 'the product').replace(/[^\p{L}\p{N}\s.,%+-]/gu, ' ').slice(0, 140)
  return [
    'Product photo for an e-commerce offer. Product: ' + nome + '.',
    'Use EXACTLY the product shown in the reference image: same shape, colors, proportions, labels and logo. Do not redesign or add products.',
    'Place it naturally ' + c.cena + '.',
    'Photorealistic, soft natural light, realistic shadows and scale, sharp focus on the product, square 1:1 framing.',
    'No text, no price tags, no watermark, no added logos, no people.'
  ].join(' ')
}

function catalogo() {
  return Object.keys(CENARIOS).map((id) => ({ id, label: CENARIOS[id].label }))
}

module.exports = { CENARIOS, existe, prompt, catalogo }
