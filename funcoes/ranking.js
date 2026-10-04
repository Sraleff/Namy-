const db = require('./db')

function addXp(jid, nome, quantidade = 10) {
    const atual = db.get('ranking', jid, { xp: 0, nome: nome || jid, vitorias: 0 })
    atual.xp += quantidade
    if (nome) atual.nome = nome
    db.set('ranking', jid, atual)
    return atual
}

function vitoria(jid, nome, xp = 25) {
    const atual = addXp(jid, nome, xp)
    atual.vitorias = (atual.vitorias || 0) + 1
    db.set('ranking', jid, atual)
    return atual
}

function top(n = 10) {
    const tudo = db.tabela('ranking')
    return Object.entries(tudo)
        .map(([jid, d]) => ({ jid, ...d }))
        .sort((a, b) => (b.xp || 0) - (a.xp || 0))
        .slice(0, n)
}

function cartao() {
    const lista = top(10)
    if (!lista.length) return '🏆 Ainda não tem ranking. Joga alguma coisa com `!jokenpo`, `!quiz` ou `!forca`.'
    const medalhas = ['🥇', '🥈', '🥉']
    const linhas = lista.map((p, i) => {
        const m = medalhas[i] || `${i + 1}.`
        return `${m} ${p.nome || 'alguém'}  —  ${p.xp} XP`
    })
    return ['🏆 *RANKING NAMY*', '', ...linhas].join('\n')
}

module.exports = { addXp, vitoria, top, cartao }
