/**
 * Mensagem das ofertas que o SISTEMA monta (API Shopee e Vitrine) — fase 1.5a.
 * Textos colados ou capturados de grupo NUNCA passam por aqui: nesses so os links mudam.
 *
 * Tres camadas, da mais segura para a mais livre:
 *  1. modelo (padrao): o texto fixo de sempre, ou o modelo do cliente com variaveis
 *     {nome} {preco} {desconto} {nota} {vendas} {loja} {link}. Nunca inventa nada.
 *  2. IA com a CHAVE DO CLIENTE (Groq, Grok/xAI ou Gemini), guardada cifrada no cofre.
 *  3. IA local (Ollama), so para as contas que o dono liberar em NAMY_OLLAMA_EMAILS.
 *
 * Toda IA passa pela TRAVA: o texto so vale se cada numero (preco, %, vendas...) for um dos
 * numeros reais da oferta, se o preco aparecer, se nao houver link nem promessa de cupom/frete
 * que os dados nao tenham. Reprovou ou falhou: volta ao modelo. O link nunca vai para a IA:
 * ele e acrescentado por nos depois.
 */
const ofertasApi = require('../ofertas')
const cofre = require('./cofre')

const VARIAVEIS = ['nome', 'preco', 'desconto', 'nota', 'vendas', 'loja', 'link']
const PROVEDORES = {
  groq: { rotulo: 'Groq', tipo: 'openai', url: 'https://api.groq.com/openai/v1/chat/completions', modelo: () => process.env.IA_MODEL_GROQ || 'openai/gpt-oss-20b' },
  xai: { rotulo: 'Grok (xAI)', tipo: 'openai', url: 'https://api.x.ai/v1/chat/completions', modelo: () => process.env.IA_MODEL_XAI || 'grok-4.6' },
  gemini: { rotulo: 'Gemini', tipo: 'gemini', url: (m) => 'https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent', modelo: () => process.env.IA_MODEL_GEMINI || 'gemini-2.0-flash' },
  ollama: { rotulo: 'IA local do servidor (Ollama)', tipo: 'ollama', local: true }
}
const NUVEM = ['groq', 'xai', 'gemini']
const MODELO_MAX = 1000
const TEXTO_MAX = 3500
const IA_TIMEOUT_MS = 25000
const OLLAMA_TIMEOUT_MS = 90000

const OFERTA_EXEMPLO = {
  productId: '1',
  nome: 'Fone de Ouvido Bluetooth TWS com Cancelamento de Ruido',
  preco: 'R$ 39,90',
  desconto: 45,
  ratingStar: '4.8',
  sales: 12300,
  shopName: 'Loja Oficial Audio',
  link: 'https://s.shopee.com.br/exemplo'
}

function erro(msg, status) {
  return Object.assign(new Error(msg), { status: status || 400 })
}

const milhar = (n) => Number(n).toLocaleString('pt-BR')

// ---------- modelo com variaveis ----------

function valores(o) {
  return {
    nome: o.nome || '',
    preco: o.preco || '',
    desconto: o.desconto ? o.desconto + '% off' : '',
    nota: o.ratingStar || '',
    vendas: Number(o.sales) > 0 ? milhar(o.sales) + ' vendas' : '',
    loja: o.shopName || '',
    link: o.link || ''
  }
}

// Devolve a mensagem de erro ou '' se o modelo e valido
function validarModelo(modelo) {
  if (typeof modelo !== 'string' || !modelo.trim()) return 'Escreva o modelo da mensagem.'
  if (modelo.length > MODELO_MAX) return 'Modelo grande demais (maximo ' + MODELO_MAX + ' caracteres).'
  const usadas = [...modelo.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1])
  const desconhecida = usadas.find((v) => !VARIAVEIS.includes(v))
  if (desconhecida !== undefined) return 'Variavel desconhecida: {' + desconhecida + '}. Use: ' + VARIAVEIS.map((v) => '{' + v + '}').join(' ') + '.'
  if (/[{}]/.test(modelo.replace(/\{[^{}]*\}/g, ''))) return 'Chaves { } soltas no modelo.'
  if (!usadas.includes('link')) return 'O modelo precisa ter {link}.'
  return ''
}

// Linha so com variaveis vazias some (ex.: oferta sem desconto nao deixa "📉 " solto)
function aplicarModelo(modelo, oferta) {
  const v = valores(oferta)
  const saida = []
  for (const linha of String(modelo).replace(/\r\n/g, '\n').split('\n')) {
    const nomes = [...linha.matchAll(/\{(\w+)\}/g)].map((m) => m[1])
    if (nomes.length && nomes.every((n) => !v[n])) continue
    saida.push(linha.replace(/\{(\w+)\}/g, (_, n) => (v[n] != null ? v[n] : '')))
  }
  return saida.join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, TEXTO_MAX)
}

// Texto base SEM IA: o modelo do cliente, ou o texto de sempre. `padrao` e o texto que quem chama
// ja tinha (ex.: oferta.texto da busca da API): sem modelo do cliente ele segue EXATAMENTE como veio.
function baseTexto(cfg, oferta, padrao) {
  const modelo = cfg && cfg.copy && cfg.copy.modelo
  if (modelo && !validarModelo(modelo)) return aplicarModelo(modelo, oferta)
  return typeof padrao === 'string' && padrao ? padrao : ofertasApi.mensagem(oferta)
}

// ---------- trava anti-invencao ----------

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// "39,90" -> 39.9 ; "12.300" -> 12300 ; "4.8" -> 4.8 ; "1.234,56" -> 1234.56
function numero(token) {
  let t = String(token)
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.')
  else t = t.replace(',', '.')
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}

const TOKEN_NUM = /\d+(?:[.,]\d+)*/g
function numerosDe(texto) {
  const out = []
  for (const m of String(texto).matchAll(TOKEN_NUM)) {
    const depois = String(texto).slice(m.index + m[0].length, m.index + m[0].length + 6)
    out.push({ valor: numero(m[0]), abreviado: /^\s?(k\b|mil\b|mi\b|milh)/i.test(depois) })
  }
  return out
}

const PROMESSA = /\b(cupom|cupons|cupao|frete|gratis|estoque|ultimas?\s+unidades?|restam|ultima\s+chance|entrega|prazo|garantia|parcel\w*|sem juros|cashback|brinde|reembolso)\b/

/**
 * Devolve { ok, motivo }. oferta = dados reais; texto = o que a IA escreveu (sem o link).
 */
function validarIA(texto, oferta) {
  const t = String(texto || '').trim()
  if (t.length < 20) return { ok: false, motivo: 'texto vazio ou curto demais' }
  if (t.length > 700) return { ok: false, motivo: 'texto longo demais' }
  if (t.split('\n').filter((l) => l.trim()).length > 8) return { ok: false, motivo: 'linhas demais' }
  if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(com|br|net|org|me|link|ly)\b/i.test(t)) return { ok: false, motivo: 'a IA escreveu um link' }

  const v = valores(oferta)
  const dados = [v.nome, v.preco, v.desconto, v.nota, v.vendas, v.loja].join(' ')
  const permitidos = new Set(numerosDe(dados).map((n) => n.valor).filter((n) => !Number.isNaN(n)))
  for (const n of numerosDe(t)) {
    if (n.abreviado) return { ok: false, motivo: 'numero abreviado (k/mil) em vez do valor real' }
    if (Number.isNaN(n.valor) || !permitidos.has(n.valor)) return { ok: false, motivo: 'numero inventado: ' + n.valor }
  }
  // o preco e a razao de ser da mensagem
  const primeiroPreco = numerosDe(v.preco)[0]
  if (primeiroPreco && !numerosDe(t).some((n) => n.valor === primeiroPreco.valor)) return { ok: false, motivo: 'faltou o preco' }

  const dadosSemAcento = semAcento(dados)
  const promessa = semAcento(t).match(PROMESSA)
  if (promessa && !new RegExp(promessa[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(dadosSemAcento)) {
    return { ok: false, motivo: 'promessa que os dados nao tem: ' + promessa[0] }
  }
  // fala do produto: pelo menos uma palavra relevante do nome
  const palavras = semAcento(v.nome).split(/[^a-z0-9]+/).filter((w) => w.length >= 4)
  if (palavras.length && !palavras.some((w) => semAcento(t).includes(w))) return { ok: false, motivo: 'nao fala do produto' }
  return { ok: true, motivo: '' }
}

// Tira o que modelos costumam acrescentar sem pedir
function limparSaida(bruto) {
  let t = String(bruto || '')
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```[a-z]*\n?|```/gi, '')
  t = t.replace(/^\s*(mensagem|texto|resposta)\s*:\s*/i, '').trim()
  if (/^["“].*["”]$/s.test(t)) t = t.slice(1, -1).trim()
  return t
}

// ---------- provedores ----------

function promptDe(oferta) {
  const v = valores(oferta)
  const sistema = 'Voce escreve mensagens curtas de promocao para grupos de WhatsApp, em portugues do Brasil, com 2 a 4 emojis. ' +
    'REGRAS: use SOMENTE os dados informados. NAO invente preco, desconto, cupom, frete, prazo nem estoque. ' +
    'Escreva os numeros exatamente como estao nos dados (ex.: 12.300, nao 12k). Inclua o preco. ' +
    'PROIBIDO falar de frete, entrega, prazo, cupom, estoque, garantia ou parcelamento: esses dados nao existem. ' +
    'NAO escreva link (ele e colocado depois). Maximo 5 linhas. Responda so com a mensagem.'
  const dados = ['nome', 'preco', 'desconto', 'nota', 'vendas', 'loja'].filter((k) => v[k]).map((k) => '- ' + k + ': ' + v[k]).join('\n')
  return { sistema, usuario: 'DADOS:\n' + dados + '\n\nMensagem:' }
}

function mascara(chave) {
  const s = String(chave || '')
  return s.length <= 8 ? '••••' : s.slice(0, 4) + '…' + s.slice(-4)
}

// Ollama atende uma geracao por vez (CPU): fila simples
let filaOllama = Promise.resolve()

function ollamaUrl() {
  const u = String(process.env.NAMY_OLLAMA_URL || '').trim().replace(/\/$/, '')
  return /^https?:\/\/[^\s]+$/.test(u) ? u : ''
}

// Ollama so para as contas que o dono listou (nunca o cliente aponta uma URL)
function ollamaPermitido(cfg) {
  if (!ollamaUrl()) return false
  const lista = String(process.env.NAMY_OLLAMA_EMAILS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean)
  return !!(cfg && cfg.email && lista.includes(String(cfg.email).toLowerCase()))
}

/**
 * Chama o provedor e devolve o texto bruto. A chave NUNCA entra em mensagem de erro.
 * opcoes.fetch existe so para teste.
 */
async function chamarProvedor(provedor, chave, oferta, opcoes = {}) {
  const p = PROVEDORES[provedor]
  if (!p) throw erro('Provedor desconhecido.')
  const doFetch = opcoes.fetch || fetch
  const { sistema, usuario } = promptDe(oferta)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), p.local ? OLLAMA_TIMEOUT_MS : IA_TIMEOUT_MS)
  try {
    let url, headers, corpo
    if (p.tipo === 'openai') {
      url = p.url
      headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + chave }
      corpo = { model: p.modelo(), messages: [{ role: 'system', content: sistema }, { role: 'user', content: usuario }], temperature: 0.4, max_tokens: 300 }
    } else if (p.tipo === 'gemini') {
      url = p.url(p.modelo())
      headers = { 'Content-Type': 'application/json', 'x-goog-api-key': chave }
      corpo = { systemInstruction: { parts: [{ text: sistema }] }, contents: [{ role: 'user', parts: [{ text: usuario }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 300 } }
    } else {
      url = ollamaUrl() + '/api/generate'
      headers = { 'Content-Type': 'application/json' }
      corpo = { model: process.env.NAMY_OLLAMA_MODEL || 'qwen3.5:4b', prompt: sistema + '\n\n' + usuario, stream: false, think: false, options: { temperature: 0.4, num_predict: 220 } }
    }
    const r = await doFetch(url, { method: 'POST', headers, body: JSON.stringify(corpo), signal: ctrl.signal })
    if (!r.ok) throw new Error('o provedor respondeu ' + r.status)
    const d = await r.json()
    const texto = p.tipo === 'openai' ? d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content
      : p.tipo === 'gemini' ? d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts && d.candidates[0].content.parts.map((x) => x.text).join('')
        : d.response
    if (!texto) throw new Error('resposta vazia do provedor')
    return String(texto)
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'tempo esgotado' : String(e.message || 'falha').split(chave || '\0').join('***'))
  } finally {
    clearTimeout(timer)
  }
}

async function chamarComFila(provedor, chave, oferta, opcoes) {
  if (provedor !== 'ollama') return chamarProvedor(provedor, chave, oferta, opcoes)
  const vez = filaOllama.then(() => chamarProvedor(provedor, chave, oferta, opcoes))
  filaOllama = vez.then(() => {}, () => {})
  return vez
}

// ---------- principal ----------

/**
 * ctx: { userId, cfg, dataDir }. opcoes: { ia: false desliga a IA (ex.: salvar na fila), padrao (texto-base
 * que ja existia), fetch (so teste) }.
 * Nunca lanca: qualquer falha volta ao modelo. Devolve { texto, via, aviso }.
 *   via: 'modelo' | 'ia:<provedor>'   aviso: '' ou o motivo de ter caido no modelo / qual IA escreveu
 */
async function gerar(ctx, oferta, opcoes = {}) {
  const cfg = ctx.cfg || {}
  const base = baseTexto(cfg, oferta, opcoes.padrao)
  const c = cfg.copy || {}
  if (opcoes.ia === false || !(c.ia && c.ia.ativo)) return { texto: base, via: 'modelo', aviso: '' }

  const provedor = c.ia.provedor
  try {
    let chave = ''
    if (provedor === 'ollama') {
      if (!ollamaPermitido(cfg)) throw new Error('IA local nao liberada para esta conta')
    } else {
      if (!NUVEM.includes(provedor)) throw new Error('provedor invalido')
      chave = String((cofre.ler(ctx.dataDir, ctx.userId, 'ia') || {})[provedor] || '')
      if (!chave) throw new Error('sem chave salva')
    }
    const bruto = await chamarComFila(provedor, chave, oferta, opcoes)
    const texto = limparSaida(bruto)
    const v = validarIA(texto, oferta)
    if (!v.ok) return { texto: base, via: 'modelo', aviso: 'copy: modelo (IA reprovada: ' + v.motivo + ')' }
    return { texto: texto + '\n\n🔗 ' + oferta.link, via: 'ia:' + provedor, aviso: 'copy: IA ' + PROVEDORES[provedor].rotulo }
  } catch (e) {
    return { texto: base, via: 'modelo', aviso: 'copy: modelo (IA indisponivel: ' + String(e.message).slice(0, 80) + ')' }
  }
}

module.exports = {
  VARIAVEIS, PROVEDORES, NUVEM, OFERTA_EXEMPLO,
  validarModelo, aplicarModelo, baseTexto, validarIA, limparSaida, promptDe,
  gerar, chamarProvedor, ollamaPermitido, mascara, numero
}
