/**
 * Sessoes WhatsApp reais (Baileys) por conta do painel.
 * Uma sessao por userId. Auth fica em data/sessions/<userId> (nunca no Git).
 * Nao inicia dois sockets para a mesma conta.
 *
 * 428 (connectionClosed) e 408 (connectionLost) sao queda de rede.
 * A sessao registrada volta sozinha, com espera crescente ate 60s.
 * 515 (restartRequired) tambem recria o socket. Nao e logout.
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
  const socketVivo = !!(s.sock && (s.sock.user || s.status !== 'connected'))
  if (s.status === 'connected' && !(s.sock && s.sock.user)) {
    return {
      status: 'error',
      pairingCode: null,
      qrDataUrl: null,
      phone: s.phone || '',
      error: 'Socket caiu. Toque em reconectar.',
      connected: false
    }
  }
  return {
    status: s.status,
    pairingCode: s.pairingCode || null,
    qrDataUrl: s.qrDataUrl || null,
    phone: s.phone || '',
    error: s.error || null,
    connected: s.status === 'connected' && !!(s.sock && s.sock.user) && socketVivo
  }
}

async function baileysVersion() {
  if (versionCache) return versionCache
  const { version } = await fetchLatestBaileysVersion()
  versionCache = version
  return version
}

function quedaTemporaria(code) {
  if (!code) return true
  if (code === DisconnectReason.loggedOut || code === 401) return false
  if (code === DisconnectReason.connectionReplaced || code === 440) return false
  if (code === DisconnectReason.forbidden || code === 403) return false
  if (code === DisconnectReason.multideviceMismatch || code === 411) return false
  if (code === DisconnectReason.restartRequired || code === 515) return false
  return true
}

function limparTimer(entry) {
  if (entry && entry.reconnectTimer) {
    clearTimeout(entry.reconnectTimer)
    entry.reconnectTimer = null
  }
}

function agendarReconexao(userId, code) {
  const cur = get(userId)
  if (!cur || cur.stopping || cur.reconnectTimer) return
  const n = cur.dropCount || 0
  if (code === 500 && n >= 8) {
    setStatus(userId, 'error', { error: 'Sessao invalida. Toque em desconectar e conecte de novo.' })
    return
  }
  cur.dropCount = n + 1
  const espera = Math.min(60000, 3000 * Math.pow(2, Math.min(n, 5)))
  setStatus(userId, 'reconnecting', {
    error: 'Conexao caiu (' + (code || '?') + '). Reconectando em ' + Math.round(espera / 1000) + 's.',
    qrDataUrl: null
  })
  console.log('[SESSAO]', userId.slice(0, 8), 'queda', code || '?', '— reconecta em', Math.round(espera / 1000) + 's')
  cur.reconnectTimer = setTimeout(() => {
    const s = get(userId)
    if (!s || s.stopping) return
    s.reconnectTimer = null
    s.sock = null
    start(userId, s.phone, s.onStatus).catch((e) => {
      console.error('[SESSAO] reconnect', e.message)
      const atual = get(userId)
      if (atual && !atual.stopping) agendarReconexao(userId, code)
    })
  }, espera)
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
  if (existing && existing.sock && (existing.status === 'connecting' || existing.status === 'waiting_code' || existing.status === 'connected' || existing.status === 'reconnecting')) {
    if (phone) existing.phone = String(phone).replace(/\D/g, '')
    return publicState(userId)
  }
  if (existing) {
    existing.stopping = true
    limparTimer(existing)
    if (existing.sock) {
      try { existing.sock.end() } catch (_) {}
    }
    sockets.delete(userId)
  }

  const cleanPhone = String(phone || (existing && existing.phone) || '').replace(/\D/g, '')
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
    onStatus,
    stopping: false,
    reconnectTimer: null,
    restartCount: (existing && existing.restartCount) || 0,
    dropCount: (existing && existing.dropCount) || 0
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
      cur.restartCount = 0
      cur.dropCount = 0
      limparTimer(cur)
      setStatus(userId, 'connected')
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      const loggedOut = code === DisconnectReason.loggedOut || code === 401
      cur.sock = null
      if (cur.stopping) return

      if (loggedOut) {
        limparTimer(cur)
        setStatus(userId, 'disconnected', { error: 'Sessao encerrada no WhatsApp' })
        sockets.delete(userId)
        return
      }

      if (code === DisconnectReason.restartRequired || code === 515) {
        if (cur.restartCount >= 5) {
          setStatus(userId, 'error', { error: 'Muitas tentativas de reinicio (515). Toque em reconectar.' })
          return
        }
        cur.restartCount = (cur.restartCount || 0) + 1
        setStatus(userId, 'reconnecting', { error: null, qrDataUrl: null, pairingCode: null })
        console.log('[SESSAO]', userId.slice(0, 8), '515 restartRequired — reconectando com credenciais salvas')
        setTimeout(() => {
          const s = get(userId)
          if (!s || s.stopping) return
          start(userId, cur.phone, cur.onStatus).catch((e) => {
            console.error('[SESSAO] restart 515 falhou', e.message)
            setStatus(userId, 'error', { error: 'Falha ao reiniciar: ' + (e.message || 'erro') })
          })
        }, 800)
        return
      }

      if (quedaTemporaria(code)) {
        agendarReconexao(userId, code)
        return
      }

      limparTimer(cur)
      const msg = (code === 440)
        ? 'WhatsApp conectou em outro lugar. Toque em reconectar.'
        : 'Conexao caiu (' + (code || '?') + '). Toque em reconectar.'
      setStatus(userId, 'error', { error: msg })
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
  s.stopping = true
  limparTimer(s)
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

async function listGroups(userId) {
  const s = get(userId)
  if (!s || !s.sock || s.status !== 'connected') {
    throw new Error('WhatsApp nao esta conectado')
  }
  const groups = await s.sock.groupFetchAllParticipating()
  return Object.values(groups || {}).map((g) => ({
    jid: g.id,
    name: g.subject || g.id,
    participants: Array.isArray(g.participants) ? g.participants.length : 0
  }))
}

async function sendText(userId, jid, text) {
  return sendOffer(userId, jid, { text })
}

async function sendOffer(userId, jid, { text, imageUrl }) {
  const s = get(userId)
  if (!s || !s.sock || s.status !== 'connected' || !(s.sock.user)) {
    const err = new Error('WhatsApp nao esta conectado')
    err.code = 'WA'
    throw err
  }
  if (!jid || !text) {
    const err = new Error('jid e texto obrigatorios')
    err.code = 'WA'
    throw err
  }
  const caption = String(text).slice(0, 4000)
  const imagem = imageUrl && String(imageUrl).startsWith('https://') ? imageUrl : ''
  try {
    if (imagem) {
      await s.sock.sendMessage(jid, { image: { url: imagem }, caption })
      return true
    }
    await s.sock.sendMessage(jid, { text: caption })
    return true
  } catch (e) {
    if (imagem) {
      try {
        await s.sock.sendMessage(jid, { text: caption })
        return true
      } catch (e2) {
        const err = new Error(e2.message || 'Falha ao enviar')
        err.code = 'WA'
        throw err
      }
    }
    const err = new Error(e.message || 'Falha ao enviar')
    err.code = 'WA'
    throw err
  }
}

module.exports = { start, stop, publicState, restoreRegistered, listGroups, sendText, sendOffer, get }
