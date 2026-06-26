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
