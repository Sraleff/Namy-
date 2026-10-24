/**
 * Conversor de link (Fase 1.1): o cliente cola link(s) da Shopee e recebe o link
 * curto de afiliado DELE (generateShortLink da API oficial, com as chaves da conta).
 *
 * - userId sai so do JWT (req.user.id); o body so traz o texto.
 * - Nesta fase so Shopee. Mercado Livre e Amazon sao trocados em Ofertas > Colar oferta.
 * - Reaproveita conversor.converterTexto: mesmas protecoes (https, host publico,
 *   tira o rastreio de quem postou o link).
 * - Nao envia nada para ninguem. Cada link vira 1 chamada a API do cliente, entao
 *   ha limite por minuto para nao gastar a cota dele.
 */
const links = require('./links')
const conversor = require('./conversor')
const shopee = require('./conectores/shopee')

const MAX_TEXTO = 2000
const MAX_LINKS = 5
const LIMITE_POR_MIN = 12
const JANELA_MS = 60 * 1000

function licencaAtiva(cfg) {
  if (!cfg || !cfg.license) return false
  return !!cfg.license.active && new Date(cfg.license.expiresAt) > new Date()
}

// Janela deslizante por usuario. permitir(userId, n) consome n unidades ou recusa tudo.
function criarLimitador(max, janelaMs) {
  const porUsuario = new Map()
  return function permitir(userId, n = 1, agora = Date.now()) {
    const lista = (porUsuario.get(userId) || []).filter((t) => agora - t < janelaMs)
    if (lista.length + n > max) {
      porUsuario.set(userId, lista)
      return false
    }
    for (let i = 0; i < n; i++) lista.push(agora)
    porUsuario.set(userId, lista)
    if (porUsuario.size > 2000) porUsuario.delete(porUsuario.keys().next().value)
    return true
  }
}

const FORA_ML_AMAZON = 'Mercado Livre e Amazon sao convertidos em Ofertas > Colar oferta.'
const FORA_OUTRO = 'Nao e link da Shopee. Esta tela converte so links da Shopee.'

function semEsquema(url) {
  return String(url || '').replace(/^https?:\/\//i, '')
}

function mount(app, deps, opcoes = {}) {
  const { auth, readJson, CONFIGS, DATA, logs } = deps
  const permitir = criarLimitador(opcoes.limitePorMin || LIMITE_POR_MIN, JANELA_MS)

  function log(userId, ok, message) {
    if (!logs) return
    try {
      logs.append(DATA, userId, { source: 'conversor', level: ok ? 'info' : 'warn', ok, message })
    } catch (_) { /* log nunca derruba a conversao */ }
  }

  app.post('/conversor/link', auth, async (req, res) => {
    try {
      const userId = req.user.id
      const cfg = readJson(CONFIGS, {})[userId]
      if (!cfg) return res.status(404).json({ error: 'Conta nao encontrada' })
      if (!licencaAtiva(cfg)) return res.status(403).json({ error: 'Licenca expirada ou inativa.' })

      const bruto = (req.body || {}).texto
      if (typeof bruto !== 'string' || !bruto.trim()) return res.status(400).json({ error: 'Cole o link da Shopee.' })
      if (bruto.length > MAX_TEXTO) return res.status(400).json({ error: 'Texto grande demais (maximo ' + MAX_TEXTO + ' caracteres).' })

      const pronto = shopee.configurado({ cfg })
      if (!pronto.ok) return res.status(400).json({ error: pronto.motivo, codigo: 'SEM_CHAVE' })

      const achados = links.extrairUrls(bruto)
      if (!achados.length) return res.status(400).json({ error: 'Nao achei nenhum link no texto.' })
      const unicos = [...new Set(achados.map((a) => a.url))]
      if (unicos.length > MAX_LINKS) return res.status(400).json({ error: 'No maximo ' + MAX_LINKS + ' links por vez.' })

      const daShopee = []
      const fora = []
      for (const url of unicos) {
        const mk = links.marketplaceDe(url)
        if (mk === 'shopee') daShopee.push(url)
        else fora.push({ url, motivo: mk ? FORA_ML_AMAZON : FORA_OUTRO })
      }
      if (!daShopee.length) return res.status(400).json({ error: fora[0].motivo, fora })

      if (!permitir(userId, daShopee.length)) {
        return res.status(429).json({ error: 'Muitas conversoes seguidas. Espere um minuto e tente de novo.' })
      }

      const ctx = { userId, cfg, dataDir: DATA }
      const resultados = []
      const erros = []
      for (const url of daShopee) {
        const conv = await conversor.converterTexto(url, ctx)
        if (conv.trocas.length) {
          const t = conv.trocas[0]
          resultados.push({ de: url, para: t.para, aviso: t.aviso || '' })
          log(userId, true, 'Link Shopee convertido: ' + semEsquema(t.para))
        } else {
          const e = conv.erros[0] || { motivo: 'Nao consegui converter este link.' }
          erros.push({ url, motivo: e.motivo, temporario: !!e.temporario })
          log(userId, false, 'Falha ao converter link Shopee: ' + String(e.motivo).slice(0, 200))
        }
      }
      res.json({ ok: resultados.length > 0, resultados, erros, fora })
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Falha ao converter o link' })
    }
  })
}

module.exports = { mount, criarLimitador, MAX_LINKS, MAX_TEXTO, LIMITE_POR_MIN }
