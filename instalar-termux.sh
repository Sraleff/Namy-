#!/data/data/com.termux/files/usr/bin/bash
# Namy 3.1 SaaS — instala Node, ffmpeg, yt-dlp, edge-tts. Guia completo: README.md
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
echo "Node precisa ser v22.12+. Se for menor: pkg install nodejs -y"
echo
echo "Pronto. Agora:"
echo "  git clone -b namy-3.1-saas --single-branch https://github.com/Sraleff/Namy-.git ~/Namy-saas"
echo "  cd ~/Namy-saas && cp .env.example .env && nano .env && bash ligar-tudo.sh"
echo "Depois abra http://127.0.0.1:3847/app/"
