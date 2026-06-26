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
