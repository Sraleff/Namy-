const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8')

test('aba central existe e o script fecha', () => {
  assert.match(html, /id="page-central"/)
  assert.match(html, /data-page="central"/)
  assert.match(html, /\['home','wa','shopee','ads','central','account'\]/)
  const script = html.match(/<script>([\s\S]*)<\/script>/)
  assert.ok(script, 'script do painel')
  new Function(script[1])
  assert.equal((html.match(/innerHTML/g) || []).length, 0)
})

test('central nao grava os grupos de anuncios', () => {
  const central = html.split('id="page-central"')[1].split('id="page-account"')[0]
  assert.match(central, /Registrar contatos sem autorizar/)
  assert.match(central, /Cupom: nenhum/)
  assert.doesNotMatch(central, /\/whatsapp\/groups/)
  assert.match(html, /id="page-ads"/)
  assert.match(html, /id="btnLoadGroups"/)
  assert.match(html, /id="btnSaveGroups"/)
  assert.match(html, /\/whatsapp\/groups/)
})
