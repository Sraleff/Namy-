/**
 * Sessoes WhatsApp reais (Baileys) por conta do painel.
 * Uma sessao por userId. Auth fica em data/sessions/<userId> (nunca no Git).
 * Nao inicia dois sockets para a mesma conta.
 */
const fs = require('fs')
const path = require('path')
const pino = require('pino')
const QRCode = require('qrcode')

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  DisconnectReason
} = require('@whiskeysockets/baileys')

const DATA = path.join(__dirname, 'data')
const SESSIONS = path.join(DATA, 'sessions')

const sockets = new Map()
let versionCache = null

function ensure() {
  if (!fs.existsSync(SESSIONS)) fs.mkdirSync(SESSIONS, { recursive: true })
}

function get(userId) {
  return sockets.get(userId) || null
}

function publicState(userId) {
  const s = get(userId)
  if (!s) {
    return { status: 'disconnected', pairingCode: null, qrDataUrl: null, phone: '', error: null, connected: false }
  }
  return {
    status: s.status,
    pairingCode: s.pairingCode || null,
    qrDataUrl: s.qrDataUrl || null,
    phone: s.phone || '',
    error: s.error || null,
    connected: s.status === 'connected'
  }
}

async function baileysVersion() {
  if (versionCache) return versionCache
  const { version } = await fetchLatestBaileysVersion()
  versionCache = version
  return version
}

function setStatus(userId, status, extra = {}) {
  const s = get(userId)
  if (!s) return
  s.status = status
  Object.assign(s, extra)
  if (typeof s.onStatus === 'function') {
    try { s.onStatus(userId, status) } catch (_) {}
  }
}

async function start(userId, phone, onStatus) {
  ensure()
  const existing = get(userId)
  if (existing && (existing.status === 'connecting' || existing.status === 'waiting_code' || existing.status === 'connected')) {
    if (phone) existing.phone = String(phone).replace(/\D/g, '')
    return publicState(userId)
  }
  if (existing && existing.sock) {
    try { existing.sock.end() } catch (_) {}
    sockets.delete(userId)
  }

  const cleanPhone = String(phone || '').replace(/\D/g, '')
  const authDir = path.join(SESSIONS, userId)
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true })

  const entry = {
    userId,
    phone: cleanPhone,
    status: 'connecting',
    pairingCode: null,
    qrDataUrl: null,
    error: null,
    sock: null,
    askedCode: false,
    onStatus
  }
  sockets.set(userId, entry)

  const { state, saveCreds } = await useMultiFileAuthState(authDir)
  const version = await baileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: Browsers.ubuntu('Chrome'),
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: true
  })
  entry.sock = sock

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update
    const cur = get(userId)
    if (!cur || cur.sock !== sock) return

    if (qr && !sock.authState.creds.registered) {
      try {
        cur.qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 280 })
      } catch (_) {
        cur.qrDataUrl = null
      }
      if (cur.phone && cur.phone.length >= 10 && !cur.askedCode) {
        cur.askedCode = true
        try {
          let codigo = await sock.requestPairingCode(cur.phone)
          codigo = codigo?.match(/.{1,4}/g)?.join('-') || codigo
          cur.pairingCode = codigo
        } catch (err) {
          cur.askedCode = false
          cur.error = err?.message || 'Falha ao pedir codigo'
        }
      }
      setStatus(userId, 'waiting_code')
    }

    if (connection === 'open') {
      cur.qrDataUrl = null
      cur.pairingCode = null
      cur.error = null
      setStatus(userId, 'connected')
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      const loggedOut = code === DisconnectReason.loggedOut
      cur.sock = null
      if (loggedOut) {
        setStatus(userId, 'disconnected', { error: 'Sessao encerrada no WhatsApp' })
        sockets.delete(userId)
      } else if (get(userId)) {
        setStatus(userId, 'error', { error: 'Conexao caiu (' + (code || '?') + '). Toque em reconectar.' })
      }
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const m of messages || []) {
      if (!m.message || m.key.fromMe) continue
      const text = m.message.conversation || m.message.extendedTextMessage?.text || ''
      if (String(text).trim().toLowerCase() === '!ping') {
        try {
          await sock.sendMessage(m.key.remoteJid, { text: 'pong - Namy conectada pelo painel' })
        } catch (_) {}
      }
    }
  })

  return publicState(userId)
}

async function stop(userId, logout) {
  const s = get(userId)
  if (!s) return publicState(userId)
  try {
    if (logout && s.sock) await s.sock.logout()
    else if (s.sock) s.sock.end()
  } catch (_) {}
  sockets.delete(userId)
  if (logout) {
    const dir = path.join(SESSIONS, userId)
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch (_) {}
  }
  return { status: 'disconnected', pairingCode: null, qrDataUrl: null, phone: '', error: null, connected: false }
}

function restoreRegistered(onStatus) {
  ensure()
  let dirs = []
  try { dirs = fs.readdirSync(SESSIONS) } catch { return }
  for (const id of dirs) {
    const creds = path.join(SESSIONS, id, 'creds.json')
    if (!fs.existsSync(creds)) continue
    let registered = false
    try {
      const j = JSON.parse(fs.readFileSync(creds, 'utf8'))
      registered = !!j.registered
    } catch { continue }
    if (!registered) continue
    start(id, '', onStatus).catch((e) => {
      console.error('[SESSAO] restore', id.slice(0, 8), e.message)
    })
  }
}

module.exports = { start, stop, publicState, restoreRegistered }
