const test = require('node:test')
const assert = require('node:assert/strict')
const { paraBot, shopeeParaBot } = require('./botConfig')

const SEGREDO = 'SEGREDO-DA-SHOPEE-NAO-PODE-SAIR'
const CFG = () => ({
  tenantId: 't1', botName: 'Namy', phone: '5527', botToken: 'TOKEN-DO-BOT',
  affiliate: { link: 'https://s.shopee.com.br/x', template: 'Meu link: {link}' },
  shopee: { appId: '123', secret: SEGREDO, keyword: 'casa' },
  ads: { enabled: true }, ai: { mode: 'auto' },
  license: { plan: 'trial', active: true, expiresAt: '2030-01-01T00:00:00Z' }
})

test('o segredo da Shopee nao sai (nem decifrado, nem no formato cifrado)', () => {
  const saida = JSON.stringify(paraBot(CFG()))
  assert.equal(saida.includes(SEGREDO), false)
  assert.equal(/secret/i.test(saida), false)
  const cifrado = CFG()
  cifrado.shopee.secret = 'enc:v1:abc:def:ghi'
  assert.equal(JSON.stringify(paraBot(cifrado)).includes('enc:v1'), false)
  assert.equal(JSON.stringify(paraBot(CFG())).includes('TOKEN-DO-BOT'), false, 'o token do bot tambem nao e devolvido')
})

test('o que os consumidores usam continua la: affiliate (!link) e license', () => {
  const r = paraBot(CFG())
  assert.equal(r.affiliate.link, 'https://s.shopee.com.br/x')
  assert.equal(r.affiliate.template, 'Meu link: {link}')
  assert.equal(r.license.active, true)
  assert.equal(r.botName, 'Namy')
  assert.deepEqual(r.shopee, { appId: '123', keyword: 'casa', configurado: true })
})

test('shopee ausente ou incompleta: configurado=false e nada quebra', () => {
  assert.deepEqual(shopeeParaBot(undefined), { appId: '', keyword: '', configurado: false })
  assert.deepEqual(shopeeParaBot({ appId: '1' }), { appId: '1', keyword: '', configurado: false })
  assert.equal(paraBot(Object.assign(CFG(), { shopee: undefined })).shopee.configurado, false)
})
