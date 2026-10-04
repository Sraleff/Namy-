const db = require('../db')

function chavePessoa(from, jid, isGroup) {
    return isGroup ? `${from}:${jid}` : from
}

function chaveGrupo(from) {
    return `grupo:${from}`
}

function obter(chave) {
    return db.get('conversations', chave, [])
}

function adicionar(chave, role, content, max = 12) {
    const lista = obter(chave)
    lista.push({ role, content, at: Date.now() })
    const cortada = lista.slice(-max)
    db.set('conversations', chave, cortada)
    return cortada
}

function limpar(chave) {
    db.del('conversations', chave)
}

function obterLimpo(chave, max = 12) {
    return obter(chave)
        .filter((m) => m && m.role && m.content)
        .slice(-max)
        .map((m) => ({ role: m.role, content: m.content }))
}

module.exports = {
    chavePessoa,
    chaveGrupo,
    obter,
    adicionar,
    limpar,
    obterLimpo
}
