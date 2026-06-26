# 📦 CAMBIOS v9 — CMAC Arequipa · Scripts SQL organizados

## 🗂️ 18 SCRIPTS SQL EN 4 CARPETAS

### sql/supabase/ (4 scripts) — Cloud / Producción
Para la app web React. Ejecutar en Supabase SQL Editor.
- 00_setup_supabase.sql — tablas, RLS, 30 agencias, triggers
- 01_scoring_supabase.sql — funciones de scoring transaccional
- 02_agencias_asesores_supabase.sql — 360 asesores
- 03_seed_demo_supabase.sql — datos demo 1800 registros

### sql/postgres_local/ (4 scripts) — Desarrollo Local
Para backends: FastAPI, Node, Laravel, Django, Spring, ASP.NET.
- 00_setup_base_pg16.sql — tablas M1-M6 + vistas Power BI
- 01_scoring_tablas_funciones_pg16.sql — scoring completo
- 02_agencias_asesores_pg16.sql — red de agencias
- 03_seed_demo_1800_pg16.sql — seed demo

### sql/sqlserver/ (8 scripts) — Core Financiero + Power BI
Datos históricos reales simulados 2015-2024. ~130,000 registros.
- 01_DDL_create_tables.sql — estructura completa
- 02_INSERT_catalogos.sql — zonas, oficinas, tipos crédito
- 03_INSERT_clientes.sql — 500 clientes
- 04_INSERT_personal.sql — 120 empleados
- 05_INSERT_creditos.sql — 3,000 créditos
- 06_INSERT_planpagos.sql — ~50,000 cuotas
- 07_INSERT_scoring.sql — ~72,000 scorings mensuales
- 08_INSERT_kpis.sql — 1,710 KPIs (15 oficinas × 114 meses)

### sql/seguridad/ (2 scripts) — Roles y Auditoría
- 01_seguridad_roles_auditoria.sql — roles (Admin/Analista/UsuarioGeneral),
  logins con CHECK_POLICY, trigger de auditoría mejorado con detalle
- 02_sqlserver_vistas_powerbi.sql — 5 vistas para Power BI:
  vw_kpis_cartera, vw_creditos_detalle, vw_scoring_clientes,
  vw_plan_pagos, vw_personal_completo

## 🔧 CORRECCIONES EN SCRIPTS ORIGINALES
- SQLQuery1.sql: typo `IdProductox|INT` → `IdProducto INT` (corregido)
- SQLQuery1.sql: faltaba `EXEC sp_addrolemember` para asignar roles a usuarios
- SQLQuery1.sql: trigger de auditoría solo registraba "Modificación" sin distinción
  → ahora registra INSERT/UPDATE/DELETE con detalle de valores
- SeguridadBD integrada en seguridad/01_seguridad_roles_auditoria.sql
