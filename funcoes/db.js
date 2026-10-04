const fs = require('fs')
const path = require('path')

const ARQUIVO = path.join(__dirname, '..', 'dados', 'namy.json')

const VAZIO = () => ({
    users: {},
    memories: {},
    conversations: {},
    groups: {},
    settings: {},
    ai_usage: { groq: 0, xai: 0, gemini: 0, total: 0 },
    commands: {},
    reminders: {},
    ranking: {},
    games: {},
    stats: {
        mensagens: 0,
        usuarios: {},
        grupos: {}
    }
})

function garantir() {
    const pasta = path.dirname(ARQUIVO)
    if (!fs.existsSync(pasta)) fs.mkdirSync(pasta, { recursive: true })
    if (!fs.existsSync(ARQUIVO)) {
        fs.writeFileSync(ARQUIVO, JSON.stringify(VAZIO(), null, 2))
    }
}

function carregar() {
    garantir()
    try {
        const dados = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'))
        return { ...VAZIO(), ...dados }
    } catch {
        return VAZIO()
    }
}

function salvar(dados) {
    garantir()
    fs.writeFileSync(ARQUIVO, JSON.stringify(dados, null, 2))
}

function tabela(nome) {
    const dados = carregar()
    if (dados[nome] === undefined) dados[nome] = VAZIO()[nome]
    return dados[nome]
}

function get(tabelaNome, chave, padrao = null) {
    const t = tabela(tabelaNome)
    return t[chave] !== undefined ? t[chave] : padrao
}

function set(tabelaNome, chave, valor) {
    const dados = carregar()
    if (!dados[tabelaNome] || typeof dados[tabelaNome] !== 'object' || Array.isArray(dados[tabelaNome])) {
        dados[tabelaNome] = {}
    }
    dados[tabelaNome][chave] = valor
    salvar(dados)
    return valor
}

function del(tabelaNome, chave) {
    const dados = carregar()
    if (dados[tabelaNome]) delete dados[tabelaNome][chave]
    salvar(dados)
}

function patch(tabelaNome, chave, parcial = {}) {
    const atual = get(tabelaNome, chave, {})
    const proximo = { ...(typeof atual === 'object' ? atual : {}), ...parcial }
    return set(tabelaNome, chave, proximo)
}

function increment(tabelaNome, chave, campo, n = 1) {
    const dados = carregar()
    if (!dados[tabelaNome] || typeof dados[tabelaNome] !== 'object') dados[tabelaNome] = {}
    const alvo = dados[tabelaNome]
    if (campo) {
        if (!alvo[chave] || typeof alvo[chave] !== 'object') alvo[chave] = {}
        alvo[chave][campo] = (alvo[chave][campo] || 0) + n
    } else {
        alvo[chave] = (alvo[chave] || 0) + n
    }
    salvar(dados)
}

function tudo() {
    return carregar()
}

module.exports = {
    carregar,
    salvar,
    get,
    set,
    del,
    patch,
    increment,
    tabela,
    tudo,
    ARQUIVO
}
