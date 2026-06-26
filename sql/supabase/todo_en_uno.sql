-- todo_en_uno.sql — 00 a 06 (idempotente · roles+NOT VALID · en_comite · FK solicitudes→perfiles · usuarios demo con identities)

-- ======== 00_setup_supabase.sql ========

-- ============================================================
-- CMAC AREQUIPA v4.0 — SCRIPT COMPLETO CON SEGURIDAD BANCARIA
-- Supabase → SQL Editor → Pegar todo → Run
-- ============================================================

-- ── PASO 0: LIMPIEZA COMPLETA ────────────────────────────
DROP VIEW IF EXISTS public.vw_pbi_resumen_clientes    CASCADE;
DROP VIEW IF EXISTS public.vw_pbi_transacciones       CASCADE;
DROP VIEW IF EXISTS public.vw_pbi_agencias            CASCADE;
DROP VIEW IF EXISTS public.vw_pbi_asesores            CASCADE;

DROP TABLE IF EXISTS public.audit_log                 CASCADE;
DROP TABLE IF EXISTS public.login_intentos            CASCADE;
DROP TABLE IF EXISTS public.sesiones_activas          CASCADE;
DROP TABLE IF EXISTS public.alertas_usuario           CASCADE;
DROP TABLE IF EXISTS public.creditos_preaprobados     CASCADE;
DROP TABLE IF EXISTS public.fichas_campo              CASCADE;
DROP TABLE IF EXISTS public.scores_transaccionales    CASCADE;
DROP TABLE IF EXISTS public.features_scoring          CASCADE;
DROP TABLE IF EXISTS public.movimientos_mensuales     CASCADE;
DROP TABLE IF EXISTS public.perfiles_clientes         CASCADE;
DROP TABLE IF EXISTS public.asesores_negocio          CASCADE;
DROP TABLE IF EXISTS public.agencias                  CASCADE;
DROP TABLE IF EXISTS public.cuentas_ahorro            CASCADE;
DROP TABLE IF EXISTS public.solicitudes_prestamo      CASCADE;
DROP TABLE IF EXISTS public.pagos                     CASCADE;
DROP TABLE IF EXISTS public.transacciones             CASCADE;
DROP TABLE IF EXISTS public.cuentas                   CASCADE;
DROP TABLE IF EXISTS public.perfiles                  CASCADE;

DROP FUNCTION IF EXISTS public.handle_new_user()                         CASCADE;
DROP FUNCTION IF EXISTS public.registrar_audit()                         CASCADE;
DROP FUNCTION IF EXISTS public.calcular_features_scoring(UUID)           CASCADE;
DROP FUNCTION IF EXISTS public.calcular_score_transaccional(UUID)        CASCADE;
DROP FUNCTION IF EXISTS public.evaluar_credito_campo(UUID,NUMERIC,INT)   CASCADE;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- TABLA: perfiles (usuarios del sistema)
-- ============================================================
CREATE TABLE public.perfiles (
  id           UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        TEXT        NOT NULL,
  nombre       TEXT        NOT NULL DEFAULT '',
  apellido     TEXT        NOT NULL DEFAULT '',
  dni          TEXT        UNIQUE,
  telefono     TEXT,
  rol          TEXT        NOT NULL DEFAULT 'cliente'
                 CHECK (rol IN ('cliente','asesor','administrador','jefe_regional','riesgos','comite','analista','admin','gerente')),
  activo       BOOLEAN     NOT NULL DEFAULT TRUE,
  bloqueado    BOOLEAN     NOT NULL DEFAULT FALSE,
  motivo_bloqueo TEXT,
  ultimo_acceso  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger: crear perfil automáticamente al registrar usuario
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO public.perfiles (id, email, nombre, apellido, rol)
  VALUES (
    NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nombre',  SPLIT_PART(NEW.email,'@',1)),
    COALESCE(NEW.raw_user_meta_data->>'apellido',''),
    CASE WHEN COALESCE(NEW.raw_user_meta_data->>'rol','cliente') IN ('cliente','asesor','administrador','jefe_regional','riesgos','comite','analista','admin','gerente')
         THEN COALESCE(NEW.raw_user_meta_data->>'rol','cliente') ELSE 'cliente' END
  ) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Crear perfiles para usuarios YA existentes
INSERT INTO public.perfiles (id, email, nombre, apellido, rol)
SELECT id, email,
  COALESCE(raw_user_meta_data->>'nombre', SPLIT_PART(email,'@',1)),
  COALESCE(raw_user_meta_data->>'apellido',''),
  CASE WHEN COALESCE(raw_user_meta_data->>'rol','cliente') IN ('cliente','asesor','administrador','jefe_regional','riesgos','comite','analista','admin','gerente')
       THEN COALESCE(raw_user_meta_data->>'rol','cliente') ELSE 'cliente' END
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- TABLA: audit_log (registro inmutable de todas las acciones)
-- ============================================================
CREATE TABLE public.audit_log (
  id          BIGSERIAL   PRIMARY KEY,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  accion      TEXT        NOT NULL,   -- LOGIN, LOGOUT, TRANSFERENCIA, PAGO, etc.
  tabla       TEXT,
  registro_id TEXT,
  datos_antes JSONB,
  datos_despues JSONB,
  ip          TEXT,
  user_agent  TEXT,
  resultado   TEXT        NOT NULL DEFAULT 'ok' CHECK (resultado IN ('ok','error','bloqueado')),
  detalle     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_user_id    ON public.audit_log(user_id);
CREATE INDEX idx_audit_accion     ON public.audit_log(accion);
CREATE INDEX idx_audit_created_at ON public.audit_log(created_at DESC);

-- ============================================================
-- TABLA: login_intentos (control de fuerza bruta)
-- ============================================================
CREATE TABLE public.login_intentos (
  id          BIGSERIAL   PRIMARY KEY,
  email       TEXT        NOT NULL,
  ip          TEXT,
  exitoso     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_login_email ON public.login_intentos(email, created_at DESC);
CREATE INDEX idx_login_ip    ON public.login_intentos(ip, created_at DESC);

-- ============================================================
-- TABLA: alertas_usuario (notificaciones del sistema)
-- ============================================================
CREATE TABLE public.alertas_usuario (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo        TEXT        NOT NULL CHECK (tipo IN ('transaccion','seguridad','prestamo','sistema','pago')),
  titulo      TEXT        NOT NULL,
  mensaje     TEXT        NOT NULL,
  leida       BOOLEAN     NOT NULL DEFAULT FALSE,
  urgente     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_alertas_user_id ON public.alertas_usuario(user_id, leida, created_at DESC);

-- ============================================================
-- TABLA: cuentas
-- ============================================================
CREATE TABLE public.cuentas (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo          TEXT          NOT NULL CHECK (tipo IN ('corriente','ahorro')),
  numero_cuenta TEXT          NOT NULL UNIQUE,
  saldo         NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (saldo >= 0),
  saldo_bloqueado NUMERIC(12,2) NOT NULL DEFAULT 0,
  moneda        TEXT          NOT NULL DEFAULT 'PEN' CHECK (moneda IN ('PEN','USD')),
  estado        TEXT          NOT NULL DEFAULT 'activa'
                  CHECK (estado IN ('activa','bloqueada','cerrada')),
  limite_diario NUMERIC(12,2) NOT NULL DEFAULT 5000,
  movido_hoy    NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_cuentas_user_id ON public.cuentas(user_id);

-- ============================================================
-- TABLA: transacciones (con validación de saldo)
-- ============================================================
CREATE TABLE public.transacciones (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cuenta_id   UUID          REFERENCES public.cuentas(id) ON DELETE SET NULL,
  tipo        TEXT          NOT NULL CHECK (tipo IN ('debito','credito')),
  categoria   TEXT          DEFAULT 'otros'
    CHECK (categoria IN ('transferencia','pago_servicio','retiro','deposito','prestamo','interes','comision','otros')),
  descripcion TEXT          NOT NULL,
  monto       NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  saldo_post  NUMERIC(12,2) NOT NULL DEFAULT 0,
  canal       TEXT          DEFAULT 'homebanking'
    CHECK (canal IN ('homebanking','app_movil','ventanilla','atm','api')),
  referencia  TEXT          UNIQUE DEFAULT 'TXN-'||upper(substr(gen_random_uuid()::text,1,8)),
  ip_origen   TEXT,
  estado      TEXT          NOT NULL DEFAULT 'completada'
    CHECK (estado IN ('completada','reversada','sospechosa')),
  fecha       TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_transacciones_user_id ON public.transacciones(user_id);
CREATE INDEX idx_transacciones_fecha   ON public.transacciones(fecha DESC);
CREATE INDEX idx_transacciones_cuenta  ON public.transacciones(cuenta_id);
CREATE INDEX idx_transacciones_ref     ON public.transacciones(referencia);

-- ============================================================
-- TABLA: pagos
-- ============================================================
CREATE TABLE public.pagos (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cuenta_id       UUID          REFERENCES public.cuentas(id),
  servicio        TEXT          NOT NULL
    CHECK (servicio IN ('agua','luz','cable','telefono','gas','internet','municipio','educacion','seguro')),
  numero_contrato TEXT          NOT NULL,
  empresa         TEXT,
  monto           NUMERIC(10,2) NOT NULL CHECK (monto > 0),
  comision        NUMERIC(6,2)  NOT NULL DEFAULT 0,
  estado          TEXT          NOT NULL DEFAULT 'completado'
    CHECK (estado IN ('completado','pendiente','rechazado','reversado')),
  referencia      TEXT          UNIQUE DEFAULT 'PAG-'||upper(substr(gen_random_uuid()::text,1,8)),
  canal           TEXT          DEFAULT 'homebanking',
  fecha           TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_pagos_user_id ON public.pagos(user_id);

-- ============================================================
-- TABLA: solicitudes_prestamo
-- ============================================================
CREATE TABLE public.solicitudes_prestamo (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  monto          NUMERIC(12,2) NOT NULL CHECK (monto BETWEEN 500 AND 100000),
  plazo_meses    INTEGER       NOT NULL CHECK (plazo_meses BETWEEN 3 AND 84),
  tasa_anual     NUMERIC(5,2)  NOT NULL CHECK (tasa_anual > 0),
  cuota_mensual  NUMERIC(10,2) NOT NULL,
  proposito      TEXT,
  tasa_mensual   NUMERIC(8,6)  GENERATED ALWAYS AS (POWER(1+tasa_anual,1.0/12)-1) STORED,
  estado         TEXT          NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','en_evaluacion','en_comite','aprobado','rechazado','desembolsado','cancelado')),
  evaluado_por   UUID          REFERENCES auth.users(id),
  fecha_evaluacion TIMESTAMPTZ,
  motivo_rechazo TEXT,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_solicitudes_user_id ON public.solicitudes_prestamo(user_id);
CREATE INDEX idx_solicitudes_estado  ON public.solicitudes_prestamo(estado);

-- ============================================================
-- TABLA: cuentas_ahorro
-- ============================================================
CREATE TABLE public.cuentas_ahorro (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cuenta_id         UUID          REFERENCES public.cuentas(id),
  saldo             NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (saldo >= 0),
  meta_ahorro       NUMERIC(12,2) NOT NULL DEFAULT 10000 CHECK (meta_ahorro > 0),
  tasa_interes      NUMERIC(5,4)  NOT NULL DEFAULT 0.035,
  tipo_plazo        TEXT          DEFAULT 'libre'
    CHECK (tipo_plazo IN ('libre','plazo_fijo_30','plazo_fijo_90','plazo_fijo_180')),
  fecha_apertura    DATE          NOT NULL DEFAULT CURRENT_DATE,
  fecha_vencimiento DATE,
  activa            BOOLEAN       NOT NULL DEFAULT TRUE,
  CONSTRAINT fecha_vencimiento_valida CHECK (fecha_vencimiento IS NULL OR fecha_vencimiento > fecha_apertura)
);
CREATE INDEX idx_cuentas_ahorro_user_id ON public.cuentas_ahorro(user_id);

-- ============================================================
-- TABLA: agencias
-- ============================================================
CREATE TABLE public.agencias (
  id           SERIAL      PRIMARY KEY,
  codigo       TEXT        NOT NULL UNIQUE,
  nombre       TEXT        NOT NULL,
  region       TEXT        NOT NULL,
  departamento TEXT        NOT NULL,
  provincia    TEXT        NOT NULL,
  distrito     TEXT        NOT NULL,
  direccion    TEXT,
  telefono     TEXT,
  jefe_agencia TEXT,
  lat          NUMERIC(10,7),
  lng          NUMERIC(10,7),
  activa       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- TABLA: asesores_negocio
-- ============================================================
CREATE TABLE public.asesores_negocio (
  id                        SERIAL        PRIMARY KEY,
  codigo                    TEXT          NOT NULL UNIQUE,
  id_agencia                INT           NOT NULL REFERENCES public.agencias(id),
  nombres                   TEXT          NOT NULL,
  apellidos                 TEXT          NOT NULL,
  dni                       TEXT,
  email                     TEXT,
  telefono                  TEXT,
  nivel                     TEXT          NOT NULL
    CHECK (nivel IN ('Junior I','Junior II','Senior I','Senior II')),
  cartera_clientes_promedio INT           NOT NULL CHECK (cartera_clientes_promedio > 0),
  meta_creditos_mes         INT           NOT NULL CHECK (meta_creditos_mes > 0),
  meta_monto_mes            NUMERIC(14,2) NOT NULL CHECK (meta_monto_mes > 0),
  zona_asignada             TEXT,
  activo                    BOOLEAN       NOT NULL DEFAULT TRUE,
  fecha_ingreso             DATE          NOT NULL DEFAULT CURRENT_DATE,
  user_id                   UUID          UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_asesores_agencia ON public.asesores_negocio(id_agencia);
CREATE INDEX idx_asesores_user_id ON public.asesores_negocio(user_id);

-- ============================================================
-- TABLAS DE SCORING
-- ============================================================
CREATE TABLE public.perfiles_clientes (
  id                       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID          NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nombres                  TEXT          NOT NULL DEFAULT '',
  apellidos                TEXT          NOT NULL DEFAULT '',
  dni                      TEXT          UNIQUE,
  fecha_nacimiento         DATE,
  edad                     SMALLINT      CHECK (edad BETWEEN 18 AND 100),
  genero                   TEXT          CHECK (genero IN ('M','F','otro')),
  telefono                 TEXT,
  distrito                 TEXT,
  provincia                TEXT,
  departamento             TEXT,
  nombre_negocio           TEXT,
  tipo_negocio             TEXT,
  antiguedad_negocio_meses INT           DEFAULT 0 CHECK (antiguedad_negocio_meses >= 0),
  tenencia_local           TEXT
    CHECK (tenencia_local IN ('alquilado_sin_contrato','alquilado_con_contrato','propio')),
  num_entidades_sbs        SMALLINT      DEFAULT 0 CHECK (num_entidades_sbs >= 0),
  calificacion_sbs         TEXT          DEFAULT 'Normal'
    CHECK (calificacion_sbs IN ('Normal','CPP','Deficiente','Dudoso','Perdida')),
  deuda_total_sbs          NUMERIC(12,2) DEFAULT 0 CHECK (deuda_total_sbs >= 0),
  estado_cliente           TEXT          NOT NULL DEFAULT 'activo'
    CHECK (estado_cliente IN ('activo','bloqueado','inactivo')),
  created_at               TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE public.movimientos_mensuales (
  id                SERIAL        PRIMARY KEY,
  user_id           UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cuenta_id         UUID          REFERENCES public.cuentas(id) ON DELETE SET NULL,
  periodo           TEXT          NOT NULL CHECK (periodo ~ '^\d{4}-\d{2}$'),
  abonos_mes        NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (abonos_mes >= 0),
  cargos_mes        NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (cargos_mes >= 0),
  saldo_fin_mes     NUMERIC(14,2) NOT NULL DEFAULT 0,
  num_transacciones INT           NOT NULL DEFAULT 0 CHECK (num_transacciones >= 0),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE(user_id, cuenta_id, periodo)
);

CREATE TABLE public.features_scoring (
  id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID          NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  saldo_promedio          NUMERIC(12,2) NOT NULL DEFAULT 0,
  saldo_minimo            NUMERIC(12,2) NOT NULL DEFAULT 0,
  meses_saldo_positivo    SMALLINT      NOT NULL DEFAULT 0,
  ingreso_promedio        NUMERIC(12,2) NOT NULL DEFAULT 0,
  meses_con_abono         SMALLINT      NOT NULL DEFAULT 0,
  volatilidad_ingresos    NUMERIC(10,4) NOT NULL DEFAULT 0,
  ratio_ahorro_neto       NUMERIC(8,4)  NOT NULL DEFAULT 0,
  antiguedad_cuenta_meses INT           NOT NULL DEFAULT 0,
  meses_activos           SMALLINT      NOT NULL DEFAULT 0,
  edad                    SMALLINT      NOT NULL DEFAULT 0,
  num_entidades_sbs       SMALLINT      NOT NULL DEFAULT 0,
  cuota_max_estimada      NUMERIC(10,2) NOT NULL DEFAULT 0,
  monto_max_por_ingreso   NUMERIC(12,2) NOT NULL DEFAULT 0,
  periodos_analizados     SMALLINT      NOT NULL DEFAULT 0,
  fecha_calculo           TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE public.scores_transaccionales (
  id                   UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID      NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  pts_saldo            SMALLINT  NOT NULL DEFAULT 0 CHECK (pts_saldo BETWEEN 0 AND 200),
  pts_regularidad      SMALLINT  NOT NULL DEFAULT 0 CHECK (pts_regularidad BETWEEN 0 AND 160),
  pts_disciplina       SMALLINT  NOT NULL DEFAULT 0 CHECK (pts_disciplina BETWEEN 0 AND 160),
  pts_vinculo          SMALLINT  NOT NULL DEFAULT 0 CHECK (pts_vinculo BETWEEN 0 AND 160),
  pts_riesgo           SMALLINT  NOT NULL DEFAULT 0 CHECK (pts_riesgo BETWEEN 0 AND 120),
  score_transaccional  SMALLINT  GENERATED ALWAYS AS (
    pts_saldo+pts_regularidad+pts_disciplina+pts_vinculo+pts_riesgo) STORED,
  segmento_preliminar  TEXT      GENERATED ALWAYS AS (
    CASE
      WHEN (pts_saldo+pts_regularidad+pts_disciplina+pts_vinculo+pts_riesgo)>=600 THEN 'PREMIER'
      WHEN (pts_saldo+pts_regularidad+pts_disciplina+pts_vinculo+pts_riesgo)>=440 THEN 'ESTANDAR'
      WHEN (pts_saldo+pts_regularidad+pts_disciplina+pts_vinculo+pts_riesgo)>=280 THEN 'BASICO'
      ELSE 'NO_APLICA'
    END) STORED,
  monto_hipotesis      NUMERIC(12,2) NOT NULL DEFAULT 0,
  ingreso_promedio_ref NUMERIC(12,2) NOT NULL DEFAULT 0,
  cuota_max_ref        NUMERIC(10,2) NOT NULL DEFAULT 0,
  es_valido            BOOLEAN       NOT NULL DEFAULT TRUE,
  motivo_invalido      TEXT,
  fecha_calculo        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE public.fichas_campo (
  id                       UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID      NOT NULL REFERENCES auth.users(id),
  score_id                 UUID      REFERENCES public.scores_transaccionales(id),
  asesor_nombre            TEXT      NOT NULL,
  agencia                  TEXT      NOT NULL,
  fecha_visita             DATE      NOT NULL CHECK (fecha_visita <= CURRENT_DATE),
  hora_inicio              TIME,
  hora_fin                 TIME,
  negocio_verificado       BOOLEAN   NOT NULL DEFAULT FALSE,
  motivo_no_verificado     TEXT,
  antiguedad_negocio       TEXT CHECK (antiguedad_negocio IN ('menos_1_anio','1_a_3_anios','mas_3_anios')),
  pts_antiguedad           SMALLINT  NOT NULL DEFAULT 0,
  tenencia_local           TEXT CHECK (tenencia_local IN ('alquilado_sin_contrato','alquilado_con_contrato','propio')),
  pts_tenencia             SMALLINT  NOT NULL DEFAULT 0,
  ventas_diarias_rango     TEXT CHECK (ventas_diarias_rango IN ('menos_50','50_a_150','151_a_300','mas_300')),
  pts_ventas               SMALLINT  NOT NULL DEFAULT 0,
  ventas_mensuales_est     NUMERIC(10,2),
  gastos_fijos_mes         NUMERIC(10,2),
  ratio_gastos             TEXT CHECK (ratio_gastos IN ('mas_80pct','50_a_80pct','menos_50pct')),
  pts_gastos               SMALLINT  NOT NULL DEFAULT 0,
  tiene_deuda_informal     TEXT CHECK (tiene_deuda_informal IN ('si_significativa','si_menor','no')),
  pts_deuda_informal       SMALLINT  NOT NULL DEFAULT 0,
  monto_deuda_informal     NUMERIC(10,2) NOT NULL DEFAULT 0,
  participa_pandero        TEXT CHECK (participa_pandero IN ('si_mayor_cuota','si_menor_cuota','no')),
  pts_pandero              SMALLINT  NOT NULL DEFAULT 0,
  stock_visible            TEXT CHECK (stock_visible IN ('escaso','moderado','abundante')),
  pts_stock                SMALLINT  NOT NULL DEFAULT 0,
  activos_hogar            TEXT CHECK (activos_hogar IN ('ninguno','al_menos_uno')),
  pts_activos              SMALLINT  NOT NULL DEFAULT 0,
  caracter_resultado       TEXT NOT NULL DEFAULT 'sin_penalidad'
    CHECK (caracter_resultado IN ('sin_penalidad','alerta','veto')),
  score_campo              SMALLINT  GENERATED ALWAYS AS (
    pts_antiguedad+pts_tenencia+pts_ventas+pts_gastos+
    pts_deuda_informal+pts_pandero+pts_stock+pts_activos) STORED,
  score_transaccional_ref  SMALLINT,
  score_final              SMALLINT  GENERATED ALWAYS AS (
    score_transaccional_ref+(pts_antiguedad+pts_tenencia+pts_ventas+pts_gastos+
    pts_deuda_informal+pts_pandero+pts_stock+pts_activos)) STORED,
  segmento_resultante      TEXT GENERATED ALWAYS AS (
    CASE
      WHEN negocio_verificado=FALSE  THEN 'DESCALIFICADO'
      WHEN caracter_resultado='veto' THEN 'DESCALIFICADO'
      WHEN (score_transaccional_ref+pts_antiguedad+pts_tenencia+pts_ventas+pts_gastos+
            pts_deuda_informal+pts_pandero+pts_stock+pts_activos)>=750 THEN 'PREMIER'
      WHEN (score_transaccional_ref+pts_antiguedad+pts_tenencia+pts_ventas+pts_gastos+
            pts_deuda_informal+pts_pandero+pts_stock+pts_activos)>=550 THEN 'ESTANDAR'
      WHEN (score_transaccional_ref+pts_antiguedad+pts_tenencia+pts_ventas+pts_gastos+
            pts_deuda_informal+pts_pandero+pts_stock+pts_activos)>=350 THEN 'BASICO'
      ELSE 'NO_APLICA'
    END) STORED,
  monto_aprobado_propuesto NUMERIC(12,2),
  plazo_propuesto_meses    SMALLINT,
  cuota_estimada           NUMERIC(10,2),
  recomendacion_asesor     TEXT CHECK (recomendacion_asesor IN ('aprobar','aprobar_monto_reducido','elevar_comite','rechazar')),
  comite_resolucion        TEXT CHECK (comite_resolucion IN ('aprobado','aprobado_ajuste','rechazado')),
  comite_monto_final       NUMERIC(12,2),
  comite_plazo_final       SMALLINT,
  estado_ficha             TEXT NOT NULL DEFAULT 'en_proceso'
    CHECK (estado_ficha IN ('en_proceso','completada','cancelada')),
  id_asesor                INT REFERENCES public.asesores_negocio(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fichas_user_id      ON public.fichas_campo(user_id);
CREATE INDEX idx_fichas_agencia      ON public.fichas_campo(agencia, fecha_visita DESC);
CREATE INDEX idx_fichas_id_asesor    ON public.fichas_campo(id_asesor);

CREATE TABLE public.creditos_preaprobados (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID          NOT NULL REFERENCES auth.users(id),
  ficha_id            UUID          REFERENCES public.fichas_campo(id),
  score_id            UUID          REFERENCES public.scores_transaccionales(id),
  segmento            TEXT          NOT NULL CHECK (segmento IN ('PREMIER','ESTANDAR','BASICO','NO_APLICA','DESCALIFICADO')),
  score_transaccional SMALLINT      NOT NULL CHECK (score_transaccional BETWEEN 0 AND 800),
  score_campo         SMALLINT      NOT NULL,
  score_final         SMALLINT      NOT NULL,
  monto_aprobado      NUMERIC(12,2) NOT NULL CHECK (monto_aprobado > 0),
  plazo_meses         SMALLINT      NOT NULL CHECK (plazo_meses BETWEEN 3 AND 84),
  tasa_tea            NUMERIC(6,4)  NOT NULL DEFAULT 0.60,
  cuota_mensual       NUMERIC(10,2),
  estado              TEXT NOT NULL DEFAULT 'preaprobado'
    CHECK (estado IN ('preaprobado','contactado','en_comite','aprobado','rechazado','desembolsado','cancelado')),
  fecha_preaprobacion DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_desembolso    DATE,
  dias_mora           SMALLINT NOT NULL DEFAULT 0 CHECK (dias_mora >= 0),
  estado_pago         TEXT NOT NULL DEFAULT 'al_dia'
    CHECK (estado_pago IN ('al_dia','atraso_leve','atraso_30','atraso_90','castigado')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_creditos_user_id ON public.creditos_preaprobados(user_id);
CREATE INDEX idx_creditos_estado  ON public.creditos_preaprobados(estado);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE public.perfiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cuentas               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transacciones         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitudes_prestamo  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cuentas_ahorro        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alertas_usuario       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_intentos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agencias              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asesores_negocio      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfiles_clientes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_mensuales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.features_scoring      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scores_transaccionales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fichas_campo          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creditos_preaprobados ENABLE ROW LEVEL SECURITY;

-- Helper: verificar rol del usuario actual
CREATE OR REPLACE FUNCTION public.mi_rol()
RETURNS TEXT LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT rol FROM public.perfiles WHERE id = auth.uid()
$$;

-- ── perfiles ─────────────────────────────────────────────
-- Cliente: solo ve su propio perfil
-- Asesor/Admin/Gerente: ven todos
CREATE POLICY "perfil_ver" ON public.perfiles FOR SELECT
  USING (id = auth.uid() OR public.mi_rol() IN ('asesor','admin','gerente'));
CREATE POLICY "perfil_editar" ON public.perfiles FOR UPDATE
  USING (id = auth.uid());
CREATE POLICY "perfil_insertar" ON public.perfiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- ── cuentas ──────────────────────────────────────────────
-- Cliente: solo sus cuentas activas
-- Asesor/Admin/Gerente: todas
CREATE POLICY "cuenta_ver" ON public.cuentas FOR SELECT
  USING (user_id = auth.uid() OR public.mi_rol() IN ('asesor','admin','gerente'));
CREATE POLICY "cuenta_insertar" ON public.cuentas FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "cuenta_editar" ON public.cuentas FOR UPDATE
  USING (user_id = auth.uid() OR public.mi_rol() IN ('admin','gerente'));

-- ── transacciones ─────────────────────────────────────────
-- Cliente: solo las suyas
-- Asesor: puede ver las de sus clientes (todos los clientes activos)
-- Gerente/Admin: todas
CREATE POLICY "tx_ver" ON public.transacciones FOR SELECT
  USING (user_id = auth.uid() OR public.mi_rol() IN ('asesor','admin','gerente'));
CREATE POLICY "tx_insertar" ON public.transacciones FOR INSERT
  WITH CHECK (user_id = auth.uid());
-- NADIE puede editar o borrar transacciones (inmutables)
CREATE POLICY "tx_no_update" ON public.transacciones FOR UPDATE USING (FALSE);
CREATE POLICY "tx_no_delete" ON public.transacciones FOR DELETE USING (FALSE);

-- ── pagos ─────────────────────────────────────────────────
CREATE POLICY "pago_ver" ON public.pagos FOR SELECT
  USING (user_id = auth.uid() OR public.mi_rol() IN ('asesor','admin','gerente'));
CREATE POLICY "pago_insertar" ON public.pagos FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "pago_no_delete" ON public.pagos FOR DELETE USING (FALSE);

-- ── solicitudes_prestamo ──────────────────────────────────
CREATE POLICY "prestamo_ver" ON public.solicitudes_prestamo FOR SELECT
  USING (user_id = auth.uid() OR public.mi_rol() IN ('asesor','admin','gerente'));
CREATE POLICY "prestamo_insertar" ON public.solicitudes_prestamo FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "prestamo_editar" ON public.solicitudes_prestamo FOR UPDATE
  USING (user_id = auth.uid() OR public.mi_rol() IN ('asesor','admin','gerente'));

-- ── cuentas_ahorro ────────────────────────────────────────
CREATE POLICY "ahorro_ver" ON public.cuentas_ahorro FOR SELECT
  USING (user_id = auth.uid() OR public.mi_rol() IN ('asesor','admin','gerente'));
CREATE POLICY "ahorro_insertar" ON public.cuentas_ahorro FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ── alertas ───────────────────────────────────────────────
-- Solo el propio usuario ve sus alertas
CREATE POLICY "alerta_ver" ON public.alertas_usuario FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "alerta_editar" ON public.alertas_usuario FOR UPDATE
  USING (user_id = auth.uid());
-- Solo el sistema (service_role) inserta alertas
CREATE POLICY "alerta_insertar" ON public.alertas_usuario FOR INSERT
  WITH CHECK (public.mi_rol() IN ('admin','gerente') OR user_id = auth.uid());

-- ── audit_log ─────────────────────────────────────────────
-- Solo gerente/admin pueden ver el audit log
-- NADIE puede modificar ni borrar
CREATE POLICY "audit_ver" ON public.audit_log FOR SELECT
  USING (public.mi_rol() IN ('admin','gerente'));
CREATE POLICY "audit_insertar" ON public.audit_log FOR INSERT
  WITH CHECK (TRUE); -- el sistema inserta
CREATE POLICY "audit_no_update" ON public.audit_log FOR UPDATE USING (FALSE);
CREATE POLICY "audit_no_delete" ON public.audit_log FOR DELETE USING (FALSE);

-- ── login_intentos ────────────────────────────────────────
CREATE POLICY "login_ver" ON public.login_intentos FOR SELECT
  USING (public.mi_rol() IN ('admin','gerente'));
CREATE POLICY "login_insertar" ON public.login_intentos FOR INSERT WITH CHECK (TRUE);

-- ── agencias y asesores ───────────────────────────────────
-- Cualquier usuario autenticado puede ver agencias
CREATE POLICY "agencia_ver" ON public.agencias FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "agencia_admin" ON public.agencias FOR ALL
  USING (public.mi_rol() IN ('admin','gerente'));
CREATE POLICY "asesor_ver" ON public.asesores_negocio FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "asesor_admin" ON public.asesores_negocio FOR ALL
  USING (public.mi_rol() IN ('admin','gerente'));

-- ── scoring (solo asesores y superiores) ─────────────────
CREATE POLICY "pc_all" ON public.perfiles_clientes FOR ALL
  USING (user_id = auth.uid() OR public.mi_rol() IN ('asesor','admin','gerente'));
CREATE POLICY "mov_ver" ON public.movimientos_mensuales FOR SELECT
  USING (user_id = auth.uid() OR public.mi_rol() IN ('asesor','admin','gerente'));
CREATE POLICY "feat_ver" ON public.features_scoring FOR SELECT
  USING (user_id = auth.uid() OR public.mi_rol() IN ('asesor','admin','gerente'));
CREATE POLICY "score_ver" ON public.scores_transaccionales FOR SELECT
  USING (user_id = auth.uid() OR public.mi_rol() IN ('asesor','admin','gerente'));
CREATE POLICY "ficha_ver" ON public.fichas_campo FOR SELECT
  USING (user_id = auth.uid() OR public.mi_rol() IN ('asesor','admin','gerente'));
CREATE POLICY "ficha_escribir" ON public.fichas_campo FOR ALL
  USING (public.mi_rol() IN ('asesor','admin','gerente'));
CREATE POLICY "credito_ver" ON public.creditos_preaprobados FOR SELECT
  USING (user_id = auth.uid() OR public.mi_rol() IN ('asesor','admin','gerente'));
CREATE POLICY "credito_escribir" ON public.creditos_preaprobados FOR ALL
  USING (public.mi_rol() IN ('asesor','admin','gerente'));

-- ============================================================
-- INSERT: 30 AGENCIAS
-- ============================================================
INSERT INTO public.agencias (codigo,nombre,region,departamento,provincia,distrito,direccion,jefe_agencia) VALUES
('AG-001','Agencia Huancayo Centro','Centro','Junin','Huancayo','Huancayo','Jr. Real 423','Lic. Rosa Meza Quispe'),
('AG-002','Agencia El Tambo','Centro','Junin','Huancayo','El Tambo','Av. Leoncio Prado 892','Lic. Marco Sulca Vera'),
('AG-003','Agencia Chilca','Centro','Junin','Huancayo','Chilca','Jr. Loreto 215','Lic. Ana Flores Poma'),
('AG-004','Agencia Huancavelica','Centro','Huancavelica','Huancavelica','Huancavelica','Jr. Virrey Toledo 301','Lic. Pedro Asto Leon'),
('AG-005','Agencia Tarma','Centro','Junin','Tarma','Tarma','Jr. Lima 145','Lic. Milagros Ore Cruz'),
('AG-006','Agencia La Merced','Centro','Junin','Chanchamayo','La Merced','Jr. Tarma 78','Lic. Juan Palian Rojas'),
('AG-007','Agencia Cerro de Pasco','Centro','Pasco','Pasco','Chaupimarca','Jr. Bolivar 512','Lic. Silvia Huaman Tello'),
('AG-008','Agencia Cusco Centro','Sur','Cusco','Cusco','Cusco','Av. El Sol 301','Lic. Jorge Quispe Mamani'),
('AG-009','Agencia San Sebastian','Sur','Cusco','Cusco','San Sebastian','Av. De La Cultura 1200','Lic. Carmen Huallpa Ttito'),
('AG-010','Agencia Puno Centro','Sur','Puno','Puno','Puno','Jr. Lima 438','Lic. Dante Coaquira Apaza'),
('AG-011','Agencia Juliaca','Sur','Puno','San Roman','Juliaca','Av. Circunvalacion 789','Lic. Gladys Ticona Mamani'),
('AG-012','Agencia Arequipa Centro','Sur','Arequipa','Arequipa','Arequipa','Av. Goyeneche 412','Lic. Mario Ccallo Zegarra'),
('AG-013','Agencia Ayacucho','Sur','Ayacucho','Huamanga','Ayacucho','Jr. 28 de Julio 178','Lic. Rosa Cochachin Salas'),
('AG-014','Agencia Trujillo','Norte','La Libertad','Trujillo','Trujillo','Jr. Pizarro 608','Lic. Felix Quiroz Juarez'),
('AG-015','Agencia Chiclayo','Norte','Lambayeque','Chiclayo','Chiclayo','Av. Balta 340','Lic. Claudia Mejia Chunga'),
('AG-016','Agencia Piura','Norte','Piura','Piura','Piura','Av. Loreto 567','Lic. Luis Vasquez Rios'),
('AG-017','Agencia Cajamarca','Norte','Cajamarca','Cajamarca','Cajamarca','Jr. Del Comercio 124','Lic. Juana Condori Llanos'),
('AG-018','Agencia Huaraz','Norte','Ancash','Huaraz','Huaraz','Jr. Sucre 890','Lic. Raul Poma Asto'),
('AG-019','Agencia Lima Centro','Lima','Lima','Lima','Lima','Jr. de la Union 789','Lic. Roberto Vasquez Torres'),
('AG-020','Agencia Ate Vitarte','Lima','Lima','Lima','Ate','Av. Nicolas Ayllon 2340','Lic. Mirtha Lozano Ramos'),
('AG-021','Agencia SJL','Lima','Lima','Lima','San Juan de Lurigancho','Av. Gran Chimu 890','Lic. Carlos Salas More'),
('AG-022','Agencia Villa El Salvador','Lima','Lima','Lima','Villa El Salvador','Av. Pastor Sevilla 567','Lic. Ana Palomino Cuba'),
('AG-023','Agencia Callao','Lima','Lima','Callao','Callao','Av. Saenz Pena 345','Lic. Victor Quiroz Perez'),
('AG-024','Agencia Iquitos','Oriente','Loreto','Maynas','Iquitos','Jr. Putumayo 134','Lic. Pamela Rengifo Grandez'),
('AG-025','Agencia Pucallpa','Oriente','Ucayali','Coronel Portillo','Calleria','Jr. Inmaculada 267','Lic. Andres Castro Reyes'),
('AG-026','Agencia Tarapoto','Oriente','San Martin','San Martin','Tarapoto','Jr. Shapaja 456','Lic. Lisbeth Silva Morales'),
('AG-027','Agencia Huanuco','Oriente','Huanuco','Huanuco','Huanuco','Jr. General Prado 789','Lic. Martin Quispe Mamani'),
('AG-028','Agencia Andahuaylas','Sur','Apurimac','Andahuaylas','Andahuaylas','Jr. Peru 234','Lic. Beatriz Flores Condori'),
('AG-029','Agencia Ica','Sur','Ica','Ica','Ica','Av. Grau 456','Lic. Ricardo Salas Perez'),
('AG-030','Agencia Chimbote','Norte','Ancash','Santa','Chimbote','Av. Jose Pardo 315','Lic. Sandra Cochachin Vera')
ON CONFLICT (codigo) DO NOTHING;

-- ============================================================
-- INSERT: 360 ASESORES (12 por agencia)
-- ============================================================
DO $$
DECLARE
  ag RECORD; pos INT; nivel TEXT; cartera INT; meta_c INT; meta_m NUMERIC;
  cod_as TEXT; nom TEXT; ape TEXT; seed INT;
  nombres_m  TEXT[] := ARRAY['Carlos','Juan','Luis','Pedro','Marco','Roberto','Diego','Andres','Miguel','Fernando','Raul','Cesar'];
  nombres_f  TEXT[] := ARRAY['Maria','Ana','Rosa','Carmen','Silvia','Patricia','Sandra','Monica','Diana','Milagros','Luz','Lidia'];
  apellidos1 TEXT[] := ARRAY['Quispe','Mamani','Huaman','Flores','Garcia','Lopez','Torres','Ramirez','Sulca','Palian','Ore','Coaquira'];
  apellidos2 TEXT[] := ARRAY['Cruz','Vera','Leon','Rojas','Tello','Vega','Torres','Diaz','Ramos','More','Palomino','Huanca'];
  niveles TEXT[] := ARRAY['Senior II','Senior II','Senior I','Senior I','Senior I','Junior II','Junior II','Junior II','Junior II','Junior I','Junior I','Junior I'];
BEGIN
  FOR ag IN SELECT id, codigo FROM public.agencias ORDER BY id LOOP
    FOR pos IN 1..12 LOOP
      nivel:=niveles[pos]; seed:=ag.id*100+pos;
      cartera:=CASE nivel WHEN 'Senior II' THEN 220+(seed%60) WHEN 'Senior I' THEN 160+(seed%40) WHEN 'Junior II' THEN 100+(seed%30) ELSE 60+(seed%25) END;
      meta_c:=CASE nivel WHEN 'Senior II' THEN 18+(seed%8) WHEN 'Senior I' THEN 12+(seed%6) WHEN 'Junior II' THEN 8+(seed%4) ELSE 5+(seed%3) END;
      meta_m:=CASE nivel WHEN 'Senior II' THEN (50000+seed%30000)::NUMERIC WHEN 'Senior I' THEN (30000+seed%20000)::NUMERIC WHEN 'Junior II' THEN (18000+seed%12000)::NUMERIC ELSE (10000+seed%8000)::NUMERIC END;
      cod_as:=ag.codigo||'-'||LPAD(pos::TEXT,2,'0');
      IF seed%2=0 THEN nom:=nombres_m[((seed*3+1)%array_length(nombres_m,1))+1];
      ELSE nom:=nombres_f[((seed*5+2)%array_length(nombres_f,1))+1]; END IF;
      ape:=apellidos1[((seed*7+3)%array_length(apellidos1,1))+1]||' '||apellidos2[((seed*11+5)%array_length(apellidos2,1))+1];
      INSERT INTO public.asesores_negocio(codigo,id_agencia,nombres,apellidos,nivel,cartera_clientes_promedio,meta_creditos_mes,meta_monto_mes,zona_asignada,activo,fecha_ingreso)
      VALUES(cod_as,ag.id,nom,ape,nivel,cartera,meta_c,meta_m,'Zona-'||LPAD(pos::TEXT,2,'0'),TRUE,CURRENT_DATE-(seed%1000))
      ON CONFLICT (codigo) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- ============================================================
-- FUNCIONES DE SCORING
-- ============================================================
CREATE OR REPLACE FUNCTION public.calcular_score_transaccional(p_user_id UUID)
RETURNS TABLE(score_transaccional INT, segmento_preliminar TEXT, monto_hipotesis NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  f public.features_scoring%ROWTYPE;
  v_pts_saldo SMALLINT:=0; v_pts_regular SMALLINT:=0; v_pts_discipl SMALLINT:=0;
  v_pts_vinculo SMALLINT:=0; v_pts_riesgo SMALLINT:=0;
  v_score_total SMALLINT; v_segmento TEXT; v_monto_hip NUMERIC;
BEGIN
  SELECT * INTO f FROM public.features_scoring WHERE user_id=p_user_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 0, 'NO_APLICA'::TEXT, 0::NUMERIC; RETURN; END IF;
  v_pts_saldo   := CASE WHEN f.saldo_promedio>=5000 THEN 200 WHEN f.saldo_promedio>=2000 THEN 160 WHEN f.saldo_promedio>=1000 THEN 120 WHEN f.saldo_promedio>=500 THEN 80 WHEN f.saldo_promedio>=200 THEN 40 ELSE 0 END;
  v_pts_regular := CASE WHEN f.meses_con_abono>=11 THEN 160 WHEN f.meses_con_abono>=9 THEN 128 WHEN f.meses_con_abono>=7 THEN 96 WHEN f.meses_con_abono>=5 THEN 64 ELSE 24 END;
  v_pts_discipl := CASE WHEN f.ratio_ahorro_neto>=0.30 THEN 160 WHEN f.ratio_ahorro_neto>=0.20 THEN 120 WHEN f.ratio_ahorro_neto>=0.10 THEN 80 WHEN f.ratio_ahorro_neto>=0.01 THEN 40 ELSE 0 END;
  v_pts_vinculo := CASE WHEN f.antiguedad_cuenta_meses>=36 THEN 160 WHEN f.antiguedad_cuenta_meses>=24 THEN 120 WHEN f.antiguedad_cuenta_meses>=12 THEN 80 WHEN f.antiguedad_cuenta_meses>=6 THEN 40 ELSE 0 END;
  v_pts_riesgo  := CASE WHEN COALESCE(f.num_entidades_sbs,0)=0 THEN 120 WHEN COALESCE(f.num_entidades_sbs,0)=1 THEN 90 WHEN COALESCE(f.num_entidades_sbs,0)<=3 THEN 48 ELSE 12 END;
  v_score_total := v_pts_saldo+v_pts_regular+v_pts_discipl+v_pts_vinculo+v_pts_riesgo;
  v_segmento    := CASE WHEN v_score_total>=600 THEN 'PREMIER' WHEN v_score_total>=440 THEN 'ESTANDAR' WHEN v_score_total>=280 THEN 'BASICO' ELSE 'NO_APLICA' END;
  v_monto_hip   := CASE WHEN v_segmento='PREMIER' THEN LEAST(f.monto_max_por_ingreso,5000) WHEN v_segmento='ESTANDAR' THEN LEAST(f.monto_max_por_ingreso,2500) WHEN v_segmento='BASICO' THEN LEAST(f.monto_max_por_ingreso,1000) ELSE 0 END;
  INSERT INTO public.scores_transaccionales(user_id,pts_saldo,pts_regularidad,pts_disciplina,pts_vinculo,pts_riesgo,monto_hipotesis,ingreso_promedio_ref,cuota_max_ref)
  VALUES(p_user_id,v_pts_saldo,v_pts_regular,v_pts_discipl,v_pts_vinculo,v_pts_riesgo,v_monto_hip,COALESCE(f.ingreso_promedio,0),COALESCE(f.cuota_max_estimada,0))
  ON CONFLICT(user_id) DO UPDATE SET pts_saldo=EXCLUDED.pts_saldo,pts_regularidad=EXCLUDED.pts_regularidad,pts_disciplina=EXCLUDED.pts_disciplina,pts_vinculo=EXCLUDED.pts_vinculo,pts_riesgo=EXCLUDED.pts_riesgo,monto_hipotesis=EXCLUDED.monto_hipotesis,updated_at=now();
  RETURN QUERY SELECT v_score_total::INT, v_segmento, v_monto_hip;
END;$$;

-- ============================================================
-- VISTAS POWER BI
-- ============================================================
CREATE VIEW public.vw_pbi_resumen_clientes WITH (security_invoker=true) AS
SELECT u.id,u.email,u.nombre||' '||u.apellido AS nombre_completo,u.rol,u.created_at,
  COUNT(DISTINCT c.id) AS num_cuentas,
  COALESCE(SUM(c.saldo),0) AS saldo_total,
  COUNT(DISTINCT t.id) AS num_transacciones,
  COALESCE(SUM(t.monto) FILTER(WHERE t.tipo='credito'),0) AS total_abonos,
  COALESCE(SUM(t.monto) FILTER(WHERE t.tipo='debito'),0)  AS total_cargos,
  COUNT(DISTINCT p.id) AS num_pagos,
  COALESCE(SUM(p.monto),0) AS total_pagado,
  COUNT(DISTINCT sp.id) AS num_solicitudes,
  COUNT(DISTINCT sp.id) FILTER(WHERE sp.estado='aprobado') AS prestamos_aprobados
FROM public.perfiles u
LEFT JOIN public.cuentas c               ON u.id=c.user_id
LEFT JOIN public.transacciones t         ON u.id=t.user_id
LEFT JOIN public.pagos p                 ON u.id=p.user_id
LEFT JOIN public.solicitudes_prestamo sp ON u.id=sp.user_id
WHERE u.rol='cliente'
GROUP BY u.id,u.email,u.nombre,u.apellido,u.rol,u.created_at;

CREATE VIEW public.vw_pbi_transacciones WITH (security_invoker=true) AS
SELECT t.id,t.fecha,DATE_TRUNC('month',t.fecha)::DATE AS mes,
  t.tipo,t.categoria,t.descripcion,t.monto,t.canal,t.estado,t.referencia,
  c.tipo AS tipo_cuenta,c.moneda,
  p.nombre||' '||p.apellido AS cliente,p.email,p.rol
FROM public.transacciones t
JOIN public.perfiles p ON t.user_id=p.id
LEFT JOIN public.cuentas c ON t.cuenta_id=c.id;

CREATE VIEW public.vw_pbi_agencias WITH (security_invoker=true) AS
SELECT ag.id,ag.codigo,ag.nombre,ag.region,ag.departamento,ag.provincia,ag.jefe_agencia,
  COUNT(an.id) AS total_asesores,
  COALESCE(SUM(an.cartera_clientes_promedio),0) AS cartera_total,
  COALESCE(SUM(an.meta_creditos_mes),0) AS meta_creditos,
  COALESCE(SUM(an.meta_monto_mes),0) AS meta_monto
FROM public.agencias ag
LEFT JOIN public.asesores_negocio an ON ag.id=an.id_agencia AND an.activo=TRUE
GROUP BY ag.id,ag.codigo,ag.nombre,ag.region,ag.departamento,ag.provincia,ag.jefe_agencia;

CREATE VIEW public.vw_pbi_asesores WITH (security_invoker=true) AS
SELECT an.id,an.codigo,an.nombres||' '||an.apellidos AS nombre_completo,
  an.nivel,an.cartera_clientes_promedio,an.meta_creditos_mes,an.meta_monto_mes,
  ag.nombre AS agencia,ag.region,ag.departamento
FROM public.asesores_negocio an
JOIN public.agencias ag ON an.id_agencia=ag.id
WHERE an.activo=TRUE;

-- ============================================================
-- ASIGNAR ROLES A USUARIOS EXISTENTES
-- ============================================================
UPDATE public.perfiles SET rol='asesor'  WHERE email LIKE '%02@mibanco.com' OR email LIKE 'asesor%';
UPDATE public.perfiles SET rol='gerente' WHERE email LIKE '%03@mibanco.com' OR email LIKE 'gerente%';

-- ============================================================
-- VERIFICACIÓN FINAL
-- ============================================================
SELECT tabla, total FROM (
  SELECT 'perfiles'           AS tabla, COUNT(*)::INT AS total FROM public.perfiles          UNION ALL
  SELECT 'agencias',                    COUNT(*)::INT          FROM public.agencias          UNION ALL
  SELECT 'asesores_negocio',            COUNT(*)::INT          FROM public.asesores_negocio  UNION ALL
  SELECT 'cuentas',                     COUNT(*)::INT          FROM public.cuentas           UNION ALL
  SELECT 'transacciones',               COUNT(*)::INT          FROM public.transacciones      UNION ALL
  SELECT 'audit_log',                   COUNT(*)::INT          FROM public.audit_log
) t ORDER BY tabla;

-- ============================================================
-- FIN · CMAC Arequipa v4.0 · Script completo con seguridad bancaria
-- ============================================================


-- ======== 01_scoring_supabase.sql ========

-- ============================================================
-- SCRIPT 01 — Scoring: Tablas, Funciones y Vistas Power BI
-- Caja Municipal de Ahorro y Crédito Arequipa · Supabase · v4.0
-- ============================================================
-- EJECUTAR: 2do de 4 — en Supabase SQL Editor
-- DEPENDE DE: 00_setup_supabase.sql
-- ============================================================
-- DIFERENCIAS v4.0 vs v3.0:
--   ✓ REFERENCES public.usuarios_mock → REFERENCES auth.users
--   ✓ RLS habilitado + políticas para asesor/admin
--   ✓ SECURITY DEFINER en funciones (necesario con RLS)
--   ✓ Funciones accesibles vía RPC de Supabase JS Client
-- ============================================================

-- ── 1.1 perfiles_clientes ─────────────────────────────────
-- Extiende auth.users con datos demográficos y del negocio.
-- Ojo: diferente a public.perfiles (perfil general);
-- esta tabla tiene datos de campo del asesor.
DROP TABLE IF EXISTS public.perfiles_clientes CASCADE;
CREATE TABLE public.perfiles_clientes (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nombres                  TEXT        NOT NULL DEFAULT '',
  apellidos                TEXT        NOT NULL DEFAULT '',
  dni                      TEXT        UNIQUE,
  fecha_nacimiento         DATE,
  edad                     SMALLINT,
  genero                   TEXT        CHECK (genero IN ('M','F','otro')),
  telefono                 TEXT,
  distrito                 TEXT,
  provincia                TEXT,
  departamento             TEXT,
  -- Datos del negocio (capturados por asesor en campo)
  nombre_negocio           TEXT,
  tipo_negocio             TEXT,
  direccion_negocio        TEXT,
  lat_negocio              NUMERIC(10,7),
  lng_negocio              NUMERIC(10,7),
  antiguedad_negocio_meses INT          DEFAULT 0,
  tenencia_local           TEXT         CHECK (tenencia_local IN (
                             'alquilado_sin_contrato','alquilado_con_contrato','propio')),
  -- Datos SBS
  num_entidades_sbs        SMALLINT     DEFAULT 0,
  calificacion_sbs         TEXT         DEFAULT 'Normal',
  deuda_total_sbs          NUMERIC(12,2) DEFAULT 0,
  estado_cliente           TEXT         NOT NULL DEFAULT 'activo'
                             CHECK (estado_cliente IN ('activo','bloqueado','inactivo')),
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_perfiles_clientes_user_id ON public.perfiles_clientes(user_id);
CREATE INDEX IF NOT EXISTS idx_perfiles_distrito        ON public.perfiles_clientes(distrito);
CREATE INDEX IF NOT EXISTS idx_perfiles_tipo_negocio    ON public.perfiles_clientes(tipo_negocio);

ALTER TABLE public.perfiles_clientes ENABLE ROW LEVEL SECURITY;

-- Clientes ven su propio perfil; asesores/admin ven todos
CREATE POLICY "perfiles_clientes_select" ON public.perfiles_clientes FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.perfiles p
               WHERE p.id = auth.uid() AND p.rol IN ('asesor','admin','gerente'))
  );
CREATE POLICY "perfiles_clientes_insert" ON public.perfiles_clientes FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.perfiles p
               WHERE p.id = auth.uid() AND p.rol IN ('asesor','admin','gerente'))
  );
CREATE POLICY "perfiles_clientes_update" ON public.perfiles_clientes FOR UPDATE
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.perfiles p
               WHERE p.id = auth.uid() AND p.rol IN ('asesor','admin','gerente'))
  );

-- ── 1.2 movimientos_mensuales ─────────────────────────────
DROP TABLE IF EXISTS public.movimientos_mensuales CASCADE;
CREATE TABLE public.movimientos_mensuales (
  id                SERIAL          PRIMARY KEY,
  user_id           UUID            NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cuenta_id         UUID            REFERENCES public.cuentas(id) ON DELETE SET NULL,
  periodo           TEXT            NOT NULL,
  abonos_mes        NUMERIC(14,2)   NOT NULL DEFAULT 0,
  cargos_mes        NUMERIC(14,2)   NOT NULL DEFAULT 0,
  saldo_fin_mes     NUMERIC(14,2)   NOT NULL DEFAULT 0,
  num_transacciones INT             NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ     NOT NULL DEFAULT now(),
  UNIQUE(user_id, cuenta_id, periodo)
);

CREATE INDEX IF NOT EXISTS idx_movimientos_user_periodo
  ON public.movimientos_mensuales(user_id, periodo);

ALTER TABLE public.movimientos_mensuales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "movimientos_select" ON public.movimientos_mensuales FOR SELECT
  USING (user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.perfiles p
               WHERE p.id = auth.uid() AND p.rol IN ('asesor','admin','gerente')));

-- ── 1.3 features_scoring ──────────────────────────────────
DROP TABLE IF EXISTS public.features_scoring CASCADE;
CREATE TABLE public.features_scoring (
  id                       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID          NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  saldo_promedio           NUMERIC(12,2) NOT NULL DEFAULT 0,
  saldo_minimo             NUMERIC(12,2) NOT NULL DEFAULT 0,
  meses_saldo_positivo     SMALLINT      NOT NULL DEFAULT 0,
  ingreso_promedio         NUMERIC(12,2) NOT NULL DEFAULT 0,
  meses_con_abono          SMALLINT      NOT NULL DEFAULT 0,
  volatilidad_ingresos     NUMERIC(10,4) NOT NULL DEFAULT 0,
  ratio_ahorro_neto        NUMERIC(8,4)  NOT NULL DEFAULT 0,
  depositos_recurrentes    SMALLINT      NOT NULL DEFAULT 0,
  antiguedad_cuenta_meses  INT           NOT NULL DEFAULT 0,
  meses_activos            SMALLINT      NOT NULL DEFAULT 0,
  edad                     SMALLINT      NOT NULL DEFAULT 0,
  num_entidades_sbs        SMALLINT      NOT NULL DEFAULT 0,
  cuota_max_estimada       NUMERIC(10,2) NOT NULL DEFAULT 0,
  monto_max_por_ingreso    NUMERIC(12,2) NOT NULL DEFAULT 0,
  periodos_analizados      SMALLINT      NOT NULL DEFAULT 0,
  fecha_calculo            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ   NOT NULL DEFAULT now()
);

ALTER TABLE public.features_scoring ENABLE ROW LEVEL SECURITY;
CREATE POLICY "features_select" ON public.features_scoring FOR SELECT
  USING (user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.perfiles p
               WHERE p.id = auth.uid() AND p.rol IN ('asesor','admin','gerente')));

-- ── 1.4 scores_transaccionales ────────────────────────────
DROP TABLE IF EXISTS public.scores_transaccionales CASCADE;
CREATE TABLE public.scores_transaccionales (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  pts_saldo             SMALLINT    NOT NULL DEFAULT 0,
  pts_regularidad       SMALLINT    NOT NULL DEFAULT 0,
  pts_disciplina        SMALLINT    NOT NULL DEFAULT 0,
  pts_vinculo           SMALLINT    NOT NULL DEFAULT 0,
  pts_riesgo            SMALLINT    NOT NULL DEFAULT 0,
  score_transaccional   SMALLINT    GENERATED ALWAYS AS (
    pts_saldo + pts_regularidad + pts_disciplina + pts_vinculo + pts_riesgo
  ) STORED,
  segmento_preliminar   TEXT        GENERATED ALWAYS AS (
    CASE
      WHEN (pts_saldo + pts_regularidad + pts_disciplina + pts_vinculo + pts_riesgo) >= 600
        THEN 'PREMIER'
      WHEN (pts_saldo + pts_regularidad + pts_disciplina + pts_vinculo + pts_riesgo) >= 440
        THEN 'ESTANDAR'
      WHEN (pts_saldo + pts_regularidad + pts_disciplina + pts_vinculo + pts_riesgo) >= 280
        THEN 'BASICO'
      ELSE 'NO_APLICA'
    END
  ) STORED,
  monto_hipotesis       NUMERIC(12,2) NOT NULL DEFAULT 0,
  ingreso_promedio_ref  NUMERIC(12,2) NOT NULL DEFAULT 0,
  cuota_max_ref         NUMERIC(10,2) NOT NULL DEFAULT 0,
  es_valido             BOOLEAN     NOT NULL DEFAULT TRUE,
  motivo_invalido       TEXT,
  fecha_calculo         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.scores_transaccionales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scores_select" ON public.scores_transaccionales FOR SELECT
  USING (user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.perfiles p
               WHERE p.id = auth.uid() AND p.rol IN ('asesor','admin','gerente')));

-- ── 1.5 fichas_campo ──────────────────────────────────────
DROP TABLE IF EXISTS public.fichas_campo CASCADE;
CREATE TABLE public.fichas_campo (
  id                      UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID      NOT NULL REFERENCES auth.users(id),
  score_id                UUID      REFERENCES public.scores_transaccionales(id),
  asesor_nombre           TEXT      NOT NULL,
  agencia                 TEXT      NOT NULL,
  fecha_visita            DATE      NOT NULL,
  hora_inicio             TIME,
  hora_fin                TIME,
  -- F1: Verificación del negocio (máx 60 pts)
  negocio_verificado      BOOLEAN   NOT NULL DEFAULT FALSE,
  motivo_no_verificado    TEXT,
  antiguedad_negocio      TEXT      CHECK (antiguedad_negocio IN (
                            'menos_1_anio','1_a_3_anios','mas_3_anios')),
  pts_antiguedad          SMALLINT  NOT NULL DEFAULT 0,
  tenencia_local          TEXT      CHECK (tenencia_local IN (
                            'alquilado_sin_contrato','alquilado_con_contrato','propio')),
  pts_tenencia            SMALLINT  NOT NULL DEFAULT 0,
  direccion_verificada    TEXT,
  pts_f1                  SMALLINT  GENERATED ALWAYS AS (pts_antiguedad + pts_tenencia) STORED,
  -- F2: Capacidad de pago real (máx 60 pts)
  ventas_diarias_rango    TEXT      CHECK (ventas_diarias_rango IN (
                            'menos_50','50_a_150','151_a_300','mas_300')),
  pts_ventas              SMALLINT  NOT NULL DEFAULT 0,
  ventas_mensuales_est    NUMERIC(10,2),
  gastos_fijos_mes        NUMERIC(10,2),
  ratio_gastos            TEXT      CHECK (ratio_gastos IN ('mas_80pct','50_a_80pct','menos_50pct')),
  pts_gastos              SMALLINT  NOT NULL DEFAULT 0,
  ingreso_consistente     BOOLEAN   NOT NULL DEFAULT TRUE,
  obs_inconsistencia      TEXT,
  pts_f2                  SMALLINT  GENERATED ALWAYS AS (pts_ventas + pts_gastos) STORED,
  -- F3: Deuda informal (máx 40 pts, puede ser negativo)
  tiene_deuda_informal    TEXT      CHECK (tiene_deuda_informal IN ('si_significativa','si_menor','no')),
  pts_deuda_informal      SMALLINT  NOT NULL DEFAULT 0,
  monto_deuda_informal    NUMERIC(10,2) NOT NULL DEFAULT 0,
  detalle_deuda           TEXT,
  participa_pandero       TEXT      CHECK (participa_pandero IN ('si_mayor_cuota','si_menor_cuota','no')),
  pts_pandero             SMALLINT  NOT NULL DEFAULT 0,
  aporte_pandero_mes      NUMERIC(8,2) NOT NULL DEFAULT 0,
  pts_f3                  SMALLINT  GENERATED ALWAYS AS (pts_deuda_informal + pts_pandero) STORED,
  -- F4: Activos y respaldo (máx 40 pts)
  stock_visible           TEXT      CHECK (stock_visible IN ('escaso','moderado','abundante')),
  pts_stock               SMALLINT  NOT NULL DEFAULT 0,
  activos_hogar           TEXT      CHECK (activos_hogar IN ('ninguno','al_menos_uno')),
  pts_activos             SMALLINT  NOT NULL DEFAULT 0,
  descripcion_activos     TEXT,
  pts_f4                  SMALLINT  GENERATED ALWAYS AS (pts_stock + pts_activos) STORED,
  -- F5: Carácter del cliente
  caracter_resultado      TEXT      NOT NULL DEFAULT 'sin_penalidad'
                            CHECK (caracter_resultado IN ('sin_penalidad','alerta','veto')),
  obs_caracter            TEXT,
  -- Scores calculados
  score_campo             SMALLINT  GENERATED ALWAYS AS (
    pts_antiguedad + pts_tenencia + pts_ventas + pts_gastos +
    pts_deuda_informal + pts_pandero + pts_stock + pts_activos
  ) STORED,
  score_transaccional_ref SMALLINT,
  score_final             SMALLINT  GENERATED ALWAYS AS (
    score_transaccional_ref + (
      pts_antiguedad + pts_tenencia + pts_ventas + pts_gastos +
      pts_deuda_informal + pts_pandero + pts_stock + pts_activos
    )
  ) STORED,
  segmento_resultante     TEXT      GENERATED ALWAYS AS (
    CASE
      WHEN negocio_verificado = FALSE   THEN 'DESCALIFICADO'
      WHEN caracter_resultado = 'veto'  THEN 'DESCALIFICADO'
      WHEN (score_transaccional_ref + pts_antiguedad + pts_tenencia +
            pts_ventas + pts_gastos + pts_deuda_informal + pts_pandero +
            pts_stock + pts_activos) >= 750 THEN 'PREMIER'
      WHEN (score_transaccional_ref + pts_antiguedad + pts_tenencia +
            pts_ventas + pts_gastos + pts_deuda_informal + pts_pandero +
            pts_stock + pts_activos) >= 550 THEN 'ESTANDAR'
      WHEN (score_transaccional_ref + pts_antiguedad + pts_tenencia +
            pts_ventas + pts_gastos + pts_deuda_informal + pts_pandero +
            pts_stock + pts_activos) >= 350 THEN 'BASICO'
      ELSE 'NO_APLICA'
    END
  ) STORED,
  -- Propuesta del asesor
  monto_aprobado_propuesto  NUMERIC(12,2),
  plazo_propuesto_meses     SMALLINT,
  cuota_estimada            NUMERIC(10,2),
  recomendacion_asesor      TEXT      CHECK (recomendacion_asesor IN (
                              'aprobar','aprobar_monto_reducido','elevar_comite','rechazar')),
  obs_finales               TEXT,
  -- Resolución del comité
  comite_resolucion     TEXT        CHECK (comite_resolucion IN ('aprobado','aprobado_ajuste','rechazado')),
  comite_monto_final    NUMERIC(12,2),
  comite_plazo_final    SMALLINT,
  comite_motivo_rechazo TEXT,
  jefe_agencia          TEXT,
  fecha_comite          DATE,
  estado_ficha          TEXT        NOT NULL DEFAULT 'en_proceso'
                          CHECK (estado_ficha IN ('en_proceso','completada','cancelada')),
  id_asesor             INT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fichas_user_id      ON public.fichas_campo(user_id);
CREATE INDEX IF NOT EXISTS idx_fichas_fecha_visita ON public.fichas_campo(fecha_visita);
CREATE INDEX IF NOT EXISTS idx_fichas_agencia_fecha ON public.fichas_campo(agencia, fecha_visita DESC);

ALTER TABLE public.fichas_campo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fichas_select" ON public.fichas_campo FOR SELECT
  USING (user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.perfiles p
               WHERE p.id = auth.uid() AND p.rol IN ('asesor','admin','gerente')));
CREATE POLICY "fichas_insert" ON public.fichas_campo FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.perfiles p
               WHERE p.id = auth.uid() AND p.rol IN ('asesor','admin','gerente')));
CREATE POLICY "fichas_update" ON public.fichas_campo FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.perfiles p
               WHERE p.id = auth.uid() AND p.rol IN ('asesor','admin','gerente')));

-- ── 1.6 creditos_preaprobados ─────────────────────────────
DROP TABLE IF EXISTS public.creditos_preaprobados CASCADE;
CREATE TABLE public.creditos_preaprobados (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID          NOT NULL REFERENCES auth.users(id),
  ficha_id              UUID          REFERENCES public.fichas_campo(id),
  score_id              UUID          REFERENCES public.scores_transaccionales(id),
  segmento              TEXT          NOT NULL,
  score_transaccional   SMALLINT      NOT NULL,
  score_campo           SMALLINT      NOT NULL,
  score_final           SMALLINT      NOT NULL,
  monto_hipotesis       NUMERIC(12,2),
  monto_aprobado        NUMERIC(12,2) NOT NULL,
  plazo_meses           SMALLINT      NOT NULL,
  tasa_tea              NUMERIC(6,4)  NOT NULL DEFAULT 0.60,
  cuota_mensual         NUMERIC(10,2),
  variacion_monto_pct   NUMERIC(6,4)  GENERATED ALWAYS AS (
    CASE WHEN monto_hipotesis > 0
      THEN (monto_aprobado - monto_hipotesis) / monto_hipotesis
      ELSE NULL
    END
  ) STORED,
  estado                TEXT          NOT NULL DEFAULT 'preaprobado'
                          CHECK (estado IN (
                            'preaprobado','contactado','visita_agendada',
                            'visita_realizada','en_comite','aprobado',
                            'rechazado','desembolsado','cancelado')),
  fecha_preaprobacion   DATE          NOT NULL DEFAULT CURRENT_DATE,
  fecha_contacto        DATE,
  fecha_visita          DATE,
  fecha_aprobacion      DATE,
  fecha_desembolso      DATE,
  dias_mora             SMALLINT      NOT NULL DEFAULT 0,
  estado_pago           TEXT          NOT NULL DEFAULT 'al_dia'
                          CHECK (estado_pago IN (
                            'al_dia','atraso_leve','atraso_30','atraso_90','castigado')),
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creditos_user_id    ON public.creditos_preaprobados(user_id);
CREATE INDEX IF NOT EXISTS idx_creditos_estado     ON public.creditos_preaprobados(estado);
CREATE INDEX IF NOT EXISTS idx_creditos_user_estado ON public.creditos_preaprobados(user_id, estado);

ALTER TABLE public.creditos_preaprobados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "creditos_select" ON public.creditos_preaprobados FOR SELECT
  USING (user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.perfiles p
               WHERE p.id = auth.uid() AND p.rol IN ('asesor','admin','gerente')));
CREATE POLICY "creditos_insert" ON public.creditos_preaprobados FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.perfiles p
               WHERE p.id = auth.uid() AND p.rol IN ('asesor','admin','gerente')));
CREATE POLICY "creditos_update" ON public.creditos_preaprobados FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.perfiles p
               WHERE p.id = auth.uid() AND p.rol IN ('asesor','admin','gerente')));

-- ============================================================
-- FUNCIONES DE SCORING (SECURITY DEFINER para RLS bypass)
-- Accesibles via: supabase.rpc('calcular_features_scoring', {p_user_id: '...'})
-- ============================================================

CREATE OR REPLACE FUNCTION public.calcular_features_scoring(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saldo_promedio       NUMERIC;
  v_saldo_minimo         NUMERIC;
  v_meses_saldo_positivo SMALLINT;
  v_ingreso_promedio     NUMERIC;
  v_meses_con_abono      SMALLINT;
  v_volatilidad          NUMERIC;
  v_ratio_ahorro         NUMERIC;
  v_meses_activos        SMALLINT;
  v_antiguedad_meses     INT;
  v_periodos             SMALLINT;
  v_edad                 SMALLINT;
  v_entidades_sbs        SMALLINT;
BEGIN
  INSERT INTO public.movimientos_mensuales
    (user_id, cuenta_id, periodo, abonos_mes, cargos_mes, saldo_fin_mes, num_transacciones)
  SELECT
    t.user_id,
    t.cuenta_id,
    TO_CHAR(t.fecha, 'YYYY-MM'),
    SUM(CASE WHEN t.tipo = 'credito' THEN t.monto ELSE 0 END),
    SUM(CASE WHEN t.tipo = 'debito'  THEN t.monto ELSE 0 END),
    (SELECT c.saldo FROM public.cuentas c WHERE c.id = t.cuenta_id),
    COUNT(*)
  FROM public.transacciones t
  WHERE t.user_id = p_user_id
    AND t.fecha >= NOW() - INTERVAL '12 months'
  GROUP BY t.user_id, t.cuenta_id, TO_CHAR(t.fecha, 'YYYY-MM')
  ON CONFLICT (user_id, cuenta_id, periodo) DO UPDATE SET
    abonos_mes        = EXCLUDED.abonos_mes,
    cargos_mes        = EXCLUDED.cargos_mes,
    saldo_fin_mes     = EXCLUDED.saldo_fin_mes,
    num_transacciones = EXCLUDED.num_transacciones;

  SELECT
    COALESCE(AVG(saldo_fin_mes), 0),
    COALESCE(MIN(saldo_fin_mes), 0),
    COALESCE(COUNT(*) FILTER (WHERE saldo_fin_mes > 0), 0)::SMALLINT,
    COALESCE(AVG(abonos_mes), 0),
    COALESCE(COUNT(*) FILTER (WHERE abonos_mes > 0), 0)::SMALLINT,
    COALESCE(STDDEV(abonos_mes), 0),
    COALESCE(AVG(CASE WHEN abonos_mes > 0
                      THEN (abonos_mes - cargos_mes) / abonos_mes
                      ELSE 0 END), 0),
    COALESCE(COUNT(*) FILTER (WHERE num_transacciones > 0), 0)::SMALLINT,
    COALESCE(COUNT(DISTINCT periodo), 0)::SMALLINT
  INTO
    v_saldo_promedio, v_saldo_minimo, v_meses_saldo_positivo,
    v_ingreso_promedio, v_meses_con_abono, v_volatilidad,
    v_ratio_ahorro, v_meses_activos, v_periodos
  FROM public.movimientos_mensuales
  WHERE user_id = p_user_id;

  SELECT COALESCE(
    EXTRACT(YEAR FROM AGE(NOW(), MIN(created_at))) * 12 +
    EXTRACT(MONTH FROM AGE(NOW(), MIN(created_at))), 0
  )::INT INTO v_antiguedad_meses
  FROM public.cuentas WHERE user_id = p_user_id;

  SELECT
    COALESCE(pc.edad, 0)::SMALLINT,
    COALESCE(pc.num_entidades_sbs, 0)::SMALLINT
  INTO v_edad, v_entidades_sbs
  FROM public.perfiles_clientes pc
  WHERE pc.user_id = p_user_id;

  INSERT INTO public.features_scoring (
    user_id,
    saldo_promedio, saldo_minimo, meses_saldo_positivo,
    ingreso_promedio, meses_con_abono, volatilidad_ingresos,
    ratio_ahorro_neto, depositos_recurrentes,
    meses_activos, antiguedad_cuenta_meses,
    edad, num_entidades_sbs,
    cuota_max_estimada, monto_max_por_ingreso,
    periodos_analizados
  ) VALUES (
    p_user_id,
    v_saldo_promedio, v_saldo_minimo, v_meses_saldo_positivo,
    v_ingreso_promedio, v_meses_con_abono, v_volatilidad,
    v_ratio_ahorro, v_meses_con_abono,
    v_meses_activos, COALESCE(v_antiguedad_meses, 0),
    COALESCE(v_edad, 0), COALESCE(v_entidades_sbs, 0),
    v_ingreso_promedio * 0.30,
    v_ingreso_promedio * 2.0,
    v_periodos
  )
  ON CONFLICT (user_id) DO UPDATE SET
    saldo_promedio          = EXCLUDED.saldo_promedio,
    saldo_minimo            = EXCLUDED.saldo_minimo,
    meses_saldo_positivo    = EXCLUDED.meses_saldo_positivo,
    ingreso_promedio        = EXCLUDED.ingreso_promedio,
    meses_con_abono         = EXCLUDED.meses_con_abono,
    volatilidad_ingresos    = EXCLUDED.volatilidad_ingresos,
    ratio_ahorro_neto       = EXCLUDED.ratio_ahorro_neto,
    depositos_recurrentes   = EXCLUDED.depositos_recurrentes,
    meses_activos           = EXCLUDED.meses_activos,
    antiguedad_cuenta_meses = EXCLUDED.antiguedad_cuenta_meses,
    edad                    = EXCLUDED.edad,
    num_entidades_sbs       = EXCLUDED.num_entidades_sbs,
    cuota_max_estimada      = EXCLUDED.cuota_max_estimada,
    monto_max_por_ingreso   = EXCLUDED.monto_max_por_ingreso,
    periodos_analizados     = EXCLUDED.periodos_analizados,
    updated_at              = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.calcular_score_transaccional(p_user_id UUID)
RETURNS TABLE (
  score_transaccional INT,
  segmento_preliminar TEXT,
  monto_hipotesis     NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  f               public.features_scoring%ROWTYPE;
  v_pts_saldo     SMALLINT := 0;
  v_pts_regular   SMALLINT := 0;
  v_pts_discipl   SMALLINT := 0;
  v_pts_vinculo   SMALLINT := 0;
  v_pts_riesgo    SMALLINT := 0;
  v_score_total   SMALLINT;
  v_segmento      TEXT;
  v_monto_hip     NUMERIC;
BEGIN
  SELECT * INTO f FROM public.features_scoring WHERE user_id = p_user_id;

  -- Grupo A: Saldo promedio (máx 200 pts)
  v_pts_saldo := CASE
    WHEN f.saldo_promedio >= 5000 THEN 200
    WHEN f.saldo_promedio >= 2000 THEN 160
    WHEN f.saldo_promedio >= 1000 THEN 120
    WHEN f.saldo_promedio >= 500  THEN 80
    WHEN f.saldo_promedio >= 200  THEN 40
    ELSE 0
  END;

  -- Grupo B: Regularidad de ingresos (máx 160 pts)
  v_pts_regular := CASE
    WHEN f.meses_con_abono >= 11 THEN 160
    WHEN f.meses_con_abono >= 9  THEN 128
    WHEN f.meses_con_abono >= 7  THEN 96
    WHEN f.meses_con_abono >= 5  THEN 64
    ELSE 24
  END;

  -- Grupo C: Disciplina financiera (máx 160 pts)
  v_pts_discipl := CASE
    WHEN f.ratio_ahorro_neto >= 0.30 THEN 160
    WHEN f.ratio_ahorro_neto >= 0.20 THEN 120
    WHEN f.ratio_ahorro_neto >= 0.10 THEN 80
    WHEN f.ratio_ahorro_neto >= 0.01 THEN 40
    ELSE 0
  END;

  -- Grupo D: Vínculo con la institución (máx 160 pts)
  v_pts_vinculo := CASE
    WHEN f.antiguedad_cuenta_meses >= 36 THEN 160
    WHEN f.antiguedad_cuenta_meses >= 24 THEN 120
    WHEN f.antiguedad_cuenta_meses >= 12 THEN 80
    WHEN f.antiguedad_cuenta_meses >= 6  THEN 40
    ELSE 0
  END;

  -- Grupo E: Perfil de riesgo SBS (máx 120 pts)
  v_pts_riesgo := CASE
    WHEN COALESCE(f.num_entidades_sbs, 0) = 0   THEN 120
    WHEN COALESCE(f.num_entidades_sbs, 0) = 1   THEN 90
    WHEN COALESCE(f.num_entidades_sbs, 0) <= 3  THEN 48
    ELSE 12
  END;

  v_score_total := v_pts_saldo + v_pts_regular + v_pts_discipl + v_pts_vinculo + v_pts_riesgo;

  v_segmento := CASE
    WHEN v_score_total >= 600 THEN 'PREMIER'
    WHEN v_score_total >= 440 THEN 'ESTANDAR'
    WHEN v_score_total >= 280 THEN 'BASICO'
    ELSE 'NO_APLICA'
  END;

  -- Techo de monto por segmento (CMAC Arequipa referencial)
  v_monto_hip := CASE
    WHEN v_segmento = 'PREMIER'  THEN LEAST(COALESCE(f.monto_max_por_ingreso, 0), 5000)
    WHEN v_segmento = 'ESTANDAR' THEN LEAST(COALESCE(f.monto_max_por_ingreso, 0), 2500)
    WHEN v_segmento = 'BASICO'   THEN LEAST(COALESCE(f.monto_max_por_ingreso, 0), 1000)
    ELSE 0
  END;

  INSERT INTO public.scores_transaccionales (
    user_id, pts_saldo, pts_regularidad, pts_disciplina, pts_vinculo, pts_riesgo,
    monto_hipotesis, ingreso_promedio_ref, cuota_max_ref
  ) VALUES (
    p_user_id,
    v_pts_saldo, v_pts_regular, v_pts_discipl, v_pts_vinculo, v_pts_riesgo,
    v_monto_hip,
    COALESCE(f.ingreso_promedio, 0),
    COALESCE(f.cuota_max_estimada, 0)
  )
  ON CONFLICT (user_id) DO UPDATE SET
    pts_saldo            = EXCLUDED.pts_saldo,
    pts_regularidad      = EXCLUDED.pts_regularidad,
    pts_disciplina       = EXCLUDED.pts_disciplina,
    pts_vinculo          = EXCLUDED.pts_vinculo,
    pts_riesgo           = EXCLUDED.pts_riesgo,
    monto_hipotesis      = EXCLUDED.monto_hipotesis,
    ingreso_promedio_ref = EXCLUDED.ingreso_promedio_ref,
    cuota_max_ref        = EXCLUDED.cuota_max_ref,
    updated_at           = now();

  RETURN QUERY SELECT v_score_total::INT, v_segmento, v_monto_hip;
END;
$$;

-- ============================================================
-- Función principal — evaluar_credito_campo()
-- Node.js: pool.query('SELECT * FROM evaluar_credito_campo($1,$2,$3)', [...])
-- Supabase RPC: supabase.rpc('evaluar_credito_campo', {p_user_id, p_monto_pedido, p_plazo_meses})
-- ============================================================
CREATE OR REPLACE FUNCTION public.evaluar_credito_campo(
  p_user_id      UUID,
  p_monto_pedido NUMERIC,
  p_plazo_meses  INT
)
RETURNS TABLE (
  user_id             UUID,
  score_transaccional INT,
  segmento            TEXT,
  monto_hipotesis     NUMERIC,
  monto_pedido        NUMERIC,
  plazo_meses         INT,
  cuota_estimada      NUMERIC,
  resultado           TEXT,
  mensaje             TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score      INT;
  v_segmento   TEXT;
  v_hipotesis  NUMERIC;
  v_tem        NUMERIC;
  v_cuota      NUMERIC;
  v_resultado  TEXT;
  v_mensaje    TEXT;
  v_tasa_tea   NUMERIC := 0.60;  -- TEA 60% referencial CMAC Arequipa
BEGIN
  PERFORM public.calcular_features_scoring(p_user_id);

  SELECT r.score_transaccional, r.segmento_preliminar, r.monto_hipotesis
  INTO   v_score, v_segmento, v_hipotesis
  FROM   public.calcular_score_transaccional(p_user_id) r;

  -- TEM = (1 + TEA)^(1/12) - 1
  -- Cuota = Monto * TEM / (1 - (1+TEM)^(-n))
  v_tem   := POWER(1 + v_tasa_tea, 1.0/12) - 1;
  v_cuota := p_monto_pedido * v_tem / (1 - POWER(1 + v_tem, -p_plazo_meses));

  v_resultado := CASE
    WHEN v_segmento = 'NO_APLICA'            THEN 'RECHAZADO'
    WHEN p_monto_pedido > v_hipotesis * 1.20 THEN 'EXCEDE_TECHO'
    WHEN p_monto_pedido <= v_hipotesis       THEN 'APROBADO_PROVISIONAL'
    ELSE                                          'REVISAR_COMITE'
  END;

  v_mensaje := CASE v_resultado
    WHEN 'RECHAZADO'            THEN 'El cliente no alcanza el puntaje mínimo para un crédito.'
    WHEN 'EXCEDE_TECHO'         THEN 'El monto solicitado supera en >20% la hipótesis del modelo.'
    WHEN 'APROBADO_PROVISIONAL' THEN 'Monto dentro del rango del modelo. Procede visita de campo.'
    WHEN 'REVISAR_COMITE'       THEN 'Monto ligeramente sobre hipótesis. Elevar a comité de agencia.'
    ELSE 'Evaluación completada.'
  END;

  RETURN QUERY SELECT
    p_user_id, v_score, v_segmento, v_hipotesis,
    p_monto_pedido, p_plazo_meses,
    ROUND(v_cuota, 2),
    v_resultado, v_mensaje;
END;
$$;

-- ============================================================
-- VISTAS POWER BI
-- Conectar con service_role key para bypasear RLS
-- ============================================================

CREATE OR REPLACE VIEW public.vw_pbi_universo_scoring AS
SELECT
  st.user_id,
  pc.nombres || ' ' || pc.apellidos     AS nombre_cliente,
  pc.distrito, pc.provincia, pc.departamento, pc.tipo_negocio,
  pc.antiguedad_negocio_meses, pc.num_entidades_sbs,
  fs.saldo_promedio, fs.ingreso_promedio, fs.meses_con_abono,
  fs.ratio_ahorro_neto, fs.antiguedad_cuenta_meses, fs.meses_activos,
  st.pts_saldo, st.pts_regularidad, st.pts_disciplina, st.pts_vinculo, st.pts_riesgo,
  st.score_transaccional, st.segmento_preliminar,
  st.monto_hipotesis, st.ingreso_promedio_ref, st.cuota_max_ref, st.fecha_calculo
FROM public.scores_transaccionales st
JOIN public.features_scoring       fs ON st.user_id = fs.user_id
LEFT JOIN public.perfiles_clientes pc ON st.user_id = pc.user_id
WHERE st.es_valido = TRUE AND st.segmento_preliminar <> 'NO_APLICA';

CREATE OR REPLACE VIEW public.vw_pbi_fichas_campo AS
SELECT
  fc.id AS id_ficha, fc.fecha_visita,
  DATE_TRUNC('month', fc.fecha_visita::TIMESTAMPTZ)::DATE AS mes_visita,
  EXTRACT(YEAR FROM fc.fecha_visita)::INT  AS anio,
  EXTRACT(MONTH FROM fc.fecha_visita)::INT AS numero_mes,
  fc.asesor_nombre, fc.agencia,
  COALESCE(pc.nombres || ' ' || pc.apellidos, 'Sin perfil') AS nombre_cliente,
  pc.distrito, pc.tipo_negocio,
  fc.score_transaccional_ref, fc.pts_f1, fc.pts_f2, fc.pts_f3, fc.pts_f4,
  fc.score_campo, fc.score_final, fc.segmento_resultante,
  fc.negocio_verificado, fc.antiguedad_negocio, fc.tenencia_local,
  fc.ventas_diarias_rango, fc.ventas_mensuales_est, fc.gastos_fijos_mes,
  CASE WHEN fc.ventas_mensuales_est > 0
    THEN ROUND(fc.gastos_fijos_mes / fc.ventas_mensuales_est * 100, 1)
    ELSE NULL END AS pct_gastos_sobre_ventas,
  fc.tiene_deuda_informal, fc.monto_deuda_informal,
  fc.participa_pandero, fc.stock_visible, fc.activos_hogar,
  fc.caracter_resultado,
  fc.monto_aprobado_propuesto, fc.plazo_propuesto_meses, fc.cuota_estimada,
  fc.recomendacion_asesor, fc.comite_resolucion, fc.comite_monto_final,
  fc.comite_plazo_final, fc.estado_ficha
FROM public.fichas_campo fc
LEFT JOIN public.perfiles_clientes pc ON fc.user_id = pc.user_id;

CREATE OR REPLACE VIEW public.vw_pbi_calidad_cartera AS
SELECT
  cp.id, cp.segmento, cp.score_transaccional, cp.score_campo, cp.score_final,
  CASE
    WHEN cp.score_final >= 900 THEN '900-1000'
    WHEN cp.score_final >= 800 THEN '800-899'
    WHEN cp.score_final >= 700 THEN '700-799'
    WHEN cp.score_final >= 600 THEN '600-699'
    WHEN cp.score_final >= 500 THEN '500-599'
    WHEN cp.score_final >= 400 THEN '400-499'
    ELSE '300-399'
  END AS rango_score,
  cp.monto_hipotesis, cp.monto_aprobado, cp.variacion_monto_pct,
  cp.plazo_meses, cp.tasa_tea, cp.cuota_mensual,
  cp.fecha_preaprobacion, cp.fecha_desembolso,
  (cp.fecha_desembolso - cp.fecha_preaprobacion) AS dias_preaprobacion_a_desembolso,
  cp.estado, cp.dias_mora, cp.estado_pago,
  CASE
    WHEN cp.dias_mora = 0    THEN 'Normal'
    WHEN cp.dias_mora <= 8   THEN 'CPP'
    WHEN cp.dias_mora <= 30  THEN 'Deficiente'
    WHEN cp.dias_mora <= 60  THEN 'Dudoso'
    ELSE 'Pérdida'
  END AS categoria_sbs,
  pc.distrito, pc.tipo_negocio,
  fc.agencia, fc.asesor_nombre
FROM public.creditos_preaprobados cp
LEFT JOIN public.fichas_campo      fc ON cp.ficha_id = fc.id
LEFT JOIN public.perfiles_clientes pc ON cp.user_id  = pc.user_id;

-- ============================================================
-- FIN — 01_scoring_supabase.sql · v4.0 · Caja Arequipa
-- Siguiente: ejecutar 02_agencias_asesores_supabase.sql
-- ============================================================


-- ======== 02_agencias_asesores_supabase.sql ========

-- ============================================================
-- SCRIPT 02 — Agencias y Asesores de Negocios
-- FieldIQ / Portal Mi Banco · Supabase · v4.0
-- ============================================================
-- ADAPTADO PARA: PostgreSQL 16 puro (sin Supabase / sin auth.users)
-- ============================================================
-- EJECUTAR: 3ro de 4
-- DEPENDE DE: 01_scoring_tablas_funciones_pg16.sql
--             (fichas_campo ya debe existir para el ALTER TABLE)
-- TIEMPO ESTIMADO: 10-20 segundos (360 inserts)
-- ============================================================
-- QUÉ CAMBIA RESPECTO A v2.1 (Supabase):
--   ✓ REFERENCES auth.users → REFERENCES public.usuarios_mock
--   ✓ auth.uid() / auth.role() → eliminados (RLS no aplica local)
--   ✓ ENABLE ROW LEVEL SECURITY → eliminado
--   ✓ Políticas CREATE POLICY → eliminadas
--   ✓ id_asesor FK en fichas_campo apunta a asesores_negocio (igual)
--   ✓ Índices de performance para Power BI conservados
-- ============================================================
-- QUÉ CREA:
--   Tablas:  agencias (30 filas) · asesores_negocio (360 filas)
--   Columna: asesores_negocio.user_id UUID → usuarios_mock
--            (para login de asesores con JWT en backends)
--   Columna: fichas_campo.id_asesor → asesores_negocio (FK)
--   Vistas:  vw_pbi_asesores · vw_pbi_agencias
--   Índices: performance para vistas PBI sobre 1,800+ filas
-- ============================================================

-- ── PASO 1: TABLAS DE AGENCIAS Y ASESORES ─────────────────

CREATE TABLE IF NOT EXISTS public.agencias (
  id              SERIAL      PRIMARY KEY,
  codigo          TEXT        NOT NULL UNIQUE,   -- 'AG-001' ... 'AG-030'
  nombre          TEXT        NOT NULL,
  region          TEXT        NOT NULL,
  departamento    TEXT        NOT NULL,
  provincia       TEXT        NOT NULL,
  distrito        TEXT        NOT NULL,
  direccion       TEXT,
  jefe_agencia    TEXT,
  activa          BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.asesores_negocio (
  id                        SERIAL      PRIMARY KEY,
  codigo                    TEXT        NOT NULL UNIQUE,   -- 'AS-001-01'
  id_agencia                INT         NOT NULL REFERENCES public.agencias(id),
  nombres                   TEXT        NOT NULL,
  apellidos                 TEXT        NOT NULL,
  dni                       TEXT,
  email                     TEXT,
  telefono                  TEXT,
  nivel                     TEXT        NOT NULL
                              CHECK (nivel IN ('Junior I','Junior II','Senior I','Senior II')),
  cartera_clientes_promedio INT         NOT NULL,
  meta_creditos_mes         INT         NOT NULL,
  meta_monto_mes            NUMERIC(14,2) NOT NULL,
  zona_asignada             TEXT,
  activo                    BOOLEAN     NOT NULL DEFAULT TRUE,
  fecha_ingreso             DATE        NOT NULL DEFAULT CURRENT_DATE,
  -- Para login de asesores: referencia a usuarios_mock (no a auth.users)
  user_id                   UUID        UNIQUE
                              REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asesores_agencia
  ON public.asesores_negocio(id_agencia);
CREATE INDEX IF NOT EXISTS idx_asesores_user_id
  ON public.asesores_negocio(user_id);


-- ── PASO 2: INSERT — 30 AGENCIAS ──────────────────────────

INSERT INTO public.agencias
  (codigo, nombre, region, departamento, provincia, distrito, direccion, jefe_agencia)
VALUES
-- REGION CENTRO
  ('AG-001','Agencia Huancayo Centro',    'Centro','Junin',        'Huancayo',    'Huancayo',       'Jr. Real 423',              'Lic. Rosa Meza Quispe'),
  ('AG-002','Agencia El Tambo',           'Centro','Junin',        'Huancayo',    'El Tambo',       'Av. Leoncio Prado 892',     'Lic. Marco Sulca Vera'),
  ('AG-003','Agencia Chilca',             'Centro','Junin',        'Huancayo',    'Chilca',         'Jr. Loreto 215',            'Lic. Ana Flores Poma'),
  ('AG-004','Agencia Huancavelica',       'Centro','Huancavelica', 'Huancavelica','Huancavelica',   'Jr. Virrey Toledo 301',     'Lic. Pedro Asto Leon'),
  ('AG-005','Agencia Tarma',              'Centro','Junin',        'Tarma',       'Tarma',          'Jr. Lima 145',              'Lic. Milagros Ore Cruz'),
  ('AG-006','Agencia La Merced',          'Centro','Junin',        'Chanchamayo', 'La Merced',      'Jr. Tarma 78',              'Lic. Juan Palian Rojas'),
  ('AG-007','Agencia Cerro de Pasco',     'Centro','Pasco',        'Pasco',       'Chaupimarca',    'Jr. Bolivar 512',           'Lic. Silvia Huaman Tello'),
-- REGION SUR
  ('AG-008','Agencia Cusco Centro',       'Sur',   'Cusco',        'Cusco',       'Cusco',          'Av. El Sol 301',            'Lic. Jorge Quispe Mamani'),
  ('AG-009','Agencia San Sebastian',      'Sur',   'Cusco',        'Cusco',       'San Sebastian',  'Av. De La Cultura 1200',    'Lic. Carmen Huallpa Ttito'),
  ('AG-010','Agencia Puno Centro',        'Sur',   'Puno',         'Puno',        'Puno',           'Jr. Lima 438',              'Lic. Dante Coaquira Apaza'),
  ('AG-011','Agencia Juliaca',            'Sur',   'Puno',         'San Roman',   'Juliaca',        'Av. Circunvalacion 789',    'Lic. Gladys Ticona Mamani'),
  ('AG-012','Agencia Arequipa Centro',    'Sur',   'Arequipa',     'Arequipa',    'Arequipa',       'Av. Goyeneche 412',         'Lic. Mario Ccallo Zegarra'),
  ('AG-013','Agencia Ayacucho',          'Sur',   'Ayacucho',     'Huamanga',    'Ayacucho',       'Jr. 28 de Julio 178',       'Lic. Rosa Cochachin Salas'),
  ('AG-014','Agencia Andahuaylaillas',    'Sur',   'Cusco',        'Quispicanchi', 'Andahuaylillas', 'Jr. Principal 45',         'Lic. Hugo Ttito Lozano'),
-- REGION NORTE
  ('AG-015','Agencia Trujillo Centro',    'Norte', 'La Libertad',  'Trujillo',    'Trujillo',       'Jr. Pizarro 608',           'Lic. Felix Quiroz Juarez'),
  ('AG-016','Agencia Chiclayo',           'Norte', 'Lambayeque',   'Chiclayo',    'Chiclayo',       'Av. Balta 340',             'Lic. Claudia Mejia Chunga'),
  ('AG-017','Agencia Piura Centro',       'Norte', 'Piura',        'Piura',       'Piura',          'Av. Loreto 567',            'Lic. Luis Vasquez Rios'),
  ('AG-018','Agencia Cajamarca',          'Norte', 'Cajamarca',    'Cajamarca',   'Cajamarca',      'Jr. Del Comercio 124',      'Lic. Juana Condori Llanos'),
  ('AG-019','Agencia Huaraz',             'Norte', 'Ancash',       'Huaraz',      'Huaraz',         'Jr. Sucre 890',             'Lic. Raul Poma Asto'),
  ('AG-020','Agencia Chimbote',           'Norte', 'Ancash',       'Santa',       'Chimbote',       'Av. Jose Pardo 315',        'Lic. Sandra Cochachin Vera'),
-- REGION LIMA / COSTA CENTRAL
  ('AG-021','Agencia Lima Centro',        'Lima',  'Lima',         'Lima',        'Lima',           'Jr. de la Union 789',       'Lic. Roberto Vasquez Torres'),
  ('AG-022','Agencia Ate Vitarte',        'Lima',  'Lima',         'Lima',        'Ate',            'Av. Nicolás Ayllon 2340',   'Lic. Mirtha Lozano Ramos'),
  ('AG-023','Agencia San Juan de Lurig.', 'Lima',  'Lima',         'Lima',        'San Juan de Lurigancho','Av. Gran Chimu 890','Lic. Carlos Salas More'),
  ('AG-024','Agencia Villa El Salvador',  'Lima',  'Lima',         'Lima',        'Villa El Salvador','Av. Pastor Sevilla 567',  'Lic. Ana Palomino Cuba'),
  ('AG-025','Agencia Callao',             'Lima',  'Lima',         'Callao',      'Callao',         'Av. Sáenz Peña 345',        'Lic. Victor Quiroz Perez'),
-- REGION ORIENTE
  ('AG-026','Agencia Iquitos Centro',     'Oriente','Loreto',      'Maynas',      'Iquitos',        'Jr. Putumayo 134',          'Lic. Pamela Rengifo Grandez'),
  ('AG-027','Agencia Pucallpa',           'Oriente','Ucayali',     'Coronel Port.','Calleria',      'Jr. Inmaculada 267',        'Lic. Andres Castro Reyes'),
  ('AG-028','Agencia Tarapoto',           'Oriente','San Martin',  'San Martin',  'Tarapoto',       'Jr. Shapaja 456',           'Lic. Lisbeth Silva Morales'),
  ('AG-029','Agencia Huánuco',            'Oriente','Huanuco',     'Huanuco',     'Huanuco',        'Jr. General Prado 789',     'Lic. Martin Quispe Mamani'),
  ('AG-030','Agencia Tingo María',        'Oriente','Huanuco',     'Leoncio Prado','Rupa Rupa',     'Av. Raymondi 123',          'Lic. Gina Apaza Pimentel')
ON CONFLICT (codigo) DO NOTHING;


-- ── PASO 3: INSERT — 360 ASESORES DE NEGOCIOS ─────────────
-- 12 asesores por agencia × 30 agencias = 360
-- Niveles: 2 Senior II, 3 Senior I, 4 Junior II, 3 Junior I

DO $$
DECLARE
  ag      RECORD;
  pos     INT;
  nivel   TEXT;
  cartera INT;
  meta_c  INT;
  meta_m  NUMERIC;
  cod_as  TEXT;
  nom     TEXT;
  ape     TEXT;
  nombres_m TEXT[] := ARRAY[
    'Carlos','Juan','Luis','Pedro','Marco','Roberto','Diego','Andres',
    'Miguel','Fernando','Raul','Cesar','Ivan','Hector','Edwin','Walter',
    'Alex','Henry','Kevin','Bryan','Daniel','David','Oscar','Eduardo'
  ];
  nombres_f TEXT[] := ARRAY[
    'Maria','Ana','Rosa','Carmen','Silvia','Patricia','Sandra','Monica',
    'Diana','Milagros','Luz','Lidia','Noemi','Giovanna','Wendy','Cinthia',
    'Paola','Gisela','Sonia','Elena','Flor','Judith','Kelly','Leslie'
  ];
  apellidos1 TEXT[] := ARRAY[
    'Quispe','Mamani','Huaman','Flores','Garcia','Lopez','Torres','Ramirez',
    'Sulca','Palian','Ore','Coaquira','Ccallo','Apaza','Ttito','Ticona',
    'Zegarra','Salas','Lozano','Quiroz','Mejia','Cochachin','Vasquez','Poma'
  ];
  apellidos2 TEXT[] := ARRAY[
    'Cruz','Vera','Leon','Rojas','Tello','Vega','Torres','Diaz','Ramos',
    'More','Palomino','Huanca','Cuba','Ramirez','Flores','Perez','Rengifo',
    'Grandez','Castro','Reyes','Silva','Morales','Quispe','Mamani'
  ];
  niveles TEXT[]  := ARRAY[
    'Senior II','Senior II',
    'Senior I','Senior I','Senior I',
    'Junior II','Junior II','Junior II','Junior II',
    'Junior I','Junior I','Junior I'
  ];
  seed INT;
BEGIN
  FOR ag IN SELECT id, codigo FROM public.agencias ORDER BY id LOOP
    FOR pos IN 1..12 LOOP
      nivel  := niveles[pos];
      seed   := ag.id * 100 + pos;

      cartera := CASE nivel
        WHEN 'Senior II' THEN 220 + (seed % 60)
        WHEN 'Senior I'  THEN 160 + (seed % 40)
        WHEN 'Junior II' THEN 100 + (seed % 30)
        ELSE                   60 + (seed % 25)
      END;

      meta_c := CASE nivel
        WHEN 'Senior II' THEN 18 + (seed % 8)
        WHEN 'Senior I'  THEN 12 + (seed % 6)
        WHEN 'Junior II' THEN  8 + (seed % 4)
        ELSE                   5 + (seed % 3)
      END;

      meta_m := CASE nivel
        WHEN 'Senior II' THEN (50000 + seed % 30000)::NUMERIC
        WHEN 'Senior I'  THEN (30000 + seed % 20000)::NUMERIC
        WHEN 'Junior II' THEN (18000 + seed % 12000)::NUMERIC
        ELSE                  (10000 + seed % 8000)::NUMERIC
      END;

      cod_as := ag.codigo || '-' || LPAD(pos::TEXT, 2, '0');

      IF seed % 2 = 0 THEN
        nom := nombres_m[((seed * 3 + 1) % array_length(nombres_m,1)) + 1];
      ELSE
        nom := nombres_f[((seed * 5 + 2) % array_length(nombres_f,1)) + 1];
      END IF;
      ape := apellidos1[((seed * 7 + 3) % array_length(apellidos1,1)) + 1]
          || ' '
          || apellidos2[((seed * 11 + 5) % array_length(apellidos2,1)) + 1];

      INSERT INTO public.asesores_negocio (
        codigo, id_agencia, nombres, apellidos,
        dni, email, telefono,
        nivel, cartera_clientes_promedio, meta_creditos_mes, meta_monto_mes,
        zona_asignada, activo, fecha_ingreso
      ) VALUES (
        cod_as, ag.id, nom, ape,
        LPAD((40000000 + seed)::TEXT, 8, '0'),
        LOWER(LEFT(nom,3)) || '.' || LOWER(SPLIT_PART(ape,' ',1))
          || '@mibanco.pe',
        '9' || LPAD(((seed * 13 + 1000000) % 10000000)::TEXT, 8, '0'),
        nivel, cartera, meta_c, meta_m,
        'Zona-' || ag.codigo || '-' || LPAD(pos::TEXT, 2, '0'),
        TRUE,
        CURRENT_DATE - (
          CASE nivel
            WHEN 'Senior II' THEN (730 + (pos * 30))
            WHEN 'Senior I'  THEN (365 + (pos * 20))
            WHEN 'Junior II' THEN (180 + (pos * 15))
            ELSE                  ( 60 + (pos * 10))
          END
        )
      ) ON CONFLICT (codigo) DO NOTHING;

    END LOOP;
  END LOOP;
END $$;


-- ── PASO 4: FK id_asesor en fichas_campo ──────────────────
-- Ahora que asesores_negocio existe, se puede crear la FK.
-- En la v2.1 (Supabase) esto era necesario porque Supabase
-- no permite ALTER TABLE cross-script fácilmente.
-- En PG 16 local funciona igual.

ALTER TABLE public.fichas_campo
  ADD COLUMN IF NOT EXISTS id_asesor INT
  REFERENCES public.asesores_negocio(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fichas_campo_id_asesor
  ON public.fichas_campo(id_asesor);

CREATE INDEX IF NOT EXISTS idx_fichas_campo_asesor_fecha
  ON public.fichas_campo(id_asesor, fecha_visita DESC);


-- ── PASO 5: ÍNDICES DE PERFORMANCE PARA POWER BI ──────────
-- Críticos cuando el seed tiene 1,800+ clientes.

CREATE INDEX IF NOT EXISTS idx_scores_user_id
  ON public.scores_transaccionales(user_id);

CREATE INDEX IF NOT EXISTS idx_features_user_id
  ON public.features_scoring(user_id);

CREATE INDEX IF NOT EXISTS idx_creditos_user_estado
  ON public.creditos_preaprobados(user_id, estado);

CREATE INDEX IF NOT EXISTS idx_fichas_agencia_fecha
  ON public.fichas_campo(agencia, fecha_visita DESC);

CREATE INDEX IF NOT EXISTS idx_movimientos_user_periodo2
  ON public.movimientos_mensuales(user_id, periodo DESC);

CREATE INDEX IF NOT EXISTS idx_perfiles_distrito
  ON public.perfiles_clientes(distrito);

CREATE INDEX IF NOT EXISTS idx_perfiles_tipo_negocio
  ON public.perfiles_clientes(tipo_negocio);


-- ── PASO 6: VISTAS POWER BI ───────────────────────────────

-- Vista: Asesores con KPIs de agencia
DROP VIEW IF EXISTS public.vw_pbi_asesores CASCADE;
CREATE VIEW public.vw_pbi_asesores AS
SELECT
  an.id,
  an.codigo,
  an.nombres,
  an.apellidos,
  an.nombres || ' ' || an.apellidos           AS nombre_completo,
  an.nivel,
  an.cartera_clientes_promedio,
  an.meta_creditos_mes,
  an.meta_monto_mes,
  an.zona_asignada,
  an.fecha_ingreso,
  -- Antigüedad en meses
  EXTRACT(YEAR  FROM AGE(CURRENT_DATE, an.fecha_ingreso))::INT * 12 +
  EXTRACT(MONTH FROM AGE(CURRENT_DATE, an.fecha_ingreso))::INT      AS antiguedad_meses,
  -- Datos de agencia
  ag.codigo                                    AS codigo_agencia,
  ag.nombre                                    AS agencia,
  ag.region,
  ag.departamento,
  ag.provincia,
  ag.distrito                                  AS distrito_agencia,
  ag.jefe_agencia,
  -- Metas
  an.meta_creditos_mes                         AS creditos_meta,
  an.meta_monto_mes                            AS monto_meta,
  -- Cartera total de la agencia (window function)
  SUM(an.cartera_clientes_promedio)
    OVER (PARTITION BY an.id_agencia)          AS cartera_total_agencia
FROM public.asesores_negocio an
JOIN public.agencias          ag ON an.id_agencia = ag.id
WHERE an.activo = TRUE;


-- Vista: Resumen gerencial por agencia
DROP VIEW IF EXISTS public.vw_pbi_agencias CASCADE;
CREATE VIEW public.vw_pbi_agencias AS
SELECT
  ag.id,
  ag.codigo,
  ag.nombre,
  ag.region,
  ag.departamento,
  ag.provincia,
  ag.distrito,
  ag.jefe_agencia,
  COUNT(an.id)                                              AS total_asesores,
  COUNT(an.id) FILTER (WHERE an.nivel = 'Senior II')       AS senior_ii,
  COUNT(an.id) FILTER (WHERE an.nivel = 'Senior I')        AS senior_i,
  COUNT(an.id) FILTER (WHERE an.nivel = 'Junior II')       AS junior_ii,
  COUNT(an.id) FILTER (WHERE an.nivel = 'Junior I')        AS junior_i,
  COALESCE(SUM(an.cartera_clientes_promedio), 0)           AS cartera_total,
  COALESCE(SUM(an.meta_creditos_mes), 0)                   AS meta_creditos_agencia,
  COALESCE(SUM(an.meta_monto_mes), 0)                      AS meta_monto_agencia,
  COALESCE(AVG(an.cartera_clientes_promedio)
    FILTER (WHERE an.nivel = 'Senior II'), 0)              AS cartera_prom_senior_ii,
  COALESCE(AVG(an.cartera_clientes_promedio)
    FILTER (WHERE an.nivel = 'Senior I'),  0)              AS cartera_prom_senior_i,
  COALESCE(AVG(an.cartera_clientes_promedio)
    FILTER (WHERE an.nivel = 'Junior II'), 0)              AS cartera_prom_junior_ii,
  COALESCE(AVG(an.cartera_clientes_promedio)
    FILTER (WHERE an.nivel = 'Junior I'),  0)              AS cartera_prom_junior_i
FROM public.agencias ag
LEFT JOIN public.asesores_negocio an
  ON ag.id = an.id_agencia AND an.activo = TRUE
GROUP BY ag.id, ag.codigo, ag.nombre, ag.region,
         ag.departamento, ag.provincia, ag.distrito, ag.jefe_agencia;


-- ── PASO 7: VERIFICACIÓN ──────────────────────────────────
-- SELECT COUNT(*) FROM public.agencias;          -- → 30
-- SELECT COUNT(*) FROM public.asesores_negocio;  -- → 360
-- SELECT nivel, COUNT(*) FROM public.asesores_negocio
--   GROUP BY nivel ORDER BY COUNT(*) DESC;
-- → Junior II: 120 · Senior I: 90 · Junior I: 90 · Senior II: 60
--
-- Verificar columna id_asesor en fichas_campo:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'fichas_campo' AND column_name = 'id_asesor';

-- ============================================================
-- FIN — 02_agencias_asesores_pg16.sql · v4.0 · 2026
-- Siguiente: ejecutar 03_seed_demo_1800_pg16.sql
-- ============================================================

-- ── RLS: agencias y asesores son de lectura para todos los roles ──
ALTER TABLE public.agencias          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asesores_negocio  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agencias_select_all" ON public.agencias FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid()));
CREATE POLICY "asesores_select_all" ON public.asesores_negocio FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid()));

-- Insertar / actualizar solo admin/gerente
CREATE POLICY "agencias_admin_write" ON public.agencias FOR ALL
  USING (EXISTS (SELECT 1 FROM public.perfiles p
                 WHERE p.id = auth.uid() AND p.rol IN ('admin','gerente')));
CREATE POLICY "asesores_admin_write" ON public.asesores_negocio FOR ALL
  USING (EXISTS (SELECT 1 FROM public.perfiles p
                 WHERE p.id = auth.uid() AND p.rol IN ('admin','gerente')));

-- ============================================================
-- FIN — 02_agencias_asesores_supabase.sql · v4.0 · Caja Arequipa
-- Siguiente: ejecutar 03_seed_demo_supabase.sql (solo para demo)
-- ============================================================


-- ======== 03_seed_demo_supabase.sql ========

-- ⚠️  NOTA SUPABASE: Ejecutar con service_role key.
-- Las inserciones en auth.users deben hacerse via Supabase Auth Admin API
-- o via Dashboard: Authentication → Users. Este seed simula datos de prueba
-- insertando directamente en public.perfiles (requiere service_role).
-- Para producción, usar el flujo de registro normal de la app.

-- ============================================================
-- SCRIPT 03 — Seed Demo: 1,800 Clientes con Scoring Completo
-- FieldIQ / Portal Mi Banco · Supabase (service_role) · v4.0
-- ============================================================
-- ADAPTADO PARA: PostgreSQL 16 puro (sin Supabase / sin auth.users)
-- ============================================================
-- EJECUTAR: 4to de 4 — SOLO PARA DEMO/CLASE
-- DEPENDE DE:
--   00_setup_base_pg16.sql          (usuarios_mock, cuentas, transacciones)
--   01_scoring_tablas_funciones_pg16.sql (perfiles, features, scores, fichas)
--   02_agencias_asesores_pg16.sql   (agencias, asesores_negocio)
-- TIEMPO ESTIMADO: 30-90 segundos
-- ============================================================
-- QUÉ CAMBIA RESPECTO A v2.1 (Supabase):
--   ✓ auth_mock reemplazado por public.perfiles (tabla definitiva)
--   ✓ Los 1,800 UIDs se insertan en usuarios_mock (con password_hash ficticio)
--   ✓ Eliminados todos los ALTER TABLE DROP CONSTRAINT/ADD CONSTRAINT
--     que eran el hack para evadir auth.users en Supabase
--   ✓ COMMIT/BEGIN conservados para atomicidad
--   ✓ Columna 'estado' añadida a cuentas (requerida por v4.0)
--   ✓ Columna 'saldo_post' añadida a transacciones (requerida por v4.0)
-- ============================================================

BEGIN;

DO $$
DECLARE
  -- ── CATÁLOGOS ─────────────────────────────────────────────
  nombres_m   TEXT[] := ARRAY[
    'Carlos','Juan','Luis','Pedro','Jorge','Marco','Roberto',
    'Diego','Andres','Miguel','Fernando','Raul','Cesar','Ivan',
    'Hector','Edwin','Walter','Alex','Henry','Kevin',
    'Bryan','Daniel','David','Oscar','Eduardo','Rodrigo',
    'Victor','Manuel','Richard','Jhon'
  ];
  nombres_f   TEXT[] := ARRAY[
    'Maria','Ana','Rosa','Carmen','Silvia','Patricia','Yola',
    'Sandra','Monica','Diana','Milagros','Luz','Lidia','Noemi',
    'Giovanna','Wendy','Cinthia','Paola','Gisela','Sonia',
    'Elena','Flor','Judith','Kelly','Leslie','Vanessa',
    'Roxana','Fiorella','Evelyn','Nataly'
  ];
  apellidos_1 TEXT[] := ARRAY[
    'Quispe','Mamani','Huaman','Flores','Garcia','Lopez','Torres',
    'Ramirez','Sulca','Palian','Ore','Coaquira','Ccallo','Apaza',
    'Ttito','Ticona','Zegarra','Salas','Lozano','Quiroz',
    'Mejia','Cochachin','Vasquez','Chunga','Juarez','Rios',
    'Condori','Llanos','Asto','Poma'
  ];
  apellidos_2 TEXT[] := ARRAY[
    'Cruz','Vera','Leon','Rojas','Tello','Vega','Benites',
    'Torres','Diaz','Ramos','More','Palomino','Huanca','Cuba',
    'Ramirez','Flores','Perez','Rengifo','Grandez','Castro',
    'Reyes','Silva','Morales','Quispe','Mamani','Apaza',
    'Pimentel','Ccallo','Ttito','Coaquira'
  ];
  tipos_neg   TEXT[] := ARRAY[
    'Bodega','Restaurante','Ferreteria','Tienda de ropa','Farmacia',
    'Panaderia','Carpinteria','Zapateria','Merceria','Libreria',
    'Salon de belleza','Taller mecanico','Fruteria','Carniceria',
    'Polleria','Internet cafe','Papeleria','Joyeria','Floristeria',
    'Heladeria','Bazar','Lubricentro','Agroveterinaria','Confecciones',
    'Pasteleria'
  ];

  tenencias       TEXT[]    := ARRAY['alquilado_sin_contrato','alquilado_con_contrato','propio'];
  tenencia_pts    INT[]     := ARRAY[0, 10, 20];
  antigned_opts   TEXT[]    := ARRAY['menos_1_anio','1_a_3_anios','mas_3_anios'];
  antigned_pts    INT[]     := ARRAY[0, 20, 40];
  ventas_rangos   TEXT[]    := ARRAY['menos_50','50_a_150','151_a_300','mas_300'];
  ventas_pts      INT[]     := ARRAY[0, 15, 30, 45];
  ventas_montos   NUMERIC[] := ARRAY[30, 100, 220, 400];
  gastos_rangos   TEXT[]    := ARRAY['mas_80pct','50_a_80pct','menos_50pct'];
  gastos_pts      INT[]     := ARRAY[0, 5, 15];
  deuda_opts      TEXT[]    := ARRAY['si_significativa','si_menor','no'];
  deuda_pts       INT[]     := ARRAY[-50, -20, 20];
  pandero_opts    TEXT[]    := ARRAY['si_mayor_cuota','si_menor_cuota','no'];
  pandero_pts     INT[]     := ARRAY[-20, 0, 20];
  stock_opts      TEXT[]    := ARRAY['escaso','moderado','abundante'];
  stock_pts       INT[]     := ARRAY[0, 10, 20];
  activos_opts    TEXT[]    := ARRAY['ninguno','al_menos_uno'];
  activos_pts     INT[]     := ARRAY[0, 20];

  -- Variables de control
  asesor_rec      RECORD;
  agencia_rec     RECORD;
  cli_global      INT := 0;
  c               INT;
  uid             UUID;
  v_cuenta_id     UUID;
  score_id        UUID;
  ficha_id        UUID;

  -- Datos del cliente
  nombre          TEXT;
  apellido1       TEXT;
  apellido2       TEXT;
  dni_val         TEXT;
  email_val       TEXT;
  tel_val         TEXT;
  nacimiento      DATE;
  tipo_neg        TEXT;
  dir_negocio     TEXT;
  semilla         INT;

  -- Parámetros financieros
  antiguedad_c    INT;
  saldo_base      NUMERIC;
  saldo_prom      NUMERIC;
  ingreso_prom    NUMERIC;
  meses_abono     SMALLINT;
  num_entidades   SMALLINT;

  -- Puntuación transaccional
  p_saldo         SMALLINT;
  p_regular       SMALLINT;
  p_disciplina    SMALLINT;
  p_vinculo       SMALLINT;
  p_riesgo        SMALLINT;
  score_trans     SMALLINT;
  segmento_pre    TEXT;
  monto_hip       NUMERIC;

  -- Puntuación de campo
  idx_ant INT; p_ant SMALLINT;
  idx_ten INT; p_ten SMALLINT;
  idx_ven INT; p_ven SMALLINT;
  idx_gas INT; p_gas SMALLINT;
  idx_deu INT; p_deu SMALLINT;
  idx_pan INT; p_pan SMALLINT;
  idx_stk INT; p_stk SMALLINT;
  idx_act INT; p_act SMALLINT;
  score_campo     SMALLINT;
  score_final     SMALLINT;
  seg_final       TEXT;

  -- Propuesta de crédito
  techo_seg       NUMERIC;
  plazo_max       SMALLINT;
  tem             NUMERIC;
  factor_cuota    NUMERIC;
  monto_campo     NUMERIC;
  cuota_est       NUMERIC;
  recomend        TEXT;
  comite_res      TEXT;
  monto_final     NUMERIC;

  -- Fechas y mora
  fecha_preap     DATE;
  fecha_visita    DATE;
  fecha_aprob     DATE;
  fecha_desemb    DATE;
  dias_mora_val   SMALLINT;
  estado_pago_v   TEXT;

BEGIN
  -- Iterar sobre cada asesor de negocios (360 asesores × 5 clientes = 1,800)
  FOR asesor_rec IN
    SELECT
      an.id            AS id_asesor,
      an.nombres || ' ' || an.apellidos AS asesor_nombre,
      an.nivel,
      an.id_agencia
    FROM public.asesores_negocio an
    ORDER BY an.id
  LOOP
    SELECT * INTO agencia_rec
    FROM public.agencias
    WHERE id = asesor_rec.id_agencia;

    FOR c IN 1..5 LOOP
      cli_global := cli_global + 1;
      semilla    := asesor_rec.id_asesor * 100 + c;

      -- UUID único para este cliente
      uid        := gen_random_uuid();

      -- Nombres y apellidos
      apellido1  := apellidos_1[((semilla * 7 + 3)  % array_length(apellidos_1, 1)) + 1];
      apellido2  := apellidos_2[((semilla * 11 + 5) % array_length(apellidos_2, 1)) + 1];

      IF semilla % 2 = 0 THEN
        nombre := nombres_m[((semilla * 3 + 1) % array_length(nombres_m, 1)) + 1];
      ELSE
        nombre := nombres_f[((semilla * 5 + 2) % array_length(nombres_f, 1)) + 1];
      END IF;

      dni_val   := LPAD((20000000 + cli_global)::TEXT, 8, '0');
      email_val := LOWER(LEFT(nombre, 3)) || '.' || LOWER(apellido1)
                   || cli_global::TEXT || '@demo.pe';
      tel_val   := '9' || LEFT(LPAD(((semilla * 13 + 1000000) % 10000000)::TEXT, 8, '0'), 8);
      nacimiento := DATE '1980-01-01'
                    + ((semilla % 25) * 365 + (semilla % 365))::INT;

      tipo_neg    := tipos_neg[((semilla % array_length(tipos_neg, 1)) + 1)];
      dir_negocio := 'Jr. ' || apellido1 || ' ' || (100 + semilla % 900)::TEXT
                     || ', ' || agencia_rec.distrito;

      -- ── PARÁMETROS FINANCIEROS POR NIVEL ──────────────────
      antiguedad_c := CASE asesor_rec.nivel
        WHEN 'Senior II' THEN 24 + (semilla % 24)
        WHEN 'Senior I'  THEN 12 + (semilla % 18)
        WHEN 'Junior II' THEN  6 + (semilla % 12)
        ELSE                   3 + (semilla % 6)
      END;

      saldo_base := CASE asesor_rec.nivel
        WHEN 'Senior II' THEN 2000 + (semilla % 3000)
        WHEN 'Senior I'  THEN 1000 + (semilla % 2000)
        WHEN 'Junior II' THEN  500 + (semilla % 1000)
        ELSE                   200 + (semilla % 500)
      END;

      saldo_prom   := saldo_base;
      ingreso_prom := saldo_prom * (1.8 + (semilla % 5) * 0.15);

      meses_abono := LEAST(CASE asesor_rec.nivel
        WHEN 'Senior II' THEN (9  + semilla % 3)::SMALLINT
        WHEN 'Senior I'  THEN (7  + semilla % 4)::SMALLINT
        WHEN 'Junior II' THEN (5  + semilla % 5)::SMALLINT
        ELSE                  (2  + semilla % 5)::SMALLINT
      END, 12::SMALLINT);

      num_entidades := LEAST(CASE asesor_rec.nivel
        WHEN 'Senior II' THEN (semilla % 2)::SMALLINT
        WHEN 'Senior I'  THEN (semilla % 3)::SMALLINT
        WHEN 'Junior II' THEN (1 + semilla % 3)::SMALLINT
        ELSE                  (semilla % 4)::SMALLINT
      END, 4::SMALLINT);

      -- ── SCORING TRANSACCIONAL ─────────────────────────────
      p_saldo := CASE
        WHEN saldo_prom >= 5000 THEN 200
        WHEN saldo_prom >= 2000 THEN 160
        WHEN saldo_prom >= 1000 THEN 120
        WHEN saldo_prom >= 500  THEN 80
        WHEN saldo_prom >= 200  THEN 40
        ELSE 0
      END::SMALLINT;

      p_regular := CASE
        WHEN meses_abono >= 11 THEN 160
        WHEN meses_abono >= 9  THEN 128
        WHEN meses_abono >= 7  THEN 96
        WHEN meses_abono >= 5  THEN 64
        ELSE 24
      END::SMALLINT;

      p_disciplina := CASE
        WHEN (semilla % 10) >= 7 THEN 160
        WHEN (semilla % 10) >= 5 THEN 120
        WHEN (semilla % 10) >= 3 THEN 80
        WHEN (semilla % 10) >= 1 THEN 40
        ELSE 0
      END::SMALLINT;

      p_vinculo := CASE
        WHEN antiguedad_c >= 36 THEN 160
        WHEN antiguedad_c >= 24 THEN 120
        WHEN antiguedad_c >= 12 THEN 80
        WHEN antiguedad_c >= 6  THEN 40
        ELSE 0
      END::SMALLINT;

      p_riesgo := CASE
        WHEN num_entidades = 0  THEN 120
        WHEN num_entidades = 1  THEN 90
        WHEN num_entidades <= 3 THEN 48
        ELSE 12
      END::SMALLINT;

      score_trans  := p_saldo + p_regular + p_disciplina + p_vinculo + p_riesgo;

      segmento_pre := CASE
        WHEN score_trans >= 600 THEN 'PREMIER'
        WHEN score_trans >= 440 THEN 'ESTANDAR'
        WHEN score_trans >= 280 THEN 'BASICO'
        ELSE 'NO_APLICA'
      END;

      monto_hip := CASE segmento_pre
        WHEN 'PREMIER'  THEN LEAST(ingreso_prom * 2, 5000)
        WHEN 'ESTANDAR' THEN LEAST(ingreso_prom * 2, 2500)
        WHEN 'BASICO'   THEN LEAST(ingreso_prom * 2, 1000)
        ELSE 0
      END;

      -- ── 1. Crear usuario en auth.users (Supabase) + su perfil ─
      -- En Supabase, perfiles.id referencia auth.users(id); por eso primero
      -- creamos el usuario de autenticación. El trigger on_auth_user_created
      -- genera el perfil; reforzamos con un INSERT idempotente.
      -- IDEMPOTENTE: si el correo ya existe (re-ejecución del seed), reutiliza
      -- ese usuario en vez de chocar contra la unique de email.
      SELECT id INTO uid FROM auth.users WHERE email = email_val;
      IF uid IS NULL THEN
        uid := gen_random_uuid();
        INSERT INTO auth.users (id, email, raw_user_meta_data)
        VALUES (
          uid, email_val,
          jsonb_build_object('nombre', nombre,
                             'apellido', apellido1 || ' ' || apellido2,
                             'rol', 'cliente')
        )
        ON CONFLICT (id) DO NOTHING;
      END IF;

      INSERT INTO public.perfiles (id, email, nombre, apellido, rol)
      VALUES (
        uid,
        email_val,
        nombre,
        apellido1 || ' ' || apellido2,
        'cliente'
      )
      ON CONFLICT (id) DO NOTHING;

      -- ── 2. PERFILES_CLIENTES ──────────────────────────────
      INSERT INTO public.perfiles_clientes (
        user_id, dni, nombres, apellidos,
        fecha_nacimiento, edad, telefono,
        distrito, provincia, departamento,
        nombre_negocio, tipo_negocio, direccion_negocio,
        lat_negocio, lng_negocio,
        antiguedad_negocio_meses, tenencia_local,
        num_entidades_sbs, calificacion_sbs, deuda_total_sbs,
        estado_cliente
      ) VALUES (
        uid,
        dni_val,
        nombre,
        apellido1 || ' ' || apellido2,
        nacimiento,
        EXTRACT(YEAR FROM AGE(CURRENT_DATE, nacimiento))::SMALLINT,
        tel_val,
        agencia_rec.distrito,
        agencia_rec.provincia,
        agencia_rec.departamento,
        tipo_neg || ' ' || apellido1,
        tipo_neg,
        dir_negocio,
        ROUND((-12.0 + (semilla % 50) * 0.1)::NUMERIC, 7),
        ROUND((-77.0 + (semilla % 30) * 0.1)::NUMERIC, 7),
        antiguedad_c * 4 + (semilla % 12),
        tenencias[((semilla % 3) + 1)],
        num_entidades,
        CASE WHEN num_entidades <= 2 THEN 'Normal' ELSE 'CPP' END,
        ROUND(ingreso_prom * num_entidades * 0.3, 2),
        'activo'
      )
      ON CONFLICT (user_id) DO NOTHING;

      -- ── 3. CUENTAS ────────────────────────────────────────
      v_cuenta_id := gen_random_uuid();
      INSERT INTO public.cuentas (
        id, user_id, tipo, numero_cuenta, saldo, moneda, estado, created_at
      ) VALUES (
        v_cuenta_id,
        uid,
        CASE WHEN semilla % 3 = 0 THEN 'ahorro' ELSE 'corriente' END,
        '019-' || LPAD(cli_global::TEXT, 7, '0'),
        ROUND(saldo_prom * (0.88 + (semilla % 5) * 0.06), 2),
        'PEN',
        'activa',
        now() - (antiguedad_c || ' months')::INTERVAL
      )
      ON CONFLICT (numero_cuenta) DO NOTHING;

      -- ── 4. TRANSACCIONES (8 por cliente) ─────────────────
      INSERT INTO public.transacciones
        (user_id, cuenta_id, tipo, descripcion, monto, canal, fecha)
      VALUES
        (uid, v_cuenta_id, 'credito', 'Deposito sueldo',
         ROUND(ingreso_prom, 2),               'homebanking', now() - '30 days'::INTERVAL),
        (uid, v_cuenta_id, 'debito',  'Pago servicios',
         ROUND(ingreso_prom * 0.12, 2),        'app_movil',   now() - '28 days'::INTERVAL),
        (uid, v_cuenta_id, 'credito', 'Venta del negocio',
         ROUND(ingreso_prom * 0.85, 2),        'ventanilla',  now() - '15 days'::INTERVAL),
        (uid, v_cuenta_id, 'debito',  'Compra mercaderia',
         ROUND(ingreso_prom * 0.40, 2),        'homebanking', now() - '12 days'::INTERVAL),
        (uid, v_cuenta_id, 'credito', 'Deposito sueldo',
         ROUND(ingreso_prom * (1 + (semilla % 3) * 0.05), 2), 'homebanking', now() - '5 days'::INTERVAL),
        (uid, v_cuenta_id, 'debito',  'Pago alquiler',
         ROUND(ingreso_prom * 0.20, 2),        'homebanking', now() - '3 days'::INTERVAL),
        (uid, v_cuenta_id, 'credito', 'Transferencia recibida',
         ROUND(ingreso_prom * 0.15, 2),        'app_movil',   now() - '2 days'::INTERVAL),
        (uid, v_cuenta_id, 'debito',  'Gastos varios',
         ROUND(ingreso_prom * 0.08, 2),        'atm',         now() - '1 day'::INTERVAL);

      -- ── 5. MOVIMIENTOS_MENSUALES (3 meses por cliente) ───
      INSERT INTO public.movimientos_mensuales
        (user_id, cuenta_id, periodo, abonos_mes, cargos_mes, saldo_fin_mes, num_transacciones)
      VALUES
        (uid, v_cuenta_id,
         TO_CHAR(NOW() - '1 month'::INTERVAL,  'YYYY-MM'),
         ROUND(ingreso_prom * 1.85, 2), ROUND(ingreso_prom * 0.72, 2),
         ROUND(saldo_prom, 2), 8),
        (uid, v_cuenta_id,
         TO_CHAR(NOW() - '2 months'::INTERVAL, 'YYYY-MM'),
         ROUND(ingreso_prom * 1.78, 2), ROUND(ingreso_prom * 0.68, 2),
         ROUND(saldo_prom * 0.95, 2), 7),
        (uid, v_cuenta_id,
         TO_CHAR(NOW() - '3 months'::INTERVAL, 'YYYY-MM'),
         ROUND(ingreso_prom * 1.90, 2), ROUND(ingreso_prom * 0.75, 2),
         ROUND(saldo_prom * 1.05, 2), 9)
      ON CONFLICT (user_id, cuenta_id, periodo) DO NOTHING;

      -- ── 6. FEATURES_SCORING ───────────────────────────────
      INSERT INTO public.features_scoring (
        user_id,
        saldo_promedio, saldo_minimo, meses_saldo_positivo,
        ingreso_promedio, meses_con_abono, volatilidad_ingresos,
        ratio_ahorro_neto, depositos_recurrentes,
        antiguedad_cuenta_meses, meses_activos,
        edad, num_entidades_sbs,
        cuota_max_estimada, monto_max_por_ingreso,
        periodos_analizados
      ) VALUES (
        uid,
        ROUND(saldo_prom, 2),
        ROUND(saldo_prom * 0.6, 2),
        meses_abono,
        ROUND(ingreso_prom, 2),
        meses_abono,
        ROUND(ingreso_prom * 0.08, 4),
        ROUND((ingreso_prom - ingreso_prom * 0.65) / ingreso_prom, 4),
        LEAST(meses_abono, 12::SMALLINT),
        antiguedad_c,
        meses_abono,
        EXTRACT(YEAR FROM AGE(CURRENT_DATE, nacimiento))::SMALLINT,
        num_entidades,
        ROUND(ingreso_prom * 0.30, 2),
        ROUND(ingreso_prom * 2.0,  2),
        LEAST(antiguedad_c, 12::SMALLINT)
      )
      ON CONFLICT (user_id) DO UPDATE SET
        saldo_promedio        = EXCLUDED.saldo_promedio,
        ingreso_promedio      = EXCLUDED.ingreso_promedio,
        meses_con_abono       = EXCLUDED.meses_con_abono,
        cuota_max_estimada    = EXCLUDED.cuota_max_estimada,
        monto_max_por_ingreso = EXCLUDED.monto_max_por_ingreso,
        updated_at            = now();

      -- ── 7. SCORES_TRANSACCIONALES ─────────────────────────
      score_id := gen_random_uuid();
      INSERT INTO public.scores_transaccionales (
        id, user_id,
        pts_saldo, pts_regularidad, pts_disciplina, pts_vinculo, pts_riesgo,
        monto_hipotesis, ingreso_promedio_ref, cuota_max_ref,
        es_valido, fecha_calculo
      ) VALUES (
        score_id, uid,
        p_saldo, p_regular, p_disciplina, p_vinculo, p_riesgo,
        ROUND(monto_hip, 2),
        ROUND(ingreso_prom, 2),
        ROUND(ingreso_prom * 0.30, 2),
        segmento_pre <> 'NO_APLICA',
        now() - ((semilla % 7) || ' days')::INTERVAL
      )
      ON CONFLICT (user_id) DO NOTHING;

      -- ── 8. FICHAS_CAMPO (solo clientes elegibles) ─────────
      IF segmento_pre <> 'NO_APLICA' THEN

        -- Índices de campo según nivel del asesor
        idx_ant := LEAST(CASE asesor_rec.nivel
          WHEN 'Senior II' THEN 2 + (semilla % 2)
          WHEN 'Senior I'  THEN 1 + (semilla % 3)
          WHEN 'Junior II' THEN 1 + (semilla % 3)
          ELSE                  1 + (semilla % 2)
        END, 3);
        p_ant := antigned_pts[idx_ant]::SMALLINT;

        idx_ten := LEAST(CASE asesor_rec.nivel
          WHEN 'Senior II' THEN 2 + (semilla % 2)
          WHEN 'Senior I'  THEN 1 + (semilla % 3)
          ELSE                  (semilla % 3) + 1
        END, 3);
        p_ten := tenencia_pts[idx_ten]::SMALLINT;

        idx_ven := LEAST(CASE asesor_rec.nivel
          WHEN 'Senior II' THEN 3 + (semilla % 2)
          WHEN 'Senior I'  THEN 2 + (semilla % 3)
          WHEN 'Junior II' THEN 1 + (semilla % 3)
          ELSE                  (semilla % 3) + 1
        END, 4);
        p_ven := ventas_pts[idx_ven]::SMALLINT;

        idx_gas := CASE WHEN semilla % 5 = 0 THEN 1
                        WHEN semilla % 3 = 0 THEN 2
                        ELSE 3 END;
        p_gas := gastos_pts[idx_gas]::SMALLINT;

        idx_deu := CASE WHEN semilla % 6 = 0 THEN 1
                        WHEN semilla % 4 = 0 THEN 2
                        ELSE 3 END;
        p_deu := deuda_pts[idx_deu]::SMALLINT;

        idx_pan := CASE WHEN semilla % 8 = 0 THEN 1
                        WHEN semilla % 5 = 0 THEN 2
                        ELSE 3 END;
        p_pan := pandero_pts[idx_pan]::SMALLINT;

        idx_stk := LEAST(CASE asesor_rec.nivel
          WHEN 'Senior II' THEN 3
          WHEN 'Senior I'  THEN 2 + (semilla % 2)
          ELSE                  (semilla % 3) + 1
        END, 3);
        p_stk := stock_pts[idx_stk]::SMALLINT;

        idx_act := CASE WHEN semilla % 4 = 0 THEN 1 ELSE 2 END;
        p_act := activos_pts[idx_act]::SMALLINT;

        score_campo := (p_ant + p_ten + p_ven + p_gas + p_deu + p_pan + p_stk + p_act)::SMALLINT;
        score_final := (score_trans + score_campo)::SMALLINT;

        seg_final := CASE
          WHEN score_final >= 750 THEN 'PREMIER'
          WHEN score_final >= 550 THEN 'ESTANDAR'
          WHEN score_final >= 350 THEN 'BASICO'
          ELSE 'NO_APLICA'
        END;

        -- Propuesta de crédito según segmento
        techo_seg := CASE seg_final
          WHEN 'PREMIER'  THEN 5000
          WHEN 'ESTANDAR' THEN 2500
          WHEN 'BASICO'   THEN 1000
          ELSE 0
        END;

        plazo_max := CASE seg_final
          WHEN 'PREMIER'  THEN 24::SMALLINT
          WHEN 'ESTANDAR' THEN 18::SMALLINT
          WHEN 'BASICO'   THEN 12::SMALLINT
          ELSE 6::SMALLINT
        END;

        -- TEM = (1 + TEA)^(1/12) - 1 con TEA=60%
        tem          := POWER(1.60, 1.0/12) - 1;
        factor_cuota := tem / (1 - POWER(1 + tem, -plazo_max));
        monto_campo  := LEAST(monto_hip * (1 + (semilla % 5) * 0.05), techo_seg);
        cuota_est    := ROUND(monto_campo * factor_cuota, 2);

        recomend := CASE
          WHEN seg_final IN ('PREMIER','ESTANDAR') THEN 'aprobar'
          WHEN seg_final = 'BASICO'               THEN 'aprobar_monto_reducido'
          ELSE 'rechazar'
        END;

        comite_res := CASE
          WHEN semilla % 10 = 0                   THEN 'rechazado'
          WHEN seg_final = 'PREMIER'              THEN 'aprobado'
          WHEN seg_final = 'ESTANDAR'             THEN
            CASE WHEN semilla % 5 = 0 THEN 'aprobado_ajuste' ELSE 'aprobado' END
          WHEN seg_final = 'BASICO'               THEN
            CASE WHEN semilla % 4 = 0 THEN 'aprobado_ajuste' ELSE 'rechazado' END
          ELSE 'rechazado'
        END;

        monto_final := CASE comite_res
          WHEN 'aprobado'        THEN ROUND(monto_campo, 2)
          WHEN 'aprobado_ajuste' THEN ROUND(monto_campo * 0.80, 2)
          ELSE NULL
        END;

        -- Fechas del proceso (en el pasado reciente)
        fecha_preap  := CURRENT_DATE - ((semilla % 90) + 5)::INT;
        fecha_visita := fecha_preap + 3;
        fecha_aprob  := CASE WHEN comite_res IN ('aprobado','aprobado_ajuste')
                          THEN fecha_visita + 1 ELSE NULL END;
        fecha_desemb := CASE WHEN comite_res IN ('aprobado','aprobado_ajuste')
                          THEN fecha_aprob + 1 ELSE NULL END;

        -- Mora simulada
        dias_mora_val := CASE
          WHEN comite_res NOT IN ('aprobado','aprobado_ajuste') THEN 0
          WHEN asesor_rec.nivel = 'Junior I'  AND semilla % 8  = 0 THEN 35
          WHEN asesor_rec.nivel = 'Junior I'  AND semilla % 5  = 0 THEN 12
          WHEN asesor_rec.nivel = 'Junior II' AND semilla % 12 = 0 THEN 35
          WHEN asesor_rec.nivel = 'Junior II' AND semilla % 7  = 0 THEN 8
          WHEN semilla % 20 = 0 THEN 35
          WHEN semilla % 10 = 0 THEN 10
          ELSE 0
        END::SMALLINT;

        estado_pago_v := CASE
          WHEN dias_mora_val >= 30 THEN 'atraso_30'
          WHEN dias_mora_val >  0  THEN 'atraso_leve'
          ELSE 'al_dia'
        END;

        -- ── INSERT ficha_campo ────────────────────────────
        ficha_id := gen_random_uuid();
        INSERT INTO public.fichas_campo (
          id, user_id, score_id,
          asesor_nombre, agencia, fecha_visita,
          hora_inicio, hora_fin,
          negocio_verificado,
          antiguedad_negocio,   pts_antiguedad,
          tenencia_local,       pts_tenencia,
          direccion_verificada,
          ventas_diarias_rango, pts_ventas,
          ventas_mensuales_est, gastos_fijos_mes,
          ratio_gastos,         pts_gastos,
          ingreso_consistente,
          tiene_deuda_informal, pts_deuda_informal,
          monto_deuda_informal,
          participa_pandero,    pts_pandero,
          stock_visible,        pts_stock,
          activos_hogar,        pts_activos,
          caracter_resultado,
          score_transaccional_ref,
          monto_aprobado_propuesto, plazo_propuesto_meses, cuota_estimada,
          recomendacion_asesor,
          comite_resolucion,
          comite_monto_final, comite_plazo_final,
          jefe_agencia, fecha_comite,
          estado_ficha, id_asesor
        ) VALUES (
          ficha_id, uid, score_id,
          asesor_rec.asesor_nombre,
          agencia_rec.nombre,
          fecha_visita,
          '08:00'::TIME + ((semilla % 4) || ' hours')::INTERVAL,
          '08:50'::TIME + ((semilla % 4) || ' hours')::INTERVAL,
          TRUE,
          antigned_opts[idx_ant], p_ant,
          tenencias[idx_ten],     p_ten,
          dir_negocio,
          ventas_rangos[idx_ven], p_ven,
          ROUND(ventas_montos[idx_ven] * 26, 2),
          ROUND(ventas_montos[idx_ven] * 26 *
            CASE idx_gas WHEN 1 THEN 0.85 WHEN 2 THEN 0.65 ELSE 0.38 END, 2),
          gastos_rangos[idx_gas], p_gas,
          semilla % 9 <> 0,
          deuda_opts[idx_deu],  p_deu,
          CASE idx_deu WHEN 1 THEN ROUND(monto_hip * 0.6, 2)
                       WHEN 2 THEN ROUND(monto_hip * 0.25, 2)
                       ELSE 0 END,
          pandero_opts[idx_pan], p_pan,
          stock_opts[idx_stk],   p_stk,
          activos_opts[idx_act], p_act,
          CASE WHEN semilla % 30 = 0 THEN 'alerta' ELSE 'sin_penalidad' END,
          score_trans,
          ROUND(monto_campo, 2), plazo_max, cuota_est,
          recomend,
          comite_res,
          monto_final,
          CASE WHEN comite_res IN ('aprobado','aprobado_ajuste')
               THEN plazo_max ELSE NULL END,
          agencia_rec.jefe_agencia,
          CASE WHEN comite_res IN ('aprobado','aprobado_ajuste')
               THEN fecha_aprob ELSE fecha_visita + 1 END,
          'completada',
          asesor_rec.id_asesor
        );

        -- ── INSERT credito_preaprobado (solo aprobados) ───
        IF comite_res IN ('aprobado','aprobado_ajuste') THEN
          INSERT INTO public.creditos_preaprobados (
            user_id, ficha_id, score_id,
            segmento,
            score_transaccional, score_campo, score_final,
            monto_hipotesis, monto_aprobado, plazo_meses,
            tasa_tea, cuota_mensual,
            estado,
            fecha_preaprobacion, fecha_contacto,
            fecha_visita, fecha_aprobacion, fecha_desembolso,
            dias_mora, estado_pago
          ) VALUES (
            uid, ficha_id, score_id,
            seg_final,
            score_trans, score_campo, score_final,
            ROUND(monto_hip, 2),
            ROUND(monto_final, 2),
            plazo_max,
            0.60,
            cuota_est,
            'desembolsado',
            fecha_preap,
            fecha_preap + 2,
            fecha_visita, fecha_aprob, fecha_desemb,
            dias_mora_val, estado_pago_v
          );
        END IF;

      END IF; -- fin elegibles (segmento_pre <> 'NO_APLICA')

    END LOOP; -- 5 clientes por asesor
  END LOOP;   -- asesores

  RAISE NOTICE 'Seed completado: % clientes insertados en PostgreSQL 16', cli_global;
END $$;

COMMIT;

-- ── Verificación final ────────────────────────────────────
SELECT 'usuarios_mock'          AS tabla, COUNT(*) AS registros FROM public.perfiles
UNION ALL SELECT 'perfiles_clientes',     COUNT(*) FROM public.perfiles_clientes
UNION ALL SELECT 'cuentas',               COUNT(*) FROM public.cuentas
UNION ALL SELECT 'transacciones',         COUNT(*) FROM public.transacciones
UNION ALL SELECT 'movimientos_mensuales', COUNT(*) FROM public.movimientos_mensuales
UNION ALL SELECT 'features_scoring',      COUNT(*) FROM public.features_scoring
UNION ALL SELECT 'scores_transaccionales',COUNT(*) FROM public.scores_transaccionales
UNION ALL SELECT 'fichas_campo',          COUNT(*) FROM public.fichas_campo
UNION ALL SELECT 'creditos_preaprobados', COUNT(*) FROM public.creditos_preaprobados
ORDER BY tabla;
-- Esperado: usuarios_mock≥1800 · perfiles=1800 · cuentas=1800
--           transacciones=14400 · movimientos=5400 · features=1800
--           scores=1800 · fichas≈1500 · creditos≈1100

-- ============================================================
-- FIN — 03_seed_demo_1800_pg16.sql · v4.0 · 2026
-- ============================================================


-- ======== 04_recuperaciones_integracion_supabase.sql ========

-- ============================================================
-- SCRIPT 04 — Recuperaciones / Mora + Integración Core↔Homebanking
-- CMAC Arequipa · Supabase · v11
-- ============================================================
-- EJECUTAR: 5to (después de 00, 01, 02, 03)
-- DEPENDE DE: public.perfiles, public.cuentas, public.transacciones,
--             public.solicitudes_prestamo, public.creditos_preaprobados,
--             public.scores_transaccionales, public.audit_log, public.mi_rol()
-- ============================================================
-- QUÉ AGREGA (alineado a la rúbrica Banco Andino):
--   Crit.1  fn_desembolsar_credito → el desembolso vuelve al Homebanking
--           (crea/usa cuenta, suma saldo, inserta transacción, genera cronograma)
--   Crit.2  fn_evaluar_rds (semáforo) + ruta de aprobación por monto
--   Crit.3  roles 'riesgos' y 'comite' + acciones críticas protegidas
--   Crit.4  R1 bandas+KPIs, R2 gestiones de cobranza, R3 transición
--           judicial(≥121)/castigo(>180) con validación de umbrales
--   CRUD    políticas RLS completas SELECT/INSERT/UPDATE/DELETE por rol
-- Idempotente: se puede re-ejecutar sin error.
-- ============================================================

-- ── PASO 0: ROLES NUEVOS (riesgos, comite) ───────────────
-- Normaliza filas con rol fuera de lista y re-crea el CHECK con la lista
-- COMPLETA (incluye roles del profesor). NOT VALID: nunca falla por filas viejas.
ALTER TABLE public.perfiles DROP CONSTRAINT IF EXISTS perfiles_rol_check;
UPDATE public.perfiles SET rol = 'cliente'
 WHERE rol IS NULL
    OR rol NOT IN ('cliente','asesor','administrador','jefe_regional','riesgos','comite','analista','admin','gerente');
ALTER TABLE public.perfiles ADD  CONSTRAINT perfiles_rol_check
  CHECK (rol IN ('cliente','asesor','administrador','jefe_regional','riesgos','comite','analista','admin','gerente'))
  NOT VALID;

-- Helper de banda de mora (IMMUTABLE → usable en columna generada)
CREATE OR REPLACE FUNCTION public.fn_banda_mora(p_dias INT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN COALESCE(p_dias,0) <= 0   THEN 'Vigente'
    WHEN p_dias <= 8               THEN 'Preventiva'   -- R1
    WHEN p_dias <= 30              THEN 'Temprana'     -- R1
    WHEN p_dias <= 120             THEN 'Tardia'       -- R1
    WHEN p_dias <= 180             THEN 'Judicial'     -- R3 (≥121)
    ELSE 'Castigo'                                     -- R3 (>180)
  END
$$;

-- Banda de mora como columna generada sobre tu tabla existente
ALTER TABLE public.creditos_preaprobados
  ADD COLUMN IF NOT EXISTS banda_mora TEXT
  GENERATED ALWAYS AS (public.fn_banda_mora(dias_mora)) STORED;

-- Corrige unidad de tasa: tasa_anual se maneja como FRACCIÓN (0.60 = 60%)
-- en toda la app, así que la columna generada se recalcula sin /100.
ALTER TABLE public.solicitudes_prestamo DROP COLUMN IF EXISTS tasa_mensual;
ALTER TABLE public.solicitudes_prestamo
  ADD COLUMN tasa_mensual NUMERIC(8,6)
  GENERATED ALWAYS AS (POWER(1+tasa_anual,1.0/12)-1) STORED;

-- ============================================================
-- TABLA: cronograma_cuotas  (Crit.1 — refleja el crédito en HB)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cronograma_cuotas (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  credito_id       UUID          NOT NULL REFERENCES public.creditos_preaprobados(id) ON DELETE CASCADE,
  user_id          UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nro_cuota        SMALLINT      NOT NULL CHECK (nro_cuota > 0),
  fecha_vencimiento DATE         NOT NULL,
  cuota_total      NUMERIC(12,2) NOT NULL CHECK (cuota_total > 0),
  capital          NUMERIC(12,2) NOT NULL DEFAULT 0,
  interes          NUMERIC(12,2) NOT NULL DEFAULT 0,
  saldo_capital    NUMERIC(12,2) NOT NULL DEFAULT 0,
  estado           TEXT          NOT NULL DEFAULT 'pendiente'
                     CHECK (estado IN ('pendiente','pagada','vencida','parcial')),
  monto_pagado     NUMERIC(12,2) NOT NULL DEFAULT 0,
  fecha_pago       DATE,
  dias_atraso      SMALLINT      NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (credito_id, nro_cuota)
);
CREATE INDEX IF NOT EXISTS idx_cron_credito ON public.cronograma_cuotas(credito_id, nro_cuota);
CREATE INDEX IF NOT EXISTS idx_cron_user    ON public.cronograma_cuotas(user_id);

-- ============================================================
-- TABLA: gestiones_cobranza  (Crit.4 R2 — historial)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.gestiones_cobranza (
  id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  credito_id             UUID          NOT NULL REFERENCES public.creditos_preaprobados(id) ON DELETE CASCADE,
  user_id                UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,  -- cliente
  gestor_id              UUID          REFERENCES auth.users(id) ON DELETE SET NULL,          -- quien gestiona
  gestor_nombre          TEXT          NOT NULL DEFAULT '',
  canal                  TEXT          NOT NULL CHECK (canal IN ('llamada','visita','sms','email','whatsapp','carta')),
  resultado              TEXT          NOT NULL CHECK (resultado IN
                            ('contacto_efectivo','promesa_pago','no_contacto','negativa','renegociacion','pago_realizado')),
  compromiso_monto       NUMERIC(12,2) DEFAULT 0,
  compromiso_fecha       DATE,
  banda_al_gestionar     TEXT,
  dias_mora_al_gestionar SMALLINT      NOT NULL DEFAULT 0,
  observacion            TEXT,
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gestion_credito ON public.gestiones_cobranza(credito_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gestion_gestor  ON public.gestiones_cobranza(gestor_id);

-- ============================================================
-- VISTA R1: KPIs por banda de mora (consulta de cartera)
-- ============================================================
CREATE OR REPLACE VIEW public.vw_mora_bandas WITH (security_invoker = true) AS
SELECT
  banda_mora,
  COUNT(*)                              AS num_creditos,
  COALESCE(SUM(monto_aprobado),0)       AS saldo_cartera,
  COALESCE(AVG(dias_mora),0)::NUMERIC(8,1) AS dias_mora_prom,
  COALESCE(SUM(monto_aprobado) FILTER (WHERE dias_mora > 0),0) AS saldo_en_mora
FROM public.creditos_preaprobados
WHERE estado = 'desembolsado'
GROUP BY banda_mora;

-- Vista detalle de cartera morosa (para el listado R1/R2)
CREATE OR REPLACE VIEW public.vw_cartera_morosa WITH (security_invoker = true) AS
SELECT
  cp.id              AS credito_id,
  cp.user_id,
  p.nombre || ' ' || p.apellido AS cliente,
  p.email,
  p.telefono,
  cp.monto_aprobado,
  cp.cuota_mensual,
  cp.plazo_meses,
  cp.tasa_tea,
  cp.dias_mora,
  cp.banda_mora,
  cp.estado_pago,
  cp.estado,
  cp.fecha_desembolso,
  (SELECT COUNT(*) FROM public.gestiones_cobranza g WHERE g.credito_id = cp.id) AS num_gestiones,
  (SELECT MAX(g.created_at) FROM public.gestiones_cobranza g WHERE g.credito_id = cp.id) AS ultima_gestion
FROM public.creditos_preaprobados cp
JOIN public.perfiles p ON p.id = cp.user_id
WHERE cp.estado = 'desembolsado';

-- ── Vistas dashboard (KPIs piloto y embudo de campaña) ────
-- Portadas a Supabase para que el endpoint /api/scoring funcione.
CREATE OR REPLACE VIEW public.vw_pbi_kpis_piloto WITH (security_invoker = true) AS
WITH base AS (
  SELECT fc.agencia,
    DATE_TRUNC('month', fc.fecha_visita::TIMESTAMPTZ)::DATE AS mes,
    COUNT(DISTINCT fc.id)                                  AS visitas_totales,
    COUNT(DISTINCT cp.id)                                  AS desembolsos,
    COALESCE(SUM(cp.monto_aprobado),0)                     AS monto_desembolsado,
    COUNT(DISTINCT cp.id) FILTER (WHERE cp.dias_mora > 30) AS creditos_mora_30,
    COUNT(DISTINCT cp.id) FILTER (WHERE cp.dias_mora > 90) AS creditos_mora_90,
    COALESCE(AVG(fc.score_final),0)                        AS score_final_promedio
  FROM public.fichas_campo fc
  LEFT JOIN public.creditos_preaprobados cp ON fc.id = cp.ficha_id
  GROUP BY fc.agencia, DATE_TRUNC('month', fc.fecha_visita::TIMESTAMPTZ)::DATE
)
SELECT agencia, mes, visitas_totales, desembolsos, monto_desembolsado,
  ROUND(creditos_mora_30::NUMERIC / NULLIF(desembolsos,0) * 100, 2) AS mora_30_pct,
  ROUND(creditos_mora_90::NUMERIC / NULLIF(desembolsos,0) * 100, 2) AS mora_90_pct,
  ROUND(desembolsos::NUMERIC / NULLIF(visitas_totales,0) * 100, 2)  AS tasa_conversion_pct,
  ROUND(score_final_promedio,0) AS score_promedio
FROM base;

CREATE OR REPLACE VIEW public.vw_pbi_embudo_campania WITH (security_invoker = true) AS
SELECT agencia, asesor_nombre,
  DATE_TRUNC('month', fecha_visita::TIMESTAMPTZ)::DATE AS mes,
  COUNT(*)                                                    AS total_visitas,
  COUNT(*) FILTER (WHERE negocio_verificado = TRUE)           AS negocios_verificados,
  COUNT(*) FILTER (WHERE segmento_resultante = 'PREMIER')     AS premier,
  COUNT(*) FILTER (WHERE segmento_resultante = 'ESTANDAR')    AS estandar,
  COUNT(*) FILTER (WHERE segmento_resultante = 'BASICO')      AS basico,
  COUNT(*) FILTER (WHERE segmento_resultante = 'DESCALIFICADO') AS descalificados,
  COUNT(*) FILTER (WHERE comite_resolucion IN ('aprobado','aprobado_ajuste')) AS aprobados_comite,
  ROUND(COUNT(*) FILTER (WHERE comite_resolucion IN ('aprobado','aprobado_ajuste'))::NUMERIC /
    NULLIF(COUNT(*) FILTER (WHERE negocio_verificado = TRUE),0) * 100, 1) AS tasa_aprobacion_pct
FROM public.fichas_campo
GROUP BY agencia, asesor_nombre, DATE_TRUNC('month', fecha_visita::TIMESTAMPTZ)::DATE;

-- ============================================================
-- RPC (Crit.2): RDS con semáforo  →  cuota / ingreso mensual
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_evaluar_rds(
  p_monto NUMERIC, p_plazo_meses INT, p_tasa_anual NUMERIC, p_ingreso_neto NUMERIC
) RETURNS TABLE (cuota NUMERIC, rds NUMERIC, semaforo TEXT, decision TEXT)
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v_tem NUMERIC; v_cuota NUMERIC; v_rds NUMERIC;
BEGIN
  v_tem := POWER(1 + p_tasa_anual, 1.0/12) - 1;                 -- TEA→TEM
  v_cuota := ROUND( p_monto * v_tem / (1 - POWER(1 + v_tem, -p_plazo_meses)), 2);
  IF COALESCE(p_ingreso_neto,0) <= 0 THEN
    RETURN QUERY SELECT v_cuota, 999::NUMERIC, 'rojo'::TEXT, 'rechazar'::TEXT; RETURN;
  END IF;
  v_rds := ROUND(v_cuota / p_ingreso_neto, 4);
  RETURN QUERY SELECT v_cuota, v_rds,
    CASE WHEN v_rds <= 0.30 THEN 'verde' WHEN v_rds <= 0.40 THEN 'ambar' ELSE 'rojo' END,
    CASE WHEN v_rds <= 0.30 THEN 'aprobar'
         WHEN v_rds <= 0.40 THEN 'elevar_comite'
         ELSE 'rechazar' END;
END;$$;

-- ============================================================
-- RPC (Crit.1+2): DESEMBOLSO end-to-end
--   solicitud (Homebanking) → crédito Core → de vuelta al saldo HB
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_desembolsar_credito(p_solicitud_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s          public.solicitudes_prestamo%ROWTYPE;
  v_cuenta   public.cuentas%ROWTYPE;
  v_credito  public.creditos_preaprobados%ROWTYPE;
  v_score    SMALLINT := 440;
  v_segmento TEXT := 'ESTANDAR';
  v_tem NUMERIC; v_saldo NUMERIC; v_cap NUMERIC; v_int NUMERIC; v_nro INT;
  v_nro_cta TEXT;
BEGIN
  SELECT * INTO s FROM public.solicitudes_prestamo WHERE id = p_solicitud_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud % no existe', p_solicitud_id; END IF;
  IF s.estado = 'desembolsado' THEN RAISE EXCEPTION 'La solicitud ya fue desembolsada'; END IF;
  IF s.estado <> 'aprobado' THEN RAISE EXCEPTION 'Solo se desembolsa una solicitud aprobada (estado actual: %)', s.estado; END IF;

  -- Score/segmento del cliente (si existe)
  SELECT score_transaccional, segmento_preliminar INTO v_score, v_segmento
    FROM public.scores_transaccionales WHERE user_id = s.user_id;
  v_score    := LEAST(GREATEST(COALESCE(v_score,440),0),800);
  v_segmento := COALESCE(NULLIF(v_segmento,'NO_APLICA'),'ESTANDAR');

  -- 1) Cuenta destino: usa la cuenta activa más antigua o crea una de ahorro
  SELECT * INTO v_cuenta FROM public.cuentas
    WHERE user_id = s.user_id AND estado = 'activa'
    ORDER BY created_at ASC LIMIT 1;
  IF NOT FOUND THEN
    v_nro_cta := 'CMAC' || LPAD((floor(random()*1e10))::BIGINT::TEXT, 10, '0');
    INSERT INTO public.cuentas (user_id, tipo, numero_cuenta, saldo, moneda, estado)
    VALUES (s.user_id, 'ahorro', v_nro_cta, 0, 'PEN', 'activa')
    RETURNING * INTO v_cuenta;
  END IF;

  -- 2) Registrar el crédito en el Core
  INSERT INTO public.creditos_preaprobados (
    user_id, segmento, score_transaccional, score_campo, score_final,
    monto_aprobado, plazo_meses, tasa_tea, cuota_mensual,
    estado, fecha_preaprobacion, fecha_desembolso, dias_mora, estado_pago
  ) VALUES (
    s.user_id, v_segmento, v_score, 0, v_score,
    s.monto, s.plazo_meses, COALESCE(s.tasa_anual, 0.60), s.cuota_mensual,
    'desembolsado', CURRENT_DATE, CURRENT_DATE, 0, 'al_dia'
  ) RETURNING * INTO v_credito;

  -- 3) Abonar al saldo de la cuenta (vuelve al Homebanking)
  UPDATE public.cuentas
     SET saldo = saldo + s.monto
   WHERE id = v_cuenta.id
  RETURNING * INTO v_cuenta;

  -- 4) Transacción de crédito (movimiento visible en HB)
  INSERT INTO public.transacciones (user_id, cuenta_id, tipo, categoria, descripcion, monto, saldo_post, canal, estado)
  VALUES (s.user_id, v_cuenta.id, 'credito', 'prestamo',
          'Desembolso de crédito ' || s.id, s.monto, v_cuenta.saldo, 'homebanking', 'completada');

  -- 5) Generar cronograma (sistema francés)
  v_tem := POWER(1 + COALESCE(s.tasa_anual,0.60), 1.0/12) - 1;
  v_saldo := s.monto;
  FOR v_nro IN 1..s.plazo_meses LOOP
    v_int := ROUND(v_saldo * v_tem, 2);
    v_cap := ROUND(s.cuota_mensual - v_int, 2);
    v_saldo := ROUND(v_saldo - v_cap, 2);
    INSERT INTO public.cronograma_cuotas
      (credito_id, user_id, nro_cuota, fecha_vencimiento, cuota_total, capital, interes, saldo_capital)
    VALUES (v_credito.id, s.user_id, v_nro,
            CURRENT_DATE + (v_nro || ' month')::INTERVAL,
            s.cuota_mensual, v_cap, v_int, GREATEST(v_saldo,0));
  END LOOP;

  -- 6) Cerrar la solicitud del Homebanking
  UPDATE public.solicitudes_prestamo
     SET estado = 'desembolsado', updated_at = now()
   WHERE id = s.id;

  -- 7) Auditoría + alerta al cliente
  INSERT INTO public.audit_log (user_id, accion, tabla, registro_id, detalle, resultado)
  VALUES (s.user_id, 'DESEMBOLSO', 'creditos_preaprobados', v_credito.id::TEXT,
          'Monto S/ ' || s.monto || ' a cuenta ' || v_cuenta.numero_cuenta, 'ok');
  INSERT INTO public.alertas_usuario (user_id, tipo, titulo, mensaje, urgente)
  VALUES (s.user_id, 'prestamo', 'Crédito desembolsado',
          'Se abonaron S/ ' || s.monto || ' a tu cuenta ' || v_cuenta.numero_cuenta, TRUE);

  RETURN jsonb_build_object(
    'credito_id', v_credito.id,
    'cuenta', v_cuenta.numero_cuenta,
    'saldo_nuevo', v_cuenta.saldo,
    'monto_desembolsado', s.monto,
    'cuotas_generadas', s.plazo_meses
  );
END;$$;

-- ============================================================
-- RPC (Crit.1+4): PAGAR CUOTA (debita ahorro y recalcula mora)
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_pagar_cuota(p_credito_id UUID, p_cuenta_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cuota   public.cronograma_cuotas%ROWTYPE;
  v_cuenta  public.cuentas%ROWTYPE;
  v_credito public.creditos_preaprobados%ROWTYPE;
  v_dias INT;
BEGIN
  SELECT * INTO v_credito FROM public.creditos_preaprobados WHERE id = p_credito_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Crédito no encontrado'; END IF;

  SELECT * INTO v_cuota FROM public.cronograma_cuotas
    WHERE credito_id = p_credito_id AND estado <> 'pagada'
    ORDER BY nro_cuota ASC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'No hay cuotas pendientes'; END IF;

  SELECT * INTO v_cuenta FROM public.cuentas WHERE id = p_cuenta_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cuenta no encontrada'; END IF;
  IF v_cuenta.saldo < v_cuota.cuota_total THEN RAISE EXCEPTION 'Saldo insuficiente'; END IF;

  -- Debitar ahorro
  UPDATE public.cuentas SET saldo = saldo - v_cuota.cuota_total WHERE id = v_cuenta.id
    RETURNING * INTO v_cuenta;
  INSERT INTO public.transacciones (user_id, cuenta_id, tipo, categoria, descripcion, monto, saldo_post, canal, estado)
  VALUES (v_credito.user_id, v_cuenta.id, 'debito', 'prestamo',
          'Pago cuota ' || v_cuota.nro_cuota || ' crédito ' || p_credito_id,
          v_cuota.cuota_total, v_cuenta.saldo, 'homebanking', 'completada');

  -- Marcar cuota pagada
  UPDATE public.cronograma_cuotas
     SET estado='pagada', monto_pagado=cuota_total, fecha_pago=CURRENT_DATE
   WHERE id = v_cuota.id;

  -- Recalcular días de mora = max atraso de cuotas pendientes vencidas
  SELECT COALESCE(MAX(GREATEST(CURRENT_DATE - fecha_vencimiento,0)),0) INTO v_dias
    FROM public.cronograma_cuotas
   WHERE credito_id = p_credito_id AND estado <> 'pagada';
  UPDATE public.creditos_preaprobados
     SET dias_mora = v_dias,
         estado_pago = CASE WHEN v_dias=0 THEN 'al_dia'
                            WHEN v_dias<=30 THEN 'atraso_leve'
                            WHEN v_dias<=90 THEN 'atraso_30'
                            WHEN v_dias<=180 THEN 'atraso_90' ELSE 'castigado' END,
         updated_at = now()
   WHERE id = p_credito_id;

  RETURN jsonb_build_object('cuota_pagada', v_cuota.nro_cuota,
                            'monto', v_cuota.cuota_total,
                            'saldo_cuenta', v_cuenta.saldo,
                            'dias_mora', v_dias);
END;$$;

-- ============================================================
-- RPC (Crit.4 R3): TRANSICIÓN judicial / castigo con umbrales
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_transicion_mora(
  p_credito_id UUID, p_accion TEXT, p_gestor_id UUID, p_gestor_nombre TEXT DEFAULT ''
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.creditos_preaprobados%ROWTYPE; v_nuevo_estado TEXT; v_nuevo_pago TEXT;
BEGIN
  SELECT * INTO c FROM public.creditos_preaprobados WHERE id = p_credito_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Crédito no encontrado'; END IF;

  IF p_accion = 'judicial' THEN
    IF c.dias_mora < 121 THEN
      RAISE EXCEPTION 'Derivación judicial requiere ≥121 días de atraso (actual: %)', c.dias_mora;
    END IF;
    v_nuevo_estado := 'rechazado';   -- marca de gestión judicial
    v_nuevo_pago   := 'atraso_90';
  ELSIF p_accion = 'castigo' THEN
    IF c.dias_mora <= 180 THEN
      RAISE EXCEPTION 'Castigo requiere >180 días de atraso (actual: %)', c.dias_mora;
    END IF;
    v_nuevo_estado := 'cancelado';   -- crédito castigado
    v_nuevo_pago   := 'castigado';
  ELSE
    RAISE EXCEPTION 'Acción inválida: % (usa judicial o castigo)', p_accion;
  END IF;

  UPDATE public.creditos_preaprobados
     SET estado_pago = v_nuevo_pago, updated_at = now()
   WHERE id = p_credito_id;

  INSERT INTO public.gestiones_cobranza
    (credito_id, user_id, gestor_id, gestor_nombre, canal, resultado,
     banda_al_gestionar, dias_mora_al_gestionar, observacion)
  VALUES (p_credito_id, c.user_id, p_gestor_id, p_gestor_nombre, 'carta',
          'negativa', public.fn_banda_mora(c.dias_mora), c.dias_mora,
          'Transición ' || p_accion || ' aplicada');

  INSERT INTO public.audit_log (user_id, accion, tabla, registro_id, detalle, resultado)
  VALUES (p_gestor_id, 'MORA_' || upper(p_accion), 'creditos_preaprobados',
          p_credito_id::TEXT, 'Días mora: ' || c.dias_mora, 'ok');

  RETURN jsonb_build_object('accion', p_accion, 'dias_mora', c.dias_mora,
                            'estado_pago', v_nuevo_pago);
END;$$;

-- ============================================================
-- ROW LEVEL SECURITY + CRUD (SELECT / INSERT / UPDATE / DELETE)
-- ============================================================
ALTER TABLE public.cronograma_cuotas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gestiones_cobranza  ENABLE ROW LEVEL SECURITY;

-- cronograma_cuotas: cliente ve lo suyo; core ve todo; escritura solo core
DROP POLICY IF EXISTS cron_select ON public.cronograma_cuotas;
CREATE POLICY cron_select ON public.cronograma_cuotas FOR SELECT
  USING (user_id = auth.uid() OR public.mi_rol() IN ('asesor','riesgos','comite','admin','gerente'));
DROP POLICY IF EXISTS cron_insert ON public.cronograma_cuotas;
CREATE POLICY cron_insert ON public.cronograma_cuotas FOR INSERT
  WITH CHECK (public.mi_rol() IN ('asesor','riesgos','comite','admin','gerente'));
DROP POLICY IF EXISTS cron_update ON public.cronograma_cuotas;
CREATE POLICY cron_update ON public.cronograma_cuotas FOR UPDATE
  USING (public.mi_rol() IN ('asesor','riesgos','comite','admin','gerente'));
DROP POLICY IF EXISTS cron_delete ON public.cronograma_cuotas;
CREATE POLICY cron_delete ON public.cronograma_cuotas FOR DELETE
  USING (public.mi_rol() IN ('admin','gerente'));   -- borrar solo admin/gerente

-- gestiones_cobranza: cliente ve las suyas; gestores ven todas
DROP POLICY IF EXISTS gest_select ON public.gestiones_cobranza;
CREATE POLICY gest_select ON public.gestiones_cobranza FOR SELECT
  USING (user_id = auth.uid() OR public.mi_rol() IN ('asesor','riesgos','comite','admin','gerente'));
DROP POLICY IF EXISTS gest_insert ON public.gestiones_cobranza;
CREATE POLICY gest_insert ON public.gestiones_cobranza FOR INSERT
  WITH CHECK (public.mi_rol() IN ('asesor','riesgos','comite','admin','gerente'));
DROP POLICY IF EXISTS gest_update ON public.gestiones_cobranza;
CREATE POLICY gest_update ON public.gestiones_cobranza FOR UPDATE
  USING (public.mi_rol() IN ('asesor','riesgos','comite','admin','gerente'));
DROP POLICY IF EXISTS gest_delete ON public.gestiones_cobranza;
CREATE POLICY gest_delete ON public.gestiones_cobranza FOR DELETE
  USING (public.mi_rol() IN ('admin','gerente'));

-- ============================================================
-- SEED de calibración: ~13% de mora (rúbrica Crit.5)
--   Distribuye días de atraso sobre los créditos desembolsados
--   de forma determinista (sin aleatoriedad pura).
-- ============================================================
DO $$
DECLARE total INT; objetivo INT;
BEGIN
  SELECT COUNT(*) INTO total FROM public.creditos_preaprobados WHERE estado='desembolsado';
  IF total = 0 THEN
    RAISE NOTICE 'No hay créditos desembolsados; el seed de mora se omite.';
    RETURN;
  END IF;
  objetivo := GREATEST(1, ROUND(total * 0.13));   -- 13%

  -- Reset: todos al día
  UPDATE public.creditos_preaprobados SET dias_mora=0, estado_pago='al_dia' WHERE estado='desembolsado';

  -- Marca el 13% con días de atraso escalonados (bandas variadas)
  WITH muestra AS (
    SELECT id, row_number() OVER (ORDER BY created_at) AS rn
    FROM public.creditos_preaprobados WHERE estado='desembolsado' LIMIT objetivo
  )
  UPDATE public.creditos_preaprobados cp
     SET dias_mora = CASE (m.rn % 5)
            WHEN 0 THEN 5    -- Preventiva
            WHEN 1 THEN 20   -- Temprana
            WHEN 2 THEN 65   -- Tardia
            WHEN 3 THEN 150  -- Judicial
            ELSE 200 END,    -- Castigo
         estado_pago = CASE (m.rn % 5)
            WHEN 0 THEN 'atraso_leve' WHEN 1 THEN 'atraso_leve'
            WHEN 2 THEN 'atraso_30'  WHEN 3 THEN 'atraso_90' ELSE 'castigado' END
   FROM muestra m WHERE cp.id = m.id;
END $$;

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
SELECT banda_mora, num_creditos, saldo_cartera FROM public.vw_mora_bandas ORDER BY banda_mora;

-- ============================================================
-- FIN · Script 04 · v11 · Recuperaciones + Integración end-to-end
-- ============================================================


-- ======== 05_login_tarjeta_supabase.sql ========

-- ============================================================
-- SCRIPT 05 — Login por Tarjeta de Débito + DNI (estilo Caja Arequipa)
-- CMAC Arequipa · Supabase · v11
-- ============================================================
-- EJECUTAR: 6to (después de 00–04). Idempotente.
-- Permite autenticar como la banca real: Nº de tarjeta + DNI + clave.
-- Internamente resuelve el email del usuario para signInWithPassword.
-- ============================================================

-- 1) Columna número de tarjeta en perfiles (16 dígitos)
ALTER TABLE public.perfiles ADD COLUMN IF NOT EXISTS numero_tarjeta TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_perfiles_tarjeta
  ON public.perfiles(numero_tarjeta) WHERE numero_tarjeta IS NOT NULL;

-- 2) RPC: resuelve el email a partir de (tarjeta, dni)
CREATE OR REPLACE FUNCTION public.fn_email_por_acceso(p_tarjeta TEXT, p_dni TEXT)
RETURNS TEXT LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT email FROM public.perfiles
  WHERE dni = p_dni
    AND (p_tarjeta IS NULL OR p_tarjeta = '' OR numero_tarjeta = p_tarjeta)
  ORDER BY (numero_tarjeta = p_tarjeta) DESC NULLS LAST
  LIMIT 1
$$;

-- 3) Backfill DEMO: tarjeta + DNI determinísticos para clientes sin tarjeta
DO $$
DECLARE r RECORD; i INT := 0;
BEGIN
  FOR r IN
    SELECT id FROM public.perfiles
    WHERE rol = 'cliente' AND numero_tarjeta IS NULL
    ORDER BY created_at LIMIT 500
  LOOP
    i := i + 1;
    UPDATE public.perfiles
       SET dni = COALESCE(dni, LPAD((10000000 + i)::TEXT, 8, '0')),
           numero_tarjeta = '4509' || LPAD((100000000000 + i)::TEXT, 12, '0')
     WHERE id = r.id;
  END LOOP;
END $$;

-- 4) Verificación: credenciales demo (tarjeta + DNI)
SELECT email, dni, numero_tarjeta
FROM public.perfiles
WHERE rol = 'cliente' AND numero_tarjeta IS NOT NULL
ORDER BY created_at LIMIT 5;

-- ============================================================
-- FIN · Script 05 · Login por tarjeta + DNI
-- ============================================================


-- ======== 06_usuarios_demo_supabase.sql ========

-- ============================================================
-- 06_usuarios_demo_supabase.sql
-- Usuarios de prueba alineados al esquema del profesor.
-- Ejecutar DESPUÉS de 00–05 en el SQL Editor de Supabase.
--
-- CORE (personal):  usuario = DNI · contraseña = el mismo DNI (modo dev)
-- HOMEBANKING:      usuario = código cliente (minúscula) · contraseña = demo1234
-- ============================================================

-- 0) Asegurar que el CHECK de rol permite todos los roles (idempotente)
ALTER TABLE public.perfiles DROP CONSTRAINT IF EXISTS perfiles_rol_check;
ALTER TABLE public.perfiles ADD  CONSTRAINT perfiles_rol_check
  CHECK (rol IN ('cliente','asesor','administrador','jefe_regional','riesgos','comite','analista','admin','gerente'));

-- Asegurar columna numero_tarjeta (para login por código de cliente)
ALTER TABLE public.perfiles ADD COLUMN IF NOT EXISTS numero_tarjeta TEXT;

-- 1) Helper: crea/actualiza un usuario en auth.users CON contraseña real (bcrypt)
CREATE OR REPLACE FUNCTION public.fn_demo_upsert_user(
  p_email TEXT, p_password TEXT, p_nombre TEXT, p_apellido TEXT,
  p_rol TEXT, p_dni TEXT, p_tarjeta TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id UUID;
BEGIN
  SELECT id INTO v_id FROM auth.users WHERE email = p_email;
  IF v_id IS NULL THEN v_id := gen_random_uuid(); END IF;

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token,
    is_sso_user, is_anonymous
  ) VALUES (
    v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_email, crypt(p_password, gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('nombre',p_nombre,'apellido',p_apellido,'rol',p_rol,'dni',p_dni),
    '', '', '', '', '', '', '', '', FALSE, FALSE
  )
  ON CONFLICT (id) DO UPDATE SET
    encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = now(),
    raw_user_meta_data = EXCLUDED.raw_user_meta_data;

  -- Identidad 'email' requerida por GoTrue para signInWithPassword
  INSERT INTO auth.identities
    (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  SELECT gen_random_uuid(), v_id, v_id::text,
         jsonb_build_object('sub', v_id::text, 'email', p_email, 'email_verified', true),
         'email', now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM auth.identities i WHERE i.user_id = v_id AND i.provider = 'email'
  );

  -- Perfil (la tabla perfiles puede crearse por trigger; forzamos valores demo)
  INSERT INTO public.perfiles (id, email, nombre, apellido, rol, dni, numero_tarjeta)
  VALUES (v_id, p_email, p_nombre, p_apellido, p_rol, p_dni, p_tarjeta)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email, nombre = EXCLUDED.nombre, apellido = EXCLUDED.apellido,
    rol = EXCLUDED.rol, dni = EXCLUDED.dni, numero_tarjeta = EXCLUDED.numero_tarjeta;

  RETURN v_id;
END $$;

-- 2) CORE — personal del banco (contraseña = DNI)
--    Roles exactamente como el profesor.
SELECT public.fn_demo_upsert_user('11111111@core.cmac.pe','11111111','Ana','Asesora',      'asesor',        '11111111');
SELECT public.fn_demo_upsert_user('11111112@core.cmac.pe','11111112','Beto','Administrador','administrador', '11111112');
SELECT public.fn_demo_upsert_user('11111113@core.cmac.pe','11111113','Carla','Jefa',        'jefe_regional', '11111113');
SELECT public.fn_demo_upsert_user('11111114@core.cmac.pe','11111114','Diego','Riesgos',     'riesgos',       '11111114');
SELECT public.fn_demo_upsert_user('11111115@core.cmac.pe','11111115','Elsa','Comite',       'comite',        '11111115');
SELECT public.fn_demo_upsert_user('11111116@core.cmac.pe','11111116','Frank','Analista',    'analista',      '11111116');
SELECT public.fn_demo_upsert_user('11111117@core.cmac.pe','11111117','Gina','Asesora',      'asesor',        '11111117');
SELECT public.fn_demo_upsert_user('11111118@core.cmac.pe','11111118','Hugo','Asesor',       'asesor',        '11111118');

-- 3) HOMEBANKING — clientes (usuario = código en minúscula · contraseña = demo1234)
--    cli000007 / DNI 11200007 / demo1234 (el del recorrido del profesor)
DO $$
DECLARE i INT; cod TEXT; dni TEXT;
BEGIN
  FOR i IN 1..10 LOOP
    cod := 'cli' || lpad(i::text, 6, '0');          -- cli000001 .. cli000010
    dni := '112' || lpad(i::text, 5, '0');          -- 11200001 .. 11200010
    PERFORM public.fn_demo_upsert_user(
      cod || '@cliente.cmac.pe', 'demo1234',
      'Cliente', 'Demo ' || i, 'cliente', dni, cod
    );
  END LOOP;
END $$;

-- 4) RPC: resolver email a partir del DNI (login del personal del Core)
CREATE OR REPLACE FUNCTION public.fn_email_por_dni(p_dni TEXT)
RETURNS TEXT LANGUAGE sql SECURITY DEFINER AS $$
  SELECT u.email FROM public.perfiles p JOIN auth.users u ON u.id = p.id
  WHERE p.dni = p_dni LIMIT 1;
$$;

-- 5) RPC: resolver email por código de cliente o por tarjeta (homebanking)
CREATE OR REPLACE FUNCTION public.fn_email_por_codigo(p_codigo TEXT)
RETURNS TEXT LANGUAGE sql SECURITY DEFINER AS $$
  SELECT u.email FROM public.perfiles p JOIN auth.users u ON u.id = p.id
  WHERE lower(p.numero_tarjeta) = lower(p_codigo)
     OR p.numero_tarjeta = p_codigo
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.fn_email_por_dni(TEXT)     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_email_por_codigo(TEXT)  TO anon, authenticated;


-- 7) Relación directa solicitudes_prestamo → perfiles (para PostgREST)
--    Sin esta FK, Supabase responde: "Could not find a relationship between
--    'solicitudes_prestamo' and 'perfiles' in the schema cache".
--    perfiles.id = auth.users.id (1 a 1), así que la FK es válida.
-- Asegura que todo user con solicitudes tenga perfil (backfill defensivo):
INSERT INTO public.perfiles (id, email, nombre, apellido, rol)
SELECT u.id, u.email,
       COALESCE(u.raw_user_meta_data->>'nombre', SPLIT_PART(u.email,'@',1)),
       COALESCE(u.raw_user_meta_data->>'apellido',''),
       COALESCE(u.raw_user_meta_data->>'rol','cliente')
FROM auth.users u
WHERE EXISTS (SELECT 1 FROM public.solicitudes_prestamo s WHERE s.user_id = u.id)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.solicitudes_prestamo
  DROP CONSTRAINT IF EXISTS solicitudes_prestamo_user_perfil_fkey;
ALTER TABLE public.solicitudes_prestamo
  ADD CONSTRAINT solicitudes_prestamo_user_perfil_fkey
  FOREIGN KEY (user_id) REFERENCES public.perfiles(id) ON DELETE CASCADE;

-- Recargar el schema cache de Supabase (PostgREST) al instante
NOTIFY pgrst, 'reload schema';

-- 6) Verificación rápida
SELECT p.dni, p.rol, p.numero_tarjeta, u.email
FROM public.perfiles p JOIN auth.users u ON u.id = p.id
WHERE p.dni LIKE '1111111%' OR p.numero_tarjeta LIKE 'cli%'
ORDER BY p.rol, p.dni;

