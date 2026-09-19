const fs = require('fs')
const path = require('path')

const CAMINHO = path.join(__dirname, '..', 'dados', 'memorias.json')

function garantir() {
    const pasta = path.dirname(CAMINHO)
    if (!fs.existsSync(pasta)) fs.mkdirSync(pasta, { recursive: true })
    if (!fs.existsSync(CAMINHO)) fs.writeFileSync(CAMINHO, '{}')
}

function carregar() {
    garantir()
    try {
        return JSON.parse(fs.readFileSync(CAMINHO, 'utf8'))
    } catch {
        return {}
    }
}

function salvar(dados) {
    garantir()
    fs.writeFileSync(CAMINHO, JSON.stringify(dados, null, 2))
}

function memoriaPadrao() {
    return {
        nome: '',
        apelido: '',
        cidade: '',
        gostos: [],
        interesses: [],
        animeFavorito: '',
        jogoFavorito: '',
        observacao: '',
        atualizadoEm: ''
    }
}

function pegar(jid) {
    const tudo = carregar()
    if (!tudo[jid]) {
        tudo[jid] = memoriaPadrao()
        salvar(tudo)
    }
    return tudo[jid]
}

function atualizar(jid, dadosNovos = {}) {
    const tudo = carregar()
    const atual = pegar(jid)
    tudo[jid] = {
        ...atual,
        ...dadosNovos,
        atualizadoEm: new Date().toISOString()
    }
    salvar(tudo)
    return tudo[jid]
}

function resumoMemoria(jid) {
    const m = pegar(jid)
    const partes = []

    if (m.nome) partes.push(`Nome: ${m.nome}`)
    if (m.apelido) partes.push(`Apelido: ${m.apelido}`)
    if (m.cidade) partes.push(`Cidade: ${m.cidade}`)
    if (m.gostos?.length) partes.push(`Gostos: ${m.gostos.join(', ')}`)
    if (m.interesses?.length) partes.push(`Interesses: ${m.interesses.join(', ')}`)
    if (m.animeFavorito) partes.push(`Anime favorito: ${m.animeFavorito}`)
    if (m.jogoFavorito) partes.push(`Jogo favorito: ${m.jogoFavorito}`)
    if (m.observacao) partes.push(`Obs: ${m.observacao}`)

    return partes.length
        ? `Memória desta pessoa:\n- ${partes.join('\n- ')}`
        : 'Ainda não há memória salva desta pessoa.'
}

module.exports = {
    pegar,
    atualizar,
    resumoMemoria
}