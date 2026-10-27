/**
 * Segredo da Shopee cifrado em disco (fase 1.6). Camada unica: o server.js passa tudo por aqui,
 * entao os demais modulos continuam lendo cfg.shopee.secret em texto, so que em memoria.
 *
 *   disco:    shopee.secret = "enc:v1:<AES-256-GCM via saas/cripto.js>"
 *   memoria:  shopee.secret = texto puro (ou '' se nao deu para abrir)
 *
 * Nunca perde segredo: sem SAAS_MASTER_KEY nao cifra; se o valor cifrado nao abre (chave
 * errada/ausente), a memoria fica com '' e o texto cifrado original e devolvido ao disco
 * na proxima gravacao, em vez de ser apagado.
 */
const fs = require('fs')
const path = require('path')
const cripto = require('../../../cripto')

const PREFIXO = 'enc:v1:'
const presos = new Map() // userId -> valor cifrado que nao abriu

const cifrado = (v) => typeof v === 'string' && v.startsWith(PREFIXO)

function cifrarSegredo(texto) {
  return PREFIXO + cripto.cifrar({ s: String(texto) })
}

function abrirSegredo(valor) {
  const r = cripto.abrir(String(valor).slice(PREFIXO.length))
  return r.ok && r.dados && typeof r.dados.s === 'string' ? r.dados.s : null
}

// disco -> memoria
function paraMemoria(configs) {
  const out = JSON.parse(JSON.stringify(configs || {}))
  for (const [id, cfg] of Object.entries(out)) {
    const s = cfg && cfg.shopee
    if (!s || !cifrado(s.secret)) { presos.delete(id); continue }
    const claro = abrirSegredo(s.secret)
    if (claro === null) {
      presos.set(id, s.secret)
      s.secret = ''
    } else { presos.delete(id); s.secret = claro }
  }
  return out
}

// memoria -> disco
function paraDisco(configs) {
  const out = JSON.parse(JSON.stringify(configs || {}))
  for (const [id, cfg] of Object.entries(out)) {
    const s = cfg && cfg.shopee
    if (!s) continue
    if (s.secret) {
      if (cifrado(s.secret)) continue
      if (cripto.disponivel()) { s.secret = cifrarSegredo(s.secret); presos.delete(id) }
    } else if (presos.has(id)) {
      s.secret = presos.get(id) // nao abriu: nao apaga
    }
  }
  return out
}

/**
 * Na subida: se ha segredo em texto puro e existe chave mestra, faz backup (0600) e regrava cifrado.
 * Retorna { migrados, backup } ou { migrados: 0, motivo }.
 */
function migrar(arquivo) {
  let bruto
  try { bruto = fs.readFileSync(arquivo, 'utf8') } catch { return { migrados: 0, motivo: 'sem arquivo' } }
  let dados
  try { dados = JSON.parse(bruto) } catch { return { migrados: 0, motivo: 'arquivo ilegível' } }
  const pendentes = Object.values(dados || {}).filter((c) => c && c.shopee && c.shopee.secret && !cifrado(c.shopee.secret))
  if (!pendentes.length) return { migrados: 0, motivo: 'nada a migrar' }
  if (!cripto.disponivel()) return { migrados: 0, motivo: 'sem SAAS_MASTER_KEY: segredo segue em texto puro' }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backup = path.join(path.dirname(arquivo), path.basename(arquivo) + '.bak-pre-cifra-' + stamp)
  fs.writeFileSync(backup, bruto, { mode: 0o600 })
  fs.chmodSync(backup, 0o600)
  const novo = paraDisco(dados)
  const tmp = arquivo + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(novo, null, 2), { mode: 0o600 })
  fs.renameSync(tmp, arquivo)
  return { migrados: pendentes.length, backup }
}

const SEGREDO_PADRAO = 'namy-client-dev-secret-change-me'

/** { ok, aviso }: em producao o segredo padrao/curto nao serve. */
function checarJwt(env) {
  const v = String(env.JWT_SECRET || '')
  const fraco = !v || v === SEGREDO_PADRAO || v.length < 32
  if (!fraco) return { ok: true }
  const msg = 'JWT_SECRET ausente, igual ao padrão ou com menos de 32 caracteres: qualquer um que conheça o padrão consegue forjar login.'
  return env.NODE_ENV === 'production' ? { ok: false, aviso: msg + ' Defina um valor aleatorio longo no .env.' } : { ok: true, aviso: msg + ' (aceito só em desenvolvimento)' }
}

module.exports = { PREFIXO, paraMemoria, paraDisco, migrar, checarJwt, SEGREDO_PADRAO, _presos: presos }
