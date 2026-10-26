/**
 * Diagnostico "por que nao enviou?" (B5). So LE a configuracao e os registros; nao envia nada.
 * Cada verificacao: { id, nivel: 'ok' | 'aviso' | 'bloqueio' | 'info', titulo, detalhe, pagina? }.
 * `pode` = nenhum bloqueio. Os motivos de pulo vem do historico real (auditoria), nao de palpite.
 */
const scheduler = require('../scheduler')
const publicador = require('./publicador')
const pool = require('./pool')
const auditoria = require('./auditoria')

const NOMES_DIA = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado']
const TZ = 'America/Sao_Paulo'
const JID_RE = /^[0-9A-Za-z._-]+@g\.us$/

const hhmmBR = (ms) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms))
const diaBR = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ms))
const quando = (ms, agora) => (diaBR(ms) === diaBR(agora) ? 'hoje' : diaBR(ms) === diaBR(agora + 86400000) ? 'amanha' : diaBR(ms).split('-').reverse().join('/')) + ' as ' + hhmmBR(ms)
const limiteDiario = (ads) => Math.min(200, Math.max(1, Number(ads.dailyLimit) || 5))
const enviadosHoje = (ads, agora) => (ads.sentDay === diaBR(agora) ? Number(ads.sentToday) || 0 : 0)

function proximoDiaPermitido(days, agora) {
  for (let i = 1; i <= 7; i++) if (scheduler.diaPermitido(days, new Date(agora + i * 86400000))) return NOMES_DIA[scheduler.diaSemanaBrasilia(new Date(agora + i * 86400000))]
  return ''
}

/** ctx: { userId, cfg, dataDir, sessions }. */
function diagnosticar(ctx, agora = Date.now()) {
  const cfg = ctx.cfg || {}
  const ads = cfg.ads || {}
  const checks = []
  const add = (id, nivel, titulo, detalhe, pagina) => checks.push({ id, nivel, titulo, detalhe: detalhe || '', pagina: pagina || '' })

  // Licenca
  const lic = cfg.license && cfg.license.active && new Date(cfg.license.expiresAt) > new Date(agora)
  if (lic) add('licenca', 'ok', 'Licenca ativa')
  else add('licenca', 'bloqueio', 'Licenca expirada ou inativa', 'Nada e enviado enquanto a licenca nao for renovada.', 'configuracoes')

  // WhatsApp
  const conectado = !!(ctx.sessions && ctx.sessions.publicState(ctx.userId).connected)
  if (conectado) add('whatsapp', 'ok', 'WhatsApp conectado')
  else add('whatsapp', 'bloqueio', 'WhatsApp desconectado', 'Conecte o WhatsApp em Configuracoes. Os envios ficam adiados ate voltar.', 'configuracoes')

  // Automacao ligada
  if (ads.enabled) add('automacao', 'ok', 'Automacao ligada')
  else add('automacao', 'bloqueio', 'Automacao desligada', 'Ligue em Automacoes. "Executar agora" funciona mesmo desligada.', 'automacoes')

  // Destinos e conflito fonte x destino (B4)
  const fontes = new Set((cfg.sources || []).map((g) => g && g.jid))
  const salvos = (cfg.groups || []).filter((g) => g && JID_RE.test(g.jid))
  const conflito = salvos.filter((g) => fontes.has(g.jid))
  const validos = salvos.filter((g) => !fontes.has(g.jid))
  if (!salvos.length) add('destinos', 'bloqueio', 'Nenhum grupo de destino', 'Escolha em Grupos onde as ofertas devem sair.', 'grupos')
  else if (!validos.length) add('destinos', 'bloqueio', 'Todos os grupos de destino tambem sao grupos fonte', 'Grupo fonte (captura) nunca recebe ofertas: ' + conflito.map((g) => g.name).join(', ') + '. Tire-os de uma das listas.', 'grupos')
  else add('destinos', 'ok', validos.length + ' grupo(s) de destino')
  if (conflito.length && validos.length) add('conflito', 'aviso', conflito.length + ' grupo(s) sao fonte e destino ao mesmo tempo', 'Eles NAO recebem ofertas: ' + conflito.map((g) => g.name).join(', ') + '. Tire-os da lista de destinos ou da de fontes.', 'grupos')

  // Origem das ofertas
  const origens = publicador.fontesDe(cfg)
  const shopeeOk = !!(cfg.shopee && cfg.shopee.appId && cfg.shopee.secret)
  let candidatas = 0
  if (origens.includes('pool')) for (const g of validos) candidatas += pool.candidatas(ctx.dataDir, ctx.userId, g.jid).length
  if (origens.includes('api') && !shopeeOk && !origens.includes('pool')) add('origem', 'bloqueio', 'Faltam as chaves da Shopee', 'A origem e a API da Shopee. Salve App ID e Secret em Configuracoes.', 'configuracoes')
  else if (origens.includes('pool') && !origens.includes('api') && !candidatas) add('origem', 'bloqueio', 'Banco de ofertas sem ofertas para enviar', 'Nada elegivel na fila (vazio, expirado, pausado ou ja enviado a todos os grupos). Capture, cole ou salve ofertas da Vitrine.', 'fila')
  else if (origens.includes('pool') && !candidatas && !shopeeOk) add('origem', 'aviso', 'Banco de ofertas vazio e sem chaves da Shopee', 'Sem ofertas no banco e sem API para buscar.', 'fila')
  else add('origem', 'ok', 'Origem das ofertas pronta', (origens.includes('pool') ? candidatas + ' oferta(s) elegivel(is) no banco' : '') + (origens.includes('api') && shopeeOk ? (origens.includes('pool') ? ' e ' : '') + 'busca na API da Shopee' : ''))

  // Janela e dias
  const w = ads.window || {}
  const diaOk = scheduler.diaPermitido(ads.days, new Date(agora))
  const janelaOk = scheduler.naJanela(w.from, w.to, hhmmBR(agora))
  if (!diaOk) add('janela', 'aviso', 'Hoje nao e um dia de envio', 'Proximo dia permitido: ' + proximoDiaPermitido(ads.days, agora) + '.', 'automacoes')
  else if (!janelaOk) add('janela', 'aviso', 'Fora da janela de horario', 'Os envios acontecem das ' + w.from + ' as ' + w.to + ' (Brasilia). Agora sao ' + hhmmBR(agora) + '.', 'automacoes')
  else add('janela', 'ok', 'Dentro do horario de envio', w.from && w.to ? w.from + ' as ' + w.to : 'sem restricao de horario')

  // Limite do dia
  const hoje = enviadosHoje(ads, agora)
  const lim = limiteDiario(ads)
  if (hoje >= lim) add('limite', 'bloqueio', 'Limite diario atingido (' + hoje + ' de ' + lim + ')', 'Volta a enviar amanha, ou aumente o limite em Automacoes.', 'automacoes')
  else add('limite', 'ok', 'Limite diario: ' + hoje + ' de ' + lim + ' produtos hoje')

  // Proxima execucao
  const next = ads.nextTryAt ? new Date(ads.nextTryAt).getTime() : 0
  const espera = scheduler.INTERVAL_MS[ads.interval] || scheduler.INTERVAL_MS['2h']
  const ultimo = ads.lastSentAt ? new Date(ads.lastSentAt).getTime() : 0
  if (next && next > agora) add('proxima', 'info', 'Proximo envio previsto para ' + quando(next, agora), 'Foi adiado por um erro anterior ou por falta de oferta (veja os motivos abaixo).')
  else if (ads.intervalMode !== 'aleatorio' && ultimo && ultimo + espera > agora) add('proxima', 'info', 'Proximo envio previsto para ' + quando(ultimo + espera, agora), 'Intervalo entre envios: ' + (ads.interval || '2h') + '.')
  else add('proxima', 'info', 'Pronto para enviar no proximo ciclo (a cada 20 segundos)')

  // Motivos reais dos ultimos pulos/falhas (24 h)
  const corte = agora - 86400000
  const recentes = auditoria.listar(ctx.dataDir, ctx.userId, { limite: 500 }).filter((r) => new Date(r.at).getTime() > corte)
  const contagem = new Map()
  for (const r of recentes) if (r.tipo !== 'enviado' && r.motivo) contagem.set(r.motivo, (contagem.get(r.motivo) || 0) + 1)
  const motivosPulo = [...contagem.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([motivo, qtd]) => ({ motivo, qtd }))
  const ultimoEnvio = auditoria.listar(ctx.dataDir, ctx.userId, { tipo: 'enviado', limite: 1 })[0] || null
  const enviou24 = recentes.filter((r) => r.tipo === 'enviado').length
  if (motivosPulo.length && !enviou24) add('motivos', 'aviso', 'Nas ultimas 24 h nada saiu e houve ' + recentes.filter((r) => r.tipo !== 'enviado').length + ' pulo(s)/falha(s)', 'O motivo mais comum: ' + motivosPulo[0].motivo, 'logs')
  else if (motivosPulo.length) add('motivos', 'info', 'Ofertas puladas nas ultimas 24 h: ' + recentes.filter((r) => r.tipo === 'pulado').length, 'Isso e normal: o sistema descarta o que nao serve para o nicho ou a qualidade.', 'logs')

  const bloq = checks.filter((c) => c.nivel === 'bloqueio')
  const avis = checks.filter((c) => c.nivel === 'aviso')
  const pode = bloq.length === 0
  const prox = checks.find((c) => c.id === 'proxima')
  const frase = !pode ? 'Nao vai enviar agora: ' + bloq[0].titulo.toLowerCase() + '.'
    : avis.length ? 'Pode enviar, mas ha um aviso: ' + avis[0].titulo.toLowerCase() + '.'
      : prox.nivel === 'info' && /previsto/.test(prox.titulo) ? prox.titulo + '.' : 'Tudo certo: vai enviar no proximo ciclo.'
  return {
    ok: true,
    pode,
    frase,
    checks,
    motivosPulo,
    ultimoEnvio: ultimoEnvio ? { em: ultimoEnvio.at, grupo: ultimoEnvio.grupo, nome: ultimoEnvio.nome } : null,
    hoje: { enviados: hoje, limite: lim }
  }
}

module.exports = { diagnosticar }
