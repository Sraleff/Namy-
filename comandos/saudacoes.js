async function bomDia(ctx) {
    const mensagens = [
        `🌅 Bom dia, ${ctx.senderName}! 🌸`,
        `☀️ Bom dia! Que seu dia seja maravilhoso, ${ctx.senderName}! ✨`,
        `🥰 Bom dia, flor do dia! Como você está?`,
        `🌟 Bom dia! A Namy deseja um dia incrível pra você!`
    ]
    await ctx.reply(mensagens[Math.floor(Math.random() * mensagens.length)])
}

async function boaNoite(ctx) {
    const mensagens = [
        `🌙 Boa noite, ${ctx.senderName}! Durma bem!`,
        `⭐ Boa noite! Que seus sonhos sejam doces!`,
        `🌌 Boa noite! Até amanhã!`,
        `😴 Boa noite! A Namy também vai descansar um pouquinho~`
    ]
    await ctx.reply(mensagens[Math.floor(Math.random() * mensagens.length)])
}

async function boaTarde(ctx) {
    const mensagens = [
        `☀️ Boa tarde, ${ctx.senderName}!`,
        `🌞 Boa tarde! Aproveite seu dia!`,
        `🌈 Boa tarde! Como está sendo o seu dia?`,
        `😊 Boa tarde! A Namy está aqui se precisar de algo!`
    ]
    await ctx.reply(mensagens[Math.floor(Math.random() * mensagens.length)])
}

module.exports = { bomDia, boaNoite, boaTarde }
