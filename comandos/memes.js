const axios = require('axios')

module.exports = async function pegarMeme(ctx) {
    const fontes = [
        {
            nome: 'imgflip',
            fetch: async () => {
                const { data } = await axios.get('https://api.imgflip.com/get_memes', {
                    timeout: 10000
                })
                const memes = data?.data?.memes
                if (!memes?.length) return null
                const meme = memes[Math.floor(Math.random() * memes.length)]
                return { url: meme.url, titulo: meme.name }
            }
        },
        {
            nome: 'some-random-api',
            fetch: async () => {
                const { data } = await axios.get('https://some-random-api.com/meme', {
                    timeout: 10000
                })
                if (!data?.image) return null
                return { url: data.image, titulo: data.caption || 'Meme' }
            }
        }
    ]

    // Embaralha as fontes para variar
    for (let i = fontes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[fontes[i], fontes[j]] = [fontes[j], fontes[i]]
    }

    for (const fonte of fontes) {
        try {
            const resultado = await fonte.fetch()
            if (resultado?.url) {
                await ctx.client.sendMessage(
                    ctx.from,
                    {
                        image: { url: resultado.url },
                        caption: resultado.titulo ? `😂 ${resultado.titulo}` : undefined
                    },
                    { quoted: ctx.info }
                )
                return
            }
        } catch (erro) {
            console.error(`Meme (${fonte.nome}):`, erro?.message || erro)
        }
    }

    await ctx.reply('❌ Não consegui pegar um meme agora. Tente de novo em instantes!')
}
