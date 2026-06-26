-- ============================================================
-- PARCHE_rds_reglamento.sql
-- RDS (Riesgo de Sobreendeudamiento) según el Reglamento de
-- Créditos del profesor (Art. 13 - Apetito y Tolerancia).
-- Reemplaza la RPC simple fn_evaluar_rds por una con límites
-- por tipo de crédito y semáforo del PEOR ratio (como el Core Andino).
-- Córrelo en una consulta nueva. Idempotente.
-- ============================================================

-- Límites por tipo de crédito (apetito %, tolerancia %):
--   ME/PE: cuota/ingreso 90/200 · cuota/excedente 85/100
--   CO/HI: cuota/ingreso 70/100 · cuota/excedente 40/80
--   N° entidades: apetito 4, tolerancia 6
CREATE OR REPLACE FUNCTION public.fn_evaluar_rds(
  p_monto NUMERIC,
  p_plazo_meses INT,
  p_tasa_anual NUMERIC,
  p_ingreso_neto NUMERIC,
  p_tipo_credito TEXT DEFAULT 'ME',
  p_gastos_familiares NUMERIC DEFAULT 0,
  p_cuotas_sf NUMERIC DEFAULT 0,
  p_deuda_externa NUMERIC DEFAULT 0,
  p_n_entidades INT DEFAULT NULL,
  p_es_recurrente BOOLEAN DEFAULT FALSE
) RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_tem NUMERIC; v_cuota NUMERIC; v_cuota_total NUMERIC; v_excedente NUMERIC;
  v_tipo TEXT; ap_ci INT; tol_ci INT; ap_ce INT; tol_ce INT;
  r_ci NUMERIC; r_de NUMERIC; r_ce NUMERIC;
  sem_ci TEXT; sem_de TEXT; sem_ce TEXT; sem_ne TEXT;
  peor INT := 0;  -- 0 verde, 1 ambar, 2 rojo
  ratios JSONB := '[]'::jsonb;
  decision TEXT;
BEGIN
  -- Cuota mensual (sistema francés): TEM = (1+TEA)^(1/12)-1
  v_tem   := POWER(1 + p_tasa_anual, 1.0/12) - 1;
  v_cuota := ROUND(p_monto * v_tem / (1 - POWER(1 + v_tem, -p_plazo_meses)), 2);
  v_cuota_total := v_cuota + COALESCE(p_cuotas_sf, 0);
  v_excedente := GREATEST(COALESCE(p_ingreso_neto,0) - COALESCE(p_cuotas_sf,0) - COALESCE(p_gastos_familiares,0), 0);

  -- Límites por tipo
  v_tipo := upper(COALESCE(p_tipo_credito,'ME'));
  IF v_tipo IN ('ME','PE') THEN
    ap_ci := 90; tol_ci := 200;
    ap_ce := CASE WHEN p_es_recurrente THEN 90 ELSE 85 END; tol_ce := 100;
  ELSE  -- CO/HI/consumo
    ap_ci := 70; tol_ci := 100;
    ap_ce := 40; tol_ce := 80;
  END IF;

  -- 1) Cuota / Ingreso (%)
  IF p_ingreso_neto > 0 THEN
    r_ci := ROUND(v_cuota_total / p_ingreso_neto * 100, 2);
    sem_ci := CASE WHEN r_ci <= ap_ci THEN 'VERDE' WHEN r_ci <= tol_ci THEN 'AMARILLO' ELSE 'ROJO' END;
    peor := GREATEST(peor, CASE sem_ci WHEN 'VERDE' THEN 0 WHEN 'AMARILLO' THEN 1 ELSE 2 END);
    ratios := ratios || jsonb_build_object('ratio','Cuota/Ingreso','valor_pct',r_ci,'apetito',ap_ci,'tolerancia',tol_ci,'semaforo',sem_ci);
  END IF;

  -- 2) Deuda externa / Excedente (veces)
  IF v_excedente > 0 THEN
    r_de := ROUND(COALESCE(p_deuda_externa,0) / v_excedente, 2);
    sem_de := CASE WHEN r_de <= 75 THEN 'VERDE' WHEN r_de <= 200 THEN 'AMARILLO' ELSE 'ROJO' END;
    peor := GREATEST(peor, CASE sem_de WHEN 'VERDE' THEN 0 WHEN 'AMARILLO' THEN 1 ELSE 2 END);
    ratios := ratios || jsonb_build_object('ratio','Deuda/Excedente','valor_veces',r_de,'apetito',75,'tolerancia',200,'semaforo',sem_de);
  END IF;

  -- 3) Cuota / Excedente (%)
  IF v_excedente > 0 THEN
    r_ce := ROUND(v_cuota_total / v_excedente * 100, 2);
    sem_ce := CASE WHEN r_ce <= ap_ce THEN 'VERDE' WHEN r_ce <= tol_ce THEN 'AMARILLO' ELSE 'ROJO' END;
    peor := GREATEST(peor, CASE sem_ce WHEN 'VERDE' THEN 0 WHEN 'AMARILLO' THEN 1 ELSE 2 END);
    ratios := ratios || jsonb_build_object('ratio','Cuota/Excedente','valor_pct',r_ce,'apetito',ap_ce,'tolerancia',tol_ce,'semaforo',sem_ce);
  END IF;

  -- 4) N° de entidades
  IF p_n_entidades IS NOT NULL THEN
    sem_ne := CASE WHEN p_n_entidades <= 4 THEN 'VERDE' WHEN p_n_entidades <= 6 THEN 'AMARILLO' ELSE 'ROJO' END;
    peor := GREATEST(peor, CASE sem_ne WHEN 'VERDE' THEN 0 WHEN 'AMARILLO' THEN 1 ELSE 2 END);
    ratios := ratios || jsonb_build_object('ratio','N° entidades','valor',p_n_entidades,'apetito',4,'tolerancia',6,'semaforo',sem_ne);
  END IF;

  -- Decisión global = peor semáforo
  decision := CASE peor
    WHEN 0 THEN 'aprobar'          -- todo en apetito (verde)
    WHEN 1 THEN 'elevar_comite'    -- entre apetito y tolerancia (ámbar)
    ELSE 'rechazar' END;           -- supera tolerancia (rojo)

  RETURN jsonb_build_object(
    'cuota', v_cuota,
    'cuota_total', v_cuota_total,
    'excedente', v_excedente,
    'semaforo', CASE peor WHEN 0 THEN 'VERDE' WHEN 1 THEN 'AMARILLO' ELSE 'ROJO' END,
    'decision', decision,
    'tipo_credito', v_tipo,
    'ratios', ratios
  );
END;$$;

GRANT EXECUTE ON FUNCTION public.fn_evaluar_rds(NUMERIC,INT,NUMERIC,NUMERIC,TEXT,NUMERIC,NUMERIC,NUMERIC,INT,BOOLEAN) TO anon, authenticated;

-- Prueba: crédito ME S/ 1000, 12m, TEA 43.92%, ingreso 2500
SELECT public.fn_evaluar_rds(1000, 12, 0.4392, 2500, 'ME');
