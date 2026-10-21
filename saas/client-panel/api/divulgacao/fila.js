/**
 * Fila persistente. Um envio por vez por cliente.
 * Aceite do socket nao significa entrega nem leitura.
 * Se o WhatsApp caiu, o destinatario continua na fila.
 */
const fs = require('fs')
const path = require('path')
const store = require('./store')
const regras = require('./regras')

let ocupado = false

async function processarUma(deps, now) {
  const momento = now || Date.now()
  const dir = path.join(deps.DATA, 'divulgacao')
  if (!fs.existsSync(dir)) return []
  const arquivos = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.endsWith('.tmp'))
  const feitos = []
  for (const arquivo of arquivos) {
    const userId = arquivo.slice(0, -5)
    if (typeof deps.licencaAtiva === 'function' && !deps.licencaAtiva(userId)) continue
    const job = await store.update(deps.DATA, userId, (db) => regras.prepararEnvio(db, userId, momento))
    if (!job) continue
    let result
    if (typeof deps.conectado === 'function' && !deps.conectado(userId)) {
      result = { skip: true, detail: 'WhatsApp desconectado' }
    } else {
      try {
        await deps.enviar(userId, job.jid, job.text)
        result = { ok: true }
      } catch (e) {
        const msg = e.message || 'falha'
        if (/nao esta conectado/i.test(msg)) result = { skip: true, detail: msg }
        else if (e.uncertain || /timeout|ECONN|socket/i.test(msg)) result = { uncertain: true, detail: msg }
        else result = { ok: false, detail: msg }
      }
    }
    if (!result.skip) {
      await store.update(deps.DATA, userId, (db) => regras.aplicarResultado(db, job, result, momento))
    }
    feitos.push({ userId, campaignId: job.camp.id, result })
    if (deps.logs && !result.skip) {
      deps.logs.append(deps.DATA, userId, {
        source: 'central',
        level: result.ok ? 'info' : 'error',
        ok: !!result.ok,
        message: (result.ok ? 'Campanha aceita pelo socket. ' : 'Campanha: ') + (result.detail || campanhaCurta(job))
      })
    }
  }
  return feitos
}

function campanhaCurta(job) {
  return String(job.camp.name || 'campanha').slice(0, 80)
}

function start(deps) {
  if (process.env.DIVULGACAO_FILA === '0') return
  setInterval(() => {
    if (ocupado) return
    ocupado = true
    processarUma(deps).catch((e) => console.error('[CENTRAL]', e.message)).finally(() => { ocupado = false })
  }, 20000)
}

module.exports = { processarUma, start }
