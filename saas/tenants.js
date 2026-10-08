const store = require('./store')
const planos = require('./planos')
const { ehDono, extrairNumero } = require('../funcoes/jid')

const ID_VALIDO = /^[a-z0-9_-]{2,32}$/
const DIA_MS = 24 * 60 * 60 * 1000

function hojeSP() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date())
}

function validarId(id) {
    const v = String(id || '').trim().toLowerCase()
    return ID_VALIDO.test(v) ? v : null
}

function listar() {
    return store.carregar().tenants
}

function obter(id) {
    return listar()[id] || null
}

function ativoEmDia(t) {
    return Boolean(t && t.ativo && !(t.venceEm && Date.now() > t.venceEm))
}

function gruposDo(id, s = store.carregar()) {
    return Object.entries(s.grupos).filter(([, t]) => t === id).map(([jid]) => jid)
}

function usoHoje(id, s = store.carregar()) {
    return Number(s.uso?.[id]?.[hojeSP()] || 0)
}

function criar(id, nome, planoId = 'basico') {
    const tid = validarId(id)
    if (!tid) return { ok: false, erro: 'id_invalido' }
    if (!planos.obter(planoId)) return { ok: false, erro: 'plano_invalido' }
    let existe = false
    store.atualizar((s) => {
        if (s.tenants[tid]) { existe = true; return s }
        s.tenants[tid] = {
            nome: String(nome || tid).slice(0, 60),
            plano: planoId.toLowerCase(),
            ativo: true,
            venceEm: Date.now() + 30 * DIA_MS,
            criadoEm: Date.now(),
            admins: [],
            usarChaveCasa: false,
            cred: ''
        }
        return s
    })
    return existe ? { ok: false, erro: 'ja_existe' } : { ok: true, id: tid }
}

function patch(id, parcial) {
    let achou = false
    store.atualizar((s) => {
        if (!s.tenants[id]) return s
        achou = true
        s.tenants[id] = { ...s.tenants[id], ...parcial }
        return s
    })
    return achou
}

function remover(id) {
    store.atualizar((s) => {
        delete s.tenants[id]
        delete s.uso[id]
        for (const jid of Object.keys(s.grupos)) if (s.grupos[jid] === id) delete s.grupos[jid]
        return s
    })
}

function renovar(id, dias) {
    const t = obter(id)
    if (!t) return null
    const base = Math.max(Date.now(), Number(t.venceEm || 0))
    const venceEm = base + dias * DIA_MS
    patch(id, { venceEm })
    return venceEm
}

// Um número administra no máximo um cliente (evita misturar dados entre clientes).
function adicionarAdmin(id, numero) {
    const n = extrairNumero(numero)
    if (!n || n.length < 10) return { ok: false, erro: 'numero_invalido' }
    const s = store.carregar()
    for (const [outro, t] of Object.entries(s.tenants)) {
        if (outro !== id && (t.admins || []).includes(n)) return { ok: false, erro: 'numero_de_outro_cliente' }
    }
    if (!s.tenants[id]) return { ok: false, erro: 'cliente_inexistente' }
    const admins = Array.from(new Set([...(s.tenants[id].admins || []), n]))
    patch(id, { admins })
    return { ok: true, numero: n }
}

function removerAdmin(id, numero) {
    const n = extrairNumero(numero)
    const t = obter(id)
    if (!t) return false
    patch(id, { admins: (t.admins || []).filter((x) => x !== n) })
    return true
}

function tenantDoRemetente(ctx) {
    for (const [id, t] of Object.entries(listar())) {
        if ((t.admins || []).length && ehDono(ctx, { owners: t.admins })) return id
    }
    return null
}

function vincularGrupo(jid, id) {
    const t = obter(id)
    if (!t) return { ok: false, erro: 'cliente_inexistente' }
    const plano = planos.obter(t.plano)
    const s = store.carregar()
    if (s.grupos[jid] && s.grupos[jid] !== id) return { ok: false, erro: 'grupo_de_outro_cliente' }
    if (s.grupos[jid] === id) return { ok: true }
    if (!planos.dentroDoLimite(plano.maxGrupos, gruposDo(id, s).length)) {
        return { ok: false, erro: 'limite_grupos' }
    }
    store.atualizar((st) => { st.grupos[jid] = id; return st })
    return { ok: true }
}

function desvincularGrupo(jid) {
    store.atualizar((s) => { delete s.grupos[jid]; return s })
}

function donoDoGrupo(jid) {
    return store.carregar().grupos[jid] || null
}

// Grupo sem cliente = grupo da própria plataforma (comportamento antigo preservado).
function podePublicar(jid) {
    const s = store.carregar()
    const id = s.grupos[jid]
    if (!id) return { ok: true, tenant: null }
    const t = s.tenants[id]
    if (!t) return { ok: false, motivo: 'cliente_inexistente' }
    if (!t.ativo) return { ok: false, motivo: 'cliente_inativo' }
    if (t.venceEm && Date.now() > t.venceEm) return { ok: false, motivo: 'assinatura_vencida' }
    const plano = planos.obter(t.plano)
    if (!plano) return { ok: false, motivo: 'plano_invalido' }
    if (!planos.dentroDoLimite(plano.maxAnunciosDia, usoHoje(id, s))) return { ok: false, motivo: 'limite_diario_plano' }
    return { ok: true, tenant: id }
}

function registrarPublicacao(jid) {
    const dia = hojeSP()
    store.atualizar((s) => {
        const id = s.grupos[jid]
        if (!id) return s
        const uso = s.uso[id] || {}
        const dias = Object.keys(uso).sort().slice(-29)
        const novo = {}
        for (const d of dias) novo[d] = uso[d]
        novo[dia] = Number(novo[dia] || 0) + 1
        s.uso[id] = novo
        return s
    })
}

module.exports = {
    validarId, listar, obter, ativoEmDia, criar, patch, remover, renovar,
    adicionarAdmin, removerAdmin, tenantDoRemetente,
    vincularGrupo, desvincularGrupo, donoDoGrupo, gruposDo,
    podePublicar, registrarPublicacao, usoHoje, hojeSP
}
