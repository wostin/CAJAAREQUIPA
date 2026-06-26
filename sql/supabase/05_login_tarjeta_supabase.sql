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
