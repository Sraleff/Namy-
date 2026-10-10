/**
 * !link - busca link de afiliado no painel SaaS
 *
 * .env:
 *   NAMY_SAAS_URL=http://localhost:3847
 *   NAMY_BOT_TOKEN=token_do_painel
 */
const axios = require('axios')

async function buscarConfigAfiliado() {
  const base = process.env.NAMY_SAAS_URL || 'http://localhost:3847'
  const token = process.env.NAMY_BOT_TOKEN
  if (!token) return null
  const { data } = await axios.get(base.replace(/\/$/, '') + '/bot/config', {
    headers: { 'x-bot-token': token },
    timeout: 10000
  })
  return data
}

module.exports = async function linkCmd(ctx) {
  try {
    const cfg = await buscarConfigAfiliado()
    if (!cfg) {
      return ctx.reply(
        'SaaS nao configurado.\n' +
        'No .env da Namy:\n' +
        'NAMY_SAAS_URL=http://localhost:3847\n' +
        'NAMY_BOT_TOKEN=token_do_painel'
      )
    }
    const url = cfg.affiliate && cfg.affiliate.link
    if (!url) {
      return ctx.reply('Nenhum link de afiliado salvo no painel ainda.')
    }
    const tpl = (cfg.affiliate && cfg.affiliate.template) || 'Meu link: {link}'
    const msg = tpl.replace(/\{link\}/gi, url)
    return ctx.reply(msg)
  } catch (e) {
    const status = e.response && e.response.status
    if (status === 403) return ctx.reply('Licenca do painel expirada ou inativa.')
    console.error('!link saas:', e.message)
    return ctx.reply('Nao consegui falar com o painel SaaS agora.')
  }
}
