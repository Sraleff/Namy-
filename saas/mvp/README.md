# Namy SaaS MVP (painel afiliado)

API + painel web local + comando `!link` para a Namy 3.0.

## 1. Subir o painel (PC)

```bash
cd saas/mvp
npm install
npm start
```

Abra: **http://localhost:3847**

1. Cadastre email/senha  
2. Cole o **link de afiliado** e salve  
3. Copie o **Token do bot**

## 2. Ligar na Namy

No `.env` da pasta da Namy:

```env
NAMY_SAAS_URL=http://localhost:3847
NAMY_BOT_TOKEN=cole_o_token_aqui
```

Copie `saas/mvp/bot-plugin/link.js` → `comandos/link.js`

Em `comandos/index.js` adicione:

```js
const link = require('./link')
// dentro do module.exports:
link,
```

Reinicie a Namy:

```bash
node index.js
```

No WhatsApp:

```text
!link
```

Deve mandar o template com o link salvo no painel.

## Rotas da API

| Método | Rota | Auth |
|--------|------|------|
| POST | /auth/register | — |
| POST | /auth/login | — |
| GET | /me | Bearer JWT |
| GET/PUT | /config | Bearer JWT |
| GET | /subscription | Bearer JWT |
| GET | /bot/config | header x-bot-token |
| POST | /bot/status | header x-bot-token |

Dados em `api/data/*.json` (só local).

## Próximos passos (não inclusos neste MVP)

- Mercado Pago / Stripe  
- Multi-worker / pareamento pelo painel  
- App (WebView)  
