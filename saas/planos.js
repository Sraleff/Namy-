// Limites de exemplo. null = ilimitado. Ajuste aqui sem mexer no resto do sistema.
// permiteChaveCasa: o cliente pode usar as chaves de IA/Shopee da plataforma (cobrado na mensalidade).
const PLANOS = {
    basico: { nome: 'Básico', maxGrupos: 3, maxAnunciosDia: 100, maxIntegracoes: 1, permiteChaveCasa: false },
    pro: { nome: 'Pro', maxGrupos: 10, maxAnunciosDia: 500, maxIntegracoes: 3, permiteChaveCasa: true },
    premium: { nome: 'Premium', maxGrupos: null, maxAnunciosDia: 2000, maxIntegracoes: null, permiteChaveCasa: true }
}

function obter(id) {
    return PLANOS[String(id || '').toLowerCase()] || null
}

function listar() {
    return Object.entries(PLANOS).map(([id, p]) => ({ id, ...p }))
}

function dentroDoLimite(limite, atual) {
    return limite === null || limite === undefined || atual < limite
}

function fmt(limite) {
    return limite === null || limite === undefined ? 'ilimitado' : String(limite)
}

module.exports = { PLANOS, obter, listar, dentroDoLimite, fmt }
