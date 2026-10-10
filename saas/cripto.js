// Cofre das chaves dos clientes: AES-256-GCM com chave mestra que fica só no .env.
const crypto = require('crypto')

function chaveMestra() {
    const raw = String(process.env.SAAS_MASTER_KEY || '').trim()
    if (raw.length < 32) return null
    return crypto.createHash('sha256').update(raw).digest()
}

function disponivel() {
    return Boolean(chaveMestra())
}

function cifrar(obj) {
    const k = chaveMestra()
    if (!k) throw new Error('sem_chave_mestra')
    const iv = crypto.randomBytes(12)
    const c = crypto.createCipheriv('aes-256-gcm', k, iv)
    const enc = Buffer.concat([c.update(JSON.stringify(obj || {}), 'utf8'), c.final()])
    const tag = c.getAuthTag()
    return ['v1', iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':')
}

function decifrar(texto) {
    if (!texto) return {}
    const k = chaveMestra()
    if (!k) return {}
    try {
        const [v, iv, tag, enc] = String(texto).split(':')
        if (v !== 'v1') return {}
        const d = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(iv, 'base64'))
        d.setAuthTag(Buffer.from(tag, 'base64'))
        const json = Buffer.concat([d.update(Buffer.from(enc, 'base64')), d.final()]).toString('utf8')
        return JSON.parse(json) || {}
    } catch {
        return {}
    }
}

module.exports = { disponivel, cifrar, decifrar }
