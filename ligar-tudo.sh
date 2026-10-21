#!/data/data/com.termux/files/usr/bin/bash
# Liga painel (fundo) + bot (frente). Rode na raiz do repo.
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# Carrega o Node do nvm (WSL/Linux) se existir; no Termux o node do pkg ja serve
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 || true
  nvm use 22 >/dev/null 2>&1 || true
fi
# Baileys 7 e ESM: precisa de Node 22.12+ (require de ESM). Node 18/20 quebra no require.
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
NODE_MINOR=$(node -p "process.versions.node.split('.')[1]")
if [ "$NODE_MAJOR" -lt 22 ] || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 12 ]; }; then
  echo "Node $(node -v) e antigo para o Baileys 7. Instale Node 22.12+ (ex.: nvm install 22) e rode de novo."
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "Instalando dependencias do bot..."
  npm install
fi
if [ ! -d saas/client-panel/node_modules ]; then
  echo "Instalando dependencias do painel..."
  (cd saas/client-panel && npm install)
fi
# NAMY CONTROL (dashboard em /app): compila se ainda nao existe ou se o codigo mudou
DASH=saas/client-panel/dashboard
if [ -d "$DASH" ]; then
  if [ ! -d "$DASH/node_modules" ]; then
    echo "Instalando dependencias do dashboard..."
    (cd "$DASH" && npm install)
  fi
  if [ ! -f "$DASH/dist/index.html" ] || [ -n "$(find "$DASH/src" "$DASH/index.html" -newer "$DASH/dist/index.html" 2>/dev/null | head -1)" ]; then
    echo "Compilando dashboard NAMY CONTROL..."
    (cd "$DASH" && npm run build)
  fi
fi
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Criei .env a partir do exemplo. Edite as chaves e rode de novo."
  exit 1
fi

echo "Subindo painel em http://127.0.0.1:3847"
echo "Dashboard NAMY CONTROL: http://127.0.0.1:3847/app/"
(cd saas/client-panel && npm start) &
PANEL_PID=$!
sleep 2
echo "Painel PID $PANEL_PID"
echo "Agora o bot. Pareamento no terminal."
node index.js
kill "$PANEL_PID" 2>/dev/null || true
