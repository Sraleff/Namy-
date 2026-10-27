/**
 * Rotas da Central. userId sai so do JWT.
 * Nao grava nem le a lista de grupos dos anuncios.
 */
const store = require('./store')
const regras = require('./regras')
const fila = require('./fila')

function jidGrupo(jid) {
  return /^[0-9A-Za-z._-]+@g\.us$/.test(String(jid || ''))
}

function mount(app, deps) {
  const { auth, DATA, sessions, ofertas, readJson, CONFIGS } = deps

  function licencaAtiva(userId) {
    if (!readJson || !CONFIGS) return true
    const configs = readJson(CONFIGS, {})
    const cfg = configs[userId]
    if (!cfg || !cfg.license) return false
    return !!cfg.license.active && new Date(cfg.license.expiresAt) > new Date()
  }

  app.get('/divulgacao/grupos', auth, async (req, res) => {
    try {
      const groups = await sessions.listGroups(req.user.id)
      res.json({ ok: true, groups })
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || 'Falha ao listar grupos' })
    }
  })

  app.get('/divulgacao/ficha', auth, async (req, res) => {
    try {
      const info = await sessions.groupInfo(req.user.id, String(req.query.jid || ''))
      res.json({ ok: true, group: info, aviso: 'Nome de perfil não vem nesta consulta. Número só aparece se o WhatsApp enviar.' })
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || 'Falha ao ler participantes' })
    }
  })

  app.post('/divulgacao/convite', auth, async (req, res) => {
    try {
      const jid = String((req.body && req.body.jid) || '')
      const link = await sessions.inviteLink(req.user.id, jid)
      let campaign = null
      if (req.body && req.body.campaignId) {
        campaign = await store.update(DATA, req.user.id, (db) => regras.definirConvite(db, req.body.campaignId, link.url))
      }
      res.json({ ok: true, url: link.url, campaign })
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || 'Falha no convite' })
    }
  })

  app.post('/divulgacao/registrar', auth, async (req, res) => {
    try {
      const jid = String((req.body && req.body.jid) || '')
      if (!jidGrupo(jid)) return res.status(400).json({ error: 'Grupo inválido' })
      const info = await sessions.groupInfo(req.user.id, jid)
      const contacts = await store.update(DATA, req.user.id, (db) => regras.importarParticipantes(db, jid, info.participants))
      res.json({
        ok: true,
        total: contacts.length,
        consent: 'nenhum',
        aviso: 'Registrar não autoriza mensagem. Autorize cada contato na mão.'
      })
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || 'Falha ao registrar' })
    }
  })

  app.get('/divulgacao/contatos', auth, (req, res) => {
    const db = store.load(DATA, req.user.id)
    res.json({ ok: true, contacts: db.contacts })
  })

  app.post('/divulgacao/contatos', auth, async (req, res) => {
    try {
      const body = req.body || {}
      const out = await store.update(DATA, req.user.id, (db) => regras.registrarContato(db, {
        stableId: body.stableId,
        phone: body.phone,
        label: body.label,
        origin: 'manual',
        originGroup: ''
      }))
      res.json({ ok: true, contact: out.contact, created: out.created, consent: out.contact.consent })
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || 'Falha ao registrar' })
    }
  })

  app.post('/divulgacao/contatos/consentimento', auth, async (req, res) => {
    try {
      const body = req.body || {}
      const contact = await store.update(DATA, req.user.id, (db) => regras.setConsent(db, body.id, body.consent, 'painel'))
      res.json({ ok: true, contact })
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || 'Falha no consentimento' })
    }
  })

  app.get('/divulgacao/campanhas', auth, (req, res) => {
    const db = store.load(DATA, req.user.id)
    res.json({ ok: true, campaigns: db.campaigns, relatorio: regras.relatorio(db, '') })
  })

  app.post('/divulgacao/campanhas', auth, async (req, res) => {
    try {
      const camp = await store.update(DATA, req.user.id, (db) => regras.criarCampanha(db, req.body || {}))
      res.json({ ok: true, campaign: camp })
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || 'Falha ao criar' })
    }
  })

  app.post('/divulgacao/campanhas/convite-colado', auth, async (req, res) => {
    try {
      const body = req.body || {}
      const camp = await store.update(DATA, req.user.id, (db) => regras.definirConvite(db, body.id, String(body.url || '').trim()))
      res.json({ ok: true, campaign: camp })
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || 'Link inválido' })
    }
  })

  app.post('/divulgacao/campanhas/oferta', auth, async (req, res) => {
    try {
      if (!licencaAtiva(req.user.id)) return res.status(403).json({ error: 'Licença expirada ou inativa.' })
      const configs = readJson(CONFIGS, {})
      const cfg = configs[req.user.id]
      const oferta = await ofertas.preparar(DATA, req.user.id, cfg && cfg.shopee)
      const body = req.body || {}
      let campaign = null
      if (body.id) {
        campaign = await store.update(DATA, req.user.id, (db) => regras.anexarOferta(db, body.id, oferta))
      }
      res.json({
        ok: true,
        oferta: {
          nome: oferta.nome,
          preco: oferta.preco,
          desconto: oferta.desconto,
          link: oferta.link,
          texto: oferta.texto,
          cupom: null
        },
        aviso: oferta.desconto ? null : 'Sem código de cupom nesta API. Promoção só segue se a oferta trouxer desconto.',
        campaign
      })
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || 'Falha na oferta' })
    }
  })

  app.post('/divulgacao/campanhas/destinatarios', auth, async (req, res) => {
    try {
      const body = req.body || {}
      const out = await store.update(DATA, req.user.id, (db) => regras.definirDestinatarios(db, body.id, body.contactIds || []))
      res.json({ ok: true, campaign: out.campaign, pulados: out.pulados })
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || 'Falha na lista' })
    }
  })

  app.post('/divulgacao/campanhas/aprovar', auth, async (req, res) => {
    try {
      if (!licencaAtiva(req.user.id)) return res.status(403).json({ error: 'Licença expirada ou inativa.' })
      const camp = await store.update(DATA, req.user.id, (db) => regras.aprovar(db, (req.body || {}).id))
      res.json({ ok: true, campaign: camp })
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || 'Falha ao aprovar' })
    }
  })

  app.post('/divulgacao/campanhas/pausar', auth, async (req, res) => {
    try {
      const camp = await store.update(DATA, req.user.id, (db) => regras.mudar(db, (req.body || {}).id, 'pausada', ['rodando', 'agendada']))
      res.json({ ok: true, campaign: camp })
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || 'Falha ao pausar' })
    }
  })

  app.post('/divulgacao/campanhas/retomar', auth, async (req, res) => {
    try {
      const camp = await store.update(DATA, req.user.id, (db) => regras.mudar(db, (req.body || {}).id, 'rodando', ['pausada']))
      res.json({ ok: true, campaign: camp })
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || 'Falha ao retomar' })
    }
  })

  app.post('/divulgacao/campanhas/cancelar', auth, async (req, res) => {
    try {
      const camp = await store.update(DATA, req.user.id, (db) => regras.mudar(db, (req.body || {}).id, 'cancelada', ['rascunho', 'agendada', 'rodando', 'pausada']))
      res.json({ ok: true, campaign: camp })
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || 'Falha ao cancelar' })
    }
  })

  app.post('/divulgacao/campanhas/reenviar-incertos', auth, async (req, res) => {
    try {
      const out = await store.update(DATA, req.user.id, (db) => regras.reenviarIncertos(db, (req.body || {}).id))
      res.json({ ok: true, reabertos: out.reabertos, campaign: out.campaign })
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || 'Falha ao reabrir' })
    }
  })

  app.get('/divulgacao/relatorio', auth, (req, res) => {
    const db = store.load(DATA, req.user.id)
    res.json({ ok: true, relatorio: regras.relatorio(db, String(req.query.id || '')) })
  })

  return { licencaAtiva }
}

function startFila(deps) {
  fila.start({
    DATA: deps.DATA,
    logs: deps.logs,
    licencaAtiva: deps.licencaAtiva,
    conectado: (userId) => {
      try { return !!deps.sessions.publicState(userId).connected } catch { return false }
    },
    enviar: (userId, jid, text) => deps.sessions.sendText(userId, jid, text)
  })
}

module.exports = { mount, startFila }
