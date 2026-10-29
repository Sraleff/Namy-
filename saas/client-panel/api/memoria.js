/**
 * Memoria de mensagens por conta (uma por sessao WhatsApp do painel).
 *
 * O Baileys precisa disso para recuperar mensagem que chegou ilegivel
 * ("No matching sessions found"): ele pede reenvio ao remetente e, quando
 * alguem pede reenvio de uma mensagem NOSSA, busca o conteudo em getMessage.
 * Sem memoria, a recuperacao falha e a mensagem se perde.
 *
 * - mensagens: ultimas MAX_MSGS por conta, salvas em data/memoria/<userId>.json
 *   (sobrevive a reinicio do painel). Guarda so o conteudo do proto, sem midia.
 * - retry: contador de pedidos de reenvio (msgRetryCounterCache), em memoria.
 * - grupos: metadados de grupo (cachedGroupMetadata), em memoria com TTL.
 */
const fs = require('fs')
const path = require('path')
const { BufferJSON } = require('@whiskeysockets/baileys')

const DIR = path.join(__dirname, 'data', 'memoria')
const MAX_MSGS = 1500
const GRUPO_TTL = 5 * 60 * 1000
const RETRY_TTL = 60 * 60 * 1000
const SALVAR_A_CADA = 30 * 1000

const contas = new Map()

function safeId(userId) {
  return String(userId || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80)
}

function arquivo(userId) {
  return path.join(DIR, safeId(userId) + '.json')
}

// Cache simples com TTL no formato CacheStore do Baileys
function cacheTtl(ttl) {
  const m = new Map()
  return {
    get(k) {
      const v = m.get(k)
      if (!v) return undefined
      if (Date.now() > v.ate) { m.delete(k); return undefined }
      return v.valor
    },
    set(k, valor) { m.set(k, { valor, ate: Date.now() + ttl }) },
    del(k) { m.delete(k) },
    flushAll() { m.clear() }
  }
}

function carregar(userId) {
  try {
    const raw = JSON.parse(fs.readFileSync(arquivo(userId), 'utf8'), BufferJSON.reviver)
    return new Map(Array.isArray(raw) ? raw : [])
  } catch {
    return new Map()
  }
}

function conta(userId) {
  const id = safeId(userId)
  let c = contas.get(id)
  if (!c) {
    c = {
      mensagens: carregar(id),
      retry: cacheTtl(RETRY_TTL),
      grupos: cacheTtl(GRUPO_TTL),
      sujo: false,
      timer: null
    }
    contas.set(id, c)
  }
  return c
}

function chaveDe(key) {
  return key ? (String(key.remoteJid || '') + '|' + String(key.id || '')) : ''
}

function salvarDepois(userId) {
  const c = conta(userId)
  c.sujo = true
  if (c.timer) return
  c.timer = setTimeout(() => {
    c.timer = null
    salvar(userId)
  }, SALVAR_A_CADA)
  if (c.timer.unref) c.timer.unref()
}

function salvar(userId) {
  const c = contas.get(safeId(userId))
  if (!c || !c.sujo) return
  try {
    fs.mkdirSync(DIR, { recursive: true })
    const tmp = arquivo(userId) + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify([...c.mensagens], BufferJSON.replacer))
    fs.renameSync(tmp, arquivo(userId))
    c.sujo = false
  } catch (e) {
    console.error('[MEMORIA] salvar', e.message)
  }
}

// Midia pesada nao entra: para reenvio basta o texto/legenda e os metadados
function semMidiaPesada(message) {
  const m = Object.assign({}, message)
  for (const tipo of ['imageMessage', 'videoMessage', 'stickerMessage', 'audioMessage', 'documentMessage']) {
    if (m[tipo] && m[tipo].jpegThumbnail) m[tipo] = Object.assign({}, m[tipo], { jpegThumbnail: undefined })
  }
  return m
}

function guardar(userId, m) {
  if (!m || !m.key || !m.key.id || !m.message) return
  const c = conta(userId)
  const k = chaveDe(m.key)
  c.mensagens.delete(k)
  c.mensagens.set(k, semMidiaPesada(m.message))
  while (c.mensagens.size > MAX_MSGS) c.mensagens.delete(c.mensagens.keys().next().value)
  salvarDepois(userId)
}

async function mensagem(userId, key) {
  return conta(userId).mensagens.get(chaveDe(key)) || undefined
}

// Opcoes de memoria para o makeWASocket desta conta
function opcoesSocket(userId, getSock) {
  const c = conta(userId)
  return {
    getMessage: (key) => mensagem(userId, key),
    msgRetryCounterCache: c.retry,
    cachedGroupMetadata: async (jid) => {
      const hit = c.grupos.get(jid)
      if (hit) return hit
      const sock = getSock()
      if (!sock) return undefined
      try {
        const meta = await sock.groupMetadata(jid)
        if (meta) c.grupos.set(jid, meta)
        return meta
      } catch {
        return undefined
      }
    }
  }
}

function esquecerGrupo(userId, jid) {
  conta(userId).grupos.del(jid)
}

function esquecerConta(userId) {
  const id = safeId(userId)
  const c = contas.get(id)
  if (c && c.timer) clearTimeout(c.timer)
  contas.delete(id)
  try { fs.unlinkSync(arquivo(id)) } catch {}
}

function salvarTudo() {
  for (const id of contas.keys()) salvar(id)
}
process.once('beforeExit', salvarTudo)
for (const sinal of ['SIGINT', 'SIGTERM']) {
  process.once(sinal, () => { salvarTudo(); process.exit(0) })
}

module.exports = { guardar, mensagem, opcoesSocket, esquecerGrupo, esquecerConta, salvarTudo }
