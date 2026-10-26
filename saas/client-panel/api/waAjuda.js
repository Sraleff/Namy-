/**
 * Ajuda por situacao da conexao do WhatsApp (C2). Mapeia as mensagens reais do sessions.js para
 * "o que aconteceu" e "o que fazer". Puro: nao toca na sessao. O teste le o sessions.js e falha se
 * alguma mensagem de erro conhecida ficar sem ajuda.
 *   acao: 'conectar' (formulario do numero) | 'reconectar' | 'esquecer' (desconectar e parear de novo) | 'aguardar' | ''
 */
const REGRAS = [
  { re: /encerrada no whatsapp/i, codigo: 'encerrada', titulo: 'O WhatsApp encerrou esta sessao',
    porque: 'O aparelho foi desconectado pelo celular (Aparelhos conectados) ou o WhatsApp invalidou o login.',
    passos: ['Toque em "Desconectar e esquecer" para limpar o pareamento antigo.', 'Informe o numero com DDI + DDD e toque em Conectar.', 'Digite o novo codigo no celular, em Aparelhos conectados.'], acao: 'esquecer' },
  { re: /outro lugar/i, codigo: 'outro-lugar', titulo: 'O WhatsApp conectou em outro lugar',
    porque: 'Esse mesmo numero foi aberto em outro computador ou servidor, e o WhatsApp derrubou este.',
    passos: ['Feche a outra sessao (outro painel, outro bot ou navegador) que usa este numero.', 'Depois toque em Reconectar.', 'Se cair de novo, use "Desconectar e esquecer" e pareie outra vez.'], acao: 'reconectar' },
  { re: /pareamento nao foi concluido/i, codigo: 'pareamento-expirou', titulo: 'O pareamento nao foi concluido',
    porque: 'O codigo expirou ou nao foi digitado no celular a tempo.',
    passos: ['Toque em Conectar para gerar um codigo novo.', 'No celular: WhatsApp → Aparelhos conectados → Conectar aparelho → Conectar com numero de telefone.', 'Digite o codigo logo que ele aparecer aqui.'], acao: 'conectar' },
  { re: /sessao invalida/i, codigo: 'sessao-invalida', titulo: 'A sessao salva ficou invalida',
    porque: 'Os dados de login guardados nao funcionam mais.',
    passos: ['Toque em "Desconectar e esquecer".', 'Conecte de novo informando o numero e digitando o codigo no celular.'], acao: 'esquecer' },
  { re: /muitas tentativas de reinicio|falha ao reiniciar/i, codigo: 'reinicio', titulo: 'A conexao nao conseguiu reiniciar',
    porque: 'O WhatsApp pediu um reinicio da conexao varias vezes e nao completou.',
    passos: ['Espere cerca de 1 minuto e toque em Reconectar.', 'Se continuar, use "Desconectar e esquecer" e pareie de novo.'], acao: 'reconectar' },
  { re: /rate-overlimit|pediu um intervalo/i, codigo: 'limite', titulo: 'O WhatsApp pediu um intervalo',
    porque: 'Foram feitos pedidos demais em pouco tempo (por exemplo, abrir varias telas ou reiniciar o painel).',
    passos: ['Espere cerca de 1 minuto sem clicar de novo.', 'Depois toque em Atualizar.'], acao: 'aguardar' },
  { re: /conexao caiu \(.*\)\. reconectando/i, codigo: 'queda-auto', titulo: 'A conexao caiu e esta reconectando sozinha',
    porque: 'Foi uma queda de rede ou do WhatsApp. O painel tenta voltar automaticamente.',
    passos: ['Nao precisa fazer nada: espere alguns segundos.', 'Se nao voltar em alguns minutos, toque em Reconectar.'], acao: 'aguardar' },
  { re: /conexao caiu|socket caiu/i, codigo: 'queda', titulo: 'A conexao com o WhatsApp caiu',
    porque: 'A rede ou o WhatsApp interrompeu a conexao e o painel nao conseguiu voltar sozinho.',
    passos: ['Toque em Reconectar.', 'Se nao voltar, confira a internet do servidor e tente de novo.', 'Persistindo, use "Desconectar e esquecer" e pareie outra vez.'], acao: 'reconectar' }
]

const PAREAR = ['Informe o numero com DDI + DDD (ex.: 5511999999999) e toque em Conectar.', 'No celular: WhatsApp → Aparelhos conectados → Conectar aparelho → Conectar com numero de telefone.', 'Digite o codigo que aparece aqui. Pode levar alguns segundos para conectar.']

/** st = estado publico da sessao ({ status, error, connected }). Devolve null quando esta tudo bem. */
function ajudaDe(st) {
  const s = st || {}
  if (s.connected || s.status === 'connected') return null
  const texto = String(s.error || '')
  if (texto) {
    const r = REGRAS.find((x) => x.re.test(texto))
    if (r) return { codigo: r.codigo, titulo: r.titulo, porque: r.porque, passos: r.passos, acao: r.acao }
    return { codigo: 'desconhecido', titulo: 'Algo deu errado na conexao', porque: texto.slice(0, 200), passos: ['Toque em Reconectar.', 'Se nao resolver, use "Desconectar e esquecer" e pareie de novo.'], acao: 'reconectar' }
  }
  if (s.status === 'waiting_code') return { codigo: 'aguardando-codigo', titulo: 'Falta digitar o codigo no celular', porque: 'O codigo ja foi gerado.', passos: PAREAR.slice(1), acao: 'aguardar' }
  if (s.status === 'connecting' || s.status === 'reconnecting') return { codigo: 'conectando', titulo: 'Conectando…', porque: 'Isso leva alguns segundos.', passos: ['Aguarde. Esta tela atualiza sozinha.'], acao: 'aguardar' }
  return { codigo: 'desconectado', titulo: 'Conecte o seu WhatsApp', porque: 'Nenhum numero esta conectado ao painel.', passos: PAREAR, acao: 'conectar' }
}

module.exports = { ajudaDe, REGRAS, PAREAR }
