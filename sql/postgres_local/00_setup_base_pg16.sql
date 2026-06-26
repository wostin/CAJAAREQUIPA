-- ============================================================
-- SCRIPT 00 — Setup Base: Tablas M1 a M6
-- FieldIQ / Portal Mi Banco · PostgreSQL 16 LOCAL · v3.0
-- ============================================================
-- ADAPTADO PARA: PostgreSQL 16 puro (sin Supabase / sin auth.users)
-- COMPATIBILIDAD BACKENDS: Laravel · Node.js · FastAPI ·
--                          Django · Spring Boot · ASP.NET Core
-- COMPATIBLE CON: Power BI Desktop (Import / DirectQuery)
-- ============================================================
-- EJECUTAR: 1ro de 4
-- TIEMPO ESTIMADO: < 5 segundos
-- DONDE: pgAdmin 4 → Query Tool (base: bd_core_financiero)
--        o psql -U postgres -d bd_core_financiero -f 00_setup_base_pg16.sql
-- ============================================================
-- QUÉ CAMBIA RESPECTO A v2.1 (Supabase):
--   ✓ auth.users reemplazado por public.usuarios_mock
--   ✓ auth.uid()  reemplazado por current_setting() o parámetro
--   ✓ RLS desactivado (Power BI conecta como superuser local)
--   ✓ Trigger on_auth_user_created eliminado (no aplica local)
--   ✓ Columna password_hash en usuarios_mock (para bcrypt por backend)
--   ✓ pgcrypto habilitado para gen_random_uuid() en PG 16
-- ============================================================

-- ── Extensiones requeridas ────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;  -- opcional, monitoreo

-- ── 0. usuarios_mock (reemplaza auth.users de Supabase) ───
-- Esta tabla es la raíz de identidad del sistema.
-- Los 6 backends hacen login contra ella con bcrypt.
-- Power BI la usa para JOINs de análisis.
CREATE TABLE IF NOT EXISTS public.usuarios_mock (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT        NOT NULL UNIQUE,
  password_hash   TEXT        NOT NULL,          -- bcrypt $2b$... generado por el backend
  nombre          TEXT        NOT NULL DEFAULT '',
  apellido        TEXT        NOT NULL DEFAULT '',
  rol             TEXT        NOT NULL DEFAULT 'cliente'
                    CHECK (rol IN ('cliente','asesor','admin')),
  activo          BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice para login rápido (todos los backends lo usan)
CREATE INDEX IF NOT EXISTS idx_usuarios_mock_email
  ON public.usuarios_mock(email);

-- ── 1. cuentas ────────────────────────────────────────────
-- M2: Módulo de Cuentas (corriente / ahorro)
CREATE TABLE IF NOT EXISTS public.cuentas (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID          NOT NULL REFERENCES public.usuarios_mock(id) ON DELETE CASCADE,
  tipo           TEXT          NOT NULL CHECK (tipo IN ('corriente','ahorro')),
  numero_cuenta  TEXT          NOT NULL UNIQUE,
  saldo          NUMERIC(12,2) NOT NULL DEFAULT 0,
  moneda         TEXT          NOT NULL DEFAULT 'PEN'
                   CHECK (moneda IN ('PEN','USD')),
  estado         TEXT          NOT NULL DEFAULT 'activa'
                   CHECK (estado IN ('activa','bloqueada','cerrada')),
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cuentas_user_id
  ON public.cuentas(user_id);

-- ── 2. transacciones ──────────────────────────────────────
-- M3: Módulo de Transacciones
CREATE TABLE IF NOT EXISTS public.transacciones (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID          NOT NULL REFERENCES public.usuarios_mock(id) ON DELETE CASCADE,
  cuenta_id      UUID          REFERENCES public.cuentas(id) ON DELETE SET NULL,
  tipo           TEXT          NOT NULL CHECK (tipo IN ('debito','credito')),
  descripcion    TEXT          NOT NULL,
  monto          NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  saldo_post     NUMERIC(12,2),   -- saldo de la cuenta DESPUÉS de la transacción
  canal          TEXT          DEFAULT 'homebanking'
                   CHECK (canal IN ('homebanking','app_movil','ventanilla','atm','api')),
  referencia     TEXT,            -- código externo (Yape, BCRP, etc.)
  fecha          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transacciones_user_id
  ON public.transacciones(user_id);
CREATE INDEX IF NOT EXISTS idx_transacciones_fecha
  ON public.transacciones(fecha);
CREATE INDEX IF NOT EXISTS idx_transacciones_cuenta_id
  ON public.transacciones(cuenta_id);

-- ── 3. pagos ──────────────────────────────────────────────
-- M4: Módulo de Pagos de Servicios
CREATE TABLE IF NOT EXISTS public.pagos (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID          NOT NULL REFERENCES public.usuarios_mock(id) ON DELETE CASCADE,
  servicio         TEXT          NOT NULL
                     CHECK (servicio IN ('agua','luz','cable','telefono','gas','internet','municipio')),
  numero_contrato  TEXT          NOT NULL,
  empresa          TEXT,          -- nombre del proveedor (SEDAM, Luz del Sur, etc.)
  monto            NUMERIC(10,2) NOT NULL CHECK (monto > 0),
  estado           TEXT          NOT NULL DEFAULT 'completado'
                     CHECK (estado IN ('completado','pendiente','rechazado')),
  canal            TEXT          DEFAULT 'homebanking',
  fecha            TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pagos_user_id
  ON public.pagos(user_id);

-- ── 4. solicitudes_prestamo ───────────────────────────────
-- M5: Módulo de Préstamos (solicitudes desde homebanking)
CREATE TABLE IF NOT EXISTS public.solicitudes_prestamo (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID          NOT NULL REFERENCES public.usuarios_mock(id) ON DELETE CASCADE,
  monto          NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  plazo_meses    INTEGER       NOT NULL CHECK (plazo_meses BETWEEN 3 AND 84),
  tasa_anual     NUMERIC(5,2)  NOT NULL,   -- TEA en decimal (ej: 0.60 = 60%)
  cuota_mensual  NUMERIC(10,2) NOT NULL,
  proposito      TEXT,
  -- tasa_mensual calculada para cuota: TEM = (1+TEA)^(1/12) - 1
  tasa_mensual   NUMERIC(8,6)  GENERATED ALWAYS AS (
    POWER(1 + tasa_anual, 1.0/12) - 1
  ) STORED,
  estado         TEXT          NOT NULL DEFAULT 'pendiente'
                   CHECK (estado IN ('pendiente','en_evaluacion','aprobado','rechazado','desembolsado')),
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_solicitudes_user_id
  ON public.solicitudes_prestamo(user_id);

-- ── 5. cuentas_ahorro ─────────────────────────────────────
-- M6: Módulo de Ahorro (cuenta de ahorros con meta)
CREATE TABLE IF NOT EXISTS public.cuentas_ahorro (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID          NOT NULL REFERENCES public.usuarios_mock(id) ON DELETE CASCADE,
  cuenta_id       UUID          REFERENCES public.cuentas(id),   -- vinculada a cuenta de ahorro
  saldo           NUMERIC(12,2) NOT NULL DEFAULT 0,
  meta_ahorro     NUMERIC(12,2) NOT NULL DEFAULT 10000,
  tasa_interes    NUMERIC(5,4)  NOT NULL DEFAULT 0.035,           -- 3.5% TEA en decimal
  tipo_plazo      TEXT          DEFAULT 'libre'
                    CHECK (tipo_plazo IN ('libre','plazo_fijo_30','plazo_fijo_90','plazo_fijo_180')),
  fecha_apertura  DATE          NOT NULL DEFAULT CURRENT_DATE,
  fecha_vencimiento DATE,
  activa          BOOLEAN       NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_cuentas_ahorro_user_id
  ON public.cuentas_ahorro(user_id);

-- ── Vista para Power BI: M1–M6 resumen por cliente ────────
-- Power BI Desktop: importar esta vista para el dashboard de
-- comportamiento de clientes del portal homebanking.
CREATE OR REPLACE VIEW public.vw_pbi_resumen_clientes AS
SELECT
  u.id                                          AS user_id,
  u.email,
  u.nombre || ' ' || u.apellido                AS nombre_completo,
  u.created_at                                  AS fecha_registro,
  -- M2: Cuentas
  COUNT(DISTINCT c.id)                          AS num_cuentas,
  COALESCE(SUM(c.saldo), 0)                     AS saldo_total_pen,
  MAX(c.created_at)                             AS ultima_cuenta_abierta,
  -- M3: Transacciones
  COUNT(DISTINCT t.id)                          AS num_transacciones,
  COALESCE(SUM(t.monto) FILTER (WHERE t.tipo = 'credito'), 0) AS total_abonos,
  COALESCE(SUM(t.monto) FILTER (WHERE t.tipo = 'debito'),  0) AS total_cargos,
  MAX(t.fecha)                                  AS ultima_transaccion,
  -- M4: Pagos
  COUNT(DISTINCT p.id)                          AS num_pagos,
  COALESCE(SUM(p.monto), 0)                     AS total_pagado_servicios,
  -- M5: Préstamos
  COUNT(DISTINCT sp.id)                         AS num_solicitudes,
  COUNT(DISTINCT sp.id) FILTER (WHERE sp.estado = 'aprobado') AS prestamos_aprobados,
  COALESCE(SUM(sp.monto) FILTER (WHERE sp.estado IN ('aprobado','desembolsado')), 0)
                                                AS monto_prestado_total,
  -- M6: Ahorro
  COALESCE(MAX(ca.saldo), 0)                    AS saldo_ahorro,
  COALESCE(MAX(ca.meta_ahorro), 0)              AS meta_ahorro,
  ROUND(
    COALESCE(MAX(ca.saldo), 0) /
    NULLIF(COALESCE(MAX(ca.meta_ahorro), 0), 0) * 100, 1
  )                                             AS avance_meta_pct
FROM public.usuarios_mock u
LEFT JOIN public.cuentas              c  ON u.id = c.user_id  AND c.estado = 'activa'
LEFT JOIN public.transacciones        t  ON u.id = t.user_id
LEFT JOIN public.pagos                p  ON u.id = p.user_id  AND p.estado = 'completado'
LEFT JOIN public.solicitudes_prestamo sp ON u.id = sp.user_id
LEFT JOIN public.cuentas_ahorro       ca ON u.id = ca.user_id AND ca.activa = TRUE
WHERE u.rol = 'cliente'
GROUP BY u.id, u.email, u.nombre, u.apellido, u.created_at;

-- ── Vista para Power BI: Transacciones con detalle ────────
CREATE OR REPLACE VIEW public.vw_pbi_transacciones AS
SELECT
  t.id,
  t.fecha,
  DATE_TRUNC('month', t.fecha)::DATE           AS mes,
  DATE_TRUNC('week',  t.fecha)::DATE           AS semana,
  t.tipo,
  t.descripcion,
  t.monto,
  t.canal,
  c.tipo                                        AS tipo_cuenta,
  c.moneda,
  u.nombre || ' ' || u.apellido                AS cliente,
  u.email
FROM public.transacciones t
JOIN public.usuarios_mock u ON t.user_id = u.id
LEFT JOIN public.cuentas  c ON t.cuenta_id = c.id;

-- ── Verificación ──────────────────────────────────────────
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' ORDER BY table_name;
-- → Debe listar: cuentas, cuentas_ahorro, pagos,
--   solicitudes_prestamo, transacciones, usuarios_mock
-- SELECT viewname FROM pg_views WHERE schemaname = 'public';
-- → Debe listar: vw_pbi_resumen_clientes, vw_pbi_transacciones

-- ============================================================
-- FIN — 00_setup_base_pg16.sql · v3.0 · 2026
-- Siguiente: ejecutar 01_scoring_tablas_funciones_pg16.sql
-- ============================================================
