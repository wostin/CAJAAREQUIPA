# 📁 SCRIPTS SQL — CMAC Arequipa v9
## Organización por motor de base de datos

```
sql/
├── supabase/           ← Para despliegue en Supabase Cloud (producción/staging)
├── postgres_local/     ← Para PostgreSQL 16 local (laboratorio/desarrollo)
├── sqlserver/          ← Para SQL Server + Power BI (análisis gerencial)
└── seguridad/          ← Roles, auditoría y vistas de seguridad
```

---

## 📂 supabase/ — Supabase Cloud
> Ejecutar en: **Supabase → SQL Editor** en este orden exacto

| # | Archivo | Qué hace | Registros |
|---|---------|----------|-----------|
| 1 | `00_setup_supabase.sql` | Tablas base + 30 agencias + RLS + triggers | ~400 |
| 2 | `01_scoring_supabase.sql` | Tablas y funciones de scoring transaccional | — |
| 3 | `02_agencias_asesores_supabase.sql` | 360 asesores (12 por agencia) | 360 |
| 4 | `03_seed_demo_supabase.sql` | Datos demo: clientes, transacciones, fichas | ~1800 |
| 5 | `04_recuperaciones_integracion_supabase.sql` | **v11** · mora R1·R2·R3, RDS, desembolso end-to-end, roles riesgos/comité, CRUD RLS | — |
| 6 | `05_login_tarjeta_supabase.sql` | **v11** · login por tarjeta+DNI: columna `numero_tarjeta` + RPC `fn_email_por_acceso` + backfill demo | — |
| 5 | `04_recuperaciones_integracion_supabase.sql` | **v11** · cronograma, gestiones de cobranza, RDS, desembolso end-to-end, mora R1·R2·R3, roles riesgos/comité, CRUD RLS, seed ~13% mora | — |

**Requisitos:** Proyecto Supabase activo + credenciales en `.env`

---

## 📂 postgres_local/ — PostgreSQL 16 Local
> Ejecutar en: **pgAdmin 4** o `psql` sobre base `bd_core_financiero`

| # | Archivo | Qué hace | Compatibilidad |
|---|---------|----------|----------------|
| 1 | `00_setup_base_pg16.sql` | Tablas M1–M6 + vistas Power BI | FastAPI/Node/Laravel/Django/Spring/ASP.NET |
| 2 | `01_scoring_tablas_funciones_pg16.sql` | Tablas scoring + funciones PL/pgSQL | PostgreSQL 16+ |
| 3 | `02_agencias_asesores_pg16.sql` | Agencias, asesores, zonas | — |
| 4 | `03_seed_demo_1800_pg16.sql` | 1,800 registros demo | — |

**Requisitos:** PostgreSQL 16, base de datos `bd_core_financiero` creada

```bash
psql -U postgres -c "CREATE DATABASE bd_core_financiero;"
psql -U postgres -d bd_core_financiero -f 00_setup_base_pg16.sql
psql -U postgres -d bd_core_financiero -f 01_scoring_tablas_funciones_pg16.sql
psql -U postgres -d bd_core_financiero -f 02_agencias_asesores_pg16.sql
psql -U postgres -d bd_core_financiero -f 03_seed_demo_1800_pg16.sql
```

---

## 📂 sqlserver/ — SQL Server (Core Financiero + Power BI)
> Ejecutar en: **SQL Server Management Studio (SSMS)** sobre `bd_core_financiero`

| # | Archivo | Qué hace | Registros |
|---|---------|----------|-----------|
| 1 | `01_DDL_create_tables.sql` | Estructura completa del Core Financiero | — |
| 2 | `02_INSERT_catalogos.sql` | Zonas, oficinas, tipos crédito, tipo cambio | ~200 |
| 3 | `03_INSERT_clientes.sql` | 500 clientes | 500 |
| 4 | `04_INSERT_personal.sql` | 120 empleados (asesores, auxiliares, admins) | 120 |
| 5 | `05_INSERT_creditos.sql` | 3,000 créditos + GENMCRECLI | 6,000 |
| 6 | `06_INSERT_planpagos.sql` | Plan de pagos para los créditos | ~50,000 |
| 7 | `07_INSERT_scoring.sql` | Scoring mensual 2015-2024 | ~72,000 |
| 8 | `08_INSERT_kpis.sql` | KPIs cartera mensual 15 oficinas x 114 meses | 1,710 |

**Total registros:** ~130,000+ registros de datos históricos reales simulados

**Requisitos:** SQL Server 2019/2022 + SSMS instalado

```sql
-- Crear base de datos primero
CREATE DATABASE bd_core_financiero;
GO
USE bd_core_financiero;
-- Luego ejecutar scripts del 01 al 08 en orden
```

---

## 📂 seguridad/ — Seguridad y Auditoría
> Complemento al sistema — roles, permisos y trazabilidad

| # | Archivo | Qué hace |
|---|---------|----------|
| 1 | `01_seguridad_roles_auditoria.sql` | Roles (Administrador/Analista/UsuarioGeneral), logins, trigger de auditoría |
| 2 | `02_sqlserver_vistas_powerbi.sql` | 5 vistas optimizadas para Power BI Desktop |

**Vistas disponibles para Power BI:**
- `vw_kpis_cartera` — KPIs mensuales por oficina y zona
- `vw_creditos_detalle` — Créditos con clasificación SBS calculada
- `vw_scoring_clientes` — Scoring con segmento PREMIER/ESTÁNDAR/BÁSICO
- `vw_plan_pagos` — Cuotas con estado e interés
- `vw_personal_completo` — Asesores con área, cargo y oficina

---

## 🔗 Relación entre motores

```
SQL Server (Core Financiero)        PostgreSQL 16 Local          Supabase Cloud
─────────────────────────────       ─────────────────────        ───────────────
GentZonas / GENTOficinas       ←→   agencias / zonas        ←→   agencias
CLIMCLIENTES                   ←→   perfiles_clientes        ←→   perfiles_clientes
SIPMPERSONAL                   ←→   asesores_negocio         ←→   asesores_negocio
KPYMCRECONVEN                  ←→   solicitudes_prestamo     ←→   creditos_preaprobados
SCORING_MENSUAL                ←→   scores_transaccionales   ←→   scores_transaccionales
KPIS_CARTERA_MENSUAL           ←→   vw_pbi_agencias          ←→   vw_pbi_agencias
```

**Equivalencias de campos clave:**
| SQL Server | PostgreSQL/Supabase |
|---|---|
| `nCodZona` / `cDesZona` | `region` / `departamento` |
| `cCodOficin` / `cDesOficin` | `codigo` / `nombre` (agencias) |
| `cCodCliente` | `user_id` (UUID) |
| `cCodPerson` (asesor) | `codigo` (asesores_negocio) |
| `nTEACre` | `tasa_anual` |
| `nDiaAtrCre` | `dias_mora` |

---

## ⚡ ORDEN TOTAL RECOMENDADO (proyecto completo)

1. **SQL Server:** Scripts 01→08 del sqlserver/ (datos históricos Power BI)
2. **SQL Server:** seguridad/01 + seguridad/02 (roles y vistas)
3. **PostgreSQL local:** Scripts 00→03 del postgres_local/ (desarrollo backend)
4. **Supabase:** Scripts 00→03 del supabase/ (producción web app)

