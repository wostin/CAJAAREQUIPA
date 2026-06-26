-- ============================================================
-- SCRIPT 01 — Scoring: Tablas, Funciones PG y Vistas Power BI
-- FieldIQ / Portal Mi Banco · PostgreSQL 16 LOCAL · v3.0
-- ============================================================
-- ADAPTADO PARA: PostgreSQL 16 puro (sin Supabase / sin auth.users)
-- COMPATIBILIDAD BACKENDS: Laravel · Node.js · FastAPI ·
--                          Django · Spring Boot · ASP.NET Core
-- COMPATIBLE CON: Power BI Desktop (Import / DirectQuery)
-- ============================================================
-- EJECUTAR: 2do de 4
-- DEPENDE DE: 00_setup_base_pg16.sql (usuarios_mock, cuentas,
--             transacciones ya deben existir)
-- TIEMPO ESTIMADO: 5-10 segundos
-- ============================================================
-- QUÉ CAMBIA RESPECTO A v2.1 (Supabase):
--   ✓ REFERENCES auth.users → REFERENCES public.usuarios_mock
--   ✓ auth.uid()  → eliminado (no aplica en PG local)
--   ✓ RLS desactivado → Power BI Desktop conecta con superuser
--   ✓ Columna genero añadida con CHECK válido en PG 16
--   ✓ depositos_recurrentes corregido (era TEXT, ahora SMALLINT)
--   ✓ POWER() → compatible con PG 16 (función estándar)
--   ✓ Funciones con SECURITY DEFINER eliminado (no necesario local)
-- ============================================================
-- QUÉ CREA:
--   Tablas:   perfiles_clientes · movimientos_mensuales
--             features_scoring  · scores_transaccionales
--             fichas_campo      · creditos_preaprobados
--   Funciones: calcular_features_scoring(uuid)
--              calcular_score_transaccional(uuid)
--              evaluar_credito_campo(uuid, numeric, int)   [nueva]
--   Vistas PBI: vw_pbi_universo_scoring · vw_pbi_fichas_campo
--               vw_pbi_embudo_campania  · vw_pbi_calidad_cartera
--               vw_pbi_kpis_piloto
-- ============================================================


-- ============================================================
-- BLOQUE 1: TABLAS DE SCORING
-- ============================================================

-- ── 1.1 perfiles_clientes ─────────────────────────────────
-- Extiende usuarios_mock con datos demográficos y del negocio.
-- Creada aquí; el trigger automático va en el backend.
DROP TABLE IF EXISTS public.perfiles_clientes CASCADE;
CREATE TABLE public.perfiles_clientes (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID        NOT NULL UNIQUE
                             REFERENCES public.usuarios_mock(id) ON DELETE CASCADE,
  -- Datos personales
  nombres                  TEXT        NOT NULL DEFAULT '',
  apellidos                TEXT        NOT NULL DEFAULT '',
  dni                      TEXT        UNIQUE,
  fecha_nacimiento         DATE,
  edad                     SMALLINT,   -- se calcula al insertar: EXTRACT(YEAR FROM AGE(fecha_nacimiento))
  genero                   TEXT        CHECK (genero IN ('M','F','otro')),
  telefono                 TEXT,
  -- Dirección
  distrito                 TEXT,
  provincia                TEXT,
  departamento             TEXT,
  -- Datos del negocio (capturados por asesor en campo)
  nombre_negocio           TEXT,
  tipo_negocio             TEXT,        -- 'bodega','ferreteria','transporte','agro', etc.
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
  -- Estado en el sistema
  estado_cliente           TEXT         NOT NULL DEFAULT 'activo'
                             CHECK (estado_cliente IN ('activo','bloqueado','inactivo')),
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_perfiles_user_id
  ON public.perfiles_clientes(user_id);

-- ── 1.2 movimientos_mensuales ─────────────────────────────
-- Historial agregado de transacciones por cliente y mes.
-- Calculado por calcular_features_scoring() desde public.transacciones.
DROP TABLE IF EXISTS public.movimientos_mensuales CASCADE;
CREATE TABLE public.movimientos_mensuales (
  id                SERIAL          PRIMARY KEY,
  user_id           UUID            NOT NULL
                      REFERENCES public.usuarios_mock(id) ON DELETE CASCADE,
  cuenta_id         UUID            REFERENCES public.cuentas(id) ON DELETE SET NULL,
  periodo           TEXT            NOT NULL,   -- formato 'YYYY-MM'
  abonos_mes        NUMERIC(14,2)   NOT NULL DEFAULT 0,
  cargos_mes        NUMERIC(14,2)   NOT NULL DEFAULT 0,
  saldo_fin_mes     NUMERIC(14,2)   NOT NULL DEFAULT 0,
  num_transacciones INT             NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ     NOT NULL DEFAULT now(),
  UNIQUE(user_id, cuenta_id, periodo)
);

CREATE INDEX IF NOT EXISTS idx_movimientos_user_periodo
  ON public.movimientos_mensuales(user_id, periodo);

-- ── 1.3 features_scoring ──────────────────────────────────
-- Variables calculadas de scoring (feature engineering).
-- Una fila por cliente; se recalcula con calcular_features_scoring().
DROP TABLE IF EXISTS public.features_scoring CASCADE;
CREATE TABLE public.features_scoring (
  id                       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID          NOT NULL UNIQUE
                             REFERENCES public.usuarios_mock(id) ON DELETE CASCADE,
  -- Grupo A: Capacidad de Ahorro
  saldo_promedio           NUMERIC(12,2) NOT NULL DEFAULT 0,
  saldo_minimo             NUMERIC(12,2) NOT NULL DEFAULT 0,
  meses_saldo_positivo     SMALLINT      NOT NULL DEFAULT 0,
  -- Grupo B: Regularidad de Ingresos
  ingreso_promedio         NUMERIC(12,2) NOT NULL DEFAULT 0,
  meses_con_abono          SMALLINT      NOT NULL DEFAULT 0,
  volatilidad_ingresos     NUMERIC(10,4) NOT NULL DEFAULT 0,   -- STDDEV de abonos
  -- Grupo C: Disciplina Financiera
  ratio_ahorro_neto        NUMERIC(8,4)  NOT NULL DEFAULT 0,   -- (abonos-cargos)/abonos
  depositos_recurrentes    SMALLINT      NOT NULL DEFAULT 0,   -- meses con depósito > 0
  -- Grupo D: Vínculo con la institución
  antiguedad_cuenta_meses  INT           NOT NULL DEFAULT 0,
  meses_activos            SMALLINT      NOT NULL DEFAULT 0,
  -- Grupo E: Perfil de riesgo
  edad                     SMALLINT      NOT NULL DEFAULT 0,
  num_entidades_sbs        SMALLINT      NOT NULL DEFAULT 0,
  -- Derivados para reglas de monto
  cuota_max_estimada       NUMERIC(10,2) NOT NULL DEFAULT 0,   -- ingreso_promedio * 0.30
  monto_max_por_ingreso    NUMERIC(12,2) NOT NULL DEFAULT 0,   -- ingreso_promedio * 2
  -- Control
  periodos_analizados      SMALLINT      NOT NULL DEFAULT 0,
  fecha_calculo            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ── 1.4 scores_transaccionales ────────────────────────────
-- Resultado del scoring transaccional por cliente.
-- Columnas generadas (GENERATED ALWAYS AS ... STORED) son estándar PG 12+.
DROP TABLE IF EXISTS public.scores_transaccionales CASCADE;
CREATE TABLE public.scores_transaccionales (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL UNIQUE
                          REFERENCES public.usuarios_mock(id) ON DELETE CASCADE,
  -- Puntajes por grupo (800 pts total)
  pts_saldo             SMALLINT    NOT NULL DEFAULT 0,    -- Grupo A: máx 200
  pts_regularidad       SMALLINT    NOT NULL DEFAULT 0,    -- Grupo B: máx 160
  pts_disciplina        SMALLINT    NOT NULL DEFAULT 0,    -- Grupo C: máx 160
  pts_vinculo           SMALLINT    NOT NULL DEFAULT 0,    -- Grupo D: máx 160
  pts_riesgo            SMALLINT    NOT NULL DEFAULT 0,    -- Grupo E: máx 120
  -- Score total (columna generada — PG 12+, validado en PG 16)
  score_transaccional   SMALLINT    GENERATED ALWAYS AS (
    pts_saldo + pts_regularidad + pts_disciplina + pts_vinculo + pts_riesgo
  ) STORED,
  -- Segmento preliminar (antes de visita de campo)
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
  -- Hipótesis de monto (antes de visita)
  monto_hipotesis       NUMERIC(12,2) NOT NULL DEFAULT 0,
  ingreso_promedio_ref  NUMERIC(12,2) NOT NULL DEFAULT 0,
  cuota_max_ref         NUMERIC(10,2) NOT NULL DEFAULT 0,
  -- Control
  es_valido             BOOLEAN     NOT NULL DEFAULT TRUE,
  motivo_invalido       TEXT,
  fecha_calculo         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- BLOQUE 2: TABLA PRINCIPAL — FICHA DE VISITA DE CAMPO
-- ============================================================

DROP TABLE IF EXISTS public.fichas_campo CASCADE;
CREATE TABLE public.fichas_campo (
  id                      UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID      NOT NULL
                            REFERENCES public.usuarios_mock(id),   -- cliente evaluado
  score_id                UUID      REFERENCES public.scores_transaccionales(id),

  -- Asesor y agencia
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
  pts_antiguedad          SMALLINT  NOT NULL DEFAULT 0,    -- 0, 20 o 40
  tenencia_local          TEXT      CHECK (tenencia_local IN (
                            'alquilado_sin_contrato','alquilado_con_contrato','propio')),
  pts_tenencia            SMALLINT  NOT NULL DEFAULT 0,    -- 0, 10 o 20
  direccion_verificada    TEXT,
  pts_f1                  SMALLINT  GENERATED ALWAYS AS (pts_antiguedad + pts_tenencia) STORED,

  -- F2: Capacidad de pago real (máx 60 pts)
  ventas_diarias_rango    TEXT      CHECK (ventas_diarias_rango IN (
                            'menos_50','50_a_150','151_a_300','mas_300')),
  pts_ventas              SMALLINT  NOT NULL DEFAULT 0,    -- 0, 15, 30 o 45
  ventas_mensuales_est    NUMERIC(10,2),
  gastos_fijos_mes        NUMERIC(10,2),
  ratio_gastos            TEXT      CHECK (ratio_gastos IN (
                            'mas_80pct','50_a_80pct','menos_50pct')),
  pts_gastos              SMALLINT  NOT NULL DEFAULT 0,    -- 0, 5 o 15
  ingreso_consistente     BOOLEAN   NOT NULL DEFAULT TRUE,
  obs_inconsistencia      TEXT,
  pts_f2                  SMALLINT  GENERATED ALWAYS AS (pts_ventas + pts_gastos) STORED,

  -- F3: Deuda informal (máx 40 pts, puede ser negativo)
  tiene_deuda_informal    TEXT      CHECK (tiene_deuda_informal IN (
                            'si_significativa','si_menor','no')),
  pts_deuda_informal      SMALLINT  NOT NULL DEFAULT 0,    -- -50, -20 o +20
  monto_deuda_informal    NUMERIC(10,2) NOT NULL DEFAULT 0,
  detalle_deuda           TEXT,
  participa_pandero       TEXT      CHECK (participa_pandero IN (
                            'si_mayor_cuota','si_menor_cuota','no')),
  pts_pandero             SMALLINT  NOT NULL DEFAULT 0,    -- -20, 0 o +20
  aporte_pandero_mes      NUMERIC(8,2)  NOT NULL DEFAULT 0,
  pts_f3                  SMALLINT  GENERATED ALWAYS AS (pts_deuda_informal + pts_pandero) STORED,

  -- F4: Activos y respaldo (máx 40 pts)
  stock_visible           TEXT      CHECK (stock_visible IN ('escaso','moderado','abundante')),
  pts_stock               SMALLINT  NOT NULL DEFAULT 0,    -- 0, 10 o 20
  activos_hogar           TEXT      CHECK (activos_hogar IN ('ninguno','al_menos_uno')),
  pts_activos             SMALLINT  NOT NULL DEFAULT 0,    -- 0 o 20
  descripcion_activos     TEXT,
  pts_f4                  SMALLINT  GENERATED ALWAYS AS (pts_stock + pts_activos) STORED,

  -- F5: Carácter del cliente
  caracter_resultado      TEXT      NOT NULL DEFAULT 'sin_penalidad'
                            CHECK (caracter_resultado IN ('sin_penalidad','alerta','veto')),
  obs_caracter            TEXT,

  -- Score de campo (calculado)
  score_campo             SMALLINT  GENERATED ALWAYS AS (
    pts_antiguedad + pts_tenencia +
    pts_ventas + pts_gastos +
    pts_deuda_informal + pts_pandero +
    pts_stock + pts_activos
  ) STORED,

  -- Score final consolidado
  score_transaccional_ref SMALLINT,   -- copia del score_transaccional al momento de visita
  score_final             SMALLINT    GENERATED ALWAYS AS (
    score_transaccional_ref + (
      pts_antiguedad + pts_tenencia +
      pts_ventas + pts_gastos +
      pts_deuda_informal + pts_pandero +
      pts_stock + pts_activos
    )
  ) STORED,

  -- Segmento resultante (post campo)
  segmento_resultante     TEXT        GENERATED ALWAYS AS (
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
  comite_resolucion     TEXT        CHECK (comite_resolucion IN (
                          'aprobado','aprobado_ajuste','rechazado')),
  comite_monto_final    NUMERIC(12,2),
  comite_plazo_final    SMALLINT,
  comite_motivo_rechazo TEXT,
  jefe_agencia          TEXT,
  fecha_comite          DATE,

  -- Estado general
  estado_ficha          TEXT        NOT NULL DEFAULT 'en_proceso'
                          CHECK (estado_ficha IN ('en_proceso','completada','cancelada')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fichas_user_id
  ON public.fichas_campo(user_id);
CREATE INDEX IF NOT EXISTS idx_fichas_fecha_visita
  ON public.fichas_campo(fecha_visita);

-- ============================================================
-- BLOQUE 3: CRÉDITOS PREAPROBADOS (resultado final)
-- ============================================================

DROP TABLE IF EXISTS public.creditos_preaprobados CASCADE;
CREATE TABLE public.creditos_preaprobados (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID          NOT NULL
                          REFERENCES public.usuarios_mock(id),
  ficha_id              UUID          REFERENCES public.fichas_campo(id),
  score_id              UUID          REFERENCES public.scores_transaccionales(id),
  -- Datos del crédito
  segmento              TEXT          NOT NULL,
  score_transaccional   SMALLINT      NOT NULL,
  score_campo           SMALLINT      NOT NULL,
  score_final           SMALLINT      NOT NULL,
  monto_hipotesis       NUMERIC(12,2),
  monto_aprobado        NUMERIC(12,2) NOT NULL,
  plazo_meses           SMALLINT      NOT NULL,
  tasa_tea              NUMERIC(6,4)  NOT NULL DEFAULT 0.60,  -- TEA 60% referencial CMAC
  cuota_mensual         NUMERIC(10,2),
  -- Variación monto campo vs hipótesis (columna generada)
  variacion_monto_pct   NUMERIC(6,4)  GENERATED ALWAYS AS (
    CASE WHEN monto_hipotesis > 0
      THEN (monto_aprobado - monto_hipotesis) / monto_hipotesis
      ELSE NULL
    END
  ) STORED,
  -- Seguimiento del proceso
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
  -- Mora (seguimiento post-desembolso)
  dias_mora             SMALLINT      NOT NULL DEFAULT 0,
  estado_pago           TEXT          NOT NULL DEFAULT 'al_dia'
                          CHECK (estado_pago IN (
                            'al_dia','atraso_leve','atraso_30','atraso_90','castigado')),
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creditos_user_id
  ON public.creditos_preaprobados(user_id);
CREATE INDEX IF NOT EXISTS idx_creditos_estado
  ON public.creditos_preaprobados(estado);


-- ============================================================
-- BLOQUE 4: FUNCIÓN — calcular_features_scoring(uuid)
-- Agrega movimientos mensuales y calcula features de scoring
-- desde public.transacciones. Compatible PG 16.
-- ============================================================

CREATE OR REPLACE FUNCTION public.calcular_features_scoring(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
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
  -- 1. Agregar movimientos mensuales desde transacciones (últimos 12 meses)
  INSERT INTO public.movimientos_mensuales
    (user_id, cuenta_id, periodo, abonos_mes, cargos_mes, saldo_fin_mes, num_transacciones)
  SELECT
    t.user_id,
    t.cuenta_id,
    TO_CHAR(t.fecha, 'YYYY-MM')                                          AS periodo,
    SUM(CASE WHEN t.tipo = 'credito' THEN t.monto ELSE 0 END)           AS abonos_mes,
    SUM(CASE WHEN t.tipo = 'debito'  THEN t.monto ELSE 0 END)           AS cargos_mes,
    -- Saldo aproximado: se toma el saldo actual de la cuenta
    (SELECT c.saldo FROM public.cuentas c WHERE c.id = t.cuenta_id)     AS saldo_fin_mes,
    COUNT(*)                                                              AS num_transacciones
  FROM public.transacciones t
  WHERE t.user_id = p_user_id
    AND t.fecha >= NOW() - INTERVAL '12 months'
  GROUP BY t.user_id, t.cuenta_id, TO_CHAR(t.fecha, 'YYYY-MM')
  ON CONFLICT (user_id, cuenta_id, periodo) DO UPDATE SET
    abonos_mes        = EXCLUDED.abonos_mes,
    cargos_mes        = EXCLUDED.cargos_mes,
    saldo_fin_mes     = EXCLUDED.saldo_fin_mes,
    num_transacciones = EXCLUDED.num_transacciones;

  -- 2. Calcular features agregados desde movimientos_mensuales
  SELECT
    COALESCE(AVG(saldo_fin_mes),   0),
    COALESCE(MIN(saldo_fin_mes),   0),
    COALESCE(COUNT(*) FILTER (WHERE saldo_fin_mes > 0), 0)::SMALLINT,
    COALESCE(AVG(abonos_mes),      0),
    COALESCE(COUNT(*) FILTER (WHERE abonos_mes > 0), 0)::SMALLINT,
    COALESCE(STDDEV(abonos_mes),   0),
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

  -- 3. Antigüedad de la cuenta más antigua
  SELECT COALESCE(
    EXTRACT(YEAR FROM AGE(NOW(), MIN(created_at))) * 12 +
    EXTRACT(MONTH FROM AGE(NOW(), MIN(created_at))), 0
  )::INT
  INTO v_antiguedad_meses
  FROM public.cuentas
  WHERE user_id = p_user_id;

  -- 4. Edad y entidades SBS desde perfil_clientes
  SELECT
    COALESCE(pc.edad, 0)::SMALLINT,
    COALESCE(pc.num_entidades_sbs, 0)::SMALLINT
  INTO v_edad, v_entidades_sbs
  FROM public.perfiles_clientes pc
  WHERE pc.user_id = p_user_id;

  -- 5. Insertar o actualizar features
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
    v_saldo_promedio,   v_saldo_minimo,    v_meses_saldo_positivo,
    v_ingreso_promedio, v_meses_con_abono, v_volatilidad,
    v_ratio_ahorro,     v_meses_con_abono,          -- depositos_recurrentes ≈ meses_con_abono
    v_meses_activos,    COALESCE(v_antiguedad_meses, 0),
    COALESCE(v_edad, 0), COALESCE(v_entidades_sbs, 0),
    v_ingreso_promedio * 0.30,
    v_ingreso_promedio * 2.0,
    v_periodos
  )
  ON CONFLICT (user_id) DO UPDATE SET
    saldo_promedio           = EXCLUDED.saldo_promedio,
    saldo_minimo             = EXCLUDED.saldo_minimo,
    meses_saldo_positivo     = EXCLUDED.meses_saldo_positivo,
    ingreso_promedio         = EXCLUDED.ingreso_promedio,
    meses_con_abono          = EXCLUDED.meses_con_abono,
    volatilidad_ingresos     = EXCLUDED.volatilidad_ingresos,
    ratio_ahorro_neto        = EXCLUDED.ratio_ahorro_neto,
    depositos_recurrentes    = EXCLUDED.depositos_recurrentes,
    meses_activos            = EXCLUDED.meses_activos,
    antiguedad_cuenta_meses  = EXCLUDED.antiguedad_cuenta_meses,
    edad                     = EXCLUDED.edad,
    num_entidades_sbs        = EXCLUDED.num_entidades_sbs,
    cuota_max_estimada       = EXCLUDED.cuota_max_estimada,
    monto_max_por_ingreso    = EXCLUDED.monto_max_por_ingreso,
    periodos_analizados      = EXCLUDED.periodos_analizados,
    updated_at               = now();
END;
$$;


-- ============================================================
-- BLOQUE 5: FUNCIÓN — calcular_score_transaccional(uuid)
-- Aplica el modelo de scoring y persiste resultado.
-- Retorna TABLE compatible con todos los backends (SELECT *).
-- ============================================================

CREATE OR REPLACE FUNCTION public.calcular_score_transaccional(p_user_id UUID)
RETURNS TABLE (
  score_transaccional INT,
  segmento_preliminar TEXT,
  monto_hipotesis     NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
  f               public.features_scoring%ROWTYPE;
  p               public.perfiles_clientes%ROWTYPE;
  v_pts_saldo     SMALLINT := 0;
  v_pts_regular   SMALLINT := 0;
  v_pts_discipl   SMALLINT := 0;
  v_pts_vinculo   SMALLINT := 0;
  v_pts_riesgo    SMALLINT := 0;
  v_score_total   SMALLINT;
  v_segmento      TEXT;
  v_monto_hip     NUMERIC;
BEGIN
  SELECT * INTO f FROM public.features_scoring    WHERE user_id = p_user_id;
  SELECT * INTO p FROM public.perfiles_clientes   WHERE user_id = p_user_id;

  -- Grupo A: Saldo promedio (máx 200 pts)
  v_pts_saldo := CASE
    WHEN f.saldo_promedio >= 5000 THEN 200
    WHEN f.saldo_promedio >= 2000 THEN 160
    WHEN f.saldo_promedio >= 1000 THEN 120
    WHEN f.saldo_promedio >= 500  THEN 80
    WHEN f.saldo_promedio >= 200  THEN 40
    ELSE 0
  END;

  -- Grupo B: Meses con abono (máx 160 pts)
  v_pts_regular := CASE
    WHEN f.meses_con_abono >= 11 THEN 160
    WHEN f.meses_con_abono >= 9  THEN 128
    WHEN f.meses_con_abono >= 7  THEN 96
    WHEN f.meses_con_abono >= 5  THEN 64
    ELSE 24
  END;

  -- Grupo C: Ratio ahorro neto (máx 160 pts)
  v_pts_discipl := CASE
    WHEN f.ratio_ahorro_neto >= 0.30 THEN 160
    WHEN f.ratio_ahorro_neto >= 0.20 THEN 120
    WHEN f.ratio_ahorro_neto >= 0.10 THEN 80
    WHEN f.ratio_ahorro_neto >= 0.01 THEN 40
    ELSE 0
  END;

  -- Grupo D: Antigüedad de cuenta (máx 160 pts)
  v_pts_vinculo := CASE
    WHEN f.antiguedad_cuenta_meses >= 36 THEN 160
    WHEN f.antiguedad_cuenta_meses >= 24 THEN 120
    WHEN f.antiguedad_cuenta_meses >= 12 THEN 80
    WHEN f.antiguedad_cuenta_meses >= 6  THEN 40
    ELSE 0
  END;

  -- Grupo E: Entidades SBS (máx 120 pts)
  v_pts_riesgo := CASE
    WHEN COALESCE(f.num_entidades_sbs, 0) = 0   THEN 120
    WHEN COALESCE(f.num_entidades_sbs, 0) = 1   THEN 90
    WHEN COALESCE(f.num_entidades_sbs, 0) <= 3  THEN 48
    ELSE 12
  END;

  v_score_total := v_pts_saldo + v_pts_regular + v_pts_discipl +
                   v_pts_vinculo + v_pts_riesgo;

  v_segmento := CASE
    WHEN v_score_total >= 600 THEN 'PREMIER'
    WHEN v_score_total >= 440 THEN 'ESTANDAR'
    WHEN v_score_total >= 280 THEN 'BASICO'
    ELSE 'NO_APLICA'
  END;

  -- Hipótesis de monto: mínimo entre techo del segmento y 2x ingreso promedio
  v_monto_hip := CASE
    WHEN v_segmento = 'PREMIER'  THEN LEAST(COALESCE(f.monto_max_por_ingreso, 0), 5000)
    WHEN v_segmento = 'ESTANDAR' THEN LEAST(COALESCE(f.monto_max_por_ingreso, 0), 2500)
    WHEN v_segmento = 'BASICO'   THEN LEAST(COALESCE(f.monto_max_por_ingreso, 0), 1000)
    ELSE 0
  END;

  -- Persistir resultado
  INSERT INTO public.scores_transaccionales (
    user_id,
    pts_saldo, pts_regularidad, pts_disciplina, pts_vinculo, pts_riesgo,
    monto_hipotesis, ingreso_promedio_ref, cuota_max_ref
  ) VALUES (
    p_user_id,
    v_pts_saldo, v_pts_regular, v_pts_discipl, v_pts_vinculo, v_pts_riesgo,
    v_monto_hip,
    COALESCE(f.ingreso_promedio,    0),
    COALESCE(f.cuota_max_estimada,  0)
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

  RETURN QUERY
    SELECT v_score_total::INT, v_segmento, v_monto_hip;
END;
$$;


-- ============================================================
-- BLOQUE 6: FUNCIÓN AUXILIAR — evaluar_credito_campo(uuid, numeric, int)
-- Wrapper que ejecuta features + score + retorna resumen completo.
-- Ideal para los 6 backends: llamar como stored procedure.
-- Laravel: DB::select('SELECT * FROM evaluar_credito_campo(?,?,?)', [...])
-- Node.js: pool.query('SELECT * FROM evaluar_credito_campo($1,$2,$3)', [...])
-- FastAPI/Django: cursor.execute("SELECT * FROM evaluar_credito_campo(%s,%s,%s)", [...])
-- Spring Boot: @Query(value="SELECT * FROM evaluar_credito_campo(:u,:m,:p)", nativeQuery=true)
-- ASP.NET: context.Database.SqlQueryRaw("SELECT * FROM evaluar_credito_campo({0},{1},{2})", ...)
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
  -- Cuota estimada usando fórmula TEM = (1+TEA)^(1/12)-1
  cuota_estimada      NUMERIC,
  -- Resultado de evaluación
  resultado           TEXT,
  mensaje             TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_score      INT;
  v_segmento   TEXT;
  v_hipotesis  NUMERIC;
  v_tem        NUMERIC;
  v_cuota      NUMERIC;
  v_resultado  TEXT;
  v_mensaje    TEXT;
  v_tasa_tea   NUMERIC := 0.60;   -- TEA 60% referencial CMAC Huancayo
BEGIN
  -- Paso 1: calcular features del usuario
  PERFORM public.calcular_features_scoring(p_user_id);

  -- Paso 2: calcular score transaccional
  SELECT r.score_transaccional, r.segmento_preliminar, r.monto_hipotesis
  INTO   v_score, v_segmento, v_hipotesis
  FROM   public.calcular_score_transaccional(p_user_id) r;

  -- Paso 3: calcular cuota con TEM
  -- TEM = (1 + TEA)^(1/12) - 1
  v_tem   := POWER(1 + v_tasa_tea, 1.0/12) - 1;
  -- Cuota = Monto * TEM / (1 - (1+TEM)^(-n))
  v_cuota := p_monto_pedido * v_tem /
             (1 - POWER(1 + v_tem, -p_plazo_meses));

  -- Paso 4: evaluación de monto vs hipótesis
  v_resultado := CASE
    WHEN v_segmento = 'NO_APLICA'              THEN 'RECHAZADO'
    WHEN p_monto_pedido > v_hipotesis * 1.20   THEN 'EXCEDE_TECHO'
    WHEN p_monto_pedido <= v_hipotesis         THEN 'APROBADO_PROVISIONAL'
    ELSE                                             'REVISAR_COMITE'
  END;

  v_mensaje := CASE v_resultado
    WHEN 'RECHAZADO'            THEN 'El cliente no alcanza el puntaje mínimo para un crédito.'
    WHEN 'EXCEDE_TECHO'         THEN 'El monto solicitado supera en >20% la hipótesis del modelo.'
    WHEN 'APROBADO_PROVISIONAL' THEN 'Monto dentro del rango del modelo. Procede visita de campo.'
    WHEN 'REVISAR_COMITE'       THEN 'Monto ligeramente sobre hipótesis. Elevar a comité de agencia.'
    ELSE 'Evaluación completada.'
  END;

  RETURN QUERY
    SELECT
      p_user_id,
      v_score, v_segmento, v_hipotesis,
      p_monto_pedido, p_plazo_meses,
      ROUND(v_cuota, 2),
      v_resultado, v_mensaje;
END;
$$;


-- ============================================================
-- BLOQUE 7: VISTAS POWER BI
-- NOTA: Conectar desde Power BI Desktop como:
--   Servidor: localhost
--   BD: bd_core_financiero (o el nombre que usaste)
--   Modo: Import (recomendado para clase) o DirectQuery
-- ============================================================

-- Vista 1: Universo elegible con score transaccional
CREATE OR REPLACE VIEW public.vw_pbi_universo_scoring AS
SELECT
  st.user_id,
  pc.nombres || ' ' || pc.apellidos          AS nombre_cliente,
  pc.distrito,
  pc.provincia,
  pc.departamento,
  pc.tipo_negocio,
  pc.antiguedad_negocio_meses,
  pc.num_entidades_sbs,
  -- Features clave para análisis
  fs.saldo_promedio,
  fs.ingreso_promedio,
  fs.meses_con_abono,
  fs.ratio_ahorro_neto,
  fs.antiguedad_cuenta_meses,
  fs.meses_activos,
  fs.periodos_analizados,
  -- Score por grupos
  st.pts_saldo,
  st.pts_regularidad,
  st.pts_disciplina,
  st.pts_vinculo,
  st.pts_riesgo,
  st.score_transaccional,
  st.segmento_preliminar,
  st.monto_hipotesis,
  st.ingreso_promedio_ref,
  st.cuota_max_ref,
  st.fecha_calculo
FROM public.scores_transaccionales st
JOIN public.features_scoring       fs ON st.user_id = fs.user_id
LEFT JOIN public.perfiles_clientes pc ON st.user_id = pc.user_id
WHERE st.es_valido = TRUE
  AND st.segmento_preliminar <> 'NO_APLICA';

-- Vista 2: Fichas de campo completas con score final
CREATE OR REPLACE VIEW public.vw_pbi_fichas_campo AS
SELECT
  fc.id                                                     AS id_ficha,
  fc.fecha_visita,
  DATE_TRUNC('month', fc.fecha_visita::TIMESTAMPTZ)::DATE  AS mes_visita,
  EXTRACT(YEAR  FROM fc.fecha_visita)::INT                  AS anio,
  EXTRACT(MONTH FROM fc.fecha_visita)::INT                  AS numero_mes,
  fc.asesor_nombre,
  fc.agencia,
  -- Cliente
  COALESCE(pc.nombres || ' ' || pc.apellidos, 'Sin perfil') AS nombre_cliente,
  pc.distrito,
  pc.tipo_negocio,
  -- Scores por componente
  fc.score_transaccional_ref,
  fc.pts_f1,
  fc.pts_f2,
  fc.pts_f3,
  fc.pts_f4,
  fc.score_campo,
  fc.score_final,
  fc.segmento_resultante,
  -- Detalle de campo
  fc.negocio_verificado,
  fc.antiguedad_negocio,
  fc.tenencia_local,
  fc.ventas_diarias_rango,
  fc.ventas_mensuales_est,
  fc.gastos_fijos_mes,
  CASE WHEN fc.ventas_mensuales_est > 0
    THEN ROUND(fc.gastos_fijos_mes / fc.ventas_mensuales_est * 100, 1)
    ELSE NULL
  END                                                        AS pct_gastos_sobre_ventas,
  fc.tiene_deuda_informal,
  fc.monto_deuda_informal,
  fc.participa_pandero,
  fc.stock_visible,
  fc.activos_hogar,
  fc.caracter_resultado,
  -- Propuesta y comité
  fc.monto_aprobado_propuesto,
  fc.plazo_propuesto_meses,
  fc.cuota_estimada,
  fc.recomendacion_asesor,
  fc.comite_resolucion,
  fc.comite_monto_final,
  fc.comite_plazo_final,
  fc.estado_ficha
FROM public.fichas_campo fc
LEFT JOIN public.perfiles_clientes pc ON fc.user_id = pc.user_id;

-- Vista 3: Embudo de conversión por asesor/mes
CREATE OR REPLACE VIEW public.vw_pbi_embudo_campania AS
SELECT
  agencia,
  asesor_nombre,
  DATE_TRUNC('month', fecha_visita::TIMESTAMPTZ)::DATE         AS mes,
  COUNT(*)                                                      AS total_visitas,
  COUNT(*) FILTER (WHERE negocio_verificado = TRUE)            AS negocios_verificados,
  COUNT(*) FILTER (WHERE caracter_resultado = 'veto')          AS vetos_caracter,
  COUNT(*) FILTER (WHERE segmento_resultante = 'PREMIER')      AS premier,
  COUNT(*) FILTER (WHERE segmento_resultante = 'ESTANDAR')     AS estandar,
  COUNT(*) FILTER (WHERE segmento_resultante = 'BASICO')       AS basico,
  COUNT(*) FILTER (WHERE segmento_resultante = 'NO_APLICA')    AS no_aplica,
  COUNT(*) FILTER (WHERE segmento_resultante = 'DESCALIFICADO') AS descalificados,
  COUNT(*) FILTER (WHERE recomendacion_asesor = 'aprobar')     AS recomendados_aprobar,
  COUNT(*) FILTER (WHERE comite_resolucion IN (
    'aprobado','aprobado_ajuste'))                              AS aprobados_comite,
  COALESCE(SUM(comite_monto_final) FILTER (WHERE comite_resolucion IN (
    'aprobado','aprobado_ajuste')), 0)                         AS monto_total_aprobado,
  COALESCE(AVG(score_final) FILTER (WHERE
    segmento_resultante <> 'DESCALIFICADO'), 0)                AS score_final_promedio,
  -- Tasa de aprobación post-visita
  ROUND(
    COUNT(*) FILTER (WHERE comite_resolucion IN ('aprobado','aprobado_ajuste'))::NUMERIC /
    NULLIF(COUNT(*) FILTER (WHERE negocio_verificado = TRUE), 0) * 100, 1
  )                                                            AS tasa_aprobacion_pct
FROM public.fichas_campo
GROUP BY agencia, asesor_nombre,
         DATE_TRUNC('month', fecha_visita::TIMESTAMPTZ)::DATE;

-- Vista 4: Seguimiento crediticio y mora (calidad de cartera)
CREATE OR REPLACE VIEW public.vw_pbi_calidad_cartera AS
SELECT
  cp.id,
  cp.segmento,
  cp.score_transaccional,
  cp.score_campo,
  cp.score_final,
  -- Rangos de score para distribución en PBI
  CASE
    WHEN cp.score_final >= 900 THEN '900-1000'
    WHEN cp.score_final >= 800 THEN '800-899'
    WHEN cp.score_final >= 700 THEN '700-799'
    WHEN cp.score_final >= 600 THEN '600-699'
    WHEN cp.score_final >= 500 THEN '500-599'
    WHEN cp.score_final >= 400 THEN '400-499'
    ELSE                             '300-399'
  END                                AS rango_score,
  cp.monto_hipotesis,
  cp.monto_aprobado,
  cp.variacion_monto_pct,
  cp.plazo_meses,
  cp.tasa_tea,
  cp.cuota_mensual,
  -- Fechas del proceso
  cp.fecha_preaprobacion,
  cp.fecha_contacto,
  cp.fecha_visita,
  cp.fecha_aprobacion,
  cp.fecha_desembolso,
  -- Días entre etapas (eficiencia operativa)
  (cp.fecha_desembolso - cp.fecha_preaprobacion)  AS dias_preaprobacion_a_desembolso,
  (cp.fecha_aprobacion - cp.fecha_visita)         AS dias_visita_a_aprobacion,
  -- Mora y estado
  cp.estado,
  cp.dias_mora,
  cp.estado_pago,
  -- Clasificación SBS por días de mora
  CASE
    WHEN cp.dias_mora = 0       THEN 'Normal'
    WHEN cp.dias_mora <= 8      THEN 'CPP'
    WHEN cp.dias_mora <= 30     THEN 'Deficiente'
    WHEN cp.dias_mora <= 60     THEN 'Dudoso'
    ELSE                             'Pérdida'
  END                                AS categoria_sbs,
  -- Datos relacionados
  pc.distrito,
  pc.tipo_negocio,
  fc.agencia,
  fc.asesor_nombre,
  fc.tiene_deuda_informal,
  fc.participa_pandero,
  fc.negocio_verificado
FROM public.creditos_preaprobados cp
LEFT JOIN public.fichas_campo      fc ON cp.ficha_id = fc.id
LEFT JOIN public.perfiles_clientes pc ON cp.user_id  = pc.user_id;

-- Vista 5: Scorecard ejecutivo de KPIs del piloto
CREATE OR REPLACE VIEW public.vw_pbi_kpis_piloto AS
WITH base AS (
  SELECT
    fc.agencia,
    DATE_TRUNC('month', fc.fecha_visita::TIMESTAMPTZ)::DATE  AS mes,
    COUNT(DISTINCT fc.id)                                     AS visitas_totales,
    COUNT(DISTINCT cp.id)                                     AS desembolsos,
    COALESCE(SUM(cp.monto_aprobado), 0)                       AS monto_desembolsado,
    COUNT(DISTINCT cp.id) FILTER (WHERE cp.dias_mora > 30)    AS creditos_mora_30,
    COUNT(DISTINCT cp.id) FILTER (WHERE cp.dias_mora > 90)    AS creditos_mora_90,
    COALESCE(AVG(fc.score_final), 0)                          AS score_final_promedio
  FROM public.fichas_campo fc
  LEFT JOIN public.creditos_preaprobados cp ON fc.id = cp.ficha_id
  GROUP BY fc.agencia,
           DATE_TRUNC('month', fc.fecha_visita::TIMESTAMPTZ)::DATE
)
SELECT
  agencia,
  mes,
  visitas_totales,
  desembolsos,
  monto_desembolsado,
  ROUND(creditos_mora_30::NUMERIC / NULLIF(desembolsos, 0) * 100, 2) AS mora_30_pct,
  ROUND(creditos_mora_90::NUMERIC / NULLIF(desembolsos, 0) * 100, 2) AS mora_90_pct,
  ROUND(desembolsos::NUMERIC      / NULLIF(visitas_totales, 0) * 100, 2) AS tasa_conversion_pct,
  ROUND(score_final_promedio, 0)                                          AS score_promedio,
  CASE
    WHEN ROUND(creditos_mora_30::NUMERIC / NULLIF(desembolsos,0) * 100, 2) <= 5  THEN 'OK'
    WHEN ROUND(creditos_mora_30::NUMERIC / NULLIF(desembolsos,0) * 100, 2) <= 8  THEN 'ALERTA'
    ELSE                                                                               'CRITICO'
  END                                                                    AS semaforo_mora_30,
  CASE
    WHEN ROUND(desembolsos::NUMERIC / NULLIF(visitas_totales,0) * 100, 2) >= 20 THEN 'OK'
    WHEN ROUND(desembolsos::NUMERIC / NULLIF(visitas_totales,0) * 100, 2) >= 10 THEN 'ALERTA'
    ELSE                                                                               'CRITICO'
  END                                                                    AS semaforo_conversion
FROM base;

-- ── Vista adicional: Relación completa para Power BI Model ─
-- Esta vista une todas las tablas en un solo "flat table"
-- útil para el modo Import de Power BI sin configurar relaciones.
CREATE OR REPLACE VIEW public.vw_pbi_scoring_completo AS
SELECT
  um.email,
  um.nombre || ' ' || um.apellido              AS usuario,
  um.rol,
  um.created_at::DATE                           AS fecha_registro,
  pc.dni,
  pc.nombres || ' ' || pc.apellidos            AS nombre_cliente,
  pc.distrito,
  pc.provincia,
  pc.departamento,
  pc.tipo_negocio,
  pc.antiguedad_negocio_meses,
  pc.num_entidades_sbs,
  pc.calificacion_sbs,
  pc.deuda_total_sbs,
  -- Features
  fs.saldo_promedio,
  fs.saldo_minimo,
  fs.meses_saldo_positivo,
  fs.ingreso_promedio,
  fs.meses_con_abono,
  fs.ratio_ahorro_neto,
  fs.antiguedad_cuenta_meses,
  fs.meses_activos,
  fs.cuota_max_estimada,
  fs.monto_max_por_ingreso,
  fs.periodos_analizados,
  -- Score transaccional
  st.pts_saldo,
  st.pts_regularidad,
  st.pts_disciplina,
  st.pts_vinculo,
  st.pts_riesgo,
  st.score_transaccional,
  st.segmento_preliminar,
  st.monto_hipotesis,
  st.fecha_calculo                              AS fecha_score
FROM public.usuarios_mock um
LEFT JOIN public.perfiles_clientes      pc ON um.id = pc.user_id
LEFT JOIN public.features_scoring       fs ON um.id = fs.user_id
LEFT JOIN public.scores_transaccionales st ON um.id = st.user_id
WHERE um.rol = 'cliente';

-- ============================================================
-- BLOQUE 8: VERIFICACIÓN
-- ============================================================
-- Ejecutar después de correr el script:
--
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' ORDER BY table_name;
-- → 11 tablas: agencias(*), asesores_negocio(*), cuentas,
--   cuentas_ahorro, creditos_preaprobados, features_scoring,
--   fichas_campo, movimientos_mensuales, pagos, perfiles_clientes,
--   scores_transaccionales, solicitudes_prestamo, transacciones,
--   usuarios_mock   (*se crean en script 02)
--
-- SELECT viewname FROM pg_views WHERE schemaname = 'public';
-- → 8 vistas: vw_pbi_calidad_cartera, vw_pbi_embudo_campania,
--   vw_pbi_fichas_campo, vw_pbi_kpis_piloto, vw_pbi_resumen_clientes(*),
--   vw_pbi_scoring_completo, vw_pbi_transacciones(*), vw_pbi_universo_scoring
--
-- SELECT routine_name FROM information_schema.routines
-- WHERE routine_schema = 'public' AND routine_type = 'FUNCTION';
-- → calcular_features_scoring · calcular_score_transaccional · evaluar_credito_campo

-- ============================================================
-- FIN — 01_scoring_tablas_funciones_pg16.sql · v3.0 · 2026
-- Siguiente: ejecutar 02_agencias_asesores_pg16.sql
-- ============================================================
