const axios = require('axios')

module.exports = async function cepCmd(ctx) {
    const cep = (ctx.args[0] || '').replace(/\D/g, '')
    if (cep.length !== 8) return ctx.reply('Use `!cep 29160000`')
    try {
        const { data } = await axios.get(`https://viacep.com.br/ws/${cep}/json/`, { timeout: 10000 })
        if (data.erro) return ctx.reply('CEP não encontrado.')
        await ctx.reply(
            `📫 *${data.cep}*\n${data.logradouro}\n${data.bairro}\n${data.localidade} — ${data.uf}`
        )
    } catch {
        await ctx.reply('ViaCEP não respondeu.')
    }
}
