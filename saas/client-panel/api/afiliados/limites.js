/**
 * Planos e limites (C3). Duas camadas pagas e o teste:
 *   start  R$ 19,90  poucos destinos/fontes, sem agendadas, cupons, comissoes e monitor de membros
 *   pro    R$ 59,90  tudo liberado, com teto tecnico (uso justo)
 *   trial  3 dias, tudo do Pro, com limite de envios por dia (so os testadores tem)
 * Licencas antigas (mensal/trimestral) contam como Pro. O servidor decide; o painel so mostra.
 */
const RECURSOS_PRO = ['agendadas', 'cupons', 'comissoes', 'membros', 'captacao', 'telegram', 'moderacao', 'assistente']

const TIERS = {
  start: { rotulo: 'Start', destinos: 2, fontes: 3, recursos: [] },
  pro: { rotulo: 'Pro', destinos: 30, fontes: 20, recursos: RECURSOS_PRO },
  trial: { rotulo: 'Teste', destinos: 30, fontes: 20, recursos: RECURSOS_PRO, enviosPorDia: 20 }
}

const PRO_LEGADO = new Set(['mensal', 'trimestral'])

function tierDe(cfg) {
  const lic = (cfg && cfg.license) || {}
  if (lic.tier === 'start' || lic.tier === 'pro') return lic.tier
  if (lic.plan === 'trial') return 'trial'
  if (PRO_LEGADO.has(lic.plan)) return 'pro'
  return 'pro'
}

const limitesDe = (cfg) => TIERS[tierDe(cfg)]
const podeRecurso = (cfg, recurso) => limitesDe(cfg).recursos.includes(recurso)
// Limite de envios por dia imposto pelo plano: so o teste tem; nos pagos vale o que o cliente configurou
const limiteEnviosDoPlano = (cfg) => limitesDe(cfg).enviosPorDia || null

function erroLimite(msg) {
  return Object.assign(new Error(msg), { status: 402, upgrade: true })
}

function checarQuantidade(cfg, tipo, quantidade) {
  const l = limitesDe(cfg)
  const max = l[tipo]
  if (quantidade > max) {
    const nome = tipo === 'destinos' ? 'grupos de destino' : 'grupos fonte'
    throw erroLimite('O plano ' + l.rotulo + ' permite até ' + max + ' ' + nome + '. Faça upgrade para o Pro para liberar mais.')
  }
}

const NOMES = { agendadas: 'Mensagens agendadas', cupons: 'Cupons', comissoes: 'Comissões', membros: 'Monitor de membros', captacao: 'Captação (link de grupos e vitrine pública)', telegram: 'Telegram', moderacao: 'Moderação dos grupos', assistente: 'Assistente com IA' }

// Middleware (depois de `auth`): barra o recurso se o plano não tem
function exigir(recurso, { readJson, CONFIGS }) {
  return (req, res, next) => {
    const cfg = (readJson(CONFIGS, {}) || {})[req.user && req.user.id]
    if (!cfg || podeRecurso(cfg, recurso)) return next()
    res.status(402).json({ error: (NOMES[recurso] || 'Este recurso') + ' faz parte do plano Pro. Faça upgrade para usar.', upgrade: true, recurso })
  }
}

// Comeca o teste quando o cliente conecta o WhatsApp pela primeira vez. Devolve true se alterou.
function iniciarTrial(cfg, agora = Date.now(), dias = 3) {
  const lic = cfg && cfg.license
  if (!lic || lic.plan !== 'trial' || !lic.trialPendente) return false
  lic.trialPendente = false
  lic.expiresAt = new Date(agora + dias * 86400000).toISOString()
  lic.trialIniciadoEm = new Date(agora).toISOString()
  return true
}

function uso(cfg) {
  const l = limitesDe(cfg)
  return {
    tier: tierDe(cfg),
    rotulo: l.rotulo,
    destinos: { usado: (cfg.groups || []).length, max: l.destinos },
    fontes: { usado: (cfg.sources || []).length, max: l.fontes },
    recursos: Object.fromEntries(RECURSOS_PRO.map((r) => [r, l.recursos.includes(r)])),
    enviosPorDia: l.enviosPorDia || null,
    fundador: !!(cfg.license && cfg.license.fundador),
    trialPendente: !!(cfg.license && cfg.license.trialPendente)
  }
}

module.exports = { TIERS, RECURSOS_PRO, tierDe, limitesDe, podeRecurso, limiteEnviosDoPlano, checarQuantidade, exigir, iniciarTrial, uso }
