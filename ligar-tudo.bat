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
if exist saas\client-panel\dashboard (
  pushd saas\client-panel\dashboard
  if not exist node_modules (
    echo Instalando dashboard...
    call npm install
  )
  if not exist dist\index.html (
    echo Compilando dashboard NAMY CONTROL...
    call npm run build
  )
  popd
)
if not exist .env (
  copy .env.example .env
  echo Criei .env. Edite as chaves e rode de novo.
  pause
  exit /b 1
)
echo Abrindo painel em nova janela: http://localhost:3847
echo Dashboard NAMY CONTROL: http://localhost:3847/app/
start "Namy Painel" cmd /k "cd /d saas\client-panel && npm start"
timeout /t 2 >nul
echo Iniciando bot nesta janela...
node index.js
pause
