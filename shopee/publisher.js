const axios = require('axios')
const ia = require('./ia')
const historico = require('./historico')
const wa = require('./wa')
const { log } = require('./log')

function erroWa(mensagem) {
    const err = new Error(mensagem)
    err.code = 'WA'
    return err
}

async function baixarImagem(url) {
    if (!url || !/^https?:\/\//i.test(url)) return null
    try {
        const res = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 12000,
            maxContentLength: 4 * 1024 * 1024,
            headers: { 'User-Agent': 'NamyBot/3.1' }
        })
        const buf = Buffer.from(res.data)
        if (buf.length < 500) return null
        return buf
    } catch {
        return null
    }
}

async function publicar(client, grupoJid, produto) {
    if (!wa.aberto(client)) throw erroWa('whatsapp_offline')

    const { texto } = await ia.copy(produto)
    const imagem = await baixarImagem(produto.imageUrl)

    if (!wa.aberto(client)) throw erroWa('whatsapp_offline')

    try {
        if (imagem) {
            await client.sendMessage(grupoJid, { image: imagem, caption: texto })
        } else {
            await client.sendMessage(grupoJid, { text: texto })
        }
        historico.registrar({ grupoJid, produto })
        log('Publicado com sucesso')
        return true
    } catch (erro) {
        if (wa.queda(erro)) {
            log('WhatsApp caiu no envio, adiando')
            throw erroWa('whatsapp_offline')
        }
        log('falha ao enviar no WhatsApp:', erro.message)
        throw erro
    }
}

module.exports = { publicar, baixarImagem, erroWa }
