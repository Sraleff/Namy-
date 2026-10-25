/**
 * Cupons do cliente (fase 2.3). A API de afiliados da Shopee nao lista cupom: quem cadastra e o
 * cliente, e nada aqui e inventado. Dados em data/cupons/<userId>.json (escrita atomica).
 *
 * - Vigencia no fuso de Brasilia: do inicio do dia validoDe ate 23:59:59 do dia validoAte.
 * - escolher(): o cupom vigente que a mensagem pode usar ({cupom}); preferencia: o da loja da
 *   oferta (antes do "geral"), depois o que vence primeiro.
 * - vencidoNoTexto(): texto colado/capturado que cita um codigo CADASTRADO que ja nao vale nao sai.
 */
const jsonStore = require('./jsonStore')
const nichos = require('./nichos')
const qualidade = require('./qualidade')

const PASTA = 'cupons'
const MAX_CUPONS = 100
const LOJAS = ['shopee', 'mercadolivre', 'amazon', 'geral']
const CODIGO_RE = /^[A-Z0-9][A-Z0-9_-]{2,23}$/
const vazio = () => ({ itens: [] })
const DIA_MS = 86400000

const erro = (msg, status = 400) => Object.assign(new Error(msg), { status })
const dataValida = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T12:00:00Z')) && new Date(s + 'T12:00:00Z').toISOString().slice(0, 10) === s
const inicioDia = (ymd) => Date.parse(ymd + 'T00:00:00-03:00')
const fimDia = (ymd) => Date.parse(ymd + 'T23:59:59-03:00')

function validar(e) {
  const x = e || {}
  const codigo = String(x.codigo == null ? '' : x.codigo).trim().toUpperCase()
  if (!CODIGO_RE.test(codigo)) throw erro('Codigo invalido: use de 3 a 24 letras, numeros, - ou _ (sem espacos).')
  const loja = String(x.loja || 'shopee')
  if (!LOJAS.includes(loja)) throw erro('Loja invalida (shopee, mercadolivre, amazon ou geral).')
  const regra = String(x.regra == null ? '' : x.regra).replace(/[\r\n\t]+/g, ' ').trim()
  if (regra.length > 120) throw erro('Regra grande demais (maximo 120 caracteres).')
  if (/https?:\/\/|www\./i.test(regra)) throw erro('A regra nao pode ter link.')
  if (/[{}]/.test(regra)) throw erro('A regra nao pode ter chaves { }.')
  const validoAte = String(x.validoAte == null ? '' : x.validoAte)
  if (!dataValida(validoAte)) throw erro('Informe ate quando o cupom vale (AAAA-MM-DD).')
  const validoDe = x.validoDe == null || x.validoDe === '' ? '' : String(x.validoDe)
  if (validoDe && !dataValida(validoDe)) throw erro('Data de inicio invalida (AAAA-MM-DD).')
  if (validoDe && validoDe > validoAte) throw erro('O inicio nao pode ser depois do fim.')
  const lista = Array.isArray(x.nichos) ? x.nichos : []
  if (lista.length > 20) throw erro('Nichos demais.')
  const ns = [...new Set(lista.map((n) => String(n)))]
  if (ns.some((n) => !nichos.existe(n))) throw erro('Nicho invalido.')
  return { codigo, loja, regra, validoDe, validoAte, nichos: ns.filter((n) => n !== 'geral' || ns.length === 1) }
}

/** 'desligado' | 'aguardando' | 'vencido' | 'vence-em-breve' (menos de 48 h) | 'vigente' */
function situacao(c, agora = Date.now()) {
  if (!c.ativo) return 'desligado'
  if (c.validoDe && agora < inicioDia(c.validoDe)) return 'aguardando'
  const fim = fimDia(c.validoAte)
  if (agora > fim) return 'vencido'
  return fim - agora < 2 * DIA_MS ? 'vence-em-breve' : 'vigente'
}
const vale = (c, agora) => ['vigente', 'vence-em-breve'].includes(situacao(c, agora))

function listar(dataDir, userId) {
  return (jsonStore.load(dataDir, PASTA, userId, vazio).itens || []).slice()
}

/**
 * Cupom que a mensagem pode usar. loja: 'shopee'... ou null (qualquer); nicho: nicho UNICO do destino ou null.
 * Cupom restrito a nichos so vale quando o nicho do destino esta na lista.
 */
function escolher(dataDir, userId, { loja = null, nicho = null, agora = Date.now() } = {}) {
  let itens
  try { itens = listar(dataDir, userId) } catch { return null }
  const n = nicho ? nichos.normalizar(nicho) : null
  const aptos = itens.filter((c) => vale(c, agora)
    && (!loja || c.loja === loja || c.loja === 'geral')
    && (!(c.nichos && c.nichos.length) || (n && c.nichos.includes(n))))
  if (!aptos.length) return null
  aptos.sort((a, b) => ((loja && a.loja === loja ? 0 : 1) - (loja && b.loja === loja ? 0 : 1)) || fimDia(a.validoAte) - fimDia(b.validoAte))
  return { codigo: aptos[0].codigo, regra: aptos[0].regra }
}

/** { codigo, motivo } se o texto cita um codigo cadastrado que nao vale mais (e nenhum outro cadastro igual vale). */
function vencidoNoTexto(dataDir, userId, texto, agora = Date.now()) {
  const citados = qualidade.cupons(texto)
  if (!citados.length) return null
  let itens
  try { itens = listar(dataDir, userId) } catch { return null }
  for (const codigo of citados) {
    const regs = itens.filter((c) => c.codigo === codigo)
    if (regs.length && !regs.some((c) => vale(c, agora))) {
      return { codigo, motivo: 'cupom ' + (regs.every((c) => c.ativo === false) ? 'desligado' : 'vencido') + ': ' + codigo }
    }
  }
  return null
}

async function criar(dataDir, userId, entrada) {
  const v = validar(entrada)
  return jsonStore.update(dataDir, PASTA, userId, vazio, (db) => {
    db.itens = Array.isArray(db.itens) ? db.itens : []
    if (db.itens.length >= MAX_CUPONS) throw erro('Limite de ' + MAX_CUPONS + ' cupons. Apague os vencidos.')
    if (db.itens.some((c) => c.codigo === v.codigo && c.loja === v.loja)) throw erro('Esse cupom ja esta cadastrado para essa loja.')
    const agora = new Date().toISOString()
    const item = Object.assign({ id: jsonStore.id(), ativo: true, criadoEm: agora, atualizadoEm: agora }, v)
    db.itens.unshift(item)
    return item
  })
}

async function editar(dataDir, userId, id, entrada) {
  const v = validar(entrada)
  return jsonStore.update(dataDir, PASTA, userId, vazio, (db) => {
    const it = (db.itens || []).find((c) => c.id === id)
    if (!it) throw erro('Cupom nao encontrado.', 404)
    if (db.itens.some((c) => c.id !== id && c.codigo === v.codigo && c.loja === v.loja)) throw erro('Esse cupom ja esta cadastrado para essa loja.')
    Object.assign(it, v, { atualizadoEm: new Date().toISOString() })
    return it
  })
}

async function ativar(dataDir, userId, id, ativo) {
  return jsonStore.update(dataDir, PASTA, userId, vazio, (db) => {
    const it = (db.itens || []).find((c) => c.id === id)
    if (!it) throw erro('Cupom nao encontrado.', 404)
    it.ativo = !!ativo
    it.atualizadoEm = new Date().toISOString()
    return it
  })
}

async function remover(dataDir, userId, id) {
  return jsonStore.update(dataDir, PASTA, userId, vazio, (db) => {
    const antes = (db.itens || []).length
    db.itens = (db.itens || []).filter((c) => c.id !== id)
    if (db.itens.length === antes) throw erro('Cupom nao encontrado.', 404)
    return true
  })
}

module.exports = { PASTA, MAX_CUPONS, LOJAS, validar, situacao, vale, listar, escolher, vencidoNoTexto, criar, editar, ativar, remover }
