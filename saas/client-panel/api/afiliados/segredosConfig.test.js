const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const MESTRA = 'chave-mestra-so-para-teste-0123456789abcdef'
process.env.SAAS_MASTER_KEY = MESTRA
const sc = require('./segredosConfig')

const SEG = 'segredo-shopee-ABC123'
const cfgs = () => ({ u1: { email: 'a@a', shopee: { appId: '1', secret: SEG, keyword: '' } }, u2: { email: 'b@b' }, u3: { shopee: { appId: '', secret: '' } } })
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'namy-seg-'))

test('ida e volta: em disco cifrado, em memoria texto; quem nao tem segredo fica igual', () => {
  const disco = sc.paraDisco(cfgs())
  assert.ok(disco.u1.shopee.secret.startsWith(sc.PREFIXO))
  assert.equal(JSON.stringify(disco).includes(SEG), false)
  assert.deepEqual(disco.u2, cfgs().u2)
  assert.equal(disco.u3.shopee.secret, '')
  assert.equal(sc.paraMemoria(disco).u1.shopee.secret, SEG)
  assert.equal(sc.paraDisco(disco).u1.shopee.secret, disco.u1.shopee.secret, 'ja cifrado nao cifra de novo')
})

test('nao altera o objeto recebido', () => {
  const c = cfgs()
  sc.paraDisco(c)
  assert.equal(c.u1.shopee.secret, SEG)
})

test('migrar: backup 0600 com o original, arquivo cifrado, segunda rodada nao faz nada', () => {
  const d = tmp(); const f = path.join(d, 'configs.json')
  fs.writeFileSync(f, JSON.stringify(cfgs()))
  const r = sc.migrar(f)
  assert.equal(r.migrados, 1)
  assert.equal(JSON.parse(fs.readFileSync(r.backup, 'utf8')).u1.shopee.secret, SEG)
  assert.equal(fs.statSync(r.backup).mode & 0o777, 0o600)
  assert.equal(fs.readFileSync(f, 'utf8').includes(SEG), false)
  assert.equal(sc.paraMemoria(JSON.parse(fs.readFileSync(f, 'utf8'))).u1.shopee.secret, SEG)
  const antes = fs.readFileSync(f, 'utf8')
  assert.equal(sc.migrar(f).migrados, 0)
  assert.equal(fs.readFileSync(f, 'utf8'), antes)
  assert.equal(fs.readdirSync(d).filter((x) => x.includes('bak-pre-cifra')).length, 1)
})

test('migrar: arquivo ilegivel ou inexistente nao quebra nem altera', () => {
  const d = tmp()
  assert.equal(sc.migrar(path.join(d, 'nao-existe.json')).migrados, 0)
  const f = path.join(d, 'x.json'); fs.writeFileSync(f, '{quebrado')
  assert.equal(sc.migrar(f).migrados, 0)
  assert.equal(fs.readFileSync(f, 'utf8'), '{quebrado')
})

test('sem chave mestra: nao cifra, nao migra e nao apaga o segredo', () => {
  const d = tmp(); const f = path.join(d, 'configs.json')
  fs.writeFileSync(f, JSON.stringify(cfgs()))
  delete process.env.SAAS_MASTER_KEY
  try {
    const r = sc.migrar(f)
    assert.equal(r.migrados, 0)
    assert.match(r.motivo, /SAAS_MASTER_KEY/)
    assert.equal(JSON.parse(fs.readFileSync(f, 'utf8')).u1.shopee.secret, SEG)
    assert.equal(sc.paraDisco(cfgs()).u1.shopee.secret, SEG)
    assert.equal(fs.readdirSync(d).length, 1, 'sem backup quando nada foi feito')
  } finally { process.env.SAAS_MASTER_KEY = MESTRA }
})

test('chave errada: memoria fica vazia, mas a gravacao devolve o cifrado original (nada se perde)', () => {
  const disco = sc.paraDisco(cfgs())
  const original = disco.u1.shopee.secret
  process.env.SAAS_MASTER_KEY = 'outra-chave-mestra-totalmente-diferente-9999'
  try {
    const mem = sc.paraMemoria(disco)
    assert.equal(mem.u1.shopee.secret, '')
    assert.equal(sc.paraDisco(mem).u1.shopee.secret, original)
    // o cliente salva um segredo novo: esse vale e o preso some
    mem.u1.shopee.secret = 'novo-segredo-123'
    const novo = sc.paraDisco(mem)
    assert.notEqual(novo.u1.shopee.secret, original)
    assert.equal(sc.paraMemoria(novo).u1.shopee.secret, 'novo-segredo-123')
  } finally { process.env.SAAS_MASTER_KEY = MESTRA }
})

test('valor cifrado adulterado nao abre e nao vira lixo como segredo', () => {
  const disco = sc.paraDisco(cfgs())
  disco.u1.shopee.secret = disco.u1.shopee.secret.slice(0, -4) + 'AAAA'
  assert.equal(sc.paraMemoria(disco).u1.shopee.secret, '')
})

test('checarJwt: producao recusa ausente, padrao e curto; desenvolvimento so avisa', () => {
  const forte = 'x'.repeat(40)
  assert.equal(sc.checarJwt({ NODE_ENV: 'production' }).ok, false)
  assert.equal(sc.checarJwt({ NODE_ENV: 'production', JWT_SECRET: sc.SEGREDO_PADRAO }).ok, false)
  assert.equal(sc.checarJwt({ NODE_ENV: 'production', JWT_SECRET: 'curto' }).ok, false)
  assert.deepEqual(sc.checarJwt({ NODE_ENV: 'production', JWT_SECRET: forte }), { ok: true })
  const dev = sc.checarJwt({})
  assert.equal(dev.ok, true)
  assert.match(dev.aviso, /só em desenvolvimento/)
  assert.deepEqual(sc.checarJwt({ JWT_SECRET: forte }), { ok: true })
})

const envReal = (() => { try { return fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8') } catch { return '' } })()
const jwtNoEnv = /^[ \t]*JWT_SECRET[ \t]*=[ \t]*\S/m.test(envReal)

test('o servidor de verdade recusa subir em producao sem JWT_SECRET', { skip: jwtNoEnv && 'o .env local ja define JWT_SECRET' }, () => {
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { PATH: process.env.PATH, NODE_ENV: 'production', PORT: '0', HOME: os.tmpdir() }, encoding: 'utf8', timeout: 15000
  })
  assert.equal(r.status, 1)
  assert.match(r.stderr, /JWT_SECRET/)
})
