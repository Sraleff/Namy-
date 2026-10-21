/**
 * GET /dashboard — agrega os dados reais da conta para o NAMY CONTROL (/app).
 * Somente leitura. Nunca devolve secret, token ou payload da Shopee.
 */
const sessions = require('./sessions')
const logs = require('./logs')
const store = require('./divulgacao/store')

let BAILEYS_VERSION = ''
try { BAILEYS_VERSION = require('@whiskeysockets/baileys/package.json').version } catch (_) {}

const TZ = 'America/Sao_Paulo'
const diaBR = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(d))
const horaBR = (d) => new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(d))

// Cache curto: groupFetchAllParticipating é pesado e o painel pode recarregar a cada 30s
const cacheGrupos = new Map()
async function gruposDe(userId, salvos) {
  const st = sessions.publicState(userId)
  if (!st.connected) return { live: false, list: salvos.map((g) => ({ ...g, participants: null })) }
  const hit = cacheGrupos.get(userId)
  if (hit && Date.now() - hit.at < 60000) return { live: true, list: hit.list }
  try {
    const list = await sessions.listGroups(userId)
    cacheGrupos.set(userId, { at: Date.now(), list })
    return { live: true, list }
  } catch (_) {
    return { live: false, list: salvos.map((g) => ({ ...g, participants: null })) }
  }
}

function formatarTelefone(n) {
  const d = String(n || '').replace(/\D/g, '')
  if (d.length < 12) return d ? '+' + d : ''
  const ddi = d.slice(0, 2), ddd = d.slice(2, 4), resto = d.slice(4)
  return `+${ddi} ${ddd} ${resto.slice(0, resto.length - 4)}-${resto.slice(-4)}`
}

function statusConexao(s) {
  if (s === 'connected') return 'connected'
  if (s === 'connecting' || s === 'waiting_code' || s === 'reconnecting') return 'connecting'
  return 'disconnected'
}

const PLANOS = { trial: 'Teste grátis', mensal: 'Plano Mensal', trimestral: 'Plano Trimestral', pro: 'Pro', premium: 'Premium' }

const STATUS_CAMPANHA = {
  concluida: 'done',
  rodando: 'running',
  agendada: 'scheduled',
  rascunho: 'draft',
  pausada: 'paused',
  cancelada: 'failed'
}
const ICONE_CAMPANHA = { grupo: ['users', 'blue'], oferta: ['megaphone', 'indigo'], promocao: ['sparkles', 'violet'] }

const ICONE_LOG = {
  anuncio: ['megaphone', 'teal'],
  central: ['send', 'indigo'],
  pagamento: ['crown', 'amber'],
  sistema: ['zap', 'blue']
}

function ultimos7Dias() {
  const out = []
  for (let i = 6; i >= 0; i--) out.push(diaBR(Date.now() - i * 86400000))
  return out
}

function nomeDoEmail(email) {
  const base = (String(email || '').split('@')[0].match(/^[a-zA-Z\u00C0-\u017F]+/) || [''])[0]
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : 'Cliente'
}

module.exports = function mount(app, { auth, readJson, CONFIGS, DATA }) {
  app.get('/dashboard', auth, async (req, res) => {
    const userId = req.user.id
    const configs = readJson(CONFIGS, {})
    const cfg = configs[userId]
    if (!cfg) return res.status(404).json({ error: 'Conta nao encontrada' })

    const hoje = diaBR(Date.now())
    const wa = sessions.publicState(userId)
    const salvos = Array.isArray(cfg.groups) ? cfg.groups : []
    const grupos = await gruposDe(userId, salvos)
    const db = store.load(DATA, userId)
    const historico = logs.read(DATA, userId)
    const lic = cfg.license || {}
    const licAtiva = !!lic.active && new Date(lic.expiresAt) > new Date()
    const diasRestantes = Math.max(0, Math.ceil((new Date(lic.expiresAt) - Date.now()) / 86400000))

    // --- Mensagens por dia: envios aceitos da Central + anúncios publicados com sucesso
    const dias = ultimos7Dias()
    const porDia = Object.fromEntries(dias.map((d) => [d, 0]))
    for (const s of db.sends) if (s.state === 'aceito' && porDia[diaBR(s.at)] != null) porDia[diaBR(s.at)]++
    for (const l of historico) if (l.source === 'anuncio' && l.ok === true && porDia[diaBR(l.at)] != null) porDia[diaBR(l.at)]++

    // --- Campanhas
    const enviadosPor = {}
    for (const s of db.sends) if (s.state === 'aceito') enviadosPor[s.campaignId] = (enviadosPor[s.campaignId] || 0) + 1
    const enviadas = db.campaigns.filter((c) => c.status === 'concluida' || c.status === 'rodando')
    const enviadasHoje = enviadas.filter((c) => diaBR(c.updatedAt) === hoje).length
    const rodando = db.campaigns.filter((c) => c.status === 'rodando' || c.status === 'agendada').length

    const contatosHoje = db.contacts.filter((c) => c.createdAt && diaBR(c.createdAt) === hoje).length
    const automacoes = (cfg.ads && cfg.ads.enabled ? 1 : 0) + rodando
    const ads = cfg.ads || {}

    res.json({
      user: {
        name: nomeDoEmail(cfg.email || req.user.email),
        email: cfg.email || req.user.email,
        role: PLANOS[lic.plan] || lic.plan || 'Cliente',
        plan: lic.plan || 'trial',
        license: { active: licAtiva, daysLeft: diasRestantes, expiresAt: lic.expiresAt || null }
      },
      connection: {
        status: statusConexao(wa.status),
        label: cfg.botName ? `WhatsApp · ${cfg.botName}` : 'WhatsApp',
        phone: formatarTelefone(wa.phone || cfg.phone) || 'Não pareado',
        version: BAILEYS_VERSION ? `Baileys ${BAILEYS_VERSION}` : '—',
        error: wa.error || null,
        demo: false
      },
      stats: [
        {
          id: 'groups', label: 'Total de Grupos', value: grupos.list.length, icon: 'users', tone: 'green',
          delta: `${salvos.length} na divulgação`, trend: salvos.length ? 'up' : 'neutral'
        },
        {
          id: 'contacts', label: 'Total de Contatos', value: db.contacts.length, icon: 'contact', tone: 'blue',
          delta: `${contatosHoje} novos hoje`, trend: contatosHoje ? 'up' : 'neutral'
        },
        {
          id: 'campaigns', label: 'Campanhas Enviadas', value: enviadas.length, icon: 'send', tone: 'violet',
          delta: `${enviadasHoje} hoje`, trend: enviadasHoje ? 'up' : 'neutral'
        },
        {
          id: 'automations', label: 'Automações Ativas', value: automacoes, icon: 'zap', tone: 'amber',
          delta: ads.enabled ? `Anúncios a cada ${ads.interval}` : 'Anúncios desligados',
          trend: ads.enabled ? 'up' : 'neutral'
        }
      ],
      messages: dias.map((d) => ({ date: d, sent: porDia[d] })),
      campaigns: db.campaigns.slice(0, 4).map((c) => {
        const [icon, tone] = ICONE_CAMPANHA[c.type] || ['megaphone', 'indigo']
        return {
          id: c.id,
          name: c.name,
          sentAt: diaBR(c.updatedAt || c.createdAt),
          status: STATUS_CAMPANHA[c.status] || 'draft',
          delivered: enviadosPor[c.id] || 0,
          total: Array.isArray(c.recipients) ? c.recipients.length : 0,
          icon,
          tone
        }
      }),
      aiFeatures: [
        {
          id: 'ai', name: 'Respostas Inteligentes', icon: 'bot',
          description: cfg.ai && cfg.ai.usePlatformKeys ? 'IA com chaves da plataforma' : 'IA com suas próprias chaves',
          active: !cfg.ai || cfg.ai.mode !== 'off'
        },
        {
          id: 'ads', name: 'Anúncios Automáticos', icon: 'megaphone', toggle: 'ads.enabled',
          description: `A cada ${ads.interval || '2h'} · até ${ads.dailyLimit || 5}/dia (${ads.sentToday || 0} hoje)`,
          active: !!ads.enabled
        },
        {
          id: 'window', name: 'Janela de Horário', icon: 'clock',
          description: `Publica entre ${(ads.window && ads.window.from) || '09:00'} e ${(ads.window && ads.window.to) || '22:00'}`,
          active: !!ads.enabled
        },
        {
          id: 'shopee', name: 'Ofertas Shopee', icon: 'sparkles',
          description: cfg.shopee && cfg.shopee.appId ? 'API conectada' : 'Cadastre AppId e Secret no painel',
          active: !!(cfg.shopee && cfg.shopee.appId && cfg.shopee.secret)
        }
      ],
      activities: historico.slice(0, 5).map((l, i) => {
        const [icon, tone] = l.level === 'error' ? ['zap', 'rose'] : ICONE_LOG[l.source] || ICONE_LOG.sistema
        return {
          id: `${l.at}-${i}`,
          title: l.message || l.source,
          detail: l.group || l.source.charAt(0).toUpperCase() + l.source.slice(1),
          time: diaBR(l.at) === hoje ? horaBR(l.at) : new Date(l.at).toLocaleDateString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' }),
          icon,
          tone
        }
      }),
      recentGroups: [...grupos.list]
        .sort((a, b) => (b.participants || 0) - (a.participants || 0))
        .slice(0, 5)
        .map((g, i) => ({
          id: g.jid,
          name: g.name,
          members: g.participants,
          selected: salvos.some((s) => s.jid === g.jid),
          icon: ['users', 'crown', 'headphones', 'megaphone', 'heart'][i % 5],
          tone: ['indigo', 'amber', 'blue', 'teal', 'rose'][i % 5]
        })),
      notifications: [
        ...(!licAtiva ? [{ id: 'lic', title: 'Licença expirada — renove para voltar a publicar', time: 'agora', unread: true }] : []),
        ...(licAtiva && diasRestantes <= 5 ? [{ id: 'lic', title: `Sua licença vence em ${diasRestantes} dia(s)`, time: 'hoje', unread: true }] : []),
        ...(wa.error ? [{ id: 'wa', title: wa.error, time: 'agora', unread: true }] : []),
        ...historico.filter((l) => l.level !== 'info').slice(0, 4).map((l, i) => ({
          id: `log-${i}`, title: l.message, time: diaBR(l.at) === hoje ? horaBR(l.at) : diaBR(l.at), unread: diaBR(l.at) === hoje
        }))
      ],
      meta: { groupsLive: grupos.live, generatedAt: new Date().toISOString() }
    })
  })
}
