const db = require('../funcoes/db')
const ranking = require('../funcoes/ranking')

function estado(chatId) {
    return db.get('games', chatId, {})
}
function salvar(chatId, data) {
    db.set('games', chatId, data)
}

const quizPerguntas = [
    { q: 'Qual a capital do Brasil?', a: ['brasília', 'brasilia'] },
    { q: 'Quantos jogadores um time de futebol tem em campo?', a: ['11', 'onze'] },
    { q: 'Quem pintou a Mona Lisa?', a: ['leonardo da vinci', 'da vinci', 'leonardo'] },
    { q: 'Qual planeta é conhecido como planeta vermelho?', a: ['marte'] },
    { q: 'Em que país fica Tóquio?', a: ['japão', 'japao'] },
    { q: 'Qual o maior oceano?', a: ['pacífico', 'pacifico'] },
    { q: '2 + 2 × 2 = ?', a: ['6', 'seis'] },
    { q: 'Qual é o nome do protagonista de One Piece?', a: ['luffy', 'monkey d. luffy', 'monkey d luffy'] }
]

const palavrasForca = [
    'namy', 'javascript', 'whatsapp', 'espirito santo', 'serra',
    'league of legends', 'inteligencia', 'banana', 'programacao', 'grok'
]

const verdades = [
    'Qual foi a última mentira que você contou?',
    'Quem do grupo você chamaria pra uma missão secreta?',
    'Qual música você ouve escondido?',
    'Qual seu crush impossível?',
    'Qual hábito seu é o mais vergonhoso?'
]

const desafios = [
    'Manda um áudio cantando 5 segundos de qualquer música.',
    'Fala um elogio sincero pra alguém do grupo.',
    'Troca sua foto de grupo por 10 minutos (se o admin deixar).',
    'Conte a piada mais ruim que você conhece.',
    'Fale um fato aleatório sobre você.'
]

async function quiz(ctx) {
    const e = estado(ctx.from)
    if (e.quiz) {
        const chute = ctx.args.join(' ').trim().toLowerCase()
        if (!chute) return ctx.reply(`🧠 Quiz em andamento:\n${e.quiz.q}\nResponda com !quiz sua resposta`)
        if (e.quiz.a.includes(chute)) {
            ranking.vitoria(ctx.senderJid, ctx.senderName, 20)
            salvar(ctx.from, { ...e, quiz: null })
            return ctx.reply('✅ Acertou! +20 XP')
        }
        return ctx.reply('❌ Nope. Tenta de novo.')
    }
    const item = quizPerguntas[Math.floor(Math.random() * quizPerguntas.length)]
    salvar(ctx.from, { ...e, quiz: item })
    ranking.addXp(ctx.senderJid, ctx.senderName, 2)
    return ctx.reply(`🧠 *Quiz*\n${item.q}\n\nResponda com \`!quiz sua resposta\``)
}

async function forca(ctx) {
    const e = estado(ctx.from)
    const chute = (ctx.args[0] || '').toLowerCase()
    if (!e.forca) {
        const palavra = palavrasForca[Math.floor(Math.random() * palavrasForca.length)]
        const jogo = { palavra, tentativas: 6, usadas: [], mascara: palavra.replace(/[a-zà-ÿ]/gi, (c) => (c === ' ' ? ' ' : '_')) }
        salvar(ctx.from, { ...e, forca: jogo })
        return ctx.reply(`🎮 *Forca*\n\`${jogo.mascara}\`\n6 tentativas. Use \`!forca a\``)
    }
    const jogo = e.forca
    if (!chute || chute.length !== 1) return ctx.reply(`🎮 \`${jogo.mascara}\`\nRestam ${jogo.tentativas}. Letras: ${jogo.usadas.join(', ') || '—'}`)
    if (jogo.usadas.includes(chute)) return ctx.reply('Essa letra já foi.')
    jogo.usadas.push(chute)
    if (jogo.palavra.includes(chute)) {
        jogo.mascara = jogo.palavra.split('').map((c) => (c === ' ' || jogo.usadas.includes(c) ? c : '_')).join('')
        if (!jogo.mascara.includes('_')) {
            ranking.vitoria(ctx.senderJid, ctx.senderName, 30)
            salvar(ctx.from, { ...e, forca: null })
            return ctx.reply(`🏆 Completou: *${jogo.palavra}*\n+30 XP`)
        }
        salvar(ctx.from, { ...e, forca: jogo })
        return ctx.reply(`👍 \`${jogo.mascara}\``)
    }
    jogo.tentativas -= 1
    if (jogo.tentativas <= 0) {
        salvar(ctx.from, { ...e, forca: null })
        return ctx.reply(`💀 Enforcou. Era *${jogo.palavra}*.`)
    }
    salvar(ctx.from, { ...e, forca: jogo })
    return ctx.reply(`😬 Não tem. Restam ${jogo.tentativas}. \`${jogo.mascara}\``)
}

async function jokenpo(ctx) {
    const escolha = (ctx.args[0] || '').toLowerCase()
    const opcoes = { pedra: 'pedra', papel: 'papel', tesoura: 'tesoura', rock: 'pedra', paper: 'papel', scissors: 'tesoura' }
    if (!opcoes[escolha]) return ctx.reply('✊ `!jokenpo pedra|papel|tesoura`')
    const eu = ['pedra', 'papel', 'tesoura'][Math.floor(Math.random() * 3)]
    const voce = opcoes[escolha]
    let r = 'empate'
    if (
        (voce === 'pedra' && eu === 'tesoura') ||
        (voce === 'papel' && eu === 'pedra') ||
        (voce === 'tesoura' && eu === 'papel')
    ) r = 'win'
    if (r === 'win') ranking.vitoria(ctx.senderJid, ctx.senderName, 15)
    else ranking.addXp(ctx.senderJid, ctx.senderName, 3)
    const texto = r === 'win' ? 'Você ganhou!' : r === 'empate' ? 'Empate.' : 'Você perdeu.'
    return ctx.reply(`✊ Você: *${voce}*\n🌸 Namy: *${eu}*\n\n${texto}`)
}

async function numero(ctx) {
    const e = estado(ctx.from)
    const n = Number(ctx.args[0])
    if (!e.numero) {
        const alvo = 1 + Math.floor(Math.random() * 100)
        salvar(ctx.from, { ...e, numero: { alvo, tentativas: 0 } })
        return ctx.reply('🔢 Pensei num número de 1 a 100. Chuta com `!numero 42`')
    }
    if (!n) return ctx.reply('Manda um número. `!numero 42`')
    e.numero.tentativas += 1
    if (n === e.numero.alvo) {
        ranking.vitoria(ctx.senderJid, ctx.senderName, 20)
        salvar(ctx.from, { ...e, numero: null })
        return ctx.reply(`🎯 Acertou em ${e.numero.tentativas} tentativas! +20 XP`)
    }
    salvar(ctx.from, e)
    return ctx.reply(n > e.numero.alvo ? '📉 Menor.' : '📈 Maior.')
}

async function adivinhe(ctx) {
    return numero(ctx)
}

async function verdade(ctx) {
    ranking.addXp(ctx.senderJid, ctx.senderName, 5)
    const item = verdades[Math.floor(Math.random() * verdades.length)]
    return ctx.reply(`🧿 *Verdade*\n${item}`)
}

async function desafio(ctx) {
    ranking.addXp(ctx.senderJid, ctx.senderName, 5)
    const item = desafios[Math.floor(Math.random() * desafios.length)]
    return ctx.reply(`🔥 *Desafio*\n${item}`)
}

const vazia = () => [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ']

function desenhar(tab) {
    const c = (i) => (tab[i] === ' ' ? i + 1 : tab[i])
    return ` ${c(0)} | ${c(1)} | ${c(2)}\n---+---+---\n ${c(3)} | ${c(4)} | ${c(5)}\n---+---+---\n ${c(6)} | ${c(7)} | ${c(8)}`
}

function ganhou(tab, p) {
    const linhas = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]
    return linhas.some(([a, b, c]) => tab[a] === p && tab[b] === p && tab[c] === p)
}

async function velha(ctx) {
    const e = estado(ctx.from)
    const arg = (ctx.args[0] || '').toLowerCase()
    if (arg === 'sair' || arg === 'reset') {
        salvar(ctx.from, { ...e, velha: null })
        return ctx.reply('Jogo da velha resetado.')
    }
    if (!e.velha) {
        e.velha = { tab: vazia(), vez: 'X' }
        salvar(ctx.from, e)
        return ctx.reply(`⭕ *Jogo da velha*\nVocê é X. Jogue com \`!velha 5\` (posição 1-9)\n\n${desenhar(e.velha.tab)}`)
    }
    const pos = Number(arg) - 1
    if (pos < 0 || pos > 8) return ctx.reply(`Posição 1 a 9.\n${desenhar(e.velha.tab)}`)
    if (e.velha.tab[pos] !== ' ') return ctx.reply('Essa casa já tem peça.')
    e.velha.tab[pos] = 'X'
    if (ganhou(e.velha.tab, 'X')) {
        ranking.vitoria(ctx.senderJid, ctx.senderName, 25)
        salvar(ctx.from, { ...e, velha: null })
        return ctx.reply(`🏆 Você ganhou!\n${desenhar(e.velha.tab)}`)
    }
    if (!e.velha.tab.includes(' ')) {
        salvar(ctx.from, { ...e, velha: null })
        return ctx.reply(`Empate.\n${desenhar(e.velha.tab)}`)
    }
    const livres = e.velha.tab.map((v, i) => (v === ' ' ? i : null)).filter((x) => x !== null)
    const escolha = livres[Math.floor(Math.random() * livres.length)]
    e.velha.tab[escolha] = 'O'
    if (ganhou(e.velha.tab, 'O')) {
        salvar(ctx.from, { ...e, velha: null })
        return ctx.reply(`🌸 Namy ganhou.\n${desenhar(e.velha.tab)}`)
    }
    salvar(ctx.from, e)
    return ctx.reply(`Eu joguei em ${escolha + 1}.\n${desenhar(e.velha.tab)}`)
}

async function rank(ctx) {
    return ctx.reply(ranking.cartao())
}

module.exports = {
    quiz,
    forca,
    jokenpo,
    numero,
    adivinhe,
    verdade,
    desafio,
    velha,
    rank,
    ranking: rank
}
