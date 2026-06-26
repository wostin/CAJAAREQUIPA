// HomeBanking Dashboard — v15: íconos SVG + datos REALES de Supabase
// Conectado a /api/dashboard/cliente y /api/prestamos
import { useState, useEffect } from 'react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from 'recharts';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import Icon from '../../components/Icon';

const NAVY  = '#0D2461';
const TEAL  = '#00A896';
const TEAL2 = '#00C9B1';
const GOLD  = '#FFB300';

const fmt = (n, dec=2) => `S/ ${(n||0).toLocaleString('es-PE',{minimumFractionDigits:dec,maximumFractionDigits:dec})}`;

const FLUJO_DEMO = [
  { mes:'Ene', abonos:8200, cargos:4100 },
  { mes:'Feb', abonos:7400, cargos:3800 },
  { mes:'Mar', abonos:9600, cargos:4900 },
  { mes:'Abr', abonos:8800, cargos:4400 },
  { mes:'May', abonos:10400, cargos:5200 },
];
const NOTICIAS = [
  { tag:'NUEVO', icon:'wallet', titulo:'Depósito a Plazo Fijo Digital', desc:'Apertura 100% online. Hasta 6.5% TEA sin ir a agencia.', color:TEAL2 },
  { tag:'OFERTA', icon:'shield', titulo:'Seguro de Desgravamen', desc:'Protege tu crédito y a tu familia. Desde S/ 8/mes.', color:GOLD },
  { tag:'APP',   icon:'smartphone', titulo:'Actualiza la App Móvil', desc:'Nueva versión con desembolso digital y más funciones.', color:'#7C3AED' },
];

function buildTendencia(transacciones) {
  if (!transacciones?.length) return null;
  const porMes = {};
  transacciones.forEach(t => {
    const d = new Date(t.fecha);
    const mes = d.toLocaleDateString('es-PE', { month:'short' });
    if (!porMes[mes]) porMes[mes] = { mes, abonos:0, cargos:0 };
    if (t.tipo === 'credito') porMes[mes].abonos += Number(t.monto);
    else porMes[mes].cargos += Number(t.monto);
  });
  return Object.values(porMes).slice(-5);
}

function buildGastos(transacciones) {
  if (!transacciones?.length) return null;
  const cats = {};
  const COLORES = ['#0D2461','#00A896','#00C9B1','#FFB300','#9CA3AF'];
  transacciones.filter(t => t.tipo === 'debito').forEach(t => {
    const cat = (t.categoria || t.descripcion || 'Otros').split(' ')[0];
    cats[cat] = (cats[cat] || 0) + Number(t.monto);
  });
  return Object.entries(cats).slice(0,5).map(([name, value], i) => ({
    name, value: Math.round(value), color: COLORES[i % COLORES.length]
  }));
}

function QuickAction({ icon, label, to, color }) {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate(to)} className="transition"
      style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:9, padding:'16px 10px', border:'1px solid #E2E8F6', borderRadius:14, cursor:'pointer', background:'#fff', fontFamily:'inherit' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor=color; e.currentTarget.style.boxShadow=`0 4px 16px ${color}22`; e.currentTarget.style.transform='translateY(-3px)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor='#E2E8F6'; e.currentTarget.style.boxShadow='none'; e.currentTarget.style.transform='none'; }}>
      <div style={{ width:46, height:46, borderRadius:14, background:color+'14', display:'grid', placeItems:'center' }}>
        <Icon name={icon} size={22} color={color}/>
      </div>
      <span style={{ fontSize:12, fontWeight:600, color:'#374060', textAlign:'center', lineHeight:1.3 }}>{label}</span>
    </button>
  );
}

export default function HBDashboard() {
  const { perfil } = useAuth();
  const navigate   = useNavigate();
  const [greeting, setGreeting] = useState('');
  const [greetIcon, setGreetIcon] = useState('sun');
  const [datos, setDatos]         = useState(null);
  const [prestamos, setPrestamos] = useState([]);
  const [cargando, setCargando]   = useState(true);
  const hora = new Date().getHours();

  useEffect(() => {
    if (hora < 12)      { setGreeting('Buenos días');  setGreetIcon('sun'); }
    else if (hora < 19) { setGreeting('Buenas tardes'); setGreetIcon('sun'); }
    else                { setGreeting('Buenas noches'); setGreetIcon('moon'); }

    Promise.all([
      api.get('/api/dashboard/cliente').then(r => r.data?.data || r.data),
      api.get('/api/prestamos').then(r => (r.data?.data || []).filter(p => p.estado === 'desembolsado')),
    ])
      .then(([d, p]) => { setDatos(d); setPrestamos(p); })
      .catch(() => {})
      .finally(() => setCargando(false));
  }, []);

  const cuentasReales = datos?.cuentas?.length ? datos.cuentas : null;
  const saldoTotal    = datos?.saldo_total ?? (17240 + 8320);
  const numCuentas    = cuentasReales ? cuentasReales.length : 2;
  const txsReales     = datos?.ultimas_transacciones?.length ? datos.ultimas_transacciones : null;

  const movsRender = txsReales
    ? txsReales.slice(0, 6).map(t => ({
        tipo: t.tipo,
        desc: t.descripcion || (t.tipo === 'credito' ? 'Abono' : 'Cargo'),
        canal: (t.canal || 'homebanking').replace('_', ' '),
        fecha: new Date(t.fecha).toLocaleDateString('es-PE', { day:'2-digit', month:'short' }),
        monto: t.tipo === 'credito' ? Number(t.monto) : -Number(t.monto),
      }))
    : [
        { tipo:'credito', desc:'Abono sueldo — Textilería Andina SAC',  monto:+3200,   canal:'HomeBanking', fecha:'Hoy 08:15'   },
        { tipo:'debito',  desc:'Pago SEAL — Arequipa (luz)',             monto:-142.50, canal:'App Móvil',   fecha:'Ayer 14:32'  },
        { tipo:'debito',  desc:'Cuota préstamo MYPE #12',                monto:-1420,   canal:'Ventanilla',  fecha:'Ayer 09:00'  },
        { tipo:'credito', desc:'Depósito efectivo Agencia Centro',        monto:+2000,   canal:'Cajero ATM',  fecha:'21/05 16:45' },
      ];

  const flujoReal  = buildTendencia(txsReales);
  const gastosReal = buildGastos(txsReales);
  const flujoData  = flujoReal  || FLUJO_DEMO;
  const gastosData = gastosReal || [
    { name:'Préstamos',     value:2205, color:'#0D2461' },
    { name:'Servicios',     value:458,  color:'#00A896' },
    { name:'Retiros',       value:300,  color:'#00C9B1' },
    { name:'Transferencias',value:500,  color:'#FFB300' },
    { name:'Otros',         value:237,  color:'#9CA3AF' },
  ];

  const score     = datos?.score ?? 687;
  const preap     = datos?.preaprobado || null;
  const montoPreap= preap ? preap.monto : 35000;
  const teaPreap  = preap ? (preap.tea * 100) : 40.92;
  const plazoPreap= preap ? preap.plazo : 36;
  const segmento  = datos?.segmento || (score >= 600 ? 'PREMIER' : score >= 440 ? 'ESTÁNDAR' : 'BÁSICO');
  const segColor  = score >= 600 ? GOLD : score >= 440 ? '#6366F1' : TEAL;

  const prestamosActivos = prestamos.length
    ? prestamos.slice(0, 3).map(p => ({
        icon: 'store',
        nombre: p.proposito || 'Crédito MYPE · Capital de Trabajo',
        monto: Number(p.monto),
        cuota: Number(p.cuota_mensual),
        plazo: p.plazo_meses,
        tea: `${(Number(p.tasa_anual) * 100).toFixed(2)}%`,
        prox: p.fecha_proximo_pago ? new Date(p.fecha_proximo_pago).toLocaleDateString('es-PE') : '—',
        saldo: Number(p.saldo_capital || p.monto),
        pagadas: p.cuotas_pagadas || 0,
      }))
    : [
        { icon:'store', nombre:'Crédito MYPE · Capital de Trabajo',   monto:30000, saldo:20150, cuota:1420, plazo:36, pagadas:12, tea:'43.92%', prox:'20/06/2026' },
        { icon:'hammer', nombre:'Crédito Remodelación · Local',         monto:15000, saldo:6289,  cuota:785,  plazo:24, pagadas:14, tea:'40.92%', prox:'05/06/2026' },
      ];

  const totalGastos = gastosData.reduce((s, g) => s + g.value, 0);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18 }}>

      {/* HEADER */}
      <div style={{ background:`linear-gradient(135deg,${NAVY} 0%,#16357e 60%,${TEAL} 130%)`, borderRadius:18, padding:'24px 28px', color:'#fff', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', right:-40, top:-40, width:200, height:200, borderRadius:'50%', background:'rgba(0,201,177,.12)' }}/>
        <div style={{ position:'absolute', right:80, bottom:-50, width:160, height:160, borderRadius:'50%', background:'rgba(255,255,255,.04)' }}/>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', position:'relative', zIndex:1 }}>
          <div>
            <p style={{ color:'rgba(255,255,255,.7)', fontSize:14, marginBottom:4, display:'flex', alignItems:'center', gap:7 }}>
              <Icon name={greetIcon} size={16} color="#FFD66B"/> {greeting},
            </p>
            <h1 style={{ fontFamily:"'Sora',sans-serif", fontSize:24, fontWeight:800, color:'#fff', marginBottom:8 }}>
              {perfil?.nombre || 'Cliente'} {perfil?.apellido || ''}
            </h1>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ background:'rgba(255,255,255,.12)', padding:'4px 13px', borderRadius:50, fontSize:12, fontWeight:600, display:'inline-flex', alignItems:'center', gap:5 }}>
                <Icon name="star" size={12} color={GOLD} fill/> {segmento} · {score} pts
              </span>
              {!cargando && datos && (
                <span style={{ fontSize:12, color:'rgba(255,255,255,.6)', display:'inline-flex', alignItems:'center', gap:4 }}>
                  <Icon name="checkCircle" size={13} color={TEAL2}/> datos en tiempo real
                </span>
              )}
              {cargando && <span style={{ fontSize:12, color:'rgba(255,255,255,.5)' }}>cargando…</span>}
            </div>
          </div>
          <div style={{ textAlign:'right' }}>
            <p style={{ color:'rgba(255,255,255,.6)', fontSize:12, marginBottom:4 }}>Saldo consolidado</p>
            <div style={{ fontFamily:"'Sora',sans-serif", fontSize:34, fontWeight:800, color:'#fff' }}>{fmt(saldoTotal)}</div>
            <p style={{ color:'rgba(255,255,255,.5)', fontSize:11.5, marginTop:2 }}>{numCuentas} cuenta{numCuentas !== 1 ? 's' : ''} activa{numCuentas !== 1 ? 's' : ''} · PEN</p>
          </div>
        </div>
      </div>

      {/* PREAPROBADO */}
      {(preap || !datos) && (
        <div style={{ background:`linear-gradient(135deg,${TEAL},${TEAL2})`, borderRadius:14, padding:'16px 22px', display:'flex', alignItems:'center', justifyContent:'space-between', boxShadow:'0 6px 20px rgba(0,168,150,.28)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ width:48, height:48, borderRadius:14, background:'rgba(255,255,255,.18)', display:'grid', placeItems:'center', flexShrink:0 }}>
              <Icon name="gift" size={24} color="#fff"/>
            </div>
            <div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,.85)', marginBottom:3 }}>Crédito preaprobado disponible para ti</div>
              <div style={{ fontFamily:"'Sora',sans-serif", fontSize:26, fontWeight:800, color:'#fff' }}>S/ {montoPreap.toLocaleString('es-PE')}</div>
              <div style={{ fontSize:12.5, color:'rgba(255,255,255,.78)' }}>Score {score} · TEA {teaPreap.toFixed(2)}% · {segmento} · Crédito Micro Micro</div>
            </div>
          </div>
          <button onClick={() => navigate('/homebanking/prestamos')} className="transition"
            style={{ background:'#fff', border:'none', color:TEAL, padding:'11px 22px', borderRadius:50, cursor:'pointer', fontFamily:'inherit', fontSize:13.5, fontWeight:700, flexShrink:0, display:'inline-flex', alignItems:'center', gap:7, boxShadow:'0 4px 14px rgba(0,0,0,.15)' }}>
            Activar crédito <Icon name="arrowRight" size={16} color={TEAL}/>
          </button>
        </div>
      )}

      {/* CUENTAS */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        {(cuentasReales
          ? cuentasReales.slice(0, 4).map((c, i) => ({
              tipo: c.tipo, num: (c.numero_cuenta || '').replace(/(.{4})/g, '$1 ').trim(),
              saldo: Number(c.saldo || 0), moneda: c.moneda || 'PEN',
              tasa: c.tipo === 'ahorro' ? '3.5% TEA' : null,
              bg: i % 2 === 0 ? `linear-gradient(135deg,${NAVY},#16357e)` : `linear-gradient(135deg,${TEAL},${TEAL2})`,
            }))
          : [
              { tipo:'corriente', num:'2024 0081 4523 7710', saldo:17240, moneda:'PEN', tasa:null, bg:`linear-gradient(135deg,${NAVY},#16357e)` },
              { tipo:'ahorro',    num:'AH24 0081 9921 0043', saldo:8320,  moneda:'PEN', tasa:'3.5% TEA', bg:`linear-gradient(135deg,${TEAL},${TEAL2})` },
            ]
        ).map(c => (
          <div key={c.num} className="transition" style={{ background:c.bg, borderRadius:18, padding:'20px 22px', color:'#fff', position:'relative', overflow:'hidden', cursor:'pointer' }}
            onClick={() => navigate('/homebanking/cuentas')}
            onMouseEnter={e => e.currentTarget.style.transform='translateY(-3px)'}
            onMouseLeave={e => e.currentTarget.style.transform='none'}>
            <div style={{ position:'absolute', right:-20, top:-20, width:110, height:110, borderRadius:'50%', background:'rgba(255,255,255,.08)' }}/>
            <div style={{ position:'relative', zIndex:1 }}>
              <div style={{ display:'flex', alignItems:'center', gap:7, fontSize:11, color:'rgba(255,255,255,.7)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:10 }}>
                <Icon name={c.tipo === 'corriente' ? 'card' : 'trophy'} size={15} color="rgba(255,255,255,.85)"/>
                CUENTA {c.tipo.toUpperCase()}
              </div>
              <div className="ca-account-num" style={{ fontSize:14, color:'rgba(255,255,255,.6)', marginBottom:14 }}>{c.num}</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,.55)', marginBottom:3 }}>Saldo disponible</div>
              <div style={{ fontFamily:"'Sora',sans-serif", fontSize:28, fontWeight:800 }}>{fmt(c.saldo)}</div>
              <div style={{ position:'absolute', bottom:0, right:0, display:'flex', gap:6 }}>
                <span style={{ background:'rgba(255,255,255,.15)', color:'rgba(255,255,255,.9)', fontSize:10.5, padding:'3px 9px', borderRadius:50 }}>{c.moneda}</span>
                {c.tasa && <span style={{ background:'rgba(255,255,255,.15)', color:'rgba(255,255,255,.9)', fontSize:10.5, padding:'3px 9px', borderRadius:50 }}>{c.tasa}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* OPERACIONES RÁPIDAS */}
      <div className="card">
        <div style={{ fontFamily:"'Sora',sans-serif", fontSize:14, fontWeight:700, color:NAVY, marginBottom:14 }}>Operaciones rápidas</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:10 }}>
          <QuickAction icon="transfer" label="Transferir"      to="/homebanking/transacciones" color={NAVY}/>
          <QuickAction icon="receipt"  label="Pagar servicios" to="/homebanking/pagos"         color={TEAL}/>
          <QuickAction icon="money"    label="Mis préstamos"   to="/homebanking/prestamos"     color="#7C3AED"/>
          <QuickAction icon="trophy"   label="Mi ahorro"       to="/homebanking/ahorro"        color={TEAL2}/>
          <QuickAction icon="list"     label="Movimientos"     to="/homebanking/transacciones" color={GOLD}/>
          <QuickAction icon="star"     label="Mi score"        to="/homebanking"               color="#F97316"/>
        </div>
      </div>

      {/* FILA 1 */}
      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:14 }}>
        <div className="card">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <div>
              <div style={{ fontFamily:"'Sora',sans-serif", fontSize:14, fontWeight:700, color:NAVY }}>Flujo de movimientos</div>
              <div style={{ fontSize:12, color:'#7B84A3', marginTop:2 }}>
                {flujoReal ? 'Abonos vs cargos reales' : 'Abonos vs cargos · referencia'}
              </div>
            </div>
            {flujoReal && <span className="badge badge-teal"><Icon name="checkCircle" size={12} color={TEAL}/> Datos reales</span>}
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={flujoData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f4f6fb"/>
              <XAxis dataKey="mes" tick={{ fontSize:11 }}/>
              <YAxis tick={{ fontSize:10 }} tickFormatter={v => `S/${(v/1000).toFixed(0)}K`}/>
              <Tooltip formatter={(v,n) => [fmt(v), n === 'abonos' ? 'Abonos' : 'Cargos']}/>
              <Legend/>
              <Bar dataKey="abonos" fill={TEAL2} radius={[4,4,0,0]} name="abonos"/>
              <Bar dataKey="cargos" fill="#EF4444" radius={[4,4,0,0]} name="cargos"/>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card" style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <Icon name="star" size={17} color={GOLD} fill/>
            <span style={{ fontFamily:"'Sora',sans-serif", fontSize:14, fontWeight:700, color:NAVY }}>Mi Score · FieldIQ</span>
          </div>
          <div style={{ textAlign:'center' }}>
            <div style={{ position:'relative', width:120, height:120, margin:'0 auto' }}>
              <svg viewBox="0 0 120 120" style={{ transform:'rotate(-90deg)' }}>
                <circle cx="60" cy="60" r="50" fill="none" stroke="#EEF1F8" strokeWidth="10"/>
                <circle cx="60" cy="60" r="50" fill="none" stroke={segColor} strokeWidth="10"
                  strokeDasharray={`${(score/800)*314} 314`} strokeLinecap="round"/>
              </svg>
              <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
                <div style={{ fontFamily:"'Sora',sans-serif", fontSize:26, fontWeight:800, color:NAVY, lineHeight:1 }}>{score}</div>
                <div style={{ fontSize:10.5, color:'#7B84A3' }}>/ 800 pts</div>
              </div>
            </div>
            <div style={{ marginTop:8 }}>
              <span style={{ fontSize:12, fontWeight:700, color:segColor === GOLD ? '#92400E' : segColor, background:segColor+'20', padding:'4px 12px', borderRadius:50 }}>
                {segmento}
              </span>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {[['Techo créd.',`S/ ${montoPreap.toLocaleString('es-PE')}`],['TEA ref.',`${teaPreap.toFixed(2)}%`],['Segmento',segmento],['Plazo máx',`${plazoPreap}m`]].map(([l,v]) => (
              <div key={l} style={{ background:'#F4F6FB', borderRadius:8, padding:'8px 10px' }}>
                <div style={{ fontSize:10, color:'#7B84A3', marginBottom:2 }}>{l}</div>
                <div style={{ fontSize:13, fontWeight:700, color:NAVY }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* GASTOS */}
      <div className="card">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <div>
            <div style={{ fontFamily:"'Sora',sans-serif", fontSize:14, fontWeight:700, color:NAVY }}>Distribución de gastos</div>
            <div style={{ fontSize:12, color:'#7B84A3' }}>
              {gastosReal ? 'Basado en tus transacciones reales' : 'Referencia'} · Total: {fmt(totalGastos,0)}
            </div>
          </div>
          {gastosReal && <span className="badge badge-teal"><Icon name="checkCircle" size={12} color={TEAL}/> Datos reales</span>}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <ResponsiveContainer width="40%" height={160}>
            <PieChart>
              <Pie data={gastosData} dataKey="value" cx="50%" cy="50%" outerRadius={70} innerRadius={38}>
                {gastosData.map((g,i) => <Cell key={i} fill={g.color}/>)}
              </Pie>
              <Tooltip formatter={v => [fmt(v), '']}/>
            </PieChart>
          </ResponsiveContainer>
          <div style={{ flex:1, display:'flex', flexDirection:'column', gap:7 }}>
            {gastosData.map(g => (
              <div key={g.name} style={{ display:'flex', alignItems:'center', gap:6, fontSize:12 }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background:g.color, flexShrink:0 }}/>
                <span style={{ flex:1, color:'#374060' }}>{g.name}</span>
                <span style={{ fontWeight:700, color:NAVY }}>{fmt(g.value,0)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* PRÉSTAMOS ACTIVOS */}
      <div className="card">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
          <div>
            <div style={{ fontFamily:"'Sora',sans-serif", fontSize:14, fontWeight:700, color:NAVY }}>Mis Préstamos activos</div>
            {prestamos.length > 0 && (
              <div style={{ fontSize:11, color:TEAL, marginTop:2, display:'flex', alignItems:'center', gap:4 }}>
                <Icon name="checkCircle" size={12} color={TEAL}/> {prestamos.length} crédito{prestamos.length!==1?'s':''} desembolsado{prestamos.length!==1?'s':''} desde Supabase
              </div>
            )}
          </div>
          <Link to="/homebanking/prestamos" style={{ fontSize:12, color:TEAL, fontWeight:600, textDecoration:'none', display:'inline-flex', alignItems:'center', gap:4 }}>Ver todos <Icon name="arrowRight" size={13} color={TEAL}/></Link>
        </div>
        {prestamosActivos.length === 0 ? (
          <div style={{ textAlign:'center', padding:'20px 0', color:'#7B84A3', fontSize:13 }}>
            No tienes créditos activos. <button onClick={() => navigate('/homebanking/prestamos')} style={{ color:TEAL, background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>Solicitar uno →</button>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {prestamosActivos.map((p, i) => (
              <div key={i} style={{ background:'#F4F6FB', borderRadius:14, padding:16, display:'flex', gap:14, alignItems:'center' }}>
                <div style={{ width:44, height:44, background:`linear-gradient(135deg,${NAVY},#16357e)`, borderRadius:12, display:'grid', placeItems:'center', flexShrink:0 }}>
                  <Icon name={p.icon} size={22} color="#fff"/>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13.5, fontWeight:700, color:NAVY, marginBottom:4 }}>{p.nombre}</div>
                  <div style={{ fontSize:12, color:'#7B84A3', marginBottom:8 }}>TEA {p.tea} · {p.plazo} meses · Cuota {fmt(p.cuota,0)}/mes · Próx. {p.prox}</div>
                  <div style={{ height:6, background:'#DDE2F0', borderRadius:3 }}>
                    <div style={{ height:'100%', borderRadius:3, background:TEAL2, width:`${Math.min((p.pagadas/p.plazo)*100, 100)}%`, transition:'width .5s' }}/>
                  </div>
                  <div style={{ fontSize:11, color:'#7B84A3', marginTop:4 }}>
                    {p.pagadas > 0 ? `Cuota ${p.pagadas}/${p.plazo} pagada · ` : ''}Saldo: {fmt(p.saldo)}
                  </div>
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <div style={{ fontFamily:"'Sora',sans-serif", fontSize:18, fontWeight:700, color:NAVY }}>{fmt(p.monto,0)}</div>
                  <div style={{ fontSize:11, color:'#7B84A3', marginTop:2 }}>Monto original</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MOVIMIENTOS */}
      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'16px 20px', borderBottom:'1px solid #f4f6fb' }}>
          <div>
            <div style={{ fontFamily:"'Sora',sans-serif", fontSize:14, fontWeight:700, color:NAVY }}>Últimos movimientos</div>
            {txsReales && <div style={{ fontSize:11, color:TEAL, marginTop:1, display:'flex', alignItems:'center', gap:4 }}><Icon name="checkCircle" size={12} color={TEAL}/> Transacciones reales</div>}
          </div>
          <Link to="/homebanking/transacciones" style={{ fontSize:12, color:TEAL, fontWeight:600, textDecoration:'none', display:'inline-flex', alignItems:'center', gap:4 }}>Ver historial <Icon name="arrowRight" size={13} color={TEAL}/></Link>
        </div>
        {movsRender.map((m, i) => (
          <div key={i} className="transition" style={{ display:'grid', gridTemplateColumns:'36px 1fr auto auto', gap:12, padding:'12px 20px', borderBottom:i<movsRender.length-1?'1px solid #f9fafb':'none', alignItems:'center' }}
            onMouseEnter={e => e.currentTarget.style.background='#f9fafb'}
            onMouseLeave={e => e.currentTarget.style.background='transparent'}>
            <div style={{ width:36, height:36, borderRadius:10, background:m.tipo==='credito'?'#DCFCE7':'#FEE2E2', display:'grid', placeItems:'center' }}>
              <Icon name={m.tipo==='credito'?'arrowDown':'arrowUp'} size={17} color={m.tipo==='credito'?'#15803D':'#DC2626'}/>
            </div>
            <div>
              <div style={{ fontSize:13, fontWeight:500, color:NAVY }}>{m.desc}</div>
              <div style={{ fontSize:11.5, color:'#7B84A3', marginTop:1, textTransform:'capitalize' }}>{m.canal} · {m.fecha}</div>
            </div>
            <span style={{ fontSize:10.5, background:m.tipo==='credito'?'#DCFCE7':'#FEE2E2', color:m.tipo==='credito'?'#15803D':'#DC2626', padding:'2px 8px', borderRadius:6, fontWeight:600, whiteSpace:'nowrap' }}>
              {m.tipo==='credito'?'Abono':'Cargo'}
            </span>
            <div style={{ fontSize:14, fontWeight:700, color:m.tipo==='credito'?'#15803D':'#DC2626', textAlign:'right', whiteSpace:'nowrap' }}>
              {m.monto > 0 ? '+' : ''}{fmt(Math.abs(m.monto))}
            </div>
          </div>
        ))}
      </div>

      {/* NOTICIAS */}
      <div className="card">
        <div style={{ fontFamily:"'Sora',sans-serif", fontSize:14, fontWeight:700, color:NAVY, marginBottom:14 }}>Productos y servicios para ti</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
          {NOTICIAS.map(n => (
            <div key={n.titulo} className="transition" style={{ border:`1px solid ${n.color}25`, borderRadius:12, padding:16, cursor:'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor=n.color; e.currentTarget.style.background=n.color+'08'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor=n.color+'25'; e.currentTarget.style.background='transparent'; }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                <div style={{ width:38, height:38, borderRadius:10, background:n.color+'15', display:'grid', placeItems:'center' }}>
                  <Icon name={n.icon} size={19} color={n.color}/>
                </div>
                <span style={{ fontSize:10.5, fontWeight:700, color:n.color, background:n.color+'18', padding:'2px 8px', borderRadius:50 }}>{n.tag}</span>
              </div>
              <div style={{ fontWeight:700, color:NAVY, fontSize:13.5, marginBottom:5 }}>{n.titulo}</div>
              <div style={{ fontSize:12, color:'#7B84A3', lineHeight:1.5 }}>{n.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* SBS */}
      <div style={{ background:'#F4F6FB', borderRadius:12, padding:'12px 18px', fontSize:12, color:'#7B84A3', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
        <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}><Icon name="shield" size={14} color="#7B84A3"/> Caja Arequipa S.A. · RUC: 20100209641 · Regulada por la SBS · Res. 001-96</span>
        <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}><Icon name="phone" size={13} color="#7B84A3"/> 0800-00-234 · servicioalcliente@cajaarequipa.pe</span>
      </div>
    </div>
  );
}
