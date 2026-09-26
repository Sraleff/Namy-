const fs = require('fs')
const path = require('path')

const arquivoEstado = path.join(__dirname, '..', 'ia_estado.json')
const arquivoHistorico = path.join(__dirname, '..', 'ia_historico.json')
const arquivoModo = path.join(__dirname, '..', 'ia_modo.json')

function carregar(arquivo) {
  try {
    if (!fs.existsSync(arquivo)) return {}
    return JSON.parse(fs.readFileSync(arquivo, 'utf8'))
  } catch (erro) {
    console.error('Erro ao carregar arquivo da IA:', erro.message)
    return {}
  }
}

function salvar(arquivo, dados) {
  try {
    fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2), 'utf8')
  } catch (erro) {
    console.error('Erro ao salvar arquivo da IA:', erro.message)
  }
}

function estaAtiva(chatId) {
  const dados = carregar(arquivoEstado)
  return dados[chatId] === true
}

function ativar(chatId) {
  const dados = carregar(arquivoEstado)
  dados[chatId] = true
  salvar(arquivoEstado, dados)
}

function desativar(chatId) {
  const dados = carregar(arquivoEstado)
  delete dados[chatId]
  salvar(arquivoEstado, dados)
}

function obterHistorico(chatId) {
  const dados = carregar(arquivoHistorico)
  return dados[chatId] || []
}

function adicionarMensagem(chatId, role, content, max = 12) {
  const dados = carregar(arquivoHistorico)
  if (!dados[chatId]) dados[chatId] = []

  dados[chatId].push({ role, content })

  if (dados[chatId].length > max) {
    dados[chatId] = dados[chatId].slice(-max)
  }

  salvar(arquivoHistorico, dados)
}

function limparHistorico(chatId) {
  const dados = carregar(arquivoHistorico)
  delete dados[chatId]
  salvar(arquivoHistorico, dados)
}

function obterModo(chatId) {
  const dados = carregar(arquivoModo)
  return dados[chatId] === 'grok' ? 'grok' : 'groq'
}

function definirModo(chatId, modo) {
  const dados = carregar(arquivoModo)
  dados[chatId] = modo === 'grok' ? 'grok' : 'groq'
  salvar(arquivoModo, dados)
}

module.exports = {
  estaAtiva,
  ativar,
  desativar,
  obterHistorico,
  adicionarMensagem,
  limparHistorico,
  obterModo,
  definirModo
}