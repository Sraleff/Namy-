# Painel do cliente Namy (completo)

O afiliado **nao** usa terminal. Ele so abre o site/app.

## Como o cliente usa

1. Abre o link do painel
2. Cria conta / entra
3. Conecta WhatsApp (numero + codigo na tela)
4. Cola App ID e Secret da Shopee
5. Liga anuncios (intervalo, limite, horario)
6. Salva link de afiliado

Pronto. Sem npm, sem .env, sem Git.

## Como VOCE sobe (uma vez, no servidor)

```bash
cd saas/client-panel
npm install
npm start
```

Painel: http://localhost:3847

Em producao: HTTPS + dominio.

## Pastas

- `panel/index.html` — app do cliente
- `api/server.js` — API do painel
