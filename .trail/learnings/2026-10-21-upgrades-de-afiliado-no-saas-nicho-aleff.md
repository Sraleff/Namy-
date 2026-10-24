---
title: "Upgrades de afiliado no SaaS: nicho por grupo, troca de links, ML OAuth, imagens"
author: Aleff
date: 2026-10-21
branch: namy-3.1-saas
touches:
  - saas/client-panel/.env.example
  - saas/client-panel/api/ofertas.js
  - saas/client-panel/api/scheduler.js
  - saas/client-panel/api/server.js
  - saas/client-panel/api/sessions.js
  - saas/client-panel/api/waRoutes.js
  - saas/client-panel/dashboard/src/App.jsx
  - saas/client-panel/dashboard/src/components/layout/navigation.js
  - saas/client-panel/dashboard/src/pages/Automations.jsx
  - saas/client-panel/dashboard/src/pages/Groups.jsx
---

## Decided
- Tudo novo fica em saas/client-panel/api/afiliados/. Os pontos ligados ao que já existia: scheduler.js e waRoutes.js (/ads/test, /bot/test) chamam afiliados/publicador.publicar; o contrato de retorno é o mesmo do divulgar.publicarOferta. /shopee/test continua no publicarOferta antigo.
- O nicho fica em cfg.groups[i].niche/keywords. POST /whatsapp/groups mantém o nicho salvo quando o body não manda (o painel clássico não manda). Sem nicho = geral = comportamento antigo.
- ofertas.preparar ganhou opts opcionais (keyword, aceitar, rejeitados, evitar). Sem opts, faz o mesmo de antes.
- Mercado Livre: link pela etiqueta (matt_word + matt_tool) é separado do OAuth (PKCE + state de uso único em memória). O token fica cifrado com saas/cripto.js e exige SAAS_MASTER_KEY no .env do client-panel. O refresh_token do ML é de uso único, então o renovar() tem trava por usuário.
- Se um link de marketplace não puder ser trocado ou validado, a mensagem inteira é barrada. Nunca vai link de outra pessoa.
- sessions.js ganhou onMensagem(fn), usado pela captura de grupo fonte e pelo !nicho (só fromMe e recente), e sendOffer({imagePath}) só para arquivo dentro de api/data.

## Tried and ruled out
- Gerar link do ML pelo gerador do portal (/sec/): exige cookie de sessão do navegador. Foi descartado de propósito.
- Validar link da Amazon abrindo a página: a Amazon devolve 503 para robô. A validação é só de formato, ASIN e tag.

## Watch out
- Rodar o server de teste como root cria pastas em api/data com dono root. Use outra PORT com RESTORE_SESSIONS=0 DIVULGACAO_FILA=0 e dê chown depois.
- Não rode git stash/pop como root: deixa .git/objects com dono root.
- Os testes trocam ofertas.encurtar e links.validarAoVivo por stubs (sem rede). Ao mudar esses nomes, ajuste afiliados.test.js.
