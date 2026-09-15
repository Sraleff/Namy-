
<img src="https://readme-typing-svg.herokuapp.com/?font=mono&size=30&duration=4000&color=FF0000&center=falso&vCenter=falso&lines=Namy-bot.AI;ASS+BOT+AI+𝐁𝐑;Sraleff">

<h1 align="center">
<p>
<img src="https://github.com/Sraleff/Namy-/blob/main/media/namy.jpg?raw=true" alt="namy" width="720">
</p>

<p align="center">
<a href="#"><img title="BOT MULTI DEVICE" src="https://img.shields.io/badge/BOT MULTI DEVICE-blue?&style=for-the-badge"></a>
</p>

<p align="center">
<img title="Autor" src="https://img.shields.io/badge/Autor-Sraleff-orange.svg?style=for-the-badge&logo=github"></a>
<img title="Versão" src="https://img.shields.io/badge/Versão-2.2.0-orange.svg?style=for-the-badge&logo=github"></a>
</p>

## 📋 Requisitos
- Node.js **18** ou superior
- Conexão com internet
- Conta no WhatsApp

---

## 📱 Instalação via Termux

**1° Atualizar e instalar dependências do sistema**
```bash
pkg update -y && pkg upgrade -y
pkg install nodejs git -y
```

**2° Clonar o repositório**
```bash
cd ~
git clone https://github.com/Sraleff/Namy-.git
cd Namy-
```

**3° Instalar as dependências do bot**
```bash
npm install
```
> ⚠️ **Importante:** rode o `npm install` dentro da pasta `~/Namy-` (home do Termux).  
> No `/sdcard` o Android bloqueia links simbólicos e a instalação falha.

**4° (Opcional) Configurar a chave da IA**

Crie um arquivo `.env` na pasta do bot:
```bash
nano .env
```

Coloque:
```
GROQ_API_KEY=sua_chave_aqui
```

Obtenha a chave em: https://console.groq.com/keys

**5° Iniciar o bot**
```bash
node index.js
```
ou
```bash
npm start
```

---

## 💻 Instalação (Linux / Windows / VPS)

```bash
git clone https://github.com/Sraleff/Namy-.git
cd Namy-
npm install
node index.js
```

---

## 🔐 Pareamento (primeira vez)

1. Ao iniciar, o bot pede seu número (com DDI), exemplo: `5511999999999`
2. Digite o número e pressione **Enter**
3. Vai aparecer um **código** no terminal (ex: `ABCD-EFGH`)
4. No celular: **WhatsApp → Aparelhos conectados → Conectar com número de telefone**
5. Digite o código

Quando aparecer `🌸 NAMY CONECTADA!`, o bot está pronto.

---

## ▶️ Iniciar o Bot
```bash
cd ~/Namy-
node index.js
```

---

## 🔄 Resetar sessão (gerar novo pareamento)
```bash
cd ~/Namy-
rm -rf sessao
node index.js
```

---

## 🤖 Comandos principais

| Comando | Descrição |
|---------|-----------|
| `!menu` | Menu completo |
| `!ping` | Testa latência |
| `!info` | Informações do bot |
| `!dono` | Sobre o desenvolvedor |
| `!meme` | Envia um meme aleatório |
| `!piada` | Conta uma piada |
| `!curiosidade` | Curiosidade aleatória |
| `!conselho` | Conselho do dia |
| `!filme [gênero]` | Recomenda um filme |
| `!anime [gênero]` | Recomenda um anime |
| `!ia [pergunta]` | Pergunta para a IA |
| `!bom-dia` | Saudação de bom dia |
| `!boa-tarde` | Saudação de boa tarde |
| `!boa-noite` | Saudação de boa noite |

---

## 💡 Dicas
- Prefixo padrão: `!`
- Não compartilhe a pasta `sessao` (contém credenciais do WhatsApp)
- Para a IA funcionar, configure a `GROQ_API_KEY` no arquivo `.env`
- O bot responde automaticamente a saudações e algumas mensagens naturais

---

<p align="center"> Sendo desenvolvido por <b>Sraleff</b></p>
