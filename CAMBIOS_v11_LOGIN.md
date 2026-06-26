# 📦 CAMBIOS v11 — Login estilo "Banca por Internet" (Caja Arequipa)

Ingreso rediseñado para replicar el flujo y la imagen reales de Caja Arequipa.

## Qué cambió
- **Hero con FOTO REAL de personas** (no ilustraciones) detrás de una capa azul
  marino, igual que la web real. La foto se carga así:
  1. tu foto local `frontend/public/img/login-hero.jpg` (recomendado),
  2. si no, una foto de licencia libre (Unsplash) definida en `HERO_FALLBACK`,
  3. si ninguna carga, queda el degradado azul de marca.
  Ver `frontend/public/img/README.md`.
- **Login por Tarjeta de Débito + DNI + Clave**, con "Recordar tarjeta" y captcha
  "No soy un robot" — igual que la banca real.
- **Validaciones** (frontend y backend): tarjeta = 16 dígitos, DNI = 8 dígitos,
  clave obligatoria, captcha marcado; bloqueo por 5 intentos.
- **Acceso demo por correo**: pestaña para las cuentas de prueba existentes.

## Archivos
```
sql/supabase/05_login_tarjeta_supabase.sql   (columna + RPC + backfill demo)
backend/src/routes/auth.js                   (POST /api/auth/login-tarjeta)
frontend/src/pages/Login.jsx                 (rediseño con foto real)
frontend/src/context/AuthContext.jsx         (loginTarjeta + roles riesgos/comité)
frontend/src/App.jsx                          (roles riesgos/comité acceden a Core)
frontend/public/img/                          (carpeta para tu foto del hero)
```

## Probar
1. Ejecuta `05_login_tarjeta_supabase.sql` (después de 00–04). Imprime tarjeta+DNI demo.
2. Para una foto realista, deja `login-hero.jpg` en `frontend/public/img/`.
3. Pestaña "Con tarjeta": tarjeta(16) + DNI(8) + clave. Para las cuentas demo de
   siempre, usa la pestaña "Correo (demo)".
