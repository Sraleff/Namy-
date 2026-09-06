const config = require('../config')

module.exports = async function dono(ctx) {
    const texto = `
╭━━〔 👑 DONO DA NAMY 〕━━╮
┃
┃ 👑 Nome: ${config.developer}
┃ 💻 Função: Desenvolvedor
┃ 📞 WhatsApp: Em breve
┃ 📺 TikTok: Em breve
┃ 🌐 Site: Em breve
┃
╰━━━━━━━━━━━━━━━━━━━━━━━╯
`.trim()

    await ctx.escrever(texto)
}
