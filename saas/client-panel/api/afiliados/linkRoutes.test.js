const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const links = require('./links')
const ofertas = require('../ofertas')
const logs = require('../logs')
const linkRoutes = require('./linkRoutes')

// Sem rede: troca so a chamada a API da Shopee e a checagem ao vivo
const chamadas = []
ofertas.encurtar = async (appId, secret, url) => {
  chamadas.push({ appId, url })
  if (/product\/9\/9999/.test(url)) return null // produto que a API "recusa" (o conector envia a forma canonica)
  return 'https://s.shopee.com.br/AFIL' + url.replace(/\D/g, '').slice(-4)
}
links.validarAoVivo = async () => ({ ok: true, motivo: '' })

const PROD1 = 'https://shopee.com.br/Air-Fryer-i.111.2222'
const PROD2 = 'https://shopee.com.br/Fone-Bluetooth-i.333.4444'

function ambiente({ cfg, limitePorMin } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'linkroutes-'))
  const CONFIGS = path.join(dir, 'configs.json')
  const exp = new Date(Date.now() + 864e5).toISOString()
  const base = {
    license: { active: true, expiresAt: exp },
    shopee: { appId: 'APP123', secret: 'SEGREDO-NAO-VAZAR' }
  }
  fs.writeFileSync(CONFIGS, JSON.stringify({ u1: Object.assign(base, cfg || {}), u2: Object.assign({}, base) }))
  const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return d } }
  const rotas = {}
  const app = { post: (p, ...hs) => { rotas[p] = hs } }
  const auth = (req, _res, next) => next()
  linkRoutes.mount(app, { auth, readJson, CONFIGS, DATA: dir, logs }, { limitePorMin })
  const handler = rotas['/conversor/link'][rotas['/conversor/link'].length - 1]
  async function chamar(userId, body) {
    const res = { code: 200, body: null, status(c) { this.code = c; return this }, json(b) { this.body = b; return this } }
    await handler({ user: { id: userId }, body }, res)
    return res
  }
  return { dir, chamar, logsDe: (u) => logs.read(dir, u) }
}

test('sem App ID e Secret da Shopee: 400 claro e nenhuma chamada a API', async () => {
  const antes = chamadas.length
  const a = ambiente({ cfg: { shopee: { appId: '', secret: '' } } })
  const r = await a.chamar('u1', { texto: PROD1 })
  assert.equal(r.code, 400)
  assert.equal(r.body.codigo, 'SEM_CHAVE')
  assert.match(r.body.error, /Shopee/)
  assert.equal(chamadas.length, antes)
})

test('entrada invalida: vazio, nao-string, sem link, grande demais e links demais', async () => {
  const a = ambiente()
  assert.equal((await a.chamar('u1', {})).code, 400)
  assert.equal((await a.chamar('u1', { texto: '   ' })).code, 400)
  assert.equal((await a.chamar('u1', { texto: { x: 1 } })).code, 400)
  assert.equal((await a.chamar('u1', { texto: 'ola, sem link nenhum' })).code, 400)
  assert.equal((await a.chamar('u1', { texto: 'x'.repeat(linkRoutes.MAX_TEXTO + 1) })).code, 400)
  const muitos = Array.from({ length: linkRoutes.MAX_LINKS + 1 }, (_, i) => 'https://shopee.com.br/Prod-i.1.' + (1000 + i)).join(' ')
  const r = await a.chamar('u1', { texto: muitos })
  assert.equal(r.code, 400)
  assert.match(r.body.error, /máximo/i)
})

test('licenca expirada: 403', async () => {
  const a = ambiente({ cfg: { license: { active: true, expiresAt: new Date(Date.now() - 1000).toISOString() } } })
  const r = await a.chamar('u1', { texto: PROD1 })
  assert.equal(r.code, 403)
})

test('so Shopee: Mercado Livre e Amazon ficam em "fora" e a Shopee converte', async () => {
  const a = ambiente()
  const so = await a.chamar('u1', { texto: 'https://www.amazon.com.br/dp/B0ABCDEFGH https://produto.mercadolivre.com.br/MLB-1234567-x' })
  assert.equal(so.code, 400)
  assert.equal(so.body.fora.length, 2)
  const misto = await a.chamar('u1', { texto: PROD1 + ' https://www.amazon.com.br/dp/B0ABCDEFGH' })
  assert.equal(misto.code, 200)
  assert.equal(misto.body.ok, true)
  assert.equal(misto.body.resultados.length, 1)
  assert.equal(misto.body.fora.length, 1)
  assert.match(misto.body.fora[0].motivo, /Ofertas/)
})

test('sucesso: devolve o link curto, usa as chaves da conta do JWT e loga sem segredo', async () => {
  const a = ambiente()
  chamadas.length = 0
  // body tenta se passar por outra conta: so o JWT vale
  const r = await a.chamar('u1', { texto: 'Olha: ' + PROD1 + ' e ' + PROD2 + ' e ' + PROD1, userId: 'u2' })
  assert.equal(r.code, 200)
  assert.equal(r.body.ok, true)
  assert.equal(r.body.resultados.length, 2, 'link repetido conta uma vez')
  assert.ok(r.body.resultados.every((x) => /^https:\/\/s\.shopee\.com\.br\/AFIL\d{4}$/.test(x.para)))
  assert.equal(chamadas.length, 2)
  assert.ok(chamadas.every((c) => c.appId === 'APP123'))
  const linhas = a.logsDe('u1').filter((l) => l.source === 'conversor')
  assert.equal(linhas.length, 2)
  assert.ok(linhas.every((l) => l.ok === true && /s\.shopee\.com\.br\/AFIL/.test(l.message)))
  assert.equal(JSON.stringify(a.logsDe('u1')).includes('SEGREDO-NAO-VAZAR'), false)
  assert.equal(a.logsDe('u2').length, 0, 'nada gravado na outra conta')
})

test('API da Shopee falha: erro por link, ok=false e log de aviso', async () => {
  const a = ambiente()
  const r = await a.chamar('u1', { texto: 'https://shopee.com.br/Falha-i.9.9999' })
  assert.equal(r.code, 200)
  assert.equal(r.body.ok, false)
  assert.equal(r.body.resultados.length, 0)
  assert.equal(r.body.erros.length, 1)
  assert.match(r.body.erros[0].motivo, /Shopee/i)
  const l = a.logsDe('u1').find((x) => x.source === 'conversor')
  assert.equal(l.level, 'warn')
  assert.equal(l.ok, false)
})

test('limite por minuto: recusa com 429 e nao chama a API', async () => {
  const a = ambiente({ limitePorMin: 2 })
  chamadas.length = 0
  assert.equal((await a.chamar('u1', { texto: PROD1 })).code, 200)
  assert.equal((await a.chamar('u1', { texto: PROD2 })).code, 200)
  const r = await a.chamar('u1', { texto: 'https://shopee.com.br/Outro-i.5.5555' })
  assert.equal(r.code, 429)
  assert.equal(chamadas.length, 2)
  // outro cliente nao e afetado
  assert.equal((await a.chamar('u2', { texto: PROD1 })).code, 200)
})

test('limitador: janela desliza e consome varias unidades de uma vez', () => {
  const permitir = linkRoutes.criarLimitador(3, 1000)
  assert.equal(permitir('x', 2, 0), true)
  assert.equal(permitir('x', 2, 10), false, 'estouraria o teto: recusa tudo')
  assert.equal(permitir('x', 1, 20), true)
  assert.equal(permitir('x', 1, 30), false)
  assert.equal(permitir('x', 1, 1500), true, 'passou a janela')
})
