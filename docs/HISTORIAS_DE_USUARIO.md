# Historias de Usuario y Requerimientos Funcionales — Módulos v11

**Producto:** CMAC Arequipa — Core Financiero + Homebanking (BD compartida en Supabase).
**Alcance de este documento:** los módulos agregados en v11 (integración de desembolso,
RDS, ruta de aprobación, recuperaciones/mora). Complementa el README y `CAMBIOS_v11.md`.

---

## 1. Actores

| Actor | Descripción |
|---|---|
| **Cliente** | Solicita créditos y opera sus cuentas desde el Homebanking. |
| **Asesor** | Evalúa y aprueba montos pequeños; registra gestiones de cobranza. |
| **Riesgos** | Aprueba montos altos; ejecuta transiciones judicial/castigo. |
| **Comité** | Resuelve montos > S/ 50,000 y autoriza el desembolso. |
| **Admin / Gerencia** | Supervisión total; puede desembolsar y administrar. |

---

## 2. Historias de Usuario (con criterios de aceptación)

### HU-01 — Solicitar y recibir un crédito (Core ↔ Homebanking)
**Como** cliente **quiero** solicitar un crédito desde el Homebanking **para** recibir el
dinero en mi cuenta sin trámites manuales.
- **CA1** La solicitud queda en estado `pendiente` y es visible para el Core.
- **CA2** Al aprobarse y desembolsarse, el monto **se abona a mi saldo**.
- **CA3** Se crea una **transacción de crédito** visible en mis Movimientos.
- **CA4** Se genera un **cronograma de cuotas** consultable.
- **CA5** Recibo una **alerta** de "Crédito desembolsado".

### HU-02 — Evaluar la capacidad de pago (RDS)
**Como** asesor **quiero** ver el RDS con semáforo **para** decidir según política.
- **CA1** El sistema calcula `cuota` y `RDS = cuota/ingreso`.
- **CA2** verde ≤30% (aprobar), ámbar ≤40% (elevar a comité), rojo >40% (rechazar).

### HU-03 — Aprobar según el monto (ruta de aprobación)
**Como** banco **quiero** que cada monto lo apruebe el cargo correcto **para** controlar el riesgo.
- **CA1** Un rol insuficiente recibe **403** con el nivel requerido.
- **CA2** Montos > S/ 50,000 solo los resuelve el comité.

### HU-04 — Consultar la cartera morosa por bandas (R1)
**Como** gestor **quiero** ver la cartera por bandas con KPIs **para** priorizar la cobranza.
- **CA1** Bandas: Vigente, Preventiva, Temprana, Tardía, Judicial, Castigo.
- **CA2** KPIs: ratio de mora, saldo en mora, n.º de créditos.

### HU-05 — Registrar gestiones de cobranza (R2)
**Como** asesor **quiero** registrar cada contacto **para** mantener un historial.
- **CA1** Canal y resultado validados; se puede registrar compromiso de pago.
- **CA2** Cada gestión guarda la banda y los días de mora del momento.

### HU-06 — Derivar a judicial / castigar (R3)
**Como** Riesgos **quiero** mover créditos a judicial o castigo **para** sanear la cartera.
- **CA1** Judicial exige **≥121 días**; castigo exige **>180 días** (la BD rechaza si no).
- **CA2** Solo Riesgos o Gerencia pueden ejecutarlo (**403** a los demás).

---

## 3. Requerimientos Funcionales

| RF | Descripción | Endpoint |
|----|-------------|----------|
| RF-01 | Solicitar crédito | `POST /api/prestamos` |
| RF-02 | Aprobar con ruta por monto | `PUT /api/prestamos/:id/estado` |
| RF-03 | Evaluar RDS con semáforo | `POST /api/prestamos/evaluar-rds` |
| RF-04 | Desembolsar end-to-end | `POST /api/prestamos/:id/desembolsar` |
| RF-05 | Consultar cronograma | `GET /api/prestamos/:id/cronograma` |
| RF-06 | KPIs por banda (R1) | `GET /api/recuperaciones/bandas` |
| RF-07 | Listar cartera morosa (R1) | `GET /api/recuperaciones/cartera` |
| RF-08 | Historial de gestiones (R2) | `GET /api/recuperaciones/:id/gestiones` |
| RF-09 | Registrar gestión (R2) | `POST /api/recuperaciones/:id/gestiones` |
| RF-10 | Transición judicial (R3) | `POST /api/recuperaciones/:id/judicial` |
| RF-11 | Transición castigo (R3) | `POST /api/recuperaciones/:id/castigo` |

---

## 4. Matriz de trazabilidad HU → RF → endpoint

| HU | RF | Endpoint | Rol mínimo |
|----|----|----------|------------|
| HU-01 | RF-01, RF-04, RF-05 | `/api/prestamos`, `/:id/desembolsar`, `/:id/cronograma` | cliente / comité |
| HU-02 | RF-03 | `/api/prestamos/evaluar-rds` | asesor |
| HU-03 | RF-02 | `/api/prestamos/:id/estado` | según monto |
| HU-04 | RF-06, RF-07 | `/api/recuperaciones/bandas`, `/cartera` | asesor |
| HU-05 | RF-08, RF-09 | `/api/recuperaciones/:id/gestiones` | asesor |
| HU-06 | RF-10, RF-11 | `/api/recuperaciones/:id/judicial`, `/castigo` | riesgos / gerente |

---

## 5. Reglas de negocio (RN)

- **RN-01** RDS: verde ≤0.30 · ámbar ≤0.40 · rojo >0.40.
- **RN-02** Ruta de aprobación: 5k asesor · 20k admin · 50k riesgos · >50k comité.
- **RN-03** Banda de mora por días: 0 Vigente · 1–8 Preventiva · 9–30 Temprana ·
  31–120 Tardía · 121–180 Judicial · >180 Castigo.
- **RN-04** Judicial ≥121 días; castigo >180 días (validado en la BD).
- **RN-05** Transacciones inmutables (no UPDATE/DELETE por RLS).
