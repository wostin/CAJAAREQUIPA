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
