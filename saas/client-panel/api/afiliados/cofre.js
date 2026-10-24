/**
 * Tokens de marketplace por cliente, cifrados (AES-256-GCM via saas/cripto.js).
 * Sem SAAS_MASTER_KEY no .env do client-panel nada e gravado: melhor nao
 * conectar do que deixar token em texto puro.
 * Arquivo: data/marketplaces/<userId>.json  { mercadolivre: "v1:..." }
 */
const cripto = require('../../../cripto')
const jsonStore = require('./jsonStore')

const PASTA = 'marketplaces'
const vazio = () => ({})

function disponivel() {
  return cripto.disponivel()
}

function ler(dataDir, userId, marketplace) {
  const db = jsonStore.load(dataDir, PASTA, userId, vazio)
  const aberto = cripto.abrir(db[marketplace] || '')
  return aberto.ok ? aberto.dados : {}
}

function gravar(dataDir, userId, marketplace, dados) {
  if (!disponivel()) {
    const err = new Error('Defina SAAS_MASTER_KEY (32+ caracteres) no .env do client-panel para guardar tokens.')
    err.status = 503
    throw err
  }
  return jsonStore.update(dataDir, PASTA, userId, vazio, (db) => {
    db[marketplace] = cripto.cifrar(dados)
  })
}

function apagar(dataDir, userId, marketplace) {
  return jsonStore.update(dataDir, PASTA, userId, vazio, (db) => {
    delete db[marketplace]
  })
}

module.exports = { disponivel, ler, gravar, apagar }
