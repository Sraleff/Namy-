/**
 * Dados da Central por cliente. Nao grava secret da Shopee.
 * Arquivo separado de configs.json para nao misturar com anuncios.
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const filas = new Map()

function safeId(userId) {
  return String(userId || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80)
}

function fileOf(dataDir, userId) {
  const id = safeId(userId)
  if (!id) {
    const err = new Error('Conta invalida')
    err.status = 400
    throw err
  }
  const dir = path.join(dataDir, 'divulgacao')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, id + '.json')
}

function vazio() {
  return { contacts: [], campaigns: [], sends: [] }
}

function load(dataDir, userId) {
  try {
    const raw = JSON.parse(fs.readFileSync(fileOf(dataDir, userId), 'utf8'))
    return {
      contacts: Array.isArray(raw.contacts) ? raw.contacts : [],
      campaigns: Array.isArray(raw.campaigns) ? raw.campaigns : [],
      sends: Array.isArray(raw.sends) ? raw.sends : []
    }
  } catch {
    return vazio()
  }
}

function save(dataDir, userId, data) {
  const file = fileOf(dataDir, userId)
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, file)
}

function update(dataDir, userId, fn) {
  const chave = safeId(userId)
  const anterior = filas.get(chave) || Promise.resolve()
  const run = anterior.then(async () => {
    const db = load(dataDir, userId)
    const out = await fn(db)
    save(dataDir, userId, db)
    return out
  })
  filas.set(chave, run.then(() => {}, () => {}))
  return run
}

function id() {
  return crypto.randomUUID()
}

module.exports = { load, save, update, vazio, safeId, id, fileOf }
