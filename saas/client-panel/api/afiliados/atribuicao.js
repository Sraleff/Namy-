/**
 * Atribuicao de comissao (fase 2.1): o link de afiliado leva subIds e a Shopee devolve isso em
 * `utmContent` no relatorio de conversoes. Verificado na API real: subId so aceita letras e
 * numeros (hifen e underscore dao "invalid sub id") e 100 caracteres e recusado.
 *
 *   subIds = [origem, nicho, g<hash do grupo>]   (grupo so no modo "atribuir por grupo")
 *   origem: api | banco | vitrine | agendada | conversor | pagina (vitrine pública) | telegram ; nicho: ver nichos.js
 * O jid do grupo nunca vai no link: vai um hash curto que so o painel sabe desfazer.
 */
const crypto = require('crypto')

const ORIGENS = ['api', 'banco', 'vitrine', 'agendada', 'conversor', 'pagina', 'telegram']
const PADRAO = ['namy']

const limpo = (s, max) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, max)

function hashGrupo(jid) {
  return 'g' + crypto.createHash('sha1').update(String(jid || '')).digest('hex').slice(0, 8)
}

/** a = { origem, nicho, grupo(jid) } -> array de subIds validos; sem origem, o padrao de sempre. */
function subIdsDe(a) {
  if (!a || !ORIGENS.includes(a.origem)) return PADRAO.slice()
  const ids = [a.origem]
  const nicho = limpo(a.nicho, 12)
  ids.push(nicho || 'geral')
  if (a.grupo) ids.push(hashGrupo(a.grupo))
  return ids
}

/** utmContent do relatorio -> { origem, nicho, grupoHash }. Tolerante: tokens fora do padrao viram "outro". */
function desfazer(utm) {
  const partes = String(utm == null ? '' : utm).toLowerCase().split('-').filter(Boolean)
  const r = { origem: '', nicho: '', grupoHash: '' }
  for (const p of partes) {
    if (!r.origem && (ORIGENS.includes(p) || p === 'namy')) r.origem = p
    else if (/^g[0-9a-f]{8}$/.test(p)) r.grupoHash = p
    else if (!r.nicho && r.origem) r.nicho = p
  }
  if (!r.origem) r.origem = partes.length ? 'outro' : 'namy'
  return r
}

module.exports = { ORIGENS, PADRAO, subIdsDe, hashGrupo, desfazer }
