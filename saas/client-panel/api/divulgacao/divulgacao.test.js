const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const store = require('./store')
const regras = require('./regras')
const fila = require('./fila')

function dir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'namy-central-'))
}

test('registrar participante nao autoriza e nao duplica', async () => {
  const data = dir()
  const user = 'user-a'
  await store.update(data, user, (db) => {
    regras.importarParticipantes(db, 'abc@g.us', [
      { id: '5511999999999@s.whatsapp.net', phone: '5511999999999' },
      { id: '5511999999999@s.whatsapp.net', phone: '5511999999999' }
    ])
  })
  const db = store.load(data, user)
  assert.equal(db.contacts.length, 1)
  assert.equal(db.contacts[0].consent, 'nenhum')
})

test('lista final so leva autorizado e deduplica', async () => {
  const data = dir()
  const user = 'user-b'
  let ids
  await store.update(data, user, (db) => {
    const a = regras.registrarContato(db, { stableId: '1@s.whatsapp.net', phone: '5511111111111', origin: 'manual' })
    const b = regras.registrarContato(db, { stableId: '2@s.whatsapp.net', phone: '5511222222222', origin: 'manual' })
    regras.setConsent(db, a.contact.id, 'autorizado', 'teste')
    const camp = regras.criarCampanha(db, { type: 'grupo', name: 'G', message: 'vem', intervalSec: 20 })
    regras.definirConvite(db, camp.id, 'https://chat.whatsapp.com/Abcd1234')
    const out = regras.definirDestinatarios(db, camp.id, [a.contact.id, a.contact.id, b.contact.id])
    ids = { camp: camp.id, pulados: out.pulados.length, dest: out.campaign.recipients.length }
  })
  assert.equal(ids.dest, 1)
  assert.equal(ids.pulados, 1)
})

test('promocao sem desconto nao inventa cupom', async () => {
  const data = dir()
  await assert.rejects(
    () => store.update(data, 'user-c', (db) => {
      const camp = regras.criarCampanha(db, { type: 'promocao', name: 'P' })
      regras.anexarOferta(db, camp.id, { nome: 'Fone', link: 'https://shopee.com.br/x', desconto: null, texto: 'sem cupom' })
    }),
    /cupom/
  )
})

test('fila nao reenvia aceito depois de reiniciar e para se revogar', async () => {
  const data = dir()
  const user = 'user-d'
  const enviados = []
  let campId
  let c1
  let c2
  await store.update(data, user, (db) => {
    c1 = regras.registrarContato(db, { stableId: '5511333333333@s.whatsapp.net', phone: '5511333333333' }).contact
    c2 = regras.registrarContato(db, { stableId: '5511444444444@s.whatsapp.net', phone: '5511444444444' }).contact
    regras.setConsent(db, c1.id, 'autorizado', 'teste')
    regras.setConsent(db, c2.id, 'autorizado', 'teste')
    const camp = regras.criarCampanha(db, { type: 'grupo', name: 'Fila', message: 'oi', intervalSec: 20 })
    regras.definirConvite(db, camp.id, 'https://chat.whatsapp.com/ZzYyXx12')
    regras.definirDestinatarios(db, camp.id, [c1.id, c2.id])
    regras.aprovar(db, camp.id)
    campId = camp.id
  })
  const deps = {
    DATA: data,
    enviar: async (_u, jid, text) => { enviados.push({ jid, text }) }
  }
  const t0 = Date.parse('2026-10-16T12:00:00Z')
  const primeiro = await fila.processarUma(deps, t0)
  assert.equal(primeiro.length, 1)
  assert.equal(primeiro[0].result.ok, true)
  const deNovo = await fila.processarUma(deps, t0 + 1000)
  assert.equal(deNovo.length, 0)
  const segundo = await fila.processarUma(deps, t0 + 21000)
  assert.equal(segundo.length, 1)
  assert.equal(enviados.length, 2)
  const db = store.load(data, user)
  const camp = db.campaigns.find((c) => c.id === campId)
  assert.equal(camp.recipients.filter((r) => r.state === 'aceito').length, 2)
  assert.equal(camp.status, 'concluida')
  const repetiu = await fila.processarUma(deps, t0 + 50000)
  assert.equal(repetiu.length, 0)
  assert.equal(enviados.length, 2)
})

test('desconectado deixa o contato na fila', async () => {
  const data = dir()
  const user = 'user-e'
  await store.update(data, user, (db) => {
    const c = regras.registrarContato(db, { stableId: '5511555555555@s.whatsapp.net', phone: '5511555555555' }).contact
    regras.setConsent(db, c.id, 'autorizado', 'teste')
    const camp = regras.criarCampanha(db, { type: 'grupo', name: 'Queda', intervalSec: 20 })
    regras.definirConvite(db, camp.id, 'https://chat.whatsapp.com/Queda123')
    regras.definirDestinatarios(db, camp.id, [c.id])
    regras.aprovar(db, camp.id)
  })
  let chamou = 0
  await fila.processarUma({
    DATA: data,
    conectado: () => false,
    enviar: async () => { chamou++ }
  }, Date.now())
  assert.equal(chamou, 0)
  const db = store.load(data, user)
  assert.equal(db.campaigns[0].recipients[0].state, 'fila')
})

test('cancelar impede envio e clientes nao se misturam', async () => {
  const data = dir()
  async function prepara(user, phone) {
    await store.update(data, user, (db) => {
      const c = regras.registrarContato(db, { stableId: phone + '@s.whatsapp.net', phone }).contact
      regras.setConsent(db, c.id, 'autorizado', 'teste')
      const camp = regras.criarCampanha(db, { type: 'grupo', name: user, intervalSec: 20 })
      regras.definirConvite(db, camp.id, 'https://chat.whatsapp.com/Iso12345')
      regras.definirDestinatarios(db, camp.id, [c.id])
      regras.aprovar(db, camp.id)
      return camp.id
    })
  }
  await prepara('aaaa-1111', '5511666666661')
  await prepara('bbbb-2222', '5511666666662')
  await store.update(data, 'aaaa-1111', (db) => regras.mudar(db, db.campaigns[0].id, 'cancelada', ['rodando']))
  const enviados = []
  await fila.processarUma({
    DATA: data,
    enviar: async (userId, jid) => { enviados.push(userId + ':' + jid) }
  }, Date.now())
  assert.equal(enviados.length, 1)
  assert.ok(enviados[0].startsWith('bbbb-2222'))
  assert.equal(store.load(data, 'aaaa-1111').contacts.length, 1)
  assert.equal(store.load(data, 'bbbb-2222').contacts.length, 1)
})

test('revogacao pula o contato que ainda estava na fila', async () => {
  const data = dir()
  const user = 'user-f'
  await store.update(data, user, (db) => {
    const c = regras.registrarContato(db, { stableId: '5511777777777@s.whatsapp.net', phone: '5511777777777' }).contact
    regras.setConsent(db, c.id, 'autorizado', 'teste')
    const camp = regras.criarCampanha(db, { type: 'grupo', name: 'Sai', intervalSec: 20 })
    regras.definirConvite(db, camp.id, 'https://chat.whatsapp.com/Sair1234')
    regras.definirDestinatarios(db, camp.id, [c.id])
    regras.aprovar(db, camp.id)
    regras.setConsent(db, c.id, 'revogado', 'teste')
  })
  const enviados = []
  await fila.processarUma({
    DATA: data,
    enviar: async () => { enviados.push(1) }
  }, Date.now())
  assert.equal(enviados.length, 0)
  const db = store.load(data, user)
  assert.equal(db.campaigns[0].recipients[0].state, 'pulado')
  assert.equal(db.campaigns[0].status, 'concluida')
})
