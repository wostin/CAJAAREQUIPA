// src/routes/auth.js — Seguridad bancaria corregida
import { Router } from 'express';
import { supabase, supabaseAsUser, supabaseAdmin } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Control de intentos en memoria
const intentosMap = new Map();
const MAX_INTENTOS = 5;
const BLOQUEO_MS   = 5 * 60 * 1000;

function verificarBloqueo(email) {
  const e = intentosMap.get(email);
  if (!e) return null;
  if (e.bloqueadoHasta && Date.now() < e.bloqueadoHasta) {
    const seg = Math.ceil((e.bloqueadoHasta - Date.now()) / 1000);
    return `Cuenta bloqueada. Intenta en ${Math.ceil(seg/60)} minutos.`;
  }
  return null;
}

function registrarIntento(email, exitoso) {
  if (exitoso) { intentosMap.delete(email); return; }
  const e = intentosMap.get(email) || { intentos:0, bloqueadoHasta:null };
  e.intentos++;
  if (e.intentos >= MAX_INTENTOS) e.bloqueadoHasta = Date.now() + BLOQUEO_MS;
  intentosMap.set(email, e);
}

async function audit(user_id, accion, detalle='', resultado='ok') {
  try {
    await supabase.from('audit_log').insert({ user_id, accion, resultado, detalle });
  } catch { /* audit nunca debe romper el flujo */ }
}

// ── POST /api/auth/register ────────────────────────────────
router.post('/register', async (req, res) => {
  const { email, password, nombre, apellido, rol = 'cliente' } = req.body;
  if (!email || !password || !nombre || !apellido)
    return res.status(400).json({ success:false, message:'Todos los campos son requeridos' });
  if (password.length < 8)
    return res.status(400).json({ success:false, message:'Mínimo 8 caracteres' });
  if (!/[A-Z]/.test(password))
    return res.status(400).json({ success:false, message:'Debe tener al menos una mayúscula' });
  if (!/\d/.test(password))
    return res.status(400).json({ success:false, message:'Debe tener al menos un número' });
  if (!['cliente','asesor'].includes(rol))
    return res.status(400).json({ success:false, message:'Rol inválido' });

  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { nombre, apellido, rol } }
  });
  if (error) return res.status(400).json({ success:false, message:error.message });

  await audit(data.user?.id, 'REGISTRO', `Nuevo ${rol}: ${nombre} ${apellido}`);
  return res.status(201).json({
    success:true,
    message:'Usuario registrado. Ya puedes iniciar sesión.',
    user:{ id:data.user?.id, email:data.user?.email }
  });
});

// ── POST /api/auth/login ───────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ success:false, message:'Email y contraseña requeridos' });

  const bloqueo = verificarBloqueo(email);
  if (bloqueo) return res.status(429).json({ success:false, message:bloqueo });

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    registrarIntento(email, false);
    const raw = (error.message || '').toLowerCase();
    const esConexion = raw.includes('fetch failed') || raw.includes('network') ||
                       raw.includes('enotfound') || raw.includes('econnrefused') ||
                       raw.includes('timeout') || raw.includes('getaddrinfo');
    if (esConexion) {
      return res.status(503).json({ success:false, code:'SUPABASE_OFFLINE',
        message:'No se pudo conectar con Supabase. Revisa SUPABASE_URL/keys en backend/.env y tu conexión a internet.' });
    }
    const msg = error.message === 'Email not confirmed'       ? 'Email no confirmado.' :
                error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' :
                error.message;
    return res.status(401).json({ success:false, message:msg });
  }

  registrarIntento(email, true);

  // Obtener perfil
  const { data:perfil, error:perfilError } = await supabase
    .from('perfiles').select('nombre,apellido,rol,dni,telefono,bloqueado')
    .eq('id', data.user.id).single();

  if (perfil?.bloqueado)
    return res.status(403).json({ success:false, message:'Cuenta suspendida. Contacta soporte.' });

  // Actualizar último acceso
  await supabase.from('perfiles')
    .update({ ultimo_acceso: new Date().toISOString() })
    .eq('id', data.user.id);

  await audit(data.user.id, 'LOGIN', `Rol: ${perfil?.rol || 'cliente'}`);

  return res.json({
    success:true,
    token:         data.session.access_token,
    refresh_token: data.session.refresh_token,
    user: {
      id:       data.user.id,
      email:    data.user.email,
      nombre:   perfil?.nombre   ?? data.user.user_metadata?.nombre   ?? '',
      apellido: perfil?.apellido ?? data.user.user_metadata?.apellido ?? '',
      rol:      perfil?.rol      ?? data.user.user_metadata?.rol      ?? 'cliente',
      dni:      perfil?.dni      ?? null,
      telefono: perfil?.telefono ?? null,
    }
  });
});

// ── POST /api/auth/login-tarjeta ───────────────────────────
// Login estilo Caja Arequipa: Nº de tarjeta de débito + DNI + clave.
router.post('/login-tarjeta', async (req, res) => {
  const { tarjeta, dni, clave } = req.body;
  const tarjetaDigits = String(tarjeta || '').replace(/\D/g, '');
  const dniDigits     = String(dni || '').replace(/\D/g, '');

  if (!tarjetaDigits || !dniDigits || !clave)
    return res.status(400).json({ success:false, message:'Tarjeta, documento y clave son requeridos' });
  if (tarjetaDigits.length !== 16)
    return res.status(400).json({ success:false, message:'El número de tarjeta debe tener 16 dígitos' });
  if (dniDigits.length !== 8)
    return res.status(400).json({ success:false, message:'El DNI debe tener 8 dígitos' });

  const key = `${dniDigits}:${tarjetaDigits}`;
  const bloqueo = verificarBloqueo(key);
  if (bloqueo) return res.status(429).json({ success:false, message:bloqueo });

  const { data: email, error: eRpc } = await supabaseAdmin.rpc('fn_email_por_acceso', {
    p_tarjeta: tarjetaDigits, p_dni: dniDigits,
  });
  if (eRpc || !email) {
    registrarIntento(key, false);
    return res.status(401).json({ success:false, message:'Tarjeta o documento no válidos.' });
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password: clave });
  if (error) {
    registrarIntento(key, false);
    return res.status(401).json({ success:false, message:'Clave incorrecta.' });
  }
  registrarIntento(key, true);

  const { data:perfil } = await supabase
    .from('perfiles').select('nombre,apellido,rol,dni,telefono,bloqueado')
    .eq('id', data.user.id).single();
  if (perfil?.bloqueado)
    return res.status(403).json({ success:false, message:'Cuenta suspendida. Contacta soporte.' });

  await supabase.from('perfiles')
    .update({ ultimo_acceso: new Date().toISOString() }).eq('id', data.user.id);
  await audit(data.user.id, 'LOGIN', `Tarjeta · Rol: ${perfil?.rol || 'cliente'}`);

  return res.json({
    success:true,
    token:         data.session.access_token,
    refresh_token: data.session.refresh_token,
    user: {
      id:       data.user.id,
      email:    data.user.email,
      nombre:   perfil?.nombre   ?? '',
      apellido: perfil?.apellido ?? '',
      rol:      perfil?.rol      ?? 'cliente',
      dni:      perfil?.dni      ?? null,
      telefono: perfil?.telefono ?? null,
    }
  });
});

// ── GET /api/auth/me ───────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  const { data:perfil } = await supabase
    .from('perfiles').select('*').eq('id', req.user.id).single();
  return res.json({ success:true, user:{ id:req.user.id, email:req.user.email, ...(perfil||{}) } });
});

// ── POST /api/auth/logout ──────────────────────────────────
router.post('/logout', async (req, res) => {
  // Logout idempotente: NUNCA falla, aunque el token esté vencido o ausente.
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (token) {
    try {
      const sb = supabaseAsUser(token);
      const { data } = await sb.auth.getUser();
      if (data?.user) await audit(data.user.id, 'LOGOUT');
      await sb.auth.signOut();
    } catch { /* sesión ya inválida: no importa */ }
  }
  return res.json({ success:true, message:'Sesión cerrada' });
});

// ── POST /api/auth/refresh ─────────────────────────────────
router.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token)
    return res.status(400).json({ success:false, message:'refresh_token requerido' });
  const { data, error } = await supabase.auth.refreshSession({ refresh_token });
  if (error) return res.status(401).json({ success:false, message:'Token inválido' });
  return res.json({ success:true, token:data.session.access_token, refresh_token:data.session.refresh_token });
});

// ── POST /api/auth/login-usuario ───────────────────────────
// Login unificado (esquema del profesor):
//   • Personal CORE:  usuario = DNI (8 dígitos)  · contraseña = el DNI (modo dev)
//   • Homebanking:     usuario = código cliente (cli000007) · contraseña = demo1234
router.post('/login-usuario', async (req, res) => {
  const usuario = String(req.body.usuario || '').trim();
  const password = req.body.password;
  if (!usuario || !password)
    return res.status(400).json({ success:false, message:'Usuario y contraseña son requeridos' });

  const key = 'u:' + usuario.toLowerCase();
  const bloqueo = verificarBloqueo(key);
  if (bloqueo) return res.status(429).json({ success:false, message:bloqueo });

  // Resolver email: DNI de 8 dígitos → personal; si no, código de cliente.
  // Usa supabaseAdmin, con respaldo a la sesión anónima si la service key falla.
  let email = null, eRpc = null;
  const esDni = /^\d{8}$/.test(usuario);
  try {
    const cliente = supabaseAdmin || supabase;
    if (esDni) {
      ({ data: email, error: eRpc } = await cliente.rpc('fn_email_por_dni', { p_dni: usuario }));
    }
    if (!email) {
      ({ data: email, error: eRpc } = await cliente.rpc('fn_email_por_codigo', { p_codigo: usuario }));
    }
    // Respaldo: si la RPC falló con admin, reintenta con la sesión anónima (las RPC tienen GRANT a anon)
    if ((eRpc || !email) && cliente !== supabase) {
      if (esDni) ({ data: email, error: eRpc } = await supabase.rpc('fn_email_por_dni', { p_dni: usuario }));
      if (!email) ({ data: email, error: eRpc } = await supabase.rpc('fn_email_por_codigo', { p_codigo: usuario }));
    }
  } catch (ex) {
    console.error('[login-usuario] RPC error:', ex.message);
    return res.status(503).json({ success:false, code:'SUPABASE_OFFLINE',
      message:'No se pudo consultar Supabase. Revisa SUPABASE_URL y las llaves en backend/.env, y que las funciones fn_email_por_dni/fn_email_por_codigo existan (corre el SQL).' });
  }
  if (eRpc || !email) {
    registrarIntento(key, false);
    const raw = (eRpc?.message || '').toLowerCase();
    if (raw.includes('fetch failed') || raw.includes('network') || raw.includes('enotfound'))
      return res.status(503).json({ success:false, code:'SUPABASE_OFFLINE', message:'No se pudo conectar con Supabase. Revisa backend/.env.' });
    if (raw.includes('function') && raw.includes('does not exist'))
      return res.status(500).json({ success:false, message:'Faltan funciones en la base. Corre el SQL (06_usuarios_demo o todo_en_uno) en Supabase.' });
    return res.status(401).json({ success:false, message:'Usuario no encontrado.' });
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    registrarIntento(key, false);
    const raw = (error.message || '').toLowerCase();
    if (raw.includes('fetch failed') || raw.includes('network') || raw.includes('enotfound'))
      return res.status(503).json({ success:false, code:'SUPABASE_OFFLINE', message:'No se pudo conectar con Supabase. Revisa backend/.env.' });
    return res.status(401).json({ success:false, message:'Contraseña incorrecta.' });
  }
  registrarIntento(key, true);

  const { data:perfil } = await supabase
    .from('perfiles').select('nombre,apellido,rol,dni,telefono,bloqueado')
    .eq('id', data.user.id).single();
  if (perfil?.bloqueado)
    return res.status(403).json({ success:false, message:'Cuenta suspendida. Contacta soporte.' });

  await supabase.from('perfiles')
    .update({ ultimo_acceso: new Date().toISOString() }).eq('id', data.user.id);
  await audit(data.user.id, 'LOGIN', `Usuario:${usuario} · Rol:${perfil?.rol || 'cliente'}`);

  return res.json({
    success:true,
    token:         data.session.access_token,
    refresh_token: data.session.refresh_token,
    user: {
      id: data.user.id, email: data.user.email,
      nombre:   perfil?.nombre   ?? '',
      apellido: perfil?.apellido ?? '',
      rol:      perfil?.rol      ?? 'cliente',
      dni:      perfil?.dni      ?? null,
      telefono: perfil?.telefono ?? null,
    }
  });
});

export default router;
