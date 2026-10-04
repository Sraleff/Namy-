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

## Segurança

Nunca compartilhe:

- `.env`
- pasta `sessao/`
- `dados/namy.json`
- `dados/shopee.json`

`OWNERS` fica só no `.env`.
