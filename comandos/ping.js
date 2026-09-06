module.exports = async function ping(ctx) {
    const inicio = Date.now()
    const msg = await ctx.reply('🏓 Calculando...')
    const latencia = Date.now() - inicio

    await ctx.client.sendMessage(
        ctx.from,
        {
            text: `🏓 *Pong!*\n⚡ Latência: *${latencia}ms*\n🌸 Namy online e feliz!`
        },
        { quoted: ctx.info }
    )
}
