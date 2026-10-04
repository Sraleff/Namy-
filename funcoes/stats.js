const db = require('./db')

function registrarMensagem(from, isGroup) {
    const dados = db.carregar()
    dados.stats.mensagens = (dados.stats.mensagens || 0) + 1
    if (isGroup) dados.stats.grupos[from] = true
    else dados.stats.usuarios[from] = true
    db.salvar(dados)
}

function registrarComando(nome) {
    db.increment('commands', nome)
}

function resumo() {
    const dados = db.carregar()
    const usuarios = Object.keys(dados.stats.usuarios || {}).length
    const grupos = Object.keys(dados.stats.grupos || {}).length
    const ranking = Object.entries(dados.commands || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
    return {
        mensagens: dados.stats.mensagens || 0,
        usuarios,
        grupos,
        ia: {
            groq: dados.ai_usage.groq || 0,
            xai: dados.ai_usage.xai || 0,
            gemini: dados.ai_usage.gemini || 0,
            total: dados.ai_usage.total || 0
        },
        comandos: ranking
    }
}

module.exports = { registrarMensagem, registrarComando, resumo }
