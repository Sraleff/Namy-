const config = require('../../config')
const db = require('../db')

const personas = {
    confiante: 'Fale com segurança, como quem manda no papo. Tenha opinião clara.',
    zoada: 'Pode zoar, ser irônica e solta. Humor leve, sem forçar.',
    direta: 'Seja seca, objetiva e sem rodeio. Vai direto ao ponto.',
    cuidadosa: 'Seja acolhedora e atenta. Ajuda de verdade, sem drama.',
    'flerte-alto': 'Pode ser charmosa e provocativa.',
    'fofa-controlada': 'Seja leve e simpática, sem infantilizar.',
    caotica: 'Seja imprevisível, criativa e com atitude. Ainda útil.',
    estrategista: 'Pense à frente. Sugira caminhos e decisões inteligentes.',
    tarada: 'Pode falar de forma safada, com imaginação e clima +18, sem forçar do nada.',
    romantica: 'Pode flertar quando fizer sentido: cantadas, sedução e clima romântico.'
}

const padraoBase = 'confiante'

function escolherTomPorTexto(texto = '') {
    const t = String(texto).toLowerCase()
    if (/(triste|mal|cansad|deprim|sozinho|sozinha|ansios)/.test(t)) return 'cuidadosa'
    if (/(piada|zoeira|kk+|rs+|haha|lol|zoar)/.test(t)) return 'zoada'
    if (/(odio|raiva|puto|puta|irritad|odeio)/.test(t)) return 'direta'
    if (/(codigo|bug|api|erro|config|terminal|servidor|deploy)/.test(t)) return 'estrategista'
    if (/(safad|tes[aã]o|goz|nudes|gostos[ao]|fuder|transar)/.test(t)) return 'tarada'
    if (/(te amo|saudade|beijo|carinho|meu bem)/.test(t)) return 'romantica'
    if (/(amo|gata|gatos|bonita|lindo|gosto de voce|gosto de você)/.test(t)) return 'flerte-alto'
    return null
}

function obterTom(chatId, texto = '') {
    const minutos = config.personalidadeMinutos || 8
    const salvo = db.get('settings', `tom:${chatId}`, null)
    const agora = Date.now()
    const contexto = escolherTomPorTexto(texto)

    if (contexto) {
        db.set('settings', `tom:${chatId}`, { tom: contexto, until: agora + minutos * 60 * 1000 })
        return contexto
    }

    if (salvo?.tom && salvo.until > agora) return salvo.tom

    db.set('settings', `tom:${chatId}`, { tom: padraoBase, until: agora + minutos * 60 * 1000 })
    return padraoBase
}

function definirTom(chatId, tom) {
    if (!personas[tom]) return obterTom(chatId)
    const minutos = config.personalidadeMinutos || 8
    db.set('settings', `tom:${chatId}`, { tom, until: Date.now() + minutos * 60 * 1000 })
    return tom
}

module.exports = {
    personas,
    obterTom,
    definirTom,
    escolherTomPorTexto
}
