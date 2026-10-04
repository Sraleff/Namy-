const modelos = [
    ({ nome, preco, link }) =>
        `🛍️ OFERTA SHOPEE\n\n${nome}\n\n💰 ${preco}\n\n🔗 Confira:\n${link}`,
    ({ nome, preco, link }) =>
        `🔥 ACHADINHO DA SHOPEE\n\n${nome}\n\n💰 ${preco}\n\n👉 ${link}`,
    ({ nome, preco, link }) =>
        `Namy achou isso na Shopee:\n\n${nome}\n\n${preco}\n\n${link}`
]

function local(produto) {
    const i = Math.floor(Math.random() * modelos.length)
    return modelos[i](produto)
}

module.exports = { local, modelos }
