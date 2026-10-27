const test = require('node:test')
const assert = require('node:assert/strict')

const ml = require('./mercadolivre')
const { precoSubiu } = require('../travaPreco')
const oauth = require('../mercadolivreOAuth')

const ctx = { userId: 'u1', dataDir: '/tmp/nao-usado', cfg: { mercadolivre: { etiqueta: 'minha', toolId: '12345678' } } }
const LINK = 'https://produto.mercadolivre.com.br/MLB-1234567-fone?matt_word=minha&matt_tool=12345678'
const CATALOGO = 'https://www.mercadolivre.com.br/fone/p/MLB98765?matt_word=minha&matt_tool=12345678'

function comApi(resposta, fn) {
  const st = oauth.status
  const get = oauth.get
  oauth.status = () => ({ conectado: true })
  oauth.get = async (_d, _u, caminho) => (typeof resposta === 'function' ? resposta(caminho) : resposta)
  return fn().finally(() => { oauth.status = st; oauth.get = get })
}

test('validar com OAuth: devolve o preço de agora (anúncio e catálogo); inativo e 404 reprovam', async () => {
  await comApi({ status: 'active', price: 249.9 }, async () => {
    assert.deepEqual(await ml.validar(LINK, ctx), { ok: true, motivo: '', preco: 249.9 })
  })
  await comApi((c) => (c.startsWith('/products/') ? { buy_box_winner: { price: 99 } } : {}), async () => {
    assert.equal((await ml.validar(CATALOGO, ctx)).preco, 99)
  })
  await comApi({ status: 'paused', price: 10 }, async () => {
    assert.match((await ml.validar(LINK, ctx)).motivo, /não está ativo/)
  })
  await comApi(() => { throw Object.assign(new Error('nao achei'), { code: 'ML_404' }) }, async () => {
    assert.match((await ml.validar(LINK, ctx)).motivo, /não existe mais/)
  })
  await comApi({ status: 'active' }, async () => {
    assert.deepEqual(await ml.validar(LINK, ctx), { ok: true, motivo: '' }, 'sem preço na resposta: passa sem trava')
  })
})

test('precoSubiu: só reprova quando o anúncio está mais caro que o texto', () => {
  const t = (preco) => [{ marketplace: 'mercadolivre', preco }]
  assert.match(precoSubiu('🎧 Fone\n💰 R$ 199,90', t(249.9)), /R\$ 199,90 no texto, R\$ 249,90 agora/)
  assert.equal(precoSubiu('💰 R$ 199,90', t(199.9)), '', 'igual passa')
  assert.equal(precoSubiu('💰 R$ 199,90', t(150)), '', 'mais barato passa')
  assert.equal(precoSubiu('💰 R$ 199,90', t(201)), '', 'até 1% de diferença passa (arredondamento)')
  assert.match(precoSubiu('De R$ 1.299,00 por R$ 999,00', t(1500)), /R\$ 1\.299,00 no texto, R\$ 1\.500,00 agora/)
  assert.equal(precoSubiu('sem preço no texto', t(10)), '')
  assert.equal(precoSubiu('R$ 10', [{ marketplace: 'mercadolivre' }]), '', 'sem preço conferido (sem OAuth)')
  assert.equal(precoSubiu('R$ 10', [{ marketplace: 'mercadolivre', preco: 50 }, { marketplace: 'mercadolivre', preco: 60 }]), '', 'dois produtos do ML: ambíguo, não trava')
  assert.equal(precoSubiu('R$ 10', [{ marketplace: 'shopee' }]), '', 'sem preço conferido não trava')
})

test('publicador: oferta do Mercado Livre que ficou mais cara é pulada com o motivo; preço ok sai', async () => {
  const fs = require('fs')
  const os = require('os')
  const path = require('path')
  const pool = require('../pool')
  const publicador = require('../publicador')
  const auditoria = require('../auditoria')
  const links = require('../links')
  const vivo = links.validarAoVivo
  links.validarAoVivo = async () => ({ ok: true, motivo: '' })
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'namy-ml-'))
  const cfg = { ads: { source: 'pool' }, mercadolivre: { etiqueta: 'minha', toolId: '12345678' }, groups: [{ jid: 'g1@g.us', name: 'Geral', niche: 'geral' }] }
  await pool.adicionar(d, 'u1', cfg, { texto: '🎧 Fone bluetooth\n💰 R$ 199,90\nhttps://produto.mercadolivre.com.br/MLB-1234567-fone' })
  const enviados = []
  const sessions = { sendOffer: async (_u, jid, msg) => { enviados.push({ jid, msg }) } }
  try {
    await comApi({ status: 'active', price: 259.9 }, async () => {
      const out = await publicador.publicar({ userId: 'u1', cfg, dataDir: d, sessions })
      assert.equal(out.enviados, 0)
    })
    assert.equal(enviados.length, 0)
    assert.ok(auditoria.listar(d, 'u1').some((r) => r.tipo === 'pulado' && /preço subiu no Mercado Livre/.test(r.motivo)))
    await comApi({ status: 'active', price: 189.9 }, async () => {
      const out = await publicador.publicar({ userId: 'u1', cfg, dataDir: d, sessions })
      assert.equal(out.enviados, 1)
    })
    assert.match(enviados[0].msg.text, /matt_word=minha/)
  } finally { links.validarAoVivo = vivo }
})
