const menu = require('./menu')
const ping = require('./ping')
const info = require('./info')
const dono = require('./dono')
const escrever = require('./escrever')
const responda = require('./responda')
const pegarMeme = require('./memes')
const { recomendarFilme, recomendarAnime } = require('./recomendacoes')
const { bomDia, boaNoite, boaTarde } = require('./saudacoes')
const ia = require('./ia')
const piada = require('./piada')
const curiosidade = require('./curiosidade')
const conselho = require('./conselho')

module.exports = {
    // Menu / ajuda
    menu,
    ajuda: menu,
    help: menu,

    // IA
    ia,
    gemini: ia,

    // Utilitários
    ping,
    info,
    dono,
    escrever,
    responda,

    // Diversão
    meme: pegarMeme,
    piada,
    curiosidade,
    conselho,

    // Recomendações
    filme: recomendarFilme,
    anime: recomendarAnime,

    // Saudações (comandos explícitos)
    'bom-dia': bomDia,
    'bomdia': bomDia,
    'boa-noite': boaNoite,
    'boanoite': boaNoite,
    'boa-tarde': boaTarde,
    'boatarde': boaTarde
}
