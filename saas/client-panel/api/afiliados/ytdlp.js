/**
 * Importar um vídeo público do YouTube com o programa yt-dlp.
 *
 * O navegador nunca recebe o endereço do arquivo: /videos/info devolve um id de uso
 * único, amarrado ao userId, e /videos/baixar só aceita esse id. A URL fica só na
 * memória do processo, pelo tempo do id.
 *
 * O programa é opcional. Sem ele no PATH, a rota responde com mensagem clara e
 * Shopee/Pinterest (videos.js) seguem iguais. Não usa cookie, login, DRM nem config
 * do sistema: argumento em lista, shell desligado, e a saída vai para uma pasta
 * temporária da própria conta, apagada no fim.
 */
const crypto = require('crypto')
const dns = require('dns').promises
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')
const links = require('./links')
const jsonStore = require('./jsonStore')
const biblioteca = require('./videosBiblioteca')

const BIN = 'yt-dlp'
const HOSTS = ['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'm.youtube-nocookie.com', 'youtu.be']
const ID_VIDEO = /^[\w-]{6,20}$/
const ID_RE = /^[0-9a-f]{24}$/
const ID_TTL = 10 * 60 * 1000
const TIMEOUT_INFO = 25 * 1000
const TIMEOUT_BAIXAR = 120 * 1000
const LIM_CONTA = 1
const LIM_SERVIDOR = 2
const MSG_SEM = 'O yt-dlp não está instalado neste servidor. Shopee e Pinterest continuam funcionando. Peça para quem administra a Namy instalar o programa yt-dlp.'

const pendentes = new Map()
const emAndamento = new Map()
let noServidor = 0
let cacheBin = { exp: 0, ok: false }

// Trocados nos testes. executar(args, opcoes) nunca recebe string de comando.
const _dep = {
  executar: null,
  disponivel: null,
  binario: null,
  resolver: (hostname) => dns.lookup(hostname, { all: true })
}

function erro(msg, status = 400) {
  return Object.assign(new Error(msg), { status })
}

const BASE = ['--ignore-config', '--no-playlist', '--no-warnings', '--no-progress', '--no-cache-dir', '--socket-timeout', '15', '--retries', '1', '--fragment-retries', '1']

function mbLimite() {
  return Math.max(1, Math.floor(biblioteca.LIMITES.arquivo / (1024 * 1024))) + 'M'
}

function argsInfo(url) {
  return BASE.concat(['--skip-download', '--dump-single-json', '--', url])
}

function argsBaixar(url) {
  const mb = mbLimite()
  return BASE.concat([
    '--no-mtime',
    '--restrict-filenames',
    '--max-filesize', mb,
    '-f', 'b[ext=mp4][filesize<' + mb + ']/b[ext=mp4][filesize_approx<' + mb + ']/b[ext=mp4]',
    '-o', 'video.%(ext)s',
    '--', url
  ])
}

function hostYouTube(url) {
  let u
  try { u = new URL(String(url || '').trim()) } catch { return false }
  if (u.protocol !== 'https:' || u.username || u.password) return false
  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  return HOSTS.includes(host)
}

function detectar(url) {
  return hostYouTube(url) ? 'youtube' : null
}

function idDo(u, host) {
  if (host === 'youtu.be') {
    let id = ''
    try { id = decodeURIComponent((u.pathname.split('/').filter(Boolean)[0] || '')) } catch { return '' }
    return ID_VIDEO.test(id) ? id : ''
  }
  if (u.pathname === '/watch') {
    const id = u.searchParams.get('v') || ''
    return ID_VIDEO.test(id) ? id : ''
  }
  const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([\w-]{6,20})\/?$/)
  return m ? m[2] : ''
}

/** URL https de um vídeo (não canal, não playlist). Devolve a URL que vai para o programa. */
function validarUrl(url) {
  const link = String(url || '').trim()
  if (!link || link.length > 500 || /[\u0000-\u001f\s]/.test(link)) throw erro('Cole um link https de um vídeo do YouTube.')
  if (!hostYouTube(link)) throw erro('Cole um link https de um vídeo do YouTube.')
  const u = new URL(link)
  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  const videoId = idDo(u, host)
  if (!videoId) throw erro('Esse link do YouTube não é de um vídeo. Use o link de um vídeo, Short ou youtu.be, não de canal ou playlist.', 422)
  u.hash = ''
  u.searchParams.delete('list')
  u.searchParams.delete('index')
  u.searchParams.delete('start_radio')
  return u.toString()
}

async function conferirDns(url) {
  const hostname = new URL(url).hostname
  let lista
  try {
    lista = await _dep.resolver(hostname)
  } catch (e) {
    if (e && e.status) throw e
    throw erro('Não consegui resolver o endereço do YouTube.', 502)
  }
  if (!Array.isArray(lista) || !lista.length || lista.some((r) => !r || links.ipPrivado(String(r.address || '')))) {
    throw erro('Host não permitido.', 400)
  }
}

function mensagemFalha(stderr) {
  const s = String(stderr || '').slice(0, 4000)
  if (/private video|video unavailable|this video (?:is|has been) unavailable|has been removed|copyright/i.test(s)) {
    return erro('Esse vídeo não existe mais, é privado ou foi removido.', 404)
  }
  if (/sign in to confirm|confirm you.?re not a bot|confirm your age|login required|members-only|age-restricted|inappropriate for some users/i.test(s)) {
    return erro('Esse vídeo exige login ou confirmação de idade. A Namy não usa conta nem cookie.', 422)
  }
  if (/file is larger than max-filesize|max-filesize/i.test(s)) return erro('Vídeo grande demais: o limite é 64 MB por arquivo.', 413)
  if (/requested format is not available|no video formats found/i.test(s)) return erro('Esse vídeo não tem um MP4 público abaixo de 64 MB.', 422)
  if (/unsupported url/i.test(s)) return erro('Esse link não é de um vídeo do YouTube.', 422)
  return erro('O YouTube não entregou o vídeo agora. Tente de novo em instantes.', 502)
}

function capaSegura(url) {
  const s = String(url || '')
  if (!s || s.length > 600) return ''
  let u
  try { u = new URL(s) } catch { return '' }
  if (u.protocol !== 'https:') return ''
  const h = u.hostname.toLowerCase()
  if (h === 'i.ytimg.com' || h.endsWith('.ytimg.com') || h.endsWith('.ggpht.com') || h.endsWith('.googleusercontent.com')) return s
  return ''
}

function jsonDe(stdout) {
  const s = String(stdout || '')
  const i = s.indexOf('{')
  const j = s.lastIndexOf('}')
  if (i < 0 || j <= i) throw erro('Não consegui ler os dados desse vídeo.', 502)
  try { return JSON.parse(s.slice(i, j + 1)) } catch { throw erro('Não consegui ler os dados desse vídeo.', 502) }
}

function tituloDe(meta) {
  return String(meta && meta.title || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140)
}

function cabeNoLimite(meta) {
  const lim = biblioteca.LIMITES.arquivo
  const formatos = Array.isArray(meta.formats) ? meta.formats : []
  const progressivos = formatos.filter((f) => f && f.vcodec && f.vcodec !== 'none' && f.acodec && f.acodec !== 'none' && String(f.ext || '').toLowerCase() === 'mp4')
  if (!progressivos.length) return true
  const comTamanho = progressivos.map((f) => Number(f.filesize || f.filesize_approx) || 0).filter(Boolean)
  if (!comTamanho.length) return true
  return comTamanho.some((n) => n <= lim)
}

function ocupar(userId) {
  if ((emAndamento.get(userId) || 0) >= LIM_CONTA) throw erro('Já tem um vídeo do YouTube sendo baixado nesta conta. Espere terminar.', 429)
  if (noServidor >= LIM_SERVIDOR) throw erro('Muitos downloads ao mesmo tempo no servidor. Tente em instantes.', 503)
  emAndamento.set(userId, (emAndamento.get(userId) || 0) + 1)
  noServidor++
}

function liberar(userId) {
  emAndamento.set(userId, Math.max(0, (emAndamento.get(userId) || 1) - 1))
  noServidor = Math.max(0, noServidor - 1)
}

function matar(child) {
  if (!child || !child.pid) return
  if (process.platform !== 'win32') {
    try { process.kill(-child.pid, 'SIGKILL'); return } catch { /* o processo já saiu */ }
  }
  try { child.kill('SIGKILL') } catch { /* idem */ }
}

function executarReal(args, { cwd, timeoutMs, maxBuffer } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(_dep.binario || BIN, args, {
      cwd: cwd || undefined,
      shell: false,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        PATH: process.env.PATH || '/usr/bin:/bin',
        LANG: 'C.UTF-8',
        HOME: cwd || os.tmpdir(),
        TMPDIR: cwd || os.tmpdir(),
        XDG_CACHE_HOME: cwd || os.tmpdir(),
        XDG_CONFIG_HOME: cwd || os.tmpdir()
      }
    })
    const max = maxBuffer || 2 * 1024 * 1024
    let stdout = ''
    let stderr = ''
    let estourou = false
    let tempo = false
    let acabou = false
    const fim = (fn) => {
      if (acabou) return
      acabou = true
      clearTimeout(timer)
      fn()
    }
    if (child.stdout) child.stdout.on('data', (p) => {
      if (stdout.length >= max) { estourou = true; matar(child); return }
      stdout += p.toString('utf8').slice(0, max - stdout.length)
    })
    if (child.stderr) child.stderr.on('data', (p) => {
      if (stderr.length >= 8000) return
      stderr += p.toString('utf8').slice(0, 8000 - stderr.length)
    })
    const timer = setTimeout(() => { tempo = true; matar(child) }, timeoutMs || TIMEOUT_INFO)
    child.on('error', (e) => fim(() => {
      reject(e && e.code === 'ENOENT' ? Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) : Object.assign(new Error('falha'), { code: 'FALHA' }))
    }))
    child.on('close', (code) => fim(() => {
      if (estourou) return reject(erro('A resposta do YouTube veio grande demais.', 502))
      if (tempo) return reject(Object.assign(new Error('timeout'), { killed: true }))
      resolve({ code: code == null ? 1 : code, stdout, stderr })
    }))
  })
}

async function executar(args, opcoes) {
  try {
    return await (_dep.executar ? _dep.executar(args, opcoes) : executarReal(args, opcoes))
  } catch (e) {
    if (e && e.status) throw e
    if (e && e.code === 'ENOENT') throw erro(MSG_SEM, 503)
    if (e && e.killed) throw erro('O download passou do tempo limite e foi interrompido.', 504)
    throw erro('Não consegui rodar o yt-dlp agora. Tente de novo em instantes.', 502)
  }
}

async function disponivel(agora = Date.now()) {
  if (_dep.disponivel) return _dep.disponivel()
  if (agora < cacheBin.exp) return cacheBin.ok
  let ok = false
  try {
    const r = await executarReal(['--version'], { timeoutMs: 5000, maxBuffer: 8192 })
    ok = r.code === 0 && /\d/.test(r.stdout)
  } catch { ok = false }
  cacheBin = { exp: agora + (ok ? 5 * 60 * 1000 : 20 * 1000), ok }
  return ok
}

function limparVencidos(agora) {
  for (const [k, v] of pendentes) if (v.exp < agora) pendentes.delete(k)
}

function pastaTemp(userId) {
  const conta = jsonStore.safeId(userId)
  if (!conta) throw erro('Conta inválida.')
  const base = path.join(os.tmpdir(), 'namy-ytdlp', conta)
  fs.mkdirSync(base, { recursive: true })
  const dir = path.join(base, crypto.randomBytes(8).toString('hex'))
  fs.mkdirSync(dir)
  const realBase = fs.realpathSync(base)
  const realDir = fs.realpathSync(dir)
  if (path.dirname(realDir) !== realBase) throw erro('Pasta temporária inválida.', 500)
  return realDir
}

function apagarPasta(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* já saiu */ }
}

function acharArquivo(dir) {
  let nomes
  try { nomes = fs.readdirSync(dir) } catch { return '' }
  const ok = nomes.filter((n) => n === 'video.mp4' || n === 'video.mov')
  if (ok.length !== 1) return ''
  let real
  try { real = fs.realpathSync(path.join(dir, ok[0])) } catch { return '' }
  if (path.dirname(real) !== dir) return ''
  return real
}

function streamDoArquivo(file, dir) {
  const s = fs.createReadStream(file)
  let limpou = false
  const limpar = () => {
    if (limpou) return
    limpou = true
    apagarPasta(dir)
  }
  s.on('close', limpar)
  s.on('error', limpar)
  return s
}

async function info(userId, url, agora = Date.now()) {
  const link = validarUrl(url)
  await conferirDns(link)
  if (!(await disponivel())) throw erro(MSG_SEM, 503)
  ocupar(userId)
  try {
    const r = await executar(argsInfo(link), { timeoutMs: TIMEOUT_INFO, maxBuffer: 2 * 1024 * 1024 })
    if (!r || r.code !== 0) throw mensagemFalha(r && r.stderr)
    const meta = jsonDe(r.stdout)
    if (meta.is_live || meta.live_status === 'is_live') throw erro('Vídeo ao vivo não dá para importar. Use um vídeo já publicado.', 422)
    const duracao = Number(meta.duration) || 0
    if (duracao > 20 * 60) throw erro('Esse vídeo passa de 20 minutos. O limite da Namy é 64 MB: escolha um vídeo mais curto ou envie o arquivo.', 413)
    if (!cabeNoLimite(meta)) throw erro('Vídeo grande demais: o limite é 64 MB por arquivo.', 413)
    limparVencidos(agora)
    if (pendentes.size > 5000) throw erro('Muitos pedidos ao mesmo tempo. Tente em instantes.', 429)
    const id = crypto.randomBytes(12).toString('hex')
    const nome = 'namy-youtube-' + id.slice(0, 8) + '.mp4'
    pendentes.set(id, { userId, url: link, nome, exp: agora + ID_TTL })
    return { id, plataforma: 'youtube', rotulo: 'YouTube', titulo: tituloDe(meta), capa: capaSegura(meta.thumbnail), nome }
  } finally {
    liberar(userId)
  }
}

async function abrir(userId, id, agora = Date.now()) {
  if (!ID_RE.test(String(id || ''))) throw erro('Pedido de download inválido.')
  const item = pendentes.get(id)
  if (!item || item.userId !== userId) throw erro('Esse download não é seu ou já expirou. Cole o link de novo.', 404)
  if (item.exp < agora) { pendentes.delete(id); throw erro('O download expirou. Cole o link de novo.', 410) }
  pendentes.delete(id)
  if (!(await disponivel())) throw erro(MSG_SEM, 503)
  ocupar(userId)
  let dir = ''
  try {
    dir = pastaTemp(userId)
    const r = await executar(argsBaixar(item.url), { cwd: dir, timeoutMs: TIMEOUT_BAIXAR, maxBuffer: 1024 * 1024 })
    if (!r || r.code !== 0) throw mensagemFalha(r && r.stderr)
    const file = acharArquivo(dir)
    if (!file) throw erro('O yt-dlp não entregou um MP4.', 502)
    const tamanho = fs.statSync(file).size
    if (!tamanho) throw erro('O arquivo chegou vazio.', 400)
    if (tamanho > biblioteca.LIMITES.arquivo) throw erro('Vídeo grande demais: o limite é 64 MB por arquivo.', 413)
    const fd = fs.openSync(file, 'r')
    const cab = Buffer.alloc(12)
    try { fs.readSync(fd, cab, 0, 12, 0) } finally { fs.closeSync(fd) }
    if (!biblioteca.formatoDe(cab)) throw erro('O arquivo baixado não é um vídeo MP4.', 415)
    const stream = streamDoArquivo(file, dir)
    dir = ''
    return { nome: item.nome, plataforma: 'youtube', tamanho, tipo: 'video/mp4', stream }
  } catch (e) {
    if (dir) apagarPasta(dir)
    throw e
  } finally {
    liberar(userId)
  }
}

function tem(id) {
  return pendentes.has(String(id || ''))
}

function _reset() {
  pendentes.clear()
  emAndamento.clear()
  noServidor = 0
  cacheBin = { exp: 0, ok: false }
}

module.exports = {
  HOSTS, detectar, validarUrl, info, abrir, tem, argsInfo, argsBaixar, MSG_SEM,
  _dep, _pendentes: pendentes, _emAndamento: emAndamento, _reset
}
