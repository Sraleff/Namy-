const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

process.env.SAAS_MASTER_KEY = 'teste-chave-mestra-com-mais-de-32-caracteres!'

const nichos = require('./nichos')
const links = require('./links')
const qualidade = require('./qualidade')
const conversor = require('./conversor')
const pool = require('./pool')
const auditoria = require('./auditoria')
const publicador = require('./publicador')
const cofre = require('./cofre')
const oauth = require('./mercadolivreOAuth')
const imagens = require('./imagens/store')
const ofertas = require('../ofertas')
const scheduler = require('../scheduler')
const { aplicarConfig } = require('./routes')

function dir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'namy-afiliados-'))
}

function cfgBase(extra) {
  return Object.assign({
    shopee: { appId: '123', secret: 's', keyword: '' },
    amazon: { tag: 'namy-20' },
    mercadolivre: { etiqueta: 'namyofertas', toolId: '12345678' },
    ads: { source: 'pool' },
    groups: []
  }, extra || {})
}

// Sem rede nos testes: Shopee gera link fixo e a checagem ao vivo passa
ofertas.encurtar = async (appId, secret, url) => 'https://s.shopee.com.br/AFIL' + url.replace(/\D/g, '').slice(-4)
links.validarAoVivo = async () => ({ ok: true, motivo: '' })

test('nicho casa por palavra inteira e respeita evitar', () => {
  assert.equal(nichos.compativel({ niche: 'carros' }, 'Suporte veicular magnetico para celular').ok, true)
  assert.equal(nichos.compativel({ niche: 'carros' }, 'Carregador turbo USB-C 20W').ok, false)
  assert.equal(nichos.compativel({ niche: 'carros' }, 'Carrinho de bebe dobravel').ok, false)
  assert.equal(nichos.compativel({ niche: 'bebe' }, 'Carrinho de Bebê dobrável').ok, true)
  assert.equal(nichos.compativel({ niche: 'geral' }, 'qualquer coisa').ok, true)
  assert.equal(nichos.compativel({ niche: 'casa', keywords: ['churrasco'] }, 'Kit churrasco inox').ok, true)
  assert.equal(nichos.normalizar('Bebê'), 'bebe')
  assert.equal(nichos.normalizar('inexistente'), 'geral')
  assert.equal(nichos.classificar('Air Fryer 4L Mondial').nicho, 'casa')
})

test('extrai URL sem levar pontuacao e reconhece marketplace', () => {
  const t = '🔥 Oferta!\nhttps://shopee.com.br/produto-i.11.22).\nVeja: https://amzn.to/abc,'
  const urls = links.extrairUrls(t).map((u) => u.url)
  assert.deepEqual(urls, ['https://shopee.com.br/produto-i.11.22', 'https://amzn.to/abc'])
  assert.equal(links.marketplaceDe('https://produto.mercadolivre.com.br/MLB-123456-x'), 'mercadolivre')
  assert.equal(links.marketplaceDe('https://www.amazon.com.br/dp/B0ABCDEFGH'), 'amazon')
  assert.equal(links.marketplaceDe('https://evil.com/shopee.com.br'), null)
  assert.equal(links.ehCurto('https://mercadolivre.com/sec/abc'), true)
  assert.equal(links.ehCurto('https://mercadolivre.com.br/abc'), false)
  assert.equal(links.ipPrivado('192.168.0.10'), true)
  assert.equal(links.ipPrivado('8.8.8.8'), false)
})

test('conversor troca so os links e preserva emoji, cupom e espacos', async () => {
  const texto = '🔥 *AIR FRYER* 🔥\n\n💰 R$ 199\n🎟️ Cupom: CASA10\n\n👉 https://shopee.com.br/Air-Fryer-i.111.222?af_id=outro\n\n📦 Amazon: https://www.amazon.com.br/Fritadeira/dp/B0ABCDEFGH?tag=outro-20&ref=x\n🛒 ML: https://produto.mercadolivre.com.br/MLB-1234567-air-fryer?matt_word=outro&matt_tool=999\n'
  const out = await conversor.converterTexto(texto, { userId: 'u1', cfg: cfgBase(), dataDir: dir() })
  assert.equal(out.ok, true, JSON.stringify(out.erros))
  assert.equal(out.trocas.length, 3)
  assert.ok(out.texto.includes('https://s.shopee.com.br/AFIL1222'))
  assert.ok(out.texto.includes('https://www.amazon.com.br/dp/B0ABCDEFGH?tag=namy-20'))
  assert.ok(out.texto.includes('matt_word=namyofertas'))
  assert.ok(!out.texto.includes('outro'))
  // tudo fora das URLs fica igual
  const semUrl = (s) => s.replace(/https:\/\/\S+/g, 'URL')
  assert.equal(semUrl(out.texto), semUrl(texto))
  assert.deepEqual(qualidade.cupons(texto), ['CASA10'])
})

test('conversor barra a mensagem quando falta credencial do marketplace', async () => {
  const cfg = cfgBase({ amazon: { tag: '' } })
  const out = await conversor.converterTexto('Olha https://www.amazon.com.br/dp/B0ABCDEFGH', { userId: 'u1', cfg, dataDir: dir() })
  assert.equal(out.ok, false)
  assert.match(out.erros[0].motivo, /tag/)
  const vazio = await conversor.converterTexto('sem link nenhum', { userId: 'u1', cfg, dataDir: dir() })
  assert.equal(vazio.ok, false)
})

test('convite de grupo de terceiros sai junto com a linha', async () => {
  const out = await conversor.converterTexto('Oferta https://www.amazon.com.br/dp/B0ABCDEFGH\nEntre: https://chat.whatsapp.com/AbC123\nfim', { userId: 'u', cfg: cfgBase(), dataDir: dir() })
  assert.equal(out.ok, true)
  assert.equal(out.texto, 'Oferta https://www.amazon.com.br/dp/B0ABCDEFGH?tag=namy-20\nfim')
})

test('qualidade reprova so pelo que a fonte informou', () => {
  const cfg = { ads: { quality: { minDiscount: 20, minRating: 4.5, minSales: 0 } } }
  assert.equal(qualidade.avaliarApi({ desconto: 10, ratingStar: '4.9' }, cfg).ok, false)
  assert.equal(qualidade.avaliarApi({ desconto: 30, ratingStar: '4.1' }, cfg).ok, false)
  assert.equal(qualidade.avaliarApi({ desconto: 30, ratingStar: '' }, cfg).ok, true)
  assert.equal(qualidade.avaliarTexto('Sem percentual no texto', cfg).ok, true)
  assert.equal(qualidade.avaliarTexto('Só 10% OFF hoje', cfg).ok, false)
})

test('banco de ofertas deduplica e faz rodizio por grupo', async () => {
  const data = dir()
  const cfg = cfgBase()
  await assert.rejects(() => pool.adicionar(data, 'u2', cfg, { texto: 'sem link' }), /link/)
  const a = await pool.adicionar(data, 'u2', cfg, { texto: 'Panela antiaderente https://www.amazon.com.br/dp/B0AAAAAAAA' })
  const dup = await pool.adicionar(data, 'u2', cfg, { texto: 'Panela  antiaderente https://www.amazon.com.br/dp/B0AAAAAAAA' })
  assert.equal(dup.duplicado, true)
  assert.equal(a.item.nicho, 'casa')
  await pool.marcarEnviado(data, 'u2', a.item.id, ['g1@g.us'])
  assert.equal(pool.candidatas(data, 'u2', 'g1@g.us').length, 0)
  assert.equal(pool.candidatas(data, 'u2', 'g2@g.us').length, 1)
})

function sessaoFalsa() {
  const enviados = []
  return { enviados, sendOffer: async (userId, jid, msg) => { enviados.push({ jid, msg }) } }
}

test('publicador manda oferta so para o grupo do nicho e audita o pulo', async () => {
  const data = dir()
  const user = 'u3'
  const cfg = cfgBase({
    groups: [
      { jid: 'carros@g.us', name: 'Carros', niche: 'carros' },
      { jid: 'casa@g.us', name: 'Casa', niche: 'casa' },
      { jid: 'geral@g.us', name: 'Geral', niche: 'geral' }
    ]
  })
  await pool.adicionar(data, user, cfg, { texto: '🍳 Jogo de panelas inox\nhttps://www.amazon.com.br/dp/B0BBBBBBBB' })
  const s = sessaoFalsa()
  const out = await publicador.publicar({ userId: user, cfg, dataDir: data, sessions: s })
  const jids = s.enviados.map((e) => e.jid).sort()
  assert.deepEqual(jids, ['casa@g.us', 'geral@g.us'])
  assert.ok(s.enviados[0].msg.text.includes('tag=namy-20'))
  assert.equal(out.enviados, 2)
  assert.equal(out.pulados.length, 1)
  assert.equal(out.pulados[0].jid, 'carros@g.us')
  const rows = auditoria.listar(data, user)
  assert.ok(rows.some((r) => r.tipo === 'pulado' && r.jid === 'carros@g.us'))
  assert.equal(rows.filter((r) => r.tipo === 'enviado').length, 2)
  // Segundo disparo: rodizio nao repete a mesma oferta
  const s2 = sessaoFalsa()
  const out2 = await publicador.publicar({ userId: user, cfg, dataDir: data, sessions: s2 })
  assert.equal(s2.enviados.length, 0)
  assert.equal(out2.semOferta, true)
})

test('publicador nao usa grupo fonte como destino', () => {
  const cfg = { groups: [{ jid: 'a@g.us', name: 'A' }], sources: [{ jid: 'a@g.us' }] }
  assert.equal(publicador.destinosDe(cfg).length, 0)
})

test('publicador com API filtra por nicho e qualidade', async () => {
  const data = dir()
  const original = ofertas.preparar
  let pediu = null
  ofertas.preparar = async (dataDir, userId, shopee, opts) => {
    pediu = opts.keyword
    const lista = [
      { productId: '1', nome: 'Fone bluetooth', link: 'https://s.shopee.com.br/x1', preco: 'R$ 1', desconto: 50, ratingStar: '4.9', texto: 'fone' },
      { productId: '2', nome: 'Capa de banco para carro', link: 'https://s.shopee.com.br/x2', preco: 'R$ 1', desconto: 5, ratingStar: '4.9', texto: 'capa ruim' },
      { productId: '3', nome: 'Suporte veicular para celular', link: 'https://s.shopee.com.br/x3', preco: 'R$ 1', desconto: 40, ratingStar: '4.8', texto: 'suporte' }
    ]
    const ok = lista.filter((p) => { const r = opts.aceitar(p); if (!r.ok) opts.rejeitados.push({ oferta: p, motivo: r.motivo }); return r.ok })
    return ok[0] || null
  }
  try {
    const s = sessaoFalsa()
    const cfg = cfgBase({ ads: { source: 'api', quality: { minDiscount: 20 } }, groups: [{ jid: 'c@g.us', name: 'C', niche: 'carros' }] })
    const out = await publicador.publicar({ userId: 'u4', cfg, dataDir: data, sessions: s })
    assert.equal(out.enviados, 1)
    assert.equal(s.enviados[0].msg.text, 'suporte')
    assert.ok(nichos.NICHOS.carros.buscas.includes(pediu))
    const pulos = auditoria.listar(data, 'u4', { tipo: 'pulado' })
    assert.equal(pulos.length, 2)
  } finally {
    ofertas.preparar = original
  }
})

test('agendador respeita dias da semana', () => {
  const domingo = new Date('2026-10-18T15:00:00Z')
  assert.equal(scheduler.diaSemanaBrasilia(domingo), 0)
  assert.equal(scheduler.diaPermitido([1, 2, 3, 4, 5], domingo), false)
  assert.equal(scheduler.diaPermitido([0], domingo), true)
  assert.equal(scheduler.diaPermitido(undefined, domingo), true)
})

test('aplicarConfig valida dias, fonte e credenciais', () => {
  const cur = { ads: {} }
  aplicarConfig(cur, { ads: { days: [1, 1, 9, 2], source: 'misto', quality: { minDiscount: 150 } }, amazon: { tag: 'abc-20' }, mercadolivre: { etiqueta: 'minha_tag', toolId: '12a34' } })
  assert.deepEqual(cur.ads.days, [1, 2])
  assert.equal(cur.ads.source, 'misto')
  assert.equal(cur.ads.quality.minDiscount, 90)
  assert.equal(cur.mercadolivre.toolId, '1234')
  assert.throws(() => aplicarConfig(cur, { ads: { days: [] } }), /dia/)
  assert.throws(() => aplicarConfig(cur, { amazon: { tag: 'tag com espaco' } }), /Amazon/)
})

test('cofre cifra token no disco', async () => {
  const data = dir()
  await cofre.gravar(data, 'u5', 'mercadolivre', { access_token: 'SEGREDO123' })
  const bruto = fs.readFileSync(path.join(data, 'marketplaces', 'u5.json'), 'utf8')
  assert.ok(!bruto.includes('SEGREDO123'))
  assert.equal(cofre.ler(data, 'u5', 'mercadolivre').access_token, 'SEGREDO123')
})

test('OAuth ML: state de uso unico, PKCE e renovacao com 401', async () => {
  process.env.ML_CLIENT_ID = 'cid'
  process.env.ML_CLIENT_SECRET = 'csec'
  process.env.ML_REDIRECT_URI = 'https://painel.exemplo/mercadolivre/callback'
  const url = new URL(oauth.urlDeConexao('u6'))
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  const state = url.searchParams.get('state')
  assert.ok(state.length >= 40)

  const data = dir()
  const chamadas = []
  const fetchOriginal = global.fetch
  let tokenAtual = 'AT1'
  global.fetch = async (u, opts = {}) => {
    chamadas.push(String(u))
    const json = (status, body, headers = {}) => ({ ok: status < 400, status, json: async () => body, headers: { get: (k) => headers[k.toLowerCase()] || null } })
    if (String(u).endsWith('/oauth/token')) {
      const body = new URLSearchParams(opts.body)
      if (body.get('grant_type') === 'authorization_code') {
        assert.ok(body.get('code_verifier'))
        return json(200, { access_token: 'AT1', refresh_token: 'RT1', expires_in: 21600, user_id: 99 })
      }
      assert.equal(body.get('refresh_token'), 'RT1')
      tokenAtual = 'AT2'
      return json(200, { access_token: 'AT2', refresh_token: 'RT2', expires_in: 21600 })
    }
    if (String(u).endsWith('/users/me')) return json(200, { nickname: 'LOJA' })
    if (String(u).includes('/items/')) {
      return opts.headers.Authorization === 'Bearer ' + tokenAtual && tokenAtual === 'AT2' ? json(200, { status: 'active' }) : json(401, {})
    }
    if (String(u).includes('/limite')) return json(429, {}, { 'retry-after': '40' })
    return json(404, {})
  }
  try {
    const out = await oauth.concluir(data, state, 'CODE')
    assert.equal(out.userId, 'u6')
    assert.equal(out.nickname, 'LOJA')
    await assert.rejects(() => oauth.concluir(data, state, 'CODE'), /expirada|invalida/)
    // forca 401 no primeiro GET: renova e repete
    tokenAtual = 'AT1-velho'
    const item = await oauth.get(data, 'u6', '/items/MLB1')
    assert.equal(item.status, 'active')
    assert.equal(cofre.ler(data, 'u6', 'mercadolivre').refresh_token, 'RT2')
    await assert.rejects(() => oauth.get(data, 'u6', '/limite'), (e) => e.status === 429)
    await assert.rejects(() => oauth.get(data, 'u6', '/items/MLB1'), (e) => e.code === 'ML_RATE')
  } finally {
    global.fetch = fetchOriginal
  }
})

test('URL assinada de imagem expira e nao vale para outro cliente', () => {
  const url = new URL('http://x' + imagens.urlAssinada('segredo', 'u7', 'img1'))
  const q = url.searchParams
  assert.equal(imagens.conferirAssinatura('segredo', 'u7', 'img1', q.get('e'), q.get('s')), true)
  assert.equal(imagens.conferirAssinatura('segredo', 'u8', 'img1', q.get('e'), q.get('s')), false)
  assert.equal(imagens.conferirAssinatura('segredo', 'u7', 'img1', String(Date.now() - 1), q.get('s')), false)
})

test('mercadolivre: link curto da pagina social entrega o produto em destaque, nao os relacionados', () => {
  const ml = require('./conectores/mercadolivre')
  const card = (slug, id, titulo) => '<a href="https://ddnf.adj.st/webview/?url=' +
    encodeURIComponent('https://www.mercadolivre.com.br/' + slug + '/p/' + id + '?matt_event_ts=1&matt_d2id=x') +
    '&amp;adj_t=1y8rwb1z" target="_self" class="poly-component__title">' + titulo + '</a>'
  const html = '<head><meta property="og:title" content="ISDIN Acniben Sabonete Líquido Facial - 416g"/></head><body>' +
    card('isdin-acniben-sabonete-liquido-facial-416g', 'MLB36216726', 'ISDIN Acniben Sabonete Líquido Facial - 416g') +
    card('darrow-suavie-140ml', 'MLB19535918', 'Darrow Suavié 140ml') + '</body>'
  assert.equal(ml.produtoDoHtml(html), 'https://www.mercadolivre.com.br/isdin-acniben-sabonete-liquido-facial-416g/p/MLB36216726')

  // titulo do destaque com entidade HTML continua batendo
  const html2 = html.replace('Facial - 416g"/>', 'Facial &amp; Gel - 416g"/>').replace('Facial - 416g</a>', 'Facial &amp; Gel - 416g</a>')
  assert.equal(ml.produtoDoHtml(html2), 'https://www.mercadolivre.com.br/isdin-acniben-sabonete-liquido-facial-416g/p/MLB36216726')

  // sem card igual ao destaque: cai no id do estado da pagina
  const semCard = '<meta property="og:title" content="Produto X"/>' + card('outro', 'MLB19535918', 'Outro') +
    '"affiliates_event":{"path":"/a","type":"view","event_data":{"page_type":"affiliate-profile","item_id":"MLB36216726","owner_id":"1"}}'
  assert.equal(ml.produtoDoHtml(semCard), 'https://www.mercadolivre.com.br/p/MLB36216726')

  // nada identificavel: null (nunca chuta um relacionado)
  assert.equal(ml.produtoDoHtml('<meta property="og:title" content="Produto X"/>' + card('outro', 'MLB19535918', 'Outro')), null)
  assert.equal(ml.produtoDoHtml('<html></html>'), null)

  assert.equal(ml.ehPaginaSocial('https://www.mercadolivre.com.br/social/migu8819279?matt_word=x'), true)
  assert.equal(ml.ehPaginaSocial('https://www.mercadolivre.com.br/p/MLB36216726'), false)
})
