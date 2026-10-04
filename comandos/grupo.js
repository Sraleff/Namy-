const grupo = require('../funcoes/grupo')
const config = require('../config')
const { ehDono } = require('../funcoes/jid')

function alvo(ctx) {
    if (ctx.mentionedJid?.[0]) return ctx.mentionedJid[0]
    if (ctx.quotedParticipant) return ctx.quotedParticipant
    const n = (ctx.args[0] || '').replace(/\D/g, '')
    if (n.length >= 10) return `${n}@s.whatsapp.net`
    return null
}

async function precisaAdmin(ctx) {
    if (!ctx.isGroup) {
        await ctx.reply('Esse comando só funciona em grupo.')
        return false
    }
    const dono = ehDono(ctx, config)
    const admin = await grupo.ehAdmin(ctx.client, ctx.from, ctx.senderJid)
    if (!dono && !admin) {
        await ctx.reply('🚫 Só admin ou dono da Namy.')
        return false
    }
    return true
}

async function executarAcao(ctx, acao, mensagemOk) {
    if (!(await precisaAdmin(ctx))) return
    const jid = alvo(ctx)
    if (!jid) return ctx.reply('Marca a pessoa ou responde a mensagem dela.')
    try {
        await ctx.client.groupParticipantsUpdate(ctx.from, [jid], acao)
        await ctx.reply(mensagemOk)
    } catch (e) {
        await ctx.reply('Não consegui. Eu sou admin do grupo?')
    }
}

async function ban(ctx) { return executarAcao(ctx, 'remove', '✅ Removido.') }
async function kick(ctx) { return executarAcao(ctx, 'remove', '✅ Kickado.') }
async function promover(ctx) { return executarAcao(ctx, 'promote', '✅ Agora é admin.') }
async function rebaixar(ctx) { return executarAcao(ctx, 'demote', '✅ Rebaixado.') }

async function unban(ctx) {
    if (!(await precisaAdmin(ctx))) return
    const jid = alvo(ctx)
    if (!jid) return ctx.reply('Marca o número pra adicionar de volta.')
    try {
        await ctx.client.groupParticipantsUpdate(ctx.from, [jid], 'add')
        await ctx.reply('✅ Convite/add enviado.')
    } catch {
        await ctx.reply('Não consegui adicionar. O número precisa estar no WhatsApp e eu preciso ser admin.')
    }
}

async function admins(ctx) {
    if (!ctx.isGroup) return ctx.reply('Só em grupo.')
    try {
        const meta = await grupo.metadados(ctx.client, ctx.from)
        const lista = (meta.participants || []).filter((p) => p.admin)
        const nomes = lista.map((p) => `• ${p.id.split('@')[0]}`).join('\n') || 'Nenhum admin listado.'
        await ctx.reply(`👑 *Admins*\n\n${nomes}`)
    } catch {
        await ctx.reply('Não consegui ler os admins.')
    }
}

async function membros(ctx) {
    if (!ctx.isGroup) return ctx.reply('Só em grupo.')
    try {
        const meta = await grupo.metadados(ctx.client, ctx.from)
        await ctx.reply(`👥 *${meta.subject}*\nMembros: *${(meta.participants || []).length}*`)
    } catch {
        await ctx.reply('Não consegui contar os membros.')
    }
}

async function donoGrupo(ctx) {
    if (!ctx.isGroup) return ctx.reply('Só em grupo.')
    try {
        const meta = await grupo.metadados(ctx.client, ctx.from)
        const owner = meta.owner || (meta.participants || []).find((p) => p.admin === 'superadmin')?.id
        await ctx.reply(`👑 Dono do grupo: ${owner ? owner.split('@')[0] : 'desconhecido'}`)
    } catch {
        await ctx.reply('Não achei o dono.')
    }
}

async function infoGrupo(ctx) {
    if (!ctx.isGroup) return ctx.reply('Só em grupo.')
    const g = grupo.obter(ctx.from)
    try {
        const meta = await grupo.metadados(ctx.client, ctx.from)
        await ctx.reply(
            `👥 *${meta.subject}*\n\n` +
            `Membros: ${(meta.participants || []).length}\n` +
            `Bem-vindo: ${g.welcome ? 'ON' : 'OFF'}\n` +
            `Despedida: ${g.goodbye ? 'ON' : 'OFF'}\n` +
            `Antilink: ${g.antilink ? 'ON' : 'OFF'}\n` +
            `Antispam: ${g.antispam ? 'ON' : 'OFF'}\n` +
            `Anti-invite: ${g.antiinvite ? 'ON' : 'OFF'}`
        )
    } catch {
        await ctx.reply('Não li o grupo agora.')
    }
}

function toggleCmd(campo, ligar, desligar) {
    return async function (ctx) {
        if (!(await precisaAdmin(ctx))) return
        const arg = (ctx.args[0] || '').toLowerCase()
        if (arg === 'on' || arg === 'ligar') {
            grupo.definir(ctx.from, { [campo]: true })
            return ctx.reply(ligar)
        }
        if (arg === 'off' || arg === 'desligar') {
            grupo.definir(ctx.from, { [campo]: false })
            return ctx.reply(desligar)
        }
        const g = grupo.toggle(ctx.from, campo)
        return ctx.reply(g[campo] ? ligar : desligar)
    }
}

module.exports = {
    ban,
    unban,
    kick,
    promover,
    rebaixar,
    admins,
    membros,
    dono: donoGrupo,
    grupo: infoGrupo,
    bemvindo: toggleCmd('welcome', '👋 Bem-vindo ON', '👋 Bem-vindo OFF'),
    despedida: toggleCmd('goodbye', '💔 Despedida ON', '💔 Despedida OFF'),
    antilink: toggleCmd('antilink', '🛡️ Antilink ON', '🛡️ Antilink OFF'),
    antispam: toggleCmd('antispam', '🛡️ Antispam ON', '🛡️ Antispam OFF'),
    antiinvite: toggleCmd('antiinvite', '🛡️ Anti-invite ON', '🛡️ Anti-invite OFF')
}
