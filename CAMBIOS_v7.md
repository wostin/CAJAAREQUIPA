# 🔧 CORRECCIONES v7 — CMAC Arequipa

## 🐛 BUGS CORREGIDOS

### 1. Bucle infinito en AuthContext
PROBLEMA: onAuthStateChange + loadPerfil se llamaban mutuamente sin fin
- SIGN_IN disparaba loadPerfil → que podía causar re-render → que disparaba SIGN_IN
SOLUCIÓN:
- Guard `initDone.current` (solo corre una vez, incluso en StrictMode)
- Ignorar evento `INITIAL_SESSION` (Supabase lo dispara al arrancar)
- Solo recargar perfil si cambió el userId (comparación con cache)
- `perfilLoading.current` evita llamadas simultáneas a /api/auth/me

### 2. getSession() en cada petición HTTP
PROBLEMA: axios interceptor llamaba supabase.auth.getSession() en CADA request
- Costoso, causa latencia y puede generar rate-limit
SOLUCIÓN:
- Cache del token JWT en memoria con `cachedToken`
- Solo refresca cuando el token expira (con 30s de margen)
- Se actualiza automáticamente en TOKEN_REFRESHED

### 3. Bucle en refresh de token (401)
PROBLEMA: un 401 disparaba refresh → nueva petición → otro 401 → bucle
SOLUCIÓN:
- Flag `_retried` en la petición (solo 1 reintento)
- Flag `isRefreshing` global (encola peticiones mientras se refresca)
- `processQueue()` resuelve/rechaza todas las peticiones en cola

### 4. Redirect loop en Login/RootRedirect
PROBLEMA: usuario logueado visitaba /login → lo redirigía → que volvía → bucle
SOLUCIÓN:
- `LoginGuard` component separado que revisa sesión antes de mostrar Login
- `RootRedirect` espera a que se cargue el perfil antes de redirigir a /core

### 5. ProtectedRoute redirigía antes de cargar perfil
PROBLEMA: perfil=null se interpretaba como "sin permiso" → redirigía a /homebanking
- Usuario asesor veía HomeB durante 1-2s antes de ser redirigido a Core
SOLUCIÓN:
- Si perfil===null (cargando), mostrar spinner
- Si perfil cargó y no tiene rol, entonces redirigir

### 6. .env con credenciales expuestas
PROBLEMA: .env tenía claves reales de Supabase
SOLUCIÓN:
- .env reseteado con placeholders seguros
- .env.example con instrucciones claras
- .gitignore que excluye todos los .env

### 7. Backend no diferenciaba anon key de service_role key
PROBLEMA: SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY eran el mismo valor
SOLUCIÓN:
- supabase.js del backend crea 2 clientes separados: `supabase` (anon) y `supabaseAdmin` (service_role)
- Validación al arrancar: si falta alguna variable → error claro en consola

---

## 🔐 RESTRICCIONES DE SEGURIDAD AÑADIDAS

- `requireRole(...roles)` middleware para proteger endpoints por rol
- `requireAsesor`, `requireAdmin`, `requireGerente` atajos listos para usar
- Verificación de `bloqueado` y `activo` en cada request autenticado
- Proxy de Vite devuelve 503 limpio si el backend no está corriendo
- Validación de URL/KEY de Supabase al iniciar (con pantalla de error clara)
