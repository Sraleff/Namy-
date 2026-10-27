/**
 * Telegram (D4): espelha nos canais/grupos do Telegram do cliente as ofertas que saem para os
 * grupos do WhatsApp. Bot API oficial (https://core.telegram.org/bots/api), sem dependência nova.
 *
 * O cliente cria o próprio bot no @BotFather e cola o token. O token fica cifrado no cofre
 * (data/marketplaces/<userId>.json, chave "telegram"); o resto em data/telegram/<userId>.json:
 *   { ativo, bot: { id, username, nome }, destinos: [{ id, titulo, tipo, nicho, ultimoErro }], tokenInvalido }
 *
 * Cada destino recebe as ofertas dos grupos do mesmo nicho; "todos" recebe a primeira oferta de
 * cada rodada. O link é convertido de novo para o Telegram (subId de origem "telegram").
 * O token nunca vai para log, resposta da API do painel ou mensagem de erro.
 */
const fs = require('fs')
const jsonStore = require('./jsonStore')
const cofre = require('./cofre')
const conversor = require('./conversor')
const auditoria = require('./auditoria')
const nichos = require('./nichos')
const limites = require('./limites')

const PASTA = 'telegram'
const API = 'https://api.telegram.org'
const TOKEN_RE = /^\d{5,15}:[A-Za-z0-9_-]{30,60}$/
const CHAT_RE = /^(@[A-Za-z][A-Za-z0-9_]{4,31}|-?\d{5,20})$/
const MAX_DESTINOS = 10
const MAX_TEXTO = 4000
const MAX_LEGENDA = 1024
const vazio = () => ({ ativo: false, bot: null, destinos: [], tokenInvalido: false })
const erro = (msg, status = 400, extra = {}) => Object.assign(new Error(msg), { status }, extra)

// Trocável nos testes (sem rede)
const http = { fetch: (...a) => fetch(...a) }

const carregar = (dataDir, userId) => Object.assign(vazio(), jsonStore.load(dataDir, PASTA, userId, vazio))
const atualizar = (dataDir, userId, fn) => jsonStore.update(dataDir, PASTA, userId, vazio, (db) => fn(Object.assign(db, Object.assign(vazio(), db))))
const tokenDe = (dataDir, userId) => String((cofre.ler(dataDir, userId, 'telegram') || {}).token || '')

function semToken(texto, token) {
  let t = String(texto == null ? '' : texto)
  if (token) t = t.split(token).join('***')
  return t.replace(/bot\d{5,15}:[A-Za-z0-9_-]{30,60}/g, 'bot***')
}

/** Chamada à Bot API. Erro vira mensagem em português, sem o token. */
async function chamar(token, metodo, corpo, { multipart } = {}) {
  if (!TOKEN_RE.test(String(token || ''))) throw erro('Token do Telegram inválido.')
  let r
  try {
    r = await http.fetch(API + '/bot' + token + '/' + metodo, multipart
      ? { method: 'POST', body: multipart, signal: AbortSignal.timeout(20000) }
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo || {}), signal: AbortSignal.timeout(15000) })
  } catch (e) {
    throw erro('Não consegui falar com o Telegram agora (' + semToken(e && (e.name === 'TimeoutError' ? 'tempo esgotado' : e.message), token).slice(0, 80) + ').', 502, { temporario: true })
  }
  const dados = await r.json().catch(() => ({}))
  if (dados && dados.ok) return dados.result
  const desc = semToken((dados && dados.description) || ('HTTP ' + r.status), token).slice(0, 160)
  const codigo = Number((dados && dados.error_code) || r.status)
  if (codigo === 401 || codigo === 404) throw erro('O Telegram recusou o token (' + desc + '). Gere outro no @BotFather.', 400, { tokenInvalido: true })
  if (codigo === 403) throw erro('O bot não tem acesso a este chat (' + desc + '). Adicione o bot como administrador.', 400, { semAcesso: true })
  if (codigo === 429) throw erro('O Telegram pediu um intervalo (' + desc + ').', 429, { temporario: true })
  if (codigo === 400 && /chat not found/i.test(desc)) throw erro('Canal ou grupo não encontrado. Confira o @ ou o ID e adicione o bot como administrador.', 400, { semAcesso: true })
  throw erro('Telegram: ' + desc, codigo >= 500 ? 502 : 400, { temporario: codigo >= 500 })
}

// ---------------------------------------------------------------- formato

const escHtml = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
const ANTES = '(^|[\\s(\\[{])'
const DEPOIS = '(?=$|[\\s)\\]}.,!?:;])'

/** Marcação do WhatsApp (*negrito* _itálico_ ~riscado~ ```mono```) -> HTML do Telegram. Links ficam intactos. */
function paraHtml(texto) {
  let t = escHtml(String(texto || '').slice(0, MAX_TEXTO))
  t = t.replace(/```([\s\S]+?)```/g, '<code>$1</code>')
  t = t.replace(new RegExp(ANTES + '\\*([^*\\n]+?)\\*' + DEPOIS, 'gm'), '$1<b>$2</b>')
  t = t.replace(new RegExp(ANTES + '_([^_\\n]+?)_' + DEPOIS, 'gm'), '$1<i>$2</i>')
  t = t.replace(new RegExp(ANTES + '~([^~\\n]+?)~' + DEPOIS, 'gm'), '$1<s>$2</s>')
  return t
}

/** Envia texto (e foto, se houver). Legenda passa de 1024 caracteres ou a foto falha: vai só o texto. */
async function enviar(token, chatId, { texto, imageUrl, imagePath }) {
  const html = paraHtml(texto)
  const cabe = String(texto || '').length <= MAX_LEGENDA
  if (cabe && (imageUrl || imagePath)) {
    try {
      if (imagePath && fs.existsSync(imagePath)) {
        const form = new FormData()
        form.append('chat_id', String(chatId))
        form.append('caption', html)
        form.append('parse_mode', 'HTML')
        form.append('photo', new Blob([fs.readFileSync(imagePath)]), /\.png$/i.test(imagePath) ? 'oferta.png' : 'oferta.jpg')
        return await chamar(token, 'sendPhoto', null, { multipart: form })
      }
      if (/^https:\/\/\S+$/.test(String(imageUrl || ''))) {
        return await chamar(token, 'sendPhoto', { chat_id: chatId, photo: imageUrl, caption: html, parse_mode: 'HTML' })
      }
    } catch (e) {
      // token e acesso não melhoram mandando texto: devolve o erro; foto ruim: segue sem foto
      if (e.tokenInvalido || e.semAcesso || e.status === 429) throw e
    }
  }
  return chamar(token, 'sendMessage', { chat_id: chatId, text: html, parse_mode: 'HTML', link_preview_options: { is_disabled: false } })
}

// ---------------------------------------------------------------- conexão e destinos

async function conectar(dataDir, userId, token) {
  const t = String(token || '').trim()
  if (!TOKEN_RE.test(t)) throw erro('Cole o token inteiro do @BotFather (formato 123456789:ABC...).')
  if (!cofre.disponivel()) throw erro('O servidor ainda não tem a chave mestra (SAAS_MASTER_KEY). Fale com o administrador.', 503)
  const eu = await chamar(t, 'getMe')
  if (!eu || !eu.is_bot) throw erro('Esse token não é de um bot.')
  await cofre.gravar(dataDir, userId, 'telegram', { token: t })
  return atualizar(dataDir, userId, (db) => {
    const trocouDeBot = db.bot && String(db.bot.id) !== String(eu.id)
    db.bot = { id: String(eu.id), username: String(eu.username || '').slice(0, 64), nome: String(eu.first_name || '').slice(0, 64) }
    db.tokenInvalido = false
    // Outro bot não tem acesso aos canais do anterior
    if (trocouDeBot) db.destinos = []
    return db
  })
}

async function desconectar(dataDir, userId) {
  await cofre.apagar(dataDir, userId, 'telegram')
  return atualizar(dataDir, userId, (db) => { db.ativo = false; db.bot = null; db.destinos = []; db.tokenInvalido = false; return db })
}

const nichoValido = (n) => (n === 'todos' ? 'todos' : nichos.existe(n) ? n : null)

async function adicionarDestino(dataDir, userId, entrada = {}) {
  const chat = String(entrada.chat || '').trim().replace(/^https?:\/\/t\.me\//i, '@')
  if (!CHAT_RE.test(chat)) throw erro('Informe o @ do canal (ex.: @minhasofertas) ou o ID numérico do grupo.')
  const nicho = nichoValido(entrada.nicho == null ? 'todos' : String(entrada.nicho))
  if (!nicho) throw erro('Nicho inválido.')
  const db = carregar(dataDir, userId)
  const token = tokenDe(dataDir, userId)
  if (!db.bot || !token) throw erro('Conecte o bot primeiro.')
  if (db.destinos.length >= MAX_DESTINOS) throw erro('No máximo ' + MAX_DESTINOS + ' canais ou grupos no Telegram.')
  const info = await chamar(token, 'getChat', { chat_id: chat })
  const membro = await chamar(token, 'getChatMember', { chat_id: info.id, user_id: Number(db.bot.id) })
  const tipo = String(info.type || '')
  if (tipo === 'private') throw erro('Use um canal ou grupo, não uma conversa particular.')
  if (tipo === 'channel') {
    if (membro.status !== 'administrator' || membro.can_post_messages === false) throw erro('No canal, o bot precisa ser administrador com permissão de publicar.')
  } else if (!['administrator', 'member', 'creator'].includes(membro.status) || membro.can_send_messages === false) {
    throw erro('O bot precisa estar no grupo e poder enviar mensagens.')
  }
  const destino = { id: String(info.id), titulo: String(info.title || chat).replace(/[<>]/g, '').slice(0, 120), tipo, nicho, ultimoErro: '' }
  return atualizar(dataDir, userId, (d) => {
    if (d.destinos.some((x) => x.id === destino.id)) throw erro('Esse canal ou grupo já está na lista.', 409)
    d.destinos.push(destino)
    return d
  })
}

function alterarDestino(dataDir, userId, id, fn) {
  return atualizar(dataDir, userId, (db) => {
    const d = db.destinos.find((x) => x.id === String(id || ''))
    if (!d) throw erro('Canal ou grupo não encontrado.', 404)
    fn(db, d)
    return db
  })
}

const removerDestino = (dataDir, userId, id) => alterarDestino(dataDir, userId, id, (db, d) => { db.destinos = db.destinos.filter((x) => x !== d) })
async function nichoDoDestino(dataDir, userId, id, nicho) {
  const n = nichoValido(String(nicho || ''))
  if (!n) throw erro('Nicho inválido.')
  return alterarDestino(dataDir, userId, id, (_db, d) => { d.nicho = n })
}
async function ligar(dataDir, userId, ativo) {
  const db = carregar(dataDir, userId)
  if (ativo === true && (!db.bot || !db.destinos.length)) throw erro('Conecte o bot e adicione pelo menos um canal ou grupo antes de ligar.')
  return atualizar(dataDir, userId, (d) => { d.ativo = ativo === true; return d })
}

async function testar(dataDir, userId, id) {
  const db = carregar(dataDir, userId)
  const d = db.destinos.find((x) => x.id === String(id || ''))
  if (!d) throw erro('Canal ou grupo não encontrado.', 404)
  const token = tokenDe(dataDir, userId)
  if (!token) throw erro('Conecte o bot primeiro.')
  await chamar(token, 'sendMessage', { chat_id: d.id, text: '✅ Teste do Namy: este canal está conectado e vai receber as ofertas.', parse_mode: 'HTML' })
  return { ok: true }
}

/** Estado para o painel. Nunca devolve o token. */
function estado(dataDir, userId) {
  const db = carregar(dataDir, userId)
  return { ativo: db.ativo, conectado: !!(db.bot && tokenDe(dataDir, userId)), bot: db.bot, destinos: db.destinos, tokenInvalido: db.tokenInvalido, cofre: cofre.disponivel() }
}

/** Destinos do Telegram no formato de grupo (para a quebra por grupo em Comissões). */
const comoGrupos = (dataDir, userId) => carregar(dataDir, userId).destinos.map((d) => ({ jid: 'tg:' + d.id, name: 'Telegram: ' + d.titulo }))

// ---------------------------------------------------------------- espelho (chamado pelo publicador)

/**
 * Manda a oferta que acabou de sair para os grupos do nicho `nicho` aos destinos do Telegram
 * do mesmo nicho (e aos "todos", se esta for a primeira oferta da rodada).
 * Nunca lança: cada falha vira log/auditoria. Devolve [{ id, titulo, ok, erro }].
 */
async function espelhar(ctx, oferta, nicho, { primeira = false, logs } = {}) {
  const { userId, cfg, dataDir } = ctx
  const out = []
  if (!oferta || !limites.podeRecurso(cfg, 'telegram')) return out
  const db = carregar(dataDir, userId)
  if (!db.ativo || db.tokenInvalido || !db.bot) return out
  const alvos = db.destinos.filter((d) => d.nicho === nicho || (d.nicho === 'todos' && primeira))
  if (!alvos.length) return out
  const token = tokenDe(dataDir, userId)
  if (!token) return out
  const porGrupo = !!(cfg.comissoes && cfg.comissoes.porGrupo)
  const log = (d, ok, message) => { try { logs && logs.append(dataDir, userId, { source: 'telegram', level: ok ? 'info' : 'error', ok, group: 'Telegram: ' + d.titulo, message }) } catch {} }
  let invalido = false
  const erros = {}
  for (const d of alvos) {
    try {
      const conv = await conversor.converterTexto(oferta.textoOriginal || oferta.texto, Object.assign({}, ctx, { atribuicao: { origem: 'telegram', nicho, grupo: porGrupo ? 'tg:' + d.id : undefined } }))
      if (!conv.ok) throw erro('link: ' + conv.erros.map((e) => e.motivo).join('; '))
      await enviar(token, d.id, { texto: conv.texto, imageUrl: oferta.imageUrl, imagePath: oferta.imagePath })
      out.push({ id: d.id, titulo: d.titulo, ok: true })
      erros[d.id] = ''
      await auditoria.registrar(dataDir, userId, { tipo: 'enviado', grupo: 'Telegram: ' + d.titulo, jid: 'tg:' + d.id, nicho, fonte: oferta.fonte, produtoKey: oferta.produtoKey, nome: oferta.nome, imageUrl: oferta.imageUrl, marketplaces: conv.marketplaces, links: conv.trocas.length })
      log(d, true, 'Oferta (' + nicho + '): ' + String(oferta.nome || '').slice(0, 120))
    } catch (e) {
      const msg = semToken(e.message || 'falha no envio', token).slice(0, 200)
      out.push({ id: d.id, titulo: d.titulo, ok: false, erro: msg })
      erros[d.id] = msg
      if (e.tokenInvalido) invalido = true
      await auditoria.registrar(dataDir, userId, { tipo: 'falha', motivo: 'Telegram: ' + msg, grupo: 'Telegram: ' + d.titulo, jid: 'tg:' + d.id, nicho, fonte: oferta.fonte, produtoKey: oferta.produtoKey, nome: oferta.nome }).catch(() => {})
      log(d, false, 'Telegram: ' + msg)
      if (invalido) break
    }
  }
  await atualizar(dataDir, userId, (x) => {
    for (const d of x.destinos) if (d.id in erros) d.ultimoErro = erros[d.id]
    // Token revogado: para de tentar até o cliente colar outro
    if (invalido) x.tokenInvalido = true
  }).catch(() => {})
  return out
}

module.exports = {
  PASTA, TOKEN_RE, CHAT_RE, MAX_DESTINOS, MAX_LEGENDA,
  chamar, paraHtml, enviar, conectar, desconectar, adicionarDestino, removerDestino, nichoDoDestino, ligar, testar,
  estado, comoGrupos, espelhar, carregar, semToken, _http: http
}
