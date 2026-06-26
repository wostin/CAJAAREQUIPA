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
