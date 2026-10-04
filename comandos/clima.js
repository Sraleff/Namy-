const axios = require('axios')

module.exports = async function clima(ctx) {
    const cidade = (ctx.texto || ctx.args.join(' ') || '').trim() || 'Serra'
    try {
        const { data } = await axios.get(
            `https://wttr.in/${encodeURIComponent(cidade)}?format=%l:+%C+%t+(sensação+%f)+umidade+%h+vento+%w&lang=pt`,
            { timeout: 12000, headers: { 'User-Agent': 'NamyBot/3.0' } }
        )
        await ctx.reply(`🌦️ *Clima*\n${String(data).trim()}`)
    } catch {
        await ctx.reply('Não peguei o clima agora. Tenta de novo com a cidade: `!clima Serra`')
    }
}
