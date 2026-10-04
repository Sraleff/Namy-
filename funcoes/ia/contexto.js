const historico = require('./historico')
const memoria = require('./memoria')
const { obterTom } = require('./personalidade')
const { systemPromptNamy } = require('./autonomia')
const config = require('../../config')

function montar({ texto, from, jid, isGroup, extras = {} }) {
    const chave = historico.chavePessoa(from, jid, isGroup)
    const hist = historico.obterLimpo(chave, config.maxHistorico || 12)
    const dados = memoria.pegar(jid)
    const nomePessoa = extras.nomePessoa || dados.perfil?.nome || 'desconhecido'
    const memoriaTxt = extras.memoriaTxt || memoria.resumo(jid)

    let contextoGrupo = extras.contextoGrupo || ''
    if (!contextoGrupo && isGroup) {
        contextoGrupo = historico
            .obter(historico.chaveGrupo(from))
            .slice(-8)
            .map((m) => m.content)
            .join('\n')
    }

    const tom = obterTom(from, texto)
    const system = systemPromptNamy(texto, {
        nomePessoa,
        memoria: memoriaTxt,
        contextoGrupo,
        tom,
        chatId: from
    })

    const mensagens = [
        { role: 'system', content: system },
        ...hist,
        { role: 'user', content: texto }
    ]

    return { mensagens, chave, nomePessoa, tom, dados }
}

function gravarResposta({ from, jid, isGroup, textoUser, textoNamy, nomePessoa }) {
    const max = config.maxHistorico || 12
    const chave = historico.chavePessoa(from, jid, isGroup)
    historico.adicionar(chave, 'user', textoUser, max)
    historico.adicionar(chave, 'assistant', textoNamy, max)
    if (isGroup) {
        const g = historico.chaveGrupo(from)
        historico.adicionar(g, 'user', `${nomePessoa}: ${textoUser}`, 16)
        historico.adicionar(g, 'assistant', `Namy: ${textoNamy}`, 16)
    }
}

module.exports = {
    montar,
    gravarResposta
}
