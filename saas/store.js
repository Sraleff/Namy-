const fs = require('fs')
const path = require('path')

const ARQUIVO = path.join(__dirname, '..', 'dados', 'saas.json')

function vazio() {
    return { version: 1, tenants: {}, grupos: {}, uso: {}, atualizadoEm: '' }
}

function garantir() {
    const pasta = path.dirname(ARQUIVO)
    if (!fs.existsSync(pasta)) fs.mkdirSync(pasta, { recursive: true })
}

function ler(arquivo) {
    const dados = JSON.parse(fs.readFileSync(arquivo, 'utf8'))
    const base = vazio()
    return {
        ...base,
        ...dados,
        tenants: dados.tenants && typeof dados.tenants === 'object' ? dados.tenants : {},
        grupos: dados.grupos && typeof dados.grupos === 'object' ? dados.grupos : {},
        uso: dados.uso && typeof dados.uso === 'object' ? dados.uso : {}
    }
}

function carregar() {
    garantir()
    if (!fs.existsSync(ARQUIVO)) return vazio()
    try {
        return ler(ARQUIVO)
    } catch {
        try {
            if (fs.existsSync(ARQUIVO + '.bak')) return ler(ARQUIVO + '.bak')
        } catch (_) {}
        return vazio()
    }
}

function salvar(dados) {
    garantir()
    dados.atualizadoEm = new Date().toISOString()
    const tmp = ARQUIVO + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(dados, null, 2), { encoding: 'utf8', mode: 0o600 })
    try {
        if (fs.existsSync(ARQUIVO)) fs.copyFileSync(ARQUIVO, ARQUIVO + '.bak')
    } catch (_) {}
    fs.renameSync(tmp, ARQUIVO)
    return dados
}

function atualizar(fn) {
    const dados = carregar()
    return salvar(fn(dados) || dados)
}

module.exports = { ARQUIVO, vazio, carregar, salvar, atualizar }
