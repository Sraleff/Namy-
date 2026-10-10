# Pareamento real no painel

O cliente NAO instala Node. O Baileys roda no processo do painel (`saas/client-panel`).

## Dono sobe uma vez

```bash
cd saas/client-panel
npm install
npm start
```

Cliente abre http://localhost:3847 (ou o IP do servidor).

## Fluxo do cliente

1. Criar conta / entrar
2. Shopee e anuncios
3. Aba WhatsApp → numero com DDI → Conectar
4. O painel mostra o codigo REAL (e o QR se o Baileys emitir)
5. WhatsApp → Aparelhos conectados → Conectar com numero
6. Status vira Online. `!ping` responde `pong — Namy conectada pelo painel`

## Isolamento

- Uma sessao por conta (`data/sessions/<userId>/`)
- Nao sobe dois sockets para a mesma conta
- Auth nunca vai pro Git nem pro navegador (so o QR/codigo da propria conta logada)
- Licenca vencida bloqueia conectar

## Nao rode os dois no mesmo numero

`node index.js` usa `./sessao` (modo dono/dev).
O painel usa `saas/client-panel/api/data/sessions/`.
Mesmo numero nos dois = WhatsApp derruba um.

## Producao

Precisa de processo Node persistente (VPS, nao serverless). Trafego WhatsApp Web nao foi validado neste ambiente.

Restaurar sessoes apos reboot:

```bash
RESTORE_SESSIONS=1 npm start
```

## O que ainda nao e o cerebro completo

A sessao do painel responde `!ping`. Comandos de IA, Shopee e menu continuam no `node index.js` (modo dono) ate o roteador de mensagens por tenant ser ligado. O pareamento e o status sao reais.
