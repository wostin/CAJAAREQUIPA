// Layout.jsx — v14: Sidebar premium con íconos SVG + Topbar refinado
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useState, useRef, useEffect } from 'react';
import Icon from './Icon';

const NAV_HB = [
  { section: 'Principal' },
  { to: '/homebanking',               icon: 'home',     label: 'Inicio'             },
  { to: '/homebanking/cuentas',       icon: 'card',     label: 'Mis Cuentas'        },
  { to: '/homebanking/transacciones', icon: 'list',     label: 'Movimientos'        },
  { to: '/homebanking/pagos',         icon: 'receipt',  label: 'Pagos de Servicios' },
  { section: 'Créditos' },
  { to: '/homebanking/prestamos',     icon: 'money',    label: 'Mis Préstamos'      },
  { section: 'Finanzas' },
  { to: '/homebanking/ahorro',        icon: 'trophy',   label: 'Cuenta de Ahorro'   },
];

const NAV_CORE = [
  { section: 'Core Financiero' },
  { to: '/core',                icon: 'chart',     label: 'Dashboard'       },
  { to: '/core/solicitudes',    icon: 'inbox',     label: 'Solicitudes'     },
  { to: '/core/scoring',        icon: 'star',      label: 'Scoring'         },
  { to: '/core/fichas',         icon: 'clipboard', label: 'Fichas de Campo' },
  { to: '/core/recuperaciones', icon: 'alert',     label: 'Recuperaciones'  },
  { section: 'Red y Cartera' },
  { to: '/core/agencias',       icon: 'building',  label: 'Agencias'        },
  { to: '/core/clientes',       icon: 'users',     label: 'Clientes'        },
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
  { label:'Inicio',             path:'/homebanking',               icon:'home',    desc:'Resumen de cuenta',          section:'Portal' },
  { label:'Mis Cuentas',        path:'/homebanking/cuentas',       icon:'card',    desc:'Cuentas y saldos',           section:'Portal' },
  { label:'Movimientos',        path:'/homebanking/transacciones', icon:'list',    desc:'Historial de transacciones', section:'Portal' },
  { label:'Pagos de Servicios', path:'/homebanking/pagos',         icon:'receipt', desc:'Agua, luz, internet',        section:'Portal' },
  { label:'Mis Préstamos',      path:'/homebanking/prestamos',     icon:'money',   desc:'Créditos activos',           section:'Portal' },
  { label:'Cuenta de Ahorro',   path:'/homebanking/ahorro',        icon:'trophy',  desc:'Meta de ahorro',             section:'Portal' },
];

const NOTIFS = [
  { id:1, tipo:'prestamo',    titulo:'Cuota próxima',                msg:'Cuota vence en 3 días — S/ 284.50',    urgente:true,  leida:false, hace:'2 min' },
  { id:2, tipo:'transaccion', titulo:'Abono recibido',               msg:'Abono de sueldo — S/ 3,200.00',        urgente:false, leida:false, hace:'1 h'  },
  { id:3, tipo:'seguridad',   titulo:'Acceso desde nuevo dispositivo', msg:'Acceso desde Huancayo — hoy 09:42',  urgente:false, leida:false, hace:'3 h'  },
  { id:4, tipo:'transaccion', titulo:'Pago procesado',               msg:'Pago de luz SEAL — S/ 142.50',         urgente:false, leida:true,  hace:'1 d'  },
  { id:5, tipo:'sistema',     titulo:'Estado de cuenta disponible',  msg:'Tu estado de cuenta de mayo está listo', urgente:false, leida:false, hace:'2 d' },
];

const NOTIF_META = {
  prestamo:    { color:'#FFB300', icon:'money'   },
  sistema:     { color:'#00A896', icon:'settings'},
  seguridad:   { color:'#DC2626', icon:'shield'  },
  transaccion: { color:'#7C3AED', icon:'transfer'},
  pago:        { color:'#0D2461', icon:'receipt' },
};
const NAVY = '#0D2461';
const TEAL = '#00A896';
const TEAL2 = '#00C9B1';

/* ─── Search Dropdown ─────────────────────── */
function SearchDropdown({ query, onSelect }) {
  const results = query.length >= 1
    ? SEARCH_INDEX.filter(r =>
        r.label.toLowerCase().includes(query.toLowerCase()) ||
        r.desc.toLowerCase().includes(query.toLowerCase()))
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
              style={{ width:'100%', display:'flex', alignItems:'center', gap:11, padding:'10px 14px', background:'none', border:'none', cursor:'pointer', textAlign:'left', transition:'.15s' }}
              onMouseEnter={e => e.currentTarget.style.background='#F0F4FF'}
              onMouseLeave={e => e.currentTarget.style.background='none'}>
              <div style={{ width:32, height:32, borderRadius:9, background:'#F0F4FF', display:'grid', placeItems:'center', flexShrink:0 }}>
                <Icon name={r.icon} size={17} color={TEAL}/>
              </div>
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
function NotifDropdown({ notifs, onMark, onMarkAll, onClose }) {
  const sinLeer = notifs.filter(n => !n.leida).length;
  return (
    <div style={{ position:'absolute', top:'calc(100% + 8px)', right:0, width:344, background:'#fff', borderRadius:14, boxShadow:'0 8px 40px rgba(13,36,97,.18)', border:'1px solid #E2E8F6', zIndex:200, overflow:'hidden' }}>
      <div style={{ padding:'14px 16px', borderBottom:'1px solid #EEF1F8', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontFamily:"'Sora',sans-serif", fontSize:13, fontWeight:700, color:NAVY }}>Notificaciones</span>
          {sinLeer > 0 && <span style={{ background:'#F97316', color:'#fff', fontSize:10, fontWeight:800, padding:'1px 7px', borderRadius:50 }}>{sinLeer}</span>}
        </div>
        <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#7B84A3', display:'grid', placeItems:'center', padding:2 }}>
          <Icon name="close" size={16} color="#7B84A3"/>
        </button>
      </div>
      <div style={{ maxHeight:340, overflowY:'auto' }}>
        {notifs.map(n => {
          const meta = NOTIF_META[n.tipo] || NOTIF_META.sistema;
          return (
            <div key={n.id} onClick={() => onMark(n.id)}
              style={{ padding:'12px 16px', borderBottom:'1px solid #F0F4FF', cursor:'pointer', background: n.leida ? '#fff' : '#F8FAFF', transition:'.15s', display:'flex', gap:12 }}
              onMouseEnter={e => e.currentTarget.style.background='#F0F4FF'}
              onMouseLeave={e => e.currentTarget.style.background=n.leida?'#fff':'#F8FAFF'}>
              <div style={{ width:36, height:36, borderRadius:10, background:`${meta.color}18`, display:'grid', placeItems:'center', flexShrink:0 }}>
                <Icon name={meta.icon} size={18} color={meta.color}/>
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
          );
        })}
      </div>
      <div style={{ padding:'10px 16px', background:'#F8FAFF', borderTop:'1px solid #EEF1F8', textAlign:'center' }}>
        <button onClick={onMarkAll} style={{ fontSize:12, color:TEAL, fontWeight:700, background:'none', border:'none', cursor:'pointer' }}>
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
      width: 252, background: 'linear-gradient(180deg,#0D2461 0%,#0a1d50 100%)',
      display: 'flex', flexDirection: 'column',
      flexShrink: 0, overflowY: 'auto',
      boxShadow: '2px 0 16px rgba(13,36,97,.2)',
    }}>
      {/* Brand */}
      <div style={{ padding:'22px 18px 16px', borderBottom:'1px solid rgba(255,255,255,.07)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
          <div style={{
            width:44, height:44, borderRadius:13,
            background:`linear-gradient(135deg, ${TEAL2}, ${TEAL})`,
            display:'grid', placeItems:'center',
            boxShadow:'0 4px 16px rgba(0,200,177,.35)', flexShrink:0,
          }}>
            <Icon name="bank" size={24} color="#fff"/>
          </div>
          <div>
            <div style={{ fontFamily:"'Sora',sans-serif", fontSize:15, fontWeight:800, color:'#fff', letterSpacing:'-.01em', lineHeight:1.1 }}>Caja Arequipa</div>
            <div style={{ fontSize:9, color:TEAL2, fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', marginTop:3, display:'flex', alignItems:'center', gap:4 }}>
              <Icon name="lock" size={10} color={TEAL2}/> Banca por Internet
            </div>
          </div>
        </div>
        {!isCore && (
          <a href="http://localhost:5173" title="Solo personal del banco" style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:5, fontSize:10, color:'rgba(255,255,255,.35)', textDecoration:'none', marginTop:2 }}>
            ¿Eres del personal? Ir al Core <Icon name="arrowRight" size={11} color="rgba(255,255,255,.35)"/>
          </a>
        )}
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
                display:'flex', alignItems:'center', gap:11, padding:'10px 12px',
                borderRadius:11, cursor:'pointer', transition:'.15s',
                color: isActive ? '#fff' : 'rgba(255,255,255,.6)',
                background: isActive ? 'rgba(0,200,177,.16)' : 'transparent',
                fontSize:'13px', fontWeight: isActive ? 700 : 500,
                textDecoration:'none', marginBottom:2, position:'relative',
                borderLeft: isActive ? `3px solid ${TEAL2}` : '3px solid transparent',
              })}>
              {({ isActive }) => (<>
                <Icon name={item.icon} size={18} color={isActive ? TEAL2 : 'rgba(255,255,255,.6)'}/>
                <span style={{ flex:1 }}>{item.label}</span>
                {item.badge && (
                  <span style={{ background:'#F97316', color:'#fff', fontSize:9, fontWeight:800, padding:'2px 7px', borderRadius:50, minWidth:18, textAlign:'center' }}>
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
            style={{ background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)', cursor:'pointer', padding:'7px', borderRadius:8, transition:'.2s', display:'grid', placeItems:'center' }}
            onMouseEnter={e => { e.currentTarget.style.background='rgba(220,38,38,.25)'; e.currentTarget.style.borderColor='rgba(220,38,38,.4)'; }}
            onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,.06)'; e.currentTarget.style.borderColor='rgba(255,255,255,.1)'; }}>
            <Icon name="power" size={15} color="rgba(255,255,255,.6)"/>
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
        <div style={{ height:4, background:'linear-gradient(90deg,#00C9B1,#00A896 50%,#0D2461)', flexShrink:0 }}/>
        <div style={{
          background:'#fff', padding:'0 24px', height:60,
          display:'flex', alignItems:'center', justifyContent:'space-between',
          borderBottom:'1px solid #E2E8F6', flexShrink:0,
          boxShadow:'0 1px 8px rgba(13,36,97,.06)',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:3, height:22, borderRadius:2, background:`linear-gradient(${TEAL2}, ${TEAL})` }}/>
            <div style={{ fontFamily:"'Sora',sans-serif", fontSize:16, fontWeight:700, color:NAVY }}>{title}</div>
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {/* Buscador */}
            <div ref={searchRef} style={{ position:'relative' }}>
              <div style={{
                display:'flex', alignItems:'center', gap:8,
                background:'#F0F4FF', border:`1.5px solid ${searchOpen ? TEAL : '#E2E8F6'}`,
                borderRadius:10, padding:'8px 14px', width:220, transition:'.2s',
                boxShadow: searchOpen ? '0 0 0 3px rgba(0,168,150,.1)' : 'none',
              }}>
                <Icon name="search" size={15} color="#7B84A3"/>
                <input
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true); }}
                  onFocus={() => setSearchOpen(true)}
                  placeholder="Buscar módulo..."
                  style={{ border:'none', background:'none', outline:'none', fontSize:13, color:NAVY, width:'100%', fontFamily:"'DM Sans',sans-serif" }}
                />
                {searchQuery && (
                  <button onClick={() => { setSearchQuery(''); setSearchOpen(false); }}
                    style={{ background:'none', border:'none', cursor:'pointer', padding:0, display:'grid', placeItems:'center' }}>
                    <Icon name="close" size={14} color="#7B84A3"/>
                  </button>
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
                  display:'grid', placeItems:'center',
                  cursor:'pointer', position:'relative', transition:'.15s',
                }}>
                <Icon name="bell" size={18} color={notifOpen ? TEAL : '#374060'}/>
                {sinLeer > 0 && (
                  <span style={{ position:'absolute', top:7, right:7, width:8, height:8, background:'#F97316', borderRadius:'50%', border:'1.5px solid #fff' }}/>
                )}
              </button>
              {notifOpen && (
                <NotifDropdown
                  notifs={notifs}
                  onMark={id => setNotifs(prev => prev.map(n => n.id === id ? { ...n, leida:true } : n))}
                  onMarkAll={() => setNotifs(prev => prev.map(n => ({ ...n, leida:true })))}
                  onClose={() => setNotifOpen(false)}
                />
              )}
            </div>

            {/* Reloj */}
            <div style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 12px', background:'#F0F4FF', borderRadius:8, border:'1px solid #E2E8F6' }}>
              <Icon name="clock" size={13} color="#7B84A3"/>
              <span style={{ fontSize:11, color:'#7B84A3', fontWeight:500 }}>
                {new Date().toLocaleTimeString('es-PE', { hour:'2-digit', minute:'2-digit' })}
              </span>
            </div>
          </div>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:22 }}>
          <Outlet/>
        </div>
      </div>
    </div>
  );
}
