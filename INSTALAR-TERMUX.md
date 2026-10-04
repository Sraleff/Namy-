# Instalar a Namy 3.0 no Termux — tudo

Este guia instala **Node, ffmpeg, yt-dlp, edge-tts e Python**. Sem isso, `!s` (figurinha), `!play` (música) e voz da IA não funcionam.

Faça no **home do Termux** (`~`), nunca no `/sdcard`.

---

## Já tem a Namy instalada? Atualize por cima

Não apague a pasta. **Não apague `sessao/`, `.env` nem `dados/`.** Isso é o WhatsApp, as chaves e a memória.

1. Baixe o `namy-3.0.zip` novo (botão no hub) para o Download do celular.
2. Pare o bot: `Ctrl+C` no Termux. Se usa pm2: `pm2 stop namy`
3. Cole **este bloco inteiro**:

```bash
BOT=~/Namy3
[ -f "$BOT/namy/index.js" ] && BOT=~/Namy3/namy
[ -f "$BOT/index.js" ] || { echo "Namy não encontrada em ~/Namy3 — ajuste BOT="; exit 1; }

TMP=~/Namy3-update
rm -rf "$TMP"
mkdir -p "$TMP"
unzip -o /sdcard/Download/namy-3.0.zip -d "$TMP"
SRC="$TMP/namy"
[ -f "$SRC/index.js" ] || SRC="$TMP"

mkdir -p "$BOT/comandos" "$BOT/funcoes" "$BOT/plugins" "$BOT/shopee" "$BOT/media"
cp -a "$SRC/comandos/." "$BOT/comandos/"
cp -a "$SRC/funcoes/." "$BOT/funcoes/"
cp -a "$SRC/plugins/." "$BOT/plugins/"
cp -a "$SRC/shopee/." "$BOT/shopee/"
cp -a "$SRC/media/." "$BOT/media/"
cp -a "$SRC/index.js" "$SRC/config.js" "$SRC/package.json" "$SRC/intencoes.js" "$BOT/"
cp -a "$SRC/.env.example" "$SRC/.gitignore" "$BOT/"
cp -a "$SRC/"*.md "$BOT/" 2>/dev/null || true
[ -f "$SRC/package-lock.json" ] && cp -a "$SRC/package-lock.json" "$BOT/"
[ -f "$SRC/instalar-termux.sh" ] && cp -a "$SRC/instalar-termux.sh" "$BOT/"

if [ -f "$BOT/.env" ] && ! grep -q '^SHOPEE_APP_ID=' "$BOT/.env"; then
  printf '\n# Shopee Affiliate (opcional)\nSHOPEE_APP_ID=\nSHOPEE_SECRET=\n# SHOPEE_ENABLED=false\n' >> "$BOT/.env"
fi

cd "$BOT"
npm install
rm -rf "$TMP"
echo "OK. sessao/ .env e dados/ continuam. Suba: node index.js"
```

4. Shopee (opcional): `nano .env` e preencha `SHOPEE_APP_ID` / `SHOPEE_SECRET` do painel [affiliate.shopee.com.br/open_api](https://affiliate.shopee.com.br/open_api). Vazio = módulo desligado.
5. Suba: `node index.js` (ou `pm2 restart namy`)

Não pede código de novo se a pasta `sessao/` ficou. No Zap: `!menu` e, se for usar afiliados, no **grupo**: `!shopee cadastrar` depois `!shopee on`.

Ainda está na **2.3** (`~/Namy2`)? Instale a 3.0 do zero abaixo e **copie só a sessão**: `cp -r ~/Namy2/sessao ~/Namy3/`.

---

## 0. Termux da F-Droid

Use o Termux da [F-Droid](https://f-droid.org/packages/com.termux/), não o da Play Store (está abandonado).

Abra o Termux e cole **um bloco por vez**.

---

## 1. Sistema

```bash
termux-setup-storage
pkg update -y && pkg upgrade -y
pkg install nodejs-lts git python python-pip ffmpeg wget curl unzip -y
```

Confira:

```bash
node -v
python --version
ffmpeg -version | head -n 1
```

Node precisa ser **18+**. Se `pkg install nodejs-lts` falhar, tente `pkg install nodejs`.

---

## 2. yt-dlp (!play) e edge-tts (voz)

```bash
pip install -U yt-dlp edge-tts
```

Se o `pip` não existir:

```bash
pkg install python-pip -y
pip install -U yt-dlp edge-tts
```

Teste:

```bash
yt-dlp --version
edge-tts --list-voices | head
```

O `!play` também precisa de **ffmpeg** (já instalado no passo 1) para converter o áudio em mp3.

Atalho Termux (às vezes existe pacote nativo):

```bash
pkg install yt-dlp -y
```

Pode instalar os dois; o que importar é o comando `yt-dlp` no PATH.

---

## 3. Extrair a Namy 3.0

Se você baixou o zip:

```bash
mkdir -p ~/Namy3
cd ~
# ajuste o caminho do zip se estiver no Download
unzip -o /sdcard/Download/namy-3.0.zip -d ~/Namy3
cd ~/Namy3
# se o zip criou uma pasta interna:
# cd ~/Namy3/namy   ou   cd ~/Namy3/Namy3
ls
```

Tem que aparecer `index.js`, `package.json` e a pasta `comandos`.

---

## 4. Dependências Node

```bash
cd ~/Namy3
npm install
```

Se der erro de symlink, você está no `/sdcard`. Mova:

```bash
cp -r /sdcard/Download/Namy3 ~/Namy3
cd ~/Namy3
npm install
```

---

## 5. Chaves e donos

```bash
cp .env.example .env
nano .env
```

Preencha:

```env
GROQ_API_KEY=sua_chave_groq
XAI_API_KEY=sua_chave_xai
GEMINI_API_KEY=sua_chave_gemini
OWNERS=55DDDNUMERO
SHOPEE_APP_ID=
SHOPEE_SECRET=
```

Pelo menos **uma** chave de IA. `OWNERS` é o seu número com DDI, sem `+` e sem espaços. Vários donos: `5511...,5527...`

Shopee é opcional. AppId e Secret saem de [affiliate.shopee.com.br/open_api](https://affiliate.shopee.com.br/open_api). Vazio = módulo desligado, bot normal.

Salve no nano: `Ctrl+O`, Enter, `Ctrl+X`.

---

## 6. Migrar sessão da 2.3 (se já estava pareada)

```bash
# se a 2.3 estava em ~/Namy2
cp -r ~/Namy2/sessao ~/Namy3/
# memórias antigas são lidas automaticamente na primeira subida
```

**Não apague `sessao/`** se quiser continuar no mesmo WhatsApp.

---

## 7. Ligar

```bash
cd ~/Namy3
node index.js
```

Primeira vez: cole o número, pegue o código, cole em  
WhatsApp → Aparelhos conectados → Conectar com número de telefone.

Quando aparecer `NAMY CONECTADA  3.0`, manda `!menu` no Zap.

O boot imprime se ffmpeg / yt-dlp / edge-tts estão ok.

---

## 8. Manter ligado (opcional)

```bash
pkg install termux-services -y
npm install -g pm2
cd ~/Namy3
pm2 start index.js --name namy
pm2 save
```

Ou simplesmente deixe o Termux aberto. No Android, desative otimização de bateria para o Termux.

---

## Problemas comuns

| Sintoma | Causa | Ação |
|---|---|---|
| `!s` falha | sem ffmpeg | `pkg install ffmpeg` |
| `!play` falha | sem yt-dlp | `pip install -U yt-dlp` |
| voz não sai | sem edge-tts ou ffmpeg | `pip install -U edge-tts` + ffmpeg |
| `npm install` quebra | pasta no sdcard | mover para `~/Namy3` |
| IA não fala sozinha | `!ia on` não foi dado, ou `OWNERS` vazio | preencha OWNERS, mande `!ia on` |
| “Só os donos…” | número diferente do OWNERS | confira DDI+DDD, sem `+` |
| Shopee não publica | grupo não cadastrado, ou sem AppId/Secret | `!shopee cadastrar` no grupo, depois `!shopee on`. Credenciais só no `.env` |
| pairing some | pasta sessao apagada | não apague; se já foi, pareie de novo |
| `Conexão fechada. Código: 408` | WhatsApp caiu (rede/Termux) | a Namy reconecta sozinha; a Shopee **pausa** e retoma depois. Não é erro da API |
| pediu código de novo depois do update | `sessao/` foi copiada por cima ou apagada | o bloco de atualização **não** mexe em `sessao/` |

---

## Comando único (copia e cola)

Depois do `termux-setup-storage`:

```bash
pkg update -y && pkg upgrade -y && pkg install nodejs-lts git python python-pip ffmpeg wget curl unzip -y && pip install -U yt-dlp edge-tts && echo "Pronto. Extraia a Namy em ~/Namy3, npm install, edite .env, node index.js"
```
