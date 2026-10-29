const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { ajudaDe } = require('./waAjuda')

const codigo = (st) => (ajudaDe(st) || {}).codigo

test('cada mensagem de erro do sessions.js tem uma ajuda especifica (nada cai no generico)', () => {
  const fonte = fs.readFileSync(path.join(__dirname, 'sessions.js'), 'utf8')
  const achadas = new Set()
  for (const m of fonte.matchAll(/error:\s*'([^']+)'/g)) achadas.add(m[1])
  for (const m of fonte.matchAll(/'(WhatsApp conectou em outro lugar[^']*)'/g)) achadas.add(m[1])
  for (const m of fonte.matchAll(/'(Conexao caiu \()'/g)) achadas.add(m[1] + '408). Toque em reconectar.')
  for (const m of fonte.matchAll(/'(Falha ao reiniciar: )'/g)) achadas.add(m[1] + 'timeout')
  assert.ok(achadas.size >= 6, 'achou ' + achadas.size + ' mensagens no sessions.js: ' + [...achadas].join(' | '))
  for (const msg of achadas) {
    const a = ajudaDe({ status: 'error', error: msg })
    assert.ok(a && a.codigo !== 'desconhecido', 'sem ajuda para: ' + msg)
    assert.ok(a.passos.length >= 1 && a.titulo && a.acao !== undefined, msg)
  }
})

test('situacoes sem erro: conectado, desconectado, conectando e aguardando o codigo', () => {
  assert.equal(ajudaDe({ connected: true, status: 'connected' }), null)
  assert.equal(ajudaDe({ status: 'connected' }), null)
  assert.equal(codigo({ status: 'disconnected', error: null }), 'desconectado')
  assert.equal(ajudaDe({ status: 'disconnected' }).acao, 'conectar')
  assert.ok(ajudaDe({ status: 'disconnected' }).passos.some((p) => /Aparelhos conectados/.test(p)), 'ensina o caminho no celular')
  assert.equal(codigo({ status: 'connecting' }), 'conectando')
  assert.equal(codigo({ status: 'reconnecting' }), 'conectando')
  assert.equal(codigo({ status: 'waiting_code' }), 'aguardando-codigo')
  assert.equal(ajudaDe(undefined).codigo, 'desconectado')
})

test('cada erro leva a acao certa e as de reconexao automatica pedem so paciencia', () => {
  assert.equal(ajudaDe({ error: 'Sessao encerrada no WhatsApp' }).acao, 'esquecer')
  assert.equal(ajudaDe({ error: 'Sessao invalida. Toque em desconectar e conecte de novo.' }).acao, 'esquecer')
  assert.equal(ajudaDe({ error: 'WhatsApp conectou em outro lugar. Toque em reconectar.' }).codigo, 'outro-lugar')
  assert.equal(ajudaDe({ error: 'Conexao caiu (408). Reconectando em 5s.' }).codigo, 'queda-auto')
  assert.equal(ajudaDe({ error: 'Conexao caiu (408). Reconectando em 5s.' }).acao, 'aguardar')
  assert.equal(ajudaDe({ error: 'Conexao caiu (428). Toque em reconectar.' }).codigo, 'queda')
  assert.equal(ajudaDe({ error: 'Socket caiu. Toque em reconectar.' }).acao, 'reconectar')
  assert.equal(ajudaDe({ error: 'O pareamento nao foi concluido (o codigo expirou ou nao foi digitado no celular). Toque em Conectar para gerar outro codigo.' }).acao, 'conectar')
  assert.equal(ajudaDe({ error: 'Muitas tentativas de reinicio (515). Toque em reconectar.' }).codigo, 'reinicio')
  assert.equal(ajudaDe({ error: 'O WhatsApp pediu um intervalo para listar os grupos. Espere cerca de 1 minuto' }).codigo, 'limite')
})

test('erro desconhecido ainda orienta, e texto gigante ou estranho nao quebra', () => {
  const a = ajudaDe({ status: 'error', error: 'algo nunca visto: ' + 'x'.repeat(500) })
  assert.equal(a.codigo, 'desconhecido')
  assert.ok(a.porque.length <= 200)
  assert.ok(a.passos.length >= 1)
  for (const ruim of [{ error: 42 }, { error: {} }, { error: '' }, { status: 12 }, null]) assert.doesNotThrow(() => ajudaDe(ruim), JSON.stringify(ruim))
  assert.equal(JSON.stringify(a).includes('<script'), false)
})
