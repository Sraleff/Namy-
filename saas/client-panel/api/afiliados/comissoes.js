/**
 * Comissoes (fase 2.1): le o conversionReport da Shopee do proprio cliente e agrega.
 * So mostra o que a API devolve; nenhum valor e estimado por nos. Comissao "estimada" da Shopee
 * muda de status por semanas (pendente -> concluido/cancelado).
 *
 * Periodo: ate 90 dias, buscado em janelas de 30 dias, paginado por scrollId (limite de paginas).
 * Cache de 10 min em memoria e o ultimo resultado guardado em data/comissoes/<userId>.json.
 */
const ofertasApi = require('../ofertas')
const atribuicao = require('./atribuicao')
const jsonStore = require('./jsonStore')

const DIA = 86400
const JANELA = 30 * DIA
const MAX_DIAS = 90
const MAX_PAGINAS = 20
const CACHE_MS = 10 * 60 * 1000
const PASTA = 'comissoes'
const cache = new Map() // userId|de|ate -> { ate, resumo }

const TZ = 'America/Sao_Paulo'
const diaBR = (seg) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(seg * 1000))
const centavos = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) : 0 }

function statusDe(s) {
  const t = String(s || '').toLowerCase()
  if (/cancel|fraud|invalid|reject/.test(t)) return 'cancelado'
  if (/complet|paid|settle|valid|conclu/.test(t)) return 'concluido'
  if (/pend|unpaid|wait|process|aguard/.test(t)) return 'pendente'
  return 'outro'
}

function periodo(de, ate, agora = Date.now()) {
  const fim = ate ? Date.parse(ate + 'T23:59:59-03:00') : agora
  const ini = de ? Date.parse(de + 'T00:00:00-03:00') : fim - 30 * DIA * 1000
  if (!Number.isFinite(fim) || !Number.isFinite(ini) || ini >= fim) throw Object.assign(new Error('Período inválido'), { status: 400 })
  if (fim - ini > MAX_DIAS * DIA * 1000) throw Object.assign(new Error('O período máximo é de ' + MAX_DIAS + ' dias.'), { status: 400 })
  if (fim > agora + DIA * 1000) throw Object.assign(new Error('Período no futuro.'), { status: 400 })
  return { inicio: Math.floor(ini / 1000), fim: Math.min(Math.floor(fim / 1000), Math.floor(agora / 1000)) }
}

async function baixar(shopee, inicio, fim) {
  const todos = []
  let truncado = false
  for (let a = inicio; a < fim; a += JANELA) {
    const b = Math.min(fim, a + JANELA)
    let scrollId = ''
    for (let pag = 0; pag < MAX_PAGINAS; pag++) {
      const r = await ofertasApi.conversoes(shopee, { inicio: a, fim: b, scrollId })
      todos.push(...r.nodes)
      if (!r.hasNextPage || !r.scrollId) { scrollId = ''; break }
      scrollId = r.scrollId
      if (pag === MAX_PAGINAS - 1) truncado = true
    }
  }
  return { todos, truncado }
}

const soma = (mapa, chave, c, comissao) => {
  const x = mapa.get(chave) || { chave, vendas: 0, comissao: 0 }
  x.vendas += 1
  x.comissao += comissao
  mapa.set(chave, x)
}
const lista = (mapa, nomeDe) => [...mapa.values()].sort((a, b) => b.comissao - a.comissao).map((x) => ({ nome: nomeDe ? nomeDe(x.chave) : x.chave, vendas: x.vendas, comissao: x.comissao / 100 }))

function agregar(nodes, grupos) {
  const total = { pendente: 0, concluido: 0, cancelado: 0, outro: 0 }
  const vendas = { pendente: 0, concluido: 0, cancelado: 0, outro: 0 }
  const dia = new Map(); const origem = new Map(); const nicho = new Map(); const grupo = new Map(); const prod = new Map()
  const hashes = new Map((grupos || []).map((g) => [atribuicao.hashGrupo(g.jid), g.name || g.jid]))
  const vistos = new Set()
  for (const n of nodes) {
    if (!n || vistos.has(String(n.conversionId))) continue
    vistos.add(String(n.conversionId))
    const st = statusDe(n.conversionStatus)
    const com = centavos(n.netCommission != null && n.netCommission !== '' ? n.netCommission : n.totalCommission)
    total[st] += com
    vendas[st] += 1
    if (st === 'cancelado') continue // cancelada nao entra nas quebras: nao e dinheiro
    const at = atribuicao.desfazer(n.utmContent)
    soma(dia, diaBR(Number(n.purchaseTime) || 0), 0, com)
    soma(origem, at.origem === 'namy' ? 'namy (antes da atribuicao)' : at.origem, 0, com)
    if (at.nicho) soma(nicho, at.nicho, 0, com)
    if (at.grupoHash) soma(grupo, at.grupoHash, 0, com)
    for (const o of n.orders || []) for (const it of o.items || []) {
      const p = prod.get(String(it.itemId)) || { chave: String(it.itemId), nome: String(it.itemName || '').slice(0, 120), vendas: 0, comissao: 0 }
      p.vendas += Number(it.qty) || 1
      p.comissao += centavos(it.itemTotalCommission)
      prod.set(p.chave, p)
    }
  }
  const reais = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v / 100]))
  const porDia = [...dia.values()].sort((a, b) => (a.chave < b.chave ? -1 : 1)).map((x) => ({ dia: x.chave, vendas: x.vendas, comissao: x.comissao / 100 }))
  return {
    totais: reais(total),
    vendas,
    estimado: (total.pendente + total.concluido + total.outro) / 100,
    porDia,
    porOrigem: lista(origem),
    porNicho: lista(nicho),
    porGrupo: lista(grupo, (h) => hashes.get(h) || 'grupo removido (' + h + ')'),
    produtos: [...prod.values()].sort((a, b) => b.comissao - a.comissao).slice(0, 10).map((p) => ({ itemId: p.chave, nome: p.nome, vendas: p.vendas, comissao: p.comissao / 100 }))
  }
}

/** ctx: { userId, cfg, dataDir }. opts: { de, ate (YYYY-MM-DD), forcar } */
async function resumo(ctx, opts = {}) {
  const chaves = ctx.cfg && ctx.cfg.shopee
  if (!chaves || !chaves.appId || !chaves.secret) throw Object.assign(new Error('Salve App ID e Secret da Shopee.'), { status: 400, code: 'SHOPEE' })
  const { inicio, fim } = periodo(opts.de, opts.ate)
  const ck = ctx.userId + '|' + String(opts.de || '') + '|' + String(opts.ate || '')
  const hit = cache.get(ck)
  if (!opts.forcar && hit && hit.ate > Date.now()) return hit.resumo
  let baixado
  try {
    baixado = await baixar(chaves, inicio, fim)
  } catch (e) {
    const velho = jsonStore.load(ctx.dataDir, PASTA, ctx.userId, () => ({})).ultimo
    let det = String(e.message || 'erro')
    for (const seg of [chaves.secret, chaves.appId]) if (seg) det = det.split(String(seg)).join('***')
    const err = new Error('Não consegui ler o relatório da Shopee agora (' + det.slice(0, 100) + ').')
    err.status = e.status && e.status < 500 && e.status !== 400 ? e.status : 502
    if (velho) err.ultimo = velho
    throw err
  }
  const r = Object.assign({
    ok: true,
    atualizadoEm: new Date().toISOString(),
    periodo: { de: opts.de || diaBR(inicio), ate: opts.ate || diaBR(fim) },
    truncado: baixado.truncado,
    porGrupoAtivo: !!(ctx.cfg.comissoes && ctx.cfg.comissoes.porGrupo)
  }, agregar(baixado.todos, ctx.cfg.groups))
  if (cache.size > 500) cache.delete(cache.keys().next().value)
  cache.set(ck, { ate: Date.now() + CACHE_MS, resumo: r })
  await jsonStore.update(ctx.dataDir, PASTA, ctx.userId, () => ({}), (db) => { db.ultimo = r })
  return r
}

function ultimo(dataDir, userId) {
  return jsonStore.load(dataDir, PASTA, userId, () => ({})).ultimo || null
}

module.exports = { resumo, ultimo, agregar, periodo, statusDe, CACHE_MS, _cache: cache }
