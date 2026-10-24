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
# Painel anterior ainda vivo (Ctrl+C antigo nao derrubava)? Para ele antes,
# senao o novo morre com a porta ocupada e o velho segue com codigo antigo.
PIDFILE="$ROOT/saas/client-panel/.painel.pid"
if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "Parando painel anterior (PID $(cat "$PIDFILE"))..."
  kill "$(cat "$PIDFILE")" 2>/dev/null || true
  sleep 2
fi
PORTA=$(grep -E '^PORT=' saas/client-panel/.env 2>/dev/null | cut -d= -f2 | tr -d ' "\r')
PORTA=${PORTA:-3847}
if curl -s -m 2 "http://127.0.0.1:$PORTA/health" >/dev/null 2>&1; then
  echo "ATENCAO: a porta $PORTA ja esta em uso por outro processo (painel antigo?)."
  echo "Pare ele (ex.: pkill -f 'node api/server.js') e rode de novo."
  exit 1
fi

# exec: o PID guardado e o do node, nao de um shell intermediario
(cd saas/client-panel && exec node api/server.js) &
PANEL_PID=$!
echo "$PANEL_PID" > "$PIDFILE"
# Ctrl+C, erro ou fim do bot: derruba o painel junto
trap 'kill "$PANEL_PID" 2>/dev/null; rm -f "$PIDFILE"' EXIT INT TERM
sleep 2
echo "Painel PID $PANEL_PID"
echo "Agora o bot. Pareamento no terminal."
node index.js
