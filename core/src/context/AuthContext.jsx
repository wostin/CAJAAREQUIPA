// src/context/AuthContext.jsx — v7: sin bucles, con guards y restricciones
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../api/supabase';
import api from '../api/axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,      setUser]      = useState(null);
  const [perfil,    setPerfil]    = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [authError, setAuthError] = useState(null);

  // ── Guards anti-bucle ──────────────────────────────────
  const initDone      = useRef(false);   // init solo corre 1 vez
  const perfilLoading = useRef(false);   // evita llamadas simultáneas a /me
  const perfilCache   = useRef(null);    // cachea perfil para no llamar de nuevo

  // ── Carga perfil desde backend (con guard) ─────────────
  const loadPerfil = useCallback(async (userId) => {
    if (perfilLoading.current) return;        // ya está cargando → salir
    if (perfilCache.current?.id === userId) { // ya tenemos este perfil → usar cache
      setPerfil(perfilCache.current);
      return;
    }
    perfilLoading.current = true;
    try {
      const res = await api.get('/api/auth/me');
      if (res.data?.user) {
        perfilCache.current = res.data.user;
        setPerfil(res.data.user);
      }
    } catch {
      // Backend no disponible — la app sigue funcionando sin perfil
    } finally {
      perfilLoading.current = false;
    }
  }, []); // sin dependencias: función estable

  // ── Init único al montar ───────────────────────────────
  useEffect(() => {
    if (initDone.current) return;   // ← GUARD: previene doble-mount en StrictMode
    initDone.current = true;

    let subscription = null;

    const init = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error('[Auth] getSession:', error.message);
          setAuthError(error.message);
        }
        if (session?.user) {
          setUser(session.user);
          await loadPerfil(session.user.id);
        }
      } catch (err) {
        console.error('[Auth] init crash:', err.message);
        setAuthError(err.message);
      } finally {
        setLoading(false);
      }
    };

    init();

    // ── Listener de sesión ─────────────────────────────
    // IMPORTANTE: ignorar INITIAL_SESSION (ya lo manejó init())
    // Solo actuar en SIGNED_IN y SIGNED_OUT reales
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return;  // ← evita doble ejecución

      if (event === 'SIGNED_IN' && session?.user) {
        setUser(prev => {
          if (prev?.id === session.user.id) return prev;  // mismo usuario → no re-renderizar
          return session.user;
        });
        // Cargar perfil solo si cambió de usuario
        if (perfilCache.current?.id !== session.user.id) {
          loadPerfil(session.user.id);
        }
      }

      if (event === 'TOKEN_REFRESHED' && session?.user) {
        // Solo actualizar el objeto user, no recargar perfil
        setUser(session.user);
      }

      if (event === 'SIGNED_OUT') {
        setUser(null);
        setPerfil(null);
        perfilCache.current = null;
      }
    });

    subscription = data.subscription;
    return () => subscription?.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // ↑ Array vacío intencional: este efecto es exactamente como componentDidMount

  // ── Login ──────────────────────────────────────────────
  const login = async (email, password) => {
    const res = await api.post('/api/auth/login', { email, password });
    const { token, refresh_token, user: userData } = res.data;

    // Limpiar cache antes de nuevo login
    perfilCache.current = null;

    await supabase.auth.setSession({ access_token: token, refresh_token });
    const userObj = { id: userData.id, email: userData.email };
    setUser(userObj);
    perfilCache.current = userData;
    setPerfil(userData);
    return res.data;
  };

  // ── Login por tarjeta (estilo Caja Arequipa) ───────────
  const loginTarjeta = async (tarjeta, dni, clave) => {
    const res = await api.post('/api/auth/login-tarjeta', { tarjeta, dni, clave });
    const { token, refresh_token, user: userData } = res.data;
    perfilCache.current = null;
    await supabase.auth.setSession({ access_token: token, refresh_token });
    setUser({ id: userData.id, email: userData.email });
    perfilCache.current = userData;
    setPerfil(userData);
    return res.data;
  };

  // ── Login unificado por usuario (DNI personal / código cliente) ──
  const loginUsuario = async (usuario, password) => {
    const res = await api.post('/api/auth/login-usuario', { usuario, password });
    const { token, refresh_token, user: userData } = res.data;
    perfilCache.current = null;
    await supabase.auth.setSession({ access_token: token, refresh_token });
    setUser({ id: userData.id, email: userData.email });
    perfilCache.current = userData;
    setPerfil(userData);
    return res.data;
  };

  // ── Register ───────────────────────────────────────────
  const register = async (datos) => {
    const res = await api.post('/api/auth/register', datos);
    return res.data;
  };

  // ── Logout ─────────────────────────────────────────────
  const logout = async () => {
    try { await api.post('/api/auth/logout'); } catch { /* backend puede estar caído */ }
    perfilCache.current = null;
    try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* sesión ya inválida */ }
    setUser(null);
    setPerfil(null);
  };

  const isCore  = ['asesor','administrador','jefe_regional','riesgos','comite','analista','admin','gerente'].includes(perfil?.rol);
  const isAdmin = ['administrador','jefe_regional','comite','admin','gerente'].includes(perfil?.rol);

  return (
    <AuthContext.Provider value={{
      user, perfil, loading, authError,
      login, loginTarjeta, loginUsuario, register, logout,
      isCore, isAdmin,
      refreshPerfil: () => {
        perfilCache.current = null;
        if (user?.id) loadPerfil(user.id);
      },
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
};
