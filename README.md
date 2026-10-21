<img src="https://readme-typing-svg.herokuapp.com/?font=mono&size=30&duration=4000&color=FF0000&center=falso&vCenter=falso&lines=Namy-bot.AI;ASS+BOT+AI+𝐁𝐑;Sraleff">

<h1 align="center">
<p>
<img src="https://github.com/Sraleff/Namy-/blob/main/media/namy.jpg?raw=true" alt="Namy" width="720">
</p>
</h1>

<p align="center">
<a href="#"><img title="BOT MULTI DEVICE" src="https://img.shields.io/badge/BOT%20MULTI%20DEVICE-blue?&style=for-the-badge"></a>
</p>

<p align="center">
<img title="Autor" src="https://img.shields.io/badge/Autor-Sraleff-orange.svg?style=for-the-badge&logo=github">
<img title="Versão" src="https://img.shields.io/badge/Versão-3.0.0-orange.svg?style=for-the-badge&logo=github">
</p>

# Namy 3.0

Assistente de WhatsApp com cérebro modular, fallback Groq → xAI → Gemini, memória em camadas, IA automática inteligente, grupos, lembretes, jogos, plugins e divulgação opcional da Shopee Afiliados.

Base original: Rony / Spectrum. Pairing Baileys preservado.

## O que mudou nesta versão

1. `!ia on` agora **de verdade** acorda a Namy em mensagens comuns — com decisão, não respondendo cada “kkkk”.
2. Histórico de grupo isolado por pessoa (`grupoJid:pessoaJid`).
3. Memória em camadas + `!memoria` / `!memoria esquecer nome`.
4. Cérebro separado: router, providers, fallback, contexto, decisão.
5. Fallback automático Groq → xAI → Gemini.
6. Personalidade estável por alguns minutos (não sorteia a cada frase).
7. Administração de grupo, bem-vindo, antilink, antispam.
8. Lembretes, clima, cotação, CEP, wiki, tradutor, notícias.
9. Jogos + ranking XP.
10. Donos vêm de `OWNERS` no `.env` — nada de número hardcoded.

## Shopee Afiliados (módulo extra)

Pasta `shopee/`. **Não substitui** IA, pareamento nem comandos. Se a API ou a IA cair, o resto da Namy segue.

No `.env` (painel oficial [affiliate.shopee.com.br/open_api](https://affiliate.shopee.com.br/open_api)):

```env
SHOPEE_APP_ID=
SHOPEE_SECRET=
# SHOPEE_ENABLED=false
```

Sem as duas chaves o módulo fica desligado sozinho.

Fluxo: cadastrar o grupo → `!shopee on` → o scheduler publica sozinho. `!shopee todos on` **só liga grupos já cadastrados**.

| Comando | O que faz |
|---|---|
| `!shopee status` | Estado, sem vazar Secret |
| `!shopee cadastrar` | Autoriza **este** grupo |
| `!shopee on` / `off` | Liga / pausa o grupo |
| `!shopee todos on` | ON só nos cadastrados |
| `!shopee intervalo 2h` | Intervalo |
| `!shopee limite 5` | Teto diário |
| `!shopee horario 09:00-22:00` | Janela (Brasília) |
| `!shopee agora` | Publica agora |

A copy pode usar a IA da Namy. Se Groq/xAI/Gemini estiverem fora, entra o template local com nome, preço e link oficiais — sem inventar cupom ou frete.

Persistência: `dados/shopee.json` (escrita atômica). Não mistura com `dados/namy.json`.

## Instalação (Termux)

Siga o arquivo **`INSTALAR-TERMUX.md`**. Ele instala Node, ffmpeg (figurinhas), yt-dlp (`!play`), edge-tts (voz) e o resto.

**Já tem a Namy no celular?** Não reinstale. O topo do `INSTALAR-TERMUX.md` tem o bloco “Atualize por cima”: para o bot, extrai o zip novo **por cima do código**, e **não toca** em `sessao/`, `.env` nem `dados/`.

Pelo GitHub:

```bash
cd ~
git clone https://github.com/Sraleff/Namy-.git
cd Namy-
pkg install nodejs-lts git python ffmpeg -y
pip install -U yt-dlp edge-tts
npm install
cp .env.example .env
nano .env
node index.js
```

**Não rode `npm install` no `/sdcard`.** O Android bloqueia symlink e a instalação quebra.

Se você já tinha a 2.3 pareada, **copie a pasta `sessao/`** para cá. Não apague.

## .env

```env
GROQ_API_KEY=
XAI_API_KEY=
GEMINI_API_KEY=
OWNERS=5511999999999
SHOPEE_APP_ID=
SHOPEE_SECRET=
```

Pelo menos uma chave de IA. Com duas ou três o fallback entra sozinho.

Shopee é opcional. Sem AppId/Secret o bot sobe igual.

Chaves: [Groq](https://console.groq.com/keys) · [xAI](https://console.x.ai) · [Gemini](https://aistudio.google.com/app/apikey) · [Shopee Afiliados Open API](https://affiliate.shopee.com.br/open_api)

## Pareamento

1. O bot pede o número com DDI (`5511999999999`)
2. WhatsApp → Aparelhos conectados → Conectar com número
3. Digite o código

Quando aparecer `NAMY CONECTADA  3.0`, está no ar.

## Comandos rápidos

| Comando | O que faz |
|---|---|
| `!ia on` | Liga a IA automática (inteligente) |
| `!ia modo auto` | Groq → xAI → Gemini |
| `!ia nivel 50` | Frequência de fala no grupo |
| `!memoria` | O que ela lembra de você |
| `!s` | Figurinha (precisa ffmpeg) |
| `!play nome` | Música (precisa yt-dlp + ffmpeg) |
| `!clima Serra` | Tempo |
| `!lembrar 30m água` | Lembrete |
| `!rank` | Ranking de jogos |
| `!shopee status` | Afiliados (dono) |

Menu completo: `!menu`

## Namy SaaS — painel + dashboard NAMY CONTROL

Na branch `namy-3.1-saas` o repo tem, além do bot:

| Parte | Pasta | Endereço |
|---|---|---|
| API + sessões WhatsApp dos clientes | `saas/client-panel/api` | `http://127.0.0.1:3847` |
| Dashboard **NAMY CONTROL** (React + Tailwind) | `saas/client-panel/dashboard` | **`http://127.0.0.1:3847/app/`** |
| Painel clássico | `saas/client-panel/panel` | `http://127.0.0.1:3847/` |

### Instalar (uma vez)

Precisa de **Node 22.12 ou mais novo** (o Baileys 7 é ESM; Node 18/20 quebra com `ERR_REQUIRE_ESM`).

**Linux / WSL**

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc && nvm install 22
git clone -b namy-3.1-saas https://github.com/Sraleff/Namy-.git ~/projetos/namy
cd ~/projetos/namy
cp .env.example .env && nano .env      # pelo menos uma chave de IA + OWNERS
```

**Termux:** veja `INSTALAR-TERMUX.md` e `COMO-LIGAR.md` (o `nodejs-lts` do Termux já é 22+).
**Windows:** instale o Node 22 LTS em https://nodejs.org e use `ligar-tudo.bat`.

As dependências (bot, painel e dashboard) são instaladas sozinhas na primeira execução.

### Executar

```bash
cd ~/projetos/namy
bash ligar-tudo.sh
```

O script confere o Node, instala o que faltar, **compila o dashboard** quando o código dele mudou, sobe o painel em segundo plano e o bot no terminal.

### Usar o dashboard

1. Abra `http://127.0.0.1:3847/app/` e entre (ou clique em **Criar agora**). É a mesma conta do painel clássico.
2. **Configurações** → digite o número com DDI → **Conectar** → no celular: *Aparelhos conectados → Conectar com número de telefone* e digite o código (ou escaneie o QR).
3. **Inteligência Artificial** → App ID, Secret e palavra-chave da Shopee → **Testar API**.
4. **Grupos** → marque onde publicar → **Salvar seleção**.
5. **Automações** → ligue os anúncios, escolha intervalo, limite e horário → **Salvar**.
6. **Contatos** / **Campanhas** → importe contatos de um grupo, autorize quem pediu e crie campanhas (rascunho → conteúdo → destinatários → aprovar).

Desenvolvimento do front: `cd saas/client-panel/dashboard && npm run dev` (Vite em `:5173` com proxy para a API). Sem backend: `VITE_USE_MOCK=1 npm run dev`. Detalhes em `saas/client-panel/dashboard/README.md`.

## Trail — mapa do código para o Claude Code

O repo vem ligado ao [trail](https://www.npmjs.com/package/@trailhq/trail-code): um mapa do código e dos aprendizados de cada sessão em `.trail/`, que o agente consulta **antes** de cada tarefa. A Skill está em `.claude/skills/trail/SKILL.md` e as regras do projeto em `CLAUDE.md`.

### Instalar

```bash
npm install -g @trailhq/trail-code     # com o Node 22 do nvm ativo
cd ~/projetos/namy
trail build                            # gera o mapa local em .trail/cache/ (não vai pro git)
```

Quem clona já recebe `.claude/settings.json` (hook de início de sessão), `.trail/hook.cjs`, `CLAUDE.md` e a Skill. Para também ter a Skill e os hooks em todos os seus repos: `trail init --no-agents`.

### Executar / consultar

Use sempre o wrapper `scripts/trail.sh`: ele roda como o dono do repo e carrega o nvm. Isso importa no Claude Desktop/WSL, onde a sessão do agente pode ser `root`.

```bash
bash scripts/trail.sh status                                   # mapa em dia? quantos aprendizados?
bash scripts/trail.sh ask "como funciona o pareamento" --source # acha o código + aprendizados
bash scripts/trail.sh callers publicarOferta                    # quem chama (antes de refatorar)
bash scripts/trail.sh skeleton saas/client-panel/api/server.js  # API do arquivo
bash scripts/trail.sh check                                     # antes de commit/push
```

### Usar a Skill no Claude Code

1. Abra o Claude Code **na pasta do repo** (`~/projetos/namy`). A Skill `trail` e o `CLAUDE.md` carregam sozinhos.
2. Peça a tarefa normalmente ("corrige o reconectar do WhatsApp"). O agente roda `trail ask` antes de abrir arquivos.
3. Quando a tarefa der trabalho de descobrir, peça "salva isso no trail". O agente roda `trail note` e o aprendizado vai para `.trail/learnings/`. **Commite essa pasta**: é a memória do time.
4. Antes de commitar, o agente roda `trail check` contra os aprendizados.

Se a sessão não mostrar a Skill, confira se o Claude Code foi aberto na raiz do repo e se `bash scripts/trail.sh status` responde.

## Segurança

Nunca compartilhe:

- `.env`
- pasta `sessao/`
- `dados/namy.json`
- `dados/shopee.json`
- `saas/client-panel/.env` e `saas/client-panel/api/data/` (usuários, configs e sessões WhatsApp dos clientes)

`OWNERS` fica só no `.env`.
