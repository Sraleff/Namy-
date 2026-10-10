const config = require('../config')
const { ehDono } = require('../funcoes/jid')
const tenants = require('./tenants')
const planos = require('./planos')
const cripto = require('./cripto')

const ERROS = {
    id_invalido: 'ID inválido. Use 2–32 caracteres: a-z, 0-9, _ ou -.',
    plano_invalido: 'Plano inválido.',
    ja_existe: 'Já existe um cliente com esse ID.',
    cliente_inexistente: 'Cliente não encontrado.',
    grupo_de_outro_cliente: 'Este grupo já pertence a outro cliente. Desvincule antes.',
    limite_grupos: 'Limite de grupos do plano atingido.',
    numero_invalido: 'Número inválido. Use DDI+DDD+número.',
    numero_de_outro_cliente: 'Esse número já administra outro cliente.'
}

function ajuda(p) {
    return [
        '🏢 *Painel Master — Clientes* (só donos)',
        '',
        `\`${p}cliente planos\``,
        `\`${p}cliente criar <id> <plano> <nome>\``,
        `\`${p}cliente listar\``,
        `\`${p}cliente info <id>\``,
        `\`${p}cliente admin <id> <numero>\` — quem usa o !minhaconta`,
        `\`${p}cliente tiraradmin <id> <numero>\``,
        `\`${p}cliente plano <id> <plano>\``,
        `\`${p}cliente ativar <id>\` / \`desativar <id>\``,
        `\`${p}cliente renovar <id> <dias>\``,
        `\`${p}cliente vincular <id>\` — no grupo`,
        `\`${p}cliente desvincular\` — no grupo`,
        `\`${p}cliente remover <id> confirmar\``,
        '',
        `Cofre de chaves: ${cripto.disponivel() ? '🟢 ok' : '🔴 defina SAAS_MASTER_KEY no .env'}`
    ].join('\n')
}

function data(ms) {
    return ms ? new Date(ms).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'
}

function resumo(id, t) {
    const p = planos.obter(t.plano) || {}
    const vencido = t.venceEm && Date.now() > t.venceEm
    const estado = !t.ativo ? '🔴 inativo' : vencido ? '🟠 vencido' : '🟢 ativo'
    return `• *${t.nome}* (\`${id}\`) ${estado}\n  Plano ${p.nome || t.plano} · vence ${data(t.venceEm)}\n  Grupos ${tenants.gruposDo(id).length}/${planos.fmt(p.maxGrupos)} · hoje ${tenants.usoHoje(id)}/${planos.fmt(p.maxAnunciosDia)}\n  Admins: ${(t.admins || []).length} · chaves: ${t.cred ? 'cadastradas' : 'nenhuma'}`
}

async function handler(ctx) {
    if (!ehDono(ctx, config)) return ctx.reply('🚫 Área administrativa.')

    const p = config.prefix
    const acao = String(ctx.args[0] || '').toLowerCase()
    const id = tenants.validarId(ctx.args[1])

    if (acao === 'planos') {
        const linhas = planos.listar().map((x) =>
            `• *${x.nome}* (\`${x.id}\`): ${planos.fmt(x.maxGrupos)} grupos · ${planos.fmt(x.maxAnunciosDia)} anúncios/dia · chave da casa: ${x.permiteChaveCasa ? 'sim' : 'não'}`)
        return ctx.reply(['📋 *Planos*', '', ...linhas].join('\n'))
    }

    if (acao === 'criar') {
        const plano = String(ctx.args[2] || 'basico').toLowerCase()
        const nome = ctx.args.slice(3).join(' ')
        const r = tenants.criar(ctx.args[1], nome, plano)
        if (!r.ok) return ctx.reply('❌ ' + (ERROS[r.erro] || r.erro))
        return ctx.reply(`✅ Cliente \`${r.id}\` criado no plano *${plano}* (30 dias).\nAgora: \`${p}cliente admin ${r.id} 55DDDNUMERO\``)
    }

    if (acao === 'listar') {
        const lista = Object.entries(tenants.listar())
        if (!lista.length) return ctx.reply('Nenhum cliente cadastrado.')
        return ctx.reply(`🏢 *Clientes* (${lista.length})\n\n` + lista.map(([k, t]) => resumo(k, t)).join('\n\n'))
    }

    if (acao === 'vincular') {
        if (!ctx.isGroup) return ctx.reply('Use dentro do grupo.')
        if (!id) return ctx.reply(`Use \`${p}cliente vincular <id>\`.`)
        const r = tenants.vincularGrupo(ctx.from, id)
        return ctx.reply(r.ok ? `🔗 Grupo vinculado ao cliente \`${id}\`.` : '❌ ' + (ERROS[r.erro] || r.erro))
    }

    if (acao === 'desvincular') {
        if (!ctx.isGroup) return ctx.reply('Use dentro do grupo.')
        tenants.desvincularGrupo(ctx.from)
        return ctx.reply('🔓 Grupo desvinculado. Volta a ser da plataforma.')
    }

    if (['info', 'plano', 'ativar', 'desativar', 'renovar', 'remover', 'admin', 'tiraradmin'].includes(acao)) {
        if (!id || !tenants.obter(id)) return ctx.reply('❌ ' + ERROS.cliente_inexistente)

        if (acao === 'info') return ctx.reply(resumo(id, tenants.obter(id)))

        if (acao === 'admin') {
            const r = tenants.adicionarAdmin(id, ctx.args[2])
            return ctx.reply(r.ok ? `👤 ${r.numero} agora administra \`${id}\` pelo \`${p}minhaconta\`.` : '❌ ' + (ERROS[r.erro] || r.erro))
        }

        if (acao === 'tiraradmin') {
            tenants.removerAdmin(id, ctx.args[2])
            return ctx.reply('✅ Admin removido.')
        }

        if (acao === 'plano') {
            const novo = String(ctx.args[2] || '').toLowerCase()
            if (!planos.obter(novo)) return ctx.reply('❌ ' + ERROS.plano_invalido)
            tenants.patch(id, { plano: novo })
            return ctx.reply(`📦 Plano de \`${id}\`: *${novo}*. Grupos acima do limite continuam vinculados, mas novos não entram.`)
        }

        if (acao === 'ativar' || acao === 'desativar') {
            tenants.patch(id, { ativo: acao === 'ativar' })
            return ctx.reply(acao === 'ativar' ? `🟢 \`${id}\` ativado.` : `🔴 \`${id}\` desativado. Publicações e IA pausadas.`)
        }

        if (acao === 'renovar') {
            const dias = Math.floor(Number(ctx.args[2]))
            if (!Number.isFinite(dias) || dias < 1 || dias > 366) return ctx.reply('Informe os dias (1–366).')
            return ctx.reply(`🗓️ \`${id}\` vence em ${data(tenants.renovar(id, dias))}.`)
        }

        if (acao === 'remover') {
            if (String(ctx.args[2] || '').toLowerCase() !== 'confirmar') {
                return ctx.reply(`Isso apaga o cliente, as chaves e desvincula os grupos. Confirme: \`${p}cliente remover ${id} confirmar\``)
            }
            tenants.remover(id)
            return ctx.reply(`🗑️ Cliente \`${id}\` removido.`)
        }
    }

    return ctx.reply(ajuda(p))
}

module.exports = handler
