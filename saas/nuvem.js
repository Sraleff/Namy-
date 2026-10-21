// Liga esta Namy (um celular) ao painel Namy Cloud.
// O site é a fonte da verdade: nome, donos, chaves, plano.
// Sem NAMY_CLOUD_URL + NAMY_WORKER_TOKEN o bot segue local, como antes.
const config = require('../config')

let ultimo = null
let timer = null
let clientAtual = null

function base() {
    return String(process.env.NAMY_CLOUD_URL || '').trim().replace(/\/$/, '')
}

function token() {
    return String(process.env.NAMY_WORKER_TOKEN || '').trim()
}

function ligado() {
    return Boolean(base() && token())
}

function ultimoSync() {
    return ultimo
}

function telefone() {
    return String(ultimo?.phone || '').replace(/\D/g, '')
}

function definirCliente(client) {
    clientAtual = client || null
}

async function post(body) {
    const resposta = await fetch(base() + '/api/worker', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            authorization: 'Bearer ' + token()
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12000)
    })
    const data = await resposta.json().catch(() => ({}))
    if (!resposta.ok) {
        const err = new Error(data.error || ('painel_' + resposta.status))
        err.status = resposta.status
        throw err
    }
    return data
}

function aplicar(remoto) {
    if (!remoto?.ok) return
    ultimo = remoto
    if (remoto.botName) config.botName = String(remoto.botName).slice(0, 40)
    if (remoto.prefix) config.prefix = String(remoto.prefix).slice(0, 2) || config.prefix
    if (Array.isArray(remoto.owners)) {
        config.owners = remoto.owners.map((x) => String(x).replace(/\D/g, '')).filter(Boolean)
    }
    const ia = remoto.ia || {}
    config.groqApiKey = String(ia.groq || '')
    config.xaiApiKey = String(ia.xai || '')
    config.geminiApiKey = String(ia.gemini || '')
    const sh = remoto.shopee || {}
    if (sh.enabled && sh.appId && sh.secret) {
        process.env.SHOPEE_APP_ID = String(sh.appId)
        process.env.SHOPEE_SECRET = String(sh.secret)
        if (['false', '0', 'off'].includes(String(process.env.SHOPEE_ENABLED || '').toLowerCase())) {
            delete process.env.SHOPEE_ENABLED
        }
    } else if (remoto.billingOk === false || sh.enabled === false) {
        process.env.SHOPEE_APP_ID = ''
        process.env.SHOPEE_SECRET = ''
    }
}

async function sincronizar() {
    if (!ligado()) return null
    try {
        const remoto = await post({ action: 'config' })
        aplicar(remoto)
        return remoto
    } catch (e) {
        console.error('[NUVEM] não sincronizou:', e.message)
        return null
    }
}

async function executarJobs(client, jobs) {
    if (!client || !Array.isArray(jobs)) return
    for (const job of jobs) {
        if (job?.kind !== 'leave' || !job.jid) continue
        try {
            await client.groupLeave(job.jid)
            await log('sistema', 'info', 'Saiu de um grupo pedido pelo painel.')
        } catch (e) {
            console.error('[NUVEM] sair do grupo:', e.message)
            await log('sistema', 'warn', 'Não consegui sair de um grupo pedido pelo painel.')
        }
    }
}

async function enviarGrupos(client) {
    if (!ligado() || !client?.groupFetchAllParticipating) return
    try {
        const all = await client.groupFetchAllParticipating()
        const groups = Object.values(all || {}).slice(0, 80).map((g) => ({
            jid: g.id,
            name: String(g.subject || 'Grupo').slice(0, 80),
            members: Array.isArray(g.participants) ? g.participants.length : 0
        })).filter((g) => String(g.jid || '').endsWith('@g.us'))
        await post({ action: 'groups', groups })
    } catch (e) {
        console.error('[NUVEM] grupos:', e.message)
    }
}

async function tick() {
    const remoto = await sincronizar()
    if (!remoto || !clientAtual) return
    await executarJobs(clientAtual, remoto.jobs)
    await enviarGrupos(clientAtual)
}

function iniciar() {
    if (!ligado() || timer) return
    console.log('[NUVEM] painel ligado. Chaves e nome vêm do Namy Cloud, não do !minhaconta.')
    tick()
    timer = setInterval(tick, 60 * 1000)
    if (typeof timer.unref === 'function') timer.unref()
}

async function status(payload) {
    if (!ligado()) return
    try {
        await post({ action: 'status', ...payload })
    } catch (e) {
        console.error('[NUVEM] status:', e.message)
    }
}

async function log(source, level, message) {
    if (!ligado()) return
    const texto = String(message || '').slice(0, 300)
    if (!texto) return
    try {
        await post({ action: 'log', source, level, message: texto })
    } catch (_) {}
}

module.exports = {
    ligado, iniciar, sincronizar, status, log, telefone, definirCliente, ultimo: ultimoSync
}
