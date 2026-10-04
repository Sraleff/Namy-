const fs = require('fs')
const path = require('path')

const ARQUIVO = path.join(__dirname, '..', 'dados', 'shopee.json')

function vazio() {
    return {
        version: 1,
        global: {
            pausado: false,
            intervaloMinutos: 120,
            limiteDiario: 5,
            horarioInicio: '09:00',
            horarioFim: '22:00',
            keyword: '',
            keywords: []
        },
        grupos: {},
        historico: [],
        authFailed: false,
        authFailedAt: 0,
        lastError: '',
        atualizadoEm: ''
    }
}

function garantir() {
    const pasta = path.dirname(ARQUIVO)
    if (!fs.existsSync(pasta)) fs.mkdirSync(pasta, { recursive: true })
}

function carregar() {
    garantir()
    if (!fs.existsSync(ARQUIVO)) return vazio()
    try {
        const dados = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'))
        const base = vazio()
        return {
            ...base,
            ...dados,
            global: { ...base.global, ...(dados.global || {}) },
            grupos: dados.grupos && typeof dados.grupos === 'object' ? dados.grupos : {},
            historico: Array.isArray(dados.historico) ? dados.historico : []
        }
    } catch {
        try {
            const bak = ARQUIVO + '.bak'
            if (fs.existsSync(bak)) {
                return { ...vazio(), ...JSON.parse(fs.readFileSync(bak, 'utf8')) }
            }
        } catch (_) {}
        return vazio()
    }
}

function salvar(dados) {
    garantir()
    dados.atualizadoEm = new Date().toISOString()
    const tmp = ARQUIVO + '.tmp'
    const json = JSON.stringify(dados, null, 2)
    fs.writeFileSync(tmp, json, 'utf8')
    try {
        if (fs.existsSync(ARQUIVO)) fs.copyFileSync(ARQUIVO, ARQUIVO + '.bak')
    } catch (_) {}
    fs.renameSync(tmp, ARQUIVO)
    return dados
}

function atualizar(fn) {
    const dados = carregar()
    const proximo = fn(dados) || dados
    return salvar(proximo)
}

module.exports = {
    ARQUIVO,
    vazio,
    carregar,
    salvar,
    atualizar
}
