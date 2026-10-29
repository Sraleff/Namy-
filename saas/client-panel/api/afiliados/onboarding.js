/**
 * Checklist de primeiros passos (C2). So le o estado da conta; nao grava nada nem devolve segredo.
 * GET /onboarding -> { etapas: [{ id, titulo, feito, detalhe, pagina }], feitas, total, completo }
 */
const pool = require('./pool')
const perfis = require('./perfis')
const publicador = require('./publicador')

const JID_RE = /^[0-9A-Za-z._-]+@g\.us$/

function etapas(ctx) {
  const cfg = ctx.cfg || {}
  const ads = cfg.ads || {}
  const conectado = !!(ctx.sessions && ctx.sessions.publicState(ctx.userId).connected)
  const fontes = new Set((cfg.sources || []).map((g) => g && g.jid))
  const destinos = (cfg.groups || []).filter((g) => g && JID_RE.test(g.jid) && !fontes.has(g.jid))
  const shopeeOk = !!(cfg.shopee && cfg.shopee.appId && cfg.shopee.secret)
  const origens = publicador.fontesDe(cfg)
  let noBanco = 0
  if (origens.includes('pool') && destinos.length) for (const g of destinos) noBanco = Math.max(noBanco, pool.candidatas(ctx.dataDir, ctx.userId, g.jid).length)
  const ofertasOk = origens.includes('api') ? shopeeOk : noBanco > 0
  const perfil = perfis.perfilAtual(ads)
  const perfilOk = perfil !== 'personalizado' || Number(ads.groupPauseMax) > 0

  const lista = [
    { id: 'whatsapp', titulo: 'Conectar o WhatsApp', feito: conectado, detalhe: conectado ? 'Conectado.' : 'Pareie o número em Configurações.', pagina: 'configuracoes' },
    { id: 'ofertas', titulo: origens.includes('api') ? 'Salvar as chaves da Shopee' : 'Ter ofertas no banco', feito: ofertasOk, detalhe: ofertasOk ? (origens.includes('api') ? 'Chaves salvas.' : noBanco + ' oferta(s) prontas.') : (origens.includes('api') ? 'Salve App ID e Secret em Configurações.' : 'Capture, cole ou salve ofertas da Vitrine.'), pagina: origens.includes('api') ? 'configuracoes' : 'fila' },
    { id: 'grupos', titulo: 'Escolher os grupos de destino', feito: destinos.length > 0, detalhe: destinos.length ? destinos.length + ' grupo(s).' : 'Marque em Grupos onde as ofertas devem sair.', pagina: 'grupos' },
    { id: 'perfil', titulo: 'Escolher o perfil de envio', feito: perfilOk, detalhe: perfilOk ? (perfil === 'personalizado' ? 'Configuração própria, com pausa entre grupos.' : 'Perfil ' + perfil + '.') : 'O perfil Seguro é o recomendado para começar.', pagina: 'automacoes' },
    { id: 'automacao', titulo: 'Ligar a automação', feito: !!ads.enabled, detalhe: ads.enabled ? 'Ligada.' : 'Ligue em Automações quando estiver pronto.', pagina: 'automacoes' }
  ]
  const feitas = lista.filter((e) => e.feito).length
  return { ok: true, etapas: lista, feitas, total: lista.length, completo: feitas === lista.length }
}

function mount(app, deps) {
  const { auth, readJson, CONFIGS, DATA, sessions } = deps
  app.get('/onboarding', auth, (req, res) => {
    try {
      const cfg = readJson(CONFIGS, {})[req.user.id]
      if (!cfg) return res.status(404).json({ error: 'Conta não encontrada' })
      res.json(etapas({ userId: req.user.id, cfg, dataDir: DATA, sessions }))
    } catch (e) { res.status(e.status || 500).json({ error: e.message || 'Falha ao ler os primeiros passos' }) }
  })
}

module.exports = { etapas, mount }
