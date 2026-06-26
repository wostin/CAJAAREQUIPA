// Layout.jsx — v10: Sidebar premium + Topbar mejorado
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import Icon from './Icon';
import { useAuth } from '../context/AuthContext';
import { useState, useRef, useEffect } from 'react';

const NAV_HB = [
  { section: 'Principal' },
  { to: '/homebanking',                icon: 'home', label: 'Inicio'             },
  { to: '/homebanking/cuentas',        icon: 'card', label: 'Mis Cuentas'        },
  { to: '/homebanking/transacciones',  icon: 'list', label: 'Movimientos', badge: '12' },
  { to: '/homebanking/pagos',          icon: 'receipt', label: 'Pagos de Servicios' },
  { section: 'Créditos' },
  { to: '/homebanking/prestamos',      icon: 'money', label: 'Mis Préstamos'      },
  { section: 'Finanzas' },
  { to: '/homebanking/ahorro',         icon: 'trophy', label: 'Cuenta de Ahorro'   },
];

const NAV_CORE = [
  { section: 'Principal' },
  { to: '/core',            icon: 'chart', label: 'Dashboard'       },
  { section: 'Otorgamiento de Créditos' },
  { to: '/core/solicitudes', icon: 'inbox', label: 'Bandeja de solicitudes' },
  { to: '/core/solicitudes?fase=pre',      icon: '①', label: 'Pre-solicitud' },
  { to: '/core/solicitudes?fase=registro', icon: '②', label: 'Registro de solicitud' },
  { to: '/core/solicitudes?fase=comite',   icon: '③', label: 'Propuesta y comité' },
  { to: '/core/solicitudes?fase=desembolso', icon: '④', label: 'Aprobación y desembolso' },
  { to: '/core/scoring',    icon: 'star', label: 'Scoring'         },
  { to: '/core/fichas',     icon: 'list', label: 'Fichas de Campo' },
  { section: 'Recuperaciones' },
  { to: '/core/recuperaciones', icon: '⑤', label: 'Bandeja de mora' },
  { section: 'Red y Cartera' },
  { to: '/core/agencias',   icon: 'building', label: 'Agencias'        },
  { to: '/core/clientes',   icon: 'users', label: 'Clientes'        },
];

const PAGE_TITLES = {
  '/homebanking':               'Inicio',
  '/homebanking/cuentas':       'Mis Cuentas',
  '/homebanking/transacciones': 'Movimientos',
  '/homebanking/pagos':         'Pagos de Servicios',
  '/homebanking/prestamos':     'Mis Préstamos',
  '/homebanking/ahorro':        'Cuenta de Ahorro',
  '/core':                      'Dashboard Gerencial',
  '/core/solicitudes':          'Solicitudes de Crédito',
  '/core/scoring':              'Scoring Transaccional',
  '/core/fichas':               'Fichas de Campo',
  '/core/agencias':             'Red de Agencias',
  '/core/clientes':             'Cartera de Clientes',
};

const SEARCH_INDEX = [
  { label:'Dashboard Gerencial',   path:'/core',             icon:'chart', desc:'KPIs, cartera, desembolsos',            section:'Core' },
  { label:'Scoring',               path:'/core/scoring',     icon:'star', desc:'Evaluación de clientes',                section:'Core' },
  { label:'Fichas de Campo',       path:'/core/fichas',      icon:'list', desc:'Evaluaciones de asesores',              section:'Core' },
  { label:'Recuperaciones / Mora', path:'/core/recuperaciones', icon:'alert', desc:'Bandas, gestiones, judicial/castigo', section:'Core' },
  { label:'Red de Agencias',       path:'/core/agencias',    icon:'building', desc:'Agencias y asesores',                   section:'Core' },
  { label:'Cartera de Clientes',   path:'/core/clientes',    icon:'users', desc:'Gestión de créditos',                   section:'Core' },
  { label:'Inicio',                path:'/homebanking',      icon:'home', desc:'Resumen de cuenta',                     section:'Portal' },
  { label:'Mis Cuentas',           path:'/homebanking/cuentas',        icon:'card', desc:'Cuentas y saldos',            section:'Portal' },
  { label:'Movimientos',           path:'/homebanking/transacciones',  icon:'list', desc:'Historial de transacciones',  section:'Portal' },
  { label:'Pagos de Servicios',    path:'/homebanking/pagos',          icon:'receipt', desc:'Agua, luz, internet',         section:'Portal' },
  { label:'Mis Préstamos',         path:'/homebanking/prestamos',      icon:'money', desc:'Créditos activos',            section:'Portal' },
  { label:'Cuenta de Ahorro',      path:'/homebanking/ahorro',         icon:'trophy', desc:'Meta de ahorro',              section:'Portal' },
];

const NOTIFS = [
  { id:1, tipo:'prestamo',    titulo:'Cuota próxima',               msg:'Cuota vence en 3 días — S/ 284.50',             urgente:true,  leida:false, hace:'2 min' },
  { id:2, tipo:'sistema',     titulo:'Nuevo cliente asignado',      msg:'Carlos Mamani asignado a tu cartera',           urgente:false, leida:false, hace:'1 h'  },
  { id:3, tipo:'seguridad',   titulo:'Acceso desde nuevo dispositivo', msg:'Acceso desde Huancayo — hoy 09:42',          urgente:false, leida:false, hace:'3 h'  },
  { id:4, tipo:'transaccion', titulo:'Desembolso procesado',        msg:'S/ 4,500 — crédito CTR-2026-0481',              urgente:false, leida:true,  hace:'1 d'  },
  { id:5, tipo:'prestamo',    titulo:'Mora crítica detectada',      msg:'Pedro Huanca — 75 días atraso',                 urgente:true,  leida:false, hace:'2 d'  },
];

const NOTIF_COLORS = { prestamo:'#FFB300', sistema:'#00A896', seguridad:'#DC2626', transaccion:'#7C3AED', pago:'#0D2461' };
const NOTIF_ICONS  = { prestamo:'money', sistema:'settings', seguridad:'lock', transaccion:'inbox', pago:'receipt' };
const NAVY = '#0D2461';
const TEAL = '#00A896';
const TEAL2 = '#00C9B1';

/* ─── Search Dropdown ─────────────────────── */
function SearchDropdown({ query, onSelect }) {
  const results = query.length >= 1
    ? SEARCH_INDEX.filter(r =>
        r.label.toLowerCase().includes(query.toLowerCase()) ||
        r.desc.toLowerCase().includes(query.toLowerCase())
      )
    : SEARCH_INDEX.slice(0, 6);

  if (!results.length) return (
    <div style={dropStyle}>
      <div style={{ padding:20, textAlign:'center', fontSize:12, color:'#7B84A3' }}>Sin resultados para "{query}"</div>
    </div>
  );

  const bySec = {};
  results.forEach(r => { if (!bySec[r.section]) bySec[r.section] = []; bySec[r.section].push(r); });

  return (
    <div style={dropStyle}>
      {Object.entries(bySec).map(([sec, items]) => (
        <div key={sec}>
          <div style={{ padding:'8px 14px 4px', fontSize:10, fontWeight:700, color:'#7B84A3', textTransform:'uppercase', letterSpacing:'.08em', background:'#F8FAFF' }}>{sec}</div>
          {items.map(r => (
            <button key={r.path} onClick={() => onSelect(r.path)}
              style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'none', border:'none', cursor:'pointer', textAlign:'left', transition:'.15s' }}
              onMouseEnter={e => e.currentTarget.style.background='#F0F4FF'}
              onMouseLeave={e => e.currentTarget.style.background='none'}>
              <span style={{ width:22, display:'grid', placeItems:'center' }}><Icon name={r.icon} size={18} color={NAVY}/></span>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:NAVY }}>{r.label}</div>
                <div style={{ fontSize:11, color:'#7B84A3' }}>{r.desc}</div>
              </div>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

const dropStyle = {
  position:'absolute', top:'calc(100% + 8px)', left:0, right:0,
  background:'#fff', borderRadius:12, boxShadow:'0 8px 32px rgba(13,36,97,.16)',
  border:'1px solid #E2E8F6', zIndex:200, overflow:'hidden',
};

/* ─── Notif Dropdown ──────────────────────── */
function NotifDropdown({ notifs, onMark, onClose }) {
  const sinLeer = notifs.filter(n => !n.leida).length;
  return (
    <div style={{ position:'absolute', top:'calc(100% + 8px)', right:0, width:340, background:'#fff', borderRadius:14, boxShadow:'0 8px 40px rgba(13,36,97,.18)', border:'1px solid #E2E8F6', zIndex:200, overflow:'hidden' }}>
      <div style={{ padding:'14px 16px', borderBottom:'1px solid #EEF1F8', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontFamily:"'Sora',sans-serif", fontSize:13, fontWeight:700, color:NAVY }}>Notificaciones</span>
          {sinLeer > 0 && <span style={{ background:'#F97316', color:'#fff', fontSize:10, fontWeight:800, padding:'1px 7px', borderRadius:50 }}>{sinLeer}</span>}
        </div>
        <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#7B84A3', fontSize:18, lineHeight:1, padding:2 }}>×</button>
      </div>
      <div style={{ maxHeight:340, overflowY:'auto' }}>
        {notifs.map(n => (
          <div key={n.id} onClick={() => onMark(n.id)}
            style={{ padding:'12px 16px', borderBottom:'1px solid #F0F4FF', cursor:'pointer', background: n.leida ? '#fff' : '#F8FAFF', transition:'.15s', display:'flex', gap:12 }}
            onMouseEnter={e => e.currentTarget.style.background='#F0F4FF'}
            onMouseLeave={e => e.currentTarget.style.background=n.leida?'#fff':'#F8FAFF'}>
            <div style={{ width:36, height:36, borderRadius:10, background:`${NOTIF_COLORS[n.tipo]}18`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>
              <Icon name={NOTIF_ICONS[n.tipo]} size={17} color={NOTIF_COLORS[n.tipo]}/>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                <div style={{ fontSize:12, fontWeight:700, color: n.leida ? '#374060' : NAVY }}>{n.titulo}</div>
                {n.urgente && !n.leida && <span style={{ fontSize:9, fontWeight:800, color:'#fff', background:'#F97316', padding:'1px 6px', borderRadius:50, whiteSpace:'nowrap' }}>URGENTE</span>}
              </div>
              <div style={{ fontSize:11, color:'#7B84A3', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{n.msg}</div>
              <div style={{ fontSize:10, color:'#A0A8C0', marginTop:3 }}>{n.hace}</div>
            </div>
            {!n.leida && <div style={{ width:7, height:7, borderRadius:'50%', background:TEAL, flexShrink:0, marginTop:6 }}/>}
          </div>
        ))}
      </div>
      <div style={{ padding:'10px 16px', background:'#F8FAFF', borderTop:'1px solid #EEF1F8', textAlign:'center' }}>
        <button style={{ fontSize:12, color:TEAL, fontWeight:700, background:'none', border:'none', cursor:'pointer' }}>
          Marcar todas como leídas
        </button>
      </div>
    </div>
  );
}

/* ─── Sidebar ─────────────────────────────── */
function Sidebar({ mode, perfil, onLogout }) {
  const isCore = mode === 'core';
  const items  = isCore ? NAV_CORE : NAV_HB;
  const rolColor = { asesor: TEAL, gerente: '#7C3AED', admin: '#F97316', cliente: '#1A3A8F' };
  const color = rolColor[perfil?.rol] || TEAL;

  return (
    <aside style={{
      width: 252, background: 'linear-gradient(180deg,#0a1838,#0d2461)',
      display: 'flex', flexDirection: 'column',
      flexShrink: 0, overflowY: 'auto',
      boxShadow: '2px 0 16px rgba(13,36,97,.2)',
    }}>
      {/* Brand */}
      <div style={{ padding:'22px 18px 16px', borderBottom:'1px solid rgba(255,255,255,.07)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
          <div style={{
            width:44, height:44, borderRadius:14,
            background:`linear-gradient(135deg, ${TEAL2}, ${TEAL})`,
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:22, boxShadow:'0 4px 16px rgba(0,200,177,.35)', flexShrink:0,
          }}><Icon name='bank' size={22} color='#fff'/></div>
          <div>
            <div style={{ fontFamily:"'Sora',sans-serif", fontSize:15, fontWeight:800, color:'#fff', letterSpacing:'-.01em', lineHeight:1.1 }}>Caja Arequipa</div>
            <div style={{ fontSize:9, color:TEAL2, fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', marginTop:2 }}>
              Core Financiero
            </div>
            <div style={{ fontSize:8.5, letterSpacing:1, fontWeight:800, color:'#16b8c6', marginTop:2 }}>CONSOLA DEL PERSONAL · v13</div>
          </div>
        </div>

        {/* Acceso al portal del cliente (otra app) — discreto */}
        <a href="http://localhost:5174" title="Portal del cliente" style={{ display:'block', textAlign:'center', fontSize:10, color:'rgba(255,255,255,.35)', textDecoration:'none', marginTop:2 }}>
          Ver Homebanking del cliente →
        </a>
      </div>

      {/* Nav */}
      <nav style={{ padding:'8px 10px', flex:1 }}>
        {items.map((item, i) => {
          if (item.section) return (
            <div key={i} style={{ fontSize:9, textTransform:'uppercase', letterSpacing:'.12em', color:'rgba(255,255,255,.28)', fontWeight:700, padding:'16px 10px 5px' }}>
              {item.section}
            </div>
          );
          return (
            <NavLink key={item.to} to={item.to} end={item.to === '/homebanking' || item.to === '/core'}
              style={({ isActive }) => ({
                display:'flex', alignItems:'center', gap:10, padding:'9px 12px',
                borderRadius:11, cursor:'pointer', transition:'.15s',
                color: isActive ? '#fff' : 'rgba(255,255,255,.55)',
                background: isActive ? 'rgba(0,200,177,.18)' : 'transparent',
                fontSize:'13px', fontWeight: isActive ? 700 : 500,
                textDecoration:'none', marginBottom:2, position:'relative',
                borderLeft: isActive ? `3px solid ${TEAL2}` : '3px solid transparent',
              })}>
              {({ isActive }) => (<>
                <span style={{ fontSize:16, width:20, textAlign:'center', flexShrink:0,
                  ...(['①','②','③','④','⑤'].includes(item.icon) ? {
                    fontSize:13, fontWeight:800, color: isActive ? TEAL2 : 'rgba(255,255,255,.4)',
                  } : {}) }}>{['①','②','③','④','⑤'].includes(item.icon) ? item.icon : <Icon name={item.icon} size={17} color={isActive ? '#fff' : 'rgba(255,255,255,.6)'}/>}</span>
                <span style={{ flex:1, ...(['①','②','③','④','⑤'].includes(item.icon) ? { fontSize:12 } : {}) }}>{item.label}</span>
                {item.badge && (
                  <span style={{ background:'#F97316', color:'#fff', fontSize:9, fontWeight:800, padding:'2px 7px', borderRadius:50, minWidth:18, textAlign:'center', boxShadow:'0 2px 6px rgba(249,115,22,.4)' }}>
                    {item.badge}
                  </span>
                )}
              </>)}
            </NavLink>
          );
        })}
      </nav>

      {/* Usuario */}
      <div style={{ padding:'14px 12px', borderTop:'1px solid rgba(255,255,255,.07)', background:'rgba(0,0,0,.15)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{
            width:36, height:36, background:`linear-gradient(135deg, ${color}, ${color}99)`,
            borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:14, fontWeight:800, color:'#fff', fontFamily:"'Sora',sans-serif",
            flexShrink:0, boxShadow:`0 2px 10px ${color}50`,
          }}>
            {(perfil?.nombre?.[0] || '?').toUpperCase()}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {perfil?.nombre} {perfil?.apellido}
            </div>
            <div style={{ fontSize:10, marginTop:2 }}>
              <span style={{ background:`${color}25`, color:TEAL2, padding:'1px 8px', borderRadius:50, fontWeight:700, fontSize:9, textTransform:'uppercase', letterSpacing:'.06em' }}>
                {perfil?.rol || 'cliente'}
              </span>
            </div>
          </div>
          <button onClick={onLogout} title="Cerrar sesión"
            style={{ background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)', color:'rgba(255,255,255,.5)', cursor:'pointer', fontSize:14, padding:'6px 8px', borderRadius:8, transition:'.2s', lineHeight:1 }}
            onMouseEnter={e => { e.currentTarget.style.color='#fff'; e.currentTarget.style.background='rgba(220,38,38,.25)'; e.currentTarget.style.borderColor='rgba(220,38,38,.4)'; }}
            onMouseLeave={e => { e.currentTarget.style.color='rgba(255,255,255,.5)'; e.currentTarget.style.background='rgba(255,255,255,.06)'; e.currentTarget.style.borderColor='rgba(255,255,255,.1)'; }}>
            ⏻
          </button>
        </div>
      </div>
    </aside>
  );
}

/* ─── Layout principal ────────────────────── */
export default function Layout({ mode = 'homebanking' }) {
  const { perfil, logout } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const title     = PAGE_TITLES[location.pathname] || (mode === 'core' ? 'Core Financiero' : 'Mi Banco');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen,  setSearchOpen]  = useState(false);
  const [notifOpen,   setNotifOpen]   = useState(false);
  const [notifs,      setNotifs]      = useState(NOTIFS);
  const searchRef = useRef(null);
  const notifRef  = useRef(null);
  const sinLeer   = notifs.filter(n => !n.leida).length;

  useEffect(() => {
    function handleClick(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false);
      if (notifRef.current  && !notifRef.current.contains(e.target))  setNotifOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSearchSelect = (path) => { navigate(path); setSearchOpen(false); setSearchQuery(''); };
  const handleLogout = async () => { await logout(); navigate('/login'); };

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:'#F0F4FF' }}>
      <Sidebar mode={mode} perfil={perfil} onLogout={handleLogout}/>

      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        {/* Franja institucional del Core (identidad de consola operativa) */}
        <div style={{ height:4, background:'linear-gradient(90deg,#B3261E,#0d2461 60%,#0fa0ad)', flexShrink:0 }}/>
        {/* Topbar */}
        <div style={{
          background:'#fff', padding:'0 24px', height:60,
          display:'flex', alignItems:'center', justifyContent:'space-between',
          borderBottom:'1px solid #E2E8F6', flexShrink:0,
          boxShadow:'0 1px 8px rgba(13,36,97,.06)',
        }}>
          {/* Título */}
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:3, height:22, borderRadius:2, background:`linear-gradient(${TEAL2}, ${TEAL})` }}/>
            <div style={{ fontFamily:"'Sora',sans-serif", fontSize:16, fontWeight:700, color:NAVY }}>{title}</div>
            <span style={{ fontSize:9, fontWeight:800, letterSpacing:1, color:'#B3261E', border:'1px solid #f0c9c5', borderRadius:6, padding:'2px 7px', marginLeft:4 }}>CORE · OPERADOR</span>
          </div>

          {/* Acciones */}
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {/* Buscador */}
            <div ref={searchRef} style={{ position:'relative' }}>
              <div style={{
                display:'flex', alignItems:'center', gap:8,
                background:'#F0F4FF', border:`1.5px solid ${searchOpen ? TEAL : '#E2E8F6'}`,
                borderRadius:10, padding:'8px 14px', width:220, transition:'.2s',
                boxShadow: searchOpen ? '0 0 0 3px rgba(0,168,150,.1)' : 'none',
              }}>
                <Icon name='search' size={15} color='#7B84A3'/>
                <input
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true); }}
                  onFocus={() => setSearchOpen(true)}
                  placeholder="Buscar módulo..."
                  style={{ border:'none', background:'none', outline:'none', fontSize:13, color:NAVY, width:'100%', fontFamily:"'DM Sans',sans-serif" }}
                />
                {searchQuery && (
                  <button onClick={() => { setSearchQuery(''); setSearchOpen(false); }}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'#7B84A3', fontSize:16, padding:0, lineHeight:1 }}>×</button>
                )}
              </div>
              {searchOpen && <SearchDropdown query={searchQuery} onSelect={handleSearchSelect}/>}
            </div>

            {/* Notificaciones */}
            <div ref={notifRef} style={{ position:'relative' }}>
              <button onClick={() => setNotifOpen(!notifOpen)}
                style={{
                  width:38, height:38, borderRadius:10,
                  background: notifOpen ? '#F0F4FF' : '#F8FAFF',
                  border:`1.5px solid ${notifOpen ? TEAL : '#E2E8F6'}`,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  cursor:'pointer', fontSize:16, position:'relative', transition:'.15s',
                }}>
                <Icon name='bell' size={17} color={notifOpen ? TEAL : '#7B84A3'}/>
                {sinLeer > 0 && (
                  <span style={{ position:'absolute', top:8, right:8, width:8, height:8, background:'#F97316', borderRadius:'50%', border:'1.5px solid #fff', boxShadow:'0 0 0 1px #F97316' }}/>
                )}
              </button>
              {notifOpen && (
                <NotifDropdown
                  notifs={notifs}
                  onMark={id => setNotifs(prev => prev.map(n => n.id === id ? { ...n, leida:true } : n))}
                  onClose={() => setNotifOpen(false)}
                />
              )}
            </div>

            {/* Último acceso */}
            <div style={{ display:'flex', align:'center', gap:6, padding:'6px 12px', background:'#F0F4FF', borderRadius:8, border:'1px solid #E2E8F6' }}>
              <Icon name='clock' size={13} color='#7B84A3'/>
              <span style={{ fontSize:11, color:'#7B84A3', fontWeight:500 }}>
                {new Date().toLocaleTimeString('es-PE', { hour:'2-digit', minute:'2-digit' })}
              </span>
            </div>

            {/* Avatar de usuario */}
            <div style={{ display:'flex', alignItems:'center', gap:9, paddingLeft:12, borderLeft:'1px solid #E2E8F6' }}>
              <div style={{
                width:36, height:36, borderRadius:'50%',
                background:`linear-gradient(135deg, ${NAVY}, #1A3A8F)`,
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:13, fontWeight:800, color:'#fff', fontFamily:"'Sora',sans-serif",
                flexShrink:0, boxShadow:'0 2px 8px rgba(13,36,97,.25)',
              }}>
                {((perfil?.nombre?.[0] || '') + (perfil?.apellido?.[0] || '')).toUpperCase() || 'U'}
              </div>
              <div style={{ lineHeight:1.2 }}>
                <div style={{ fontSize:12.5, fontWeight:700, color:NAVY, whiteSpace:'nowrap' }}>
                  {perfil?.nombre || 'Usuario'} {perfil?.apellido || ''}
                </div>
                <div style={{ fontSize:10, color:'#7B84A3', textTransform:'capitalize' }}>
                  {perfil?.rol || 'cliente'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Contenido */}
        <div style={{ flex:1, overflowY:'auto', padding:22 }}>
          <Outlet/>
        </div>
      </div>
    </div>
  );
}