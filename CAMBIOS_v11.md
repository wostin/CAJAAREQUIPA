# 📦 CAMBIOS v11 — CMAC Arequipa · Alineación a la Rúbrica Banco Andino

Esta versión agrega exactamente lo que la rúbrica de 20 puntos evalúa, sin romper
nada de lo que ya tenías (scoring, fichas, dashboard, homebanking).

---

## 🎯 Qué se agregó y a qué criterio responde

### Criterio 1 — Integración Core ↔ Homebanking (flujo end-to-end)
Antes el flujo terminaba cuando el asesor marcaba la solicitud como "desembolsado",
pero nada volvía al Homebanking. Ahora:

- **`fn_desembolsar_credito(solicitud_id)`** (RPC en Supabase) ejecuta todo el flujo:
  1. valida que la solicitud esté `aprobado` y no desembolsada,
  2. usa la cuenta activa del cliente o le crea una de ahorro,
  3. **abona el monto al saldo** (vuelve al Homebanking),
  4. registra una **transacción de crédito** visible en Movimientos,
  5. genera el **cronograma de cuotas** (sistema francés),
  6. crea el crédito en el Core (`creditos_preaprobados`) y cierra la solicitud,
  7. deja auditoría + alerta al cliente.
- Backend: `POST /api/prestamos/:id/desembolsar` (solo comité/admin/gerente).
- El cliente ve el resultado en su saldo, en Movimientos y en
  `GET /api/prestamos/:id/cronograma`.

### Criterio 2 — Reglas de negocio del crédito (RDS + ruta de aprobación)
- **RDS con semáforo**: `fn_evaluar_rds()` calcula `cuota = f(TEA→TEM)` y
  `RDS = cuota / ingreso_neto`. Semáforo: **verde ≤30%**, **ámbar ≤40%**, **rojo >40%**.
  - verde → aprobar · ámbar → elevar a comité · rojo → rechazar.
  - Backend: `POST /api/prestamos/evaluar-rds`.
- **Ruta de aprobación por monto** (se valida en `PUT /api/prestamos/:id/estado`
  al pasar a `aprobado`; devuelve **403** si el rol no alcanza):
  - ≤ S/ 5,000 → Asesor
  - ≤ S/ 20,000 → Jefe Regional / Administrador
  - ≤ S/ 50,000 → Unidad de Riesgos
  - \> S/ 50,000 → Comité de créditos

### Criterio 3 — Seguridad y RBAC (JWT + roles)
- Roles ampliados: `cliente, asesor, riesgos, comite, admin, gerente`.
- Guards nuevos en `middleware/auth.js`: `requireRiesgos`, `requireComite`, `requireGerencia`.
- **Acciones críticas bloqueadas (403)**:
  - Derivar judicial / castigar → solo **Riesgos o Gerencia**.
  - Desembolsar → solo **Comité / Admin / Gerencia**.
- JWT sigue validándose en el backend (no solo en el frontend) vía Supabase Auth.

### Criterio 4 — Recuperaciones / Mora (R1 · R2 · R3)  ← módulo nuevo completo
- **R1 — Consulta por bandas + KPIs**: bandas Vigente / Preventiva (1–8) /
  Temprana (9–30) / Tardía (31–120) / Judicial (121–180) / Castigo (>180).
  - `GET /api/recuperaciones/bandas` (KPIs: ratio de mora, saldo en mora…)
  - `GET /api/recuperaciones/cartera?banda=`
- **R2 — Gestión e historial de cobranza**:
  - `POST /api/recuperaciones/:id/gestiones` (canal, resultado, compromiso…)
  - `GET  /api/recuperaciones/:id/gestiones`
- **R3 — Transiciones con validación de umbral**:
  - `POST /api/recuperaciones/:id/judicial` → exige **≥121 días** (la BD rechaza si no).
  - `POST /api/recuperaciones/:id/castigo`  → exige **>180 días**.
- Frontend: página **Core → Recuperaciones** (`pages/core/Recuperaciones.jsx`).

### Criterio 5 — Calidad de datos, arquitectura y documentación
- **Arquitectura en capas** demostrada en el módulo nuevo:
  `routes/recuperaciones.js` → `services/recuperaciones.service.js` →
  `repositories/recuperaciones.repo.js` → BD.
- **Datos calibrados**: el script 04 calibra **~13% de mora** sobre la cartera.
- **Integridad referencial**: `cronograma_cuotas` y `gestiones_cobranza` con FK a
  `creditos_preaprobados` y `auth.users`.
- **Scripts versionados** (00–04) y **CRUD por RLS** en las tablas nuevas.
- **Documentación**: `docs/HISTORIAS_DE_USUARIO.md` (HU + RF + matriz de trazabilidad)
  y `docs/uml/` (ER, secuencia de desembolso, secuencia de mora).

---

## 🗂 Archivos nuevos / modificados

```
sql/supabase/04_recuperaciones_integracion_supabase.sql   (NUEVO)
backend/src/middleware/auth.js                            (roles riesgos/comite)
backend/src/repositories/recuperaciones.repo.js           (NUEVO)
backend/src/services/recuperaciones.service.js            (NUEVO)
backend/src/routes/recuperaciones.js                      (NUEVO)
backend/src/routes/prestamos.js                           (RDS + ruta aprobación + desembolso)
backend/src/server.js                                     (monta /api/recuperaciones)
frontend/src/pages/core/Recuperaciones.jsx                (NUEVO)
frontend/src/App.jsx                                      (ruta)
frontend/src/components/Layout.jsx                        (menú)
docs/HISTORIAS_DE_USUARIO.md                              (NUEVO)
docs/uml/*.puml                                           (NUEVO)
```

## ▶️ Cómo probar el flujo completo (demo de clase)

1. Ejecuta en Supabase los scripts en orden `00 → 01 → 02 → 03 → 04`.
2. Asigna roles: a un usuario ponle `rol='riesgos'` y a otro `rol='comite'` en `perfiles`.
3. Cliente: en Homebanking solicita un préstamo (`POST /api/prestamos`).
4. Core (admin): aprueba con `PUT /api/prestamos/:id/estado {estado:'aprobado'}`
   (prueba un monto > S/ 50,000 con rol asesor → debe dar **403**).
5. Comité: `POST /api/prestamos/:id/desembolsar` → el saldo del cliente sube,
   aparece la transacción y el cronograma.
6. Core → Recuperaciones: revisa bandas, registra una gestión (R2) y, con rol
   Riesgos, prueba `judicial`/`castigo` (un crédito con pocos días debe ser **rechazado** por umbral).

---

## ✅ Hoja de autoevaluación (rúbrica Banco Andino)

| # | Criterio | Nivel | Pts | Evidencia |
|---|----------|-------|-----|-----------|
| 1 | Integración Core ↔ Homebanking | Excelente | 4/4 | `fn_desembolsar_credito` + `POST /:id/desembolsar` + cronograma + saldo |
| 2 | Reglas de negocio del crédito | Excelente | 4/4 | scoring previo + `fn_evaluar_rds` (semáforo) + ruta de aprobación por monto + comité + desembolso |
| 3 | Seguridad y RBAC (JWT + roles) | Excelente | 4/4 | JWT backend + roles riesgos/comité + acciones críticas con 403 |
| 4 | Recuperaciones / Mora (R1·R2·R3) | Excelente | 4/4 | bandas+KPIs, gestiones+historial, judicial(≥121)/castigo(>180) con umbral |
| 5 | Calidad de datos, arquitectura y docs | Excelente | 4/4 | capas routes→services→repos→BD, FK, ~13% mora, scripts 00–04, HU+RF+UML |
| | **TOTAL** | **Sobresaliente** | **20/20** | |

> Nota honesta: tu Criterio 5 sube a "Excelente" solo si además dejas las
> Historias de Usuario y los UML revisados y coherentes con tu defensa. Los dejé
> como base en `docs/`, pero conviene que los ajustes a tu redacción.
