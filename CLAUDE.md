# Namy — instruções para agentes (Claude Code)

## Antes de qualquer tarefa: consulte o mapa (trail)
Este repo tem um mapa de código do **trail** (`.trail/`). Use-o antes de `grep`/ler arquivos:

```bash
bash scripts/trail.sh ask "<o que você vai fazer>" --source   # acha o código + aprendizados
bash scripts/trail.sh callers <funcao>                         # quem chama (antes de renomear/refatorar)
bash scripts/trail.sh skeleton <arquivo>                       # API do arquivo em poucas linhas
bash scripts/trail.sh check                                    # antes de commit/push/PR
bash scripts/trail.sh note                                     # salvar um aprendizado em .trail/learnings/
```

Sempre use `scripts/trail.sh` (não `trail` direto): ele roda como o **dono do repo** com o nvm
carregado. Sessões do Claude Desktop no WSL podem rodar como `root`, e rodar o trail como root
deixaria o cache `.trail/cache/` com dono errado. Detalhes na Skill em `.claude/skills/trail/`.

## Mapa rápido do projeto
| Parte | Onde | Como liga |
|-------|------|-----------|
| Bot WhatsApp (modo casa) | `index.js`, `comandos/`, `funcoes/`, `plugins/` | `node index.js` |
| Painel SaaS + sessões dos clientes | `saas/client-panel/api/` (Express, porta 3847) | `cd saas/client-panel && npm start` |
| Painel clássico | `saas/client-panel/panel/index.html` | `http://127.0.0.1:3847/` |
| Dashboard NAMY CONTROL (React) | `saas/client-panel/dashboard/` | build servido em `/app` |
| Tudo junto | `ligar-tudo.sh` / `ligar-tudo.bat` | `bash ligar-tudo.sh` |

## Regras
- **Node 22.12+** (Baileys 7 é ESM). No WSL o nvm já tem o 22; `/usr/bin/node` 18 não serve.
- Nunca commitar: `.env`, `sessao/`, `saas/client-panel/api/data/` (usuários, configs, sessões WhatsApp), `dados/*.json`.
- `userId` sai só do JWT (`req.user.id`), nunca do body.
- Novos endpoints do dashboard: `saas/client-panel/api/dashboard.js` (agregado) ou rotas existentes; o cliente HTTP do front é `dashboard/src/services/endpoints.js`.
- Depois de mudar `dashboard/src`, rode `npm run build` em `saas/client-panel/dashboard` (o `ligar-tudo.sh` faz isso sozinho se o código mudou).
