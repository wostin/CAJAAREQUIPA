// src/supabase.js — v9: variables ya cargadas por dotenv/config en server.js
import { createClient } from '@supabase/supabase-js';

// Limpia errores típicos al editar el .env a mano: espacios, comillas, barra final.
const clean = (v) => (v ?? '').trim().replace(/^["']|["']$/g, '');
const URL     = clean(process.env.SUPABASE_URL).replace(/\/+$/, '');
const ANON    = clean(process.env.SUPABASE_ANON_KEY);
const SERVICE = clean(process.env.SUPABASE_SERVICE_ROLE_KEY) || ANON; // fallback: evita 'placeholder'

// ── Diagnóstico claro al arrancar ──────────────────────
const urlOk = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(URL);
console.log('────────────────────────────────────────────');
console.log('[Supabase] URL :', URL || '(VACÍO)', urlOk ? '✅' : '⚠️ formato inesperado');
console.log('[Supabase] anon:', ANON ? ANON.slice(0, 10) + '…' : '(VACÍO) ⚠️');
console.log('[Supabase] serv:', clean(process.env.SUPABASE_SERVICE_ROLE_KEY) ? 'definida ✅' : 'usando anon (⚠️ admin limitado)');
if (!URL || !urlOk) {
  console.error('[Supabase] ⚠️  SUPABASE_URL vacío o con formato raro. Debe ser exactamente:');
  console.error('           https://TU_PROYECTO.supabase.co   (sin barra final, sin comillas, sin espacios)');
}
console.log('────────────────────────────────────────────');

// ── Validar solo si no estamos en test/build ───────────
if (process.env.NODE_ENV !== 'test') {
  const missing = [];
  if (!URL)     missing.push('SUPABASE_URL');
  if (!ANON)    missing.push('SUPABASE_ANON_KEY');
  if (!SERVICE) missing.push('SUPABASE_SERVICE_ROLE_KEY');

  if (missing.length > 0) {
    console.error('');
    console.error('╔══════════════════════════════════════════════════════════╗');
    console.error('║  FALTA EL ARCHIVO  backend/.env  (o está incompleto)       ║');
    console.error('╠══════════════════════════════════════════════════════════╣');
    console.error('║  Crea el archivo  backend/.env  con este contenido:        ║');
    console.error('║                                                            ║');
    console.error('║   SUPABASE_URL=https://TU_PROYECTO.supabase.co             ║');
    console.error('║   SUPABASE_ANON_KEY=eyJ... (anon public)                   ║');
    console.error('║   SUPABASE_SERVICE_ROLE_KEY=eyJ... (service_role secret)   ║');
    console.error('║   PORT=3000                                                ║');
    console.error('║                                                            ║');
    console.error('║  Las llaves estan en: supabase.com → tu proyecto →         ║');
    console.error('║  Project Settings → API Keys.                              ║');
    console.error('║                                                            ║');
    console.error('║  Atajo: copia el .env de tu proyecto anterior al           ║');
    console.error('║  backend/ de esta carpeta.                                 ║');
    console.error('╚══════════════════════════════════════════════════════════╝');
    console.error('');
    console.error('Faltan: ' + missing.join(', '));
    process.exit(1);  // salida limpia y guiada (sin volcado de Node feo)
  }
}

// ── Cliente ANON — respeta RLS, operaciones normales ──
export const supabase = createClient(
  URL  ?? 'https://placeholder.supabase.co',
  ANON ?? 'placeholder',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ── Cliente SERVICE ROLE — bypass RLS, solo admin ─────
export const supabaseAdmin = createClient(
  URL     ?? 'https://placeholder.supabase.co',
  SERVICE ?? 'placeholder',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ── Cliente como usuario (para validar RLS por token) ─
export const supabaseAsUser = (accessToken) =>
  createClient(URL ?? '', ANON ?? '', {
    auth:   { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
