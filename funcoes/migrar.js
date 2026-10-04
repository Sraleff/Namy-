const fs = require('fs')
const path = require('path')
const db = require('./db')

function lerJson(arquivo) {
    try {
        if (!fs.existsSync(arquivo)) return null
        return JSON.parse(fs.readFileSync(arquivo, 'utf8'))
    } catch {
        return null
    }
}

function migrarSePreciso() {
    const raiz = path.join(__dirname, '..')
    const flag = db.get('settings', 'migrado_v3', false)
    if (flag) return

    const estado = lerJson(path.join(raiz, 'ia_estado.json')) || {}
    const historico = lerJson(path.join(raiz, 'ia_historico.json')) || {}
    const modo = lerJson(path.join(raiz, 'ia_modo.json')) || {}
    const provedor = lerJson(path.join(raiz, 'ia_provedor.json')) || {}
    const memorias = lerJson(path.join(raiz, 'dados', 'memorias.json')) || {}

    for (const [chat, ativo] of Object.entries(estado)) {
        if (ativo) db.set('settings', `ia:${chat}`, true)
    }
    for (const [chat, valor] of Object.entries(modo)) {
        db.set('settings', `modo:${chat}`, valor)
    }
    for (const [chat, valor] of Object.entries(provedor)) {
        db.set('settings', `provedor:${chat}`, valor)
    }
    for (const [chave, msgs] of Object.entries(historico)) {
        db.set('conversations', chave, msgs)
    }
    for (const [jid, mem] of Object.entries(memorias)) {
        db.set('memories', jid, mem)
    }

    db.set('settings', 'migrado_v3', true)
    console.log('🧠 Migração 2.x → 3.0 concluída.')
}

module.exports = { migrarSePreciso }
