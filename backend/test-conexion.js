// test-conexion.js — Diagnóstico de conexión a Supabase
// Uso:  cd backend  &&  node test-conexion.js
// Te dice EXACTAMENTE por qué "no se conecta".
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const clean = (v) => (v ?? '').trim().replace(/^["']|["']$/g, '');
const URL  = clean(process.env.SUPABASE_URL).replace(/\/+$/, '');
const ANON = clean(process.env.SUPABASE_ANON_KEY);
const SERV = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);

console.log('\n=== Diagnóstico de conexión a Supabase ===');
console.log('SUPABASE_URL              :', URL || '❌ (VACÍO)');
console.log('SUPABASE_ANON_KEY         :', ANON ? ANON.slice(0, 14) + '…' : '❌ (VACÍO)');
console.log('SUPABASE_SERVICE_ROLE_KEY :', SERV ? SERV.slice(0, 14) + '…' : '⚠️ (vacío → admin limitado)');

// 1) Validar formato de URL
if (!URL) {
  console.error('\n❌ SUPABASE_URL está vacío. ¿Estás corriendo el comando dentro de la carpeta backend?');
  console.error('   El archivo debe llamarse exactamente  backend/.env');
  process.exit(1);
}
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(URL)) {
  console.error('\n⚠️  La URL tiene un formato raro. Debe ser exactamente:');
  console.error('     https://TU_PROYECTO.supabase.co   (sin barra final, sin comillas, sin espacios)');
}

// 2) ¿Responde el dominio? (esto detecta el "fetch failed")
try {
  const r = await fetch(URL + '/auth/v1/health', { headers: { apikey: ANON } });
  console.log('\n✅ El dominio responde. HTTP', r.status, r.statusText);
} catch (e) {
  console.error('\n❌ NO se pudo conectar (este es tu "fetch failed").');
  console.error('   Detalle:', e.cause?.code || e.message);
  console.error('   Causas típicas:');
  console.error('     • La URL está mal escrita (revisa letra por letra en backend/.env).');
  console.error('     • No hay internet o un firewall/antivirus bloquea la salida.');
  console.error('     • Copiaste la URL con comillas, espacios o barra final.');
  process.exit(1);
}

// 3) ¿La consulta funciona? (clave válida + scripts SQL corridos)
const sb = createClient(URL, ANON, { auth: { persistSession: false } });
const { data, error } = await sb.from('agencias').select('id').limit(1);
if (error) {
  console.error('\n⚠️  Conectó, pero la consulta falló:', error.message);
  console.error('   • Si dice "Invalid API key": revisa SUPABASE_ANON_KEY.');
  console.error('   • Si dice que la tabla no existe: ejecuta el todo_en_uno.sql en Supabase.');
  console.error('   • Si es permiso/RLS: normal para anon; el backend usa también la service key.');
  process.exit(1);
}
console.log('✅ Consulta OK: Supabase responde y las tablas existen.');
console.log('\n🎉 Conexión correcta. Si el login aún falla, es por credenciales del usuario,');
console.log('   no por conexión. (Los clientes del seed no tienen contraseña: crea uno con');
console.log('   "Regístrate" o en Supabase → Authentication → Add user.)\n');
