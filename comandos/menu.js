const config = require('../config')
const fs = require('fs')
const path = require('path')

module.exports = async function menu(ctx) {
    const caminhoImagem = path.join(__dirname, '..', 'media', 'namy.jpg')

    const menuTexto = `
╭━━━━━━━━━━━━━━━━━━╮
┃  🌸 *NAMY BOT* 🌸
┃  ✨ Assistente Inteligente
╰━━━━━━━━━━━━━━━━━━╯

╭━━━〔 📌 INFORMAÇÕES 〕━━━╮
┃ ➤ ${config.prefix}menu
┃ ➤ ${config.prefix}ping
┃ ➤ ${config.prefix}info
┃ ➤ ${config.prefix}dono
╰━━━━━━━━━━━━━━━━━━╯

╭━━━〔 😂 DIVERSÃO 〕━━━╮
┃ ➤ ${config.prefix}meme
┃ ➤ ${config.prefix}piada
┃ ➤ ${config.prefix}curiosidade
┃ ➤ ${config.prefix}conselho
╰━━━━━━━━━━━━━━━━━━╯

╭━━━〔 🎬 RECOMENDAÇÕES 〕━━━╮
┃ ➤ ${config.prefix}filme [gênero]
┃ ➤ ${config.prefix}anime [gênero]
╰━━━━━━━━━━━━━━━━━━╯

╭━━━〔 🤖 IA 〕━━━╮
┃ ➤ ${config.prefix}ia [pergunta]
╰━━━━━━━━━━━━━━━━━━╯

╭━━━〔 💬 CONVERSA 〕━━━╮
┃ ➤ Diga "oi", "bom dia", "boa tarde"
┃ ➤ Diga "obrigado", "tchau", "piada"
┃ ➤ ${config.prefix}bom-dia / ${config.prefix}boa-noite
╰━━━━━━━━━━━━━━━━━━╯

╭━━━━━━━━━━━━━━━━━━╮
┃ ✨ *STATUS DA NAMY*
┃ 📦 Versão: ${config.version}
┃ 👨‍💻 Dev: ${config.developer}
┃ ⚡ Energia: 100%
┃ 😊 Humor: 98%
┃ 📶 Status: Online
╰━━━━━━━━━━━━━━━━━━╯

🌸 *Namy v${config.version} — sempre evoluindo!*
`.trim()

    try {
        if (fs.existsSync(caminhoImagem)) {
            await ctx.client.sendMessage(
                ctx.from,
                {
                    image: { url: caminhoImagem },
                    caption: menuTexto
                },
                { quoted: ctx.info }
            )
        } else {
            await ctx.escrever(menuTexto)
        }
    } catch (erro) {
        console.error('Erro ao enviar menu:', erro?.message || erro)
        await ctx.escrever(menuTexto)
    }
}
