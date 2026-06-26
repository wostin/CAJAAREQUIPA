// src/api/supabase.js — v7: validación de .env + soporte formato sb_publishable_
import { createClient } from '@supabase/supabase-js';

const URL_RAW = import.meta.env.VITE_SUPABASE_URL ?? '';
const KEY_RAW = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

// ── Validar variables de entorno al arrancar ───────────
const ERRORES = [];
if (!URL_RAW)  ERRORES.push('Falta VITE_SUPABASE_URL en frontend/.env');
if (!KEY_RAW)  ERRORES.push('Falta VITE_SUPABASE_ANON_KEY en frontend/.env');
if (URL_RAW && !URL_RAW.startsWith('https://'))
  ERRORES.push('VITE_SUPABASE_URL debe empezar con https://');
if (URL_RAW && !URL_RAW.includes('.supabase.co'))
  ERRORES.push('VITE_SUPABASE_URL no parece una URL de Supabase válida');

if (ERRORES.length > 0) {
  console.error('❌ [Supabase] Errores de configuración:');
  ERRORES.forEach(e => console.error('   •', e));
}

// ── Crear cliente con configuración robusta ────────────
export const supabase = createClient(
  URL_RAW  || 'https://placeholder.supabase.co',
  KEY_RAW  || 'placeholder-key',
  {
    auth: {
      autoRefreshToken:    true,
      persistSession:      true,
      detectSessionInUrl:  true,
      storageKey:          'cmac-arequipa-auth',  // clave única para localStorage
      // flowType: 'pkce'  // descomenta si usas OAuth/Magic Link
    },
    global: {
      headers: { 'x-app-name': 'cmac-arequipa-v7' },
    },
    // Reintentos automáticos en fallos de red
    db: { schema: 'public' },
  }
);

// ── Exportar flag de configuración válida ─────────────
export const supabaseConfigured = ERRORES.length === 0;
export const supabaseErrors     = ERRORES;
