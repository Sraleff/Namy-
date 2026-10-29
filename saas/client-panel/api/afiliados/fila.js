/**
 * Fila de Produtos (Fase 1.2): camada de gerenciamento do banco de ofertas (pool).
 * E a MESMA fila que o publicador le: aqui so se acrescentam status, prioridade,
 * edicao e reenfileirar. Dados em data/pool/<userId>.json (escrita atomica pelo
 * jsonStore, que serializa todas as escritas do mesmo cliente).
 *
 * Status (calculado na hora, nesta ordem):
 *   expirado -> pausado -> enviado (ja foi para >= 1 grupo) -> erro (link nao
 *   pode ser trocado) -> pulado (nicho/qualidade nao bateram) -> fila
 * "enviado" continua elegivel para os grupos que AINDA nao receberam (rodizio).
 */
const fs = require('fs')
const jsonStore = require('./jsonStore')
const pool = require('./pool')
const links = require('./links')
const nichos = require('./nichos')
const qualidade = require('./qualidade')

const PASTA = 'pool'
const vazio = () => ({ itens: [] })

const STATUS = ['fila', 'enviado', 'pulado', 'erro', 'pausado', 'expirado']
const PRIORIDADES = { 0: 'normal', 1: 'alta', 2: 'urgente' }
const MAX_NOME = 120
const MAX_TEXTO = 3500
const MAX_MOTIVO = 200
const LIMITE_PADRAO = 25
const LIMITE_MAX = 300

function erro(msg, status) {
  return Object.assign(new Error(msg), { status: status || 400 })
}

function statusDe(item, agora = Date.now()) {
  if (new Date(item.expiresAt).getTime() <= agora) return 'expirado'
  if (!item.ativo) return 'pausado'
  if (Object.keys(item.enviadoPara || {}).length > 0) return 'enviado'
  if (item.ultimoErro) return 'erro'
  if (item.ultimoPulo) return 'pulado'
  return 'fila'
}

function prioridadeDe(item) {
  const n = Number(item.prioridade)
  return n === 1 || n === 2 ? n : 0
}

// Ordem de exibicao = ordem de envio: prioridade maior primeiro, depois a mais nova
function ordenar(itens) {
  return itens.slice().sort((a, b) => (prioridadeDe(b) - prioridadeDe(a)) || (new Date(b.createdAt) - new Date(a.createdAt)))
}

function publico(item, agora, midiaUrl) {
  return {
    id: item.id,
    nome: item.nome,
    texto: item.texto,
    nicho: item.nicho,
    marketplaces: item.marketplaces || [],
    cupons: item.cupons || [],
    origem: item.origem,
    origemGrupo: item.origemGrupo || '',
    ativo: !!item.ativo,
    prioridade: prioridadeDe(item),
    status: statusDe(item, agora),
    envios: Object.keys(item.enviadoPara || {}).length,
    imagemTipo: item.imagem ? item.imagem.tipo : '',
    imagemUrl: typeof midiaUrl === 'function' ? midiaUrl(item) : '',
    ultimoErro: item.ultimoErro || null,
    ultimoPulo: item.ultimoPulo || null,
    createdAt: item.createdAt,
    editadoEm: item.editadoEm || null,
    expiresAt: item.expiresAt
  }
}

/**
 * opcoes: { status, limite, midiaUrl }
 * Devolve { itens, total, contadores } — total/contadores nao dependem do limite.
 */
function listar(dataDir, userId, opcoes = {}) {
  const agora = Date.now()
  const todos = ordenar(jsonStore.load(dataDir, PASTA, userId, vazio).itens || [])
  const contadores = { todos: todos.length }
  for (const s of STATUS) contadores[s] = 0
  const comStatus = todos.map((i) => ({ i, s: statusDe(i, agora) }))
  for (const x of comStatus) contadores[x.s]++
  const filtro = opcoes.status && STATUS.includes(opcoes.status) ? opcoes.status : ''
  const filtrados = filtro ? comStatus.filter((x) => x.s === filtro) : comStatus
  let limite = Math.floor(Number(opcoes.limite))
  if (!Number.isFinite(limite) || limite < 1) limite = LIMITE_PADRAO
  limite = Math.min(LIMITE_MAX, limite)
  const midiaUrl = opcoes.midiaUrl ? (item) => opcoes.midiaUrl(userId, item) : null
  return {
    itens: filtrados.slice(0, limite).map((x) => publico(x.i, agora, midiaUrl)),
    total: filtrados.length,
    contadores,
    limite
  }
}

function apagarArquivoDaImagem(dataDir, userId, item) {
  if (!item.imagem || item.imagem.tipo !== 'arquivo') return
  const caminho = pool.caminhoMidia(dataDir, userId, item.imagem.valor)
  if (caminho) { try { fs.unlinkSync(caminho) } catch { /* ja nao existe */ } }
}

/**
 * campos (so estes sao lidos; o resto e ignorado):
 *   nome, texto, imagemUrl ('' remove a foto), prioridade (0..2), renovarValidade (bool)
 * O texto precisa continuar com pelo menos um link suportado. Nicho, marketplaces,
 * cupons e assinatura sao recalculados. O que ja foi enviado fica preservado.
 */
async function editar(dataDir, userId, cfg, id, campos = {}) {
  const c = campos && typeof campos === 'object' ? campos : {}
  const quer = (k) => Object.prototype.hasOwnProperty.call(c, k)

  if (quer('nome') && (typeof c.nome !== 'string' || !c.nome.trim() || c.nome.length > MAX_NOME)) {
    throw erro('Nome inválido (1 a ' + MAX_NOME + ' caracteres).')
  }
  if (quer('texto') && (typeof c.texto !== 'string' || !c.texto.trim() || c.texto.length > MAX_TEXTO)) {
    throw erro('Texto inválido (1 a ' + MAX_TEXTO + ' caracteres).')
  }
  if (quer('imagemUrl') && (typeof c.imagemUrl !== 'string' || (c.imagemUrl !== '' && !/^https:\/\/\S+$/.test(c.imagemUrl)) || c.imagemUrl.length > 500)) {
    throw erro('A foto precisa ser um link https (ou vazio para remover).')
  }
  if (quer('prioridade') && !(Number.isInteger(c.prioridade) && c.prioridade >= 0 && c.prioridade <= 2)) {
    throw erro('Prioridade inválida (0 normal, 1 alta, 2 urgente).')
  }
  if (quer('renovarValidade') && typeof c.renovarValidade !== 'boolean') throw erro('renovarValidade deve ser verdadeiro ou falso.')

  return jsonStore.update(dataDir, PASTA, userId, vazio, (db) => {
    const itens = Array.isArray(db.itens) ? db.itens : []
    const item = itens.find((i) => i.id === id)
    if (!item) throw erro('Oferta não encontrada', 404)
    const agora = Date.now()

    if (quer('texto')) {
      const texto = c.texto.replace(/\r\n/g, '\n')
      const mks = [...new Set(links.extrairUrls(texto).map((u) => links.marketplaceDe(u.url)).filter(Boolean))]
      if (!mks.length) throw erro('A oferta precisa ter link da Shopee, Mercado Livre ou Amazon')
      const sig = pool.assinatura(texto)
      const igual = itens.find((i) => i.id !== item.id && i.sig === sig && new Date(i.expiresAt).getTime() > agora)
      if (igual) throw erro('Já existe outra oferta igual a esta no banco.', 409)
      const tituloAutomatico = item.nome === pool.titulo(item.texto)
      item.texto = texto
      item.sig = sig
      item.marketplaces = mks
      item.nicho = nichos.classificar(texto).nicho
      item.cupons = qualidade.cupons(texto)
      // Nome que o usuario nunca mexeu acompanha o texto novo
      if (tituloAutomatico && !quer('nome')) item.nome = pool.titulo(texto)
    }
    if (quer('nome')) item.nome = c.nome.trim()

    if (quer('imagemUrl')) {
      apagarArquivoDaImagem(dataDir, userId, item)
      item.imagem = c.imagemUrl ? { tipo: 'url', valor: c.imagemUrl } : null
    }
    if (quer('prioridade')) item.prioridade = c.prioridade
    if (c.renovarValidade === true) item.expiresAt = new Date(agora + pool.ttlHoras(cfg) * 3600000).toISOString()

    item.editadoEm = new Date(agora).toISOString()
    return item
  }).then((item) => publico(item, Date.now(), null))
}

// Volta o item para o comeco da fila: esquece envios, erro e pulo, renova a validade e reativa
async function reenfileirar(dataDir, userId, cfg, id) {
  return jsonStore.update(dataDir, PASTA, userId, vazio, (db) => {
    const item = (db.itens || []).find((i) => i.id === id)
    if (!item) throw erro('Oferta não encontrada', 404)
    item.enviadoPara = {}
    delete item.ultimoErro
    delete item.ultimoPulo
    item.ativo = true
    item.expiresAt = new Date(Date.now() + pool.ttlHoras(cfg) * 3600000).toISOString()
    item.editadoEm = new Date().toISOString()
    return item
  }).then((item) => publico(item, Date.now(), null))
}

/**
 * Chamado pelo publicador com a lista de "pulados" de um grupo:
 * [{ nome, produtoKey: 'pool:<id>', motivo }]. Motivo "link: ..." = erro;
 * nicho/qualidade = pulado. Falha do WhatsApp NAO passa por aqui (nao e culpa da oferta).
 * Nunca lanca: a fila nao pode derrubar o disparo.
 */
async function registrarPulos(dataDir, userId, pulados, jid) {
  try {
    const marcar = new Map()
    for (const p of pulados || []) {
      const chave = String((p && p.produtoKey) || '')
      if (!chave.startsWith('pool:')) continue
      marcar.set(chave.slice(5), String(p.motivo || '').slice(0, MAX_MOTIVO))
    }
    if (!marcar.size) return
    const at = new Date().toISOString()
    await jsonStore.update(dataDir, PASTA, userId, vazio, (db) => {
      for (const item of db.itens || []) {
        if (!marcar.has(item.id)) continue
        const motivo = marcar.get(item.id)
        const registro = { at, motivo, jid: String(jid || '').slice(0, 80) }
        if (/^link:/i.test(motivo)) item.ultimoErro = registro
        else item.ultimoPulo = registro
      }
    })
  } catch (e) {
    console.error('[FILA] registrarPulos', e.message)
  }
}

module.exports = { statusDe, listar, editar, reenfileirar, registrarPulos, ordenar, STATUS, PRIORIDADES, LIMITE_PADRAO, LIMITE_MAX }
