const config = require('../config')
const fs = require('fs')
const path = require('path')
const { enviarLista } = require('../funcoes/menuLista')

function categorias(p) {
    return {
        info: { titulo: 'INFORMAÇÕES', desc: 'Ping, info, dono, stats', linhas: [`${p}menu  ${p}ping  ${p}info  ${p}dono  ${p}stats`] },
        ia: { titulo: 'IA', desc: 'Conversa, modos e memória', linhas: [
            `${p}ia [pergunta]`, `${p}ia on / off / status`, `${p}ia modo auto | grok | groq | gemini`,
            `${p}ia nivel 50`, `${p}memoria  ·  ${p}memoria limpar`, `${p}memoria esquecer nome`] },
        midia: { titulo: 'MÍDIA', desc: 'Figurinha e música', linhas: [`${p}s / ${p}sticker  (imagem/gif)`, `${p}play [música]`] },
        adm: { titulo: 'ADM DO GRUPO', desc: 'Comandos de administração', linhas: [
            `${p}ban  ${p}kick  ${p}unban`, `${p}promover  ${p}rebaixar`, `${p}admins  ${p}membros  ${p}grupo`,
            `${p}bemvindo on  ${p}despedida on`, `${p}antilink on  ${p}antispam on`] },
        util: { titulo: 'UTILIDADES', desc: 'Clima, CEP, cotação, lembretes', linhas: [
            `${p}clima Serra`, `${p}cotacao dolar`, `${p}cep 29160000`, `${p}traduzir en olá`,
            `${p}wiki inteligência artificial`, `${p}noticias tecnologia`, `${p}lembrar 30m tomar água`, `${p}lembretes`] },
        jogos: { titulo: 'JOGOS', desc: 'Quiz, forca, ranking', linhas: [
            `${p}quiz  ${p}forca  ${p}jokenpo`, `${p}numero  ${p}velha  ${p}adivinhe`, `${p}verdade  ${p}desafio  ${p}rank`] },
        diversao: { titulo: 'DIVERSÃO', desc: 'Memes, piadas, recomendações', linhas: [
            `${p}meme  ${p}piada  ${p}curiosidade`, `${p}conselho  ${p}filme  ${p}anime`] },
        dono: { titulo: 'DONO', desc: 'Shopee e clientes (exclusivo)', linhas: [
            `${p}shopee status`, `${p}shopee cadastrar  (no grupo)`, `${p}shopee on / off`,
            `${p}shopee todos on   (só cadastrados)`, `${p}cliente  (painel master)`] }
    }
}

function bloco(c) {
    return [`╭━━ ${c.titulo} ━━╮`, ...c.linhas.map((l) => `┃ ${l}`), '╰━━━━━━━━━━━━━━━━━━╯'].join('\n')
}

function cabecalho(ctx) {
    return [
        '╔══☆ 『 MENUS 』 ══☆',
        `║ ▸ PREFIXO: ${config.prefix}`,
        '║ ▸ STATUS: ON-LINE ✅',
        `║ ▸ USUÁRIO: ${ctx.senderName}`,
        `╚══ ${config.botName} v${config.version} ══☆`
    ].join('\n')
}

function textoCompleto(ctx, cats) {
    return [
        cabecalho(ctx), '',
        ...Object.values(cats).map(bloco).flatMap((b) => [b, '']),
        'Chama "Namy" no grupo com a IA ligada.',
        `Dev: ${config.developer}`
    ].join('\n').trim()
}

async function enviarTexto(ctx, texto, imagem) {
    try {
        if (imagem) {
            return await ctx.client.sendMessage(ctx.from, { image: { url: imagem }, caption: texto }, { quoted: ctx.info })
        }
    } catch (erro) {
        console.error('Erro ao enviar menu com imagem:', erro?.message || erro)
    }
    return ctx.escrever(texto)
}

module.exports = async function menu(ctx) {
    const p = config.prefix
    const cats = categorias(p)
    const caminho = path.join(__dirname, '..', 'media', 'namy.jpg')
    const imagem = fs.existsSync(caminho) ? caminho : null
    const escolha = String(ctx.args[0] || '').toLowerCase()

    // !menu <categoria> → mostra só aquela categoria (é o que a lista dispara)
    if (escolha === 'todos' || escolha === 'texto') {
        return enviarTexto(ctx, textoCompleto(ctx, cats), imagem)
    }
    if (cats[escolha]) {
        return ctx.escrever(bloco(cats[escolha]))
    }

    const rows = Object.entries(cats).map(([id, c]) => ({
        header: '', title: c.titulo, description: c.desc, id: `${p}menu ${id}`
    }))

    try {
        await enviarLista(ctx.client, ctx.from, {
            titulo: '',
            texto: cabecalho(ctx),
            rodape: 'Selecione uma categoria',
            botao: 'MENU - CATEGORIAS',
            imagem,
            quoted: ctx.info,
            secoes: [
                { title: 'MEUS MENUS', highlight_label: config.botName, rows: [
                    { header: '', title: 'MENU PRINCIPAL', description: 'Abrir todos os menus', id: `${p}menu todos` },
                    ...rows
                ] },
                { title: 'CRIADOR & DONO', rows: [
                    { header: '', title: 'CRIADOR', description: 'Falar com o dono', id: `${p}dono` }
                ] }
            ]
        })
    } catch (erro) {
        console.error('Lista interativa falhou, usando texto:', erro?.message || erro)
        await enviarTexto(ctx, textoCompleto(ctx, cats), imagem)
    }
}
