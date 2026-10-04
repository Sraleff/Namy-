const config = require('../config')
const { ehDono } = require('../funcoes/jid')
const cfg = require('./config')
const store = require('./store')
const grupos = require('./grupos')
const scheduler = require('./scheduler')
const { log } = require('./log')

function parseIntervalo(texto) {
    const t = String(texto || '').trim().toLowerCase()
    const m = t.match(/^(\d+)\s*(h|hora|horas|m|min|minuto|minutos)?$/)
    if (!m) return null
    const n = Number(m[1])
    if (!Number.isFinite(n) || n <= 0) return null
    const u = m[2] || 'm'
    return u.startsWith('h') ? n * 60 : n
}

function parseHorario(texto) {
    const m = String(texto || '').trim().match(/(\d{1,2}):(\d{2})\s*[-–àsato]+\s*(\d{1,2}):(\d{2})/i)
    if (!m) return null
    const h1 = Number(m[1])
    const mi1 = Number(m[2])
    const h2 = Number(m[3])
    const mi2 = Number(m[4])
    if ([h1, h2].some((h) => h > 23) || [mi1, mi2].some((x) => x > 59)) return null
    const pad = (h, mi) => `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`
    return { inicio: pad(h1, mi1), fim: pad(h2, mi2) }
}

function jidAlvo(ctx, extra) {
    const cand = String(extra || '').trim()
    if (cand.endsWith('@g.us')) return cand
    if (ctx.isGroup) return ctx.from
    return null
}

async function nomeGrupo(client, jid) {
    try {
        const meta = await client.groupMetadata(jid)
        return meta?.subject || ''
    } catch {
        return ''
    }
}

function ajuda(p) {
    return [
        '🛍️ *Shopee Afiliados* (só donos)',
        '',
        `\`${p}shopee status\``,
        `\`${p}shopee grupos\``,
        `\`${p}shopee cadastrar\` — neste grupo`,
        `\`${p}shopee remover\``,
        `\`${p}shopee on\` / \`${p}shopee off\``,
        `\`${p}shopee todos on\` — *somente grupos já cadastrados*`,
        `\`${p}shopee todos off\``,
        `\`${p}shopee intervalo 2h\``,
        `\`${p}shopee limite 5\``,
        `\`${p}shopee horario 09:00-22:00\``,
        `\`${p}shopee keyword fone bluetooth\``,
        `\`${p}shopee agora\` — publica agora neste grupo`,
        `\`${p}shopee retry\` — tenta a API de novo após erro de auth`,
        '',
        'Não cadastrado = não recebe oferta. `todos on` nunca pega grupo aleatório.'
    ].join('\n')
}

function linhaGrupo(jid, g) {
    const nome = g.nome || jid
    const estado = g.ativo ? '🟢 ON' : '🔴 OFF'
    const hoje = `${g.postsHoje || 0}/${g.limiteDiario || 5}`
    const prox = g.nextRunAt ? new Date(g.nextRunAt).toLocaleString('pt-BR') : '—'
    return `• *${nome}*\n  ${jid}\n  ${estado} · ${g.intervaloMinutos || 120} min · ${g.horarioInicio || '09:00'}–${g.horarioFim || '22:00'}\n  hoje ${hoje} · próxima: ${prox}`
}

async function handler(ctx) {
    if (!ehDono(ctx, config)) {
        return ctx.reply('🚫 Só os donos da Namy controlam a Shopee.')
    }

    const p = cfg.prefix
    const acao = String(ctx.args[0] || '').toLowerCase()
    const resto = ctx.args.slice(1)
    const s = store.carregar()

    if (!acao || acao === 'ajuda' || acao === 'help') {
        return ctx.reply(ajuda(p))
    }

    if (acao === 'status') {
        const lista = grupos.listar()
        const ids = Object.keys(lista)
        const ativos = ids.filter((id) => lista[id].ativo).length
        const cred = cfg.credenciaisOk() ? 'configuradas' : 'ausentes'
        const hab = cfg.habilitado() ? '🟢 ligado' : '🔴 desligado'
        const auth = s.authFailed ? 'pausada (auth)' : 'ok'
        const linhas = [
            '🛍️ *Shopee*',
            '',
            `Módulo: ${hab}`,
            `Credenciais: ${cred}`,
            `Auth API: ${auth}`,
            `Grupos cadastrados: ${ids.length}`,
            `Ativos: ${ativos}`,
            `Intervalo padrão: ${s.global.intervaloMinutos} min`,
            `Limite padrão: ${s.global.limiteDiario}/dia`,
            `Horário: ${s.global.horarioInicio}–${s.global.horarioFim}`,
            `Keyword: ${s.global.keyword || '(ofertas gerais)'}`,
            `IA: opcional — se cair, usa template local`,
            '',
            cfg.credenciaisOk()
                ? 'O bot segue normal se a API falhar.'
                : `Coloque SHOPEE_APP_ID e SHOPEE_SECRET no .env. Sem isso o módulo fica off.`
        ]
        return ctx.reply(linhas.join('\n'))
    }

    if (acao === 'grupos') {
        const lista = grupos.listar()
        const ids = Object.keys(lista)
        if (!ids.length) {
            return ctx.reply('Nenhum grupo cadastrado. Entre no grupo e mande `!shopee cadastrar`.')
        }
        const bloco = ids.map((id) => linhaGrupo(id, lista[id])).join('\n\n')
        return ctx.reply(`📦 *Grupos Shopee* (${ids.length} cadastrado(s))\n\n${bloco}`)
    }

    if (acao === 'todos') {
        const liga = String(resto[0] || '').toLowerCase()
        if (liga !== 'on' && liga !== 'off') {
            return ctx.reply(`Use \`${p}shopee todos on\` ou \`${p}shopee todos off\`.\nIsso *não* cadastra grupo novo.`)
        }
        const antes = Object.keys(grupos.listar())
        grupos.todos(liga === 'on')
        const depois = Object.keys(grupos.listar())
        log(`todos ${liga} em ${antes.length} cadastrado(s)`)
        return ctx.reply(
            liga === 'on'
                ? `✅ Shopee ON em *${antes.length}* grupo(s) *já cadastrados*.\nGrupos que não estavam na lista continuam fora (${depois.length} cadastrados agora).`
                : `⏸️ Shopee OFF em *${antes.length}* grupo(s) cadastrados. Nenhum grupo novo foi tocado.`
        )
    }

    if (acao === 'retry') {
        store.atualizar((st) => {
            st.authFailed = false
            st.authFailedAt = 0
            st.lastError = ''
            return st
        })
        log('auth resetada pelo dono')
        return ctx.reply('🔄 Auth da Shopee resetada. A próxima publicação tenta a API de novo.')
    }

    if (acao === 'keyword') {
        const palavra = resto.join(' ').trim()
        const jid = jidAlvo(ctx, '')
        if (!palavra) {
            const atual = jid && grupos.obter(jid)?.keyword
                ? grupos.obter(jid).keyword
                : (s.global.keyword || '(vazio)')
            return ctx.reply(`Keyword atual: *${atual}*\n\`${p}shopee keyword fone bluetooth\`\n\`${p}shopee keyword limpar\``)
        }
        const valor = /^(limpar|clear|off|nenhuma)$/i.test(palavra) ? '' : palavra.slice(0, 80)
        if (jid && grupos.obter(jid)) {
            grupos.patch(jid, { keyword: valor })
            return ctx.reply(`🔎 Keyword deste grupo: *${valor || '(ofertas gerais)'}*`)
        }
        store.atualizar((st) => {
            st.global.keyword = valor
            return st
        })
        return ctx.reply(`🔎 Keyword padrão: *${valor || '(ofertas gerais)'}*`)
    }

    if (acao === 'intervalo') {
        const minutos = parseIntervalo(resto[0] || resto.join(' '))
        if (minutos == null) return ctx.reply('Informe o intervalo. Ex: `!shopee intervalo 2h` ou `90m`. Mínimo 15 min.')
        const valor = Math.max(15, Math.min(24 * 60, minutos))
        const jid = jidAlvo(ctx, resto[1])
        if (jid && grupos.obter(jid)) {
            grupos.patch(jid, { intervaloMinutos: valor, nextRunAt: Date.now() + valor * 60 * 1000 })
            return ctx.reply(`⏱️ Intervalo deste grupo: *${valor} min*.`)
        }
        store.atualizar((st) => {
            st.global.intervaloMinutos = valor
            for (const id of Object.keys(st.grupos)) {
                st.grupos[id].intervaloMinutos = valor
            }
            return st
        })
        return ctx.reply(`⏱️ Intervalo padrão (e dos cadastrados): *${valor} min*.`)
    }

    if (acao === 'limite') {
        const n = Number(resto[0])
        if (!Number.isFinite(n) || n < 1 || n > 50) {
            return ctx.reply('Informe o limite diário (1–50). Ex: `!shopee limite 5`.')
        }
        const valor = Math.floor(n)
        const jid = jidAlvo(ctx, resto[1])
        if (jid && grupos.obter(jid)) {
            grupos.patch(jid, { limiteDiario: valor })
            return ctx.reply(`📊 Limite deste grupo: *${valor}/dia*.`)
        }
        store.atualizar((st) => {
            st.global.limiteDiario = valor
            for (const id of Object.keys(st.grupos)) {
                st.grupos[id].limiteDiario = valor
            }
            return st
        })
        return ctx.reply(`📊 Limite padrão (e dos cadastrados): *${valor}/dia*.`)
    }

    if (acao === 'horario' || acao === 'horário') {
        const parsed = parseHorario(resto.join(' '))
        if (!parsed) return ctx.reply('Informe o horário. Ex: `!shopee horario 09:00-22:00`.')
        const jid = jidAlvo(ctx, '')
        if (jid && grupos.obter(jid)) {
            grupos.patch(jid, { horarioInicio: parsed.inicio, horarioFim: parsed.fim })
            return ctx.reply(`🕒 Horário deste grupo: *${parsed.inicio}–${parsed.fim}* (America/São_Paulo).`)
        }
        store.atualizar((st) => {
            st.global.horarioInicio = parsed.inicio
            st.global.horarioFim = parsed.fim
            for (const id of Object.keys(st.grupos)) {
                st.grupos[id].horarioInicio = parsed.inicio
                st.grupos[id].horarioFim = parsed.fim
            }
            return st
        })
        return ctx.reply(`🕒 Horário padrão (e dos cadastrados): *${parsed.inicio}–${parsed.fim}*.`)
    }

    const jid = jidAlvo(ctx, resto[0])

    if (acao === 'cadastrar') {
        if (!jid) return ctx.reply('Use este comando *dentro do grupo* (ou passe o JID `...@g.us`).')
        const nome = (await nomeGrupo(ctx.client, jid)) || resto.slice(jid === resto[0] ? 1 : 0).join(' ') || jid
        grupos.cadastrar(jid, nome)
        log(`Grupo autorizado ${jid}`)
        return ctx.reply(
            `✅ Grupo cadastrado na Shopee:\n*${nome}*\n\`${jid}\`\n\nAinda está OFF. Ligue com \`${p}shopee on\`.`
        )
    }

    if (acao === 'remover') {
        if (!jid) return ctx.reply('Use no grupo cadastrado ou passe o JID.')
        if (!grupos.obter(jid)) return ctx.reply('Esse grupo não está na lista da Shopee.')
        grupos.remover(jid)
        return ctx.reply('🗑️ Grupo removido. Não recebe mais ofertas.')
    }

    if (acao === 'on' || acao === 'ligar' || (acao === 'grupo' && String(resto[0]).toLowerCase() === 'on')) {
        if (!jid) return ctx.reply('Use no grupo ou passe o JID.')
        if (!grupos.obter(jid)) {
            return ctx.reply(`Este grupo não está cadastrado.\nPrimeiro: \`${p}shopee cadastrar\`.`)
        }
        grupos.setAtivo(jid, true)
        log(`Grupo autorizado (ON) ${jid}`)
        return ctx.reply('🟢 Shopee *ON* neste grupo cadastrado.')
    }

    if (acao === 'off' || acao === 'desligar' || (acao === 'grupo' && String(resto[0]).toLowerCase() === 'off')) {
        if (!jid) return ctx.reply('Use no grupo ou passe o JID.')
        if (!grupos.obter(jid)) return ctx.reply('Este grupo não está cadastrado. Nada a desligar.')
        grupos.setAtivo(jid, false)
        return ctx.reply('🔴 Shopee *OFF* neste grupo.')
    }

    if (acao === 'agora') {
        if (!jid) return ctx.reply('Use no grupo cadastrado.')
        if (!grupos.obter(jid)) return ctx.reply('Cadastre o grupo antes de publicar.')
        if (!cfg.habilitado()) {
            return ctx.reply('Módulo desligado. Confira SHOPEE_APP_ID / SHOPEE_SECRET / SHOPEE_ENABLED no .env.')
        }
        try {
            scheduler.setClient(ctx.client)
            await scheduler.forcar(jid)
            return ctx.reply('📤 Tentei publicar agora neste grupo.')
        } catch (erro) {
            const msg = String(erro.message || erro)
            if (msg === 'ocupado') return ctx.reply('⏳ Já tem uma publicação em andamento. Espera um pouco.')
            if (msg === 'whatsapp_offline') return ctx.reply('WhatsApp ainda não está pronto.')
            log('agora falhou:', msg)
            return ctx.reply('Não rolou agora. Olha o log [SHOPEE] no terminal — o bot segue no ar.')
        }
    }

    return ctx.reply(ajuda(p))
}

module.exports = handler
module.exports.parseIntervalo = parseIntervalo
module.exports.parseHorario = parseHorario
