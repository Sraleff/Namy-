# Namy SaaS

## MVP do painel afiliado

Pasta: [`saas/mvp/`](mvp/)

### Subir no PC / Termux

```bash
cd saas/mvp
npm install
npm start
```

Painel: **http://localhost:3847**

1. Cadastre email/senha
2. Salve o link de afiliado
3. Copie o **botToken**

### Ligar na Namy

No `.env` da raiz do bot:

```env
NAMY_SAAS_URL=http://localhost:3847
NAMY_BOT_TOKEN=cole_o_token_do_painel
```

Copie `saas/mvp/bot-plugin/link.js` → `comandos/link.js` e registre no `comandos/index.js`:

```js
const link = require('./link')
// module.exports: link,
```

No WhatsApp: `!link`

### O que está incluso

- API (login, config, licença trial 30 dias)
- Painel web
- Plugin `!link`

### Ainda não incluso

- Mercado Pago / Stripe
- Multi-worker na nuvem
- App APK
