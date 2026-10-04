const db = require('./db')
const historico = require('./ia/historico')

function estaAtiva(chatId) {
    return db.get('settings', `ia:${chatId}`, false) === true
}

function ativar(chatId) {
    db.set('settings', `ia:${chatId}`, true)
}

function desativar(chatId) {
    db.set('settings', `ia:${chatId}`, false)
}

function obterHistorico(chatId) {
    return historico.obter(chatId)
}

function adicionarMensagem(chatId, role, content, max = 12) {
    return historico.adicionar(chatId, role, content, max)
}

function limparHistorico(chatId) {
    historico.limpar(chatId)
    if (String(chatId).endsWith('@g.us')) {
        historico.limpar(historico.chaveGrupo(chatId))
    }
}

function obterModo(chatId) {
    const modo = db.get('settings', `modo:${chatId}`, 'auto')
    return ['grok', 'xai', 'auto', 'gemini', 'groq'].includes(modo) ? modo : 'groq'
}

function definirModo(chatId, modo) {
    const mapa = { grok: 'xai', xai: 'xai', auto: 'auto', gemini: 'gemini', groq: 'groq', normal: 'groq' }
    const normalizado = mapa[modo] || 'groq'
    db.set('settings', `modo:${chatId}`, normalizado)
    return normalizado
}

function obterUltimoProvedor(chatId) {
    return db.get('settings', `provedor:${chatId}`, null)
}

function registrarProvedor(chatId, provedor) {
    if (!chatId || !provedor) return
    db.set('settings', `provedor:${chatId}`, provedor)
}

function limparProvedor(chatId) {
    db.del('settings', `provedor:${chatId}`)
}

module.exports = {
    estaAtiva,
    ativar,
    desativar,
    obterHistorico,
    adicionarMensagem,
    limparHistorico,
    obterModo,
    definirModo,
    obterUltimoProvedor,
    registrarProvedor,
    limparProvedor
}
