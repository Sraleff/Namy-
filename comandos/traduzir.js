const axios = require('axios')

module.exports = async function traduzir(ctx) {
    const lang = (ctx.args[0] || '').toLowerCase()
    const texto = ctx.args.slice(1).join(' ').trim()
    if (!lang || !texto) {
        return ctx.reply('Use `!traduzir en oi tudo bem` ou `!traduzir pt hello`')
    }
    const langpair = ['pt', 'pt-br', 'br'].includes(lang) ? 'en|pt' : `${lang.includes('|') ? lang : 'pt|' + lang}`
    try {
        const { data } = await axios.get('https://api.mymemory.translated.net/get', {
            params: { q: texto, langpair: lang.includes('|') ? lang : langpair },
            timeout: 12000
        })
        const out = data?.responseData?.translatedText
        if (!out) return ctx.reply('Não traduzi.')
        await ctx.reply(`🌐 ${out}`)
    } catch {
        await ctx.reply('Tradutor offline.')
    }
}
