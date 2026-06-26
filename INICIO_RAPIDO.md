# CajaArequipa — Arquitectura SEPARADA (como Banco Andino)

Tres piezas independientes, igual que el banco del profesor:

| Pieza | Carpeta | Puerto | Quién la usa |
|---|---|---|---|
| Core Financiero | `core/` | **5173** | Personal del banco (asesor, comité…) |
| Homebanking | `homebanking/` | **5174** | Clientes |
| API (backend) | `backend/` | **3000** | Ambos portales |

## Cómo correr (3 terminales)

```bash
# Terminal 1 — backend (una sola API para ambos)
cd backend && npm install && npm run dev
# verifica: http://localhost:3000/api/health → version "v12-flujo-completo"

# Terminal 2 — CORE (personal)        → http://localhost:5173
cd core && npm install && npm run dev

# Terminal 3 — HOMEBANKING (cliente)  → http://localhost:5174
cd homebanking && npm install && npm run dev
```

Cada portal tiene su propio login. Dentro de cada app hay un enlace al otro portal
(se abren por separado, como en la banca real).

## Tarifario (casos del profesor — Crédito Empresarial Micro Micro)
- TEA **40.92%** con seguro de desgravamen · TEA **43.92%** sin seguro
- Cuota fija (sistema francés): TEM = (1+TEA)^(1/12) − 1
- El cliente elige el seguro al solicitar; la TEA viaja con la solicitud.

## Flujo de estados (diagrama del profesor)
pendiente → en_evaluacion → **en_comite** → aprobado → desembolsado (o rechazado).
El desembolso crea/abona la cuenta, genera el cronograma de cuotas y cierra la solicitud.

## Credenciales demo
- Core (usuario = DNI, clave = DNI): 11111111 asesor · 11111112 administrador ·
  11111113 jefe_regional · 11111114 riesgos · 11111115 comite · 11111116 analista
- Homebanking (usuario = código, clave = demo1234): cli000001 … cli000010

## SQL (Supabase, en orden si rehaces la base)
`sql/supabase/todo_en_uno.sql` (00→06). Parches sueltos para una base ya creada:
`PARCHE_roles.sql`, `PARCHE_rls_core.sql`, `PARCHE_estado_comite.sql`,
`FIX_relacion_solicitudes_perfiles.sql`.
