const axios = require('axios')

const BASE_URL = 'https://kitsu.io/api/edge'

const catalogoFilmes = [
    // Ação
    { nome: 'Vingadores: Ultimato', ano: 2019, genero: 'Ação' },
    { nome: 'John Wick', ano: 2014, genero: 'Ação' },
    { nome: 'Mad Max: Estrada da Fúria', ano: 2015, genero: 'Ação' },
    { nome: 'Duro de Matar', ano: 1988, genero: 'Ação' },
    { nome: 'Gladiador', ano: 2000, genero: 'Ação' },
    { nome: 'Batman: O Cavaleiro das Trevas', ano: 2008, genero: 'Ação' },
    { nome: 'Missão Impossível', ano: 1996, genero: 'Ação' },
    { nome: 'Velozes e Furiosos 7', ano: 2015, genero: 'Ação' },

    // Ficção Científica
    { nome: 'Interestelar', ano: 2014, genero: 'Ficção Científica' },
    { nome: 'Matrix', ano: 1999, genero: 'Ficção Científica' },
    { nome: 'Blade Runner 2049', ano: 2017, genero: 'Ficção Científica' },
    { nome: 'A Chegada', ano: 2016, genero: 'Ficção Científica' },
    { nome: 'Ex Machina', ano: 2014, genero: 'Ficção Científica' },
    { nome: 'Duna', ano: 2021, genero: 'Ficção Científica' },
    { nome: 'O Exterminador do Futuro 2', ano: 1991, genero: 'Ficção Científica' },

    // Drama
    { nome: 'O Poderoso Chefão', ano: 1972, genero: 'Drama' },
    { nome: 'A Vida é Bela', ano: 1997, genero: 'Drama' },
    { nome: 'Clube da Luta', ano: 1999, genero: 'Drama' },
    { nome: 'Forrest Gump', ano: 1994, genero: 'Drama' },
    { nome: 'Cidade de Deus', ano: 2002, genero: 'Drama' },
    { nome: 'A Lista de Schindler', ano: 1993, genero: 'Drama' },
    { nome: 'Parasita', ano: 2019, genero: 'Drama' },
    { nome: 'Coringa', ano: 2019, genero: 'Drama' },
    { nome: 'Oppenheimer', ano: 2023, genero: 'Drama' },

    // Comédia
    { nome: 'As Branquelas', ano: 2004, genero: 'Comédia' },
    { nome: 'Se Beber, Não Case', ano: 2009, genero: 'Comédia' },
    { nome: 'Superbad', ano: 2007, genero: 'Comédia' },
    { nome: 'Deadpool', ano: 2016, genero: 'Comédia' },
    { nome: 'O Máscara', ano: 1994, genero: 'Comédia' },
    { nome: 'Gente Grande', ano: 2010, genero: 'Comédia' },
    { nome: 'Todo Mundo em Pânico', ano: 2000, genero: 'Comédia' },

    // Fantasia
    { nome: 'O Senhor dos Anéis: A Sociedade do Anel', ano: 2001, genero: 'Fantasia' },
    { nome: 'Harry Potter e a Pedra Filosofal', ano: 2001, genero: 'Fantasia' },
    { nome: 'O Labirinto do Fauno', ano: 2006, genero: 'Fantasia' },
    { nome: 'Avatar', ano: 2009, genero: 'Fantasia' },
    { nome: 'As Crônicas de Nárnia', ano: 2005, genero: 'Fantasia' },
    { nome: 'Wonka', ano: 2023, genero: 'Fantasia' },

    // Terror
    { nome: 'Invocação do Mal', ano: 2013, genero: 'Terror' },
    { nome: 'IT: A Coisa', ano: 2017, genero: 'Terror' },
    { nome: 'Hereditário', ano: 2018, genero: 'Terror' },
    { nome: 'Corra!', ano: 2017, genero: 'Terror' },
    { nome: 'O Silêncio dos Inocentes', ano: 1991, genero: 'Terror' },
    { nome: 'Nós', ano: 2019, genero: 'Terror' },

    // Romance
    { nome: 'A Culpa é das Estrelas', ano: 2014, genero: 'Romance' },
    { nome: 'Como Eu Era Antes de Você', ano: 2016, genero: 'Romance' },
    { nome: 'Orgulho e Preconceito', ano: 2005, genero: 'Romance' },
    { nome: 'Antes do Amanhecer', ano: 1995, genero: 'Romance' },
    { nome: 'Simplesmente Amor', ano: 2003, genero: 'Romance' },

    // Animação
    { nome: 'Toy Story', ano: 1995, genero: 'Animação' },
    { nome: 'Shrek', ano: 2001, genero: 'Animação' },
    { nome: 'Procurando Nemo', ano: 2003, genero: 'Animação' },
    { nome: 'Divertida Mente', ano: 2015, genero: 'Animação' },
    { nome: 'Zootopia', ano: 2016, genero: 'Animação' },
    { nome: 'Moana', ano: 2016, genero: 'Animação' },
    { nome: 'Frozen', ano: 2013, genero: 'Animação' },
    { nome: 'Up: Altas Aventuras', ano: 2009, genero: 'Animação' },
    { nome: 'Coco', ano: 2017, genero: 'Animação' },
    { nome: 'Encanto', ano: 2021, genero: 'Animação' }
]

async function recomendarFilme(ctx) {
    const categoria = ctx.args[0]?.toLowerCase()
    let filmes = catalogoFilmes

    if (categoria) {
        filmes = catalogoFilmes.filter((f) =>
            f.genero.toLowerCase().includes(categoria)
        )
    }

    if (filmes.length === 0) {
        return ctx.reply(
            '❌ Não encontrei filmes dessa categoria.\n\n' +
            'Gêneros: ação, ficção, drama, comédia, fantasia, terror, romance, animação'
        )
    }

    const filme = filmes[Math.floor(Math.random() * filmes.length)]

    const mensagem = `
🎬 *Recomendação de Filme*
📌 *Nome:* ${filme.nome}
📅 *Ano:* ${filme.ano}
🎭 *Gênero:* ${filme.genero}

Use *!filme [gênero]* para filtrar!
`.trim()

    await ctx.reply(mensagem)
}

async function recomendarAnime(ctx) {
    try {
        const categoria = ctx.args[0]?.toLowerCase()
        const offset = Math.floor(Math.random() * 50)

        const params = {
            'page[limit]': 10,
            'page[offset]': offset,
            sort: '-averageRating'
        }

        if (categoria) {
            params['filter[categories]'] = categoria
        }

        const response = await axios.get(`${BASE_URL}/anime`, {
            params,
            timeout: 12000
        })

        const lista = response.data?.data
        if (!lista?.length) {
            return ctx.reply(
                '❌ Não encontrei animes agora.\nTente sem gênero ou outro termo (ex: action, romance, comedy).'
            )
        }

        const anime = lista[Math.floor(Math.random() * lista.length)]
        const attrs = anime.attributes || {}
        const titulo =
            attrs.canonicalTitle ||
            attrs.titles?.en ||
            attrs.titles?.en_jp ||
            'Título desconhecido'
        const nota = attrs.averageRating
            ? Number(attrs.averageRating).toFixed(1)
            : 'N/A'
        const episodios = attrs.episodeCount || '?'
        const sinopse = (attrs.synopsis || 'Sem sinopse disponível.')
            .replace(/\s+/g, ' ')
            .substring(0, 180)

        const mensagem = `
🎌 *Recomendação de Anime*
📌 *Nome:* ${titulo}
⭐ *Nota:* ${nota}
📺 *Episódios:* ${episodios}
📖 *Sinopse:* ${sinopse}...

Use *!anime [gênero]* para filtrar!
`.trim()

        await ctx.reply(mensagem)
    } catch (erro) {
        console.error('Erro ao recomendar anime:', erro?.message || erro)
        await ctx.reply('❌ Não consegui buscar um anime agora. Tente mais tarde!')
    }
}

module.exports = { recomendarFilme, recomendarAnime }
