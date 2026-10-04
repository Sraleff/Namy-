const store = require('./store')
const cfg = require('./config')

function duplicado(grupoJid, productId) {
    if (!productId) return true
    const corte = Date.now() - cfg.duplicidadeDias * 24 * 60 * 60 * 1000
    const hist = store.carregar().historico || []
    return hist.some((h) =>
        h.grupoJid === grupoJid &&
        String(h.productId) === String(productId) &&
        Number(h.timestamp) >= corte
    )
}

function registrar({ grupoJid, produto }) {
    store.atualizar((s) => {
        s.historico = s.historico || []
        s.historico.push({
            productId: produto.productId,
            grupoJid,
            timestamp: Date.now(),
            link: produto.link,
            preco: produto.preco,
            nome: produto.nome
        })
        if (s.historico.length > cfg.historicoMax) {
            s.historico = s.historico.slice(-cfg.historicoMax)
        }
        return s
    })
}

module.exports = { duplicado, registrar }
