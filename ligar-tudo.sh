#!/data/data/com.termux/files/usr/bin/bash
# Liga painel (fundo) + bot (frente). Rode na raiz do repo.
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if [ ! -d node_modules ]; then
  echo "Instalando dependencias do bot..."
  npm install
fi
if [ ! -d saas/client-panel/node_modules ]; then
  echo "Instalando dependencias do painel..."
  (cd saas/client-panel && npm install)
fi
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Criei .env a partir do exemplo. Edite as chaves e rode de novo."
  exit 1
fi

echo "Subindo painel em http://127.0.0.1:3847"
(cd saas/client-panel && npm start) &
PANEL_PID=$!
sleep 2
echo "Painel PID $PANEL_PID"
echo "Agora o bot. Pareamento no terminal."
node index.js
kill "$PANEL_PID" 2>/dev/null || true
