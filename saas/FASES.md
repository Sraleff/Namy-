# Namy SaaS — o que tem e o que falta

Branch: `namy-3.1-saas`
Painel do cliente: `saas/client-panel`
Bot: raiz (`node index.js`) + `comandos/link.js`
Sessões WhatsApp do cliente: gerenciadas pelo painel (`saas/client-panel/api/sessions.js`)

## Fase 1 — MVP (afiliado salva link, bot manda)

| Peca | Status | Onde |
|------|--------|------|
| API login / cadastro | Pronto | `saas/client-panel/api/server.js` |
| Salvar link + template | Pronto | `PUT /config` |
| Checar licenca na API | Pronto | `GET /bot/config` devolve 403 se venceu |
| Painel email/senha/link/status | Pronto | `saas/client-panel/panel/index.html` |
| Bot `!link` le o painel | Pronto | `comandos/link.js` |
| Bot avisa online/offline | Novo | `funcoes/painelStatus.js` (ver gancho abaixo) |
| Pareamento real pela aba WhatsApp | Pronto | QR + codigo via Baileys no servidor (`/whatsapp/*`) |

Teste que prova que nasceu:

1. `cd saas/client-panel && npm start`
2. Abra http://localhost:3847 → crie conta → aba WhatsApp → Conectar → escaneie QR ou use codigo
3. Status muda para Online no painel
4. Aba Anuncios → cole um link → Salvar
5. No WhatsApp da sessao do painel: `!ping` responde (roteamento completo de comandos em integração)

## Fase 2 — multi-cliente

| Peca | Status |
|------|--------|
| 1 login = 1 config = 1 botToken = 1 numero | Pronto no JSON do painel |
| Licenca vencida bloqueia `/bot/config` | Pronto (403) |
| `!link` recusa se 403 | Pronto |
| Bot nao sobe se licenca venceu | Parcial: `funcoes/painelStatus.js` avisa; nao mata o processo (o dono da casa ainda usa o bot) |
| Status offline / pareando / online | Pronto (polling + gravarStatus) |
| Isolamento de sessões por userId | Pronto (`data/sessions/<userId>`) |
| Varios workers na nuvem (1 processo por cliente) | Falta |

Nao tem flood, "postar em todos" nem varios numeros no mesmo login.

## Fase 3 — cobranca

| Peca | Status |
|------|--------|
| Mercado Pago / Stripe | Falta (nao cobrar sem webhook real) |
| Plano trial 30 dias | Pronto (`license.plan = trial`) |
| Ligar/desligar licenca na mao | Dono edita `license.active` e `expiresAt` em `api/data/configs.json` |

## Fase 4 — app

| Peca | Status |
|------|--------|
| Site mobile do painel | Pronto (abre no celular) |
| APK WebView | Falta |
| Pareamento real pela tela | Pronto (QR Code + codigo de pareamento gerados pelo Baileys no backend) |

## Gancho no index.js (status)

No topo do `index.js`, depois dos outros requires:

```js
const painelStatus = require('./funcoes/painelStatus')
```

Dentro de `connection === 'open'`, depois do banner:

```js
painelStatus.avisar('online').catch(() => {})
```

Dentro de `connection === 'close'`, antes do reconnect:

```js
painelStatus.avisar('offline').catch(() => {})
```

Sem `NAMY_BOT_TOKEN` o gancho nao faz nada. O bot da casa continua.

**Nota:** O modo casa (`node index.js`) continua funcional para administração. O cliente usa apenas o painel (sessões isoladas no processo do painel).
