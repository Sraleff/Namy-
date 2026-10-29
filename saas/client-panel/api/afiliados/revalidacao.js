/**
 * Revalidacao antes de enviar (fase 1.5b). So vale para ofertas que vieram da Shopee pela
 * Vitrine (guardam itemId): texto colado ou capturado de grupo nao tem como ser conferido
 * e segue como sempre.
 *
 *   sumiu da Shopee  -> pausa o item na fila e pula (ok:false, pausada:true)
 *   preco mudou      -> reescreve o texto com os dados de agora e grava (ok:true, mudou:true)
 *   API falhou       -> pula SO nesta rodada, sem pausar (ok:false, temporario:true)
 *   sem chave/sem itemId -> segue como antes (ok:true)
 * A conferencia fica em cache por 2 min: dois grupos na mesma rodada nao pagam duas consultas.
 */
const ofertasApi = require('../ofertas')
const pool = require('./pool')
const copy = require('./copy')
const jsonStore = require('./jsonStore')

const CACHE_MS = 2 * 60 * 1000
const cache = new Map() // userId:itemId -> { ate, oferta }

const brl = (n) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

async function revalidar(ctx, item) {
  const meta = item && item.shopee
  const chaves = ctx.cfg && ctx.cfg.shopee
  if (!meta || !/^\d{1,20}$/.test(String(meta.itemId || '')) || !chaves || !chaves.appId || !chaves.secret) return { ok: true, conferida: false }

  const chave = ctx.userId + ':' + meta.itemId
  let fresca
  const hit = cache.get(chave)
  if (hit && hit.ate > Date.now()) fresca = hit.oferta
  else {
    let r
    try {
      r = await ofertasApi.porItem(chaves, meta.itemId)
    } catch (e) {
      let det = String(e.message || 'erro')
      for (const segredo of [chaves.secret, chaves.appId]) if (segredo) det = det.split(String(segredo)).join('***')
      return { ok: false, temporario: true, motivo: 'não consegui conferir a oferta agora (' + det.slice(0, 80) + ')' }
    }
    if (r.status === 'indisponivel') {
      cache.delete(chave)
      await pool.alternar(ctx.dataDir, ctx.userId, item.id, false)
      return { ok: false, pausada: true, motivo: 'oferta indisponível na Shopee (pausada na fila)' }
    }
    fresca = r.oferta
    if (cache.size > 1000) cache.delete(cache.keys().next().value)
    cache.set(chave, { ate: Date.now() + CACHE_MS, oferta: fresca })
  }

  const antes = Number(meta.precoNum)
  if (Number.isFinite(antes) && antes > 0 && Math.abs(fresca.precoNum - antes) > 0.004) {
    const texto = copy.baseTexto(ctx.cfg, fresca)
    await jsonStore.update(ctx.dataDir, 'pool', ctx.userId, () => ({ itens: [] }), (db) => {
      const it = (db.itens || []).find((i) => i.id === item.id)
      if (!it) return
      it.texto = texto
      it.sig = pool.assinatura(texto)
      it.shopee = Object.assign({}, it.shopee, { precoNum: fresca.precoNum })
      it.revalidadoEm = new Date().toISOString()
    })
    return { ok: true, mudou: true, texto, aviso: 'preço atualizado: ' + brl(antes) + ' -> ' + fresca.preco }
  }
  return { ok: true, mudou: false }
}

module.exports = { revalidar, CACHE_MS }
