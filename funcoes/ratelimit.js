// Limite simples por remetente, em memória. Protege contra flood de comandos/IA.
const janelas = new Map()

function permitir(chave, max = 8, janelaMs = 60 * 1000) {
    if (!chave) return { ok: true, avisar: false }
    const agora = Date.now()
    const slot = janelas.get(chave) || { tempos: [], avisou: false }
    slot.tempos = (slot.tempos || []).filter((t) => agora - t < janelaMs)
    if (slot.tempos.length >= max) {
        const avisar = !slot.avisou
        slot.avisou = true
        janelas.set(chave, slot)
        return { ok: false, avisar }
    }
    slot.tempos.push(agora)
    slot.avisou = false
    janelas.set(chave, slot)
    return { ok: true, avisar: false }
}

setInterval(() => {
    const agora = Date.now()
    for (const [k, v] of janelas) {
        const tempos = v?.tempos || []
        if (!tempos.length || agora - tempos[tempos.length - 1] > 10 * 60 * 1000) janelas.delete(k)
    }
}, 5 * 60 * 1000).unref()

module.exports = { permitir }
