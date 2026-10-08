const cfg = require('./config')
const store = require('./store')
const grupos = require('./grupos')
const produtos = require('./produtos')
const publisher = require('./publisher')
const wa = require('./wa')
const { log } = require('./log')
const saas = require('../saas/tenants')

let timer = null
let kickTimer = null
let clientRef = null
let ocupado = false
let online = false

function hojeSP() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date())
}

function minutosAgoraSP() {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).formatToParts(new Date())
    const h = Number(parts.find((p) => p.type === 'hour')?.value || 0)
    const m = Number(parts.find((p) => p.type === 'minute')?.value || 0)
    return h * 60 + m
}

function parseHora(hhmm) {
    const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/)
    if (!m) return null
    return Number(m[1]) * 60 + Number(m[2])
}

function dentroDoHorario(g) {
    const ini = parseHora(g.horarioInicio)
    const fim = parseHora(g.horarioFim)
    if (ini == null || fim == null) return true
    const agora = minutosAgoraSP()
    if (ini === fim) return true
    if (ini < fim) return agora >= ini && agora < fim
    return agora >= ini || agora < fim
}

function resetDia(g) {
    const dia = hojeSP()
    if (g.dia !== dia) {
        g.dia = dia
        g.postsHoje = 0
    }
    return g
}

function permitidoPeloPlano(jid) {
    try {
        return saas.podePublicar(jid)
    } catch (e) {
        // Falha no controle de clientes nunca libera publicação de grupo vinculado por engano
        log('saas indisponível:', e.message)
        return { ok: false, motivo: 'saas_erro' }
    }
}

function proximoGrupo() {
    const s = store.carregar()
    if (s.global.pausado) return null
    const agora = Date.now()
    let melhor = null
    for (const [jid, raw] of Object.entries(s.grupos || {})) {
        const g = resetDia({ ...raw })
        if (!g.ativo) continue
        if (g.cooldownUntil && agora < g.cooldownUntil) continue
        if (!dentroDoHorario(g)) continue
        if ((g.postsHoje || 0) >= (g.limiteDiario || 5)) continue
        const next = Number(g.nextRunAt || 0)
        if (next > agora) continue
        if (!permitidoPeloPlano(jid).ok) continue
        if (!melhor || next < melhor.next) melhor = { jid, g, next }
    }
    return melhor
}

async function publicarGrupo(jid, g) {
    if (!wa.aberto(clientRef)) {
        const err = new Error('whatsapp_offline')
        err.code = 'WA'
        throw err
    }
    const plano = permitidoPeloPlano(jid)
    if (!plano.ok) {
        log(`Bloqueado pelo plano (${plano.motivo})`)
        grupos.patch(jid, { nextRunAt: Date.now() + 30 * 60 * 1000, lastError: plano.motivo })
        return
    }
    log(`Grupo autorizado`)
    log(`Publicando em ${g.nome || jid}`)
    const produto = await produtos.selecionar(jid, g)
    if (!produto) {
        grupos.patch(jid, {
            nextRunAt: Date.now() + 15 * 60 * 1000,
            lastError: 'sem_produto'
        })
        log('nenhum produto válido agora')
        return
    }
    if (require('./historico').duplicado(jid, produto.productId)) {
        log('Produto duplicado, ignorando')
        grupos.patch(jid, { nextRunAt: Date.now() + 5 * 60 * 1000 })
        return
    }

    if (!wa.aberto(clientRef) || !online) {
        const err = new Error('whatsapp_offline')
        err.code = 'WA'
        throw err
    }

    await publisher.publicar(clientRef, jid, produto)
    try { saas.registrarPublicacao(jid) } catch (e) { log('uso não registrado:', e.message) }
    const intervalo = Math.max(15, Number(g.intervaloMinutos) || 120)
    const posts = (g.postsHoje || 0) + 1
    const next = Date.now() + intervalo * 60 * 1000
    grupos.patch(jid, {
        postsHoje: posts,
        dia: hojeSP(),
        lastPublishAt: Date.now(),
        nextRunAt: next,
        cooldownUntil: 0,
        lastError: ''
    })
    log(`Próxima publicação: ${new Date(next).toLocaleString('pt-BR')}`)
}

async function tick() {
    if (!online || ocupado || !clientRef) return
    if (!cfg.habilitado()) return
    if (!wa.aberto(clientRef)) return
    const s = store.carregar()
    if (s.authFailed) return

    const alvo = proximoGrupo()
    if (!alvo) return

    ocupado = true
    try {
        const atual = grupos.obter(alvo.jid)
        if (!atual) return
        resetDia(atual)
        grupos.patch(alvo.jid, { dia: atual.dia, postsHoje: atual.postsHoje })
        if ((atual.postsHoje || 0) >= (atual.limiteDiario || 5)) {
            log('Limite diário atingido')
            return
        }
        await publicarGrupo(alvo.jid, atual)
        await new Promise((r) => setTimeout(r, cfg.espacoEntreGruposMs))
    } catch (erro) {
        const code = erro.code || ''
        if (code === 'AUTH' || code === 'AUTH_BLOCKED') {
            log('Erro na API')
            return
        }
        if (code === 'WA' || wa.queda(erro)) {
            log('WhatsApp offline, publicação adiada')
            grupos.patch(alvo.jid, {
                nextRunAt: Date.now() + 20 * 1000,
                lastError: 'whatsapp'
            })
            return
        }
        const cooldown = code === 'RATE' ? 15 : 10
        grupos.patch(alvo.jid, {
            cooldownUntil: Date.now() + cooldown * 60 * 1000,
            nextRunAt: Date.now() + cooldown * 60 * 1000,
            lastError: 'api'
        })
        log('Erro na API')
    } finally {
        ocupado = false
    }
}

function setClient(client) {
    clientRef = client
}

function parar() {
    online = false
    if (timer) clearInterval(timer)
    timer = null
    if (kickTimer) clearTimeout(kickTimer)
    kickTimer = null
}

function iniciar(client) {
    setClient(client)
    online = true
    if (timer) clearInterval(timer)
    if (kickTimer) clearTimeout(kickTimer)
    timer = setInterval(() => {
        tick().catch((e) => log(e.message))
    }, cfg.tickMs)
    log('scheduler ligado')
    kickTimer = setTimeout(() => {
        kickTimer = null
        tick().catch(() => {})
    }, 8000)
}

async function forcar(jid) {
    if (!online || !wa.aberto(clientRef)) throw new Error('whatsapp_offline')
    const g = grupos.obter(jid)
    if (!g) throw new Error('grupo_nao_cadastrado')
    if (ocupado) throw new Error('ocupado')
    ocupado = true
    try {
        await publicarGrupo(jid, resetDia({ ...g }))
    } finally {
        ocupado = false
    }
}

module.exports = {
    iniciar,
    parar,
    tick,
    forcar,
    setClient,
    hojeSP,
    dentroDoHorario,
    parseHora
}
