// src/api/axios.js — v7: sin bucle en refresh, con rate-limit y timeouts
import axios from 'axios';
import { supabase } from './supabase.js';

// ── Cliente base ──────────────────────────────────────
const api = axios.create({
  baseURL: '',           // proxy Vite: /api → localhost:3000
  timeout: 8000,         // 8 s máximo por petición (falla rápido si algo no responde)
  headers: { 'Content-Type': 'application/json' },
});

// ── Cache del token para no llamar getSession() en cada request ──
let cachedToken     = null;
let tokenExpiresAt  = 0;           // timestamp ms

async function getToken() {
  const now = Date.now();
  if (cachedToken && tokenExpiresAt > now + 30_000) {  // 30 s de margen
    return cachedToken;
  }
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      cachedToken    = session.access_token;
      // JWT exp está en segundos → convertir a ms
      const payload  = JSON.parse(atob(session.access_token.split('.')[1]));
      tokenExpiresAt = (payload.exp ?? 0) * 1000;
    } else {
      cachedToken    = null;
      tokenExpiresAt = 0;
    }
  } catch {
    cachedToken    = null;
    tokenExpiresAt = 0;
  }
  return cachedToken;
}

// Limpiar cache cuando Supabase renueva el token
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
    cachedToken    = session?.access_token ?? null;
    if (session?.access_token) {
      try {
        const payload  = JSON.parse(atob(session.access_token.split('.')[1]));
        tokenExpiresAt = (payload.exp ?? 0) * 1000;
      } catch { tokenExpiresAt = Date.now() + 3600_000; }
    }
  }
  if (event === 'SIGNED_OUT') {
    cachedToken    = null;
    tokenExpiresAt = 0;
  }
});

// ── Interceptor REQUEST: adjuntar JWT ─────────────────
api.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
}, (error) => Promise.reject(error));

// ── Interceptor RESPONSE: refresh en 401 (una sola vez) ──
let isRefreshing    = false;
let refreshQueue    = [];   // peticiones en cola esperando el refresh

function processQueue(error, token = null) {
  refreshQueue.forEach(({ resolve, reject }) => {
    error ? reject(error) : resolve(token);
  });
  refreshQueue = [];
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalReq = error.config;

    // Rutas que NUNCA deben triggear refresh
    const skipRefresh = ['/auth/login', '/auth/login-tarjeta', '/auth/register', '/auth/refresh', '/auth/logout'].some(
      r => originalReq?.url?.includes(r)
    );

    if (error.response?.status === 401 && !skipRefresh && !originalReq._retried) {
      originalReq._retried = true;  // ← marca para no reintentar infinitamente

      if (isRefreshing) {
        // Otro refresh ya está en curso → encolar esta petición
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject });
        }).then(token => {
          originalReq.headers.Authorization = `Bearer ${token}`;
          return api(originalReq);
        });
      }

      isRefreshing = true;
      try {
        const { data: { session } } = await supabase.auth.refreshSession();
        if (session?.access_token) {
          cachedToken    = session.access_token;
          tokenExpiresAt = Date.now() + 3600_000;
          processQueue(null, session.access_token);
          originalReq.headers.Authorization = `Bearer ${session.access_token}`;
          return api(originalReq);
        }
      } catch (refreshError) {
        processQueue(refreshError, null);
        // Sesión inválida: limpiar SOLO localmente (sin llamada de red que da 403)
        try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* noop */ }
        // Refresh falló → solo redirigir si no estamos ya en /login
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
