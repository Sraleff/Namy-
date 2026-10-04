# Namy 3.0 — o que foi feito em cima da 2.3.0

A 2.3.0 já tinha fallback Groq/xAI e o interpolador de histórico corrigido. Esta versão fecha os buracos reais e adiciona o resto da lista.

## Crítico

- `!ia on` entra no fluxo de mensagens comuns.
- Decisão por pontuação: menção, pergunta, reply, kkkk, flood do grupo.
- `!ia nivel 30` controla o quanto ela fala.
- Histórico `${from}:${jid}` + contexto `grupo:${from}`.
- Fallback Groq → xAI → Gemini, com rodízio no modo auto.
- Donos só via `OWNERS` no `.env`.

## Cérebro (`funcoes/ia/`)

router, providers, groq, xai, gemini, fallback, historico, memoria, contexto, decisao, personalidade, autonomia.

## Memória

Perfil / preferências / conversa / preferências da Namy.
`!memoria` `!memoria limpar` `!memoria esquecer nome`

## Personalidade

Tom escolhido por contexto e **mantido alguns minutos**. Sem sorteio a cada mensagem.

## Grupos

ban, kick, unban, promover, rebaixar, admins, membros, grupo, bemvindo, despedida, antilink, antispam, antiinvite.

## Extra

lembretes, clima, cotação, CEP, tradutor, wiki, notícias, jogos, ranking, stats.
Persistência em `dados/namy.json` (tabelas estilo SQLite, sem módulo nativo — Termux-friendly).
Migra sozinha `ia_estado.json`, `ia_historico.json` e `dados/memorias.json` da 2.x.

## Shopee Afiliados

Módulo em `shopee/`. API oficial GraphQL BR + SHA256. Scheduler por grupo cadastrado. IA opcional, template se a IA cair. `dados/shopee.json` separado. `!shopee todos on` não pega grupo que não foi cadastrado.
