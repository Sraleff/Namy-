const store = require('./store')

function padraoGrupo(parcial = {}) {
    const g = store.carregar().global
    return {
        nome: parcial.nome || '',
        ativo: false,
        intervaloMinutos: g.intervaloMinutos,
        limiteDiario: g.limiteDiario,
        horarioInicio: g.horarioInicio,
        horarioFim: g.horarioFim,
        keyword: parcial.keyword || '',
        nextRunAt: 0,
        postsHoje: 0,
        dia: '',
        lastPublishAt: 0,
        cooldownUntil: 0,
        lastError: '',
        ...parcial
    }
}

function listar() {
    return store.carregar().grupos || {}
}

function obter(jid) {
    const grupos = listar()
    return grupos[jid] || null
}

function cadastrar(jid, nome = '') {
    return store.atualizar((s) => {
        const atual = s.grupos[jid]
        s.grupos[jid] = padraoGrupo({
            ...(atual || {}),
            nome: nome || atual?.nome || jid,
            nextRunAt: atual?.nextRunAt || Date.now()
        })
        return s
    }).grupos[jid]
}

function remover(jid) {
    store.atualizar((s) => {
        delete s.grupos[jid]
        return s
    })
}

function patch(jid, parcial) {
    return store.atualizar((s) => {
        if (!s.grupos[jid]) return s
        s.grupos[jid] = { ...s.grupos[jid], ...parcial }
        return s
    }).grupos[jid]
}

function setAtivo(jid, ativo) {
    if (!obter(jid)) return null
    return patch(jid, {
        ativo: Boolean(ativo),
        nextRunAt: ativo ? Date.now() : 0
    })
}

function todos(ativo) {
    return store.atualizar((s) => {
        for (const jid of Object.keys(s.grupos)) {
            s.grupos[jid].ativo = Boolean(ativo)
            if (ativo) s.grupos[jid].nextRunAt = Date.now()
        }
        return s
    })
}

function patchTodosCadastrados(parcial) {
    return store.atualizar((s) => {
        for (const jid of Object.keys(s.grupos)) {
            s.grupos[jid] = { ...s.grupos[jid], ...parcial }
        }
        return s
    })
}

module.exports = {
    padraoGrupo,
    listar,
    obter,
    cadastrar,
    remover,
    patch,
    setAtivo,
    todos,
    patchTodosCadastrados
}
