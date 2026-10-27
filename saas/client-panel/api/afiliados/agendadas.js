/**
 * Mensagens agendadas (fase 2.2): armazenamento e recorrencia. Dados por cliente em
 * data/agendadas/<userId>.json (escrita atomica via jsonStore).
 *
 * Fuso: America/Sao_Paulo (-03:00 fixo; o Brasil nao tem horario de verao desde 2019).
 * Recorrencia: { tipo: 'uma' | 'diaria' | 'semanal' | 'cada', hora: 'HH:MM',
 *   data (uma, AAAA-MM-DD), dias (semanal, [0..6], 0=domingo), cadaDias (1..60) e inicio (AAAA-MM-DD) }
 * Uma agenda NASCE pausada: so liga por acao explicita do cliente.
 */
const fs = require('fs')
const path = require('path')
const jsonStore = require('./jsonStore')

const PASTA = 'agendadas'
const MAX_AGENDAS = 50
const MAX_TEXTO = 3500
const MAX_DESTINOS = 30
const TOLERANCIA_MS = 30 * 60 * 1000
const HISTORICO = 20
const TZ = 'America/Sao_Paulo'
const vazio = () => ({ itens: [] })
const JID_RE = /^[0-9A-Za-z._-]+@g\.us$/
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/

const erro = (msg, status = 400) => Object.assign(new Error(msg), { status })
const ymdBR = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ms))
const dataValida = (s) => DATA_RE.test(s) && !Number.isNaN(Date.parse(s + 'T12:00:00Z')) && new Date(s + 'T12:00:00Z').toISOString().slice(0, 10) === s
const diaSemana = (ymd) => new Date(ymd + 'T12:00:00Z').getUTCDay()
const diasEntre = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000)
const somaDias = (ymd, n) => new Date(Date.parse(ymd + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10)
const em = (ymd, hora) => Date.parse(ymd + 'T' + hora + ':00-03:00')

function validarRecorrencia(r, agora = Date.now()) {
  if (!r || typeof r !== 'object') throw erro('Escolha quando enviar.')
  if (typeof r.hora !== 'string' || !HORA_RE.test(r.hora)) throw erro('Horário inválido (use HH:MM).')
  const tipo = r.tipo
  if (tipo === 'uma') {
    if (typeof r.data !== 'string' || !dataValida(r.data)) throw erro('Data inválida (AAAA-MM-DD).')
    return { tipo, hora: r.hora, data: r.data }
  }
  if (tipo === 'diaria') return { tipo, hora: r.hora }
  if (tipo === 'semanal') {
    const dias = [...new Set((Array.isArray(r.dias) ? r.dias : []).map(Number))]
    if (!dias.length || dias.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw erro('Escolha pelo menos um dia da semana.')
    return { tipo, hora: r.hora, dias: dias.sort() }
  }
  if (tipo === 'cada') {
    const n = Number(r.cadaDias)
    if (!Number.isInteger(n) || n < 1 || n > 60) throw erro('"A cada N dias": N de 1 a 60.')
    const inicio = r.inicio == null || r.inicio === '' ? ymdBR(agora) : String(r.inicio)
    if (!dataValida(inicio)) throw erro('Data de início inválida (AAAA-MM-DD).')
    return { tipo, hora: r.hora, cadaDias: n, inicio }
  }
  throw erro('Tipo de recorrência inválido.')
}

/** Proxima execucao (ms) estritamente depois de `desde`; null se nao ha mais (agenda unica no passado). */
function proxima(rec, desde) {
  if (rec.tipo === 'uma') {
    const t = em(rec.data, rec.hora)
    return t > desde ? t : null
  }
  let dia = ymdBR(desde)
  for (let i = 0; i < 400; i++, dia = somaDias(dia, 1)) {
    const t = em(dia, rec.hora)
    if (t <= desde) continue
    if (rec.tipo === 'semanal' && !rec.dias.includes(diaSemana(dia))) continue
    if (rec.tipo === 'cada') {
      const d = diasEntre(rec.inicio, dia)
      if (d < 0 || d % rec.cadaDias !== 0) continue
    }
    return t
  }
  return null
}

function proximas(rec, desde, n = 5) {
  const out = []
  let t = desde
  while (out.length < n) {
    t = proxima(rec, t)
    if (t == null) break
    out.push(t)
  }
  return out
}

/** cfg: configuracao da conta. Devolve a lista de destinos limpa ou lanca erro. */
function validarDestinos(destinos, cfg) {
  if (!Array.isArray(destinos) || !destinos.length) throw erro('Escolha pelo menos um grupo.')
  const lista = [...new Set(destinos.map(String))]
  if (lista.length > MAX_DESTINOS) throw erro('No máximo ' + MAX_DESTINOS + ' grupos por agenda.')
  const salvos = new Set((cfg.groups || []).map((g) => g && g.jid))
  const fontes = new Set((cfg.sources || []).map((g) => g && g.jid))
  for (const j of lista) {
    if (!JID_RE.test(j)) throw erro('Grupo inválido.')
    if (!salvos.has(j)) throw erro('Só envio para grupos que você salvou como destino (aba Grupos).')
    if (fontes.has(j)) throw erro('Um grupo de captura (fonte) não pode ser destino.')
  }
  return lista
}

function validar(entrada, cfg, agora = Date.now()) {
  const e = entrada || {}
  const nome = String(e.nome == null ? '' : e.nome).trim().slice(0, 80)
  if (!nome) throw erro('Dê um nome para a agenda.')
  const texto = String(e.texto == null ? '' : e.texto).replace(/\r\n/g, '\n').trim()
  if (!texto) throw erro('Escreva a mensagem.')
  if (texto.length > MAX_TEXTO) throw erro('Mensagem grande demais (máximo ' + MAX_TEXTO + ' caracteres).')
  const imagemUrl = String(e.imagemUrl || '').trim()
  if (imagemUrl && !/^https:\/\/\S+$/.test(imagemUrl)) throw erro('A imagem precisa ser um link https.')
  if (imagemUrl.length > 500) throw erro('Link da imagem grande demais.')
  return { nome, texto, imagemUrl, destinos: validarDestinos(e.destinos, cfg), recorrencia: validarRecorrencia(e.recorrencia, agora) }
}

function listar(dataDir, userId) {
  return (jsonStore.load(dataDir, PASTA, userId, vazio).itens || []).slice()
}

/** Barato: so o arquivo, sem criar pasta (o motor olha todos os clientes a cada 20 s). */
function temAgendas(dataDir, userId) {
  try { return fs.statSync(path.join(dataDir, PASTA, jsonStore.safeId(userId) + '.json')).size > 20 } catch { return false }
}

async function criar(dataDir, userId, cfg, entrada) {
  const v = validar(entrada, cfg)
  return jsonStore.update(dataDir, PASTA, userId, vazio, (db) => {
    db.itens = Array.isArray(db.itens) ? db.itens : []
    if (db.itens.length >= MAX_AGENDAS) throw erro('Limite de ' + MAX_AGENDAS + ' agendas. Apague alguma.')
    const agora = new Date().toISOString()
    const item = Object.assign({ id: jsonStore.id(), ativo: false, proximaEm: null, criadoEm: agora, atualizadoEm: agora, ultimaExecucao: null, historico: [] }, v)
    db.itens.unshift(item)
    return item
  })
}

async function editar(dataDir, userId, cfg, id, entrada) {
  const v = validar(entrada, cfg)
  return jsonStore.update(dataDir, PASTA, userId, vazio, (db) => {
    const it = (db.itens || []).find((i) => i.id === id)
    if (!it) throw erro('Agenda não encontrada.', 404)
    Object.assign(it, v, { atualizadoEm: new Date().toISOString() })
    // Mudou a recorrencia: recalcula (ou pausa, se a unica ja passou)
    if (it.ativo) {
      const p = proxima(it.recorrencia, Date.now())
      if (p == null) { it.ativo = false; it.proximaEm = null } else it.proximaEm = new Date(p).toISOString()
    }
    return it
  })
}

async function ativar(dataDir, userId, id, ativo) {
  return jsonStore.update(dataDir, PASTA, userId, vazio, (db) => {
    const it = (db.itens || []).find((i) => i.id === id)
    if (!it) throw erro('Agenda não encontrada.', 404)
    if (ativo) {
      const p = proxima(it.recorrencia, Date.now())
      if (p == null) throw erro('Essa data já passou. Edite a agenda.')
      it.ativo = true
      it.proximaEm = new Date(p).toISOString()
    } else { it.ativo = false; it.proximaEm = null }
    it.atualizadoEm = new Date().toISOString()
    return it
  })
}

async function remover(dataDir, userId, id) {
  return jsonStore.update(dataDir, PASTA, userId, vazio, (db) => {
    const antes = (db.itens || []).length
    db.itens = (db.itens || []).filter((i) => i.id !== id)
    if (db.itens.length === antes) throw erro('Agenda não encontrada.', 404)
    return true
  })
}

function anotar(it, reg) {
  it.ultimaExecucao = reg
  it.historico = [reg].concat(Array.isArray(it.historico) ? it.historico : []).slice(0, HISTORICO)
}

/**
 * Pega o que venceu e ja AVANCA a proxima execucao (antes de enviar: nunca envia duas vezes).
 * Passou da tolerancia = "perdida": nao envia, so registra. Devolve as agendas para executar.
 */
async function reservarVencidas(dataDir, userId, agora = Date.now()) {
  return jsonStore.update(dataDir, PASTA, userId, vazio, (db) => {
    const rodar = []
    for (const it of db.itens || []) {
      if (!it.ativo || !it.proximaEm) continue
      const prevista = Date.parse(it.proximaEm)
      if (!Number.isFinite(prevista) || prevista > agora) continue
      const prox = proxima(it.recorrencia, Math.max(agora, prevista))
      if (prox == null) { it.ativo = false; it.proximaEm = null } else it.proximaEm = new Date(prox).toISOString()
      if (agora - prevista > TOLERANCIA_MS) {
        anotar(it, { em: new Date(agora).toISOString(), prevista: new Date(prevista).toISOString(), origem: 'agenda', resultado: 'perdida', enviados: 0, falhas: 0, motivo: 'O painel ou o WhatsApp estava fora do ar na hora marcada.', grupos: [] })
      } else rodar.push(Object.assign(JSON.parse(JSON.stringify(it)), { prevista: new Date(prevista).toISOString() }))
    }
    return rodar
  })
}

async function registrarExecucao(dataDir, userId, id, reg) {
  return jsonStore.update(dataDir, PASTA, userId, vazio, (db) => {
    const it = (db.itens || []).find((i) => i.id === id)
    if (it) anotar(it, reg)
  })
}

module.exports = {
  PASTA, MAX_AGENDAS, MAX_TEXTO, MAX_DESTINOS, TOLERANCIA_MS, HISTORICO,
  validar, validarRecorrencia, validarDestinos, proxima, proximas,
  listar, temAgendas, criar, editar, ativar, remover, reservarVencidas, registrarExecucao,
  ymdBR, dataValida
}
