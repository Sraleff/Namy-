/**
 * Captação (D5): duas páginas públicas por cliente, no mesmo endereço aleatório (slug).
 *   /g/<slug>  link de grupos: leva o visitante ao próximo grupo com vaga (rotação de convites)
 *   /v/<slug>  vitrine pública: as últimas ofertas enviadas, com o link de afiliado do cliente
 *
 * data/captacao/<userId>.json          config, ofertas da vitrine e cliques por dia (só contagens)
 * data/captacao-indice/slugs.json      slug -> userId
 *
 * PRIVACIDADE: o visitante não é registrado (sem IP, cookie ou identificador); só somamos
 * cliques por dia. O slug é aleatório e não revela id, e-mail nem telefone do cliente.
 * O link da vitrine é convertido UMA vez, quando a oferta sai para os grupos (atribuição
 * "pagina"); visitar a página nunca chama a API da Shopee do cliente.
 */
const crypto = require('crypto')
const jsonStore = require('./jsonStore')
const links = require('./links')
const conversor = require('./conversor')
const { ymdBR } = require('./membros')

const PASTA = 'captacao'
const PASTA_INDICE = 'captacao-indice'
const SLUG_RE = /^[a-z0-9]{10}$/
const ITEM_RE = /^[0-9a-f]{10}$/
const JID_RE = /^[0-9A-Za-z._-]+@g\.us$/
const CONVITE_RE = /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]{10,40}$/
const ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789'
const MAX_GRUPOS = 20
const MAX_ITENS = 60
const RETENCAO_DIAS = 90
const LIMITE_WHATSAPP = 1024
const TAMANHO_TTL = 5 * 60 * 1000
const CONVITE_TTL = 6 * 3600 * 1000
const FALHA_TTL = 30 * 60 * 1000

const padraoGrupos = () => ({ ativo: false, titulo: '', descricao: '', jids: [], limite: 1000, modo: 'sequencial' })
const padraoVitrine = () => ({ ativo: false, titulo: '', descricao: '', horas: 48, botaoGrupo: true })
const vazio = () => ({ slug: '', grupos: padraoGrupos(), vitrine: padraoVitrine(), itens: [], cliques: {} })
const indiceVazio = () => ({ slugs: {} })
const erro = (msg, status = 400) => Object.assign(new Error(msg), { status })

// Texto livre do cliente: sem controle nem < >, cortado. O HTML ainda escapa tudo na hora de mostrar.
const textoCurto = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

function normalizar(db) {
  const d = db && typeof db === 'object' ? db : vazio()
  d.grupos = Object.assign(padraoGrupos(), d.grupos || {})
  d.vitrine = Object.assign(padraoVitrine(), d.vitrine || {})
  d.itens = Array.isArray(d.itens) ? d.itens : []
  d.cliques = d.cliques && typeof d.cliques === 'object' ? d.cliques : {}
  return d
}

const carregar = (dataDir, userId) => normalizar(jsonStore.load(dataDir, PASTA, userId, vazio))
const atualizar = (dataDir, userId, fn) => jsonStore.update(dataDir, PASTA, userId, vazio, (db) => fn(normalizar(db)))

// ---------------------------------------------------------------- endereço (slug)

function gerarSlug() {
  let s = ''
  for (let i = 0; i < 10; i++) s += ALFABETO[crypto.randomInt(ALFABETO.length)]
  return s
}

function donoDoSlug(dataDir, slug) {
  if (!SLUG_RE.test(String(slug || ''))) return ''
  const idx = jsonStore.load(dataDir, PASTA_INDICE, 'slugs', indiceVazio)
  return String((idx.slugs || {})[slug] || '')
}

/** Endereço novo: o antigo para de funcionar na hora. */
async function trocarSlug(dataDir, userId) {
  const slug = await jsonStore.update(dataDir, PASTA_INDICE, 'slugs', indiceVazio, (idx) => {
    idx.slugs = idx.slugs && typeof idx.slugs === 'object' ? idx.slugs : {}
    for (const [s, u] of Object.entries(idx.slugs)) if (u === userId) delete idx.slugs[s]
    let novo = gerarSlug()
    while (idx.slugs[novo]) novo = gerarSlug()
    idx.slugs[novo] = userId
    return novo
  })
  await atualizar(dataDir, userId, (db) => { db.slug = slug })
  return slug
}

async function garantirSlug(dataDir, userId) {
  const db = carregar(dataDir, userId)
  if (db.slug && donoDoSlug(dataDir, db.slug) === userId) return db.slug
  return trocarSlug(dataDir, userId)
}

// ---------------------------------------------------------------- configuração

function validarGrupos(cfg, body) {
  const b = body || {}
  if (b.jids != null && !Array.isArray(b.jids)) throw erro('Lista de grupos inválida.')
  const destinos = new Set((cfg.groups || []).map((g) => g && g.jid))
  const fontes = new Set((cfg.sources || []).map((g) => g && g.jid))
  const jids = [...new Set((b.jids || []).map((j) => String(j)))]
  if (jids.length > MAX_GRUPOS) throw erro('No máximo ' + MAX_GRUPOS + ' grupos no link.')
  for (const j of jids) {
    if (!JID_RE.test(j)) throw erro('Grupo inválido.')
    if (fontes.has(j)) throw erro('Um grupo de captura (fonte) não entra no link de grupos.')
    if (!destinos.has(j)) throw erro('Use só grupos salvos como destino (aba Grupos).')
  }
  const limite = b.limite == null || b.limite === '' ? 1000 : Number(b.limite)
  if (!Number.isInteger(limite) || limite < 10 || limite > LIMITE_WHATSAPP) throw erro('Limite por grupo: de 10 a ' + LIMITE_WHATSAPP + ' pessoas.')
  const modo = b.modo == null || b.modo === '' ? 'sequencial' : String(b.modo)
  if (!['sequencial', 'equilibrado'].includes(modo)) throw erro('Modo inválido (sequencial ou equilibrado).')
  const ativo = b.ativo === true
  if (ativo && !jids.length) throw erro('Escolha pelo menos um grupo para ligar o link.')
  return { ativo, titulo: textoCurto(b.titulo, 80), descricao: textoCurto(b.descricao, 300), jids, limite, modo }
}

function validarVitrine(body) {
  const b = body || {}
  const horas = b.horas == null || b.horas === '' ? 48 : Number(b.horas)
  if (!Number.isInteger(horas) || horas < 6 || horas > 168) throw erro('Tempo na vitrine: de 6 a 168 horas.')
  return { ativo: b.ativo === true, titulo: textoCurto(b.titulo, 80), descricao: textoCurto(b.descricao, 300), horas, botaoGrupo: b.botaoGrupo !== false }
}

const salvarGrupos = (dataDir, userId, cfg, body) => { const v = validarGrupos(cfg, body); return atualizar(dataDir, userId, (db) => { db.grupos = v; return v }) }
const salvarVitrine = (dataDir, userId, body) => { const v = validarVitrine(body); return atualizar(dataDir, userId, (db) => { db.vitrine = v; return v }) }

// ---------------------------------------------------------------- vitrine pública

function precoDe(oferta) {
  if (oferta.preco) return textoCurto(oferta.preco, 40)
  const m = String(oferta.texto || oferta.textoOriginal || '').match(/R\$\s?\d[\d.]*(?:,\d{2})?(?:\s?[–-]\s?R\$\s?\d[\d.]*(?:,\d{2})?)?/)
  return m ? textoCurto(m[0], 40) : ''
}

function visiveis(db, agora = Date.now()) {
  const corte = agora - db.vitrine.horas * 3600000
  return db.itens.filter((i) => new Date(i.at).getTime() > corte)
}

/**
 * Depois de um envio que deu certo: guarda a oferta na vitrine (se ligada), com um link de
 * afiliado próprio da página (subId "pagina"). Falha aqui nunca afeta o envio aos grupos.
 * ctx = { userId, cfg, dataDir }; oferta = a mesma do publicador.
 */
async function registrarOferta(ctx, oferta, nicho, opcoes = {}) {
  const { userId, dataDir } = ctx
  if (!oferta || !userId) return null
  const db = carregar(dataDir, userId)
  if (!db.vitrine.ativo) return null
  const agora = opcoes.agora || Date.now()
  const chave = textoCurto(oferta.produtoKey, 80) || 'sig:' + crypto.createHash('sha1').update(String(oferta.texto || '')).digest('hex').slice(0, 16)
  const ja = db.itens.find((i) => i.chave === chave)
  if (ja) {
    // Mesmo produto de novo: só volta para o topo; o link de antes continua valendo
    return atualizar(dataDir, userId, (d) => {
      const it = d.itens.find((i) => i.chave === chave)
      if (!it) return null
      it.at = new Date(agora).toISOString()
      d.itens = [it].concat(d.itens.filter((i) => i !== it))
      return it
    })
  }
  const base = String(oferta.textoOriginal || oferta.texto || '')
  const url = links.extrairUrls(base).map((u) => u.url).find((u) => links.marketplaceDe(u))
  if (!url) return null
  const converter = opcoes.converterTexto || conversor.converterTexto
  const conv = await converter(url, Object.assign({}, ctx, { atribuicao: { origem: 'pagina', nicho } }))
  const troca = conv && conv.ok && (conv.trocas || [])[0]
  if (!troca || !/^https:\/\//.test(String(troca.para || '')) || !links.marketplaceDe(troca.para)) return null
  const item = {
    id: crypto.randomBytes(5).toString('hex'),
    chave,
    nome: textoCurto(oferta.nome, 140) || 'Oferta',
    preco: precoDe(oferta),
    imageUrl: /^https:\/\/\S+$/.test(String(oferta.imageUrl || '')) ? String(oferta.imageUrl).slice(0, 500) : '',
    link: String(troca.para).slice(0, 500),
    marketplace: links.marketplaceDe(troca.para),
    at: new Date(agora).toISOString()
  }
  return atualizar(dataDir, userId, (d) => {
    if (!d.vitrine.ativo) return null
    const corte = agora - 168 * 3600000
    d.itens = [item].concat(d.itens.filter((i) => i.chave !== chave && new Date(i.at).getTime() > corte)).slice(0, MAX_ITENS)
    return item
  })
}

const removerItem = async (dataDir, userId, id) => {
  if (!ITEM_RE.test(String(id || ''))) throw erro('Oferta inválida.')
  return atualizar(dataDir, userId, (db) => {
    const antes = db.itens.length
    db.itens = db.itens.filter((i) => i.id !== id)
    if (db.itens.length === antes) throw erro('Oferta não encontrada.', 404)
    return { ok: true }
  })
}

/** Link guardado da oferta, só se for de marketplace suportado (nada de redirecionamento aberto). */
function linkDoItem(db, id, agora = Date.now()) {
  if (!ITEM_RE.test(String(id || ''))) return ''
  const it = visiveis(db, agora).find((i) => i.id === id)
  if (!it || !/^https:\/\//.test(it.link) || !links.marketplaceDe(it.link)) return ''
  return it.link
}

// ---------------------------------------------------------------- rotação de convites

const tamanhos = new Map() // userId -> { at, mapa: Map(jid -> participantes) }
const convites = new Map() // "userId|jid" -> { url, at }
const falhas = new Map() // "userId|jid" -> { at, motivo }
const pendentes = new Map() // "userId|jid" -> entradas desde a última leitura do tamanho

const conectado = (sessions, userId) => !!(sessions && sessions.publicState(userId).connected)

async function lerTamanhos(sessions, userId, agora) {
  const hit = tamanhos.get(userId)
  if (hit && agora - hit.at < TAMANHO_TTL) return hit.mapa
  if (!conectado(sessions, userId)) return hit ? hit.mapa : null
  try {
    const lista = await sessions.listGroups(userId)
    const mapa = new Map((lista || []).map((g) => [g.jid, Number(g.participants) || 0]))
    tamanhos.set(userId, { at: agora, mapa })
    for (const k of [...pendentes.keys()]) if (k.startsWith(userId + '|')) pendentes.delete(k)
    return mapa
  } catch {
    return hit ? hit.mapa : null
  }
}

async function convite(sessions, userId, jid, agora) {
  const k = userId + '|' + jid
  const c = convites.get(k)
  if (c && agora - c.at < CONVITE_TTL) return c.url
  const f = falhas.get(k)
  if (f && agora - f.at < FALHA_TTL) return ''
  // WhatsApp fora: o convite que já tínhamos costuma continuar valendo
  if (!conectado(sessions, userId)) return c ? c.url : ''
  try {
    const r = await sessions.inviteLink(userId, jid)
    const url = String((r && r.url) || '')
    if (!CONVITE_RE.test(url)) throw new Error('convite em formato inesperado')
    convites.set(k, { url, at: agora })
    falhas.delete(k)
    return url
  } catch (e) {
    falhas.set(k, { at: agora, motivo: textoCurto(e && e.message, 160) || 'falha ao ler o convite' })
    convites.delete(k)
    return ''
  }
}

function jidsValidos(cfg, conf) {
  const destinos = new Map((cfg.groups || []).map((g) => [g && g.jid, g]))
  const fontes = new Set((cfg.sources || []).map((g) => g && g.jid))
  return { destinos, jids: conf.jids.filter((j) => destinos.has(j) && !fontes.has(j)) }
}

/**
 * Próximo grupo com vaga. sequencial: enche um por vez, na ordem escolhida; equilibrado: o menor.
 * Grupo sem convite (a conta não é admin) fica de fora por 30 min.
 */
async function escolherGrupo({ sessions }, userId, cfg, conf, agora = Date.now()) {
  const { destinos, jids } = jidsValidos(cfg, conf)
  if (!jids.length) return null
  const mapa = await lerTamanhos(sessions, userId, agora)
  const tam = (j) => (mapa && mapa.has(j) ? mapa.get(j) + (pendentes.get(userId + '|' + j) || 0) : null)
  // Com a lista de grupos em mãos, grupo que a conta já não participa sai da rotação
  let cands = jids.filter((j) => !mapa || mapa.has(j)).filter((j) => { const t = tam(j); return t == null || t < conf.limite })
  if (conf.modo === 'equilibrado') cands = cands.slice().sort((a, b) => (tam(a) || 0) - (tam(b) || 0))
  for (const j of cands) {
    const url = await convite(sessions, userId, j, agora)
    if (url) return { jid: j, nome: (destinos.get(j) || {}).name || j, url, tamanho: tam(j) }
  }
  return null
}

function registrarEntrada(userId, jid) {
  const k = userId + '|' + jid
  pendentes.set(k, (pendentes.get(k) || 0) + 1)
}

/** Situação de cada grupo do link (para o painel). Não pede convite novo ao WhatsApp. */
async function statusGrupos({ sessions }, userId, cfg, conf, agora = Date.now()) {
  const { destinos } = jidsValidos(cfg, conf)
  const mapa = await lerTamanhos(sessions, userId, agora)
  return conf.jids.map((j) => {
    const k = userId + '|' + j
    const c = convites.get(k)
    const f = falhas.get(k)
    const tamanho = mapa && mapa.has(j) ? mapa.get(j) + (pendentes.get(k) || 0) : null
    let convite = 'ainda não lido'
    if (f && agora - f.at < FALHA_TTL) convite = 'erro'
    else if (c) convite = 'ok'
    return {
      jid: j,
      nome: (destinos.get(j) || {}).name || j,
      destino: destinos.has(j),
      noWhatsapp: mapa ? mapa.has(j) : null,
      tamanho,
      cheio: tamanho != null && tamanho >= conf.limite,
      convite,
      erro: convite === 'erro' ? f.motivo : ''
    }
  })
}

// ---------------------------------------------------------------- cliques (só contagens)

const buffer = new Map() // userId -> Map("dia|tipo|chave" -> n)

function contarClique(userId, tipo, chave, agora = Date.now()) {
  if (!['g', 'v'].includes(tipo)) return
  const k = ymdBR(agora) + '|' + tipo + '|' + String(chave).slice(0, 80)
  const m = buffer.get(userId) || new Map()
  m.set(k, (m.get(k) || 0) + 1)
  buffer.set(userId, m)
}

async function gravarCliques(dataDir, agora = Date.now()) {
  const corte = ymdBR(agora - RETENCAO_DIAS * 86400000)
  for (const [userId, m] of [...buffer.entries()]) {
    buffer.delete(userId)
    await atualizar(dataDir, userId, (db) => {
      for (const [k, n] of m) {
        const [dia, tipo, chave] = k.split('|')
        db.cliques[dia] = db.cliques[dia] || { g: {}, v: {} }
        db.cliques[dia][tipo] = db.cliques[dia][tipo] || {}
        db.cliques[dia][tipo][chave] = (db.cliques[dia][tipo][chave] || 0) + n
      }
      for (const dia of Object.keys(db.cliques)) if (dia < corte) delete db.cliques[dia]
    }).catch((e) => console.error('[CAPTACAO] cliques', e.message))
  }
}

function resumoCliques(db, dias = 7, agora = Date.now()) {
  const porDia = []
  const porGrupo = {}
  const porItem = {}
  for (let i = dias - 1; i >= 0; i--) {
    const dia = ymdBR(agora - i * 86400000)
    const c = db.cliques[dia] || {}
    let g = 0
    let v = 0
    for (const [jid, n] of Object.entries(c.g || {})) { g += n; porGrupo[jid] = (porGrupo[jid] || 0) + n }
    for (const [id, n] of Object.entries(c.v || {})) { v += n; porItem[id] = (porItem[id] || 0) + n }
    porDia.push({ dia, grupos: g, vitrine: v })
  }
  return { porDia, porGrupo, porItem }
}

let timer = null
function iniciar(dataDir) {
  if (timer) return
  timer = setInterval(() => { gravarCliques(dataDir) }, 15000)
  if (timer.unref) timer.unref()
}

module.exports = {
  PASTA, SLUG_RE, ITEM_RE, CONVITE_RE, MAX_GRUPOS, MAX_ITENS, LIMITE_WHATSAPP,
  carregar, donoDoSlug, garantirSlug, trocarSlug, gerarSlug,
  validarGrupos, validarVitrine, salvarGrupos, salvarVitrine,
  registrarOferta, removerItem, visiveis, linkDoItem, precoDe,
  escolherGrupo, registrarEntrada, statusGrupos,
  contarClique, gravarCliques, resumoCliques, iniciar,
  _cache: { tamanhos, convites, falhas, pendentes, buffer }
}
