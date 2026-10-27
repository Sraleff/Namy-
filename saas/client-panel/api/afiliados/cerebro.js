/**
 * Cérebro da Namy por cliente (D1): configuração de
 *   - comandos do dono pelo celular (no chat "mensagem para você mesmo"), ligado por padrão;
 *   - moderação dos grupos de destino (apagar link/flood, avisar, remover), desligada por padrão;
 *   - assistente com IA (responde quando alguém menciona o número ou responde a ele), desligado.
 * data/cerebro/<userId>.json. Só grupos de destino do próprio cliente; grupo fonte nunca.
 */
const jsonStore = require('./jsonStore')

const PASTA = 'cerebro'
const JID_RE = /^[0-9A-Za-z._-]+@g\.us$/
const REMOVER = [0, 3, 5]

const padrao = () => ({
  comandos: { ativo: true },
  moderacao: { grupos: {} },
  ia: { ativo: false, grupos: [], limiteHora: 10 }
})
const erro = (msg, status = 400) => Object.assign(new Error(msg), { status })

function normalizar(db) {
  const p = padrao()
  const d = db && typeof db === 'object' ? db : {}
  return {
    comandos: Object.assign(p.comandos, d.comandos || {}),
    moderacao: { grupos: (d.moderacao && d.moderacao.grupos && typeof d.moderacao.grupos === 'object') ? d.moderacao.grupos : {} },
    ia: Object.assign(p.ia, d.ia || {})
  }
}

const carregar = (dataDir, userId) => normalizar(jsonStore.load(dataDir, PASTA, userId, padrao))
const atualizar = (dataDir, userId, fn) => jsonStore.update(dataDir, PASTA, userId, padrao, (db) => {
  const n = normalizar(db)
  const out = fn(n)
  Object.assign(db, n)
  return out
})

function destinosValidos(cfg) {
  const fontes = new Set((cfg.sources || []).map((g) => g && g.jid))
  return new Set((cfg.groups || []).map((g) => g && g.jid).filter((j) => j && !fontes.has(j)))
}

function validarGrupo(cfg, jid) {
  if (!JID_RE.test(String(jid || ''))) throw erro('Grupo inválido.')
  if ((cfg.sources || []).some((g) => g && g.jid === jid)) throw erro('Grupo fonte (de terceiros) não tem moderação nem assistente.')
  if (!destinosValidos(cfg).has(jid)) throw erro('Use só grupos salvos como destino (aba Grupos).')
}

const salvarComandos = (dataDir, userId, body) => atualizar(dataDir, userId, (db) => { db.comandos = { ativo: !!(body && body.ativo === true) }; return db.comandos })

/** body = { jid, antiLink, antiFlood, avisar, removerApos } */
function salvarModeracao(dataDir, userId, cfg, body = {}) {
  validarGrupo(cfg, body.jid)
  const removerApos = body.removerApos == null ? 0 : Number(body.removerApos)
  if (!REMOVER.includes(removerApos)) throw erro('Remover depois de: nunca, 3 ou 5 infrações.')
  const conf = { antiLink: body.antiLink === true, antiFlood: body.antiFlood === true, avisar: body.avisar === true, removerApos }
  return atualizar(dataDir, userId, (db) => {
    if (!conf.antiLink && !conf.antiFlood) delete db.moderacao.grupos[body.jid]
    else db.moderacao.grupos[body.jid] = conf
    return db.moderacao
  })
}

/** body = { ativo, grupos[], limiteHora } */
function salvarIA(dataDir, userId, cfg, body = {}) {
  if (body.grupos != null && !Array.isArray(body.grupos)) throw erro('Lista de grupos inválida.')
  const grupos = [...new Set((body.grupos || []).map(String))]
  for (const j of grupos) validarGrupo(cfg, j)
  const limiteHora = body.limiteHora == null ? 10 : Number(body.limiteHora)
  if (!Number.isInteger(limiteHora) || limiteHora < 1 || limiteHora > 30) throw erro('Respostas por hora em cada grupo: de 1 a 30.')
  const ativo = body.ativo === true
  if (ativo && !grupos.length) throw erro('Escolha pelo menos um grupo para o assistente.')
  const c = (cfg.copy && cfg.copy.ia) || {}
  if (ativo && !c.provedor) throw erro('Escolha a IA e salve a sua chave em Inteligência Artificial primeiro.')
  return atualizar(dataDir, userId, (db) => { db.ia = { ativo, grupos, limiteHora }; return db.ia })
}

/** Configuração da moderação de um grupo, só se ele ainda é destino (e não virou fonte). */
function moderacaoDe(db, cfg, jid) {
  const conf = db.moderacao.grupos[jid]
  if (!conf || !(conf.antiLink || conf.antiFlood)) return null
  return destinosValidos(cfg).has(jid) ? conf : null
}

const iaNoGrupo = (db, cfg, jid) => !!(db.ia.ativo && db.ia.grupos.includes(jid) && destinosValidos(cfg).has(jid))

module.exports = { PASTA, REMOVER, carregar, salvarComandos, salvarModeracao, salvarIA, moderacaoDe, iaNoGrupo, destinosValidos }
