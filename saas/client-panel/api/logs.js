/**
 * Historico de envios por conta. Um arquivo por userId.
 * Nunca grava secret, token ou payload da Shopee.
 */
const fs = require('fs')
const path = require('path')

function safeId(userId) {
  return String(userId || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80)
}

function fileOf(dataDir, userId) {
  const dir = path.join(dataDir, 'logs')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, safeId(userId) + '.json')
}

function read(dataDir, userId) {
  try {
    const list = JSON.parse(fs.readFileSync(fileOf(dataDir, userId), 'utf8'))
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function append(dataDir, userId, entry) {
  if (!safeId(userId)) return
  const level = entry.level === 'warn' || entry.level === 'error' ? entry.level : 'info'
  const row = {
    at: new Date().toISOString(),
    source: String(entry.source || 'sistema').slice(0, 24),
    level,
    message: String(entry.message || '').slice(0, 400),
    group: entry.group ? String(entry.group).slice(0, 120) : '',
    jid: entry.jid ? String(entry.jid).slice(0, 80) : '',
    ok: entry.ok === true ? true : entry.ok === false ? false : null
  }
  const list = read(dataDir, userId)
  list.unshift(row)
  fs.writeFileSync(fileOf(dataDir, userId), JSON.stringify(list.slice(0, 80), null, 2))
  return row
}

module.exports = { append, read }
