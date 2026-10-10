/**
 * Rotas reais de WhatsApp. Montadas pelo server.js.
 * Sessao isolada por req.user.id (JWT). Nunca aceita userId do body.
 */
const crypto = require('crypto')
const sessions = require('./sessions')

function jidGrupo(jid) {
  return /^[0-9A-Za-z._-]+@g\.us$/.test(String(jid || ''))
}

const ultimoTeste = new Map()

function podeTestar(userId) {
  const agora = Date.now()
  const prev = ultimoTeste.get(userId) || 0
  if (agora - prev < 20000) return false
  ultimoTeste.set(userId, agora)
  return true
}

function licencaAtiva(cfg) {
  if (!cfg || !cfg.license) return false
  const exp = new Date(cfg.license.expiresAt)
  return cfg.license.active && exp > new Date()
}

function assinarShopee(appId, secret, payload) {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = crypto
    .createHash('sha256')
    .update(appId + timestamp + payload + secret)
    .digest('hex')
  return `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`
}

module.exports = function mount(app, { auth, readJson, writeJson, CONFIGS, DATA, logs }) {
  function gravarStatus(userId, status) {
    const configs = readJson(CONFIGS, {})
    if (!configs[userId]) return
    const map = {
      connected: 'online',
      waiting_code: 'pairing',
      connecting: 'pairing',
      disconnected: 'offline',
      error: 'offline'
    }
    configs[userId].status = map[status] || 'offline'
    configs[userId].updatedAt = new Date().toISOString()
    writeJson(CONFIGS, configs)
  }

  app.get('/whatsapp/status', auth, (req, res) => {
    res.json(sessions.publicState(req.user.id))
  })

  app.post('/whatsapp/connect', auth, async (req, res) => {
    const phone = String((req.body && req.body.phone) || '').replace(/\D/g, '')
    if (phone.length < 10) return res.status(400).json({ error: 'Numero invalido. Use DDI+DDD+numero.' })
    const configs = readJson(CONFIGS, {})
    const cur = configs[req.user.id]
    if (!cur) return res.status(404).json({ error: 'Conta nao encontrada' })
    if (!licencaAtiva(cur)) return res.status(403).json({ error: 'Licenca expirada ou inativa.' })
    cur.phone = phone
    cur.updatedAt = new Date().toISOString()
    configs[req.user.id] = cur
    writeJson(CONFIGS, configs)
    try {
      const st = await sessions.start(req.user.id, phone, gravarStatus)
      res.json(Object.assign({ ok: true }, st))
    } catch (e) {
      console.error('[SESSAO] connect', e.message)
      res.status(500).json({ error: 'Nao consegui abrir o WhatsApp agora. Tente de novo.' })
    }
  })

  app.post('/whatsapp/disconnect', auth, async (req, res) => {
    const logout = !!(req.body && req.body.logout)
    const st = await sessions.stop(req.user.id, logout)
    gravarStatus(req.user.id, 'disconnected')
    res.json(Object.assign({ ok: true }, st))
  })

  app.post('/whatsapp/reconnect', auth, async (req, res) => {
    const configs = readJson(CONFIGS, {})
    const cur = configs[req.user.id]
    if (!cur) return res.status(404).json({ error: 'Conta nao encontrada' })
    if (!licencaAtiva(cur)) return res.status(403).json({ error: 'Licenca expirada ou inativa.' })
    try {
      await sessions.stop(req.user.id, false)
      const st = await sessions.start(req.user.id, cur.phone || '', gravarStatus)
      res.json(Object.assign({ ok: true }, st))
    } catch (e) {
      res.status(500).json({ error: e.message || 'Falha ao reconectar' })
    }
  })

  // --- Grupos e testes (cliente opera pelo painel) ---

  app.get('/whatsapp/groups', auth, async (req, res) => {
    try {
      const list = await sessions.listGroups(req.user.id)
      const configs = readJson(CONFIGS, {})
      const selected = (configs[req.user.id] && configs[req.user.id].groups) || []
      res.json({ ok: true, groups: list, selected })
    } catch (e) {
      res.status(400).json({ error: e.message || 'Falha ao listar grupos' })
    }
  })

  app.post('/whatsapp/groups', auth, (req, res) => {
    const groups = Array.isArray(req.body && req.body.groups) ? req.body.groups : []
    const configs = readJson(CONFIGS, {})
    const cur = configs[req.user.id]
    if (!cur) return res.status(404).json({ error: 'Conta nao encontrada' })
    cur.groups = groups.map((g) => ({
      jid: String(g.jid || '').slice(0, 80),
      name: String(g.name || g.jid || '').replace(/[<>]/g, '').slice(0, 120)
    })).filter((g) => jidGrupo(g.jid))
    cur.updatedAt = new Date().toISOString()
    configs[req.user.id] = cur
    writeJson(CONFIGS, configs)
    res.json({ ok: true, groups: cur.groups })
  })

  app.post('/ads/test', auth, async (req, res) => {
    const configs = readJson(CONFIGS, {})
    const cur = configs[req.user.id]
    if (!cur) return res.status(404).json({ error: 'Conta nao encontrada' })
    const link = (cur.affiliate && cur.affiliate.link) || ''
    const tpl = (cur.affiliate && cur.affiliate.template) || 'Meu link: {link}'
    if (!link) return res.status(400).json({ error: 'Salve um link afiliado antes de testar.' })
    const text = tpl.replace(/\{link\}/g, link).slice(0, 4000)
    const jid = String((req.body && req.body.jid) || '')
    if (!jidGrupo(jid)) return res.status(400).json({ error: 'Escolha um grupo valido para o teste.' })
    if (!podeTestar(req.user.id)) return res.status(429).json({ error: 'Espere 20 segundos entre testes.' })
    const nome = ((cur.groups || []).find((g) => g.jid === jid) || {}).name || jid
    try {
      await sessions.sendText(req.user.id, jid, text)
      if (logs) logs.append(DATA, req.user.id, { source: 'anuncio', level: 'info', ok: true, group: nome, jid, message: 'Teste enviado.' })
      res.json({ ok: true, message: 'Teste enviado.', results: [{ jid, name: nome, ok: true }] })
    } catch (e) {
      if (logs) logs.append(DATA, req.user.id, { source: 'anuncio', level: 'error', ok: false, group: nome, jid, message: e.message || 'Falha' })
      res.status(400).json({ error: e.message || 'Falha ao enviar teste' })
    }
  })

  app.post('/bot/test', auth, async (req, res) => {
    const configs = readJson(CONFIGS, {})
    const cur = configs[req.user.id]
    if (!cur) return res.status(404).json({ error: 'Conta nao encontrada' })
    if (!licencaAtiva(cur)) return res.status(403).json({ error: 'Licenca expirada ou inativa.' })
    const st = sessions.publicState(req.user.id)
    if (!st.connected) return res.status(400).json({ error: 'WhatsApp nao esta conectado.' })
    const groups = (Array.isArray(cur.groups) ? cur.groups : []).filter((g) => jidGrupo(g.jid))
    if (!groups.length) return res.status(400).json({ error: 'Salve pelo menos um grupo na aba Anuncios.' })
    const link = (cur.affiliate && cur.affiliate.link) || ''
    if (!link) return res.status(400).json({ error: 'Salve um link afiliado antes de testar.' })
    const tpl = (cur.affiliate && cur.affiliate.template) || 'Meu link: {link}'
    const text = tpl.replace(/\{link\}/g, link).slice(0, 4000)
    if (!podeTestar(req.user.id)) return res.status(429).json({ error: 'Espere 20 segundos entre testes.' })
    const results = []
    for (const g of groups) {
      try {
        await sessions.sendText(req.user.id, g.jid, text)
        results.push({ jid: g.jid, name: g.name, ok: true })
        if (logs) logs.append(DATA, req.user.id, { source: 'anuncio', level: 'info', ok: true, group: g.name, jid: g.jid, message: 'Anuncio de teste enviado.' })
      } catch (e) {
        results.push({ jid: g.jid, name: g.name, ok: false, error: e.message || 'erro' })
        if (logs) logs.append(DATA, req.user.id, { source: 'anuncio', level: 'error', ok: false, group: g.name, jid: g.jid, message: e.message || 'Falha no envio' })
      }
    }
    const okN = results.filter((r) => r.ok).length
    res.json({
      ok: okN > 0,
      message: 'Enviado em ' + okN + ' de ' + results.length + ' grupo(s).',
      connected: true,
      results
    })
  })

  app.post('/shopee/test', auth, async (req, res) => {
    const configs = readJson(CONFIGS, {})
    const cur = configs[req.user.id]
    if (!cur || !cur.shopee || !cur.shopee.appId || !cur.shopee.secret) {
      return res.status(400).json({ error: 'Salve App ID e Secret da Shopee antes de testar.' })
    }

    const query = '{ productOfferV2(listType: 0, sortType: 5, page: 1, limit: 1) { nodes { productName } } }'
    const payload = JSON.stringify({ query })
    const authHeader = assinarShopee(cur.shopee.appId, cur.shopee.secret, payload)

    let sample = null
    try {
      const r = await fetch('https://open-api.affiliate.shopee.com.br/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader
        },
        body: payload
      })
      const data = await r.json().catch(() => ({}))
      if (data.errors && data.errors.length) {
        const msg = data.errors[0].message || 'Erro na API'
        return res.status(400).json({ ok: false, error: msg })
      }
      const nodes = data.data && data.data.productOfferV2 && data.data.productOfferV2.nodes
      sample = Array.isArray(nodes) && nodes[0] ? nodes[0].productName : null
    } catch (e) {
      return res.status(500).json({ error: e.message || 'Falha ao testar API' })
    }

    // API ok → envia anúncio para os grupos selecionados
    const groups = Array.isArray(cur.groups) ? cur.groups : []
    const link = (cur.affiliate && cur.affiliate.link) || ''
    const tpl = (cur.affiliate && cur.affiliate.template) || 'Meu link: {link}'
    const text = link ? tpl.replace('{link}', link) : null

    let enviados = 0
    const erros = []
    const results = []

    if (text && groups.length) {
      for (const g of groups) {
        if (!jidGrupo(g.jid)) continue
        try {
          await sessions.sendText(req.user.id, g.jid, text)
          enviados++
          results.push({ jid: g.jid, name: g.name, ok: true })
          if (logs) logs.append(DATA, req.user.id, { source: 'shopee', level: 'info', ok: true, group: g.name, jid: g.jid, message: 'Anuncio apos teste da API.' })
        } catch (e) {
          erros.push((g.name || g.jid) + ': ' + (e.message || 'erro'))
          results.push({ jid: g.jid, name: g.name, ok: false, error: e.message || 'erro' })
          if (logs) logs.append(DATA, req.user.id, { source: 'shopee', level: 'error', ok: false, group: g.name, jid: g.jid, message: e.message || 'Falha' })
        }
      }
    }

    const partes = ['API Shopee respondeu.']
    if (sample) partes.push('Exemplo: ' + sample)
    if (enviados) partes.push('Anúncio enviado para ' + enviados + ' grupo(s).')
    else if (groups.length && !text) partes.push('API ok, mas salve um link afiliado para enviar anúncio.')
    else if (!groups.length) partes.push('API ok. Selecione e salve grupos na aba Anúncios para enviar o teste.')
    if (erros.length) partes.push('Erros: ' + erros.slice(0, 3).join(' | '))

    res.json({
      ok: true,
      message: partes.join(' '),
      sample,
      enviados,
      totalGrupos: groups.length,
      erros,
      results
    })
  })

  app.post('/bot/pair', auth, async (req, res) => {
    const phone = String((req.body && req.body.phone) || '').replace(/\D/g, '')
    if (phone.length < 10) return res.status(400).json({ error: 'Numero invalido. Use DDI+DDD+numero.' })
    const configs = readJson(CONFIGS, {})
    const cur = configs[req.user.id]
    if (!cur) return res.status(404).json({ error: 'Conta nao encontrada' })
    if (!licencaAtiva(cur)) return res.status(403).json({ error: 'Licenca expirada ou inativa.' })
    cur.phone = phone
    configs[req.user.id] = cur
    writeJson(CONFIGS, configs)
    try {
      const st = await sessions.start(req.user.id, phone, gravarStatus)
      res.json({
        ok: true,
        code: st.pairingCode,
        status: st.status,
        message: 'Codigo real do WhatsApp. Se ainda nao apareceu, aguarde o status.'
      })
    } catch (e) {
      res.status(500).json({ error: e.message || 'Falha no pareamento' })
    }
  })

  return { gravarStatus, sessions }
}
