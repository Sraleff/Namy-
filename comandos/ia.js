const config = require('../config')
const iaEstado = require('../funcoes/ia')
const { statusProvedores } = require('../funcoes/ia/providers')
const router = require('../funcoes/ia/router')
const decisao = require('../funcoes/ia/decisao')
const { ehDono } = require('../funcoes/jid')

async function perguntarIA(texto, _historico, jid, from, extras = {}) {
    const fakeCtx = {
        from,
        senderJid: jid,
        isGroup: String(from).endsWith('@g.us'),
        body: texto,
        ...extras
    }
    return router.conversar({ client: extras.client, ctx: fakeCtx, texto })
}

async function comandoIA(ctx) {
    const acao = (ctx.args[0] || '').toLowerCase()
    const acoesControle = [
        'on', 'ligar', 'off', 'desligar',
        'status', 'limpar', 'clear', 'modo', 'nivel', 'nível'
    ]

    if (acoesControle.includes(acao)) {
        if (acao === 'modo') {
            const qual = (ctx.args[1] || '').toLowerCase()
            const atual = iaEstado.obterModo(ctx.from)
            const nome = {
                xai: 'Namy Grok',
                grok: 'Namy Grok',
                auto: 'Namy Auto',
                gemini: 'Namy Gemini',
                groq: 'Namy Groq'
            }[atual] || 'Namy Groq'

            if (!qual) {
                return ctx.reply(
                    `🧠 Modo atual: *${nome}*\n\n${statusProvedores()}\n\n` +
                    `Use:\n• !ia modo grok\n• !ia modo groq\n• !ia modo gemini\n• !ia modo auto`
                )
            }

            if (['grok', 'xai'].includes(qual)) {
                iaEstado.definirModo(ctx.from, 'xai')
                return ctx.reply('🚀 Modo *Namy Grok* ativado. Se falhar, cai no próximo provedor.')
            }
            if (['auto', 'automatico', 'automático'].includes(qual)) {
                iaEstado.definirModo(ctx.from, 'auto')
                return ctx.reply('🔄 Modo *Namy Auto* ativado. Groq → xAI → Gemini, com rodízio.')
            }
            if (['gemini', 'gem'].includes(qual)) {
                iaEstado.definirModo(ctx.from, 'gemini')
                return ctx.reply('✨ Modo *Namy Gemini* ativado.')
            }
            if (['normal', 'groq'].includes(qual)) {
                iaEstado.definirModo(ctx.from, 'groq')
                return ctx.reply('🌸 Modo *Namy Groq* ativado.')
            }
            return ctx.reply('Usa: !ia modo grok | groq | gemini | auto')
        }

        if (acao === 'nivel' || acao === 'nível') {
            if (!ehDono(ctx, config) && ctx.isGroup) {
                return ctx.reply('🚫 Só dono/admin define o nível da IA no grupo.')
            }
            const n = ctx.args[1]
            if (!n) {
                return ctx.reply(`🎯 Nível atual: *${decisao.obterNivel(ctx.from)}*\nQuanto menor, mais ela fala. Padrão 50.`)
            }
            const definido = decisao.definirNivel(ctx.from, n)
            return ctx.reply(`🎯 Nível da IA em *${definido}*. Abaixo disso ela fica quieta.`)
        }

        const iaControle = require('./iaControle')
        return iaControle(ctx)
    }

    const texto = ctx.args.join(' ').trim()
    if (!texto) {
        return ctx.reply(
            '🤖 *Como usar a IA da Namy*\n\n' +
            '• `!ia oi tudo bem?` → conversar\n' +
            '• `!ia on` → ligar IA automática\n' +
            '• `!ia off` → desligar\n' +
            '• `!ia modo auto` → Groq → xAI → Gemini\n' +
            '• `!ia modo grok` / `groq` / `gemini`\n' +
            '• `!ia nivel 50` → probabilidade de resposta\n' +
            '• `!ia status` → ver status\n' +
            '• `!ia limpar` → apagar histórico'
        )
    }

    try {
        await ctx.client.sendPresenceUpdate('composing', ctx.from).catch(() => {})
        const resposta = await router.conversar({ client: ctx.client, ctx, texto })
        if (!resposta) return ctx.reply('🤔 Travou aqui... tenta de novo?')
        await ctx.reply(resposta)
    } catch (erro) {
        console.error('Erro na IA:', erro.response?.data || erro.message)
        const msg = erro.response?.data?.error?.message || erro.message || ''
        if (msg.includes('429') || /rate_limit/i.test(msg)) {
            return ctx.reply('⏳ Os provedores bateram no limite. Espera um pouco.')
        }
        if (/GROQ_API_KEY|XAI_API_KEY|GEMINI_API_KEY|Nenhuma chave/i.test(msg)) {
            return ctx.reply('❌ Nenhuma chave de IA válida no `.env`.')
        }
        await ctx.reply('❌ Os provedores de IA não responderam agora.')
    }
}

module.exports = comandoIA
module.exports.perguntarIA = perguntarIA
