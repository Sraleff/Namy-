const config = require('../../config')
const db = require('../db')

const janelaGrupoMs = 20000
const atividadeRecente = new Map()

function registrarAtividade(chatId) {
    const agora = Date.now()
    const lista = (atividadeRecente.get(chatId) || []).filter((t) => agora - t < janelaGrupoMs)
    lista.push(agora)
    atividadeRecente.set(chatId, lista)
    return lista.length
}

function grupoMovimentado(chatId) {
    const agora = Date.now()
    const lista = (atividadeRecente.get(chatId) || []).filter((t) => agora - t < janelaGrupoMs)
    return lista.length >= 6
}

function botAcabouDeResponder(chatId) {
    const ultimo = db.get('settings', `lastReply:${chatId}`, 0)
    return Date.now() - Number(ultimo || 0) < 8000
}

function marcarResposta(chatId) {
    db.set('settings', `lastReply:${chatId}`, Date.now())
}

function mencionouNamy(texto, mentionedJid = [], botJids = []) {
    const t = String(texto || '').toLowerCase()
    if (/\bnamy\b|\bnami\b|\bnamie\b/.test(t)) return true
    return mentionedJid.some((jid) => botJids.includes(String(jid)))
}

function respondeuNamy(quotedParticipant, botJids = []) {
    if (!quotedParticipant) return false
    const q = String(quotedParticipant)
    return botJids.some((jid) => q.includes(String(jid).split('@')[0].split(':')[0]) || q === jid)
}

function ehPergunta(texto) {
    const t = String(texto || '').trim()
    if (!t) return false
    if (t.includes('?')) return true
    return /^(quem|qual|quais|onde|quando|como|por que|porque|pq|o que|oq|me fala|me diz|voce sabe|você sabe|namy)/i.test(t)
}

function conversaInteressante(texto) {
    const t = String(texto || '')
    if (t.length > 80) return true
    return /(recomenda|opiniao|opinião|filme|musica|música|jogo|ajuda|explica|historia|história)/i.test(t)
}

function mensagemCurtaInutil(texto) {
    const t = String(texto || '').trim()
    if (t.length <= 2) return true
    return /^(k+|rs+|haha+|kk+|ok+|blz|tmj|vlw|👍|🙏|😂+|🤣+|sim|nao|não|uhum|hm+)$/i.test(t)
}

function pontuar(entrada) {
    const {
        texto,
        isGroup,
        mencionou,
        respondeu,
        chatId
    } = entrada

    let p = 0
    if (ehPergunta(texto)) p += 30
    if (mencionou) p += 50
    if (respondeu) p += 50
    if (conversaInteressante(texto)) p += 15
    if (String(texto || '').trim().length < 8) p -= 30
    if (mensagemCurtaInutil(texto)) p -= 20
    if (botAcabouDeResponder(chatId)) p -= 40
    if (isGroup && grupoMovimentado(chatId)) p -= 20
    if (!isGroup) p += 45
    return p
}

function obterNivel(chatId) {
    const salvo = db.get('settings', `nivel:${chatId}`, null)
    if (typeof salvo === 'number') return salvo
    return config.iaNivelPadrao || 50
}

function definirNivel(chatId, nivel) {
    const n = Math.max(0, Math.min(100, Number(nivel)))
    db.set('settings', `nivel:${chatId}`, n)
    return n
}

function deveResponder(entrada) {
    registrarAtividade(entrada.chatId)
    const nivel = obterNivel(entrada.chatId)
    const pontos = pontuar(entrada)
    return { sim: pontos >= nivel, pontos, nivel }
}

module.exports = {
    pontuar,
    deveResponder,
    obterNivel,
    definirNivel,
    marcarResposta,
    mencionouNamy,
    respondeuNamy,
    registrarAtividade
}
