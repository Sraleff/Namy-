function extrairNumero(jid) {
    if (!jid) return ''
    const texto = String(jid)
    if (texto.endsWith('@lid')) return ''
    return texto.split('@')[0].split(':')[0].replace(/\D/g, '')
}

function normalizar(jid) {
    if (!jid) return ''
    const texto = String(jid)
    const base = texto.split(':')[0]
    if (texto.includes('@')) {
        const dominio = texto.split('@')[1] || 's.whatsapp.net'
        return `${base.split('@')[0]}@${dominio}`
    }
    return texto
}

function mesmoJid(a, b) {
    const na = extrairNumero(a)
    const nb = extrairNumero(b)
    if (na && nb) return na === nb
    return normalizar(a) === normalizar(b)
}

function ehDono(ctx, config) {
    const donos = (config.owners || []).map(extrairNumero).filter(Boolean)
    if (!donos.length) return false
    const key = ctx.info?.key || {}
    const candidatos = [
        key.participant,
        key.participantAlt,
        key.remoteJidAlt,
        key.senderPn,
        ctx.info?.participantAlt,
        ctx.info?.remoteJidAlt,
        ctx.info?.senderPn,
        ctx.senderJid,
        ctx.participant,
        ctx.from
    ]
    return candidatos
        .map(extrairNumero)
        .filter(Boolean)
        .some((numero) => donos.includes(numero))
}

module.exports = {
    extrairNumero,
    normalizar,
    mesmoJid,
    ehDono
}
