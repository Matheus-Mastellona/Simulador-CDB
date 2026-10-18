@echo off
cd /d "%~dp0"
echo ==========================================
echo  Simulador CDB - Build para Android
echo ==========================================
echo.

echo [1/3] Gerando build de producao...
node node_modules\@angular\cli\bin\ng.js build --configuration production
if %errorlevel% neq 0 (
  echo ERRO no build Angular
  pause & exit /b 1
)

echo.
echo [2/3] Sincronizando com Android...
node cap-sync.js
if %errorlevel% neq 0 (
  echo ERRO no sync
  pause & exit /b 1
)

echo.
echo [3/3] Abrindo Android Studio...
node cap-open.js

echo.
echo ==========================================
echo  No Android Studio:
echo  Build ^> Build Bundle(s)/APK(s) ^> Build APK
echo  APK gerado em:
echo  android\app\build\outputs\apk\debug\app-debug.apk
echo ==========================================
pause
