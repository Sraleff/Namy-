/**
 * Rotas da mensagem das ofertas (fase 1.5a). userId so do JWT.
 *  GET  /copy/config           modelo, IA, provedores e quais tem chave (so mascarada)
 *  PUT  /copy/config           salva o modelo e/ou liga/desliga a IA
 *  POST /copy/chave            guarda a chave do cliente, CIFRADA (nunca mais volta inteira)
 *  POST /copy/chave/remover    apaga a chave
 *  POST /copy/previa           mostra a mensagem (com ou sem IA) para uma oferta de exemplo
 * A chave nunca vai para log, resposta ou erro.
 */
const copy = require('./copy')
const cofre = require('./cofre')
const cupons = require('./cupons')
const { criarLimitador } = require('./linkRoutes')

const MODELO_SUGERIDO = '🔥 OFERTA SHOPEE\n\n{nome}\n\n💰 {preco}\n📉 {desconto}\n⭐ {nota}\n🏪 {loja}\n🎟️ Cupom: {cupom}\n\n🔗 {link}'
const CHAVE_RE = /^[A-Za-z0-9_\-.:]{20,200}$/

function licencaAtiva(cfg) {
  if (!cfg || !cfg.license) return false
  return !!cfg.license.active && new Date(cfg.license.expiresAt) > new Date()
}

function mount(app, deps, opcoes = {}) {
  const { auth, readJson, writeJson, CONFIGS, DATA } = deps
  const podePrevia = criarLimitador(opcoes.previasPorMin || 6, 60 * 1000)

  const falha = (res, e, padrao) => res.status(e.status || 500).json({ error: e.message || padrao })

  function contexto(req, res) {
    const cfg = readJson(CONFIGS, {})[req.user.id]
    if (!cfg) { res.status(404).json({ error: 'Conta nao encontrada' }); return null }
    return { userId: req.user.id, cfg, dataDir: DATA }
  }

  function chaves(ctx) {
    return cofre.ler(ctx.dataDir, ctx.userId, 'ia') || {}
  }

  function visao(ctx) {
    const c = ctx.cfg.copy || {}
    const ks = chaves(ctx)
    const provedores = copy.NUVEM.map((id) => ({ id, rotulo: copy.PROVEDORES[id].rotulo, local: false, temChave: !!ks[id], mascara: ks[id] ? copy.mascara(ks[id]) : '' }))
    if (copy.ollamaPermitido(ctx.cfg)) provedores.push({ id: 'ollama', rotulo: copy.PROVEDORES.ollama.rotulo, local: true, temChave: true, mascara: '' })
    return {
      ok: true,
      modelo: c.modelo || '',
      modeloSugerido: MODELO_SUGERIDO,
      variaveis: copy.VARIAVEIS,
      ia: { ativo: !!(c.ia && c.ia.ativo), provedor: (c.ia && c.ia.provedor) || 'groq' },
      provedores,
      cofreDisponivel: cofre.disponivel(),
      exemplo: copy.baseTexto(c.modelo ? { copy: { modelo: c.modelo } } : {}, copy.OFERTA_EXEMPLO)
    }
  }

  function salvarCopy(ctx, fn) {
    const todos = readJson(CONFIGS, {})
    const cur = todos[ctx.userId]
    cur.copy = cur.copy || {}
    fn(cur.copy)
    cur.updatedAt = new Date().toISOString()
    todos[ctx.userId] = cur
    writeJson(CONFIGS, todos)
    ctx.cfg = cur
  }

  function provedorValido(id, cfg) {
    return copy.NUVEM.includes(id) || (id === 'ollama' && copy.ollamaPermitido(cfg))
  }

  app.get('/copy/config', auth, (req, res) => {
    try {
      const ctx = contexto(req, res)
      if (ctx) res.json(visao(ctx))
    } catch (e) { falha(res, e, 'Falha ao ler a configuracao') }
  })

  app.put('/copy/config', auth, (req, res) => {
    try {
      const ctx = contexto(req, res)
      if (!ctx) return
      const body = req.body || {}
      let modelo
      if (Object.prototype.hasOwnProperty.call(body, 'modelo')) {
        if (body.modelo === null || body.modelo === '') modelo = ''
        else {
          const msg = copy.validarModelo(body.modelo)
          if (msg) return res.status(400).json({ error: msg })
          modelo = String(body.modelo).replace(/\r\n/g, '\n').trim()
        }
      }
      let ia
      if (body.ia != null) {
        if (typeof body.ia !== 'object' || Array.isArray(body.ia)) return res.status(400).json({ error: 'Configuracao de IA invalida.' })
        const atual = (ctx.cfg.copy && ctx.cfg.copy.ia) || { ativo: false, provedor: 'groq' }
        const provedor = body.ia.provedor != null ? body.ia.provedor : atual.provedor
        const ativo = body.ia.ativo != null ? body.ia.ativo : atual.ativo
        if (typeof ativo !== 'boolean') return res.status(400).json({ error: 'ia.ativo deve ser verdadeiro ou falso.' })
        if (typeof provedor !== 'string' || !provedorValido(provedor, ctx.cfg)) return res.status(400).json({ error: 'Provedor de IA invalido ou nao liberado para esta conta.' })
        if (ativo && provedor !== 'ollama' && !chaves(ctx)[provedor]) return res.status(400).json({ error: 'Salve a chave de ' + copy.PROVEDORES[provedor].rotulo + ' antes de ligar a IA.' })
        ia = { ativo, provedor }
      }
      salvarCopy(ctx, (c) => {
        if (modelo !== undefined) { if (modelo) c.modelo = modelo; else delete c.modelo }
        if (ia) c.ia = ia
      })
      res.json(visao(ctx))
    } catch (e) { falha(res, e, 'Falha ao salvar') }
  })

  app.post('/copy/chave', auth, async (req, res) => {
    try {
      const ctx = contexto(req, res)
      if (!ctx) return
      const { provedor, chave } = req.body || {}
      if (typeof provedor !== 'string' || !copy.NUVEM.includes(provedor)) return res.status(400).json({ error: 'Provedor invalido (groq, xai ou gemini).' })
      const limpa = typeof chave === 'string' ? chave.trim() : ''
      if (!CHAVE_RE.test(limpa)) return res.status(400).json({ error: 'Chave invalida: cole a chave inteira, sem espacos (20 a 200 caracteres).' })
      if (!cofre.disponivel()) return res.status(503).json({ error: 'O servidor ainda nao tem a chave mestra (SAAS_MASTER_KEY). Fale com o administrador.' })
      const atuais = Object.assign({}, chaves(ctx), { [provedor]: limpa })
      await cofre.gravar(ctx.dataDir, ctx.userId, 'ia', atuais)
      res.json({ ok: true, provedor, mascara: copy.mascara(limpa) })
    } catch (e) { falha(res, e, 'Falha ao guardar a chave') }
  })

  app.post('/copy/chave/remover', auth, async (req, res) => {
    try {
      const ctx = contexto(req, res)
      if (!ctx) return
      const provedor = (req.body || {}).provedor
      if (typeof provedor !== 'string' || !copy.NUVEM.includes(provedor)) return res.status(400).json({ error: 'Provedor invalido.' })
      const atuais = Object.assign({}, chaves(ctx))
      delete atuais[provedor]
      if (Object.keys(atuais).length) await cofre.gravar(ctx.dataDir, ctx.userId, 'ia', atuais)
      else await cofre.apagar(ctx.dataDir, ctx.userId, 'ia')
      // Nao deixa a IA ligada apontando para uma chave que sumiu
      const c = ctx.cfg.copy
      if (c && c.ia && c.ia.ativo && c.ia.provedor === provedor) salvarCopy(ctx, (cc) => { cc.ia = { ativo: false, provedor } })
      res.json(visao(ctx))
    } catch (e) { falha(res, e, 'Falha ao remover a chave') }
  })

  app.post('/copy/previa', auth, async (req, res) => {
    try {
      const ctx = contexto(req, res)
      if (!ctx) return
      const body = req.body || {}
      const c = ctx.cfg.copy || {}
      let modelo = c.modelo || ''
      if (Object.prototype.hasOwnProperty.call(body, 'modelo') && body.modelo) {
        const msg = copy.validarModelo(body.modelo)
        if (msg) return res.status(400).json({ error: msg })
        modelo = String(body.modelo).replace(/\r\n/g, '\n').trim()
      }
      const usarIA = body.ia === true
      const simulado = { email: ctx.cfg.email, copy: { modelo, ia: { ativo: false, provedor: 'groq' } } }
      if (usarIA) {
        if (!licencaAtiva(ctx.cfg)) return res.status(403).json({ error: 'Licenca expirada ou inativa.' })
        const provedor = typeof body.provedor === 'string' ? body.provedor : (c.ia && c.ia.provedor)
        if (!provedor || !provedorValido(provedor, ctx.cfg)) return res.status(400).json({ error: 'Escolha um provedor de IA valido.' })
        if (provedor !== 'ollama' && !chaves(ctx)[provedor]) return res.status(400).json({ error: 'Salve a chave de ' + copy.PROVEDORES[provedor].rotulo + ' primeiro.' })
        if (!podePrevia(ctx.userId)) return res.status(429).json({ error: 'Muitas previas com IA seguidas. Espere um minuto.' })
        simulado.copy.ia = { ativo: true, provedor }
      }
      // Previa mostra o seu cupom vigente de verdade; sem nenhum, um cupom de exemplo (so aqui)
      const real = cupons.escolher(ctx.dataDir, ctx.userId, { loja: 'shopee' })
      const exemplo = Object.assign({}, copy.OFERTA_EXEMPLO, { cupom: real || { codigo: 'EXEMPLO10', regra: 'cupom de exemplo' } })
      const r = await copy.gerar({ userId: ctx.userId, cfg: simulado, dataDir: ctx.dataDir }, exemplo, { fetch: opcoes.fetch })
      res.json({ ok: true, texto: r.texto, via: r.via, aviso: r.aviso })
    } catch (e) { falha(res, e, 'Falha na previa') }
  })
}

module.exports = { mount, MODELO_SUGERIDO }
