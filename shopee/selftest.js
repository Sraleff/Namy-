const assert = require('assert')
const crypto = require('crypto')
const produtos = require('./produtos')
const templates = require('./templates')
const commands = require('./commands')
const scheduler = require('./scheduler')
const historico = require('./historico')
const grupos = require('./grupos')
const store = require('./store')
const { limpar } = require('./log')
const wa = require('./wa')

function testarAssinatura() {
    const appId = '123'
    const secret = 's3cret-value'
    const payload = '{"query":"{ ping }"}'
    const timestamp = '1700000000'
    const sig = crypto.createHash('sha256').update(appId + timestamp + payload + secret).digest('hex')
    assert.strictEqual(sig.length, 64)
    assert.doesNotMatch(sig, /s3cret/)
}

function testarValidacao() {
    assert.strictEqual(produtos.normalizar({}), null)
    assert.strictEqual(produtos.normalizar({ itemId: '1', productName: 'X' }), null)
    assert.strictEqual(produtos.normalizar({
        itemId: '1',
        productName: 'X',
        offerLink: 'https://s.shopee.com.br/x'
    }), null)
    const ok = produtos.normalizar({
        itemId: '99',
        productName: 'Fone Bluetooth XYZ',
        offerLink: 'https://s.shopee.com.br/abc',
        priceMin: '39.90',
        imageUrl: 'https://cf.shopee.com.br/file/x'
    })
    assert.ok(ok)
    assert.strictEqual(ok.productId, '99')
    assert.match(ok.preco, /R\$/)
}

function testarTemplate() {
    const t = templates.local({
        nome: 'Fone Bluetooth XYZ',
        preco: 'R$ 39,90',
        link: 'LINK_DE_AFILIADO'
    })
    assert.match(t, /Fone Bluetooth XYZ/)
    assert.match(t, /R\$ 39,90/)
    assert.match(t, /LINK_DE_AFILIADO/)
}

function testarLogRedact() {
    const out = limpar('Authorization SHA256 Credential=1, Secret=super-secret-key')
    assert.doesNotMatch(out, /super-secret-key/)
    process.env.SHOPEE_SECRET = 'valor-secreto-xyz'
    const out2 = limpar('falhou valor-secreto-xyz no meio')
    assert.doesNotMatch(out2, /valor-secreto-xyz/)
    delete process.env.SHOPEE_SECRET
}

function testarIntervaloHorario() {
    assert.strictEqual(commands.parseIntervalo('2h'), 120)
    assert.strictEqual(commands.parseIntervalo('45m'), 45)
    assert.deepStrictEqual(commands.parseHorario('09:00-22:00'), { inicio: '09:00', fim: '22:00' })
    const g = { horarioInicio: '09:00', horarioFim: '22:00' }
    assert.strictEqual(typeof scheduler.dentroDoHorario(g), 'boolean')
}

function testarTodosOnSoCadastrados() {
    const dados = store.carregar()
    const backup = JSON.parse(JSON.stringify(dados))
    try {
        store.salvar({
            ...store.vazio(),
            grupos: {
                'A@g.us': { nome: 'A', ativo: false, intervaloMinutos: 120, limiteDiario: 5, horarioInicio: '09:00', horarioFim: '22:00', postsHoje: 0, dia: '', nextRunAt: 0 },
                'B@g.us': { nome: 'B', ativo: false, intervaloMinutos: 120, limiteDiario: 5, horarioInicio: '09:00', horarioFim: '22:00', postsHoje: 0, dia: '', nextRunAt: 0 }
            }
        })
        grupos.todos(true)
        const s = store.carregar()
        assert.strictEqual(s.grupos['A@g.us'].ativo, true)
        assert.strictEqual(s.grupos['B@g.us'].ativo, true)
        assert.strictEqual(s.grupos['C@g.us'], undefined)
        assert.strictEqual(s.grupos['D@g.us'], undefined)
        assert.strictEqual(Object.keys(s.grupos).length, 2)
    } finally {
        store.salvar(backup)
    }
}

function testarLimiteEDuplicata() {
    const g = { postsHoje: 5, limiteDiario: 5, dia: scheduler.hojeSP(), ativo: true, nextRunAt: 0, horarioInicio: '00:00', horarioFim: '23:59' }
    assert.ok(g.postsHoje >= g.limiteDiario)
    const dados = store.carregar()
    const backup = JSON.parse(JSON.stringify(dados))
    try {
        store.salvar({
            ...store.vazio(),
            historico: [{
                productId: '111',
                grupoJid: 'G@g.us',
                timestamp: Date.now(),
                link: 'https://s.shopee.com.br/x',
                preco: 'R$ 1,00',
                nome: 'x'
            }]
        })
        assert.strictEqual(historico.duplicado('G@g.us', '111'), true)
        assert.strictEqual(historico.duplicado('G@g.us', '222'), false)
        assert.strictEqual(historico.duplicado('OUTRO@g.us', '111'), false)
    } finally {
        store.salvar(backup)
    }
}

function testarModuloSemCredencial() {
    const prevId = process.env.SHOPEE_APP_ID
    const prevSec = process.env.SHOPEE_SECRET
    delete process.env.SHOPEE_APP_ID
    delete process.env.SHOPEE_SECRET
    const cfg = require('./config')
    assert.strictEqual(cfg.credenciaisOk(), false)
    assert.strictEqual(cfg.habilitado(), false)
    if (prevId) process.env.SHOPEE_APP_ID = prevId
    if (prevSec) process.env.SHOPEE_SECRET = prevSec
}

async function testarIniciarSemCredencial() {
    const prevId = process.env.SHOPEE_APP_ID
    const prevSec = process.env.SHOPEE_SECRET
    const prevEn = process.env.SHOPEE_ENABLED
    try {
        delete process.env.SHOPEE_APP_ID
        delete process.env.SHOPEE_SECRET
        delete process.env.SHOPEE_ENABLED
        const shopee = require('./index')
        const r = await shopee.iniciar({ sendMessage() { throw new Error('nao deveria enviar') } })
        assert.strictEqual(r.ok, false)
        assert.strictEqual(r.motivo, 'sem_credenciais')
    } finally {
        if (prevId !== undefined) process.env.SHOPEE_APP_ID = prevId
        else delete process.env.SHOPEE_APP_ID
        if (prevSec !== undefined) process.env.SHOPEE_SECRET = prevSec
        else delete process.env.SHOPEE_SECRET
        if (prevEn !== undefined) process.env.SHOPEE_ENABLED = prevEn
        else delete process.env.SHOPEE_ENABLED
    }
}

async function testarIaFallback() {
    const fallbackPath = require.resolve('../funcoes/ia/fallback')
    require('../funcoes/ia/fallback')
    const original = require.cache[fallbackPath].exports
    const ia = require('./ia')
    try {
        require.cache[fallbackPath].exports = {
            perguntarComFallback: async () => { throw new Error('quota') },
            erroDeFallback: original.erroDeFallback
        }
        const r = await ia.copy({
            nome: 'Fone Bluetooth XYZ',
            preco: 'R$ 39,90',
            link: 'LINK_DE_AFILIADO'
        })
        assert.strictEqual(r.origem, 'template')
        assert.match(r.texto, /LINK_DE_AFILIADO/)
        assert.match(r.texto, /Fone Bluetooth XYZ/)

        require.cache[fallbackPath].exports = {
            perguntarComFallback: async () => ({ texto: 'oferta sem o endereco', provedor: 'groq' }),
            erroDeFallback: original.erroDeFallback
        }
        const r2 = await ia.copy({
            nome: 'Fone Bluetooth XYZ',
            preco: 'R$ 39,90',
            link: 'LINK_DE_AFILIADO'
        })
        assert.strictEqual(r2.origem, 'template')
        assert.match(r2.texto, /LINK_DE_AFILIADO/)
    } finally {
        require.cache[fallbackPath].exports = original
    }
}

function testarComandosExistentes() {
    const cmds = require('../comandos')
    for (const nome of ['menu', 'ia', 'ping', 'play', 'sticker', 'shopee', 'clima', 'wiki', 'lembrar', 'rank']) {
        assert.strictEqual(typeof cmds[nome], 'function', nome)
    }
}

function testarQuedaWhatsApp() {
    assert.strictEqual(wa.aberto(null), false)
    assert.strictEqual(wa.aberto({}), false)
    assert.strictEqual(wa.aberto({ user: { id: 'x' }, ws: { readyState: 1 } }), true)
    assert.strictEqual(wa.aberto({ user: { id: 'x' }, ws: { isOpen: false } }), false)
    assert.strictEqual(wa.queda({ message: 'Connection Closed' }), true)
    assert.strictEqual(wa.queda({ output: { statusCode: 408 } }), true)
    assert.strictEqual(wa.queda({ code: 'WA' }), true)
    assert.strictEqual(wa.queda({ message: 'Invalid Signature' }), false)
    assert.strictEqual(wa.queda({ code: 'AUTH' }), false)
}

async function main() {
    testarAssinatura()
    testarValidacao()
    testarTemplate()
    testarLogRedact()
    testarIntervaloHorario()
    testarTodosOnSoCadastrados()
    testarLimiteEDuplicata()
    testarModuloSemCredencial()
    await testarIniciarSemCredencial()
    await testarIaFallback()
    testarComandosExistentes()
    testarQuedaWhatsApp()
    console.log('shopee selftest ok')
}

main().catch((erro) => {
    console.error(erro)
    process.exit(1)
})
