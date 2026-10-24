/**
 * Imagens geradas por produto, por cliente.
 * Indice: data/imagens/<userId>.json   Arquivos: data/imagens-arquivos/<userId>/<id>.<ext>
 * produtoKey: "shopee:<itemId>" (oferta da API) ou "pool:<id>" (oferta colada/capturada).
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const jsonStore = require('../jsonStore')
const links = require('../links')
const pool = require('../pool')
const cenarios = require('./cenarios')
const gerador = require('./gerador')

const PASTA = 'imagens'
const MAX_POR_CLIENTE = 200
const MAX_REF = 8 * 1024 * 1024
const vazio = () => ({ itens: [], dia: '', geradasHoje: 0 })
const ultimoPedido = new Map()

const KEY_RE = /^(shopee:\d{1,20}|pool:[0-9a-f-]{36})$/

function pasta(dataDir, userId) {
  const dir = path.join(dataDir, 'imagens-arquivos', jsonStore.safeId(userId))
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function caminho(dataDir, userId, item) {
  const nome = path.basename(String((item && item.arquivo) || ''))
  if (!/^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(nome)) return ''
  return path.join(pasta(dataDir, userId), nome)
}

function hoje() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

function limiteDiario() {
  const n = Number(process.env.NAMY_IMAGE_DAILY)
  return Number.isFinite(n) && n > 0 ? Math.min(500, n) : 20
}

function erro(msg, status) {
  return Object.assign(new Error(msg), { status: status || 400 })
}

// Foto de referencia: arquivo do banco de ofertas ou URL https publica
async function referencia(dataDir, userId, { produtoKey, imageUrl }) {
  if (produtoKey.startsWith('pool:')) {
    const item = pool.listar(dataDir, userId).find((i) => 'pool:' + i.id === produtoKey)
    if (item && item.imagem && item.imagem.tipo === 'arquivo') {
      const file = pool.caminhoMidia(dataDir, userId, item.imagem.valor)
      if (file && fs.existsSync(file)) return { buffer: fs.readFileSync(file), mime: file.endsWith('.png') ? 'image/png' : 'image/jpeg' }
    }
    if (item && item.imagem && item.imagem.tipo === 'url') imageUrl = item.imagem.valor
  }
  if (!/^https:\/\/\S+$/.test(String(imageUrl || ''))) throw erro('Este produto nao tem foto de referencia')
  let out
  try {
    out = await links.buscarSeguro(String(imageUrl), { method: 'GET', saltos: 3, timeoutMs: 15000 })
  } catch (e) {
    throw erro('Nao consegui baixar a foto do produto: ' + e.message)
  }
  const mime = String(out.response.headers.get('content-type') || '').split(';')[0].trim()
  if (!/^image\/(jpeg|png|webp)$/.test(mime)) throw erro('A foto do produto nao e JPG, PNG ou WEBP')
  const tamanho = Number(out.response.headers.get('content-length') || 0)
  if (tamanho > MAX_REF) throw erro('Foto do produto grande demais')
  const buffer = Buffer.from(await out.response.arrayBuffer())
  if (!buffer.length || buffer.length > MAX_REF) throw erro('Foto do produto vazia ou grande demais')
  return { buffer, mime }
}

/**
 * Gera uma imagem do produto no cenario. Respeita 1 pedido a cada 15s
 * e o limite diario por cliente (NAMY_IMAGE_DAILY, padrao 20).
 */
async function gerar(dataDir, userId, { produtoKey, nome, imageUrl, cenario }) {
  if (!KEY_RE.test(String(produtoKey || ''))) throw erro('Produto invalido')
  if (!cenarios.existe(cenario)) throw erro('Cenario invalido')
  if (!gerador.disponivel()) throw erro('Gerador de imagens desligado: defina GEMINI_API_KEY no .env do client-panel.', 503)
  const antes = ultimoPedido.get(userId) || 0
  if (Date.now() - antes < 15000) throw erro('Espere 15 segundos entre geracoes.', 429)
  const db0 = jsonStore.load(dataDir, PASTA, userId, vazio)
  const feitas = db0.dia === hoje() ? Number(db0.geradasHoje) || 0 : 0
  if (feitas >= limiteDiario()) throw erro('Limite de ' + limiteDiario() + ' imagens por dia atingido.', 429)
  ultimoPedido.set(userId, Date.now())

  const ref = await referencia(dataDir, userId, { produtoKey, imageUrl })
  const out = await gerador.gerar({ referencia: ref, prompt: cenarios.prompt(cenario, nome) })
  const id = crypto.randomUUID()
  const ext = out.mime === 'image/jpeg' ? 'jpg' : out.mime === 'image/webp' ? 'webp' : 'png'
  const arquivo = id + '.' + ext
  fs.writeFileSync(path.join(pasta(dataDir, userId), arquivo), out.buffer)

  return jsonStore.update(dataDir, PASTA, userId, vazio, (db) => {
    db.itens = Array.isArray(db.itens) ? db.itens : []
    if (db.dia !== hoje()) { db.dia = hoje(); db.geradasHoje = 0 }
    db.geradasHoje = (Number(db.geradasHoje) || 0) + 1
    const item = {
      id,
      produtoKey,
      nome: String(nome || '').slice(0, 180),
      cenario,
      arquivo,
      mime: out.mime,
      createdAt: new Date().toISOString(),
      // primeira imagem do produto ja vira a preferida
      preferida: !db.itens.some((i) => i.produtoKey === produtoKey && i.preferida)
    }
    db.itens.unshift(item)
    for (const velho of db.itens.slice(MAX_POR_CLIENTE)) {
      try { fs.unlinkSync(caminho(dataDir, userId, velho)) } catch {}
    }
    db.itens = db.itens.slice(0, MAX_POR_CLIENTE)
    return item
  })
}

function listar(dataDir, userId, produtoKey) {
  const db = jsonStore.load(dataDir, PASTA, userId, vazio)
  const itens = (db.itens || []).filter((i) => !produtoKey || i.produtoKey === produtoKey)
  return { itens, geradasHoje: db.dia === hoje() ? Number(db.geradasHoje) || 0 : 0, limiteDiario: limiteDiario() }
}

function obter(dataDir, userId, id) {
  return (jsonStore.load(dataDir, PASTA, userId, vazio).itens || []).find((i) => i.id === id) || null
}

function preferir(dataDir, userId, id) {
  return jsonStore.update(dataDir, PASTA, userId, vazio, (db) => {
    const alvo = (db.itens || []).find((i) => i.id === id)
    if (!alvo) throw erro('Imagem nao encontrada', 404)
    const marcar = !alvo.preferida
    for (const i of db.itens) if (i.produtoKey === alvo.produtoKey) i.preferida = false
    alvo.preferida = marcar
    return alvo
  })
}

function remover(dataDir, userId, id) {
  return jsonStore.update(dataDir, PASTA, userId, vazio, (db) => {
    const alvo = (db.itens || []).find((i) => i.id === id)
    if (!alvo) throw erro('Imagem nao encontrada', 404)
    try { fs.unlinkSync(caminho(dataDir, userId, alvo)) } catch {}
    db.itens = db.itens.filter((i) => i.id !== id)
    return { ok: true }
  })
}

// Usada pelo publicador: imagem preferida do produto, se existir no disco
function preferidaDe(dataDir, userId, produtoKey) {
  const item = (jsonStore.load(dataDir, PASTA, userId, vazio).itens || []).find((i) => i.produtoKey === produtoKey && i.preferida)
  if (!item) return ''
  const file = caminho(dataDir, userId, item)
  return file && fs.existsSync(file) ? file : ''
}

// URL assinada para o <img> do painel (o navegador nao manda o Bearer)
function assinar(segredo, userId, id, exp) {
  return crypto.createHmac('sha256', String(segredo)).update(userId + ':' + id + ':' + exp).digest('base64url')
}

// caminho: rota que serve o arquivo; id: o que entra na assinatura
function urlAssinada(segredo, userId, id, caminho) {
  const exp = Date.now() + 3600000
  const base = caminho || '/imagens/arquivo/' + id
  return base + '?u=' + encodeURIComponent(userId) + '&e=' + exp + '&s=' + assinar(segredo, userId, id, exp)
}

function conferirAssinatura(segredo, userId, id, exp, sig) {
  if (!userId || !id || !(Number(exp) > Date.now())) return false
  const certo = Buffer.from(assinar(segredo, userId, id, exp))
  const veio = Buffer.from(String(sig || ''))
  return certo.length === veio.length && crypto.timingSafeEqual(certo, veio)
}

module.exports = { gerar, listar, obter, preferir, remover, preferidaDe, caminho, urlAssinada, conferirAssinatura, KEY_RE }
