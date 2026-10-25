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
  DisconnectReason,
  makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys')
const memoria = require('./memoria')

const DATA = path.join(__dirname, 'data')
const SESSIONS = path.join(DATA, 'sessions')

const sockets = new Map()
let versionCache = null

// Ouvintes de mensagens recebidas (captura de ofertas, comando !nicho).
// fn(userId, mensagem, sock, type). Erro de um ouvinte nao derruba a sessao.
const ouvintes = new Set()
function onMensagem(fn) {
  if (typeof fn === 'function') ouvintes.add(fn)
  return () => ouvintes.delete(fn)
}

// Diagnostico (desligado por padrao): metadados, sem conteudo, das mensagens de grupo
// que chegam, em data/captura-debug.jsonl (ultimas 300 linhas). Ligue com NAMY_DEBUG_CAPTURA=1
// no .env quando precisar ver se mensagens chegam legiveis ou "No matching sessions".
function diagnostico(userId, m, type) {
  if (process.env.NAMY_DEBUG_CAPTURA !== '1') return
  try {
    const jid = String((m.key && m.key.remoteJid) || '')
    if (!jid.endsWith('@g.us')) return
    const file = path.join(__dirname, 'data', 'captura-debug.jsonl')
    const linha = JSON.stringify({
      at: new Date().toISOString(), user: String(userId).slice(0, 8), jid, type,
      fromMe: !!(m.key && m.key.fromMe), temMsg: !!m.message, stub: m.messageStubType || null,
      stubParams: (m.messageStubParameters || []).slice(0, 2), chaves: m.message ? Object.keys(m.message).slice(0, 6) : []
    })
    let linhas = []
    try { linhas = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean) } catch {}
    linhas.push(linha)
    fs.writeFileSync(file, linhas.slice(-300).join('\n') + '\n')
  } catch (_) {}
}

// requestPairingCode grava me.id (name '~') e pairingCode ANTES de o celular confirmar.
// So conta como pareada a sessao que tem account/signalIdentities (login por QR ou
// codigo confirmado) ou registered. me.id sozinho = pareamento nunca concluido.
function pareada(creds) {
  return !!(creds && (creds.registered || creds.account ||
    (Array.isArray(creds.signalIdentities) && creds.signalIdentities.length > 0)))
}

function credsDoDisco(authDir) {
  try { return JSON.parse(fs.readFileSync(path.join(authDir, 'creds.json'), 'utf8')) } catch { return null }
}

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
  // Pareamento que nunca foi confirmado no celular: tentar logar com ele da 408 em loop.
  // Comeca limpo para gerar QR/codigo novos.
  const salvo = credsDoDisco(authDir)
  if (salvo && !pareada(salvo)) {
    for (const f of fs.readdirSync(authDir)) fs.rmSync(path.join(authDir, f), { recursive: true, force: true })
  }

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

  let sock
  try {
    const { state, saveCreds } = await useMultiFileAuthState(authDir)
    const version = await baileysVersion()
    // A entrada pode ter sido trocada/removida enquanto esperavamos o disco/rede
    if (get(userId) !== entry) throw new Error('Inicializacao da sessao cancelada')

    const logger = pino({ level: 'silent' })
    sock = makeWASocket({
      version,
      // Chaves do Signal em cache: menos leitura de disco e menos falha de decriptacao
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
      logger,
      browser: Browsers.ubuntu('Chrome'),
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: true,
      // Memoria: reenvio de mensagem ilegivel, contador de retry e cache de grupos
      ...memoria.opcoesSocket(userId, () => (get(userId) || {}).sock)
    })
    entry.sock = sock
    sock.ev.on('creds.update', saveCreds)
  } catch (e) {
    // Falha no meio da inicializacao nao pode deixar a conta presa em "conectando"
    if (get(userId) === entry) {
      sockets.delete(userId)
      if (onStatus) onStatus(userId, 'error')
    }
    throw e
  }

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

      // Codigo/QR expirou sem ninguem confirmar no celular: nao ha o que reconectar
      if (!pareada(sock.authState.creds)) {
        limparTimer(cur)
        setStatus(userId, 'disconnected', {
          error: 'O pareamento nao foi concluido (o codigo expirou ou nao foi digitado no celular). Toque em Conectar para gerar outro codigo.',
          qrDataUrl: null,
          pairingCode: null
        })
        sockets.delete(userId)
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

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    for (const m of messages || []) {
      diagnostico(userId, m, type)
      memoria.guardar(userId, m)
      // Ouvintes recebem tambem mensagens que nao deu para ler (m.message vazio),
      // para a captura poder dizer por que nada entrou no banco
      if (m.message || m.messageStubType) {
        for (const fn of ouvintes) {
          Promise.resolve().then(() => fn(userId, m, sock, type)).catch((e) => console.error('[SESSAO] ouvinte', e.message))
        }
      }
      if (!m.message || m.key.fromMe) continue
      const text = m.message.conversation || m.message.extendedTextMessage?.text || ''
      if (String(text).trim().toLowerCase() === '!ping') {
        try {
          await sock.sendMessage(m.key.remoteJid, { text: 'pong - Namy conectada pelo painel' })
        } catch (_) {}
      }
    }
  })

  // Grupo mudou: metadado em cache fica velho
  sock.ev.on('groups.update', (lista) => { for (const g of lista || []) if (g.id) memoria.esquecerGrupo(userId, g.id) })
  sock.ev.on('group-participants.update', (ev) => { if (ev && ev.id) memoria.esquecerGrupo(userId, ev.id) })

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
    memoria.esquecerConta(userId)
  }
  return { status: 'disconnected', pairingCode: null, qrDataUrl: null, phone: '', error: null, connected: false }
}

// existe(id): opcional; pula sessoes de contas que nao existem mais
function restoreRegistered(onStatus, existe) {
  ensure()
  let dirs = []
  try { dirs = fs.readdirSync(SESSIONS) } catch { return }
  for (const id of dirs) {
    if (typeof existe === 'function' && !existe(id)) continue
    const creds = path.join(SESSIONS, id, 'creds.json')
    if (!fs.existsSync(creds)) continue
    let registered = false
    try {
      const j = JSON.parse(fs.readFileSync(creds, 'utf8'))
      registered = pareada(j)
    } catch { continue }
    if (!registered) continue
    start(id, '', onStatus).catch((e) => {
      console.error('[SESSAO] restore', id.slice(0, 8), e.message)
    })
  }
}

// O WhatsApp limita groupFetchAllParticipating (rate-overlimit) se for chamado em sequencia, o que
// acontece ao abrir varias telas ou reiniciar o painel. Por isso: cache de 60 s, uma consulta por vez
// por usuario e, se o WhatsApp recusar, devolve a ultima lista boa (ate 6 h) em vez de erro.
const GRUPOS_TTL = 60 * 1000
const GRUPOS_VELHO = 6 * 3600 * 1000
const gruposCache = new Map() // userId -> { at, list }
const gruposVoo = new Map() // userId -> Promise

async function listGroups(userId) {
  const hit = gruposCache.get(userId)
  if (hit && Date.now() - hit.at < GRUPOS_TTL) return hit.list
  if (gruposVoo.has(userId)) return gruposVoo.get(userId)
  const p = (async () => {
    const s = vivo(userId)
    try {
      const groups = await s.sock.groupFetchAllParticipating()
      const list = Object.values(groups || {}).map((g) => ({
        jid: g.id,
        name: g.subject || g.id,
        participants: Array.isArray(g.participants) ? g.participants.length : 0
      }))
      gruposCache.set(userId, { at: Date.now(), list })
      return list
    } catch (e) {
      if (hit && Date.now() - hit.at < GRUPOS_VELHO) return hit.list
      const limite = /rate-overlimit|429/i.test(String((e && e.message) || ''))
      const err = new Error(limite ? 'O WhatsApp pediu um intervalo para listar os grupos. Espere cerca de 1 minuto e clique em Atualizar' : (e && e.message) || 'Falha ao listar grupos')
      err.code = limite ? 'WA_LIMITE' : 'WA'
      throw err
    }
  })().finally(() => gruposVoo.delete(userId))
  gruposVoo.set(userId, p)
  return p
}

function jidGrupoOk(jid) {
  return /^[0-9A-Za-z._-]+@g\.us$/.test(String(jid || ''))
}

function vivo(userId) {
  const s = get(userId)
  if (!s || !s.sock || s.status !== 'connected' || !(s.sock.user)) {
    const err = new Error('WhatsApp nao esta conectado')
    err.code = 'WA'
    throw err
  }
  return s
}

function telefoneSeVier(phoneNumber) {
  if (!phoneNumber) return ''
  const n = String(phoneNumber).split('@')[0].replace(/\D/g, '')
  return n.length >= 10 && n.length <= 15 ? n : ''
}

function fichaDe(meta) {
  const participants = (Array.isArray(meta.participants) ? meta.participants : []).map((p) => ({
    id: String(p.id || ''),
    phone: telefoneSeVier(p.phoneNumber),
    lid: p.lid ? String(p.lid) : '',
    admin: p.admin || null
  })).filter((p) => p.id)
  return {
    jid: meta.id,
    name: meta.subject || meta.id,
    desc: meta.desc || '',
    size: Number(meta.size) || participants.length,
    announce: !!meta.announce,
    restrict: !!meta.restrict,
    addressingMode: meta.addressingMode || '',
    participants,
    phonesKnown: participants.filter((p) => p.phone).length,
    phonesMissing: participants.filter((p) => !p.phone).length,
    nomes: 'indisponivel'
  }
}

async function groupInfo(userId, jid) {
  if (!jidGrupoOk(jid)) {
    const err = new Error('Grupo invalido')
    err.status = 400
    throw err
  }
  const s = vivo(userId)
  const meta = await s.sock.groupMetadata(jid)
  return fichaDe(meta || {})
}

async function inviteLink(userId, jid) {
  if (!jidGrupoOk(jid)) {
    const err = new Error('Grupo invalido')
    err.status = 400
    throw err
  }
  const s = vivo(userId)
  if (typeof s.sock.groupInviteCode !== 'function') {
    const err = new Error('Esta versao do WhatsApp nao expoe groupInviteCode.')
    err.status = 400
    throw err
  }
  let code = ''
  try {
    code = await s.sock.groupInviteCode(jid)
  } catch (e) {
    const err = new Error('Nao consegui ler o convite. Em geral a conta precisa ser admin do grupo.')
    err.status = 400
    err.code = 'WA'
    throw err
  }
  const limpo = String(code || '').replace(/[^A-Za-z0-9]/g, '')
  if (!limpo) {
    const err = new Error('O WhatsApp nao devolveu o link. A conta precisa poder ver o convite.')
    err.status = 400
    throw err
  }
  return { url: 'https://chat.whatsapp.com/' + limpo, code: limpo }
}

async function sendText(userId, jid, text) {
  return sendOffer(userId, jid, { text })
}

// imagePath: arquivo local (imagem gerada ou capturada), validado por quem chama
async function sendOffer(userId, jid, { text, imageUrl, imagePath }) {
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
  const local = imagePath && path.resolve(String(imagePath)).startsWith(DATA + path.sep) && fs.existsSync(imagePath) ? path.resolve(String(imagePath)) : ''
  const imagem = local || (imageUrl && String(imageUrl).startsWith('https://') ? imageUrl : '')
  try {
    if (local) {
      await s.sock.sendMessage(jid, { image: fs.readFileSync(local), caption })
      return true
    }
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

module.exports = { pareada, start, stop, publicState, restoreRegistered, listGroups, groupInfo, inviteLink, sendText, sendOffer, get, onMensagem }
