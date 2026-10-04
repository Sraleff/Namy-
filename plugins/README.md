# Plugins

Cada arquivo em `comandos/` já é um plugin. Para adicionar um novo:

1. Crie `comandos/meucomando.js` exportando `async function (ctx) { ... }`
2. Registre o nome em `comandos/index.js`

O `ctx` traz `from`, `args`, `texto`, `reply`, `escrever`, `isGroup`, `senderJid`, `client`.
