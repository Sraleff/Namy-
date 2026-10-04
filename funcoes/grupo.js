const db = require('./db')

function padrao() {
    return {
        welcome: false,
        goodbye: false,
        antilink: false,
        antispam: false,
        antiinvite: false,
        mensagemWelcome: '🌸 Bem-vindo(a) ao grupo, @user!',
        mensagemGoodbye: '👋 @user saiu do grupo.'
    }
}

function obter(id) {
    return { ...padrao(), ...(db.get('groups', id, {}) || {}) }
}

function definir(id, parcial) {
    const atual = obter(id)
    const proximo = { ...atual, ...parcial }
    db.set('groups', id, proximo)
    return proximo
}

function toggle(id, campo) {
    const atual = obter(id)
    atual[campo] = !atual[campo]
    db.set('groups', id, atual)
    return atual
}

const spam = new Map()

function registrarSpam(jid) {
    const agora = Date.now()
    const lista = (spam.get(jid) || []).filter((t) => agora - t < 8000)
    lista.push(agora)
    spam.set(jid, lista)
    return lista.length
}

function temLink(texto) {
    return /(https?:\/\/|www\.|chat\.whatsapp\.com|wa\.me\/)/i.test(String(texto || ''))
}

function temConvite(texto) {
    return /chat\.whatsapp\.com\//i.test(String(texto || ''))
}

async function ehAdmin(client, from, jid) {
    try {
        const meta = await client.groupMetadata(from)
        const numero = String(jid).split('@')[0].split(':')[0]
        const p = (meta.participants || []).find((x) => {
            const ids = [x.id, x.jid, x.lid, x.phoneNumber].filter(Boolean).map(String)
            return ids.some((id) => id.includes(numero) || id === jid)
        })
        return Boolean(p && (p.admin === 'admin' || p.admin === 'superadmin' || p.admin))
    } catch {
        return false
    }
}

async function metadados(client, from) {
    return client.groupMetadata(from)
}

module.exports = {
    obter,
    definir,
    toggle,
    padrao,
    registrarSpam,
    temLink,
    temConvite,
    ehAdmin,
    metadados
}
