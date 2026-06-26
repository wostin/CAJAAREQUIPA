@echo off
chcp 65001 >nul
title CajaArequipa v13 - Iniciador (apps separadas)
cd /d "%~dp0"
cls
echo ============================================================
echo   CAJA AREQUIPA v13 - ARQUITECTURA SEPARADA
echo   CORE personal :5173  ^|  HOMEBANKING cliente :5174  ^|  API :3000
echo ============================================================
echo   Carpeta actual: %~dp0
echo.

if exist "frontend\" (
  echo  [!] PELIGRO: existe una carpeta "frontend" del proyecto VIEJO.
  echo      Esa carpeta tiene el switcher Portal/Core que NO debe estar.
  echo      Borrala antes de continuar (ejecuta BORRAR_VIEJO.bat).
  echo.
  pause
  exit /b
)

if not exist "core\" (
  echo  [X] No encuentro la carpeta "core". 
  echo      Descomprime el ZIP en una carpeta NUEVA y vacia.
  pause
  exit /b
)

if not exist "backend\.env" (
  echo.
  echo  [!] FALTA el archivo  backend\.env  con tus llaves de Supabase.
  echo      Sin el, el backend no arranca.
  echo.
  echo      Crea backend\.env con este contenido (reemplaza las llaves):
  echo         SUPABASE_URL=https://beyhsejxdtugxbwbqtda.supabase.co
  echo         SUPABASE_ANON_KEY=eyJ... ^(anon public^)
  echo         SUPABASE_SERVICE_ROLE_KEY=eyJ... ^(service_role^)
  echo         PORT=3000
  echo.
  echo      Llaves en: supabase.com - Project Settings - API Keys
  echo      Atajo: copia .env.example a .env y completa las llaves.
  echo.
  pause
  exit /b
)

echo  [OK] Estructura correcta: core + homebanking + backend
echo.
echo  Abriendo 3 ventanas...
pause

start "BACKEND :3000"      cmd /k "cd /d %~dp0backend && npm install && npm run dev"
start "CORE :5173"         cmd /k "cd /d %~dp0core && npm install && npm run dev"
start "HOMEBANKING :5174"  cmd /k "cd /d %~dp0homebanking && npm install && npm run dev"

echo.
echo  Personal del banco : http://localhost:5173  (CORE - sin Portal/Core arriba)
echo  Clientes           : http://localhost:5174  (HOMEBANKING - sin Portal/Core)
echo  Si ves algo viejo en el navegador: Ctrl+Shift+R
pause
