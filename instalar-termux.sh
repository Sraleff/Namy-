#!/data/data/com.termux/files/usr/bin/bash
# Namy 3.0 — instala Node, ffmpeg, yt-dlp, edge-tts
set -e
echo ">> Atualizando pacotes..."
pkg update -y && pkg upgrade -y
echo ">> Instalando sistema..."
pkg install nodejs-lts git python python-pip ffmpeg wget curl unzip -y || pkg install nodejs git python ffmpeg wget curl unzip -y
echo ">> Instalando yt-dlp e edge-tts..."
pip install -U yt-dlp edge-tts
echo
echo "Node:    $(node -v 2>/dev/null || echo ausente)"
echo "Python:  $(python --version 2>/dev/null || echo ausente)"
echo "ffmpeg:  $(ffmpeg -version 2>/dev/null | head -n 1 || echo ausente)"
echo "yt-dlp:  $(yt-dlp --version 2>/dev/null || echo ausente)"
echo
echo "Pronto. Extraia a Namy em ~/Namy3, rode: npm install && nano .env && node index.js"
