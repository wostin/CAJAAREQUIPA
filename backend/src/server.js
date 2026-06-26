// server.js — v9: dotenv cargado PRIMERO (fix ESM hoisting)
// ⚠️ En ESM todos los `import` son hoisted. 
//    `import 'dotenv/config'` DEBE ser la primera línea.
import 'dotenv/config';                     // ← carga .env antes de todo

import express   from 'express';
import cors      from 'cors';

import authRoutes          from './routes/auth.js';
import cuentasRoutes       from './routes/cuentas.js';
import transaccionesRoutes from './routes/transacciones.js';
import pagosRoutes         from './routes/pagos.js';
import prestamosRoutes     from './routes/prestamos.js';
import dashboardRoutes     from './routes/dashboard.js';
import scoringRoutes       from './routes/scoring.js';
import agenciasRoutes      from './routes/agencias.js';
import recuperacionesRoutes from './routes/recuperaciones.js';
import { supabase }         from './supabase.js';

const app  = express();
const PORT = parseInt(process.env.PORT || '3000');

// ── CORS ──────────────────────────────────────────────
const allowed = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:4173',
  'http://localhost:4174',
];
app.use(cors({
  origin: (origin, cb) =>
    (!origin || allowed.includes(origin)) ? cb(null, true) : cb(new Error('CORS bloqueado')),
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));
app.use(express.json({ limit: '1mb' }));

// ── Rate limiting (sin dependencias externas) ──────────
const rateStore = new Map();
function rateLimit(maxReqs, windowMs) {
  return (req, res, next) => {
    const ip  = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const rec = rateStore.get(ip) || { count: 0, resetAt: now + windowMs };
    if (now > rec.resetAt) { rec.count = 0; rec.resetAt = now + windowMs; }
    rec.count++;
    rateStore.set(ip, rec);
    res.setHeader('X-RateLimit-Limit',     maxReqs);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxReqs - rec.count));
    if (rec.count > maxReqs) {
      return res.status(429).json({
        success: false,
        message: `Demasiadas solicitudes. Intenta en ${Math.ceil((rec.resetAt - now) / 1000)}s`,
        code: 'RATE_LIMITED',
      });
    }
    next();
  };
}
setInterval(() => {
  const now = Date.now();
  rateStore.forEach((v, k) => { if (now > v.resetAt) rateStore.delete(k); });
}, 5 * 60_000);

// ── Headers de seguridad ──────────────────────────────
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options',        'DENY');
  res.setHeader('X-XSS-Protection',       '1; mode=block');
  res.setHeader('Referrer-Policy',        'strict-origin-when-cross-origin');
  next();
});

// ── Logger (solo dev) ────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.use((req, _res, next) => {
    console.log(`${new Date().toISOString().slice(11,19)} ${req.method.padEnd(6)} ${req.path}`);
    next();
  });
}

// ── Rutas con rate limiting ───────────────────────────
app.use('/api/auth',          rateLimit(20,  60_000), authRoutes);
app.use('/api/cuentas',       rateLimit(60,  60_000), cuentasRoutes);
app.use('/api/transacciones', rateLimit(60,  60_000), transaccionesRoutes);
app.use('/api/pagos',         rateLimit(30,  60_000), pagosRoutes);
app.use('/api/prestamos',     rateLimit(30,  60_000), prestamosRoutes);
app.use('/api/dashboard',     rateLimit(120, 60_000), dashboardRoutes);
app.use('/api/scoring',       rateLimit(40,  60_000), scoringRoutes);
app.use('/api/agencias',      rateLimit(60,  60_000), agenciasRoutes);
app.use('/api/recuperaciones',rateLimit(60,  60_000), recuperacionesRoutes);

// ── Health + diagnóstico de Supabase ──────────────────
async function healthHandler(_req, res) {
  const out = {
    status: 'ok', app: 'CMAC Arequipa API', version: 'v12-flujo-completo',
    rutas: ['login-usuario','prestamos GET/POST/estado/desembolsar','transacciones GET/POST','dashboard/resumen','dashboard/cliente'],
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development', uptime: Math.round(process.uptime()) + 's',
    supabase_url: (process.env.SUPABASE_URL || '').trim() || '❌ falta SUPABASE_URL',
  };
  try {
    const { error } = await supabase.from('agencias').select('id', { head: true, count: 'exact' });
    out.supabase = error ? ('⚠️ ' + error.message) : '✅ conectado';
  } catch (e) {
    out.supabase = '❌ sin conexión: ' + (e.cause?.code || e.message);
    out.status = 'degraded';
  }
  res.json(out);
}
app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// ── 404 ───────────────────────────────────────────────
app.use((req, res) =>
  res.status(404).json({ success: false, message: `${req.method} ${req.path} no encontrada` })
);

// ── Error global ──────────────────────────────────────
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  console.error('[ERROR]', err.message);
  res.status(status).json({
    success: false,
    message: process.env.NODE_ENV === 'production' && status === 500
      ? 'Error interno' : err.message,
  });
});

// ── Arrancar ──────────────────────────────────────────
app.listen(PORT, () => {
  const sb = process.env.SUPABASE_URL;
  console.log(`\n🏦  CMAC Arequipa API v9  →  http://localhost:${PORT}`);
  console.log(`📋  Health:   http://localhost:${PORT}/health`);
  console.log(`🔑  Supabase: ${sb ? `✅  ${sb.replace('https://','').split('.')[0]}` : '❌  SUPABASE_URL no configurado'}`);
  console.log(`🔒  Rate limiting + headers de seguridad activos\n`);
});
