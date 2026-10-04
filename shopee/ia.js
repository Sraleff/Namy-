const { log } = require('./log')
const templates = require('./templates')

async function copy(produto) {
    let perguntarComFallback
    try {
        perguntarComFallback = require('../funcoes/ia/fallback').perguntarComFallback
    } catch {
        log('IA indisponível, usando template')
        return { texto: templates.local(produto), origem: 'template' }
    }

    const fatos = [
        `nome: ${produto.nome}`,
        `preco: ${produto.preco}`,
        `link: ${produto.link}`
    ]
    if (produto.desconto) fatos.push(`desconto_oficial: ${produto.desconto}%`)
    if (produto.shopName) fatos.push(`loja: ${produto.shopName}`)
    if (produto.ratingStar) fatos.push(`avaliacao: ${produto.ratingStar}`)
    if (produto.sales != null && Number.isFinite(produto.sales)) fatos.push(`vendidos: ${produto.sales}`)

    const system = [
        'Você escreve uma publicação curta de WhatsApp para um produto Shopee.',
        'Use SOMENTE os fatos listados. Não invente preço, desconto, cupom, frete, comissão, avaliação, quantidade vendida, loja ou característica.',
        'Se um dado não foi listado, omita. Não use hashtag demais. Português do Brasil. Máximo 500 caracteres.',
        'Inclua o preço e o link exatamente como fornecidos.'
    ].join(' ')

    const user = `Fatos oficiais:\n${fatos.join('\n')}`

    const tarefa = perguntarComFallback({
        mensagens: [
            { role: 'system', content: system },
            { role: 'user', content: user }
        ],
        modo: 'auto',
        chatId: 'shopee:copy'
    })

    const limite = new Promise((_, rej) => setTimeout(() => rej(new Error('ia_timeout')), 12000))

    try {
        const { texto } = await Promise.race([tarefa, limite])
        if (!texto || texto.length < 20 || !String(texto).includes(produto.link)) {
            log('IA indisponível, usando template')
            return { texto: templates.local(produto), origem: 'template' }
        }
        return { texto: String(texto).trim().slice(0, 900), origem: 'ia' }
    } catch {
        log('IA indisponível, usando template')
        return { texto: templates.local(produto), origem: 'template' }
    }
}

module.exports = { copy }
