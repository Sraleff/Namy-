/**
 * Monitor de membros (fase 2.4): quantas pessoas entraram e sairam por dia em cada grupo que o
 * cliente salvou como destino. PRIVACIDADE: nenhum numero, nome ou identificador de membro e
 * gravado, so contagens por grupo e por dia (retencao de 120 dias). O WhatsApp nao informa o
 * historico anterior: a contagem vale a partir do momento em que o monitor liga.
 *
 * Os eventos ficam num buffer em memoria e vao para o disco a cada 10 s (ate 10 s se perdem
 * numa queda do painel). A cada 6 h guarda tambem o tamanho de cada grupo.
 */
const jsonStore = require('./jsonStore')

const PASTA = 'membros'
const RETENCAO_DIAS = 120
const TZ = 'America/Sao_Paulo'
const PADRAO = { minSaidas: 5, pct: 5 }
const buffer = new Map() // userId -> Map("AAAA-MM-DD|jid" -> { e, s })
const cfgCache = new Map() // userId -> { ate, jids }
const vazio = () => ({ dias: {}, tamanhos: {}, alertas: {} })

const ymdBR = (ms = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ms))
const erro = (msg, status = 400) => Object.assign(new Error(msg), { status })

function limites(c) {
  const x = c || {}
  const ok = (v, min, max) => Number.isInteger(v) && v >= min && v <= max
  return { minSaidas: ok(x.minSaidas, 1, 200) ? x.minSaidas : PADRAO.minSaidas, pct: ok(x.pct, 1, 50) ? x.pct : PADRAO.pct }
}

/** Grupo em alerta: mais saidas que entradas e saidas >= max(minimo, pct% do tamanho). */
function emAlerta(dia, tamanho, c) {
  const l = limites(c)
  const e = (dia && dia.e) || 0
  const s = (dia && dia.s) || 0
  const corte = Math.max(l.minSaidas, tamanho ? Math.ceil((tamanho * l.pct) / 100) : 0)
  return s > e && s >= corte
}

// ---------- entrada de eventos ----------

const quantos = (ev) => (Array.isArray(ev.participants) ? ev.participants.length : 0)

/** deps: { readJson, CONFIGS }. Ignora grupo que nao e destino salvo e acoes que nao sao add/remove. */
function registrarEvento(deps, userId, ev, agora = Date.now()) {
  if (!ev || typeof ev.id !== 'string' || !['add', 'remove'].includes(ev.action)) return false
  const n = Math.min(quantos(ev), 1000)
  if (!n) return false
  let c = cfgCache.get(userId)
  if (!c || c.ate < agora) {
    const cfg = (deps.readJson(deps.CONFIGS, {}) || {})[userId]
    c = { ate: agora + 30000, jids: new Set(((cfg && cfg.groups) || []).map((g) => g && g.jid)) }
    cfgCache.set(userId, c)
  }
  if (!c.jids.has(ev.id)) return false
  const b = buffer.get(userId) || new Map()
  const k = ymdBR(agora) + '|' + ev.id
  const x = b.get(k) || { e: 0, s: 0 }
  if (ev.action === 'add') x.e += n
  else x.s += n
  b.set(k, x)
  buffer.set(userId, b)
  return true
}

// ---------- gravacao ----------

function podar(db, agora) {
  const corte = ymdBR(agora - RETENCAO_DIAS * 86400000)
  for (const d of Object.keys(db.dias)) if (d < corte) delete db.dias[d]
  for (const k of Object.keys(db.alertas)) if (k.slice(0, 10) < corte) delete db.alertas[k]
  for (const j of Object.keys(db.tamanhos)) {
    db.tamanhos[j] = (db.tamanhos[j] || []).filter((t) => t.dia >= corte)
    if (!db.tamanhos[j].length) delete db.tamanhos[j]
  }
}

/** Grava o buffer de um cliente. Devolve os alertas NOVOS do dia: [{ jid, e, s, tamanho }]. */
async function gravar(deps, userId, cfg, agora = Date.now()) {
  const b = buffer.get(userId)
  if (!b || !b.size) return []
  buffer.set(userId, new Map())
  const novos = []
  await jsonStore.update(deps.DATA, PASTA, userId, vazio, (db) => {
    db.dias = db.dias || {}
    db.tamanhos = db.tamanhos || {}
    db.alertas = db.alertas || {}
    for (const [k, v] of b) {
      const [dia, jid] = [k.slice(0, 10), k.slice(11)]
      db.dias[dia] = db.dias[dia] || {}
      const x = db.dias[dia][jid] || { e: 0, s: 0 }
      x.e += v.e
      x.s += v.s
      db.dias[dia][jid] = x
      const tam = ((db.tamanhos[jid] || []).slice(-1)[0] || {}).n || 0
      const ak = dia + '|' + jid
      if (!db.alertas[ak] && emAlerta(x, tam, cfg && cfg.membros)) {
        db.alertas[ak] = true
        novos.push({ jid, e: x.e, s: x.s, tamanho: tam })
      }
    }
    podar(db, agora)
  })
  return novos
}

/** Guarda o tamanho atual dos grupos monitorados (1 por dia por grupo; o do dia e sobrescrito). */
async function snapshot(deps, userId, cfg, agora = Date.now()) {
  const lista = await deps.sessions.listGroups(userId)
  const monitorados = new Set(((cfg && cfg.groups) || []).map((g) => g && g.jid))
  const hoje = ymdBR(agora)
  await jsonStore.update(deps.DATA, PASTA, userId, vazio, (db) => {
    db.tamanhos = db.tamanhos || {}
    for (const g of lista) {
      if (!monitorados.has(g.jid) || !(g.participants >= 0)) continue
      const h = (db.tamanhos[g.jid] || []).filter((t) => t.dia !== hoje)
      h.push({ dia: hoje, n: g.participants })
      db.tamanhos[g.jid] = h
    }
    podar(db, agora)
  })
  return lista.length
}

// ---------- leitura ----------

async function resumo(deps, userId, cfg, dias = 30, agora = Date.now()) {
  if (![7, 30, 90].includes(dias)) throw erro('Periodo invalido (7, 30 ou 90 dias).')
  await gravar(deps, userId, cfg, agora) // o que ainda esta no buffer entra na conta
  const db = jsonStore.load(deps.DATA, PASTA, userId, vazio)
  const dd = db.dias || {}
  const ini = ymdBR(agora - (dias - 1) * 86400000)
  const hoje = ymdBR(agora)
  const nomes = new Map(((cfg && cfg.groups) || []).map((g) => [g.jid, g.name || g.jid]))
  const porGrupo = new Map()
  const porDia = []
  let e = 0
  let s = 0
  for (let i = dias - 1; i >= 0; i--) {
    const d = ymdBR(agora - i * 86400000)
    let de = 0
    let ds = 0
    for (const [jid, x] of Object.entries(dd[d] || {})) {
      de += x.e
      ds += x.s
      const g = porGrupo.get(jid) || { jid, entrou: 0, saiu: 0 }
      g.entrou += x.e
      g.saiu += x.s
      porGrupo.set(jid, g)
    }
    e += de
    s += ds
    porDia.push({ dia: d, entrou: de, saiu: ds })
  }
  for (const jid of nomes.keys()) if (!porGrupo.has(jid)) porGrupo.set(jid, { jid, entrou: 0, saiu: 0 })
  const grupos = [...porGrupo.values()].map((g) => {
    const hist = (db.tamanhos || {})[g.jid] || []
    const atual = hist.length ? hist[hist.length - 1].n : null
    const ant = hist.filter((t) => t.dia >= ini)[0]
    return {
      jid: g.jid,
      name: nomes.get(g.jid) || 'grupo removido',
      monitorado: nomes.has(g.jid),
      entrou: g.entrou,
      saiu: g.saiu,
      saldo: g.entrou - g.saiu,
      tamanho: atual,
      tamanhoInicio: ant ? ant.n : null,
      alerta: nomes.has(g.jid) && emAlerta((dd[hoje] || {})[g.jid], atual || 0, cfg && cfg.membros)
    }
  }).sort((a, b) => (b.alerta - a.alerta) || (a.saldo - b.saldo))
  const desde = Object.keys(dd).sort()[0] || null
  return { ok: true, dias, entrou: e, saiu: s, saldo: e - s, porDia, grupos, alertas: grupos.filter((g) => g.alerta).length, limites: limites(cfg && cfg.membros), monitorandoDesde: desde }
}

// ---------- motor ----------

function iniciar(deps) {
  const ultimoSnapshot = new Map()
  async function tick() {
    const configs = deps.readJson(deps.CONFIGS, {}) || {}
    for (const userId of Object.keys(configs)) {
      const cfg = configs[userId]
      try {
        const novos = await gravar(deps, userId, cfg)
        for (const a of novos) {
          const nome = ((cfg.groups || []).find((g) => g.jid === a.jid) || {}).name || a.jid
          if (deps.logs) deps.logs.append(deps.DATA, userId, { source: 'membros', level: 'warn', ok: null, group: nome, jid: a.jid, message: 'Queda de membros hoje: ' + a.s + ' saiu(ram) e ' + a.e + ' entrou(aram).' })
        }
        const ultimo = ultimoSnapshot.get(userId) || 0
        if (Date.now() - ultimo > 6 * 3600 * 1000 && (cfg.groups || []).length && deps.sessions.publicState(userId).connected) {
          ultimoSnapshot.set(userId, Date.now())
          await snapshot(deps, userId, cfg).catch(() => {})
        }
      } catch (e) { console.error('[MEMBROS]', e.message) }
    }
  }
  deps.sessions.onMembros((userId, ev) => registrarEvento(deps, userId, ev))
  setInterval(tick, 10000)
  setTimeout(tick, 60000)
}

module.exports = { PASTA, PADRAO, RETENCAO_DIAS, limites, emAlerta, registrarEvento, gravar, snapshot, resumo, iniciar, ymdBR, _buffer: buffer, _cfgCache: cfgCache }
