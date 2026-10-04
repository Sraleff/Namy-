const axios = require('axios')

module.exports = async function wiki(ctx) {
    const q = ctx.args.join(' ').trim()
    if (!q) return ctx.reply('Use `!wiki inteligência artificial`')
    try {
        const { data } = await axios.get(
            `https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q)}`,
            { timeout: 12000, headers: { 'User-Agent': 'NamyBot/3.0' }, validateStatus: () => true }
        )
        if (!data?.extract) return ctx.reply('Não achei isso na Wikipedia.')
        const texto = String(data.extract).slice(0, 700)
        await ctx.reply(`📚 *${data.title}*\n\n${texto}${data.content_urls?.desktop?.page ? `\n\n${data.content_urls.desktop.page}` : ''}`)
    } catch {
        await ctx.reply('Wikipedia não respondeu.')
    }
}
