const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const express = require('express')

const captacao = require('./captacao')
const captacaoRoutes = require('./captacaoRoutes')
const paginas = require('./captacaoPaginas')

const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'namy-captacao-'))
const G1 = '120363000000000001@g.us'
const G2 = '120363000000000002@g.us'
const G3 = '120363000000000003@g.us'
const FONTE = '120363000000000009@g.us'
const exp = () => new Date(Date.now() + 864e5).toISOString()
const contaPro = (extra = {}) => Object.assign({
  license: { plan: 'pro_mensal', tier: 'pro', active: true, expiresAt: exp() },
  groups: [{ jid: G1, name: 'Ofertas 1' }, { jid: G2, name: 'Ofertas 2' }, { jid: G3, name: 'Ofertas 3' }],
  sources: [{ jid: FONTE, name: 'Fonte' }]
}, extra)

function limparCaches() {
  for (const m of Object.values(captacao._cache)) m.clear()
}

// WhatsApp simulado: tamanhos dos grupos e convites
function sessoesFalsas({ tamanhos = {}, semConvite = [], conectado = true } = {}) {
  const chamadas = { listGroups: 0, inviteLink: [] }
  return {
    chamadas,
    publicState: () => ({ connected: conectado }),
    listGroups: async () => { chamadas.listGroups++; return Object.entries(tamanhos).map(([jid, participants]) => ({ jid, name: jid, participants })) },
    inviteLink: async (_u, jid) => {
      chamadas.inviteLink.push(jid)
      if (semConvite.includes(jid)) throw new Error('Não consegui ler o convite. Em geral a conta precisa ser admin do grupo.')
      return { url: 'https://chat.whatsapp.com/CONVITE' + jid.slice(15, 18) + 'abcdefgh', code: 'x' }
    }
  }
}

test.beforeEach(limparCaches)

// ---------------------------------------------------------------- endereço

test('slug: 10 letras/números, único, troca invalida o antigo', async () => {
  const d = dir()
  const a = await captacao.garantirSlug(d, 'u1')
  assert.match(a, captacao.SLUG_RE)
  assert.equal(await captacao.garantirSlug(d, 'u1'), a, 'garantir não troca o que já existe')
  assert.equal(captacao.donoDoSlug(d, a), 'u1')
  const b = await captacao.garantirSlug(d, 'u2')
  assert.notEqual(a, b)
  const novo = await captacao.trocarSlug(d, 'u1')
  assert.notEqual(novo, a)
  assert.equal(captacao.donoDoSlug(d, a), '', 'endereço antigo para de funcionar')
  assert.equal(captacao.donoDoSlug(d, novo), 'u1')
  assert.equal(captacao.donoDoSlug(d, b), 'u2', 'troca de um cliente não mexe no outro')
  for (const ruim of ['', '../../etc', 'ABCDEFGHIJ', 'abc', null]) assert.equal(captacao.donoDoSlug(d, ruim), '')
})

// ---------------------------------------------------------------- validação

test('validarGrupos: só destinos salvos, fonte fora, limite 10..1024, modo e ativo com grupo', () => {
  const cfg = contaPro()
  const ok = captacao.validarGrupos(cfg, { ativo: true, titulo: ' Promo <b>top</b> ', jids: [G1, G2, G1], limite: 500, modo: 'equilibrado' })
  assert.deepEqual(ok.jids, [G1, G2], 'repetido sai')
  assert.equal(ok.titulo, 'Promo  b top /b'.replace(/\s+/g, ' '), 'sem < >')
  assert.equal(captacao.validarGrupos(cfg, {}).limite, 1000)
  assert.throws(() => captacao.validarGrupos(cfg, { jids: [FONTE] }), /fonte/)
  assert.throws(() => captacao.validarGrupos(cfg, { jids: ['999@g.us'] }), /destino/)
  assert.throws(() => captacao.validarGrupos(cfg, { jids: ['x'] }), /inválido/)
  assert.throws(() => captacao.validarGrupos(cfg, { jids: 'G1' }), /inválida/)
  assert.throws(() => captacao.validarGrupos(cfg, { limite: 5 }), /10 a 1024/)
  assert.throws(() => captacao.validarGrupos(cfg, { limite: 2000 }), /10 a 1024/)
  assert.throws(() => captacao.validarGrupos(cfg, { modo: 'aleatorio' }), /Modo/)
  assert.throws(() => captacao.validarGrupos(cfg, { ativo: true, jids: [] }), /pelo menos um grupo/)
  assert.equal(captacao.validarGrupos(cfg, { ativo: 'sim', jids: [G1] }).ativo, false, 'só true liga')
})

test('validarVitrine: horas 6..168 e botão do grupo ligado por padrão', () => {
  const v = captacao.validarVitrine({ ativo: true, titulo: 'Achados', horas: 24 })
  assert.equal(v.ativo, true)
  assert.equal(v.botaoGrupo, true)
  assert.equal(captacao.validarVitrine({}).horas, 48)
  assert.throws(() => captacao.validarVitrine({ horas: 2 }), /6 a 168/)
  assert.throws(() => captacao.validarVitrine({ horas: 1.5 }), /6 a 168/)
})

// ---------------------------------------------------------------- rotação

test('sequencial: enche o primeiro até o limite e passa para o próximo; equilibrado: o menor', async () => {
  const cfg = contaPro()
  const s = sessoesFalsas({ tamanhos: { [G1]: 998, [G2]: 10, [G3]: 5 } })
  const conf = { jids: [G1, G2, G3], limite: 1000, modo: 'sequencial' }
  const a = await captacao.escolherGrupo({ sessions: s }, 'u1', cfg, conf)
  assert.equal(a.jid, G1)
  assert.match(a.url, captacao.CONVITE_RE)
  captacao.registrarEntrada('u1', G1)
  assert.equal((await captacao.escolherGrupo({ sessions: s }, 'u1', cfg, conf)).jid, G1, '999 ainda cabe')
  captacao.registrarEntrada('u1', G1)
  assert.equal((await captacao.escolherGrupo({ sessions: s }, 'u1', cfg, conf)).jid, G2, 'cheio pelas entradas contadas: vai para o próximo')
  assert.equal(s.chamadas.listGroups, 1, 'tamanho dos grupos fica em cache')
  const eq = await captacao.escolherGrupo({ sessions: s }, 'u1', cfg, Object.assign({}, conf, { modo: 'equilibrado' }))
  assert.equal(eq.jid, G3)
})

test('grupo sem convite (não é admin) sai por 30 min; grupo que a conta deixou some; nenhum = null', async () => {
  const cfg = contaPro()
  const s = sessoesFalsas({ tamanhos: { [G1]: 10, [G2]: 20 }, semConvite: [G1] })
  const conf = { jids: [G1, G2, G3], limite: 1000, modo: 'sequencial' }
  const r = await captacao.escolherGrupo({ sessions: s }, 'u1', cfg, conf)
  assert.equal(r.jid, G2)
  await captacao.escolherGrupo({ sessions: s }, 'u1', cfg, conf)
  assert.equal(s.chamadas.inviteLink.filter((j) => j === G1).length, 1, 'não insiste no grupo que falhou')
  assert.equal(s.chamadas.inviteLink.includes(G3), false, 'G3 não está no WhatsApp da conta')
  const st = await captacao.statusGrupos({ sessions: s }, 'u1', cfg, conf)
  assert.equal(st.find((x) => x.jid === G1).convite, 'erro')
  assert.match(st.find((x) => x.jid === G1).erro, /admin/)
  assert.equal(st.find((x) => x.jid === G3).noWhatsapp, false)
  limparCaches()
  const cheio = sessoesFalsas({ tamanhos: { [G1]: 1000, [G2]: 1024 } })
  assert.equal(await captacao.escolherGrupo({ sessions: cheio }, 'u1', cfg, conf), null)
})

test('WhatsApp desconectado: usa o convite que já tinha; sem nada em cache, null', async () => {
  const cfg = contaPro()
  const conf = { jids: [G1], limite: 1000, modo: 'sequencial' }
  assert.equal(await captacao.escolherGrupo({ sessions: sessoesFalsas({ conectado: false }) }, 'u1', cfg, conf), null)
  const on = sessoesFalsas({ tamanhos: { [G1]: 10 } })
  const url = (await captacao.escolherGrupo({ sessions: on }, 'u1', cfg, conf)).url
  const off = sessoesFalsas({ conectado: false })
  assert.equal((await captacao.escolherGrupo({ sessions: off }, 'u1', cfg, conf)).url, url)
  assert.equal(off.chamadas.inviteLink.length, 0)
})

test('grupo que deixou de ser destino ou virou fonte sai da rotação na hora', async () => {
  const s = sessoesFalsas({ tamanhos: { [G1]: 10, [G2]: 10 } })
  const conf = { jids: [G1, G2], limite: 1000, modo: 'sequencial' }
  const cfg = contaPro({ groups: [{ jid: G2, name: 'Ofertas 2' }] })
  assert.equal((await captacao.escolherGrupo({ sessions: s }, 'u1', cfg, conf)).jid, G2)
  const cfg2 = contaPro({ sources: [{ jid: G1 }] })
  assert.equal((await captacao.escolherGrupo({ sessions: s }, 'u1', cfg2, conf)).jid, G2)
})

// ---------------------------------------------------------------- vitrine

function conversorFalso() {
  const chamadas = []
  const fn = async (texto, ctx) => {
    chamadas.push({ texto, atribuicao: ctx.atribuicao })
    if (/falha/.test(texto)) return { ok: false, trocas: [], erros: [{ motivo: 'x' }] }
    return { ok: true, texto: 'ok', trocas: [{ de: texto, para: 'https://s.shopee.com.br/PAGINA' + chamadas.length, marketplace: 'shopee' }] }
  }
  return { fn, chamadas }
}

test('registrarOferta: só com a vitrine ligada; link próprio com atribuição "pagina"; mesmo produto volta ao topo sem converter de novo', async () => {
  const d = dir()
  const ctx = { userId: 'u1', cfg: contaPro(), dataDir: d }
  const conv = conversorFalso()
  const oferta = { produtoKey: 'shopee:1', nome: 'Air Fryer', texto: '🔥 Air Fryer\n💰 R$ 199,90\nhttps://shopee.com.br/x-i.1.1', imageUrl: 'https://cf.shopee.com.br/a.jpg' }
  assert.equal(await captacao.registrarOferta(ctx, oferta, 'casa', { converterTexto: conv.fn }), null, 'desligada: nada')
  assert.equal(conv.chamadas.length, 0)
  await captacao.salvarVitrine(d, 'u1', { ativo: true })
  const it = await captacao.registrarOferta(ctx, oferta, 'casa', { converterTexto: conv.fn })
  assert.equal(it.preco, 'R$ 199,90')
  assert.equal(it.link, 'https://s.shopee.com.br/PAGINA1')
  assert.deepEqual(conv.chamadas[0].atribuicao, { origem: 'pagina', nicho: 'casa' })
  assert.match(it.id, captacao.ITEM_RE)
  await captacao.registrarOferta(ctx, { produtoKey: 'shopee:2', nome: 'Fone', texto: 'https://shopee.com.br/y-i.1.2' }, 'eletronicos', { converterTexto: conv.fn })
  await captacao.registrarOferta(ctx, oferta, 'casa', { converterTexto: conv.fn })
  assert.equal(conv.chamadas.length, 2, 'produto repetido não converte de novo')
  const db = captacao.carregar(d, 'u1')
  assert.deepEqual(db.itens.map((i) => i.chave), ['shopee:1', 'shopee:2'])
  assert.equal(await captacao.registrarOferta(ctx, { produtoKey: 'k', nome: 'Sem link', texto: 'texto sem link' }, 'geral', { converterTexto: conv.fn }), null)
  assert.equal(await captacao.registrarOferta(ctx, { produtoKey: 'f', nome: 'X', texto: 'https://shopee.com.br/falha-i.1.3' }, 'geral', { converterTexto: conv.fn }), null)
  assert.equal(await captacao.registrarOferta(ctx, { produtoKey: 'h', nome: 'X', texto: 'http://site-estranho.com/a' }, 'geral', { converterTexto: conv.fn }), null)
})

test('vitrine: some depois das horas escolhidas; link só sai para marketplace; remover', async () => {
  const d = dir()
  const ctx = { userId: 'u1', cfg: contaPro(), dataDir: d }
  const conv = conversorFalso()
  await captacao.salvarVitrine(d, 'u1', { ativo: true, horas: 6 })
  const velho = await captacao.registrarOferta(ctx, { produtoKey: 'a', nome: 'Velho', texto: 'https://shopee.com.br/a-i.1.1' }, 'geral', { converterTexto: conv.fn, agora: Date.now() - 7 * 3600000 })
  const novo = await captacao.registrarOferta(ctx, { produtoKey: 'b', nome: 'Novo', texto: 'https://shopee.com.br/b-i.1.2' }, 'geral', { converterTexto: conv.fn })
  const db = captacao.carregar(d, 'u1')
  assert.deepEqual(captacao.visiveis(db).map((i) => i.nome), ['Novo'])
  assert.equal(captacao.linkDoItem(db, velho.id), '', 'vencido não redireciona')
  assert.equal(captacao.linkDoItem(db, novo.id), novo.link)
  assert.equal(captacao.linkDoItem(db, '../x'), '')
  await assert.rejects(() => captacao.removerItem(d, 'u1', 'zz'), /inválida/)
  await captacao.removerItem(d, 'u1', novo.id)
  await assert.rejects(() => captacao.removerItem(d, 'u1', novo.id), /não encontrada/)
})

test('cliques: só contagens por dia; 7 dias no resumo; nada de IP no arquivo', async () => {
  const d = dir()
  captacao.contarClique('u1', 'g', G1)
  captacao.contarClique('u1', 'g', G1)
  captacao.contarClique('u1', 'v', 'abcdef0123')
  captacao.contarClique('u1', 'x', 'ignorado')
  await captacao.gravarCliques(d)
  const db = captacao.carregar(d, 'u1')
  const r = captacao.resumoCliques(db, 7)
  assert.equal(r.porGrupo[G1], 2)
  assert.equal(r.porItem.abcdef0123, 1)
  assert.equal(r.porDia.length, 7)
  assert.equal(r.porDia[6].grupos, 2)
  assert.doesNotMatch(fs.readFileSync(path.join(d, 'captacao', 'u1.json'), 'utf8'), /127\.0\.0\.1|::1|ip/i)
})

test('HTML: escapa tudo que vem da oferta e do cliente', () => {
  const html = paginas.vitrine({ titulo: '<script>alert(1)</script>', descricao: '"x"', itens: [{ id: 'abcdef0123', nome: '<img src=x onerror=alert(1)>', preco: 'R$ 1', imageUrl: 'https://a.com/"onerror="x', marketplace: 'shopee' }], irHref: (id) => '/v/s/ir/' + id, grupoHref: '' })
  assert.doesNotMatch(html, /<script>|<img src=x/)
  assert.match(html, /&lt;script&gt;/)
  assert.match(html, /&quot;onerror=&quot;/)
  assert.match(html, /link.* de afiliado|links são de afiliado/)
})

// ---------------------------------------------------------------- rotas públicas (express de verdade)

async function servidor({ cfg, sessions, opcoes = {} } = {}) {
  const d = dir()
  const CONFIGS = path.join(d, 'configs.json')
  fs.writeFileSync(CONFIGS, JSON.stringify({ u1: cfg || contaPro() }))
  const readJson = (f, padrao) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return padrao } }
  const app = express()
  app.use(express.json())
  const auth = (req, res, next) => { req.user = { id: 'u1' }; next() }
  captacaoRoutes.mount(app, { auth, readJson, CONFIGS, DATA: d, sessions: sessions || sessoesFalsas({ tamanhos: { [G1]: 10 } }), logs: null }, Object.assign({ timer: false }, opcoes))
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)) })
  const base = 'http://127.0.0.1:' + srv.address().port
  const ir = (p, init) => fetch(base + p, Object.assign({ redirect: 'manual' }, init))
  const post = (p, body) => ir(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }))
  return { d, CONFIGS, ir, post, fechar: () => new Promise((r) => srv.close(r)) }
}

test('público: link de grupos desligado = 404; ligado = página + 302 para o convite e conta o clique', async () => {
  const s = await servidor()
  try {
    const est = await s.post('/captacao/grupos', { ativo: false, jids: [G1] })
    assert.equal(est.status, 200)
    const slug = est.body.slug
    assert.equal((await s.ir('/g/' + slug)).status, 404)
    await s.post('/captacao/grupos', { ativo: true, titulo: 'Achadinhos', jids: [G1] })
    const pag = await s.ir('/g/' + slug)
    assert.equal(pag.status, 200)
    assert.match(pag.headers.get('content-security-policy'), /default-src 'none'/)
    assert.equal(pag.headers.get('x-frame-options'), 'DENY')
    const html = await pag.text()
    assert.match(html, /Achadinhos/)
    assert.match(html, /\/g\/[a-z0-9]{10}\/entrar/)
    const r = await s.ir('/g/' + slug + '/entrar')
    assert.equal(r.status, 302)
    assert.match(r.headers.get('location'), captacao.CONVITE_RE)
    await captacao.gravarCliques(s.d)
    const painel = await (await s.ir('/captacao')).json()
    assert.equal(painel.cliques.porGrupo[G1], 1)
    assert.equal(painel.local, true, 'endereço local avisado')
    assert.match(painel.urls.grupos, /\/g\/[a-z0-9]{10}$/)
    assert.equal((await s.ir('/g/aaaaaaaaaa')).status, 404, 'slug que não existe')
    assert.equal((await s.ir('/g/..%2F..%2Fetc')).status, 404)
  } finally { await s.fechar() }
})

test('público: licença vencida ou plano Start = página some', async () => {
  for (const license of [{ plan: 'pro_mensal', tier: 'pro', active: true, expiresAt: '2020-01-01T00:00:00Z' }, { plan: 'start_mensal', tier: 'start', active: true, expiresAt: exp() }]) {
    const s = await servidor({ cfg: contaPro({ license }) })
    try {
      const est = await s.post('/captacao/grupos', { ativo: true, jids: [G1] })
      assert.equal((await s.ir('/g/' + est.body.slug)).status, 404)
    } finally { await s.fechar() }
  }
})

test('público: sem grupo com vaga = 503 sem redirecionar', async () => {
  const s = await servidor({ sessions: sessoesFalsas({ tamanhos: { [G1]: 1024 } }) })
  try {
    const est = await s.post('/captacao/grupos', { ativo: true, jids: [G1], limite: 1024 })
    const r = await s.ir('/g/' + est.body.slug + '/entrar')
    assert.equal(r.status, 503)
    assert.equal(r.headers.get('location'), null)
    assert.match(await r.text(), /cheios ou indisponíveis/)
  } finally { await s.fechar() }
})

test('público: vitrine lista as ofertas e /ir leva só ao link guardado', async () => {
  const s = await servidor()
  try {
    const est = await s.post('/captacao/vitrine', { ativo: true, titulo: 'Ofertas da Ana' })
    const conv = conversorFalso()
    const it = await captacao.registrarOferta({ userId: 'u1', cfg: contaPro(), dataDir: s.d }, { produtoKey: 'shopee:9', nome: 'Panela <b>', texto: 'R$ 50,00 https://shopee.com.br/p-i.1.9', imageUrl: 'https://cf.shopee.com.br/p.jpg' }, 'casa', { converterTexto: conv.fn })
    const html = await (await s.ir('/v/' + est.body.slug)).text()
    assert.match(html, /Ofertas da Ana/)
    assert.match(html, /Panela b/, 'nome já chega limpo (sem < >)')
    assert.doesNotMatch(html, /Panela <b>/)
    assert.match(html, /R\$ 50,00/)
    assert.doesNotMatch(html, /s\.shopee\.com\.br\/PAGINA/, 'o link direto não aparece na página: passa pelo /ir')
    const r = await s.ir('/v/' + est.body.slug + '/ir/' + it.id)
    assert.equal(r.status, 302)
    assert.equal(r.headers.get('location'), it.link)
    assert.equal((await s.ir('/v/' + est.body.slug + '/ir/0000000000')).status, 404)
    const painel = await s.post('/captacao/vitrine/remover', { id: it.id })
    assert.equal(painel.body.itens.length, 0)
  } finally { await s.fechar() }
})

test('público: muitos acessos seguidos do mesmo endereço = 429', async () => {
  const s = await servidor({ opcoes: { visitasPorMin: 3 } })
  try {
    const est = await s.post('/captacao/grupos', { ativo: true, jids: [G1] })
    const codigos = []
    for (let i = 0; i < 5; i++) codigos.push((await s.ir('/g/' + est.body.slug)).status)
    assert.deepEqual(codigos, [200, 200, 200, 429, 429])
  } finally { await s.fechar() }
})

test('painel: validações, trocar endereço exige confirmação, testar diz o grupo escolhido', async () => {
  const s = await servidor({ sessions: sessoesFalsas({ tamanhos: { [G1]: 10, [G2]: 3 } }) })
  try {
    assert.equal((await s.post('/captacao/grupos', { ativo: true, jids: [FONTE] })).status, 400)
    assert.equal((await s.post('/captacao/testar', {})).status, 400, 'sem grupos')
    const est = await s.post('/captacao/grupos', { ativo: true, jids: [G1, G2], modo: 'equilibrado' })
    const t = await s.post('/captacao/testar', {})
    assert.equal(t.body.ok, true)
    assert.equal(t.body.grupo.jid, G2)
    assert.equal(t.body.status.length, 2)
    assert.equal((await s.post('/captacao/endereco', {})).status, 400)
    const trocado = await s.post('/captacao/endereco', { confirmo: true })
    assert.notEqual(trocado.body.slug, est.body.slug)
    assert.equal((await s.ir('/g/' + est.body.slug)).status, 404, 'endereço antigo morreu')
    assert.equal((await s.ir('/g/' + trocado.body.slug)).status, 200)
    assert.deepEqual(trocado.body.destinos.map((g) => g.jid), [G1, G2, G3], 'fonte não aparece como opção')
  } finally { await s.fechar() }
})
