const axios = require('axios')

const mapa = {
    dolar: 'USD-BRL',
    dólar: 'USD-BRL',
    euro: 'EUR-BRL',
    bitcoin: 'BTC-BRL',
    btc: 'BTC-BRL',
    libra: 'GBP-BRL',
    iene: 'JPY-BRL'
}

module.exports = async function cotacao(ctx) {
    const q = (ctx.args[0] || 'dolar').toLowerCase()
    const par = mapa[q] || (q.includes('-') ? q.toUpperCase() : 'USD-BRL')
    try {
        const { data } = await axios.get(`https://economia.awesomeapi.com.br/json/last/${par}`, { timeout: 10000 })
        const item = Object.values(data)[0]
        if (!item) return ctx.reply('Par não encontrado. Tenta dolar, euro, bitcoin.')
        await ctx.reply(
            `💱 *${item.name}*\n` +
            `Compra: R$ ${Number(item.bid).toFixed(2)}\n` +
            `Venda: R$ ${Number(item.ask).toFixed(2)}\n` +
            `Variação: ${item.pctChange}%`
        )
    } catch {
        await ctx.reply('Cotação offline agora.')
    }
}
