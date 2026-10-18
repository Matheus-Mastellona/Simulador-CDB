@echo off
cd /d "%~dp0"
echo Iniciando servidor Angular...
echo.
node node_modules\@angular\cli\bin\ng.js serve --port 65103 --open
if %errorlevel% neq 0 (
  echo.
  echo ERRO ao iniciar o servidor. Detalhes acima.
  pause
)
