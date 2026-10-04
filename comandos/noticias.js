const axios = require('axios')

module.exports = async function noticias(ctx) {
    const q = ctx.args.join(' ').trim() || 'brasil'
    try {
        const { data } = await axios.get(
            `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`,
            { timeout: 12000, headers: { 'User-Agent': 'NamyBot/3.0' }, responseType: 'text' }
        )
        const titles = [...String(data).matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g)]
            .map((m) => m[1])
            .filter((t) => t && !/Google Notícias/i.test(t))
            .slice(0, 6)
        if (!titles.length) {
            const alt = [...String(data).matchAll(/<title>(.*?)<\/title>/g)].map((m) => m[1]).slice(1, 7)
            if (!alt.length) return ctx.reply('Sem notícias agora.')
            return ctx.reply('🗞️ *Notícias*\n\n' + alt.map((t, i) => `${i + 1}. ${t}`).join('\n'))
        }
        await ctx.reply('🗞️ *Notícias*\n\n' + titles.map((t, i) => `${i + 1}. ${t}`).join('\n'))
    } catch {
        await ctx.reply('Não puxei as notícias agora.')
    }
}
