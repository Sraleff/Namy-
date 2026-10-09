@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando bot...
  call npm install
)
if not exist saas\client-panel\node_modules (
  echo Instalando painel...
  pushd saas\client-panel
  call npm install
  popd
)
if not exist .env (
  copy .env.example .env
  echo Criei .env. Edite as chaves e rode de novo.
  pause
  exit /b 1
)
echo Abrindo painel em nova janela: http://localhost:3847
start "Namy Painel" cmd /k "cd /d saas\client-panel && npm start"
timeout /t 2 >nul
echo Iniciando bot nesta janela...
node index.js
pause
