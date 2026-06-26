-- ============================================================
-- FIX_401_login.sql — Solución al error 401 en login por DNI/código
-- CMAC Arequipa · Supabase · v11
-- ============================================================
-- PROBLEMA: fn_email_por_dni y fn_email_por_codigo hacen JOIN con
--   auth.users, que solo es accesible con service_role.
--   Si SUPABASE_SERVICE_ROLE_KEY no está configurada (se usa la ANON),
--   Supabase rechaza la llamada con 401.
--
-- SOLUCIÓN A: Guardar el email en la tabla public.perfiles
--   (sin depender de auth.users en el JOIN)
--   → Las funciones quedan accesibles con la clave ANON ✅
--
-- EJECUTA ESTO en Supabase → SQL Editor → Run
-- ============================================================

-- ── Paso 1: Agregar columna email a perfiles (si no existe) ──
ALTER TABLE public.perfiles ADD COLUMN IF NOT EXISTS email TEXT;

-- ── Paso 2: Copiar emails desde auth.users ──────────────────
-- (solo los que están vacíos — idempotente)
UPDATE public.perfiles p
SET email = u.email
FROM auth.users u
WHERE u.id = p.id
  AND (p.email IS NULL OR p.email = '');

-- ── Paso 3: Reescribir fn_email_por_dni sin JOIN a auth.users ──
-- Ahora solo lee public.perfiles → funciona con clave ANON
CREATE OR REPLACE FUNCTION public.fn_email_por_dni(p_dni TEXT)
RETURNS TEXT LANGUAGE sql SECURITY DEFINER
SET search_path = public AS $$
  SELECT email
  FROM public.perfiles
  WHERE dni = p_dni
    AND email IS NOT NULL
    AND email <> ''
  LIMIT 1;
$$;

-- ── Paso 4: Reescribir fn_email_por_codigo sin JOIN a auth.users ──
-- Busca por numero_tarjeta (que almacena el código cli000001, etc.)
CREATE OR REPLACE FUNCTION public.fn_email_por_codigo(p_codigo TEXT)
RETURNS TEXT LANGUAGE sql SECURITY DEFINER
SET search_path = public AS $$
  SELECT email
  FROM public.perfiles
  WHERE lower(numero_tarjeta) = lower(p_codigo)
    AND email IS NOT NULL
    AND email <> ''
  LIMIT 1;
$$;

-- ── Paso 5: Garantizar permisos de ejecución ──────────────────
GRANT EXECUTE ON FUNCTION public.fn_email_por_dni(TEXT)    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_email_por_codigo(TEXT) TO anon, authenticated;

-- ── Paso 6: Trigger para mantener email sincronizado ──────────
-- Cuando se inserta/actualiza un perfil con JOIN desde auth.users
CREATE OR REPLACE FUNCTION public.sync_email_perfil()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.email IS NULL OR NEW.email = '' THEN
    SELECT email INTO NEW.email
    FROM auth.users WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_email_perfil ON public.perfiles;
CREATE TRIGGER trg_sync_email_perfil
  BEFORE INSERT OR UPDATE ON public.perfiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_email_perfil();

-- ── Verificación: deben aparecer emails para todos los usuarios ──
SELECT p.dni, p.rol, p.numero_tarjeta, p.email
FROM public.perfiles p
WHERE p.dni LIKE '1111111%'
   OR p.numero_tarjeta LIKE 'cli%'
ORDER BY p.rol, p.dni
LIMIT 20;

-- ============================================================
-- RESULTADO ESPERADO:
--   dni=11111111  rol=asesor        email=11111111@core.cmac.pe
--   dni=11111112  rol=administrador email=11111112@core.cmac.pe
--   ...
--   numero_tarjeta=cli000001 email=cli000010@cliente.cmac.pe
--   ...
-- Si la columna email aparece vacía en algún row, ejecuta el
-- UPDATE del Paso 2 manualmente para ese usuario.
-- ============================================================
