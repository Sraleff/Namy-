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
const play = require('./play')
const sticker = require('./sticker')
const memoria = require('./memoria')
const grupo = require('./grupo')
const lembrete = require('./lembrete')
const clima = require('./clima')
const cotacao = require('./cotacao')
const cep = require('./cep')
const traduzir = require('./traduzir')
const wiki = require('./wiki')
const noticias = require('./noticias')
const stats = require('./stats')
const jogos = require('./jogos')
const shopee = require('../shopee/commands')

const plugins = {
    menu,
    ajuda: menu,
    help: menu,

    ia,
    gemini: ia,

    ping,
    info,
    dono,
    escrever,
    responda,
    memoria,
    stats,

    meme: pegarMeme,
    piada,
    curiosidade,
    conselho,
    filme: recomendarFilme,
    anime: recomendarAnime,

    'bom-dia': bomDia,
    bomdia: bomDia,
    'boa-noite': boaNoite,
    boanoite: boaNoite,
    'boa-tarde': boaTarde,
    boatarde: boaTarde,

    play,
    musica: play,
    s: sticker,
    sticker,
    f: sticker,
    figurinha: sticker,

    ban: grupo.ban,
    unban: grupo.unban,
    kick: grupo.kick,
    promover: grupo.promover,
    rebaixar: grupo.rebaixar,
    admins: grupo.admins,
    membros: grupo.membros,
    grupo: grupo.grupo,
    bemvindo: grupo.bemvindo,
    despedida: grupo.despedida,
    antilink: grupo.antilink,
    antispam: grupo.antispam,
    antiinvite: grupo.antiinvite,

    lembrar: lembrete,
    lembrete,
    lembretes: lembrete,

    clima,
    tempo: clima,
    cotacao,
    cotação: cotacao,
    dolar: cotacao,
    cep,
    traduzir,
    traduz: traduzir,
    wiki,
    wikipedia: wiki,
    noticias,
    notícias: noticias,

    quiz: jogos.quiz,
    forca: jogos.forca,
    jokenpo: jogos.jokenpo,
    numero: jogos.numero,
    adivinhe: jogos.adivinhe,
    verdade: jogos.verdade,
    desafio: jogos.desafio,
    velha: jogos.velha,
    rank: jogos.rank,
    ranking: jogos.rank,

    shopee
}

module.exports = plugins
