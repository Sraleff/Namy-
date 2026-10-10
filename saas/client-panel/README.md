# Painel do cliente Namy

O afiliado **nao** usa terminal. Ele so abre o site.

## Como o cliente usa

1. Abre o link do painel
2. Cria conta / entra (trial de 30 dias)
3. Conecta WhatsApp (QR ou codigo na tela)
4. Cola App ID e Secret da Shopee (o secret nao volta para a tela)
5. Salva o link de afiliado e o horario dos anuncios
6. Lista os grupos, marca e salva
7. Toca em **Testar bot agora** e ve sucesso ou falha por grupo
8. Na aba Conta, assina mensal ou trimestral quando o servidor tiver Mercado Pago

## Como voce sobe (uma vez)

```bash
cd saas/client-panel
npm install
cp .env.example .env
npm start
```

Painel: http://localhost:3847

Em producao o painel precisa de HTTPS. Coloque no `.env` do painel:

- `JWT_SECRET` — segredo longo, so seu
- `MP_ACCESS_TOKEN` — access token do Mercado Pago
- `PUBLIC_URL` — URL publica do painel, sem barra no fim (o webhook usa ela)
- `NAMY_PRICE_MENSAL` e `NAMY_PRICE_TRIMESTRAL` — opcional (padrao 49 e 129)

No painel do Mercado Pago, a notificacao aponta para `PUBLIC_URL/webhooks/mercadopago`. O servidor responde 200 e so ativa a licenca depois de consultar o pagamento na API oficial. Valor menor que o plano e ignorado. O mesmo pagamento nao estende a licenca duas vezes.

## Pastas

- `panel/index.html` — app do cliente
- `api/server.js` — login, config, cobranca, logs
- `api/waRoutes.js` — WhatsApp, grupos, testes
- `api/sessions.js` — sessao Baileys por conta (`api/data/sessions/<userId>`, fora do Git)
- `api/billing.js` — Mercado Pago
- `api/logs.js` — ultimos envios, sem secret

Instrucoes de Termux e PC: [COMO-LIGAR.md](../../COMO-LIGAR.md) na raiz do repositorio.
