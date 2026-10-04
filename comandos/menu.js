const config = require('../config')
const fs = require('fs')
const path = require('path')

module.exports = async function menu(ctx) {
    const caminhoImagem = path.join(__dirname, '..', 'media', 'namy.jpg')
    const p = config.prefix

    const menuTexto = `
╭━━━━━━━━━━━━━━━━━━╮
┃  NAMY BOT  ·  v${config.version}
┃  Assistente modular
╰━━━━━━━━━━━━━━━━━━╯

╭━━ INFORMAÇÕES ━━╮
┃ ${p}menu  ${p}ping  ${p}info  ${p}dono  ${p}stats
╰━━━━━━━━━━━━━━━━━━╯

╭━━ IA ━━━━━━━━━━━╮
┃ ${p}ia [pergunta]
┃ ${p}ia on / off / status
┃ ${p}ia modo auto | grok | groq | gemini
┃ ${p}ia nivel 50
┃ ${p}memoria  ·  ${p}memoria limpar
┃ ${p}memoria esquecer nome
╰━━━━━━━━━━━━━━━━━━╯

╭━━ MÍDIA ━━━━━━━━╮
┃ ${p}s / ${p}sticker  (imagem/gif)
┃ ${p}play [música]
╰━━━━━━━━━━━━━━━━━━╯

╭━━ GRUPO ━━━━━━━━╮
┃ ${p}ban  ${p}kick  ${p}unban
┃ ${p}promover  ${p}rebaixar
┃ ${p}admins  ${p}membros  ${p}grupo
┃ ${p}bemvindo on  ${p}despedida on
┃ ${p}antilink on  ${p}antispam on
╰━━━━━━━━━━━━━━━━━━╯

╭━━ UTILIDADES ━━━╮
┃ ${p}clima Serra
┃ ${p}cotacao dolar
┃ ${p}cep 29160000
┃ ${p}traduzir en olá
┃ ${p}wiki inteligência artificial
┃ ${p}noticias tecnologia
┃ ${p}lembrar 30m tomar água
┃ ${p}lembretes
╰━━━━━━━━━━━━━━━━━━╯

╭━━ SHOPEE ━━━━━━━╮
┃ ${p}shopee status
┃ ${p}shopee cadastrar  (no grupo)
┃ ${p}shopee on / off
┃ ${p}shopee todos on   (só cadastrados)
╰━━━━━━━━━━━━━━━━━━╯

╭━━ JOGOS ━━━━━━━━╮
┃ ${p}quiz  ${p}forca  ${p}jokenpo
┃ ${p}numero  ${p}velha  ${p}adivinhe
┃ ${p}verdade  ${p}desafio  ${p}rank
╰━━━━━━━━━━━━━━━━━━╯

╭━━ DIVERSÃO ━━━━━╮
┃ ${p}meme  ${p}piada  ${p}curiosidade
┃ ${p}conselho  ${p}filme  ${p}anime
╰━━━━━━━━━━━━━━━━━━╯

Chama "Namy" no grupo com a IA ligada.
Ela decide se entra — não responde cada kkkk.

Dev: ${config.developer}
`.trim()

    try {
        if (fs.existsSync(caminhoImagem)) {
            await ctx.client.sendMessage(
                ctx.from,
                { image: { url: caminhoImagem }, caption: menuTexto },
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
