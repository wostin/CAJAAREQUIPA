# 🔧 Fix: Error 401 al hacer login con DNI

## ¿Por qué pasa?

El login por DNI/código de cliente usa `supabaseAdmin.rpc('fn_email_por_dni', ...)`.
Esta función necesita la **Secret key (service_role)** para bypassear RLS.

El `backend/.env` actual tiene la clave **ANON** copiada en `SUPABASE_SERVICE_ROLE_KEY`,
por eso Supabase rechaza la llamada RPC con 401 Unauthorized.

---

## Solución (2 minutos)

### Paso 1 — Obtén tu Secret key

1. Abre: https://supabase.com/dashboard/project/beyhsejxdtugxbwbqtda/settings/api
2. Sección **"Project API keys"**
3. Copia la clave **"service_role"** (empieza con `sb_secret_...` o es un JWT largo)

### Paso 2 — Pégala en backend/.env

Abre `backend/.env` y reemplaza esta línea:

```
SUPABASE_SERVICE_ROLE_KEY=PEGA_AQUI_TU_SECRET_KEY_sb_secret_
```

Por:

```
SUPABASE_SERVICE_ROLE_KEY=sb_secret_TU_CLAVE_REAL_AQUI
```

### Paso 3 — Reinicia el backend

```bash
cd backend
npm run dev
```

Deberías ver en consola:
```
[Supabase] serv: definida ✅
```

---

## Verificación rápida

Con el backend corriendo, prueba en otra terminal:

```bash
curl -X POST http://localhost:3000/api/auth/login-usuario \
  -H "Content-Type: application/json" \
  -d '{"usuario":"11111111","password":"11111111"}'
```

Respuesta esperada: `{"success":true,"token":"...","user":{...}}`

---

## Cambios incluidos en esta versión

- ✅ Logo de Caja Arequipa real (reemplaza el cuadro "C")
  → Archivo: `frontend/public/img/logo-caja-arequipa.png`
- ✅ `backend/.env` con marcador claro para la Secret key
- ✅ El código del backend ya estaba correcto — solo faltaba la clave
