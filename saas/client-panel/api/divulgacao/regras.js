/**
 * Regras da Central. Participar de um grupo nao autoriza mensagem.
 * Nao inventa cupom, preco nem link.
 */
const store = require('./store')

const TIPOS = new Set(['grupo', 'oferta', 'promocao'])
const CONVITE = /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+$/

function erro(msg, status) {
  const e = new Error(msg)
  e.status = status || 400
  return e
}

function achar(lista, id) {
  return (lista || []).find((x) => x.id === id) || null
}

function registrarContato(db, input) {
  const stableId = String(input.stableId || '').trim().slice(0, 120)
  if (!stableId) throw erro('Identificador do contato obrigatorio')
  const ja = db.contacts.find((c) => c.stableId === stableId)
  if (ja) return { contact: ja, created: false }
  const contact = {
    id: store.id(),
    stableId,
    phone: String(input.phone || '').replace(/\D/g, '').slice(0, 15),
    label: String(input.label || stableId).replace(/[<>]/g, '').slice(0, 80),
    origin: input.origin === 'manual' ? 'manual' : 'grupo',
    originGroup: String(input.originGroup || '').slice(0, 80),
    createdAt: new Date().toISOString(),
    consent: 'nenhum',
    consentAt: null,
    consentSource: '',
    prefs: '',
    stoppedAt: null
  }
  db.contacts.unshift(contact)
  return { contact, created: true }
}

function importarParticipantes(db, groupJid, participants) {
  const out = []
  for (const p of participants || []) {
    const stableId = String(p.id || '').trim()
    if (!stableId) continue
    const r = registrarContato(db, {
      stableId,
      phone: p.phone || '',
      label: p.phone ? ('contato ' + String(p.phone).slice(-4)) : stableId.split('@')[0].slice(0, 12),
      origin: 'grupo',
      originGroup: groupJid
    })
    if (p.phone && !r.contact.phone) r.contact.phone = String(p.phone).replace(/\D/g, '').slice(0, 15)
    out.push(r.contact)
  }
  return out
}

function setConsent(db, contactId, consent, source) {
  const c = achar(db.contacts, contactId)
  if (!c) throw erro('Contato nao encontrado', 404)
  if (!['nenhum', 'autorizado', 'revogado'].includes(consent)) throw erro('Consentimento invalido')
  c.consent = consent
  c.consentAt = new Date().toISOString()
  c.consentSource = String(source || 'painel').slice(0, 40)
  c.stoppedAt = consent === 'revogado' ? c.consentAt : null
  return c
}

function setPrefs(db, contactId, prefs) {
  const c = achar(db.contacts, contactId)
  if (!c) throw erro('Contato nao encontrado', 404)
  c.prefs = String(prefs || '').slice(0, 120)
  return c
}

function criarCampanha(db, input) {
  const type = String(input.type || '')
  if (!TIPOS.has(type)) throw erro('Tipo invalido. Use grupo, oferta ou promocao.')
  const intervalSec = Math.min(3600, Math.max(20, Number(input.intervalSec) || 30))
  const cap = Math.min(50, Math.max(1, Number(input.dailyCap) || 20))
  const camp = {
    id: store.id(),
    name: String(input.name || 'Campanha').replace(/[<>]/g, '').slice(0, 80),
    type,
    status: 'rascunho',
    message: String(input.message || '').slice(0, 1000),
    groupJid: String(input.groupJid || '').slice(0, 80),
    inviteUrl: '',
    content: null,
    scheduledAt: input.scheduledAt || null,
    intervalSec,
    dailyCap: cap,
    cooldownHours: Math.min(168, Math.max(1, Number(input.cooldownHours) || 24)),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    recipients: [],
    sentToday: 0,
    sentDay: '',
    lastError: ''
  }
  if (camp.scheduledAt && Number.isNaN(new Date(camp.scheduledAt).getTime())) {
    throw erro('Data programada invalida')
  }
  db.campaigns.unshift(camp)
  return camp
}

function definirConvite(db, campaignId, url) {
  const camp = achar(db.campaigns, campaignId)
  if (!camp) throw erro('Campanha nao encontrada', 404)
  if (camp.status !== 'rascunho') throw erro('So da para alterar rascunho')
  if (camp.type !== 'grupo') throw erro('Convite so vale para divulgacao de grupo')
  if (!CONVITE.test(String(url || ''))) throw erro('Link de convite invalido')
  camp.inviteUrl = url
  camp.updatedAt = new Date().toISOString()
  return camp
}

function anexarOferta(db, campaignId, oferta) {
  const camp = achar(db.campaigns, campaignId)
  if (!camp) throw erro('Campanha nao encontrada', 404)
  if (camp.status !== 'rascunho') throw erro('So da para alterar rascunho')
  if (camp.type === 'grupo') throw erro('Oferta nao entra em campanha de grupo')
  const nome = String((oferta && oferta.nome) || '').trim()
  const link = String((oferta && oferta.link) || '').trim()
  if (!nome || !/^https:\/\//.test(link)) throw erro('Oferta sem nome ou link real da API')
  const desconto = Number(oferta.desconto)
  const temDesconto = Number.isFinite(desconto) && desconto > 0
  if (camp.type === 'promocao' && !temDesconto) {
    throw erro('A API nao trouxe desconto e esta integracao nao recebe codigo de cupom. Nao invento cupom.')
  }
  camp.content = {
    nome: nome.slice(0, 180),
    preco: String(oferta.preco || '').slice(0, 40),
    desconto: temDesconto ? Math.round(desconto) : null,
    link,
    texto: String(oferta.texto || '').slice(0, 3500)
  }
  camp.updatedAt = new Date().toISOString()
  return camp
}

function definirDestinatarios(db, campaignId, contactIds) {
  const camp = achar(db.campaigns, campaignId)
  if (!camp) throw erro('Campanha nao encontrada', 404)
  if (camp.status !== 'rascunho' && camp.status !== 'pausada') throw erro('Campanha nao aceita nova lista agora')
  const vistos = new Set()
  const lista = []
  const pulados = []
  for (const id of contactIds || []) {
    if (vistos.has(id)) continue
    vistos.add(id)
    const c = achar(db.contacts, id)
    if (!c) continue
    if (vistos.has('s:' + c.stableId)) continue
    vistos.add('s:' + c.stableId)
    const antigo = (camp.recipients || []).find((r) => r.contactId === c.id)
    if (antigo && (antigo.state === 'aceito' || antigo.state === 'falha')) {
      lista.push(antigo)
      continue
    }
    if (c.consent !== 'autorizado') {
      pulados.push({ contactId: c.id, reason: c.consent === 'revogado' ? 'revogado' : 'sem autorizacao' })
      continue
    }
    lista.push({ contactId: c.id, state: 'fila' })
  }
  camp.recipients = lista
  camp.updatedAt = new Date().toISOString()
  return { campaign: camp, pulados }
}

function aprovar(db, campaignId) {
  const camp = achar(db.campaigns, campaignId)
  if (!camp) throw erro('Campanha nao encontrada', 404)
  if (camp.status !== 'rascunho' && camp.status !== 'agendada') throw erro('So da para aprovar rascunho')
  const fila = (camp.recipients || []).filter((r) => r.state === 'fila')
  if (!fila.length) throw erro('Escolha ao menos um contato autorizado')
  if (camp.type === 'grupo' && !CONVITE.test(camp.inviteUrl || '')) {
    throw erro('Busque ou cole o link real do grupo antes de aprovar')
  }
  if ((camp.type === 'oferta' || camp.type === 'promocao') && !(camp.content && camp.content.link)) {
    throw erro('Busque uma oferta real da API antes de aprovar')
  }
  const quando = camp.scheduledAt ? new Date(camp.scheduledAt).getTime() : 0
  camp.status = quando > Date.now() ? 'agendada' : 'rodando'
  camp.updatedAt = new Date().toISOString()
  camp.lastError = ''
  return camp
}

function mudar(db, campaignId, status, de) {
  const camp = achar(db.campaigns, campaignId)
  if (!camp) throw erro('Campanha nao encontrada', 404)
  if (!de.includes(camp.status)) throw erro('Nao da para ' + status + ' a partir de ' + camp.status)
  camp.status = status
  camp.updatedAt = new Date().toISOString()
  return camp
}

function textoDaCampanha(camp) {
  if (camp.type === 'grupo') {
    const base = camp.message || 'Entra no grupo:'
    return base.includes(camp.inviteUrl) ? base : (base + '\n' + camp.inviteUrl)
  }
  return (camp.content && camp.content.texto) || camp.message || ''
}

function destinoDe(contact) {
  if (contact.phone && contact.phone.length >= 10) return contact.phone + '@s.whatsapp.net'
  if (/@(s\.whatsapp\.net|lid)$/.test(contact.stableId)) return contact.stableId
  return ''
}

function diaBrasilia(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(date || new Date())
}

function emCooldown(db, camp, contactId, now) {
  const corte = now - camp.cooldownHours * 3600000
  return db.sends.some((s) => s.contactId === contactId && s.state === 'aceito' && new Date(s.at).getTime() > corte && s.campaignId !== camp.id)
}

function promoverAgendadas(db, now) {
  for (const camp of db.campaigns) {
    if (camp.status !== 'agendada') continue
    const quando = camp.scheduledAt ? new Date(camp.scheduledAt).getTime() : 0
    if (!quando || quando <= now) camp.status = 'rodando'
  }
}

function prepararEnvio(db, userId, now) {
  promoverAgendadas(db, now)
  const dia = diaBrasilia(new Date(now))
  for (const camp of db.campaigns) {
    if (camp.status !== 'rodando') continue
    if (camp.sentDay !== dia) {
      camp.sentDay = dia
      camp.sentToday = 0
    }
    if ((camp.sentToday || 0) >= camp.dailyCap) continue
    const ultimo = db.sends.filter((s) => s.campaignId === camp.id && s.state === 'aceito').sort((a, b) => new Date(b.at) - new Date(a.at))[0]
    if (ultimo && now - new Date(ultimo.at).getTime() < camp.intervalSec * 1000) continue
    while (true) {
      const item = (camp.recipients || []).find((r) => r.state === 'fila')
      if (!item) {
        camp.status = 'concluida'
        break
      }
      const contact = achar(db.contacts, item.contactId)
      const at = new Date(now).toISOString()
      if (!contact || contact.consent !== 'autorizado') {
        item.state = 'pulado'
        db.sends.push({ id: store.id(), campaignId: camp.id, contactId: item.contactId, state: 'pulado', at, detail: 'sem autorizacao' })
        continue
      }
      if (emCooldown(db, camp, contact.id, now)) {
        item.state = 'pulado'
        db.sends.push({ id: store.id(), campaignId: camp.id, contactId: contact.id, state: 'pulado', at, detail: 'frequencia' })
        continue
      }
      const jid = destinoDe(contact)
      if (!jid) {
        item.state = 'falha'
        db.sends.push({ id: store.id(), campaignId: camp.id, contactId: contact.id, state: 'falha', at, detail: 'sem identificador de envio' })
        continue
      }
      return { userId, camp, item, contact, jid, text: textoDaCampanha(camp).slice(0, 3500) }
    }
  }
  return null
}

function aplicarResultado(db, job, result, now) {
  const camp = achar(db.campaigns, job.camp.id)
  const item = camp && (camp.recipients || []).find((r) => r.contactId === job.item.contactId && r.state === 'fila')
  if (!camp || !item) return
  const at = new Date(now).toISOString()
  if (result.ok) {
    item.state = 'aceito'
    camp.sentToday = (camp.sentToday || 0) + 1
    camp.lastError = ''
    db.sends.push({ id: store.id(), campaignId: camp.id, contactId: item.contactId, state: 'aceito', at, detail: 'socket aceitou; sem confirmacao de entrega ou leitura' })
  } else if (result.uncertain) {
    item.state = 'incerto'
    camp.lastError = String(result.detail || 'resultado incerto').slice(0, 180)
    db.sends.push({ id: store.id(), campaignId: camp.id, contactId: item.contactId, state: 'incerto', at, detail: camp.lastError })
  } else if (result.skip) {
    camp.lastError = String(result.detail || '').slice(0, 180)
  } else {
    item.state = 'falha'
    camp.lastError = String(result.detail || 'falha').slice(0, 180)
    db.sends.push({ id: store.id(), campaignId: camp.id, contactId: item.contactId, state: 'falha', at, detail: camp.lastError })
  }
  const ainda = (camp.recipients || []).some((r) => r.state === 'fila')
  if (!ainda && camp.status === 'rodando') camp.status = 'concluida'
  camp.updatedAt = at
}

function relatorio(db, campaignId) {
  const camps = campaignId ? db.campaigns.filter((c) => c.id === campaignId) : db.campaigns
  return camps.map((c) => {
    const rec = c.recipients || []
    const conta = (st) => rec.filter((r) => r.state === st).length
    return {
      id: c.id,
      name: c.name,
      type: c.type,
      status: c.status,
      createdAt: c.createdAt,
      scheduledAt: c.scheduledAt,
      destinatarios: rec.length,
      fila: conta('fila'),
      aceitos: conta('aceito'),
      falhas: conta('falha'),
      incertos: conta('incerto'),
      pulados: conta('pulado'),
      lastError: c.lastError || '',
      entrega: 'nao confirmada',
      leitura: 'indisponivel'
    }
  })
}

function reenviarIncertos(db, campaignId) {
  const camp = achar(db.campaigns, campaignId)
  if (!camp) throw erro('Campanha nao encontrada', 404)
  if (camp.status === 'cancelada' || camp.status === 'concluida') throw erro('Campanha encerrada')
  let n = 0
  for (const r of camp.recipients || []) {
    if (r.state === 'incerto') {
      r.state = 'fila'
      n++
    }
  }
  if (camp.status === 'pausada') camp.status = 'pausada'
  camp.updatedAt = new Date().toISOString()
  return { campaign: camp, reabertos: n }
}

module.exports = {
  registrarContato,
  importarParticipantes,
  setConsent,
  setPrefs,
  criarCampanha,
  definirConvite,
  anexarOferta,
  definirDestinatarios,
  aprovar,
  mudar,
  prepararEnvio,
  aplicarResultado,
  relatorio,
  reenviarIncertos,
  textoDaCampanha,
  CONVITE
}
