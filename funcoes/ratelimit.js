// Limite simples por remetente, em memória. Protege contra flood de comandos/IA.
const janelas = new Map()

function permitir(chave, max = 8, janelaMs = 60 * 1000) {
    if (!chave) return true
    const agora = Date.now()
    const lista = (janelas.get(chave) || []).filter((t) => agora - t < janelaMs)
    if (lista.length >= max) {
        janelas.set(chave, lista)
        return false
    }
    lista.push(agora)
    janelas.set(chave, lista)
    return true
}

setInterval(() => {
    const agora = Date.now()
    for (const [k, v] of janelas) {
        if (!v.length || agora - v[v.length - 1] > 10 * 60 * 1000) janelas.delete(k)
    }
}, 5 * 60 * 1000).unref()

module.exports = { permitir }
