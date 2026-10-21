#!/usr/bin/env bash
# Roda o trail como o DONO do repo (com nvm), mesmo se a sessão do agente for root.
# Uso: bash scripts/trail.sh ask "onde fica o pareamento do WhatsApp" --source
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OWNER="$(stat -c %U "$ROOT" 2>/dev/null || id -un)"
RUN='[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null; command -v trail >/dev/null || { echo "trail nao instalado: npm install -g @trailhq/trail-code" >&2; exit 127; }; cd "$0" && trail "$@"'

if [ "$(id -un)" = "$OWNER" ] || [ "$OWNER" = "UNKNOWN" ]; then
  exec bash -c "$RUN" "$ROOT" "$@"
fi
exec sudo -u "$OWNER" -H bash -c "$RUN" "$ROOT" "$@"
