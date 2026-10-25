const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

// A chave mestra do cofre vem do ambiente; nos testes e uma qualquer com 32+ caracteres
const MESTRA = 'chave-mestra-so-para-teste-0123456789abcdef'
process.env.SAAS_MASTER_KEY = MESTRA

const links = require('./links')
const ofertas = require('../ofertas')
const cofre = require('./cofre')
const copy = require('./copy')
const copyRoutes = require('./copyRoutes')
const publicador = require('./publicador')
const vitrine = require('./vitrine')
const auditoria = require('./auditoria')

ofertas.encurtar = async (appId, secret, url) => 'https://s.shopee.com.br/AFIL' + url.replace(/\D/g, '').slice(-4)
links.validarAoVivo = async () => ({ ok: true, motivo: '' })

const OF = copy.OFERTA_EXEMPLO
const BOM = '🎧 Fone de Ouvido Bluetooth TWS com cancelamento de ruído por apenas R$ 39,90!\n🔥 45% off, nota 4.8 e 12.300 vendas.'

function dir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'namy-copy-'))
}

// fetch falso: devolve o corpo no formato do provedor e guarda o que recebeu
function fakeFetch(resposta, { status = 200, falha = null } = {}) {
  const chamadas = []
  const f = async (url, init) => {
    const body = JSON.parse(init.body)
    chamadas.push({ url, init, body })
    if (falha) throw falha
    return { ok: status < 400, status, json: async () => (typeof resposta === 'function' ? resposta(url, body) : resposta) }
  }
  f.chamadas = chamadas
  return f
}
const openai = (texto) => ({ choices: [{ message: { content: texto } }] })

// ---------------------------------------------------------------- modelo com variaveis

test('validarModelo: aceita modelo bom e recusa o que nao pode', () => {
  assert.equal(copy.validarModelo('Oferta: {nome} por {preco}\n{link}'), '')
  assert.match(copy.validarModelo(''), /Escreva/)
  assert.match(copy.validarModelo('   '), /Escreva/)
  assert.match(copy.validarModelo(42), /Escreva/)
  assert.match(copy.validarModelo('x'.repeat(1001) + '{link}'), /grande demais/)
  assert.match(copy.validarModelo('{nome} sem link'), /precisa ter \{link\}/)
  assert.match(copy.validarModelo('{nome} {cupom} {link}'), /Variavel desconhecida: \{cupom\}/)
  assert.match(copy.validarModelo('{link} {} '), /Variavel desconhecida/)
  assert.match(copy.validarModelo('{link} sobrou { aqui'), /Chaves/)
  assert.match(copy.validarModelo('{link} sobrou } aqui'), /Chaves/)
})

test('aplicarModelo: troca as variaveis, formata as vendas e some com linha de variavel vazia', () => {
  const m = '🔥 {nome}\n💰 {preco}\n📉 {desconto}\n⭐ {nota}\n🛒 {vendas}\n🏪 {loja}\nCompre: {link}'
  assert.equal(copy.aplicarModelo(m, OF), '🔥 Fone de Ouvido Bluetooth TWS com Cancelamento de Ruido\n💰 R$ 39,90\n📉 45% off\n⭐ 4.8\n🛒 12.300 vendas\n🏪 Loja Oficial Audio\nCompre: https://s.shopee.com.br/exemplo')
  // sem desconto, sem nota, sem vendas e sem loja: essas linhas somem, as fixas ficam
  const pobre = { nome: 'Capa', preco: 'R$ 5,00', link: 'https://s.shopee.com.br/x' }
  assert.equal(copy.aplicarModelo(m, pobre), '🔥 Capa\n💰 R$ 5,00\nCompre: https://s.shopee.com.br/x')
  // linha mista: so some se TODAS as variaveis dela estao vazias
  assert.equal(copy.aplicarModelo('{nome} - {loja}\n{link}', pobre), 'Capa - \nhttps://s.shopee.com.br/x')
  // texto fixo sem variavel nunca some e linhas em branco em excesso se juntam
  assert.equal(copy.aplicarModelo('Oi!\n\n\n\n{nome}\n{link}', pobre), 'Oi!\n\nCapa\nhttps://s.shopee.com.br/x')
  assert.ok(copy.aplicarModelo('{nome}'.repeat(1000), { nome: 'abcdef' }).length <= 3500)
})

test('o modelo sugerido na tela reproduz EXATAMENTE o texto padrao de hoje', () => {
  const sugerido = copyRoutes.MODELO_SUGERIDO
  assert.equal(copy.validarModelo(sugerido), '')
  assert.equal(copy.aplicarModelo(sugerido, OF), ofertas.mensagem(OF))
  const semDesconto = Object.assign({}, OF, { desconto: null, ratingStar: '', shopName: '' })
  assert.equal(copy.aplicarModelo(sugerido, semDesconto), ofertas.mensagem(semDesconto))
})

test('numero: le o formato brasileiro sem confundir milhar com decimal', () => {
  assert.equal(copy.numero('39,90'), 39.9)
  assert.equal(copy.numero('12.300'), 12300)
  assert.equal(copy.numero('4.8'), 4.8)
  assert.equal(copy.numero('1.234,56'), 1234.56)
  assert.equal(copy.numero('45'), 45)
  assert.equal(copy.numero('1.000.000'), 1000000)
})

// ---------------------------------------------------------------- a trava

test('trava: texto bom passa', () => {
  assert.deepEqual(copy.validarIA(BOM, OF), { ok: true, motivo: '' })
  // numero que faz parte do nome e valido (500ml)
  const garrafa = { nome: 'Garrafa Termica 500ml Inox', preco: 'R$ 29,90', desconto: 10, ratingStar: '4.7', sales: 800, shopName: 'Casa' }
  assert.equal(copy.validarIA('🥤 Garrafa Termica 500ml em inox por R$ 29,90! 10% off e nota 4.7.', garrafa).ok, true)
})

test('trava: reprova preco inventado, % inventado, vendas abreviadas e numero solto', () => {
  const r = (texto) => copy.validarIA(texto, OF)
  assert.match(r('🎧 Fone TWS por R$ 21,95 hoje! Cancelamento de ruído. Imperdível').motivo, /numero inventado: 21.95/)
  assert.match(r('🎧 Fone TWS por R$ 39,90 com 60% off! Cancelamento de ruído').motivo, /numero inventado: 60/)
  assert.match(r('🎧 Fone TWS por R$ 39,90 com +12k vendidos! Cancelamento de ruído').motivo, /abreviado/)
  assert.match(r('🎧 Fone TWS por R$ 39,90, mais de 12 mil vendidos! Cancelamento de ruído').motivo, /abreviado/)
  assert.match(r('🎧 Fone TWS 2 em 1 por R$ 39,90! Cancelamento de ruído 🔥').motivo, /numero inventado: 2/)
})

test('trava: reprova quando falta o preco, quando nao fala do produto e quando e curto ou longo demais', () => {
  const r = (texto) => copy.validarIA(texto, OF)
  assert.match(r('🎧 Fone de Ouvido com cancelamento de ruído, 45% off e nota 4.8!').motivo, /faltou o preco/)
  assert.match(r('🔥 Aproveite essa oferta incrivel por R$ 39,90 e 45% off agora mesmo!').motivo, /nao fala do produto/)
  assert.match(r('Fone R$ 39,90').motivo, /curto/)
  assert.match(r('').motivo, /curto/)
  assert.match(r(('🎧 Fone de Ouvido por R$ 39,90 ').repeat(40)).motivo, /longo/)
  assert.match(r(['🎧 Fone', 'linha 2', 'linha 3', 'linha 4', 'linha 5', 'linha 6', 'linha 7', 'linha 8', 'linha 9 R$ 39,90 fone'].join('\n')).motivo, /linhas demais/)
})

test('trava: reprova link e promessa de cupom, frete, estoque e prazo que os dados nao tem', () => {
  const r = (texto) => copy.validarIA(texto, OF)
  assert.match(r('🎧 Fone de Ouvido por R$ 39,90! Compre em https://s.shopee.com.br/x').motivo, /link/)
  assert.match(r('🎧 Fone de Ouvido por R$ 39,90! Veja shopee.com.br/oferta agora').motivo, /link/)
  assert.match(r('🎧 Fone de Ouvido por R$ 39,90! Use o cupom DESCONTO e economize').motivo, /promessa.*cupom/)
  assert.match(r('🎧 Fone de Ouvido por R$ 39,90 com frete grátis para todo o Brasil').motivo, /promessa.*frete/)
  assert.match(r('🎧 Fone de Ouvido por R$ 39,90! Últimas unidades em estoque, corra').motivo, /promessa/)
  assert.match(r('🎧 Fone de Ouvido por R$ 39,90 com garantia de 1 ano').motivo, /garantia|inventado/)
  // se o nome do produto ja diz "garantia", a palavra e dado real e passa
  const comGarantia = Object.assign({}, OF, { nome: 'Fone Bluetooth com Garantia Estendida' })
  assert.equal(copy.validarIA('🎧 Fone Bluetooth com garantia estendida por R$ 39,90! 45% off', comGarantia).ok, true)
})

test('limparSaida: tira raciocinio, cercas de codigo, aspas e prefixo', () => {
  assert.equal(copy.limparSaida('<think>pensando...\nmais</think>\nOla'), 'Ola')
  assert.equal(copy.limparSaida('```\nFone legal\n```'), 'Fone legal')
  assert.equal(copy.limparSaida('"Fone legal"'), 'Fone legal')
  assert.equal(copy.limparSaida('Mensagem: Fone legal'), 'Fone legal')
  assert.equal(copy.limparSaida(null), '')
})

test('o prompt leva so os dados reais e nenhum link', () => {
  const p = copy.promptDe(OF)
  assert.match(p.usuario, /nome: Fone de Ouvido/)
  assert.match(p.usuario, /preco: R\$ 39,90/)
  assert.match(p.usuario, /vendas: 12\.300 vendas/)
  assert.equal(/https?:|shopee\.com|exemplo/.test(p.usuario + p.sistema), false, 'o link nao vai para a IA')
  assert.match(p.sistema, /NAO invente/)
  const pobre = copy.promptDe({ nome: 'Capa', preco: 'R$ 5,00', link: 'x' })
  assert.equal(/desconto|nota|loja|vendas/.test(pobre.usuario), false, 'campo vazio nao entra no prompt')
})

// ---------------------------------------------------------------- provedores (formato da chamada)

test('provedores: URL, cabecalho e corpo de cada um; a chave so vai no cabecalho', async () => {
  const CH = 'chave-secreta-do-cliente-123456'
  let f = fakeFetch(openai('oi'))
  assert.equal(await copy.chamarProvedor('groq', CH, OF, { fetch: f }), 'oi')
  assert.equal(f.chamadas[0].url, 'https://api.groq.com/openai/v1/chat/completions')
  assert.equal(f.chamadas[0].init.headers.Authorization, 'Bearer ' + CH)
  assert.equal(f.chamadas[0].body.messages[0].role, 'system')
  assert.equal(f.chamadas[0].body.messages[1].role, 'user')
  assert.equal(JSON.stringify(f.chamadas[0].body).includes(CH), false, 'a chave nao vai no corpo')

  f = fakeFetch(openai('oi'))
  await copy.chamarProvedor('xai', CH, OF, { fetch: f })
  assert.equal(f.chamadas[0].url, 'https://api.x.ai/v1/chat/completions')

  f = fakeFetch({ candidates: [{ content: { parts: [{ text: 'ola ' }, { text: 'mundo' }] } }] })
  assert.equal(await copy.chamarProvedor('gemini', CH, OF, { fetch: f }), 'ola mundo')
  assert.match(f.chamadas[0].url, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/.+:generateContent$/)
  assert.equal(f.chamadas[0].init.headers['x-goog-api-key'], CH)
  assert.equal(f.chamadas[0].url.includes(CH), false, 'a chave nao vai na URL')
  assert.ok(f.chamadas[0].body.systemInstruction && f.chamadas[0].body.contents[0].role === 'user')

  process.env.NAMY_OLLAMA_URL = 'http://127.0.0.1:11434/'
  f = fakeFetch({ response: 'texto local' })
  assert.equal(await copy.chamarProvedor('ollama', '', OF, { fetch: f }), 'texto local')
  assert.equal(f.chamadas[0].url, 'http://127.0.0.1:11434/api/generate')
  assert.equal(f.chamadas[0].body.think, false)
  assert.equal(f.chamadas[0].body.stream, false)
  assert.equal(f.chamadas[0].init.headers.Authorization, undefined)
})

test('provedores: erro nunca carrega a chave; timeout e resposta vazia viram erro claro', async () => {
  const CH = 'chave-secreta-do-cliente-123456'
  await assert.rejects(() => copy.chamarProvedor('groq', CH, OF, { fetch: fakeFetch({}, { status: 401 }) }), (e) => /respondeu 401/.test(e.message) && !e.message.includes(CH))
  await assert.rejects(() => copy.chamarProvedor('groq', CH, OF, { fetch: fakeFetch({}, { falha: new Error('falha de rede usando ' + CH) }) }), (e) => !e.message.includes(CH) && /\*\*\*/.test(e.message))
  const abort = Object.assign(new Error('abortado'), { name: 'AbortError' })
  await assert.rejects(() => copy.chamarProvedor('groq', CH, OF, { fetch: fakeFetch({}, { falha: abort }) }), /tempo esgotado/)
  await assert.rejects(() => copy.chamarProvedor('groq', CH, OF, { fetch: fakeFetch(openai('')) }), /vazia/)
  await assert.rejects(() => copy.chamarProvedor('inventado', CH, OF, {}), /desconhecido/)
})

// ---------------------------------------------------------------- gerar()

async function ctxCom({ copyCfg, chaves, email = 'dono@exemplo.com' } = {}) {
  const dataDir = dir()
  const userId = 'u' + Math.random().toString(36).slice(2, 8)
  if (chaves) await cofre.gravar(dataDir, userId, 'ia', chaves)
  return { userId, dataDir, cfg: { email, copy: copyCfg } }
}

test('gerar: sem configuracao devolve o texto padrao SEM chamar nada (e respeita o texto que ja existia)', async () => {
  const f = fakeFetch(openai('nao deveria chamar'))
  const ctx = await ctxCom({})
  let r = await copy.gerar(ctx, OF, { fetch: f })
  assert.equal(r.texto, ofertas.mensagem(OF))
  assert.equal(r.via, 'modelo')
  assert.equal(r.aviso, '')
  r = await copy.gerar(ctx, OF, { fetch: f, padrao: 'texto que a busca ja montou' })
  assert.equal(r.texto, 'texto que a busca ja montou')
  assert.equal(f.chamadas.length, 0)
})

test('gerar: modelo do cliente vale, e um modelo invalido guardado no arquivo e ignorado (volta ao padrao)', async () => {
  const ok = await ctxCom({ copyCfg: { modelo: 'Promo: {nome} por {preco}\n{link}' } })
  assert.equal((await copy.gerar(ok, OF, { padrao: 'padrao' })).texto, 'Promo: Fone de Ouvido Bluetooth TWS com Cancelamento de Ruido por R$ 39,90\nhttps://s.shopee.com.br/exemplo')
  const ruim = await ctxCom({ copyCfg: { modelo: 'sem link nenhum' } })
  assert.equal((await copy.gerar(ruim, OF, { padrao: 'padrao' })).texto, 'padrao')
})

test('gerar com IA: texto aprovado pela trava, link acrescentado por nos e prompt sem link', async () => {
  const ctx = await ctxCom({ copyCfg: { ia: { ativo: true, provedor: 'groq' } }, chaves: { groq: 'gsk_chave-de-teste-do-cliente-0001' } })
  const f = fakeFetch(openai(BOM))
  const r = await copy.gerar(ctx, OF, { fetch: f })
  assert.equal(r.via, 'ia:groq')
  assert.equal(r.aviso, 'copy: IA Groq')
  assert.equal(r.texto, BOM + '\n\n🔗 https://s.shopee.com.br/exemplo')
  assert.equal((r.texto.match(/https:/g) || []).length, 1, 'link so uma vez')
  assert.equal(f.chamadas[0].init.headers.Authorization, 'Bearer gsk_chave-de-teste-do-cliente-0001')
  assert.equal(JSON.stringify(f.chamadas[0].body).includes('s.shopee.com.br'), false)
})

test('gerar com IA: se a trava reprova, falha, estoura o tempo ou falta a chave, volta ao modelo com o motivo', async () => {
  const base = ofertas.mensagem(OF)
  const cfgIA = { ia: { ativo: true, provedor: 'groq' } }
  const chaves = { groq: 'gsk_chave-de-teste-do-cliente-0001' }

  let r = await copy.gerar(await ctxCom({ copyCfg: cfgIA, chaves }), OF, { fetch: fakeFetch(openai('🎧 Fone TWS por R$ 21,95! Cancelamento de ruído')) })
  assert.equal(r.texto, base)
  assert.equal(r.via, 'modelo')
  assert.match(r.aviso, /IA reprovada: numero inventado: 21.95/)

  r = await copy.gerar(await ctxCom({ copyCfg: cfgIA, chaves }), OF, { fetch: fakeFetch({}, { status: 500 }) })
  assert.equal(r.texto, base)
  assert.match(r.aviso, /IA indisponivel: o provedor respondeu 500/)

  r = await copy.gerar(await ctxCom({ copyCfg: cfgIA, chaves }), OF, { fetch: fakeFetch({}, { falha: Object.assign(new Error('x'), { name: 'AbortError' }) }) })
  assert.match(r.aviso, /tempo esgotado/)

  const f = fakeFetch(openai(BOM))
  r = await copy.gerar(await ctxCom({ copyCfg: cfgIA }), OF, { fetch: f })
  assert.equal(r.texto, base)
  assert.match(r.aviso, /sem chave salva/)
  assert.equal(f.chamadas.length, 0, 'sem chave nem tenta')

  r = await copy.gerar(await ctxCom({ copyCfg: { ia: { ativo: true, provedor: 'inventado' } }, chaves }), OF, { fetch: f })
  assert.match(r.aviso, /provedor invalido/)

  // IA desligada ou desligada na hora (salvar na fila) nunca chama
  r = await copy.gerar(await ctxCom({ copyCfg: { ia: { ativo: false, provedor: 'groq' } }, chaves }), OF, { fetch: f })
  assert.equal(r.via, 'modelo')
  r = await copy.gerar(await ctxCom({ copyCfg: cfgIA, chaves }), OF, { fetch: f, ia: false })
  assert.equal(r.via, 'modelo')
  assert.equal(f.chamadas.length, 0)
})

test('Ollama: so a conta liberada pelo dono usa, e as geracoes entram numa fila de uma por vez', async () => {
  process.env.NAMY_OLLAMA_URL = 'http://127.0.0.1:11434'
  process.env.NAMY_OLLAMA_EMAILS = 'dono@exemplo.com, outro@exemplo.com'
  const cfgIA = { ia: { ativo: true, provedor: 'ollama' } }
  const intruso = await ctxCom({ copyCfg: cfgIA, email: 'cliente@exemplo.com' })
  const f0 = fakeFetch({ response: BOM })
  const r0 = await copy.gerar(intruso, OF, { fetch: f0 })
  assert.equal(r0.via, 'modelo')
  assert.match(r0.aviso, /nao liberada/)
  assert.equal(f0.chamadas.length, 0)
  assert.equal(copy.ollamaPermitido({ email: 'DONO@exemplo.com' }), true, 'e-mail sem diferenciar maiusculas')

  let simultaneas = 0
  let maximo = 0
  const lento = async (url, init) => {
    simultaneas++; maximo = Math.max(maximo, simultaneas)
    await new Promise((r) => setTimeout(r, 25))
    simultaneas--
    return { ok: true, status: 200, json: async () => ({ response: BOM }) }
  }
  const a = await ctxCom({ copyCfg: cfgIA })
  const b = await ctxCom({ copyCfg: cfgIA })
  const [ra, rb] = await Promise.all([copy.gerar(a, OF, { fetch: lento }), copy.gerar(b, OF, { fetch: lento })])
  assert.equal(ra.via, 'ia:ollama')
  assert.equal(rb.via, 'ia:ollama')
  assert.equal(maximo, 1, 'nunca duas geracoes ao mesmo tempo no Ollama')

  delete process.env.NAMY_OLLAMA_EMAILS
  assert.equal(copy.ollamaPermitido({ email: 'dono@exemplo.com' }), false, 'lista vazia = ninguem')
  delete process.env.NAMY_OLLAMA_URL
  assert.equal(copy.ollamaPermitido({ email: 'dono@exemplo.com' }), false)
})

// ---------------------------------------------------------------- rotas

function ambiente(extra = {}) {
  const dataDir = dir()
  const CONFIGS = path.join(dataDir, 'configs.json')
  const base = (email) => ({
    email,
    license: { active: true, expiresAt: new Date(Date.now() + 864e5).toISOString() },
    shopee: { appId: 'APP', secret: 'SEC' },
    groups: [{ jid: 'g@g.us', name: 'G', niche: 'geral' }],
    ads: { source: 'api' }
  })
  fs.writeFileSync(CONFIGS, JSON.stringify({ u1: Object.assign(base('u1@exemplo.com'), extra), u2: base('u2@exemplo.com') }))
  const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return d } }
  const writeJson = (f, d) => fs.writeFileSync(f, JSON.stringify(d))
  return { dataDir, CONFIGS, readJson, writeJson, cfg: (u) => readJson(CONFIGS, {})[u] }
}

function rotasDe(a, opcoes = {}) {
  const rotas = {}
  const app = {
    get: (p, ...h) => { rotas['GET ' + p] = h[h.length - 1] },
    put: (p, ...h) => { rotas['PUT ' + p] = h[h.length - 1] },
    post: (p, ...h) => { rotas['POST ' + p] = h[h.length - 1] }
  }
  copyRoutes.mount(app, { auth: () => {}, readJson: a.readJson, writeJson: a.writeJson, CONFIGS: a.CONFIGS, DATA: a.dataDir }, opcoes)
  return async (metodo, caminho, userId, body) => {
    const res = { code: 200, body: null, status(c) { this.code = c; return this }, json(b) { this.body = b; return this } }
    await rotas[metodo + ' ' + caminho]({ user: { id: userId }, body }, res)
    return res
  }
}

const CHAVE = 'gsk_AbCdEfGhIjKlMnOpQrStUv123456'

test('rotas: GET devolve o padrao, sem Ollama para o cliente comum e sem nenhuma chave', async () => {
  const a = ambiente()
  const chamar = rotasDe(a)
  const r = await chamar('GET', '/copy/config', 'u1')
  assert.equal(r.code, 200)
  assert.equal(r.body.modelo, '')
  assert.equal(r.body.modeloSugerido, copyRoutes.MODELO_SUGERIDO)
  assert.deepEqual(r.body.variaveis, copy.VARIAVEIS)
  assert.deepEqual(r.body.ia, { ativo: false, provedor: 'groq' })
  assert.deepEqual(r.body.provedores.map((p) => p.id), ['groq', 'xai', 'gemini'])
  assert.ok(r.body.provedores.every((p) => p.temChave === false))
  assert.equal(r.body.cofreDisponivel, true)
  assert.equal(r.body.exemplo, ofertas.mensagem(OF))
  assert.equal((await chamar('GET', '/copy/config', 'nao-existe')).code, 404)
})

test('rotas: salvar e restaurar o modelo; modelo invalido e recusado e nada muda', async () => {
  const a = ambiente()
  const chamar = rotasDe(a)
  let r = await chamar('PUT', '/copy/config', 'u1', { modelo: 'Promo {nome}\n{preco}\n{link}' })
  assert.equal(r.code, 200)
  assert.equal(a.cfg('u1').copy.modelo, 'Promo {nome}\n{preco}\n{link}')
  assert.match(r.body.exemplo, /^Promo Fone de Ouvido/)
  r = await chamar('PUT', '/copy/config', 'u1', { modelo: 'sem link' })
  assert.equal(r.code, 400)
  assert.match(r.body.error, /\{link\}/)
  r = await chamar('PUT', '/copy/config', 'u1', { modelo: '{nome} {preco} {cupom} {link}' })
  assert.equal(r.code, 400)
  assert.equal(a.cfg('u1').copy.modelo, 'Promo {nome}\n{preco}\n{link}', 'recusado nao altera')
  r = await chamar('PUT', '/copy/config', 'u1', { modelo: '' })
  assert.equal(a.cfg('u1').copy.modelo, undefined, 'vazio restaura o padrao')
  assert.equal((await chamar('GET', '/copy/config', 'u2')).body.modelo, '', 'o outro cliente nao foi afetado')
})

test('rotas: a chave e guardada CIFRADA, volta so mascarada e nunca aparece em resposta nenhuma', async () => {
  const a = ambiente()
  const chamar = rotasDe(a)
  const todas = []
  const guarda = (r) => { todas.push(JSON.stringify(r.body)); return r }
  let r = guarda(await chamar('POST', '/copy/chave', 'u1', { provedor: 'groq', chave: CHAVE }))
  assert.equal(r.code, 200)
  assert.equal(r.body.mascara, 'gsk_…3456')
  r = guarda(await chamar('GET', '/copy/config', 'u1'))
  const g = r.body.provedores.find((p) => p.id === 'groq')
  assert.equal(g.temChave, true)
  assert.equal(g.mascara, 'gsk_…3456')
  assert.equal(r.body.provedores.find((p) => p.id === 'gemini').temChave, false)
  // no disco: cifrado, sem o texto da chave e sem pedaco reconhecivel
  const arquivos = fs.readdirSync(path.join(a.dataDir, 'marketplaces'))
  const bruto = fs.readFileSync(path.join(a.dataDir, 'marketplaces', arquivos[0]), 'utf8')
  assert.equal(bruto.includes(CHAVE), false)
  assert.equal(bruto.includes('AbCdEfGhIj'), false)
  assert.match(bruto, /v1:/)
  assert.equal(cofre.ler(a.dataDir, 'u1', 'ia').groq, CHAVE, 'o servidor consegue abrir de volta')
  // a configuracao comum (configs.json) nunca ve a chave
  assert.equal(fs.readFileSync(a.CONFIGS, 'utf8').includes(CHAVE), false)
  assert.equal(todas.some((t) => t.includes(CHAVE)), false)
  // o outro cliente nao enxerga
  assert.equal((await chamar('GET', '/copy/config', 'u2')).body.provedores.find((p) => p.id === 'groq').temChave, false)
})

test('rotas: chave invalida, provedor invalido e servidor sem chave mestra', async () => {
  const a = ambiente()
  const chamar = rotasDe(a)
  for (const body of [
    { provedor: 'inventado', chave: CHAVE }, { provedor: 'ollama', chave: CHAVE }, { provedor: 123, chave: CHAVE }, { chave: CHAVE },
    { provedor: 'groq', chave: 'curta' }, { provedor: 'groq', chave: 'tem espaco no meio da chave 12345' },
    { provedor: 'groq', chave: 'x'.repeat(201) }, { provedor: 'groq', chave: { $ne: 1 } }, { provedor: 'groq' }
  ]) {
    assert.equal((await chamar('POST', '/copy/chave', 'u1', body)).code, 400, JSON.stringify(body).slice(0, 60))
  }
  assert.equal(fs.existsSync(path.join(a.dataDir, 'marketplaces')), false, 'nada foi gravado')
  delete process.env.SAAS_MASTER_KEY
  try {
    const r = await chamar('POST', '/copy/chave', 'u1', { provedor: 'groq', chave: CHAVE })
    assert.equal(r.code, 503)
    assert.match(r.body.error, /chave mestra/)
    assert.equal((await chamar('GET', '/copy/config', 'u1')).body.cofreDisponivel, false)
  } finally { process.env.SAAS_MASTER_KEY = MESTRA }
})

test('rotas: so liga a IA com chave salva; remover a chave desliga a IA que dependia dela', async () => {
  const a = ambiente()
  const chamar = rotasDe(a)
  assert.equal((await chamar('PUT', '/copy/config', 'u1', { ia: { ativo: true, provedor: 'groq' } })).code, 400, 'sem chave nao liga')
  assert.equal((await chamar('PUT', '/copy/config', 'u1', { ia: { ativo: true, provedor: 'ollama' } })).code, 400, 'Ollama nao liberado para este cliente')
  assert.equal((await chamar('PUT', '/copy/config', 'u1', { ia: { ativo: true, provedor: 'inventado' } })).code, 400)
  assert.equal((await chamar('PUT', '/copy/config', 'u1', { ia: { ativo: 'sim', provedor: 'groq' } })).code, 400)
  assert.equal((await chamar('PUT', '/copy/config', 'u1', { ia: 'ligada' })).code, 400)
  await chamar('POST', '/copy/chave', 'u1', { provedor: 'groq', chave: CHAVE })
  let r = await chamar('PUT', '/copy/config', 'u1', { ia: { ativo: true, provedor: 'groq' } })
  assert.equal(r.code, 200)
  assert.deepEqual(r.body.ia, { ativo: true, provedor: 'groq' })
  r = await chamar('POST', '/copy/chave/remover', 'u1', { provedor: 'groq' })
  assert.equal(r.code, 200)
  assert.equal(r.body.ia.ativo, false, 'IA desligada junto com a chave')
  assert.equal(r.body.provedores.find((p) => p.id === 'groq').temChave, false)
  assert.deepEqual(cofre.ler(a.dataDir, 'u1', 'ia'), {}, 'cofre vazio depois de remover a ultima chave')
  assert.equal((await chamar('POST', '/copy/chave/remover', 'u1', { provedor: 'inventado' })).code, 400)
})

test('rotas: Ollama aparece e liga so para a conta liberada pelo dono', async () => {
  process.env.NAMY_OLLAMA_URL = 'http://127.0.0.1:11434'
  process.env.NAMY_OLLAMA_EMAILS = 'u1@exemplo.com'
  try {
    const a = ambiente()
    const chamar = rotasDe(a)
    assert.ok((await chamar('GET', '/copy/config', 'u1')).body.provedores.some((p) => p.id === 'ollama'))
    assert.equal((await chamar('GET', '/copy/config', 'u2')).body.provedores.some((p) => p.id === 'ollama'), false)
    assert.equal((await chamar('PUT', '/copy/config', 'u1', { ia: { ativo: true, provedor: 'ollama' } })).code, 200)
    assert.equal((await chamar('PUT', '/copy/config', 'u2', { ia: { ativo: true, provedor: 'ollama' } })).code, 400)
  } finally { delete process.env.NAMY_OLLAMA_URL; delete process.env.NAMY_OLLAMA_EMAILS }
})

test('rotas: previa sem IA e instantanea; com IA pede licenca, chave e respeita o limite', async () => {
  const a = ambiente()
  const f = fakeFetch(openai(BOM))
  const chamar = rotasDe(a, { fetch: f, previasPorMin: 2 })
  let r = await chamar('POST', '/copy/previa', 'u1', { modelo: 'Teste {nome}\n{link}' })
  assert.equal(r.code, 200)
  assert.equal(r.body.via, 'modelo')
  assert.match(r.body.texto, /^Teste Fone de Ouvido/)
  assert.equal(f.chamadas.length, 0)
  assert.equal((await chamar('POST', '/copy/previa', 'u1', { modelo: 'sem link' })).code, 400)

  assert.equal((await chamar('POST', '/copy/previa', 'u1', { ia: true, provedor: 'groq' })).code, 400, 'sem chave')
  assert.equal((await chamar('POST', '/copy/previa', 'u1', { ia: true, provedor: 'ollama' })).code, 400, 'Ollama nao liberado')
  assert.equal((await chamar('POST', '/copy/previa', 'u1', { ia: true })).code, 400, 'sem provedor')
  await chamar('POST', '/copy/chave', 'u1', { provedor: 'groq', chave: CHAVE })
  r = await chamar('POST', '/copy/previa', 'u1', { ia: true, provedor: 'groq' })
  assert.equal(r.code, 200)
  assert.equal(r.body.via, 'ia:groq')
  assert.ok(r.body.texto.startsWith(BOM))
  assert.equal(f.chamadas.length, 1)
  assert.equal((await chamar('POST', '/copy/previa', 'u1', { ia: true, provedor: 'groq' })).code, 200)
  assert.equal((await chamar('POST', '/copy/previa', 'u1', { ia: true, provedor: 'groq' })).code, 429, 'terceira dentro do minuto')
  assert.equal(f.chamadas.length, 2, 'a recusada nao chamou o provedor')
  // o outro cliente nao pode usar a chave do u1
  assert.equal((await chamar('POST', '/copy/previa', 'u2', { ia: true, provedor: 'groq' })).code, 400)
  // licenca vencida
  const v = ambiente({ license: { active: true, expiresAt: new Date(Date.now() - 1000).toISOString() } })
  assert.equal((await rotasDe(v, { fetch: f })('POST', '/copy/previa', 'u1', { ia: true, provedor: 'groq' })).code, 403)
})

// ---------------------------------------------------------------- integracao: publicador e vitrine

function sessaoFalsa() {
  const enviados = []
  return { enviados, publicState: () => ({ connected: true }), sendOffer: async (userId, jid, msg) => { enviados.push({ jid, msg }) } }
}

const OFERTA_API = { productId: '555', nome: OF.nome, link: 'https://s.shopee.com.br/AFIL1111', imageUrl: 'https://cf.shopee.com.br/img', preco: OF.preco, desconto: OF.desconto, ratingStar: OF.ratingStar, sales: OF.sales, shopName: OF.shopName }

async function comPreparar(fn) {
  const original = ofertas.preparar
  ofertas.preparar = async (dataDir, userId, shopee, opts) => {
    const o = Object.assign({}, OFERTA_API, { texto: 'texto-padrao-da-busca' })
    const r = opts.aceitar(o)
    return r.ok ? o : null
  }
  try { return await fn() } finally { ofertas.preparar = original }
}

test('publicador (API): sem nada configurado o texto e o de sempre; com modelo, usa o modelo', async () => {
  await comPreparar(async () => {
    const dataDir = dir()
    const cfg = { email: 'x@y.com', shopee: { appId: 'A', secret: 'S' }, ads: { source: 'api' }, groups: [{ jid: 'geral@g.us', name: 'Geral', niche: 'geral' }] }
    let s = sessaoFalsa()
    await publicador.publicar({ userId: 'p1', cfg, dataDir, sessions: s })
    assert.equal(s.enviados[0].msg.text, 'texto-padrao-da-busca')
    s = sessaoFalsa()
    const cfg2 = Object.assign({}, cfg, { copy: { modelo: '🛒 {nome} por {preco}!\n👉 {link}' } })
    await publicador.publicar({ userId: 'p2', cfg: cfg2, dataDir, sessions: s })
    assert.equal(s.enviados[0].msg.text, '🛒 Fone de Ouvido Bluetooth TWS com Cancelamento de Ruido por R$ 39,90!\n👉 https://s.shopee.com.br/AFIL1111')
  })
})

test('publicador (API) com IA: texto da IA aprovado vai com o link; reprovado cai no padrao e a auditoria diz por que', async () => {
  await comPreparar(async () => {
    const dataDir = dir()
    await cofre.gravar(dataDir, 'p3', 'ia', { groq: CHAVE })
    const cfg = { email: 'x@y.com', shopee: { appId: 'A', secret: 'S' }, ads: { source: 'api' }, copy: { ia: { ativo: true, provedor: 'groq' } }, groups: [{ jid: 'geral@g.us', name: 'Geral', niche: 'geral' }] }
    const real = global.fetch
    try {
      global.fetch = fakeFetch(openai(BOM))
      let s = sessaoFalsa()
      await publicador.publicar({ userId: 'p3', cfg, dataDir, sessions: s })
      assert.equal(s.enviados[0].msg.text, BOM + '\n\n🔗 https://s.shopee.com.br/AFIL1111')
      assert.ok(auditoria.listar(dataDir, 'p3').find((r) => r.tipo === 'enviado').avisos.includes('copy: IA Groq'))

      global.fetch = fakeFetch(openai('🎧 Fone TWS por R$ 21,95! Cancelamento de ruído e entrega rapida'))
      s = sessaoFalsa()
      await cofre.gravar(dataDir, 'p4', 'ia', { groq: CHAVE })
      await publicador.publicar({ userId: 'p4', cfg, dataDir, sessions: s })
      assert.equal(s.enviados[0].msg.text, 'texto-padrao-da-busca', 'IA inventou: sai o texto padrao, nunca o inventado')
      const aviso = auditoria.listar(dataDir, 'p4').find((r) => r.tipo === 'enviado').avisos[0]
      assert.match(aviso, /IA reprovada: numero inventado: 21.95/)
    } finally { global.fetch = real }
  })
})

test('vitrine: o envio usa o modelo do cliente e a IA; salvar na fila usa so o modelo (nunca chama a IA)', async () => {
  const dataDir = dir()
  const CONFIGS = path.join(dataDir, 'configs.json')
  const cfg = {
    email: 'v@y.com', license: { active: true, expiresAt: new Date(Date.now() + 864e5).toISOString() },
    shopee: { appId: 'A', secret: 'S' }, ads: { source: 'pool' },
    copy: { modelo: '🛍️ {nome} — {preco}\n{link}', ia: { ativo: true, provedor: 'groq' } },
    groups: [{ jid: 'geral@g.us', name: 'Geral', niche: 'geral' }]
  }
  fs.writeFileSync(CONFIGS, JSON.stringify({ v1: cfg }))
  await cofre.gravar(dataDir, 'v1', 'ia', { groq: CHAVE })
  const o = { productId: '777', nome: OF.nome, link: 'https://shopee.com.br/Fone-i.9.1777', imageUrl: 'https://cf.shopee.com.br/i', preco: OF.preco, desconto: 45, ratingStar: '4.8', sales: 12300, shopName: 'Loja' }
  const orig = ofertas.buscar
  const origItem = ofertas.porItem
  ofertas.buscar = async () => ({ itens: [o], recebidos: 1 })
  ofertas.porItem = async () => ({ status: 'ok', oferta: o })
  const real = global.fetch
  try {
    const ctx = { userId: 'v1', cfg, dataDir }
    await vitrine.buscar(ctx, {})
    global.fetch = fakeFetch(openai('nao deve ser chamado ao salvar'))
    const salvo = await vitrine.salvar(ctx, '777')
    assert.equal(global.fetch.chamadas.length, 0, 'salvar na fila nao gasta IA')
    const item = require('./pool').listar(dataDir, 'v1').find((i) => i.id === salvo.item.id)
    assert.match(item.texto, /^🛍️ Fone de Ouvido .* — R\$ 39,90\n/, 'o texto salvo segue o modelo do cliente')
    // a marcacao "ja na fila" reconhece o texto salvo com o modelo
    const busca = await vitrine.buscar(ctx, {})
    assert.equal(busca.itens[0].naFila, true)

    global.fetch = fakeFetch(openai(BOM))
    const s = sessaoFalsa()
    const r = await vitrine.enviar(ctx, { itemId: '777', jids: ['geral@g.us'] }, { sessions: s, pausaMs: 0 })
    assert.equal(r.enviados, 1)
    assert.ok(s.enviados[0].msg.text.startsWith(BOM), 'enviou o texto da IA aprovado')
    assert.ok(auditoria.listar(dataDir, 'v1').find((x) => x.tipo === 'enviado').avisos.includes('copy: IA Groq'))
  } finally { global.fetch = real; ofertas.buscar = orig; ofertas.porItem = origItem }
})
