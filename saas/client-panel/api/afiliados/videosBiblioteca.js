/**
 * Biblioteca de vídeos do cliente: arquivos enviados pelo painel ou salvos do baixador
 * (Shopee, Pinterest ou YouTube), para anexar às ofertas do banco.
 *
 *   data/videos/<userId>.json                índice (nome, tamanho, origem, data)
 *   data/videos-arquivos/<userId>/<uuid>.mp4 arquivos (cada conta na sua pasta)
 *
 * O tipo é conferido pelos bytes do arquivo (caixa "ftyp" do MP4/MOV), não pela extensão.
 * O arquivo é gravado como .parcial e só vira definitivo depois de conferido: erro no meio
 * não deixa lixo.
 */
const fs = require('fs')
const path = require('path')
const jsonStore = require('./jsonStore')

const PASTA = 'videos'
const LIMITES = {
  arquivo: 64 * 1024 * 1024, // vídeo enviado no WhatsApp: acima disso falha com frequência
  total: 500 * 1024 * 1024,
  quantidade: 30,
  simultaneosPorConta: 1,
  simultaneosNoServidor: 4
}
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
// Marcas da caixa ftyp: família MP4 toca em qualquer WhatsApp; "qt" (MOV do iPhone) pode não tocar em todos
const MARCAS_MP4 = ['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'M4VP', 'dash', 'msnv', '3gp4', '3gp5', '3g2a']
const ORIGENS = ['upload', 'shopee', 'pinterest', 'youtube']

const vazio = () => ({ itens: [] })
const emAndamento = new Map() // userId -> quantos uploads agora
let noServidor = 0

function erro(msg, status = 400) {
  return Object.assign(new Error(msg), { status })
}

function pasta(dataDir, userId) {
  const dir = path.join(dataDir, 'videos-arquivos', jsonStore.safeId(userId))
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

/** 'mp4' | 'mov' | '' a partir dos 12 primeiros bytes */
function formatoDe(cabecalho) {
  const b = Buffer.isBuffer(cabecalho) ? cabecalho : Buffer.from(cabecalho || [])
  if (b.length < 12 || b.toString('latin1', 4, 8) !== 'ftyp') return ''
  const marca = b.toString('latin1', 8, 12)
  if (MARCAS_MP4.includes(marca)) return 'mp4'
  if (marca === 'qt  ') return 'mov'
  return ''
}

const nomeLimpo = (n) => String(n || '').normalize('NFC').replace(/[\u0000-\u001f<>:"/\\|?*]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Vídeo'

function listar(dataDir, userId) {
  return (jsonStore.load(dataDir, PASTA, userId, vazio).itens || []).slice()
}

function uso(dataDir, userId) {
  const itens = listar(dataDir, userId)
  return { quantidade: itens.length, total: itens.reduce((s, i) => s + (Number(i.tamanho) || 0), 0), limites: { arquivo: LIMITES.arquivo, total: LIMITES.total, quantidade: LIMITES.quantidade } }
}

/** Caminho do arquivo do próprio cliente, ou '' se o id não for válido ou não existir. */
function caminho(dataDir, userId, id) {
  if (!ID_RE.test(String(id || ''))) return ''
  if (!listar(dataDir, userId).some((i) => i.id === id)) return ''
  const f = path.join(pasta(dataDir, userId), id + '.mp4')
  return fs.existsSync(f) ? f : ''
}

function obter(dataDir, userId, id) {
  return listar(dataDir, userId).find((i) => i.id === id) || null
}

/**
 * Grava um vídeo vindo de um stream (upload do painel ou baixador).
 * opcoes: { nome, origem, tamanhoDeclarado }
 */
async function salvar(dataDir, userId, stream, opcoes = {}) {
  const u = uso(dataDir, userId)
  if (u.quantidade >= LIMITES.quantidade) throw erro('Você chegou ao limite de ' + LIMITES.quantidade + ' vídeos. Apague algum para enviar outro.', 409)
  const declarado = Number(opcoes.tamanhoDeclarado) || 0
  if (declarado > LIMITES.arquivo) throw erro('Vídeo grande demais: o limite é 64 MB por arquivo.', 413)
  if (declarado && u.total + declarado > LIMITES.total) throw erro('Sem espaço: a sua biblioteca tem até 500 MB. Apague algum vídeo.', 409)
  if ((emAndamento.get(userId) || 0) >= LIMITES.simultaneosPorConta) throw erro('Já tem um vídeo sendo enviado. Espere ele terminar.', 429)
  if (noServidor >= LIMITES.simultaneosNoServidor) throw erro('Muitos envios ao mesmo tempo no servidor. Tente em instantes.', 503)

  emAndamento.set(userId, (emAndamento.get(userId) || 0) + 1)
  noServidor++
  const id = jsonStore.id()
  const dir = pasta(dataDir, userId)
  const parcial = path.join(dir, '.parcial-' + id)
  const final = path.join(dir, id + '.mp4')
  try {
    const tamanho = await new Promise((ok, falhou) => {
      const out = fs.createWriteStream(parcial, { flags: 'wx' })
      let total = 0
      let acabou = false
      const parar = (e) => {
        if (acabou) return
        acabou = true
        stream.destroy()
        out.destroy()
        falhou(e)
      }
      stream.on('data', (parte) => {
        total += parte.length
        if (total > LIMITES.arquivo) parar(erro('Vídeo grande demais: o limite é 64 MB por arquivo.', 413))
      })
      stream.on('error', () => parar(erro('O envio do vídeo foi interrompido. Tente de novo.', 400)))
      out.on('error', () => parar(erro('Não consegui gravar o vídeo no servidor.', 500)))
      out.on('finish', () => { if (!acabou) { acabou = true; ok(total) } })
      stream.pipe(out)
    })
    if (!tamanho) throw erro('O arquivo chegou vazio.', 400)
    const fd = fs.openSync(parcial, 'r')
    const cab = Buffer.alloc(12)
    fs.readSync(fd, cab, 0, 12, 0)
    fs.closeSync(fd)
    const formato = formatoDe(cab)
    if (!formato) throw erro('Esse arquivo não é um vídeo MP4. Envie um .mp4 (ou .mov do iPhone).', 415)
    if (uso(dataDir, userId).total + tamanho > LIMITES.total) throw erro('Sem espaço: a sua biblioteca tem até 500 MB. Apague algum vídeo.', 409)
    fs.renameSync(parcial, final)
    const item = {
      id,
      nome: nomeLimpo(opcoes.nome),
      origem: ORIGENS.includes(opcoes.origem) ? opcoes.origem : 'upload',
      formato,
      tamanho,
      aviso: formato === 'mov' ? 'Vídeo .mov: pode não tocar em todos os celulares. Se der problema, envie em MP4.' : '',
      criadoEm: new Date().toISOString()
    }
    await jsonStore.update(dataDir, PASTA, userId, vazio, (db) => {
      db.itens = Array.isArray(db.itens) ? db.itens : []
      db.itens.unshift(item)
      return item
    })
    return item
  } catch (e) {
    try { fs.unlinkSync(parcial) } catch {}
    try { if (!obter(dataDir, userId, id)) fs.unlinkSync(final) } catch {}
    throw e
  } finally {
    emAndamento.set(userId, Math.max(0, (emAndamento.get(userId) || 1) - 1))
    noServidor = Math.max(0, noServidor - 1)
  }
}

async function remover(dataDir, userId, id) {
  if (!ID_RE.test(String(id || ''))) throw erro('Vídeo inválido.')
  await jsonStore.update(dataDir, PASTA, userId, vazio, (db) => {
    const antes = (db.itens || []).length
    db.itens = (db.itens || []).filter((i) => i.id !== id)
    if (db.itens.length === antes) throw erro('Vídeo não encontrado.', 404)
  })
  try { fs.unlinkSync(path.join(pasta(dataDir, userId), id + '.mp4')) } catch {}
  return { ok: true }
}

module.exports = { LIMITES, ID_RE, formatoDe, listar, uso, caminho, obter, salvar, remover, _emAndamento: emAndamento }
