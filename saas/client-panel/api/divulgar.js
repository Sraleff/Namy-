/**
 * Publica uma oferta da API Shopee do cliente nos grupos salvos.
 */
const ofertas = require('./ofertas')

function gruposDe(cfg, somente) {
  const lista = Array.isArray(somente) ? somente : (cfg.groups || [])
  return lista
    .map((g) => ({
      jid: String((g && g.jid) || ''),
      name: String((g && (g.name || g.jid)) || '').replace(/[<>]/g, '').slice(0, 120)
    }))
    .filter((g) => /^[0-9A-Za-z._-]+@g\.us$/.test(g.jid))
}

async function publicarOferta({ userId, cfg, groups, dataDir, logs, sessions, oferta }) {
  const destinos = gruposDe(cfg, groups)
  if (!destinos.length) {
    const err = new Error('Salve pelo menos um grupo na aba Anuncios.')
    err.status = 400
    throw err
  }
  const item = oferta || await ofertas.preparar(dataDir, userId, cfg.shopee)
  const results = []
  for (const g of destinos) {
    try {
      await sessions.sendOffer(userId, g.jid, { text: item.texto, imageUrl: item.imageUrl })
      results.push({ jid: g.jid, name: g.name, ok: true })
      if (logs) {
        logs.append(dataDir, userId, {
          source: 'anuncio',
          level: 'info',
          ok: true,
          group: g.name,
          jid: g.jid,
          message: 'Oferta: ' + item.nome
        })
      }
    } catch (e) {
      const wa = e.code === 'WA' || /conectado|jid/i.test(e.message || '')
      results.push({ jid: g.jid, name: g.name, ok: false, error: e.message || 'erro' })
      if (logs) {
        logs.append(dataDir, userId, {
          source: wa ? 'whatsapp' : 'anuncio',
          level: 'error',
          ok: false,
          group: g.name,
          jid: g.jid,
          message: (wa ? 'WhatsApp: ' : '') + (e.message || 'Falha no envio')
        })
      }
    }
  }
  const enviados = results.filter((r) => r.ok).length
  if (enviados) ofertas.lembrar(dataDir, userId, item.productId)
  return {
    ok: enviados > 0,
    message: enviados
      ? 'Oferta publicada em ' + enviados + ' de ' + results.length + ' grupo(s): ' + item.nome
      : 'A oferta foi encontrada, mas o WhatsApp nao enviou.',
    sample: item.nome,
    enviados,
    results
  }
}

module.exports = { publicarOferta, gruposDe }
