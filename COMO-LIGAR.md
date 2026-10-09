# Como ligar bot + painel Namy

Dois processos. O cliente so abre o navegador. Voce (dono) sobe os dois.

## O que e cada um

| Processo | Pasta | Comando | Porta |
|----------|-------|---------|-------|
| Painel do afiliado | `saas/client-panel` | `npm start` | http://localhost:3847 |
| Bot WhatsApp | raiz do repo | `node index.js` | terminal (pareamento) |

O painel **nao** substitui o bot. Sem `node index.js` o WhatsApp nao conecta.

---

## Termux (celular)

### 1. Instalar uma vez

```bash
cd ~
pkg update -y && pkg install git nodejs-lts python ffmpeg -y
pip install -U yt-dlp edge-tts

git clone -b namy-3.1-saas --single-branch https://github.com/Sraleff/Namy-.git Namy-saas
cd ~/Namy-saas

# NAO rode npm no /sdcard
npm install
cd saas/client-panel && npm install && cd ~/Namy-saas

cp .env.example .env
nano .env
```

No `.env` coloque pelo menos uma chave de IA:

```env
GROQ_API_KEY=sua_chave
OWNERS=55SEUNUMERO
NAMY_SAAS_URL=http://127.0.0.1:3847
NAMY_BOT_TOKEN=
```

O `NAMY_BOT_TOKEN` voce copia **depois** de criar a conta no painel.

### 2. Ligar os dois (toda vez)

Terminal 1 — painel:

```bash
cd ~/Namy-saas/saas/client-panel
npm start
```

Deixe aberto. No celular abra o navegador em:

```text
http://127.0.0.1:3847
```

Crie a conta, salve Shopee / anuncios / link. Copie o token se a tela mostrar (ou veja `saas/client-panel/api/data/configs.json` — campo `botToken`).

Cole no `.env`:

```env
NAMY_BOT_TOKEN=o_token_copiado
```

Terminal 2 — bot (nova sessao Termux: deslize da esquerda → New session):

```bash
cd ~/Namy-saas
node index.js
```

Digite o numero com DDI. No WhatsApp: Aparelhos conectados → Conectar com numero → codigo do terminal.

Quando aparecer `NAMY CONECTADA`, teste `!ping` e `!link`.

### Atalho

```bash
cd ~/Namy-saas
bash ligar-tudo.sh
```

Isso sobe o painel em segundo plano e o bot na frente. Pare com Ctrl+C (o painel pode continuar; mate com `pkill -f client-panel` se precisar).

---

## PC Windows

### 1. Instalar uma vez

1. Node.js: https://nodejs.org (LTS)
2. Git: https://git-scm.com/download/win (marque "Git from the command line")
3. Feche e abra o PowerShell.

```powershell
cd $env:USERPROFILE\Documents
git clone -b namy-3.1-saas --single-branch https://github.com/Sraleff/Namy-.git Namy-saas
cd Namy-saas
npm install
cd saas\client-panel
npm install
cd ..\..
copy .env.example .env
notepad .env
```

Se `npm install` falhar com `EALLOWGIT`:

```powershell
npm config set git-protocol https
npm install
```

No `.env`:

```env
GROQ_API_KEY=sua_chave
OWNERS=55SEUNUMERO
NAMY_SAAS_URL=http://127.0.0.1:3847
NAMY_BOT_TOKEN=
```

### 2. Ligar os dois

**Janela 1** (painel):

```powershell
cd $env:USERPROFILE\Documents\Namy-saas\saas\client-panel
npm start
```

Abra o navegador: http://localhost:3847

Crie a conta, configure Shopee / anuncios / link.

Token do bot: no painel, aba Conta, ou no arquivo:

```text
saas\client-panel\api\data\configs.json
```

Campo `botToken`. Cole no `.env` como `NAMY_BOT_TOKEN=`.

**Janela 2** (bot):

```powershell
cd $env:USERPROFILE\Documents\Namy-saas
node index.js
```

Pareie o WhatsApp com o codigo do terminal.

Atalho (dois processos):

```powershell
cd $env:USERPROFILE\Documents\Namy-saas
.\ligar-tudo.bat
```

---

## Uso do cliente (afiliado)

O cliente **nao** instala Node.

1. Abre o link que voce mandou (no seu PC/celular: `http://IP-DA-MAQUINA:3847`)
2. Cria conta
3. Aba Shopee: App ID + Secret + palavra-chave → Salvar
4. Aba Anuncios: intervalo, limite, horario, link → Salvar
5. Voce pareia o WhatsApp no terminal do bot (codigo real)
6. No grupo: bot admin, `!shopee cadastrar` / `!shopee on` (dono) ou fluxo `!minhaconta` da 3.1

O codigo da aba WhatsApp do painel ainda e **demonstracao**. O pareamento real e o do `node index.js`.

---

## Comandos uteis no WhatsApp

| Comando | Faz |
|---------|-----|
| `!ping` | testa se o bot esta vivo |
| `!menu` | lista comandos |
| `!ia on` | IA automatica neste chat |
| `!link` | manda o link salvo no painel (precisa NAMY_BOT_TOKEN) |
| `!shopee status` | estado afiliados (dono) |

---

## Problemas comuns

| Sintoma | Solucao |
|---------|---------|
| `Cannot find module dotenv` | `npm install` na raiz, nao na pasta do usuario |
| `git` nao reconhecido | instale Git e abra terminal novo |
| `EALLOWGIT` | instale Git + `npm config set git-protocol https` |
| Painel abre, zap nao | faltou `node index.js` |
| `!link` diz SaaS nao configurado | painel ligado + `NAMY_BOT_TOKEN` no `.env` + reinicie o bot |
| npm no /sdcard quebra | rode so em `~/Namy-saas` |

Nunca compartilhe `.env`, pasta `sessao/` nem `api/data/configs.json`.
