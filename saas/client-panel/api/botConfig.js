/**
 * O que o bot externo recebe em GET /bot/config (B6). Os consumidores conhecidos usam so
 * `affiliate` (!link) e o status da licenca; nenhum le `shopee`. Por isso o segredo da Shopee
 * NAO sai daqui: o bot recebe so o App ID, a palavra-chave e se a conta esta configurada.
 */
function shopeeParaBot(shopee) {
  const s = shopee || {}
  return { appId: s.appId || '', keyword: s.keyword || '', configurado: !!(s.appId && s.secret) }
}

function paraBot(cfg) {
  return {
    tenantId: cfg.tenantId,
    botName: cfg.botName,
    phone: cfg.phone,
    affiliate: cfg.affiliate,
    shopee: shopeeParaBot(cfg.shopee),
    ads: cfg.ads,
    ai: cfg.ai,
    license: cfg.license
  }
}

module.exports = { paraBot, shopeeParaBot }
