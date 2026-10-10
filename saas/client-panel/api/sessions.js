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
  fs.mkdirSync(SESSIONS, { recursive: true })
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
  const result = await fetchLatestBaileysVersion()
  if (!result || !Array.isArray(result.version)) {
    throw new Error('Baileys nao retornou uma versao valida do WhatsApp Web')
  }
  versionCache = result.version
  return versionCache
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
  if (!userId || typeof userId !== 'string') throw new Error('Conta invalida')
  ensure()

  const cleanPhone = String(phone || '').replace(/\D/g, '')
  const existing = get(userId)
  if (existing && ['connecting', 'waiting_code', 'connected'].includes(existing.status)) {
    if (cleanPhone) existing.phone = cleanPhone
    return publicState(userId)
  }
  if (existing) {
    try {
      if (existing.sock) existing.sock.end()
    } catch (_) {}
    sockets.delete(userId)
  }

  const authDir = path.join(SESSIONS, userId)
  fs.mkdirSync(authDir, { recursive: true })

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

  try {
    const { state, saveCreds } = await useMultiFileAuthState(authDir)
    const version = await baileysVersion()

    // A entrada pode ter sido removida enquanto aguardavamos I/O.
    if (get(userId) !== entry) throw new Error('Inicializacao da sessao cancelada')

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
        } catch (err) {
          cur.qrDataUrl = null
          cur.error = 'Nao foi possivel gerar o QR Code'
        }

        if (cur.phone && cur.phone.length >= 10 && !cur.askedCode) {
          cur.askedCode = true
          try {
            let code = await sock.requestPairingCode(cur.phone)
            code = code?.match(/.{1,4}/g)?.join('-') || code
            cur.pairingCode = code
            cur.error = null
          } catch (err) {
            cur.askedCode = false
            cur.error = err?.message || 'Falha ao pedir codigo de pareamento'
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
        } else if (get(userId) === cur) {
          setStatus(userId, 'error', {
            error: 'Conexao caiu (' + (code || '?') + '). Toque em reconectar.'
          })
        }
      }
    })

    sock.ev.on('messages.upsert', async ({ messages }) => {
      // O painel ainda tem somente o comando de verificacao !ping.
      for (const message of messages || []) {
        if (!message.message || message.key.fromMe) continue
        const text = message.message.conversation || message.message.extendedTextMessage?.text || ''
        if (String(text).trim().toLowerCase() === '!ping') {
          try {
            await sock.sendMessage(message.key.remoteJid, { text: 'pong - Namy conectada pelo painel' })
          } catch (_) {}
        }
      }
    })

    return publicState(userId)
  } catch (err) {
    // Nunca deixar a conta presa em "connecting" se auth/version/socket falhar.
    if (get(userId) === entry) {
      try { if (entry.sock) entry.sock.end() } catch (_) {}
      setStatus(userId, 'error', {
        sock: null,
        pairingCode: null,
        qrDataUrl: null,
        error: err?.message || 'Falha ao iniciar a sessao WhatsApp'
      })
    }
    throw err
  }
}

async function stop(userId, logout) {
  const s = get(userId)
  if (!s) return publicState(userId)

  // Remover primeiro evita que eventos tardios ressuscitem o estado da sessao.
  sockets.delete(userId)
  try {
    if (logout && s.sock) await s.sock.logout()
    else if (s.sock) s.sock.end()
  } catch (_) {}

  if (logout) {
    const dir = path.join(SESSIONS, userId)
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch (_) {}
  }
  return { status: 'disconnected', pairingCode: null, qrDataUrl: null, phone: '', error: null, connected: false }
}

function restoreRegistered(onStatus) {
  ensure()
  let dirs = []
  try { dirs = fs.readdirSync(SESSIONS, { withFileTypes: true }).filter((item) => item.isDirectory()).map((item) => item.name) } catch { return }

  for (const id of dirs) {
    const creds = path.join(SESSIONS, id, 'creds.json')
    if (!fs.existsSync(creds)) continue
    let registered = false
    try {
      const json = JSON.parse(fs.readFileSync(creds, 'utf8'))
      registered = !!json.registered
    } catch { continue }
    if (!registered) continue

    start(id, '', onStatus).catch((err) => {
      console.error('[SESSAO] restore', id.slice(0, 8), err.message)
    })
  }
}

module.exports = { start, stop, publicState, restoreRegistered }
