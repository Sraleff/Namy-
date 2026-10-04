const config = require('../config')
const iaEstado = require('../funcoes/ia')
const { statusProvedores } = require('../funcoes/ia/providers')
const { ehDono } = require('../funcoes/jid')
const decisao = require('../funcoes/ia/decisao')
const { obterTom } = require('../funcoes/ia/personalidade')
const grupo = require('../funcoes/grupo')

module.exports = async function iaControle(ctx) {
    if (!ehDono(ctx, config)) {
        return ctx.reply('🚫 Só os donos da Namy podem controlar a IA automática.')
    }

    const acao = (ctx.args[0] || '').toLowerCase()

    if (acao === 'on' || acao === 'ligar') {
        iaEstado.ativar(ctx.from)
        return ctx.reply(
            '🤖✨ *IA automática ativada!*\n\n' +
            'Agora a Namy entra quando fizer sentido — se te chamarem, se for pergunta, se responderem ela.\n' +
            'Ela *não* vai responder cada "kkkk" do grupo.\n' +
            'Use `!ia off` para desligar. `!ia nivel 50` ajusta a frequência.'
        )
    }

    if (acao === 'off' || acao === 'desligar') {
        iaEstado.desativar(ctx.from)
        return ctx.reply('🔕 IA automática desativada neste chat.')
    }

    if (acao === 'status') {
        const ativa = iaEstado.estaAtiva(ctx.from)
        const modo = iaEstado.obterModo(ctx.from)
        const provedor = iaEstado.obterUltimoProvedor(ctx.from)
        const modoNome = { xai: 'Grok', grok: 'Grok', auto: 'Auto', gemini: 'Gemini', groq: 'Groq' }[modo] || 'Groq'
        const g = grupo.obter(ctx.from)
        return ctx.reply(
            `🧠 *IA do ${ctx.isGroup ? 'grupo' : 'chat'}*\n\n` +
            `Status: ${ativa ? '🟢 ON' : '🔴 OFF'}\n` +
            `Modelo: *${modoNome}*\n` +
            `Interação: *${decisao.obterNivel(ctx.from)}%*\n` +
            `Personalidade: *${obterTom(ctx.from, '')}*\n` +
            `Memória: ON\n` +
            `Último provedor: *${provedor || 'nenhum'}*\n` +
            `Antilink: ${g.antilink ? 'ON' : 'OFF'}\n\n` +
            `${statusProvedores()}`
        )
    }

    if (acao === 'limpar' || acao === 'clear') {
        iaEstado.limparHistorico(ctx.from)
        const jid = ctx.senderJid || ctx.from
        if (ctx.isGroup) {
            const historico = require('../funcoes/ia/historico')
            historico.limpar(historico.chavePessoa(ctx.from, jid, true))
        }
        return ctx.reply('🧹 Memória da conversa apagada. Começamos do zero!')
    }

    return ctx.reply(
        '🤖 *Controle da IA da Namy*\n\n' +
        '`!ia on` → ligar IA automática\n' +
        '`!ia off` → desligar\n' +
        '`!ia status` → status + provedores\n' +
        '`!ia modo auto` → fallback Groq → xAI → Gemini\n' +
        '`!ia nivel 50` → frequência de resposta\n' +
        '`!ia limpar` → apagar memória da conversa'
    )
}

module.exports.ehDono = (ctx) => ehDono(ctx, config)
