# Como ligar bot + painel Namy

Dois processos. O cliente so abre o navegador. Voce (dono) sobe os dois.

## O que e cada um

| Processo | Pasta | Comando | Porta |
|----------|-------|---------|-------|
| Painel do afiliado + sessões WhatsApp | `saas/client-panel` | `npm start` | http://localhost:3847 |
| Bot WhatsApp (modo casa/admin) | raiz do repo | `node index.js` | terminal (pareamento opcional) |

O painel **gerencia as sessões WhatsApp dos clientes** via Baileys (QR Code e codigo de pareamento reais). Sem `node index.js` o modo casa não sobe, mas os clientes do painel conectam pelo navegador.

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

O `NAMY_BOT_TOKEN` voce copia **depois** de criar a conta no painel (opcional para modo casa).

### 2. Ligar os dois (toda vez)

Terminal 1 — painel (gerencia sessões dos clientes):

```bash
cd ~/Namy-saas/saas/client-panel
npm start
```

Deixe aberto. No celular abra o navegador em:

```text
http://127.0.0.1:3847
```

Crie a conta, aba WhatsApp → Conectar → escaneie o QR ou use o codigo. Status fica Online.

Salve Shopee / anuncios / link.

Terminal 2 — bot casa (opcional, nova sessao Termux):

```bash
cd ~/Namy-saas
node index.js
```

Digite o numero com DDI se quiser o bot da casa. Quando aparecer `NAMY CONECTADA`, teste `!ping` e `!link`.

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

Crie a conta, aba WhatsApp → Conectar WhatsApp → escaneie QR ou codigo. Configure Shopee / anuncios / link.

**Janela 2** (bot casa, opcional):

```powershell
cd $env:USERPROFILE\Documents\Namy-saas
node index.js
```

Pareie o WhatsApp com o codigo do terminal se quiser o modo casa.

Atalho (dois processos):

```powershell
cd $env:USERPROFILE\Documents\Namy-saas
.\ligar-tudo.bat
```

---

## Uso do cliente (afiliado)

O cliente **nao** instala Node, **nao** acessa terminal e **nao** executa comandos.

1. Abre o link que voce mandou (no seu PC/celular: `http://IP-DA-MAQUINA:3847`)
2. Cria conta e entra
3. Aba WhatsApp: digita o numero → Conectar WhatsApp → escaneia o QR Code real ou digita o codigo de pareamento no WhatsApp
4. Vê o status real (conectando / aguardando / conectado / erro) no painel
5. Aba Shopee: App ID + Secret + palavra-chave → Salvar
6. Aba Anuncios: intervalo, limite, horario, link → Salvar
7. Pode desconectar / reconectar pelo painel
8. No grupo: bot admin, `!shopee cadastrar` / `!shopee on` (dono) ou fluxo `!minhaconta` da 3.1

O pareamento é **real**, gerado pelo Baileys no servidor do painel. Cada conta tem sessão isolada em `data/sessions/<userId>` (nunca vai pro Git).

---

## Comandos uteis no WhatsApp

| Comando | Faz |
|---------|-----|
| `!ping` | testa se o bot esta vivo |
| `!menu` | lista comandos |
| `!ia on` | IA automatica neste chat |
| `!link` | manda o link salvo no painel (precisa NAMY_BOT_TOKEN no modo casa) |
| `!shopee status` | estado afiliados (dono) |

---

## Problemas comuns

| Sintoma | Solucao |
|---------|---------|
| `Cannot find module dotenv` | `npm install` na raiz, nao na pasta do usuario |
| `git` nao reconhecido | instale Git e abra terminal novo |
| `EALLOWGIT` | instale Git + `npm config set git-protocol https` |
| Painel abre, zap nao conecta | verifique licenca ativa e numero com DDI |
| QR não aparece | aguarde alguns segundos (polling) ou reconecte |
| `!link` diz SaaS nao configurado | painel ligado + `NAMY_BOT_TOKEN` no `.env` (modo casa) |
| npm no /sdcard quebra | rode so em `~/Namy-saas` |

Nunca compartilhe `.env`, pasta `sessao/` nem `api/data/configs.json` nem `api/data/sessions/`.
