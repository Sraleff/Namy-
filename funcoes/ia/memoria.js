const db = require('../db')

function padrao() {
    return {
        perfil: {
            nome: '',
            apelido: '',
            cidade: '',
            idade: ''
        },
        preferencias: {
            jogos: [],
            filmes: [],
            musicas: [],
            animes: [],
            assuntos: [],
            gostos: []
        },
        conversa: {
            assuntosRecentes: [],
            pessoasMencionadas: [],
            eventos: []
        },
        namy: {
            tom: '',
            respondeAutomaticamente: null,
            nivelZoeira: '',
            frequencia: ''
        },
        observacao: '',
        atualizadoEm: ''
    }
}

function migrarLegado(raw) {
    if (!raw) return padrao()
    if (raw.perfil) {
        return {
            ...padrao(),
            ...raw,
            perfil: { ...padrao().perfil, ...(raw.perfil || {}) },
            preferencias: { ...padrao().preferencias, ...(raw.preferencias || {}) },
            conversa: { ...padrao().conversa, ...(raw.conversa || {}) },
            namy: { ...padrao().namy, ...(raw.namy || {}) }
        }
    }
    return {
        ...padrao(),
        perfil: {
            nome: raw.nome || '',
            apelido: raw.apelido || '',
            cidade: raw.cidade || '',
            idade: raw.idade || ''
        },
        preferencias: {
            jogos: raw.jogoFavorito ? [raw.jogoFavorito] : [],
            filmes: [],
            musicas: [],
            animes: raw.animeFavorito ? [raw.animeFavorito] : [],
            assuntos: Array.isArray(raw.interesses) ? raw.interesses : [],
            gostos: Array.isArray(raw.gostos) ? raw.gostos : []
        },
        observacao: raw.observacao || '',
        atualizadoEm: raw.atualizadoEm || ''
    }
}

function pegar(jid) {
    const raw = db.get('memories', jid, null)
    if (!raw) {
        const novo = padrao()
        db.set('memories', jid, novo)
        return novo
    }
    const normalizado = migrarLegado(raw)
    if (!raw.perfil) db.set('memories', jid, normalizado)
    return normalizado
}

function atualizar(jid, dadosNovos = {}) {
    const atual = pegar(jid)
    const proximo = {
        ...atual,
        ...dadosNovos,
        perfil: { ...atual.perfil, ...(dadosNovos.perfil || {}) },
        preferencias: { ...atual.preferencias, ...(dadosNovos.preferencias || {}) },
        conversa: { ...atual.conversa, ...(dadosNovos.conversa || {}) },
        namy: { ...atual.namy, ...(dadosNovos.namy || {}) },
        atualizadoEm: new Date().toISOString()
    }
    db.set('memories', jid, proximo)
    return proximo
}

function limpar(jid) {
    db.del('memories', jid)
}

function esquecer(jid, campo) {
    const mapa = {
        nome: ['perfil', 'nome'],
        apelido: ['perfil', 'apelido'],
        cidade: ['perfil', 'cidade'],
        idade: ['perfil', 'idade'],
        jogos: ['preferencias', 'jogos'],
        filmes: ['preferencias', 'filmes'],
        musicas: ['preferencias', 'musicas'],
        animes: ['preferencias', 'animes'],
        assuntos: ['preferencias', 'assuntos'],
        gostos: ['preferencias', 'gostos'],
        observacao: ['observacao']
    }
    const caminho = mapa[String(campo || '').toLowerCase()]
    if (!caminho) return null
    const atual = pegar(jid)
    if (caminho.length === 1) atual[caminho[0]] = ''
    else {
        const vazio = Array.isArray(atual[caminho[0]][caminho[1]]) ? [] : ''
        atual[caminho[0]][caminho[1]] = vazio
    }
    atual.atualizadoEm = new Date().toISOString()
    db.set('memories', jid, atual)
    return atual
}

function pushUnico(lista, item, max = 10) {
    const arr = Array.isArray(lista) ? [...lista] : []
    const valor = String(item || '').trim().replace(/[!.?]+$/, '')
    if (!valor) return arr
    if (!arr.some((x) => String(x).toLowerCase() === valor.toLowerCase())) arr.push(valor)
    return arr.slice(-max)
}

function capturar(jid, texto) {
    if (!jid || !texto) return pegar(jid)
    const t = String(texto)

    const nomeMatch = t.match(
        /(?:meu nome [eé]|me chamo|eu sou(?: a| o)?|pode me chamar de)\s+([A-Za-zÀ-ÿ]{2,24})/i
    )
    const apelidoMatch = t.match(/(?:meu apelido [eé]|me apelidam de)\s+([A-Za-zÀ-ÿ]{2,24})/i)
    const cidadeMatch = t.match(/(?:moro em|sou de|vivo em|minha cidade [eé])\s+([A-Za-zÀ-ÿ\s]{2,40})/i)
    const idadeMatch = t.match(/(?:tenho|minha idade [eé])\s+(\d{1,2})\s*anos/i)
    const gostoMatch = t.match(/(?:gosto (?:muito )?de|adoro|amo)\s+(.+)/i)
    const interesseMatch = t.match(/(?:me interesso por|curto)\s+(.+)/i)
    const animeMatch = t.match(/(?:meu anime favorito [eé]|anime favorito[:\s]+)\s*(.+)/i)
    const jogoMatch = t.match(/(?:meu jogo favorito [eé]|jogo favorito[:\s]+)\s*(.+)/i)
    const filmeMatch = t.match(/(?:meu filme favorito [eé]|filme favorito[:\s]+)\s*(.+)/i)
    const musicaMatch = t.match(/(?:ouço|escuto|minha música favorita [eé])\s+(.+)/i)

    const patch = { perfil: {}, preferencias: {} }
    const atual = pegar(jid)

    if (nomeMatch) patch.perfil.nome = nomeMatch[1].trim()
    if (apelidoMatch) patch.perfil.apelido = apelidoMatch[1].trim()
    if (cidadeMatch) patch.perfil.cidade = cidadeMatch[1].trim().replace(/[!.?]+$/, '')
    if (idadeMatch) patch.perfil.idade = idadeMatch[1]
    if (gostoMatch) {
        patch.preferencias.gostos = pushUnico(atual.preferencias.gostos, gostoMatch[1])
    }
    if (interesseMatch) {
        patch.preferencias.assuntos = pushUnico(atual.preferencias.assuntos, interesseMatch[1])
    }
    if (animeMatch) patch.preferencias.animes = pushUnico(atual.preferencias.animes, animeMatch[1])
    if (jogoMatch) patch.preferencias.jogos = pushUnico(atual.preferencias.jogos, jogoMatch[1])
    if (filmeMatch) patch.preferencias.filmes = pushUnico(atual.preferencias.filmes, filmeMatch[1])
    if (musicaMatch) patch.preferencias.musicas = pushUnico(atual.preferencias.musicas, musicaMatch[1])

    if (Object.keys(patch.perfil).length || Object.keys(patch.preferencias).length) {
        return atualizar(jid, patch)
    }
    return atual
}

function resumo(jid) {
    const m = pegar(jid)
    const partes = []
    if (m.perfil.nome) partes.push(`Nome: ${m.perfil.nome}`)
    if (m.perfil.apelido) partes.push(`Apelido: ${m.perfil.apelido}`)
    if (m.perfil.cidade) partes.push(`Cidade: ${m.perfil.cidade}`)
    if (m.perfil.idade) partes.push(`Idade: ${m.perfil.idade}`)
    if (m.preferencias.gostos?.length) partes.push(`Gostos: ${m.preferencias.gostos.join(', ')}`)
    if (m.preferencias.jogos?.length) partes.push(`Jogos: ${m.preferencias.jogos.join(', ')}`)
    if (m.preferencias.animes?.length) partes.push(`Animes: ${m.preferencias.animes.join(', ')}`)
    if (m.preferencias.filmes?.length) partes.push(`Filmes: ${m.preferencias.filmes.join(', ')}`)
    if (m.preferencias.musicas?.length) partes.push(`Músicas: ${m.preferencias.musicas.join(', ')}`)
    if (m.preferencias.assuntos?.length) partes.push(`Assuntos: ${m.preferencias.assuntos.join(', ')}`)
    if (m.observacao) partes.push(`Obs: ${m.observacao}`)
    return partes.length
        ? `Memória desta pessoa:\n- ${partes.join('\n- ')}`
        : 'Ainda não há memória salva desta pessoa.'
}

function cartao(jid) {
    const m = pegar(jid)
    const linha = (v) => (Array.isArray(v) ? (v.length ? v.join(', ') : '—') : (v || '—'))
    return [
        '🧠 *Sua memória*',
        '',
        `👤 Nome: ${linha(m.perfil.nome)}`,
        `🏷️ Apelido: ${linha(m.perfil.apelido)}`,
        `📍 Cidade: ${linha(m.perfil.cidade)}`,
        `🎂 Idade: ${linha(m.perfil.idade)}`,
        `❤️ Gosta de: ${linha(m.preferencias.gostos)}`,
        `🎮 Jogos: ${linha(m.preferencias.jogos)}`,
        `🎌 Animes: ${linha(m.preferencias.animes)}`,
        `🎬 Filmes: ${linha(m.preferencias.filmes)}`,
        `🎵 Músicas: ${linha(m.preferencias.musicas)}`,
        `💬 Assuntos: ${linha(m.preferencias.assuntos)}`,
        '',
        'Use:',
        '`!memoria limpar`',
        '`!memoria esquecer nome`'
    ].join('\n')
}

module.exports = {
    pegar,
    atualizar,
    limpar,
    esquecer,
    capturar,
    resumo,
    cartao,
    resumoMemoria: resumo
}
