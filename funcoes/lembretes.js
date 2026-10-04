const db = require('./db')

let clientRef = null
const timers = new Map()

function uid() {
    return Math.random().toString(36).slice(2, 8)
}

function parseQuando(texto) {
    const t = String(texto || '').trim()
    const rel = t.match(/^(\d+)\s*(s|m|min|h|d|hora|horas|minuto|minutos|dia|dias)\b/i)
    if (rel) {
        const n = Number(rel[1])
        const u = rel[2].toLowerCase()
        let ms = n * 60 * 1000
        if (u === 's') ms = n * 1000
        else if (u.startsWith('h')) ms = n * 60 * 60 * 1000
        else if (u.startsWith('d')) ms = n * 24 * 60 * 60 * 1000
        return { quando: Date.now() + ms, resto: t.slice(rel[0].length).trim() }
    }

    const amanha = /^amanh[ãa]\s+(\d{1,2}):(\d{2})\s+(.+)/i.exec(t)
    if (amanha) {
        const d = new Date()
        d.setDate(d.getDate() + 1)
        d.setHours(Number(amanha[1]), Number(amanha[2]), 0, 0)
        return { quando: d.getTime(), resto: amanha[3].trim() }
    }

    const hora = /^(\d{1,2}):(\d{2})\s+(.+)/.exec(t)
    if (hora) {
        const d = new Date()
        d.setHours(Number(hora[1]), Number(hora[2]), 0, 0)
        if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1)
        return { quando: d.getTime(), resto: hora[3].trim() }
    }

    return null
}

function agendar(item) {
    const delay = item.quando - Date.now()
    if (delay <= 0) {
        disparar(item)
        return
    }
    const t = setTimeout(() => disparar(item), Math.min(delay, 2147483647))
    timers.set(item.id, t)
}

async function disparar(item) {
    timers.delete(item.id)
    db.del('reminders', item.id)
    if (!clientRef) return
    try {
        await clientRef.sendMessage(item.from, {
            text: `⏰ ${item.nome ? item.nome + ', ' : ''}você pediu pra eu lembrar: *${item.texto}*`
        })
    } catch (e) {
        console.error('Lembrete falhou:', e.message)
    }
}

function criar({ from, jid, nome, quando, texto }) {
    const item = {
        id: uid(),
        from,
        jid,
        nome: nome || '',
        quando,
        texto
    }
    db.set('reminders', item.id, item)
    agendar(item)
    return item
}

function listar(jid) {
    const tudo = db.tabela('reminders')
    return Object.values(tudo).filter((x) => x.jid === jid)
}

function cancelar(id, jid) {
    const item = db.get('reminders', id, null)
    if (!item || (jid && item.jid !== jid)) return false
    const t = timers.get(id)
    if (t) clearTimeout(t)
    timers.delete(id)
    db.del('reminders', id)
    return true
}

function iniciar(client) {
    clientRef = client
    const tudo = db.tabela('reminders')
    for (const item of Object.values(tudo)) agendar(item)
}

module.exports = {
    parseQuando,
    criar,
    listar,
    cancelar,
    iniciar
}
