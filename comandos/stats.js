const stats = require('../funcoes/stats')
const config = require('../config')
const { ehDono } = require('../funcoes/jid')

module.exports = async function statsCmd(ctx) {
    if (!ehDono(ctx, config)) return ctx.reply('🚫 Só o dono vê as stats globais.')
    const s = stats.resumo()
    const cmds = s.comandos.map(([k, v]) => `• !${k}: ${v}`).join('\n') || '—'
    await ctx.reply(
        `📊 *Namy Stats*\n\n` +
        `Mensagens: ${s.mensagens}\n` +
        `Usuários: ${s.usuarios}\n` +
        `Grupos: ${s.grupos}\n\n` +
        `IA:\nGroq: ${s.ia.groq}\nxAI: ${s.ia.xai}\nGemini: ${s.ia.gemini}\n\n` +
        `Comandos:\n${cmds}`
    )
}
