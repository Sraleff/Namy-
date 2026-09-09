const config = require('../config')

module.exports = async function info(ctx) {
    const uptime = process.uptime()
    const horas = Math.floor(uptime / 3600)
    const minutos = Math.floor((uptime % 3600) / 60)
    const segundos = Math.floor(uptime % 60)

    const texto = `
╭━━〔 🤖 INFO NAMY 〕━━╮
┃
┃ 🌸 Nome: ${config.botName}
┃ ⚡ Versão: ${config.version}
┃ 👨‍💻 Criador: ${config.developer}
┃ 🧠 Linguagem: Node.js
┃ 📦 Biblioteca: Baileys
┃ ⏱ Uptime: ${horas}h ${minutos}m ${segundos}s
┃ 📆 Ano: 2026
┃
┃ "Sua assistente virtual 🌸"
┃
╰━━━━━━━━━━━━━━━━━━━━╯
`.trim()

    await ctx.escrever(texto)
}
