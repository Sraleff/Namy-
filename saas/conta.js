// !minhaconta — "Painel do Cliente" pelo WhatsApp. Cada cliente só enxerga e altera o que é dele.
const config = require('../config')
const tenants = require('./tenants')
const planos = require('./planos')
const credenciais = require('./credenciais')
const cripto = require('./cripto')
const contexto = require('./contexto')

const RE_APPID = /^\d{3,20}$/
const RE_SEGREDO = /^[A-Za-z0-9_\-.]{8,200}$/

function ajuda(p) {
    return [
        '👤 *Minha conta* (Painel do Cliente)',
        '',
        '*No privado com o bot:*',
        `\`${p}minhaconta status\``,
        `\`${p}minhaconta shopee <AppId> <Secret>\``,
        `\`${p}minhaconta ia groq|xai|gemini <chave>\``,
        `\`${p}minhaconta remover shopee|groq|xai|gemini\``,
        `\`${p}minhaconta casa on|off\` — chaves da plataforma (se o plano incluir)`,
        `\`${p}minhaconta grupos\``,
        '',
        '*Dentro do seu grupo:*',
        `\`${p}minhaconta vincular\` — adiciona o grupo à sua conta`,
        `\`${p}minhaconta ligar\` / \`desligar\` — ofertas neste grupo`,
        `\`${p}minhaconta intervalo 2h\` · \`limite 10\` · \`horario 09:00-22:00\``,
        `\`${p}minhaconta keyword fone bluetooth\``,
        '',
        '🔒 Nunca mande chave em grupo.'
    ].join('\n')
}

function data(ms) {
    return ms ? new Date(ms).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'
}

async function apagar(ctx) {
    try { await ctx.client.sendMessage(ctx.from, { delete: ctx.info.key }) } catch (_) {}
}

function shopeeGrupos() {
    return require('../shopee/grupos')
}

async function testarShopee(id, appId, secret) {
    const api = require('../shopee/api')
    try {
        await contexto.executar({ tenant: id, shopee: { appId, secret }, ia: {} },
            () => api.buscarProdutos({ limit: 1 }))
        return 'ok'
    } catch (e) {
        return e.code === 'AUTH_TENANT' ? 'recusada' : 'sem_teste'
    }
}

function liberarGrupos(id) {
    const g = shopeeGrupos()
    for (const jid of tenants.gruposDo(id)) {
        if (g.obter(jid)) g.patch(jid, { cooldownUntil: 0, nextRunAt: Date.now(), lastError: '' })
    }
}

async function acoesPrivadas(ctx, id, acao, resto, p) {
    if (ctx.isGroup) {
        await apagar(ctx)
        return ctx.reply('🔒 Chave não se manda em grupo. Mande no privado comigo e gere uma chave nova se essa vazou.')
    }
    if (!cripto.disponivel()) {
        return ctx.reply('⚠️ O cofre de chaves ainda não foi configurado pela plataforma. Fale com o suporte.')
    }

    if (acao === 'shopee') {
        const [appId, secret] = resto
        if (!RE_APPID.test(appId || '') || !RE_SEGREDO.test(secret || '')) {
            return ctx.reply(`Formato: \`${p}minhaconta shopee <AppId> <Secret>\`\nPegue em affiliate.shopee.com.br/open_api`)
        }
        const teste = await testarShopee(id, appId, secret)
        if (teste === 'recusada') return ctx.reply('❌ A Shopee recusou essas chaves. Nada foi salvo. Confira AppId e Secret.')
        credenciais.setShopee(id, appId, secret)
        liberarGrupos(id)
        return ctx.reply(teste === 'ok'
            ? '✅ Shopee conectada e validada. Apague a mensagem com a chave deste chat.'
            : '💾 Shopee salva, mas não consegui validar agora (rede/API). Apague a mensagem com a chave deste chat.')
    }

    if (acao === 'ia') {
        const prov = String(resto[0] || '').toLowerCase()
        const chave = resto[1] || ''
        if (!credenciais.PROVEDORES_IA.includes(prov) || !RE_SEGREDO.test(chave)) {
            return ctx.reply(`Formato: \`${p}minhaconta ia groq|xai|gemini <chave>\``)
        }
        credenciais.setIA(id, prov, chave)
        return ctx.reply(`✅ Chave ${prov} salva (${credenciais.mascara(chave)}). Apague a mensagem com a chave deste chat.`)
    }

    if (acao === 'remover') {
        const campo = String(resto[0] || '').toLowerCase()
        if (!['shopee', ...credenciais.PROVEDORES_IA].includes(campo)) {
            return ctx.reply(`Use \`${p}minhaconta remover shopee|groq|xai|gemini\``)
        }
        credenciais.remover(id, campo)
        return ctx.reply(`🗑️ ${campo} removida.`)
    }
}

async function acoesDoGrupo(ctx, id, acao, resto, p) {
    if (!ctx.isGroup) return ctx.reply('Use este comando dentro do grupo.')
    const grupo = require('../funcoes/grupo')
    const g = shopeeGrupos()

    if (acao === 'vincular') {
        if (!(await grupo.ehAdmin(ctx.client, ctx.from, ctx.senderJid))) {
            return ctx.reply('Só admin do grupo pode vincular.')
        }
        const r = tenants.vincularGrupo(ctx.from, id)
        if (!r.ok) {
            const msg = { grupo_de_outro_cliente: 'Este grupo já pertence a outra conta.', limite_grupos: 'Limite de grupos do seu plano atingido.' }
            return ctx.reply('❌ ' + (msg[r.erro] || r.erro))
        }
        if (!g.obter(ctx.from)) {
            let nome = ''
            try { nome = (await ctx.client.groupMetadata(ctx.from))?.subject || '' } catch (_) {}
            g.cadastrar(ctx.from, nome)
        }
        return ctx.reply(`🔗 Grupo adicionado à sua conta. Ligue as ofertas com \`${p}minhaconta ligar\`.`)
    }

    if (tenants.donoDoGrupo(ctx.from) !== id) {
        return ctx.reply(`Este grupo não é da sua conta. Use \`${p}minhaconta vincular\` primeiro.`)
    }
    if (!g.obter(ctx.from)) g.cadastrar(ctx.from, '')

    if (acao === 'ligar' || acao === 'desligar') {
        g.setAtivo(ctx.from, acao === 'ligar')
        return ctx.reply(acao === 'ligar' ? '🟢 Ofertas *ligadas* neste grupo.' : '🔴 Ofertas *desligadas* neste grupo.')
    }

    const { parseIntervalo, parseHorario } = require('../shopee/commands')

    if (acao === 'intervalo') {
        const m = parseIntervalo(resto.join(' '))
        if (m == null) return ctx.reply('Ex: `intervalo 2h` ou `90m`. Mínimo 15 min.')
        const v = Math.max(15, Math.min(1440, m))
        g.patch(ctx.from, { intervaloMinutos: v, nextRunAt: Date.now() + v * 60000 })
        return ctx.reply(`⏱️ Intervalo: *${v} min*.`)
    }
    if (acao === 'limite') {
        const n = Math.floor(Number(resto[0]))
        if (!Number.isFinite(n) || n < 1 || n > 200) return ctx.reply('Informe de 1 a 200.')
        g.patch(ctx.from, { limiteDiario: n })
        return ctx.reply(`📊 Limite deste grupo: *${n}/dia* (o teto do plano continua valendo).`)
    }
    if (acao === 'horario' || acao === 'horário') {
        const h = parseHorario(resto.join(' '))
        if (!h) return ctx.reply('Ex: `horario 09:00-22:00`.')
        g.patch(ctx.from, { horarioInicio: h.inicio, horarioFim: h.fim })
        return ctx.reply(`🕒 Horário: *${h.inicio}–${h.fim}*.`)
    }
    if (acao === 'keyword') {
        const k = resto.join(' ').trim()
        const v = /^(limpar|off)$/i.test(k) ? '' : k.slice(0, 80)
        g.patch(ctx.from, { keyword: v })
        return ctx.reply(`🔎 Keyword: *${v || '(ofertas gerais)'}*`)
    }
}

async function handler(ctx) {
    const p = config.prefix
    const id = tenants.tenantDoRemetente(ctx)
    if (!id) return ctx.reply('Este número não está ligado a nenhuma conta de cliente. Fale com o suporte.')

    const t = tenants.obter(id)
    const acao = String(ctx.args[0] || '').toLowerCase()
    const resto = ctx.args.slice(1)

    if (['shopee', 'ia', 'remover'].includes(acao)) return acoesPrivadas(ctx, id, acao, resto, p)
    if (['vincular', 'ligar', 'desligar', 'intervalo', 'limite', 'horario', 'horário', 'keyword'].includes(acao)) {
        return acoesDoGrupo(ctx, id, acao, resto, p)
    }

    if (!tenants.ativoEmDia(t) && acao !== 'status') {
        return ctx.reply('⚠️ Sua conta está inativa ou vencida. Renove para voltar a usar.')
    }

    if (acao === 'casa') {
        const plano = planos.obter(t.plano)
        if (!plano?.permiteChaveCasa) return ctx.reply('Seu plano não inclui as chaves da plataforma. Use as suas.')
        const on = String(resto[0] || '').toLowerCase() === 'on'
        tenants.patch(id, { usarChaveCasa: on })
        return ctx.reply(on ? '🏠 Usando as chaves da plataforma onde você não tiver a sua.' : '🔑 Usando só as suas chaves.')
    }

    if (acao === 'grupos') {
        const g = shopeeGrupos()
        const lista = tenants.gruposDo(id)
        if (!lista.length) return ctx.reply(`Nenhum grupo. Dentro do grupo: \`${p}minhaconta vincular\`.`)
        const linhas = lista.map((jid) => {
            const x = g.obter(jid) || {}
            return `• *${x.nome || jid}* ${x.ativo ? '🟢' : '🔴'} · hoje ${x.postsHoje || 0}/${x.limiteDiario || 5}${x.lastError ? ` · ⚠️ ${x.lastError}` : ''}`
        })
        return ctx.reply(`📦 *Seus grupos* (${lista.length})\n\n${linhas.join('\n')}`)
    }

    if (acao === 'status') {
        const plano = planos.obter(t.plano) || {}
        const r = credenciais.resumo(id)
        const estado = tenants.ativoEmDia(t) ? '🟢 ativa' : '🔴 inativa/vencida'
        return ctx.reply([
            `👤 *${t.nome}* — ${estado}`,
            `Plano: ${plano.nome || t.plano} · vence ${data(t.venceEm)}`,
            `Grupos: ${tenants.gruposDo(id).length}/${planos.fmt(plano.maxGrupos)}`,
            `Anúncios hoje: ${tenants.usoHoje(id)}/${planos.fmt(plano.maxAnunciosDia)}`,
            '',
            '🔑 *Chaves*',
            `Shopee: ${r.shopee}`,
            `Groq: ${r.groq} · xAI: ${r.xai} · Gemini: ${r.gemini}`,
            `Chaves da plataforma: ${credenciais.casaPermitida(t) ? 'ligado' : 'desligado'}`
        ].join('\n'))
    }

    return ctx.reply(ajuda(p))
}

module.exports = handler
