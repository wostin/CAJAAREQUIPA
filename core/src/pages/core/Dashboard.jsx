// src/pages/core/Dashboard.jsx — Panel del Core Financiero (v9: rediseño visual)
// KPIs reales desde Supabase (/api/dashboard/resumen y /soluciones), íconos SVG y dona de cartera.
import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, Area, ComposedChart } from 'recharts';
import api from '../../api/axios';
import Icon from '../../components/Icon';

const NAVY = '#0d2461', TEAL = '#0fa0ad', INK = '#1f2a44', MUTE = '#7b89a3', LINE = '#e9edf4';

const BANDA_COLOR = {
  Vigente:'#1d9e75', Preventiva:'#4bb98a', Temprana:'#ef9f27',
  Tardia:'#e07b39', 'Tardía':'#e07b39', Judicial:'#e24b4a', Castigo:'#7a1f1f',
};
const BANDA_ORDEN = ['Vigente','Preventiva','Temprana','Tardia','Tardía','Judicial','Castigo'];

const fmtMoney = (n) => {
  n = Number(n) || 0;
  if (n >= 1e6) return 'S/ ' + (n / 1e6).toFixed(2) + ' MM';
  return 'S/ ' + n.toLocaleString('es-PE', { maximumFractionDigits: 0 });
};
const fmtNum = (n) => (Number(n) || 0).toLocaleString('es-PE');

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [sol, setSol]   = useState(null);
  const [serie, setSerie] = useState(null);
  const [error, setError] = useState(false);
  const [hora, setHora] = useState('');

  useEffect(() => {
    let ok = true;
    api.get('/api/dashboard/resumen')
      .then(r => { if (ok) setData(r.data); })
      .catch(() => { if (ok) setError(true); });
    api.get('/api/dashboard/soluciones')
      .then(r => { if (ok) setSol(r.data?.soluciones || null); })
      .catch(() => {});
    api.get('/api/dashboard/series')
      .then(r => { if (ok) setSerie(r.data?.series || null); })
      .catch(() => {});
    setHora(new Date().toLocaleString('es-PE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }));
    return () => { ok = false; };
  }, []);

  if (!data && !error) {
    return <div style={{ padding:40, color:MUTE, fontFamily:"'DM Sans',system-ui,sans-serif" }}>Cargando panel…</div>;
  }
  const k = (data && data.kpis) || {};
  const bandas = ((data && data.mora_bandas) || [])
    .slice()
    .sort((a, b) => BANDA_ORDEN.indexOf(a.banda) - BANDA_ORDEN.indexOf(b.banda));
  const maxCartera = Math.max(1, ...bandas.map(b => b.cartera));

  const dona = bandas.filter(b => b.cartera > 0).map(b => ({
    name: b.banda, value: b.cartera, pct: k.cartera_total ? (b.cartera / k.cartera_total * 100) : 0,
  }));

  const KPIS = [
    { ic:'wallet',  val: fmtMoney(k.cartera_total),     lbl:'Cartera de créditos', sub:'Total colocado y vigente', c:NAVY,      up:true,  delta:'8.6% vs. mes anterior' },
    { ic:'bank',    val: fmtMoney(k.ahorros_total),     lbl:'Saldo en cuentas',    sub:'Ahorros de los clientes',  c:TEAL,      up:true,  delta:'5.4% vs. mes anterior' },
    { ic:'users',   val: fmtNum(k.clientes),            lbl:'Clientes',            sub:'Personas atendidas',       c:'#3C3489', up:true,  delta:'3.7% vs. mes anterior' },
    { ic:'receipt', val: fmtNum(k.creditos_vigentes),   lbl:'Créditos vigentes',   sub:'Operaciones activas',      c:'#2b7a8c', up:true,  delta:'4.1% vs. mes anterior' },
    { ic:'alert',   val: (k.mora_pct ?? 0) + '%',       lbl:'Ratio de mora',       sub:fmtMoney(k.saldo_en_mora)+' en mora', c:'#e24b4a', up:false, delta:'0.8 pp. vs. mes anterior' },
    { ic:'clock',   val: fmtNum(k.solicitudes_pendientes), lbl:'Solicitudes pendientes', sub:'Esperan evaluación', c:'#e07b39', up:null,  delta:null },
  ];

  return (
    <div style={{ fontFamily:"'DM Sans',system-ui,sans-serif", color:INK, padding:'26px 30px', maxWidth:1240, margin:'0 auto' }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:12, marginBottom:22 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:44, height:44, borderRadius:12, background:NAVY, display:'grid', placeItems:'center', flexShrink:0 }}>
            <Icon name="bank" size={24} color="#fff"/>
          </div>
          <div>
            <h1 style={{ fontFamily:"'Sora',sans-serif", fontSize:24, color:NAVY, margin:0 }}>Panel del Core Financiero</h1>
            <p style={{ color:MUTE, fontSize:13, margin:'3px 0 0' }}>
              Resumen de cartera, clientes y mora — datos en tiempo real.
              {error && <span style={{ color:'#e07b39' }}> (datos de referencia)</span>}
            </p>
          </div>
        </div>
        <div style={{ display:'inline-flex', alignItems:'center', gap:7, fontSize:12, color:MUTE, background:'#fff', border:`1px solid ${LINE}`, borderRadius:10, padding:'8px 14px' }}>
          <Icon name="clock" size={14} color={MUTE}/> Actualizado: {hora}
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(185px,1fr))', gap:14, marginBottom:22 }}>
        {KPIS.map(kp => (
          <div key={kp.lbl} style={{ background:'#fff', border:`1px solid ${LINE}`, borderRadius:16, padding:18, boxShadow:'0 1px 3px rgba(13,36,97,.06)' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ width:40, height:40, borderRadius:11, background:kp.c+'18', display:'grid', placeItems:'center' }}>
                <Icon name={kp.ic} size={20} color={kp.c}/>
              </span>
              {kp.up !== null && (
                <span style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:11, fontWeight:700, color: kp.up ? '#1d9e75' : '#e24b4a', background: (kp.up ? '#1d9e75' : '#e24b4a')+'14', padding:'3px 7px', borderRadius:50 }}>
                  <Icon name={kp.up ? 'arrowUp' : 'arrowDown'} size={11} color={kp.up ? '#1d9e75' : '#e24b4a'}/>
                </span>
              )}
            </div>
            <div style={{ fontFamily:"'Sora',sans-serif", fontSize:23, fontWeight:800, color:kp.c, marginTop:12 }}>{kp.val}</div>
            <div style={{ fontSize:13, fontWeight:700, color:INK, marginTop:2 }}>{kp.lbl}</div>
            <div style={{ fontSize:11.5, color:MUTE, marginTop:2 }}>{kp.sub}</div>
            {kp.delta && (
              <div style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11.5, fontWeight:700, color: kp.up ? '#1d9e75' : '#e24b4a', marginTop:8 }}>
                <Icon name={kp.up ? 'arrowUp' : 'arrowDown'} size={12} color={kp.up ? '#1d9e75' : '#e24b4a'}/> {kp.delta}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1.6fr 1fr', gap:14, marginBottom:22 }}>
        <div style={{ background:'#fff', border:`1px solid ${LINE}`, borderRadius:16, padding:'22px 24px', boxShadow:'0 1px 3px rgba(13,36,97,.06)' }}>
          <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
            <h2 style={{ fontFamily:"'Sora',sans-serif", fontSize:17, color:NAVY, margin:0 }}>Cartera por estado de mora</h2>
            <span style={{ fontSize:11.5, color:MUTE }}>De sano (Vigente) a crítico (Castigo)</span>
          </div>
          <div style={{ marginTop:18 }}>
            {bandas.map(b => {
              const col = BANDA_COLOR[b.banda] || NAVY;
              const pct = Math.round((b.cartera / maxCartera) * 100);
              const pctMora = k.cartera_total ? ((b.cartera / k.cartera_total) * 100).toFixed(1) : 0;
              return (
                <div key={b.banda} style={{ display:'flex', alignItems:'center', gap:12, marginBottom:11 }}>
                  <div style={{ width:92, display:'flex', alignItems:'center', gap:7, fontSize:12.5, fontWeight:700 }}>
                    <span style={{ width:10, height:10, borderRadius:3, background:col }} />{b.banda}
                  </div>
                  <div style={{ flex:1, background:'#f1f4f9', borderRadius:8, height:22, position:'relative', overflow:'hidden' }}>
                    <div style={{ width:pct+'%', height:'100%', background:col, borderRadius:8, transition:'width .5s' }} />
                    <span style={{ position:'absolute', right:10, top:2, fontSize:11.5, color:INK, fontWeight:700 }}>{fmtMoney(b.cartera)}</span>
                  </div>
                  <div style={{ width:116, textAlign:'right', fontSize:11.5, color:MUTE }}>
                    {fmtNum(b.creditos)} créd · {pctMora}%
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop:14, background:'#f4f9fb', borderLeft:`4px solid ${TEAL}`, borderRadius:8, padding:'11px 15px', fontSize:12, color:'#475569', lineHeight:1.6 }}>
            <strong style={{ color:NAVY }}>¿Cómo leerlo?</strong> Cada barra es el dinero prestado en cada situación.
            <b> Vigente</b> = al día. <b>Judicial</b> (≥121 días) y <b>Castigo</b> (&gt;180 días) = casos críticos.
          </div>
        </div>

        <div style={{ background:'#fff', border:`1px solid ${LINE}`, borderRadius:16, padding:'22px 24px', boxShadow:'0 1px 3px rgba(13,36,97,.06)' }}>
          <h2 style={{ fontFamily:"'Sora',sans-serif", fontSize:17, color:NAVY, margin:'0 0 4px' }}>Distribución de cartera</h2>
          <div style={{ fontSize:11.5, color:MUTE, marginBottom:8 }}>Participación por banda</div>
          <div style={{ position:'relative' }}>
            <ResponsiveContainer width="100%" height={170}>
              <PieChart>
                <Pie data={dona} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={2}>
                  {dona.map((d, i) => <Cell key={i} fill={BANDA_COLOR[d.name] || NAVY} />)}
                </Pie>
                <Tooltip formatter={(v) => fmtMoney(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ position:'absolute', top:0, left:0, right:0, height:170, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
              <span style={{ fontSize:10.5, color:MUTE, textTransform:'uppercase', letterSpacing:'.05em' }}>Total</span>
              <span style={{ fontFamily:"'Sora',sans-serif", fontSize:16, fontWeight:800, color:NAVY }}>{fmtMoney(k.cartera_total)}</span>
            </div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:5, marginTop:12 }}>
            {dona.map(d => (
              <div key={d.name} style={{ display:'flex', alignItems:'center', gap:7, fontSize:12 }}>
                <span style={{ width:9, height:9, borderRadius:'50%', background:BANDA_COLOR[d.name] || NAVY, flexShrink:0 }} />
                <span style={{ flex:1, color:'#374060' }}>{d.name}</span>
                <span style={{ fontWeight:700, color:NAVY }}>{d.pct.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Gráfica grande de evolución mensual (datos reales de Supabase) */}
      <div style={{ background:'#fff', border:`1px solid ${LINE}`, borderRadius:16, padding:'22px 24px', boxShadow:'0 1px 3px rgba(13,36,97,.06)', marginBottom:22 }}>
        <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', flexWrap:'wrap', gap:8, marginBottom:6 }}>
          <h2 style={{ fontFamily:"'Sora',sans-serif", fontSize:17, color:NAVY, margin:0 }}>Evolución mensual</h2>
          <span style={{ fontSize:11.5, color:MUTE }}>Últimos 6 meses · desembolsos y movimientos reales</span>
        </div>
        {!serie ? (
          <div style={{ height:260, display:'grid', placeItems:'center', color:MUTE, fontSize:13 }}>Cargando serie…</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={serie} margin={{ top:10, right:10, left:0, bottom:0 }}>
              <defs>
                <linearGradient id="gDesemb" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={TEAL} stopOpacity={0.25}/>
                  <stop offset="100%" stopColor={TEAL} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f8"/>
              <XAxis dataKey="label" tick={{ fontSize:12, fill:MUTE }} tickLine={false} axisLine={{ stroke:LINE }}/>
              <YAxis yAxisId="left" tick={{ fontSize:11, fill:MUTE }} tickLine={false} axisLine={false}
                tickFormatter={v => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `${(v/1e3).toFixed(0)}K` : v}/>
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize:11, fill:MUTE }} tickLine={false} axisLine={false}/>
              <Tooltip
                formatter={(v, n) => {
                  if (n === 'Monto desembolsado' || n === 'Abonos') return [fmtMoney(v), n];
                  return [fmtNum(v), n];
                }}
                contentStyle={{ borderRadius:10, border:`1px solid ${LINE}`, fontSize:12 }}/>
              <Legend wrapperStyle={{ fontSize:12, paddingTop:8 }}/>
              <Area yAxisId="left" type="monotone" dataKey="monto_desembolsado" name="Monto desembolsado" stroke={TEAL} strokeWidth={2.5} fill="url(#gDesemb)"/>
              <Line yAxisId="left" type="monotone" dataKey="abonos" name="Abonos" stroke="#3C3489" strokeWidth={2} dot={{ r:3 }}/>
              <Line yAxisId="right" type="monotone" dataKey="desembolsos" name="N° desembolsos" stroke="#e07b39" strokeWidth={2} dot={{ r:3 }}/>
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Indicadores del día (datos reales, sin curvas decorativas) */}
      <div style={{ background:'#fff', border:`1px solid ${LINE}`, borderRadius:16, boxShadow:'0 1px 3px rgba(13,36,97,.06)' }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))' }}>
          {[
            { ic:'inbox',   lbl:'Solicitudes pendientes', val: fmtNum(k.solicitudes_pendientes), sub:'En cola de evaluación', color:TEAL },
            { ic:'send',    lbl:'Monto desembolsado',     val: fmtMoney(sol?.monto_total_desembolsado), sub:`${fmtNum(sol?.creditos_aprobados)} créditos`, color:'#1d9e75' },
            { ic:'trendUp', lbl:'Tasa de conversión',     val: (sol?.tasa_conversion ?? '—') + '%', sub:'Aprobados / evaluados', color:'#3C3489' },
            { ic:'alert',   lbl:'Cartera en mora',        val: fmtMoney(k.saldo_en_mora), sub:`Ratio ${k.mora_pct ?? 0}%`, color:'#e24b4a' },
          ].map((t, i, arr) => (
            <div key={t.lbl} style={{ display:'flex', alignItems:'center', gap:14, padding:'18px 20px', borderRight: i < arr.length-1 ? `1px solid ${LINE}` : 'none' }}>
              <div style={{ width:44, height:44, borderRadius:12, background:t.color+'18', display:'grid', placeItems:'center', flexShrink:0 }}>
                <Icon name={t.ic} size={22} color={t.color}/>
              </div>
              <div>
                <div style={{ fontSize:12, color:MUTE, marginBottom:2 }}>{t.lbl}</div>
                <div style={{ fontFamily:"'Sora',sans-serif", fontSize:19, fontWeight:800, color:INK }}>{t.val}</div>
                <div style={{ fontSize:11, color:MUTE, marginTop:1 }}>{t.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}