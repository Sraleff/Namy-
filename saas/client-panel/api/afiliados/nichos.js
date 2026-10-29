/**
 * Nicho por grupo. Decide se uma oferta combina com o publico do grupo.
 * Casa por palavra inteira (sem acento, minusculo): "car" nao casa com "carregador".
 * "geral" aceita qualquer oferta que passou no filtro de qualidade.
 */

// termos: casam no nome/texto da oferta. evitar: derrubam o nicho mesmo com termo.
// buscas: palavras usadas na busca da API Shopee quando o grupo e desse nicho.
const NICHOS = {
  geral: { label: 'Geral', termos: [], evitar: [], buscas: [] },
  carros: {
    label: 'Carros e motos',
    termos: ['carro', 'carros', 'automotivo', 'automotiva', 'veiculo', 'veicular', 'moto', 'motos', 'motocicleta', 'capacete', 'pneu', 'pneus', 'volante', 'retrovisor', 'farol', 'farois', 'para-brisa', 'parabrisa', 'tapete automotivo', 'capa de banco', 'som automotivo', 'multimidia', 'calota', 'cera automotiva', 'aspirador automotivo', 'suporte veicular', 'lampada led h4', 'carregador veicular', 'oleo motor', 'engate'],
    evitar: ['carrinho de bebe', 'carro de controle', 'carrinho de compras', 'brinquedo'],
    buscas: ['acessorios carro', 'automotivo', 'suporte veicular', 'capa banco carro', 'acessorios moto']
  },
  casa: {
    label: 'Casa e cozinha',
    termos: ['casa', 'cozinha', 'panela', 'panelas', 'frigideira', 'talheres', 'pote', 'potes', 'organizador', 'organizadora', 'toalha', 'toalhas', 'lencol', 'edredom', 'travesseiro', 'cortina', 'tapete', 'luminaria', 'abajur', 'decoracao', 'vaso', 'banheiro', 'lavanderia', 'vassoura', 'mop', 'rodo', 'cabide', 'prateleira', 'airfryer', 'air fryer', 'liquidificador', 'cafeteira', 'chaleira', 'sanduicheira', 'mixer', 'batedeira', 'garrafa termica', 'escorredor', 'tabua de corte', 'faqueiro', 'jogo de cama', 'almofada', 'sofa', 'colchao', 'aspirador de po'],
    evitar: ['aspirador automotivo', 'casa de boneca'],
    buscas: ['utensilios cozinha', 'organizador casa', 'decoracao casa', 'cama mesa banho', 'airfryer']
  },
  bebe: {
    label: 'Bebê e infantil',
    termos: ['bebe', 'bebes', 'infantil', 'crianca', 'criancas', 'kids', 'recem nascido', 'recem-nascido', 'fralda', 'fraldas', 'chupeta', 'mamadeira', 'body bebe', 'body infantil', 'macacao bebe', 'carrinho de bebe', 'berco', 'babador', 'mordedor', 'enxoval', 'banheira bebe', 'cadeirinha', 'bebe conforto', 'brinquedo', 'brinquedos', 'pelucia', 'maternidade', 'gestante'],
    evitar: [],
    buscas: ['bebe', 'enxoval bebe', 'brinquedo infantil', 'roupa infantil', 'fralda']
  },
  beleza: {
    label: 'Beleza e cuidados',
    termos: ['maquiagem', 'batom', 'base liquida', 'corretivo', 'rimel', 'mascara de cilios', 'delineador', 'paleta de sombra', 'paleta', 'pincel', 'pinceis', 'skincare', 'serum', 'hidratante', 'protetor solar', 'perfume', 'perfumes', 'shampoo', 'condicionador', 'mascara capilar', 'secador', 'chapinha', 'prancha alisadora', 'babyliss', 'esmalte', 'unha', 'unhas', 'depilador', 'cilios', 'sobrancelha', 'creme facial', 'sabonete facial', 'body splash'],
    evitar: [],
    buscas: ['maquiagem', 'skincare', 'perfume', 'cabelo', 'kit beleza']
  },
  moda: {
    label: 'Moda e acessórios',
    termos: ['vestido', 'blusa', 'camiseta', 'camisa', 'calca', 'jeans', 'saia', 'short', 'bermuda', 'jaqueta', 'casaco', 'moletom', 'cropped', 'conjunto feminino', 'conjunto masculino', 'lingerie', 'sutia', 'calcinha', 'cueca', 'meia', 'tenis', 'sandalia', 'chinelo', 'sapato', 'bota', 'bolsa', 'mochila', 'carteira', 'cinto', 'bone', 'oculos de sol', 'relogio', 'colar', 'brinco', 'pulseira', 'anel', 'semijoia'],
    evitar: ['body bebe', 'tenis infantil'],
    buscas: ['moda feminina', 'moda masculina', 'tenis', 'bolsa feminina', 'acessorios moda']
  },
  eletronicos: {
    label: 'Eletrônicos e celulares',
    termos: ['celular', 'smartphone', 'iphone', 'samsung', 'xiaomi', 'fone', 'fones', 'headset', 'bluetooth', 'carregador', 'cabo usb', 'usb-c', 'power bank', 'smartwatch', 'smartband', 'notebook', 'tablet', 'teclado', 'mouse', 'monitor', 'caixa de som', 'tv', 'smart tv', 'roteador', 'camera', 'webcam', 'ssd', 'pendrive', 'cartao de memoria', 'alexa', 'echo dot', 'chromecast', 'projetor'],
    evitar: ['carregador veicular'],
    buscas: ['fone bluetooth', 'smartwatch', 'carregador celular', 'acessorios celular', 'caixa de som']
  },
  pets: {
    label: 'Pets',
    termos: ['pet', 'pets', 'cachorro', 'cachorros', 'cao', 'caes', 'gato', 'gatos', 'racao', 'coleira', 'guia pet', 'peitoral', 'comedouro', 'bebedouro', 'arranhador', 'caminha pet', 'areia sanitaria', 'tapete higienico', 'petisco'],
    evitar: [],
    buscas: ['pet', 'cachorro', 'gato', 'caminha pet', 'brinquedo pet']
  },
  fitness: {
    label: 'Fitness e esporte',
    termos: ['academia', 'fitness', 'treino', 'halter', 'halteres', 'anilha', 'elastico', 'faixa elastica', 'corda de pular', 'tapete yoga', 'yoga', 'pilates', 'whey', 'creatina', 'suplemento', 'coqueteleira', 'legging', 'top fitness', 'bicicleta', 'ciclismo', 'corrida', 'futebol', 'bola', 'garrafa squeeze', 'luva de academia'],
    evitar: ['bola de pelucia'],
    buscas: ['academia em casa', 'fitness', 'roupa academia', 'suplemento', 'yoga']
  },
  games: {
    label: 'Games',
    termos: ['game', 'games', 'gamer', 'playstation', 'ps4', 'ps5', 'xbox', 'nintendo', 'switch', 'controle', 'joystick', 'headset gamer', 'mouse gamer', 'teclado gamer', 'cadeira gamer', 'mousepad', 'console'],
    evitar: ['controle remoto'],
    buscas: ['gamer', 'controle ps5', 'headset gamer', 'mouse gamer', 'console']
  },
  ferramentas: {
    label: 'Ferramentas e construção',
    termos: ['ferramenta', 'ferramentas', 'furadeira', 'parafusadeira', 'esmerilhadeira', 'serra eletrica', 'serra circular', 'martelo', 'chave de fenda', 'jogo de chaves', 'alicate', 'trena', 'nivel a laser', 'broca', 'brocas', 'maleta de ferramentas', 'solda', 'compressor', 'lavadora de alta pressao', 'mangueira', 'jardinagem'],
    evitar: [],
    buscas: ['ferramentas', 'furadeira', 'parafusadeira', 'jogo de chaves', 'kit ferramentas']
  }
}

function semAcento(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

// "capa de banco" vira regex com fronteira de palavra nas pontas
const cacheRegex = new Map()
function regexDe(termo) {
  const t = semAcento(termo).trim()
  if (cacheRegex.has(t)) return cacheRegex.get(t)
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\s-]+/g, '[\\s-]+')
  const re = new RegExp('(^|[^a-z0-9])' + esc + '($|[^a-z0-9])')
  cacheRegex.set(t, re)
  return re
}

function contar(termos, texto) {
  let n = 0
  for (const t of termos || []) if (t && regexDe(t).test(texto)) n++
  return n
}

function existe(nicho) {
  return Object.prototype.hasOwnProperty.call(NICHOS, nicho)
}

function normalizar(nicho) {
  const n = semAcento(nicho).replace(/[^a-z]/g, '')
  return existe(n) ? n : 'geral'
}

// Palavras extras por grupo: string "a, b" ou lista. Ate 30 termos de 40 letras.
function palavrasExtras(v) {
  const lista = Array.isArray(v) ? v : String(v || '').split(',')
  return lista.map((x) => String(x || '').trim().slice(0, 40)).filter(Boolean).slice(0, 30)
}

function pontuar(nicho, textoOferta, extras) {
  const def = NICHOS[nicho]
  if (!def) return 0
  const texto = semAcento(textoOferta)
  if (contar(def.evitar, texto)) return 0
  return contar(def.termos, texto) + contar(extras, texto)
}

// Melhor nicho para um texto (usado para etiquetar ofertas e explicar o log)
function classificar(textoOferta) {
  let melhor = 'geral'
  let maior = 0
  for (const nicho of Object.keys(NICHOS)) {
    if (nicho === 'geral') continue
    const p = pontuar(nicho, textoOferta)
    if (p > maior) {
      maior = p
      melhor = nicho
    }
  }
  return { nicho: melhor, pontos: maior }
}

/**
 * Grupo { niche, keywords } aceita a oferta?
 * Retorna { ok, motivo } para o log de ofertas puladas.
 */
function compativel(grupo, textoOferta) {
  const nicho = normalizar(grupo && grupo.niche)
  if (nicho === 'geral') return { ok: true, nicho, motivo: '' }
  const extras = palavrasExtras(grupo && grupo.keywords)
  const p = pontuar(nicho, textoOferta, extras)
  if (p > 0) return { ok: true, nicho, motivo: '' }
  const outro = classificar(textoOferta)
  const motivo = outro.pontos
    ? 'oferta parece de ' + NICHOS[outro.nicho].label.toLowerCase()
    : 'nenhuma palavra do nicho no produto'
  return { ok: false, nicho, motivo }
}

function buscaDoNicho(nicho, keywordGeral) {
  const n = normalizar(nicho)
  if (n === 'geral') return String(keywordGeral || '').trim()
  const lista = NICHOS[n].buscas
  return lista[Math.floor(Math.random() * lista.length)] || ''
}

function catalogo() {
  return Object.keys(NICHOS).map((id) => ({ id, label: NICHOS[id].label, exemplos: NICHOS[id].termos.slice(0, 8) }))
}

module.exports = { NICHOS, normalizar, existe, palavrasExtras, pontuar, classificar, compativel, buscaDoNicho, catalogo, semAcento }
