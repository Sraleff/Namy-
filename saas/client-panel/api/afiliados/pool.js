/**
 * Banco de ofertas prontas do cliente: coladas no painel ou capturadas de um
 * grupo fonte. Guarda o texto ORIGINAL; a troca de link acontece na hora do
 * envio, com as credenciais do cliente. Rodizio: cada grupo recebe primeiro a
 * oferta mais nova que ainda nao recebeu.
 * data/pool/<userId>.json  e imagens em data/midia/<userId>/
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const jsonStore = require('./jsonStore')
const links = require('./links')
const nichos = require('./nichos')
const qualidade = require('./qualidade')

const PASTA = 'pool'
const MAX = 300
const vazio = () => ({ itens: [] })

function pastaMidia(dataDir, userId) {
  const dir = path.join(dataDir, 'midia', jsonStore.safeId(userId))
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function assinatura(texto) {
  return crypto.createHash('sha1').update(nichos.semAcento(texto).replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 16)
}

function titulo(texto) {
  const linha = String(texto || '').split('\n').map((l) => l.replace(/https?:\/\/\S+/g, '').trim()).find((l) => l.replace(/[^\p{L}\p{N}]/gu, '').length >= 4)
  return (linha || 'Oferta').slice(0, 120)
}

// itemId/shopId/preco de uma oferta da Shopee (Vitrine), para conferir antes de enviar. Lixo vira nada.
function metaShopee(m) {
  if (!m || typeof m !== 'object') return undefined
  const itemId = String(m.itemId || '')
  if (!/^\d{1,20}$/.test(itemId)) return undefined
  const precoNum = Number(m.precoNum)
  return {
    itemId,
    shopId: /^\d{1,20}$/.test(String(m.shopId || '')) ? String(m.shopId) : '',
    precoNum: Number.isFinite(precoNum) && precoNum > 0 ? precoNum : null
  }
}

function ttlHoras(cfg) {
  const n = Number(cfg && cfg.ads && cfg.ads.poolTtlHours)
  return Number.isFinite(n) ? Math.min(168, Math.max(1, n)) : 48
}

/**
 * entrada: { texto, imageUrl?, imagemBuffer?, imagemExt?, origem, origemGrupo? }
 * Retorna { item, duplicado } ou lanca erro 400 quando nao ha link suportado.
 */
async function adicionar(dataDir, userId, cfg, entrada) {
  const texto = String((entrada && entrada.texto) || '').replace(/\r\n/g, '\n').slice(0, 3500)
  if (!texto.trim()) throw Object.assign(new Error('Cole o texto da oferta'), { status: 400 })
  const urls = links.extrairUrls(texto).map((u) => u.url)
  const mks = [...new Set(urls.map(links.marketplaceDe).filter(Boolean))]
  if (!mks.length) throw Object.assign(new Error('A oferta precisa ter link da Shopee, Mercado Livre ou Amazon'), { status: 400 })
  const sig = assinatura(texto)
  const agora = Date.now()
  return jsonStore.update(dataDir, PASTA, userId, vazio, (db) => {
    db.itens = Array.isArray(db.itens) ? db.itens : []
    const ja = db.itens.find((i) => i.sig === sig && new Date(i.expiresAt).getTime() > agora)
    if (ja) return { item: ja, duplicado: true }
    const id = jsonStore.id()
    let imagem = null
    if (entrada.imagemBuffer && entrada.imagemBuffer.length && entrada.imagemBuffer.length <= 8 * 1024 * 1024) {
      const ext = entrada.imagemExt === 'png' ? 'png' : 'jpg'
      const arquivo = id + '.' + ext
      fs.writeFileSync(path.join(pastaMidia(dataDir, userId), arquivo), entrada.imagemBuffer)
      imagem = { tipo: 'arquivo', valor: arquivo }
    } else if (/^https:\/\/\S+$/.test(String(entrada.imageUrl || ''))) {
      imagem = { tipo: 'url', valor: String(entrada.imageUrl).slice(0, 500) }
    }
    const item = {
      id,
      sig,
      // nome opcional (vitrine): o titulo automatico pegaria a 1a linha do modelo, "OFERTA SHOPEE"
      nome: String((entrada && entrada.nome) || '').trim().slice(0, 120) || titulo(texto),
      texto,
      origem: ['grupo', 'vitrine'].includes(entrada.origem) ? entrada.origem : 'manual',
      origemGrupo: String(entrada.origemGrupo || '').slice(0, 120),
      nicho: nichos.classificar(texto).nicho,
      marketplaces: mks,
      cupons: qualidade.cupons(texto),
      imagem,
      shopee: metaShopee(entrada.shopee),
      ativo: true,
      createdAt: new Date(agora).toISOString(),
      expiresAt: new Date(agora + ttlHoras(cfg) * 3600000).toISOString(),
      enviadoPara: {}
    }
    db.itens.unshift(item)
    // Passou do limite: sai o mais antigo (e a imagem dele)
    for (const velho of db.itens.slice(MAX)) apagarMidia(dataDir, userId, velho)
    db.itens = db.itens.slice(0, MAX)
    return { item, duplicado: false }
  })
}

function apagarMidia(dataDir, userId, item) {
  if (!item || !item.imagem || item.imagem.tipo !== 'arquivo') return
  try { fs.unlinkSync(caminhoMidia(dataDir, userId, item.imagem.valor)) } catch {}
}

function caminhoMidia(dataDir, userId, arquivo) {
  const nome = path.basename(String(arquivo || ''))
  if (!/^[0-9a-f-]{36}\.(jpg|png)$/.test(nome)) return ''
  return path.join(pastaMidia(dataDir, userId), nome)
}

function listar(dataDir, userId) {
  const agora = Date.now()
  return (jsonStore.load(dataDir, PASTA, userId, vazio).itens || []).map((i) => Object.assign({}, i, {
    expirado: new Date(i.expiresAt).getTime() <= agora,
    envios: Object.keys(i.enviadoPara || {}).length
  }))
}

function remover(dataDir, userId, id) {
  return jsonStore.update(dataDir, PASTA, userId, vazio, (db) => {
    const item = (db.itens || []).find((i) => i.id === id)
    if (!item) throw Object.assign(new Error('Oferta não encontrada'), { status: 404 })
    apagarMidia(dataDir, userId, item)
    db.itens = db.itens.filter((i) => i.id !== id)
    return { ok: true }
  })
}

function alternar(dataDir, userId, id, ativo) {
  return jsonStore.update(dataDir, PASTA, userId, vazio, (db) => {
    const item = (db.itens || []).find((i) => i.id === id)
    if (!item) throw Object.assign(new Error('Oferta não encontrada'), { status: 404 })
    item.ativo = !!ativo
    return item
  })
}

/**
 * Candidatas para um grupo, na ordem do rodizio:
 * ativas, nao vencidas, que o grupo ainda nao recebeu, mais novas primeiro.
 * Nicho e qualidade sao checados por quem chama (para registrar o motivo).
 */
function candidatas(dataDir, userId, jid) {
  const agora = Date.now()
  return (jsonStore.load(dataDir, PASTA, userId, vazio).itens || [])
    .filter((i) => i.ativo && new Date(i.expiresAt).getTime() > agora && !(i.enviadoPara || {})[jid])
    // Prioridade maior sai antes; o sort e estavel, entao empate segue a mais nova primeiro
    .sort((a, b) => (Number(b.prioridade) || 0) - (Number(a.prioridade) || 0))
}

function marcarEnviado(dataDir, userId, id, jids) {
  return jsonStore.update(dataDir, PASTA, userId, vazio, (db) => {
    const item = (db.itens || []).find((i) => i.id === id)
    if (!item) return
    item.enviadoPara = item.enviadoPara || {}
    for (const jid of jids) item.enviadoPara[jid] = new Date().toISOString()
  })
}

module.exports = { adicionar, listar, remover, alternar, candidatas, marcarEnviado, caminhoMidia, titulo, assinatura, ttlHoras }
