/**
 * Publicador por nicho. Substitui o publicarOferta no agendador e nos testes,
 * com o mesmo formato de retorno ({ ok, message, sample, enviados, results }).
 *
 * Para cada grupo de destino (agrupados por nicho + palavras extras):
 *   1. acha oferta: banco de ofertas (rodizio) e/ou API Shopee com busca do nicho
 *   2. so aceita se combinar com o nicho e passar no filtro de qualidade
 *   3. troca/valida o link de afiliado (oferta colada) ou valida o da API
 *   4. escolhe imagem: gerada preferida > original da oferta > so texto
 *   5. envia e registra tudo na auditoria (enviado, pulado, falha)
 * Sem oferta relevante para o nicho, aquele grupo nao recebe nada.
 */
const ofertasApi = require('../ofertas')
const nichos = require('./nichos')
const qualidade = require('./qualidade')
const conversor = require('./conversor')
const links = require('./links')
const pool = require('./pool')
const fila = require('./fila')
const copy = require('./copy')
const revalidacao = require('./revalidacao')
const atribuicao = require('./atribuicao')
const cupons = require('./cupons')
const auditoria = require('./auditoria')
const imagens = require('./imagens/store')

const JID_RE = /^[0-9A-Za-z._-]+@g\.us$/
const MAX_PULADOS_LOG = 3

// Destinos com nicho e palavras extras salvos em cfg.groups. Grupo fonte nunca e destino.
function destinosDe(cfg, somente) {
  const salvos = new Map((cfg.groups || []).map((g) => [g && g.jid, g]))
  const fontes = new Set((cfg.sources || []).map((g) => g && g.jid))
  const lista = Array.isArray(somente) ? somente : (cfg.groups || [])
  return lista
    .map((g) => {
      const jid = String((g && g.jid) || '')
      const salvo = salvos.get(jid) || {}
      return {
        jid,
        name: String((g && (g.name || salvo.name || g.jid)) || '').replace(/[<>]/g, '').slice(0, 120),
        niche: nichos.normalizar((g && g.niche) || salvo.niche),
        keywords: nichos.palavrasExtras((g && g.keywords) || salvo.keywords)
      }
    })
    .filter((g) => JID_RE.test(g.jid) && !fontes.has(g.jid))
}

function fontesDe(cfg) {
  const f = cfg.ads && cfg.ads.source
  if (f === 'pool') return ['pool']
  if (f === 'misto') return ['pool', 'api']
  return ['api']
}

function shopeePronta(cfg) {
  return !!(cfg.shopee && cfg.shopee.appId && cfg.shopee.secret)
}

// Grupos com mesmo nicho e mesmas palavras recebem a mesma oferta
function agrupar(destinos) {
  const mapa = new Map()
  for (const g of destinos) {
    const chave = g.niche + '|' + g.keywords.join(',').toLowerCase()
    if (!mapa.has(chave)) mapa.set(chave, [])
    mapa.get(chave).push(g)
  }
  return [...mapa.values()]
}

async function doBanco(ctx, grupos, pulados) {
  const ref = grupos[0]
  const jids = grupos.map((g) => g.jid)
  const ja = new Set()
  let conferidas = 0
  let lista = null
  for (const jid of jids) {
    const c = pool.candidatas(ctx.dataDir, ctx.userId, jid)
    lista = lista ? lista.filter((i) => c.some((x) => x.id === i.id)) : c
  }
  for (const item of lista || []) {
    if (ja.has(item.id)) continue
    ja.add(item.id)
    const n = nichos.compativel(ref, item.texto)
    if (!n.ok) { pulados.push({ nome: item.nome, produtoKey: 'pool:' + item.id, motivo: 'nicho ' + n.nicho + ': ' + n.motivo }); continue }
    const q = qualidade.avaliarTexto(item.texto, ctx.cfg)
    if (!q.ok) { pulados.push({ nome: item.nome, produtoKey: 'pool:' + item.id, motivo: 'qualidade: ' + q.motivo }); continue }
    // Cita um cupom que voce cadastrou e que ja nao vale: nao sai (nao reescrevemos texto colado)
    const cv = cupons.vencidoNoTexto(ctx.dataDir, ctx.userId, item.texto)
    if (cv) { pulados.push({ nome: item.nome, produtoKey: 'pool:' + item.id, motivo: cv.motivo }); continue }
    // Oferta da Vitrine: confere na Shopee antes de enviar (sumiu = pausa e pula; preco mudou = texto novo)
    if (item.shopee && conferidas++ >= 8) { pulados.push({ nome: item.nome, produtoKey: 'pool:' + item.id, motivo: 'conferencia: limite de consultas nesta rodada' }); break }
    const rv = await revalidacao.revalidar(ctx, item)
    if (!rv.ok) { pulados.push({ nome: item.nome, produtoKey: 'pool:' + item.id, motivo: (rv.pausada ? 'indisponivel: ' : 'conferencia: ') + rv.motivo }); continue }
    const conv = await conversor.converterTexto(rv.texto || item.texto, Object.assign({}, ctx, { atribuicao: { origem: 'banco', nicho: ref.niche } }))
    if (!conv.ok) {
      pulados.push({ nome: item.nome, produtoKey: 'pool:' + item.id, motivo: 'link: ' + conv.erros.map((e) => e.motivo).join('; ') })
      continue
    }
    let imageUrl = ''
    let imagePath = ''
    if (item.imagem && item.imagem.tipo === 'url') imageUrl = item.imagem.valor
    if (item.imagem && item.imagem.tipo === 'arquivo') imagePath = pool.caminhoMidia(ctx.dataDir, ctx.userId, item.imagem.valor)
    return {
      fonte: 'pool',
      textoOriginal: rv.texto || item.texto,
      poolId: item.id,
      produtoKey: 'pool:' + item.id,
      nome: item.nome,
      texto: conv.texto,
      imageUrl,
      imagePath,
      marketplaces: conv.marketplaces,
      links: conv.trocas.length,
      cupons: item.cupons || qualidade.cupons(item.texto),
      avisos: conv.trocas.map((t) => t.aviso).filter(Boolean).concat(rv.aviso ? [rv.aviso] : [])
    }
  }
  return null
}

async function daApi(ctx, grupos, pulados) {
  if (!shopeePronta(ctx.cfg)) return null
  const ref = grupos[0]
  const evitar = new Set()
  for (const g of grupos) {
    for (const k of auditoria.enviadosPara(ctx.dataDir, ctx.userId, g.jid, 7)) {
      if (k.startsWith('shopee:')) evitar.add(k.slice(7))
    }
  }
  // Duas buscas no maximo: nicho tem varias palavras de busca, a 2a tenta outra
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const rejeitados = []
    const oferta = await ofertasApi.preparar(ctx.dataDir, ctx.userId, ctx.cfg.shopee, {
      keyword: nichos.buscaDoNicho(ref.niche, ctx.cfg.shopee.keyword),
      evitar: [...evitar],
      subIds: atribuicao.subIdsDe({ origem: 'api', nicho: ref.niche }),
      semCurto: porGrupo(ctx.cfg),
      rejeitados,
      aceitar: (p) => {
        const n = nichos.compativel(ref, p.nome)
        if (!n.ok) return { ok: false, motivo: 'nicho ' + n.nicho + ': ' + n.motivo }
        const q = qualidade.avaliarApi(p, ctx.cfg)
        if (!q.ok) return { ok: false, motivo: 'qualidade: ' + q.motivo }
        const f = links.validarFormato(p.link, 'shopee')
        if (!f.ok) return { ok: false, motivo: 'link: ' + f.motivo }
        return { ok: true }
      }
    })
    for (const r of rejeitados) pulados.push({ nome: r.oferta.nome, produtoKey: 'shopee:' + r.oferta.productId, motivo: r.motivo })
    if (oferta) {
      // Mensagem: modelo do cliente ou IA com trava (fase 1.5a). Sem nada configurado = texto de sempre.
      oferta.cupom = cupons.escolher(ctx.dataDir, ctx.userId, { loja: 'shopee', nicho: ref.niche })
      const c = await copy.gerar(ctx, oferta, { padrao: oferta.texto })
      return {
        fonte: 'api',
        // modo por grupo: o texto ainda tem o link original e e convertido a cada grupo no envio
        textoOriginal: porGrupo(ctx.cfg) ? c.texto : undefined,
        productId: oferta.productId,
        produtoKey: 'shopee:' + oferta.productId,
        nome: oferta.nome,
        texto: c.texto,
        imageUrl: oferta.imageUrl,
        imagePath: '',
        marketplaces: ['shopee'],
        links: 1,
        cupons: oferta.cupom ? [oferta.cupom.codigo] : [],
        avisos: c.aviso ? [c.aviso] : []
      }
    }
    if (ref.niche === 'geral') break
  }
  return null
}

// Atribuicao por grupo (fase 2.1): um link de afiliado por grupo, ligado em Comissoes
const porGrupo = (cfg) => !!(cfg && cfg.comissoes && cfg.comissoes.porGrupo)

function escolherImagem(ctx, oferta) {
  const usarGerada = !!(ctx.cfg.ads && ctx.cfg.ads.useGeneratedImages)
  const gerada = usarGerada ? imagens.preferidaDe(ctx.dataDir, ctx.userId, oferta.produtoKey) : ''
  if (gerada) return { imagePath: gerada, imageUrl: '', imagem: 'gerada' }
  if (oferta.imagePath) return { imagePath: oferta.imagePath, imageUrl: '', imagem: 'original' }
  if (oferta.imageUrl) return { imagePath: '', imageUrl: oferta.imageUrl, imagem: 'original' }
  return { imagePath: '', imageUrl: '', imagem: 'nenhuma' }
}

function log(logs, ctx, entry) {
  if (logs) logs.append(ctx.dataDir, ctx.userId, entry)
}

/**
 * Mesmo contrato do divulgar.publicarOferta. Extra no retorno:
 *   pulados (grupos sem oferta relevante) e semOferta (nada para ninguem).
 */
async function publicar({ userId, cfg, groups, dataDir, logs, sessions }) {
  const destinos = destinosDe(cfg, groups)
  if (!destinos.length) {
    const err = new Error('Salve pelo menos um grupo na aba Anuncios.')
    err.status = 400
    throw err
  }
  const ctx = { userId, cfg, dataDir }
  const fontes = fontesDe(cfg)
  if (fontes.includes('api') && !fontes.includes('pool') && !shopeePronta(cfg)) {
    const err = new Error('Salve App ID e Secret da Shopee. O anuncio sai da API desta conta.')
    err.code = 'SHOPEE'
    err.status = 400
    throw err
  }

  const results = []
  const semOferta = []
  let erroApi = null
  let amostra = ''

  for (const grupos of agrupar(destinos)) {
    const pulados = []
    let oferta = null
    for (const fonte of fontes) {
      try {
        oferta = fonte === 'pool' ? await doBanco(ctx, grupos, pulados) : await daApi(ctx, grupos, pulados)
      } catch (e) {
        if (fonte === 'api') erroApi = erroApi || e
        else console.error('[PUBLICADOR] banco', e.message)
      }
      if (oferta) break
    }

    for (const p of pulados.slice(0, MAX_PULADOS_LOG)) {
      await auditoria.registrar(dataDir, userId, { tipo: 'pulado', motivo: p.motivo, grupo: grupos[0].name, jid: grupos[0].jid, nicho: grupos[0].niche, nome: p.nome, produtoKey: p.produtoKey })
    }
    await fila.registrarPulos(dataDir, userId, pulados, grupos[0].jid)

    if (!oferta) {
      const motivo = erroApi && !pulados.length
        ? 'API: ' + (erroApi.message || 'falha')
        : 'nenhuma oferta relevante para o nicho ' + grupos[0].niche + (pulados.length ? ' (' + pulados.length + ' descartada(s))' : '')
      for (const g of grupos) {
        semOferta.push({ jid: g.jid, name: g.name, niche: g.niche, motivo })
        await auditoria.registrar(dataDir, userId, { tipo: 'pulado', motivo, grupo: g.name, jid: g.jid, nicho: g.niche })
      }
      if (!erroApi) {
        log(logs, ctx, { source: 'anuncio', level: 'warn', ok: null, group: grupos.map((g) => g.name).join(', ').slice(0, 120), message: 'Sem oferta para o nicho ' + grupos[0].niche + '. Nada enviado.' })
      }
      continue
    }

    amostra = amostra || oferta.nome
    const img = escolherImagem(ctx, oferta)
    const ok = []
    for (const g of grupos) {
      try {
        let texto = oferta.texto
        if (porGrupo(cfg) && oferta.textoOriginal) {
          const cv = await conversor.converterTexto(oferta.textoOriginal, Object.assign({}, ctx, { atribuicao: { origem: oferta.fonte === 'api' ? 'api' : 'banco', nicho: g.niche, grupo: g.jid } }))
          if (!cv.ok) throw new Error('link: ' + cv.erros.map((e) => e.motivo).join('; '))
          texto = cv.texto
        }
        await sessions.sendOffer(userId, g.jid, { text: texto, imageUrl: img.imageUrl, imagePath: img.imagePath })
        ok.push(g.jid)
        results.push({ jid: g.jid, name: g.name, ok: true, niche: g.niche })
        await auditoria.registrar(dataDir, userId, {
          tipo: 'enviado', grupo: g.name, jid: g.jid, nicho: g.niche, fonte: oferta.fonte, produtoKey: oferta.produtoKey,
          nome: oferta.nome, imageUrl: oferta.imageUrl, marketplaces: oferta.marketplaces, links: oferta.links,
          cupons: oferta.cupons, imagem: img.imagem, avisos: oferta.avisos
        })
        log(logs, ctx, { source: 'anuncio', level: 'info', ok: true, group: g.name, jid: g.jid, message: 'Oferta (' + g.niche + '): ' + oferta.nome })
      } catch (e) {
        const wa = e.code === 'WA' || /conectado|jid/i.test(e.message || '')
        results.push({ jid: g.jid, name: g.name, ok: false, niche: g.niche, error: e.message || 'erro' })
        await auditoria.registrar(dataDir, userId, { tipo: 'falha', motivo: (wa ? 'WhatsApp: ' : '') + (e.message || 'falha no envio'), grupo: g.name, jid: g.jid, nicho: g.niche, fonte: oferta.fonte, produtoKey: oferta.produtoKey, nome: oferta.nome })
        log(logs, ctx, { source: wa ? 'whatsapp' : 'anuncio', level: 'error', ok: false, group: g.name, jid: g.jid, message: (wa ? 'WhatsApp: ' : '') + (e.message || 'Falha no envio') })
      }
    }
    if (ok.length && oferta.fonte === 'pool') await pool.marcarEnviado(dataDir, userId, oferta.poolId, ok)
    if (ok.length && oferta.fonte === 'api') ofertasApi.lembrar(dataDir, userId, oferta.productId)
  }

  // Erro de API e nada mais aconteceu: devolve o erro (agendador loga e espera 2 min)
  if (erroApi && !results.length && semOferta.every((s) => s.motivo.startsWith('API:'))) throw erroApi

  const enviados = results.filter((r) => r.ok).length
  let message
  if (enviados) message = 'Oferta publicada em ' + enviados + ' de ' + results.length + ' grupo(s)' + (amostra ? ': ' + amostra : '')
  else if (results.length) message = 'A oferta foi encontrada, mas o WhatsApp nao enviou.'
  else message = 'Nenhuma oferta relevante para o nicho dos grupos. Nada foi enviado.'
  if (enviados && semOferta.length) message += '. ' + semOferta.length + ' grupo(s) sem oferta do nicho.'
  return {
    ok: enviados > 0,
    message,
    sample: amostra,
    enviados,
    results,
    pulados: semOferta,
    semOferta: !results.length && semOferta.length > 0
  }
}

module.exports = { publicar, destinosDe, agrupar, fontesDe }
