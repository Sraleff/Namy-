/**
 * Vitrine de ofertas (Fase 1.3): busca na API oficial da Shopee (productOfferV2) com as
 * chaves da conta do cliente, e leva a oferta escolhida para a fila ou para os grupos.
 *
 * Seguranca:
 * - O navegador so manda o itemId. Nome, preco e link vem do ULTIMO RESULTADO guardado no
 *   servidor para aquele cliente (10 min), nunca do corpo da requisicao.
 * - Enviar so aceita grupos que o cliente ja salvou como destino, no maximo 5, respeita o
 *   nicho (a menos que ele marque "enviar mesmo assim") e passa pelo conversor de links.
 */
const ofertasApi = require('../ofertas')
const pool = require('./pool')
const links = require('./links')
const nichos = require('./nichos')
const conversor = require('./conversor')
const auditoria = require('./auditoria')
const copy = require('./copy')
const cupons = require('./cupons')

// Ordenacoes liberadas = so as validadas na API real (conta de afiliado, 24/10/2026):
//   5 comissao decrescente (confirmado)      4 preco crescente (confirmado)
//   2 mais vendidos: o topo traz os campeoes de venda, mas a lista NAO e estritamente
//     decrescente pelo numero de vendas mostrado (correlacao ~0,7-0,8) -> "aproximada"
//   1 padrao da busca (nao da para provar que seja "relevancia")
// Recusados/descartados nos testes: 0 (erro), 3 (lista vazia), 6 (correlacao fraca), 7 (igual ao 1).
const ORDENS = [
  { id: 'comissao', sortType: 5, label: 'Maior comissão' },
  { id: 'vendas', sortType: 2, label: 'Mais vendidos', nota: 'Ordem aproximada: a Shopee prioriza as vendas recentes, então a lista pode não ficar exatamente em ordem pelo total mostrado.' },
  { id: 'menor-preco', sortType: 4, label: 'Menor preço', nota: 'Costuma começar por itens de R$ 1 (anúncios promocionais da Shopee).' },
  { id: 'relevancia', sortType: 1, label: 'Relevância (padrão da Shopee)' }
]

const POR_PAGINA = 20
const KEYWORD_MAX = 80
const PAGINA_MAX = 50
const MAX_GRUPOS = 5
const CACHE_TTL = 10 * 60 * 1000
const CACHE_MAX = 200
const RECENTE_DIAS = 7

const cache = new Map() // userId -> Map(productId -> { oferta, ate })

function erro(msg, status) {
  return Object.assign(new Error(msg), { status: status || 400 })
}

function ordens() {
  return ORDENS.map(({ id, label, nota }) => ({ id, label, nota: nota || '' }))
}

function guardar(userId, itens) {
  let m = cache.get(userId)
  if (!m) { m = new Map(); cache.set(userId, m) }
  const ate = Date.now() + CACHE_TTL
  for (const o of itens) { m.delete(o.productId); m.set(o.productId, { oferta: o, ate }) }
  while (m.size > CACHE_MAX) m.delete(m.keys().next().value)
  if (cache.size > 500) cache.delete(cache.keys().next().value)
}

function achar(userId, itemId) {
  const m = cache.get(userId)
  const hit = m && m.get(String(itemId))
  if (!hit) return null
  if (hit.ate <= Date.now()) { m.delete(String(itemId)); return null }
  return hit.oferta
}

function publica(o, naFila, enviadoRecente) {
  return {
    productId: o.productId,
    nome: o.nome,
    preco: o.preco,
    desconto: o.desconto,
    imageUrl: o.imageUrl,
    ratingStar: o.ratingStar,
    sales: o.sales,
    shopName: o.shopName,
    link: o.link,
    naFila,
    enviadoRecente
  }
}

/**
 * ctx: { userId, cfg, dataDir }; entrada: { keyword, ordem, pagina } (tudo opcional).
 * Devolve { itens, pagina, ordem, keyword, temMais }.
 */
// Anexa o cupom CADASTRADO e vigente (se houver) para a mensagem usar {cupom}
const comCupom = (ctx, o, nicho) => {
  const c = cupons.escolher(ctx.dataDir, ctx.userId, { loja: 'shopee', nicho: nicho || null })
  return c ? Object.assign({}, o, { cupom: c }) : o
}

async function buscar(ctx, entrada = {}, deps = {}) {
  const { userId, cfg, dataDir } = ctx
  if (entrada.keyword != null && typeof entrada.keyword !== 'string') throw erro('Palavra-chave invalida.')
  const keyword = (entrada.keyword || '').trim()
  if (keyword.length > KEYWORD_MAX) throw erro('Palavra-chave muito longa (maximo ' + KEYWORD_MAX + ' caracteres).')
  const ordemId = entrada.ordem == null || entrada.ordem === '' ? ORDENS[0].id : entrada.ordem
  const ordem = ORDENS.find((o) => o.id === ordemId)
  if (!ordem) throw erro('Ordenacao invalida.')
  const pagina = entrada.pagina == null || entrada.pagina === '' ? 1 : Number(entrada.pagina)
  if (!Number.isInteger(pagina) || pagina < 1 || pagina > PAGINA_MAX) throw erro('Pagina invalida (1 a ' + PAGINA_MAX + ').')

  // So cobra a cota depois de validar: erro de digitacao nao gasta busca
  if (typeof deps.liberar === 'function' && !deps.liberar()) throw erro('Muitas buscas seguidas. Espere um minuto.', 429)

  const { itens, recebidos } = await ofertasApi.buscar(cfg.shopee, { keyword, page: pagina, limit: POR_PAGINA, sortType: ordem.sortType })
  guardar(userId, itens)

  const sigsNaFila = new Set(pool.listar(dataDir, userId).filter((i) => !i.expirado).map((i) => i.sig))
  const corte = Date.now() - RECENTE_DIAS * 86400000
  const enviados = new Set(auditoria.listar(dataDir, userId, { tipo: 'enviado', limite: 500 })
    .filter((r) => r.produtoKey && new Date(r.at).getTime() > corte).map((r) => r.produtoKey))

  return {
    itens: itens.map((o) => publica(o, sigsNaFila.has(pool.assinatura(copy.baseTexto(cfg, comCupom(ctx, o)))), enviados.has('shopee:' + o.productId))),
    pagina,
    ordem: ordem.id,
    keyword,
    temMais: recebidos >= POR_PAGINA && pagina < PAGINA_MAX
  }
}

async function salvar(ctx, itemId) {
  const { userId, cfg, dataDir } = ctx
  const o = achar(userId, itemId)
  if (!o) throw erro('Esse resultado expirou. Faca a busca de novo.', 404)
  const f = links.validarFormato(o.link, 'shopee')
  if (!f.ok) throw erro('A oferta veio sem um link valido da Shopee (' + f.motivo + ').')
  const out = await pool.adicionar(dataDir, userId, cfg, {
    texto: copy.baseTexto(cfg, comCupom(ctx, o)),
    nome: o.nome,
    imageUrl: o.imageUrl,
    origem: 'vitrine',
    origemGrupo: 'Vitrine Shopee',
    shopee: { itemId: o.productId, shopId: o.shopId, precoNum: o.precoNum }
  })
  return { item: { id: out.item.id, nome: out.item.nome }, duplicado: out.duplicado }
}

/**
 * entrada: { itemId, jids, forcarNicho }; deps: { sessions, logs, pausaMs }
 * Nada e enviado se a oferta, os grupos ou o link nao passarem. Por grupo, falha do
 * WhatsApp e fora do nicho viram resultado individual, sem derrubar os outros.
 */
async function enviar(ctx, entrada = {}, deps = {}) {
  const { userId, cfg, dataDir } = ctx
  const { sessions, logs } = deps
  const pausaMs = deps.pausaMs == null ? 1200 : deps.pausaMs

  if (!Array.isArray(entrada.jids) || !entrada.jids.length) throw erro('Escolha pelo menos um grupo.')
  if (entrada.jids.some((j) => typeof j !== 'string')) throw erro('Grupo invalido.')
  if (entrada.forcarNicho != null && typeof entrada.forcarNicho !== 'boolean') throw erro('forcarNicho deve ser verdadeiro ou falso.')
  const jids = [...new Set(entrada.jids)]
  if (jids.length > MAX_GRUPOS) throw erro('No maximo ' + MAX_GRUPOS + ' grupos por envio.')
  const destinos = new Map((cfg.groups || []).map((g) => [g.jid, g]))
  if (jids.some((j) => !destinos.has(j))) throw erro('So envio para grupos que voce salvou como destino (aba Grupos).')

  const guardada = achar(userId, entrada.itemId)
  if (!guardada) throw erro('Esse resultado expirou. Faca a busca de novo.', 404)
  if (!sessions || (typeof sessions.publicState === 'function' && !sessions.publicState(userId).connected)) {
    throw erro('O WhatsApp nao esta conectado.')
  }

  // So cobra a cota de envios aqui, antes de gastar uma consulta na Shopee
  if (typeof deps.liberar === 'function' && !deps.liberar()) throw erro('Muitos envios seguidos. Espere um minuto.', 429)

  // Antes de enviar: confere na Shopee se a oferta ainda existe e usa o preco/link de agora
  let o = guardada
  if (cfg.shopee && cfg.shopee.appId && cfg.shopee.secret) {
    let conf
    try {
      conf = await ofertasApi.porItem(cfg.shopee, guardada.productId)
    } catch (e) {
      throw erro('Nao consegui conferir a oferta na Shopee agora. Tente de novo em instantes.', 502)
    }
    if (conf.status === 'indisponivel') throw erro('Essa oferta nao esta mais disponivel na Shopee.', 409)
    o = Object.assign({}, guardada, conf.oferta)
  }

  const nichosEnvio = [...new Set(jids.map((j) => nichos.normalizar((destinos.get(j) || {}).niche)))]
  const c = await copy.gerar(ctx, comCupom(ctx, o, nichosEnvio.length === 1 ? nichosEnvio[0] : null))
  const nichosDest = [...new Set(jids.map((j) => nichos.normalizar((destinos.get(j) || {}).niche)))]
  const atrib = { origem: 'vitrine', nicho: nichosDest.length === 1 ? nichosDest[0] : 'misto' }
  const conv = await conversor.converterTexto(c.texto, Object.assign({}, ctx, { atribuicao: atrib }))
  if (!conv.ok) throw erro('Nao consegui trocar o link: ' + conv.erros.map((e) => e.motivo).join('; '))
  const porGrupo = !!(cfg.comissoes && cfg.comissoes.porGrupo)

  const log = (g, ok, message) => {
    if (!logs) return
    try { logs.append(dataDir, userId, { source: 'anuncio', level: ok ? 'info' : 'error', ok, group: g.name, jid: g.jid, message }) } catch (_) { /* log nao derruba o envio */ }
  }

  const results = []
  let enviados = 0
  for (let i = 0; i < jids.length; i++) {
    const g = destinos.get(jids[i])
    const base = { jid: g.jid, name: g.name, niche: nichos.normalizar(g.niche) }
    const n = nichos.compativel(g, o.nome)
    if (!n.ok && !entrada.forcarNicho) {
      const motivo = 'nicho ' + n.nicho + ': ' + n.motivo
      results.push(Object.assign(base, { ok: false, pulado: true, motivo }))
      await auditoria.registrar(dataDir, userId, { tipo: 'pulado', motivo, grupo: g.name, jid: g.jid, nicho: base.niche, fonte: 'vitrine', produtoKey: 'shopee:' + o.productId, nome: o.nome })
      continue
    }
    try {
      let texto = conv.texto
      if (porGrupo) {
        const cv = await conversor.converterTexto(c.texto, Object.assign({}, ctx, { atribuicao: { origem: 'vitrine', nicho: base.niche, grupo: g.jid } }))
        if (!cv.ok) throw new Error('link: ' + cv.erros.map((e) => e.motivo).join('; '))
        texto = cv.texto
      }
      await sessions.sendOffer(userId, g.jid, { text: texto, imageUrl: o.imageUrl })
      enviados++
      results.push(Object.assign(base, { ok: true }))
      await auditoria.registrar(dataDir, userId, {
        tipo: 'enviado', grupo: g.name, jid: g.jid, nicho: base.niche, fonte: 'vitrine', produtoKey: 'shopee:' + o.productId,
        nome: o.nome, imageUrl: o.imageUrl, marketplaces: ['shopee'], links: conv.trocas.length, imagem: o.imageUrl ? 'url' : '', avisos: conv.trocas.map((t) => t.aviso).filter(Boolean).concat(c.aviso ? [c.aviso] : [])
      })
      log(g, true, 'Vitrine: ' + o.nome.slice(0, 120))
    } catch (e) {
      const wa = e.code === 'WA' || /conectado|jid/i.test(e.message || '')
      results.push(Object.assign(base, { ok: false, error: e.message || 'erro' }))
      await auditoria.registrar(dataDir, userId, { tipo: 'falha', motivo: (wa ? 'WhatsApp: ' : '') + (e.message || 'falha no envio'), grupo: g.name, jid: g.jid, nicho: base.niche, fonte: 'vitrine', produtoKey: 'shopee:' + o.productId, nome: o.nome })
      log(g, false, (wa ? 'WhatsApp: ' : '') + (e.message || 'Falha no envio'))
    }
    if (pausaMs > 0 && i < jids.length - 1) await new Promise((r) => setTimeout(r, pausaMs))
  }
  if (enviados) ofertasApi.lembrar(dataDir, userId, o.productId)
  return { ok: enviados > 0, enviados, results }
}

module.exports = { buscar, salvar, enviar, ordens, ORDENS, MAX_GRUPOS, KEYWORD_MAX, PAGINA_MAX, POR_PAGINA, CACHE_TTL }
