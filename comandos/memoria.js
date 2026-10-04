const memoria = require('../funcoes/ia/memoria')

module.exports = async function memoriaCmd(ctx) {
    const jid = ctx.senderJid || ctx.from
    const acao = (ctx.args[0] || '').toLowerCase()

    if (acao === 'limpar' || acao === 'clear' || acao === 'apagar') {
        memoria.limpar(jid)
        return ctx.reply('🧹 Apaguei a memória que a Namy guardou sobre você.')
    }

    if (acao === 'esquecer') {
        const campo = (ctx.args[1] || '').toLowerCase()
        if (!campo) {
            return ctx.reply('Use: `!memoria esquecer nome` (nome, apelido, cidade, idade, jogos, animes, filmes, musicas, gostos)')
        }
        const ok = memoria.esquecer(jid, campo)
        if (!ok) return ctx.reply('Não conheço esse campo. Tenta: nome, apelido, cidade, jogos, animes...')
        return ctx.reply(`🧠 Esqueci *${campo}* de você.`)
    }

    return ctx.reply(memoria.cartao(jid))
}
