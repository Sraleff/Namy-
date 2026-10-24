/**
 * Arquivo JSON por cliente dentro de data/<pasta>/<userId>.json.
 * Mesmo padrao da Central: escrita atomica (tmp + rename) e fila por cliente.
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const filas = new Map()

function safeId(userId) {
  return String(userId || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80)
}

function fileOf(dataDir, pasta, userId) {
  const id = safeId(userId)
  if (!id) {
    const err = new Error('Conta invalida')
    err.status = 400
    throw err
  }
  const dir = path.join(dataDir, pasta)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, id + '.json')
}

function load(dataDir, pasta, userId, vazio) {
  try {
    const raw = JSON.parse(fs.readFileSync(fileOf(dataDir, pasta, userId), 'utf8'))
    return raw && typeof raw === 'object' ? raw : vazio()
  } catch {
    return vazio()
  }
}

function save(dataDir, pasta, userId, data) {
  const file = fileOf(dataDir, pasta, userId)
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, file)
}

function update(dataDir, pasta, userId, vazio, fn) {
  const chave = pasta + ':' + safeId(userId)
  const anterior = filas.get(chave) || Promise.resolve()
  const run = anterior.then(async () => {
    const db = load(dataDir, pasta, userId, vazio)
    const out = await fn(db)
    save(dataDir, pasta, userId, db)
    return out
  })
  filas.set(chave, run.then(() => {}, () => {}))
  return run
}

function id() {
  return crypto.randomUUID()
}

module.exports = { safeId, fileOf, load, save, update, id }
