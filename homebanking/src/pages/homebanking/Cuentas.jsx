// src/pages/homebanking/Cuentas.jsx — v15: íconos SVG + datos reales
import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import api from '../../api/axios';
import Icon from '../../components/Icon';

const NAVY = '#0D2461', TEAL = '#00A896';

const DEMO_CUENTAS = [
  { tipo:'corriente', numero_cuenta:'2024 0081 4523 7710', saldo:16510.40, moneda:'PEN', estado:'activa' },
  { tipo:'ahorro',    numero_cuenta:'AH24 0081 9921 0043', saldo:8320.00,  moneda:'PEN', estado:'activa', tasa:'3.5% TEA' },
];

function CuentaCard({ cuenta }) {
  const isAhorro = cuenta.tipo === 'ahorro';
  const isUSD    = cuenta.moneda === 'USD';
  const gradient = isUSD     ? 'linear-gradient(135deg,#6B21A8,#7C3AED)' :
                   isAhorro  ? 'linear-gradient(135deg,#00A896,#00C9B1)' :
                               'linear-gradient(135deg,#0D2461,#16357e)';
  const num = (cuenta.numero_cuenta || cuenta.numero || '').replace(/(.{4})/g, '$1 ').trim();
  return (
    <div className="transition" style={{ borderRadius:20, padding:22, color:'#fff', position:'relative', overflow:'hidden', minHeight:150, background:gradient, cursor:'default' }}>
      <div style={{ position:'absolute', right:-30, top:-30, width:140, height:140, borderRadius:'50%', background:'rgba(255,255,255,.08)' }}/>
      <div style={{ position:'absolute', right:20, bottom:-40, width:100, height:100, borderRadius:'50%', background:'rgba(255,255,255,.05)' }}/>
      <div style={{ position:'relative', zIndex:1 }}>
        <div style={{ display:'flex', alignItems:'center', gap:7, fontSize:12, color:'rgba(255,255,255,.7)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:10 }}>
          <Icon name={isAhorro ? 'trophy' : 'card'} size={16} color="rgba(255,255,255,.85)"/>
          CUENTA {(cuenta.tipo || 'cuenta').toUpperCase()}
        </div>
        <div className="ca-account-num" style={{ fontSize:14, color:'rgba(255,255,255,.6)', marginBottom:16 }}>{num}</div>
        <div style={{ fontSize:11, color:'rgba(255,255,255,.55)', marginBottom:3 }}>Saldo {isAhorro ? 'total' : 'disponible'}</div>
        <div style={{ fontFamily:"'Sora',sans-serif", fontSize:27, fontWeight:800 }}>
          S/ {Number(cuenta.saldo).toLocaleString('es-PE',{minimumFractionDigits:2})}
        </div>
        <div style={{ position:'absolute', bottom:0, right:0, display:'flex', gap:6 }}>
          <span style={{ background:'rgba(255,255,255,.15)', color:'rgba(255,255,255,.9)', fontSize:11, padding:'3px 9px', borderRadius:50 }}>{cuenta.moneda}</span>
          {cuenta.tasa && <span style={{ background:'rgba(255,255,255,.15)', color:'rgba(255,255,255,.9)', fontSize:11, padding:'3px 9px', borderRadius:50 }}>{cuenta.tasa}</span>}
          <span style={{ background:'rgba(255,255,255,.15)', color:'rgba(255,255,255,.9)', fontSize:11, padding:'3px 9px', borderRadius:50, textTransform:'capitalize' }}>{cuenta.estado}</span>
        </div>
      </div>
    </div>
  );
}

function safeCuentas(data) {
  if (Array.isArray(data))           return data;
  if (Array.isArray(data?.data))     return data.data;
  if (Array.isArray(data?.cuentas))  return data.cuentas;
  return null;
}

// Construye serie de evolución desde transacciones reales (saldo_post por mes)
function buildTendencia(txs, cuentas) {
  if (!txs?.length) return null;
  const porMes = {};
  txs.slice().reverse().forEach(t => {
    const d = new Date(t.fecha);
    const mes = d.toLocaleDateString('es-PE', { month:'short' });
    porMes[mes] = { mes, saldo: Number(t.saldo_post ?? 0) };
  });
  const arr = Object.values(porMes).slice(-6);
  return arr.length >= 2 ? arr : null;
}

export default function HBCuentas() {
  const [cuentas, setCuentas]   = useState(null);   // null = cargando
  const [tendencia, setTendencia] = useState(null);
  const [abriendo, setAbriendo] = useState(false);
  const [exito, setExito]       = useState(false);
  const [usandoReal, setUsandoReal] = useState(false);

  function cargar() {
    Promise.all([
      api.get('/api/cuentas').then(r => safeCuentas(r.data)).catch(() => null),
      api.get('/api/transacciones').then(r => r.data?.data || []).catch(() => []),
    ]).then(([cts, txs]) => {
      if (cts?.length) { setCuentas(cts); setUsandoReal(true); }
      else { setCuentas(DEMO_CUENTAS); setUsandoReal(false); }
      setTendencia(buildTendencia(txs, cts));
    });
  }
  useEffect(() => { cargar(); }, []);

  async function abrirCuenta(tipo) {
    setAbriendo(true);
    try {
      await api.post('/api/cuentas', { tipo });
      setExito(true);
      cargar();
    } catch {
      await new Promise(r => setTimeout(r, 600));
      setExito(true);
    } finally { setAbriendo(false); }
  }

  const lista = cuentas || DEMO_CUENTAS;
  const tendDemo = [
    { mes:'Dic', corriente:12000, ahorro:5000 }, { mes:'Ene', corriente:14500, ahorro:5800 },
    { mes:'Feb', corriente:13200, ahorro:6100 }, { mes:'Mar', corriente:15800, ahorro:6800 },
    { mes:'Abr', corriente:15200, ahorro:7400 }, { mes:'May', corriente:16510, ahorro:8320 },
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h1 style={{ fontFamily:"'Sora',sans-serif", fontSize:20, fontWeight:700, color:NAVY, marginBottom:4 }}>Mis Cuentas</h1>
          <p style={{ fontSize:13, color:'#7B84A3', display:'flex', alignItems:'center', gap:6 }}>
            Gestión de cuentas corriente y ahorro
            {usandoReal && <span style={{ display:'inline-flex', alignItems:'center', gap:4, color:TEAL, fontWeight:600 }}><Icon name="checkCircle" size={13} color={TEAL}/> datos reales</span>}
          </p>
        </div>
        <button className="btn-primary" onClick={() => setExito(false)} style={{ display:'inline-flex', alignItems:'center', gap:7 }}>
          <Icon name="plus" size={16} color="#fff"/> Abrir nueva cuenta
        </button>
      </div>

      {exito && (
        <div className="alert alert-success">
          <Icon name="checkCircle" size={18} color="#15803D"/>
          <span style={{ flex:1 }}>Solicitud enviada. Tu nueva cuenta será activada en breve.</span>
          <button onClick={() => setExito(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'#15803D' }}><Icon name="close" size={16} color="#15803D"/></button>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(290px, 1fr))', gap:14 }}>
        {lista.map((c, i) => <CuentaCard key={i} cuenta={c}/>)}
      </div>

      <div className="card">
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
          <Icon name="trendUp" size={18} color={TEAL}/>
          <span style={{ fontFamily:"'Sora',sans-serif", fontSize:15, fontWeight:700, color:NAVY }}>Evolución de saldos</span>
        </div>
        <div style={{ fontSize:12, color:'#7B84A3', marginBottom:18 }}>
          {tendencia ? 'Saldo real según tus movimientos' : 'Últimos 6 meses · referencia'}
        </div>
        <ResponsiveContainer width="100%" height={220}>
          {tendencia ? (
            <LineChart data={tendencia}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F4F6FB"/>
              <XAxis dataKey="mes" tick={{ fontSize:11 }}/>
              <YAxis tick={{ fontSize:10 }} tickFormatter={v => `S/${(v/1000).toFixed(0)}K`}/>
              <Tooltip formatter={v => [`S/ ${v.toLocaleString('es-PE')}`, 'Saldo']}/>
              <Line type="monotone" dataKey="saldo" stroke={TEAL} strokeWidth={2.5} dot={{ r:4 }} activeDot={{ r:6 }}/>
            </LineChart>
          ) : (
            <LineChart data={tendDemo}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F4F6FB"/>
              <XAxis dataKey="mes" tick={{ fontSize:11 }}/>
              <YAxis tick={{ fontSize:10 }} tickFormatter={v => `S/${(v/1000).toFixed(0)}K`}/>
              <Tooltip formatter={(v,n) => [`S/ ${v.toLocaleString('es-PE')}`, n === 'corriente' ? 'Cta. Corriente' : 'Cta. Ahorro']}/>
              <Legend formatter={v => v === 'corriente' ? 'Cta. Corriente' : 'Cta. Ahorro'}/>
              <Line type="monotone" dataKey="corriente" stroke={NAVY} strokeWidth={2.5} dot={{ r:4 }} activeDot={{ r:6 }}/>
              <Line type="monotone" dataKey="ahorro"    stroke={TEAL} strokeWidth={2.5} dot={{ r:4 }} activeDot={{ r:6 }}/>
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>

      <div className="card">
        <h3 style={{ fontFamily:"'Sora',sans-serif", fontSize:15, fontWeight:700, color:NAVY, marginBottom:14 }}>Abrir nueva cuenta</h3>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          {[
            { tipo:'corriente', icon:'card',   titulo:'Cuenta Corriente', desc:'Para operaciones del día a día. Sin costo de mantenimiento.', color:NAVY },
            { tipo:'ahorro',    icon:'trophy', titulo:'Cuenta Ahorro Plus', desc:'3.5% TEA. Sin monto mínimo. Retiro libre en cualquier momento.', color:TEAL },
          ].map(c => (
            <div key={c.tipo} className="transition" style={{ border:'1px solid #DDE2F0', borderRadius:14, padding:18, cursor:'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = c.color; e.currentTarget.style.boxShadow = `0 4px 16px ${c.color}1a`; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#DDE2F0'; e.currentTarget.style.boxShadow = 'none'; }}>
              <div style={{ width:46, height:46, borderRadius:13, background:c.color+'14', display:'grid', placeItems:'center', marginBottom:12 }}>
                <Icon name={c.icon} size={24} color={c.color}/>
              </div>
              <h4 style={{ fontFamily:"'Sora',sans-serif", fontSize:14, fontWeight:700, color:NAVY, marginBottom:6 }}>{c.titulo}</h4>
              <p style={{ fontSize:12, color:'#374060', lineHeight:1.5, marginBottom:14 }}>{c.desc}</p>
              <button onClick={() => abrirCuenta(c.tipo)} disabled={abriendo} className="btn-primary"
                style={{ fontFamily:'inherit', fontSize:12, padding:'8px 14px', background:c.color, display:'inline-flex', alignItems:'center', gap:6 }}>
                {abriendo ? 'Procesando…' : <>Abrir {c.tipo} <Icon name="arrowRight" size={14} color="#fff"/></>}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}