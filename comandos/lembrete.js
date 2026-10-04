const lembretes = require('../funcoes/lembretes')

module.exports = async function lembrete(ctx) {
    const acao = (ctx.args[0] || '').toLowerCase()

    if (acao === 'lista' || acao === 'listar') {
        const lista = lembretes.listar(ctx.senderJid)
        if (!lista.length) return ctx.reply('Nenhum lembrete pendente.')
        const linhas = lista.map((x) => {
            const quando = new Date(x.quando).toLocaleString('pt-BR')
            return `• \`${x.id}\` ${quando} — ${x.texto}`
        })
        return ctx.reply('⏰ *Seus lembretes*\n\n' + linhas.join('\n'))
    }

    if (acao === 'cancelar' || acao === 'apagar') {
        const id = ctx.args[1]
        if (!id) return ctx.reply('Use `!lembrar cancelar id`')
        const ok = lembretes.cancelar(id, ctx.senderJid)
        return ctx.reply(ok ? '🗑️ Lembrete cancelado.' : 'Não achei esse id.')
    }

    const bruto = ctx.args.join(' ').trim()
    if (!bruto) {
        return ctx.reply(
            '⏰ *Lembretes*\n\n' +
            '`!lembrar 30m tomar água`\n' +
            '`!lembrar 08:00 reunião`\n' +
            '`!lembrar amanhã 08:00 reunião`\n' +
            '`!lembretes` lista\n' +
            '`!lembrar cancelar id`'
        )
    }

    const parsed = lembretes.parseQuando(bruto)
    if (!parsed || !parsed.resto) {
        return ctx.reply('Não entendi o tempo. Ex: `!lembrar 30m tomar água`')
    }

    const item = lembretes.criar({
        from: ctx.from,
        jid: ctx.senderJid,
        nome: ctx.senderName,
        quando: parsed.quando,
        texto: parsed.resto
    })
    const minutos = Math.max(1, Math.round((item.quando - Date.now()) / 60000))
    return ctx.reply(`⏰ Beleza. Te lembro daqui a *${minutos} min*: ${item.texto}`)
}
