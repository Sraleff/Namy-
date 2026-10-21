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

# Namy 3.1 SaaS

Assistente de WhatsApp com IA (Groq → xAI → Gemini), grupos, jogos, lembretes, divulgação da Shopee Afiliados e um painel web onde cada cliente conecta o próprio WhatsApp.

**Este é o único guia de instalação e uso.** Vale para Termux, Linux/WSL e Windows.

## O que sobe

| Parte | Endereço | Para quê |
|---|---|---|
| Dashboard **NAMY CONTROL** | **`http://127.0.0.1:3847/app/`** | Painel atual. Use este |
| Painel clássico | `http://127.0.0.1:3847/` | Antigo. Mesma conta, mesmas funções |
| Bot da casa | terminal (`node index.js`) | Opcional. Seu WhatsApp de dono/admin |

Um comando liga tudo: `ligar-tudo.sh` (Termux/Linux) ou `ligar-tudo.bat` (Windows). Na primeira vez ele instala as dependências e compila o dashboard sozinho.

> **Node 22.12 ou mais novo é obrigatório.** O Baileys 7 é ESM; com Node 18/20 o painel cai com `ERR_REQUIRE_ESM`.

---

## 1. Instalar

### Termux (Android)

Use o Termux da [F-Droid](https://f-droid.org/packages/com.termux/), não o da Play Store. Instale sempre no home (`~`), **nunca no `/sdcard`** (o Android bloqueia symlink e o `npm install` quebra).

```bash
termux-setup-storage
pkg update -y && pkg upgrade -y
pkg install nodejs-lts git python python-pip ffmpeg -y
pip install -U yt-dlp edge-tts
node -v        # precisa ser v22.12 ou maior; se não for: pkg install nodejs -y

cd ~
git clone -b namy-3.1-saas --single-branch https://github.com/Sraleff/Namy-.git Namy-saas
cd ~/Namy-saas
cp .env.example .env
nano .env      # salvar: Ctrl+O, Enter, Ctrl+X
```

O script `instalar-termux.sh` faz a parte do `pkg`/`pip` de uma vez, se preferir.

### Linux / WSL

```bash
sudo apt update && sudo apt install -y git ffmpeg pipx
pipx install yt-dlp && pipx install edge-tts       # opcional: !play e voz

curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc && nvm install 22

git clone -b namy-3.1-saas --single-branch https://github.com/Sraleff/Namy-.git ~/projetos/namy
cd ~/projetos/namy
cp .env.example .env
nano .env
```

### Windows

1. Instale o **Node.js 22 LTS** em [nodejs.org](https://nodejs.org) e o **Git** em [git-scm.com](https://git-scm.com/download/win) (marque "Git from the command line").
2. Opcional, para figurinha, `!play` e voz: `winget install Gyan.FFmpeg yt-dlp.yt-dlp` e `pip install edge-tts`.
3. Feche e abra o PowerShell:

```powershell
cd $env:USERPROFILE\Documents
git clone -b namy-3.1-saas --single-branch https://github.com/Sraleff/Namy-.git Namy-saas
cd Namy-saas
copy .env.example .env
notepad .env
```

Se o `npm install` falhar com `EALLOWGIT`: `npm config set git-protocol https` e rode de novo.

---

## 2. Configurar o `.env`

Arquivo `.env` na raiz (bot):

```env
GROQ_API_KEY=          # pelo menos UMA chave de IA; com duas ou três o fallback entra sozinho
XAI_API_KEY=
GEMINI_API_KEY=
OWNERS=5511999999999   # seu número com DDI, sem + e sem espaço; vários: 5511...,5527...
SAAS_MASTER_KEY=       # gere com: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
NAMY_SAAS_URL=http://127.0.0.1:3847
NAMY_BOT_TOKEN=        # opcional, veja "Bot da casa"
SHOPEE_APP_ID=         # opcional
SHOPEE_SECRET=
```

Guarde a `SAAS_MASTER_KEY` fora do aparelho também. Se perder ou trocar, os clientes precisam cadastrar as chaves de novo.

Chaves: [Groq](https://console.groq.com/keys) · [xAI](https://console.x.ai) · [Gemini](https://aistudio.google.com/app/apikey) · [Shopee Afiliados](https://affiliate.shopee.com.br/open_api)

**Painel aberto para clientes** (fora da sua máquina): copie `saas/client-panel/.env.example` para `saas/client-panel/.env` e preencha pelo menos `JWT_SECRET` com um segredo longo. Sem ele o painel usa um segredo de desenvolvimento.

---

## 3. Ligar

| Sistema | Comando (na pasta do repo) |
|---|---|
| Termux | `cd ~/Namy-saas && bash ligar-tudo.sh` |
| Linux / WSL | `cd ~/projetos/namy && bash ligar-tudo.sh` |
| Windows | `.\ligar-tudo.bat` |

O painel sobe em segundo plano (no Windows, numa janela própria) e o bot da casa fica no terminal. Se você não usa o bot da casa, pode ligar só o painel:

```bash
cd saas/client-panel && npm start
```

Pare com `Ctrl+C`. No Termux, se o painel continuar rodando: `pkill -f client-panel`.

Para manter ligado no celular, desative a otimização de bateria do Termux.

---

## 4. Usar o dashboard NAMY CONTROL

Abra **`http://127.0.0.1:3847/app/`** (de outro aparelho na rede: `http://IP-DA-MAQUINA:3847/app/`). O cliente só usa o navegador: não instala nada nem mexe em terminal.

1. **Entrar** ou **Criar agora**. É a mesma conta do painel clássico, com 30 dias de teste.
2. **Configurações** → número com DDI → **Conectar**. No celular: *WhatsApp → Aparelhos conectados → Conectar com número de telefone* e digite o código (ou escaneie o QR). O status muda para conectado.
3. **Inteligência Artificial** → App ID, Secret e palavra-chave da Shopee → **Testar API**. O Secret não volta para a tela.
4. **Grupos** → marque onde publicar → **Salvar seleção**.
5. **Automações** → ligue os anúncios, escolha intervalo (5 min a 6 h), limite diário e horário → **Salvar**. Dá para testar o envio na hora.
6. **Contatos** → importe participantes de um grupo. Todos entram **sem autorização**; autorize só quem pediu para receber mensagem.
7. **Campanhas** → rascunho → conteúdo (link do grupo ou oferta real da Shopee) → destinatários autorizados → **Aprovar**. A fila manda uma mensagem por vez, no mínimo 20 s entre elas e no máximo 50 por dia. Pausar e retomar não reenvia.
8. **Logs & Atividades** mostra os últimos envios. **Configurações** também tem desconectar/reconectar e a assinatura.

Cada conta tem a própria sessão de WhatsApp em `saas/client-panel/api/data/sessions/<id>` e ela volta sozinha quando o painel reinicia.

**Não use o mesmo número no painel e no bot da casa.** O WhatsApp derruba uma das sessões (erro `440`).

### Assinatura (Mercado Pago)

Sem configuração, o teste de 30 dias continua e o botão Assinar avisa que o Mercado Pago não está configurado. Para cobrar, em `saas/client-panel/.env`:

```env
JWT_SECRET=um_segredo_longo_so_seu
MP_ACCESS_TOKEN=
PUBLIC_URL=https://seu-dominio      # https, sem barra no final
NAMY_PRICE_MENSAL=49
NAMY_PRICE_TRIMESTRAL=129
```

No Mercado Pago, aponte a notificação para `PUBLIC_URL/webhooks/mercadopago`. A licença só liga depois que o servidor confere o pagamento na API oficial.

---

## 5. Bot da casa (opcional)

Na primeira vez que `node index.js` (ou o `ligar-tudo`) sobe, ele pede o número com DDI e mostra um código. No celular: *Aparelhos conectados → Conectar com número de telefone* → digite o código. Quando aparecer `NAMY CONECTADA`, mande `!menu`.

Para o `!link` mandar o link salvo no painel: crie sua conta no dashboard, copie o `botToken` de `saas/client-panel/api/data/configs.json` para `NAMY_BOT_TOKEN` no `.env` e reinicie.

Já tinha a Namy pareada em outra pasta (ex.: `~/Namy3`)? Copie a sessão e os dados em vez de parear de novo:

```bash
cp -r ~/Namy3/sessao ~/Namy3/dados ~/Namy-saas/
```

### Comandos úteis

| Comando | O que faz |
|---|---|
| `!menu` / `!ping` | Lista comandos / testa se está vivo |
| `!ia on` · `!ia nivel 50` | Liga a IA automática / quanto ela fala no grupo |
| `!memoria` | O que ela lembra de você |
| `!s` · `!play nome` | Figurinha (ffmpeg) / música (yt-dlp + ffmpeg) |
| `!clima Serra` · `!lembrar 30m água` · `!rank` | Tempo / lembrete / ranking |
| `!shopee cadastrar` → `!shopee on` | Afiliados no grupo (dono) |
| `!shopee status` · `intervalo 2h` · `limite 5` · `horario 09:00-22:00` · `agora` | Ajustes da Shopee |
| `!minhaconta ...` | Cliente configura as próprias chaves pelo WhatsApp (detalhes em `SAAS.md`) |

---

## 6. Atualizar

Pare tudo (`Ctrl+C`) e, na pasta do repo:

```bash
git pull
bash ligar-tudo.sh        # Termux/Linux: instala o que faltar e recompila o dashboard se mudou
```

No **Windows** o `.bat` só compila o dashboard se ele ainda não existir. Depois de um `git pull`, rode antes:

```powershell
cd saas\client-panel\dashboard; npm install; npm run build; cd ..\..\..
.\ligar-tudo.bat
```

O `git pull` não mexe em `.env`, `sessao/`, `dados/` nem `saas/client-panel/api/data/`.

---

## Problemas comuns

| Sintoma | Solução |
|---|---|
| `ERR_REQUIRE_ESM` / "Node antigo" | Node 22.12+ (`nvm install 22`, ou `pkg install nodejs` no Termux) |
| `npm install` quebra no Termux | Você está no `/sdcard`. Clone em `~` |
| Dashboard não instala no Termux (erro do `sharp`) | `cd saas/client-panel/dashboard && npm install --ignore-scripts` e rode o `ligar-tudo.sh` de novo |
| `/app/` abre em branco ou 404 | O dashboard não foi compilado: `cd saas/client-panel/dashboard && npm install && npm run build` |
| `Cannot find module ...` | `npm install` na raiz e em `saas/client-panel` |
| `git` não reconhecido / `EALLOWGIT` | Instale o Git, abra terminal novo, `npm config set git-protocol https` |
| WhatsApp não conecta no painel | Número com DDI e licença ativa. Se o QR não aparecer, aguarde alguns segundos ou reconecte |
| Sessão cai com `440` | O mesmo número está no painel e no bot da casa. Use só um |
| `Código: 408` | Rede caiu. Reconecta sozinho; a Shopee pausa e retoma |
| "Só os donos..." | Seu número não bate com `OWNERS` (DDI+DDD, sem `+`) |
| `!s`, `!play` ou voz falham | Falta ffmpeg, yt-dlp ou edge-tts (passo 1) |
| Shopee não publica | Grupo não cadastrado ou sem App ID/Secret |
| `!link` diz SaaS não configurado | Painel ligado + `NAMY_BOT_TOKEN` no `.env` |

---

## Para desenvolvedores

- Front do dashboard: `cd saas/client-panel/dashboard && npm run dev` (Vite em `:5173`, com proxy para a API). Sem backend: `VITE_USE_MOCK=1 npm run dev`. Páginas e rotas: `saas/client-panel/dashboard/README.md`.
- Novo comando: crie `comandos/meucomando.js` e registre em `comandos/index.js` (`plugins/README.md`).
- Status das fases do SaaS: `saas/FASES.md`. Regras para o Claude Code e o mapa **trail**: `CLAUDE.md` e `.claude/skills/trail/SKILL.md` (use sempre `bash scripts/trail.sh`).

## Segurança

Nunca compartilhe nem commite: `.env`, `sessao/`, `dados/*.json`, `saas/client-panel/.env` e `saas/client-panel/api/data/` (usuários, configs e sessões WhatsApp dos clientes).
