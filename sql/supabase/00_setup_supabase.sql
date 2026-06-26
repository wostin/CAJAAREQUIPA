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
