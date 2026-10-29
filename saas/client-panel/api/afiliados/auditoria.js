/**
 * Historico de disparos e ofertas puladas, por cliente.
 * data/disparos/<userId>.json — ultimas 500 linhas. Nunca grava token nem secret.
 * tipo: enviado | pulado | falha
 */
const jsonStore = require('./jsonStore')

const PASTA = 'disparos'
const MAX = 500
const vazio = () => ({ rows: [] })

function corta(v, n) {
  return v == null ? '' : String(v).slice(0, n)
}

function registrar(dataDir, userId, e) {
  const row = {
    at: new Date().toISOString(),
    tipo: ['enviado', 'pulado', 'falha'].includes(e.tipo) ? e.tipo : 'pulado',
    motivo: corta(e.motivo, 200),
    grupo: corta(e.grupo, 120),
    jid: corta(e.jid, 80),
    nicho: corta(e.nicho, 20),
    fonte: corta(e.fonte, 12),
    produtoKey: corta(e.produtoKey, 80),
    nome: corta(e.nome, 180),
    imageUrl: /^https:\/\//.test(e.imageUrl || '') ? corta(e.imageUrl, 400) : '',
    marketplaces: Array.isArray(e.marketplaces) ? e.marketplaces.slice(0, 3) : [],
    links: Number(e.links) || 0,
    cupons: Array.isArray(e.cupons) ? e.cupons.slice(0, 5) : [],
    imagem: corta(e.imagem, 12),
    avisos: Array.isArray(e.avisos) ? e.avisos.slice(0, 3).map((a) => corta(a, 160)) : []
  }
  return jsonStore.update(dataDir, PASTA, userId, vazio, (db) => {
    db.rows = [row].concat(Array.isArray(db.rows) ? db.rows : []).slice(0, MAX)
    return row
  })
}

function listar(dataDir, userId, { tipo, limite } = {}) {
  const rows = jsonStore.load(dataDir, PASTA, userId, vazio).rows || []
  const filtrado = tipo ? rows.filter((r) => r.tipo === tipo) : rows
  return filtrado.slice(0, Math.min(500, Math.max(1, Number(limite) || 100)))
}

// Produtos ja enviados para um grupo nos ultimos `dias` (rodizio sem repetir)
function enviadosPara(dataDir, userId, jid, dias) {
  const corte = Date.now() - (dias || 7) * 86400000
  const rows = jsonStore.load(dataDir, PASTA, userId, vazio).rows || []
  return new Set(rows.filter((r) => r.tipo === 'enviado' && r.jid === jid && r.produtoKey && new Date(r.at).getTime() > corte).map((r) => r.produtoKey))
}

function resumo(dataDir, userId) {
  const rows = jsonStore.load(dataDir, PASTA, userId, vazio).rows || []
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  const out = { enviados: 0, pulados: 0, falhas: 0, hoje: { enviados: 0, pulados: 0, falhas: 0 }, motivos: {} }
  const chave = { enviado: 'enviados', pulado: 'pulados', falha: 'falhas' }
  for (const r of rows) {
    out[chave[r.tipo]]++
    const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(r.at))
    if (dia === hoje) out.hoje[chave[r.tipo]]++
    if (r.tipo !== 'enviado' && r.motivo) out.motivos[r.motivo] = (out.motivos[r.motivo] || 0) + 1
  }
  return out
}

// Produtos recentes com imagem (para a tela de imagens por cenario)
function produtosRecentes(dataDir, userId, limite) {
  const rows = jsonStore.load(dataDir, PASTA, userId, vazio).rows || []
  const vistos = new Map()
  for (const r of rows) {
    if (r.tipo !== 'enviado' || !r.produtoKey || !r.imageUrl || vistos.has(r.produtoKey)) continue
    vistos.set(r.produtoKey, { produtoKey: r.produtoKey, nome: r.nome, imageUrl: r.imageUrl, at: r.at })
  }
  return [...vistos.values()].slice(0, limite || 30)
}

module.exports = { registrar, listar, enviadosPara, resumo, produtosRecentes }
