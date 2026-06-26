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
