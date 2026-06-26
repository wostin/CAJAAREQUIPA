// src/App.jsx — v8: redirección de cliente al portal correcto (sin quedar atrapado)
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Icon from './components/Icon';
import BackendBanner from './components/BackendBanner';
import { AuthProvider, useAuth } from './context/AuthContext';
import { supabaseConfigured, supabaseErrors } from './api/supabase';

import Login     from './pages/Login';

import CoreDashboard from './pages/core/Dashboard';
import CoreScoring   from './pages/core/Scoring';
import CoreSolicitudes from './pages/core/Solicitudes';
import CoreFichas    from './pages/core/Fichas';
import CoreRecuperaciones from './pages/core/Recuperaciones';
import CoreAgencias  from './pages/core/Agencias';
import CoreClientes  from './pages/core/Clientes';

import Layout from './components/Layout';

// URL del portal del cliente (otra app)
const HOMEBANKING_URL = 'http://localhost:5174';

// Roles que SÍ pueden usar el Core
const ROLES_CORE = ['asesor','administrador','jefe_regional','riesgos','comite','analista','admin','gerente'];

// ── Spinner centralizado ────────────────────────────────
const Spinner = ({ msg = 'Cargando...' }) => (
  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#F4F6FB' }}>
    <div style={{ textAlign:'center' }}>
      <div style={{ width:44, height:44, border:'3px solid #DDE2F0', borderTopColor:'#00A896',
        borderRadius:'50%', animation:'spin 0.7s linear infinite', margin:'0 auto 12px' }}/>
      <div style={{ fontFamily:"'Sora',sans-serif", fontSize:13, color:'#7B84A3' }}>{msg}</div>
    </div>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>
);

// ── Pantalla de error de configuración ─────────────────
const ConfigError = () => (
  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#F4F6FB', fontFamily:"'DM Sans',sans-serif" }}>
    <div style={{ maxWidth:480, background:'#fff', borderRadius:20, padding:36, boxShadow:'0 4px 24px rgba(0,0,0,.08)', textAlign:'center' }}>
      <div style={{ display:'grid', placeItems:'center', marginBottom:16 }}><div className='spinner' style={{ width:36, height:36 }}/></div>
      <h2 style={{ fontFamily:"'Sora',sans-serif", color:'#0D2461', marginBottom:12 }}>Configura tu .env</h2>
      <p style={{ color:'#7B84A3', fontSize:13, marginBottom:16 }}>
        Crea el archivo <code style={{ background:'#F4F6FB', padding:'2px 6px', borderRadius:4 }}>frontend/.env</code> con tus credenciales de Supabase:
      </p>
      <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:10, padding:16, textAlign:'left', marginBottom:16 }}>
        <code style={{ fontSize:12, color:'#065F46', display:'block', lineHeight:1.8 }}>
          VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co<br/>
          VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1...<br/>
          VITE_API_URL=http://localhost:3000
        </code>
      </div>
      {supabaseErrors.map((e, i) => (
        <div key={i} style={{ background:'#FEE2E2', border:'1px solid #FECACA', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#DC2626', marginBottom:6, textAlign:'left' }}>
          <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Icon name='alert' size={15} color='#DC2626'/> {e}</span>
        </div>
      ))}
      <p style={{ fontSize:12, color:'#7B84A3', marginTop:16 }}>
        Obtén tus claves en <strong>supabase.com → Project Settings → API</strong>
      </p>
      <button onClick={() => window.location.reload()}
        style={{ marginTop:16, background:'#00A896', color:'#fff', border:'none', padding:'10px 28px', borderRadius:10, cursor:'pointer', fontWeight:600, fontSize:14 }}>
        Reintentar conexión
      </button>
    </div>
  </div>
);

// ── Redirección externa (a otra app) ───────────────────
// Como el Homebanking es otra app (otro puerto), no se navega con el router:
// se cambia la URL del navegador.
function RedirectExterno({ url, msg }) {
  if (typeof window !== 'undefined') window.location.href = url;
  return <Spinner msg={msg || 'Redirigiendo...'} />;
}

// ── Ruta protegida ─────────────────────────────────────
function ProtectedRoute({ children, requireCore = false }) {
  const { user, perfil, loading } = useAuth();

  if (loading) return <Spinner msg="Verificando sesión..." />;
  if (!user)   return <Navigate to="/login" replace />;

  // Si requireCore y aún no cargó el perfil → esperar (no redirigir)
  if (requireCore && perfil === null) return <Spinner msg="Cargando perfil..." />;

  // Perfil cargado pero es CLIENTE → mandarlo a SU portal (otra app), no a una ruta interna
  if (requireCore && !ROLES_CORE.includes(perfil?.rol)) {
    return <RedirectExterno url={HOMEBANKING_URL} msg="Eres cliente, te llevamos a tu portal..." />;
  }

  return children;
}

// ── Redirección raíz ───────────────────────────────────
function RootRedirect() {
  const { user, perfil, loading, authError } = useAuth();

  if (loading) return <Spinner msg="Iniciando CMAC Arequipa..." />;

  if (authError && !user) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#F4F6FB', fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ maxWidth:460, background:'#fff', borderRadius:20, padding:32, boxShadow:'0 4px 24px rgba(0,0,0,.08)', textAlign:'center' }}>
        <div style={{ display:'grid', placeItems:'center', marginBottom:16 }}><Icon name='alert' size={46} color='#DC2626'/></div>
        <h2 style={{ fontFamily:"'Sora',sans-serif", color:'#DC2626', marginBottom:8 }}>Error de conexión</h2>
        <p style={{ color:'#7B84A3', fontSize:13, marginBottom:12 }}>
          No se pudo conectar a Supabase. Revisa tu <strong>frontend/.env</strong>
        </p>
        <code style={{ background:'#FEE2E2', padding:'10px 14px', borderRadius:8, fontSize:11, display:'block', wordBreak:'break-all', color:'#DC2626', textAlign:'left', marginBottom:16 }}>
          {authError}
        </code>
        <button onClick={() => window.location.reload()}
          style={{ background:'#00A896', color:'#fff', border:'none', padding:'10px 24px', borderRadius:10, cursor:'pointer', fontWeight:600 }}>
          Reintentar
        </button>
      </div>
    </div>
  );

  if (!user) return <Navigate to="/login" replace />;

  // Personal del Core → dashboard del Core
  if (perfil && ROLES_CORE.includes(perfil.rol)) {
    return <Navigate to="/core" replace />;
  }
  // Cliente → su portal (otra app)
  if (perfil) {
    return <RedirectExterno url={HOMEBANKING_URL} msg="Eres cliente, te llevamos a tu portal..." />;
  }
  // Perfil aún sin cargar → esperar
  return <Spinner msg="Cargando perfil..." />;
}

// ── App ────────────────────────────────────────────────
export default function App() {
  if (!supabaseConfigured) return <ConfigError />;

  return (
    <AuthProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <BackendBanner />
        <Routes>
          <Route path="/"         element={<RootRedirect />} />
          <Route path="/login"    element={<LoginGuard />} />

          {/* Si alguien pide /homebanking en el Core, lo mandamos a la app del cliente */}
          <Route path="/homebanking/*" element={<RedirectExterno url={HOMEBANKING_URL} msg="Te llevamos al portal del cliente..." />} />

          <Route path="/core" element={
            <ProtectedRoute requireCore><Layout mode="core" /></ProtectedRoute>
          }>
            <Route index             element={<CoreDashboard />} />
            <Route path="solicitudes" element={<CoreSolicitudes />} />
            <Route path="scoring"    element={<CoreScoring />} />
            <Route path="fichas"     element={<CoreFichas />} />
            <Route path="recuperaciones" element={<CoreRecuperaciones />} />
            <Route path="agencias"   element={<CoreAgencias />} />
            <Route path="clientes"   element={<CoreClientes />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

// ── Guard: si ya está logueado no volver al login ──────
function LoginGuard() {
  const { user, perfil, loading } = useAuth();
  if (loading) return <Spinner msg="Verificando sesión..." />;
  if (user) {
    if (perfil && ROLES_CORE.includes(perfil.rol)) {
      return <Navigate to="/core" replace />;
    }
    if (perfil) {
      return <RedirectExterno url={HOMEBANKING_URL} msg="Eres cliente, te llevamos a tu portal..." />;
    }
    return <Spinner msg="Cargando perfil..." />;
  }
  return <Login />;
}