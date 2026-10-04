const memoria = require('./memoria')
const contexto = require('./contexto')
const { perguntarComFallback } = require('./fallback')
const estado = require('../ia')
const decisao = require('./decisao')
const { mesmoJid } = require('../jid')

function jidsDoBot(client) {
    const user = client?.user || {}
    return [user.id, user.lid, user.jid].filter(Boolean).map(String)
}

function detectarFerramenta(texto) {
    const t = String(texto || '').toLowerCase()
    if (/(clima|tempo hoje|previs[aã]o)/.test(t)) return 'clima'
    if (/(cota[cç][aã]o|d[oó]lar|euro|bitcoin)/.test(t)) return 'cotacao'
    if (/\bcep\b/.test(t)) return 'cep'
    if (/(traduz|translate|em ingl[eê]s)/.test(t)) return 'traduzir'
    if (/(wikip[eé]dia|\bwiki\b)/.test(t)) return 'wiki'
    if (/(not[ií]cias|o que ta rolando)/.test(t)) return 'noticias'
    return null
}

async function conversar({ client, ctx, texto }) {
    const jid = ctx.senderJid || ctx.from
    memoria.capturar(jid, texto)

    const modo = estado.obterModo(ctx.from)
    const { mensagens, nomePessoa } = contexto.montar({
        texto,
        from: ctx.from,
        jid,
        isGroup: ctx.isGroup
    })

    const { texto: resposta } = await perguntarComFallback({
        mensagens,
        modo,
        chatId: ctx.from
    })

    if (resposta) {
        contexto.gravarResposta({
            from: ctx.from,
            jid,
            isGroup: ctx.isGroup,
            textoUser: texto,
            textoNamy: resposta,
            nomePessoa
        })
        decisao.marcarResposta(ctx.from)
    }

    return resposta
}

function avaliarAutomatica(ctx, client) {
    const botJids = jidsDoBot(client)
    const mencionou = decisao.mencionouNamy(ctx.body, ctx.mentionedJid, botJids)
    const respondeu = decisao.respondeuNamy(ctx.quotedParticipant, botJids) ||
        (ctx.info?.key?.participant && ctx.quotedMessage && mesmoJid(ctx.quotedParticipant, client?.user?.id))
    return decisao.deveResponder({
        texto: ctx.body,
        isGroup: ctx.isGroup,
        mencionou,
        respondeu,
        chatId: ctx.from
    })
}

module.exports = {
    conversar,
    avaliarAutomatica,
    detectarFerramenta,
    jidsDoBot
}
