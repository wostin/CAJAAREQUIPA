// src/pages/homebanking/Prestamos.jsx — Simulador + tabla amortización (v4 datos reales)
import { useState, useEffect } from 'react';
import api from '../../api/axios';
import Icon from '../../components/Icon';

function calcCuota(monto, plazo, tea = 0.60) {
  const tem = Math.pow(1 + tea, 1/12) - 1;
  return monto * tem * Math.pow(1+tem, plazo) / (Math.pow(1+tem, plazo) - 1);
}

function tablaAmortizacion(monto, plazo, tea = 0.60) {
  const tem = Math.pow(1+tea, 1/12) - 1;
  const cuota = calcCuota(monto, plazo, tea);
  let saldo = monto;
  return Array.from({ length: plazo }, (_, i) => {
    const interes  = saldo * tem;
    const capital  = cuota - interes;
    saldo -= capital;
    return { n: i+1, cuota, interes, capital, saldo: Math.max(saldo, 0) };
  });
}

// Fallback demo solo si Supabase no devuelve créditos desembolsados
const PRESTAMOS_DEMO = [
  { icon:'store', tipo:'Crédito MYPE · Capital de Trabajo',     meta:'TEA 43.92% · 36 meses · Micro Micro', pct:33, n:'12/36', monto:'S/ 30,000', prox:'20/06/2026', saldo:20150 },
  { icon:'hammer', tipo:'Crédito Remodelación · Local Comercial', meta:'TEA 40.92% · 24 meses · Micro Micro', pct:58, n:'14/24', monto:'S/ 15,000', prox:'05/06/2026', saldo:6289  },
];

export default function HBPrestamos() {
  const [tab, setTab]       = useState('activos'); // activos | simular | solicitar
  const [monto, setMonto]   = useState(20000);
  const [plazo, setPlazo]   = useState(24);
  const [tea]               = useState(0.4092); // TEA Micro Micro con seguro (PDF profesor)
  const [solEnviada, setSolEnviada] = useState(false);
  const [enviando, setEnviando]     = useState(false);
  const [proposito, setProposito]   = useState('Capital de trabajo');
  const [errorSol, setErrorSol]     = useState('');
  const [conSeguro, setConSeguro]   = useState(true); // TEA 40.92% con seguro · 43.92% sin
  const [tipoCredito, setTipoCredito] = useState('ME');
  const [ingreso, setIngreso]         = useState(2500);
  const [actividad, setActividad]     = useState('4711 — Comercio minorista (bodegas/abarrotes)');
  const [misSolicitudes, setMisSolicitudes] = useState([]);
  const [creditosActivos, setCreditosActivos] = useState(null); // null = cargando

  // Cargar solicitudes Y créditos desembolsados reales desde Supabase
  useEffect(() => {
    let ok = true;
    api.get('/api/prestamos')
      .then(r => {
        if (!ok) return;
        const todos = r.data?.data || [];
        // Separar desembolsados (activos) de los demás (historial/solicitudes)
        const desembolsados = todos.filter(p => p.estado === 'desembolsado');
        const solicitudes   = todos.filter(p => p.estado !== 'desembolsado');
        setCreditosActivos(desembolsados);
        setMisSolicitudes(solicitudes);
      })
      .catch(() => { setCreditosActivos([]); }); // fallo → fallback demo
    return () => { ok = false; };
  }, [solEnviada]);

  // Créditos activos: reales si los hay, demo si no
  const prestamosRender = creditosActivos?.length
    ? creditosActivos.map(p => ({
        icon: 'store',
        tipo: p.proposito || 'Crédito Empresarial Micro Micro',
        meta: `TEA ${(Number(p.tasa_anual)*100).toFixed(2)}% · ${p.plazo_meses} meses · Micro Micro`,
        pct: Math.min(Math.round(((p.cuotas_pagadas||0) / p.plazo_meses)*100), 100),
        n: `${p.cuotas_pagadas||0}/${p.plazo_meses}`,
        monto: `S/ ${Number(p.monto).toLocaleString('es-PE')}`,
        prox: p.fecha_proximo_pago
          ? new Date(p.fecha_proximo_pago).toLocaleDateString('es-PE')
          : '—',
        saldo: Number(p.saldo_capital || p.monto),
        cuota: Number(p.cuota_mensual),
      }))
    : PRESTAMOS_DEMO;
  const usandoDatos = creditosActivos?.length > 0;

  const cuota      = calcCuota(monto, plazo, tea);
  const totalPagar = cuota * plazo;
  const totalInt   = totalPagar - monto;
  const tem        = Math.pow(1+tea, 1/12) - 1;
  const tabla      = tablaAmortizacion(monto, Math.min(plazo, 12), tea);

  async function enviarSolicitud() {
    setEnviando(true); setErrorSol('');
    try {
      // ENVIO REAL: guarda la solicitud en Supabase; el asesor la ve en Core > Solicitudes
      await api.post('/api/prestamos', { monto, plazo_meses: plazo, con_seguro: conSeguro,
        proposito: `${proposito} · ${tipoCredito} · ${actividad.split(' — ')[0]} · ingreso S/ ${ingreso}` });
      setSolEnviada(true);
    } catch (e) {
      setErrorSol(e.response?.data?.message || 'No se pudo enviar. Verifica que el backend este encendido.');
    } finally { setEnviando(false); }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h1 style={{ fontFamily:"'Sora',sans-serif", fontSize:20, fontWeight:700, color:'#0D2461', marginBottom:4 }}>Mis Préstamos</h1>
          <p style={{ fontSize:13, color:'#7B84A3' }}>Créditos activos, simulador y solicitudes</p>
        </div>
        {tab !== 'solicitar' && <button className="btn-primary" onClick={() => setTab('solicitar')}>Solicitar nuevo →</button>}
      </div>

      {/* ── Banner preaprobado ── */}
      <div className="preap-banner" style={{ background:'linear-gradient(135deg,#0D2461,#1A3A8F)', borderRadius:20, padding:'20px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
        <div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,.75)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:4 }}>Crédito preaprobado disponible</div>
          <div style={{ fontFamily:"'Sora',sans-serif", fontSize:26, fontWeight:800, color:'#fff', marginBottom:4 }}>S/ 35,000</div>
          <div style={{ fontSize:13, color:'rgba(255,255,255,.75)' }}>Score 687 · TEA 40.92% con seguro · Crédito Empresarial Micro Micro</div>
        </div>
        <button onClick={() => setTab('solicitar')} style={{ background:'#fff', border:'none', color:'#00A896', padding:'11px 22px', borderRadius:11, fontFamily:'inherit', fontSize:'13.5px', fontWeight:700, cursor:'pointer', flexShrink:0 }}>
          Activar sin papeleos →
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:2, borderBottom:'1px solid #DDE2F0' }}>
        {[['activos','Activos','wallet'],['simular','Simulador','calculator'],['solicitar','Solicitar','edit']].map(([k,l,ic]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding:'10px 18px', fontSize:13, fontWeight:600, background:'none', border:'none', borderBottom: tab===k ? '2px solid #00A896' : '2px solid transparent', color: tab===k ? '#00A896' : '#7B84A3', cursor:'pointer', fontFamily:'inherit', transition:'.2s', display:'inline-flex', alignItems:'center', gap:7 }}><Icon name={ic} size={15} color={tab===k ? '#00A896' : '#7B84A3'}/> {l}</button>
        ))}
      </div>

      {/* ── ACTIVOS ── */}
      {tab === 'activos' && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {/* Indicador de fuente de datos */}
          {usandoDatos && (
            <div style={{ background:'#DCFCE7', border:'1px solid #86EFAC', borderRadius:10, padding:'8px 14px', fontSize:12, color:'#15803D', display:'flex', alignItems:'center', gap:6 }}>
              <Icon name="checkCircle" size={14} color="#15803D" style={{display:'inline',verticalAlign:'-2px',marginRight:4}}/><strong>Datos reales de Supabase</strong> — {creditosActivos.length} crédito{creditosActivos.length!==1?'s':''} desembolsado{creditosActivos.length!==1?'s':''}
            </div>
          )}
          {creditosActivos === null && (
            <div style={{ textAlign:'center', padding:'16px 0', color:'#7B84A3', fontSize:13 }}>Cargando créditos…</div>
          )}
          {creditosActivos?.length === 0 && (
            <div style={{ background:'#F4F6FB', borderRadius:14, padding:24, textAlign:'center' }}>
              <div style={{ display:'grid', placeItems:'center', marginBottom:10 }}><Icon name="card" size={36} color="#A0A8C0"/></div>
              <div style={{ fontSize:14, fontWeight:700, color:'#0D2461', marginBottom:4 }}>No tienes créditos activos</div>
              <div style={{ fontSize:12, color:'#7B84A3', marginBottom:14 }}>Solicita tu primer crédito y aparecerá aquí tras el desembolso.</div>
              <button onClick={() => setTab('solicitar')} className="btn-primary" style={{ fontFamily:'inherit' }}>Solicitar crédito →</button>
            </div>
          )}
          {prestamosRender.map((p, i) => (
            <div key={i} style={{ background:'#fff', border:'1px solid #E6EAF4', borderRadius:14, padding:18, display:'flex', gap:16, alignItems:'center', boxShadow:'0 1px 3px rgba(13,36,97,.04)' }}>
              <div style={{ width:46, height:46, background:'linear-gradient(135deg,#1A3A8F,#0D2461)', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <Icon name={p.icon} size={22} color="#fff"/>
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13.5, fontWeight:700, color:'#0D2461', marginBottom:2 }}>{p.tipo}</div>
                <div style={{ fontSize:12, color:'#7B84A3', marginBottom:8 }}>{p.meta}</div>
                <div style={{ height:6, background:'#E6EAF4', borderRadius:3, marginBottom:5, overflow:'hidden' }}>
                  <div style={{ height:'100%', borderRadius:3, background:'linear-gradient(90deg,#00A896,#0FB5A2)', width:`${p.pct}%`, transition:'width .5s' }}/>
                </div>
                <div style={{ fontSize:'11.5px', color:'#7B84A3' }}>Cuota <strong style={{color:'#374060'}}>{p.n}</strong> pagada ({p.pct}%) · Saldo: <strong style={{color:'#374060'}}>S/ {p.saldo.toLocaleString('es-PE')}</strong></div>
              </div>
              <div style={{ textAlign:'right', flexShrink:0 }}>
                <div style={{ fontFamily:"'Sora',sans-serif", fontSize:18, fontWeight:800, color:'#0D2461' }}>{p.monto}</div>
                <div style={{ fontSize:11, color:'#9AA2BC', marginTop:3, textTransform:'uppercase', letterSpacing:'.04em' }}>Próx. pago</div>
                <div style={{ fontSize:12.5, color:'#374060', fontWeight:600 }}>{p.prox}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── SIMULADOR ── */}
      {tab === 'simular' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <div className="card">
            <div style={{ fontFamily:"'Sora',sans-serif", fontSize:15, fontWeight:700, color:'#0D2461', marginBottom:16, display:'flex', alignItems:'center', gap:8 }}><Icon name="calculator" size={18} color="#00A896"/> Simulador de cuota</div>
            <div style={{ marginBottom:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, fontWeight:600, color:'#374060', marginBottom:6 }}>
                Monto solicitado <span style={{ color:'#00A896' }}>S/ {monto.toLocaleString('es-PE')}</span>
              </div>
              <input type="range" min={500} max={100000} step={500} value={monto}
                onChange={e => setMonto(+e.target.value)}
                style={{ width:'100%', accentColor:'#00A896', height:5, cursor:'pointer' }}/>
            </div>
            <div style={{ marginBottom:20 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, fontWeight:600, color:'#374060', marginBottom:6 }}>
                Plazo <span style={{ color:'#00A896' }}>{plazo} meses</span>
              </div>
              <input type="range" min={3} max={84} step={1} value={plazo}
                onChange={e => setPlazo(+e.target.value)}
                style={{ width:'100%', accentColor:'#00A896', height:5, cursor:'pointer' }}/>
            </div>
            <div style={{ background:'linear-gradient(135deg,#0D2461,#1A3A8F)', borderRadius:14, padding:20, textAlign:'center', marginBottom:14 }}>
              <div style={{ fontSize:11, color:'rgba(255,255,255,.6)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:4 }}>Cuota mensual estimada</div>
              <div style={{ fontFamily:"'Sora',sans-serif", fontSize:32, fontWeight:800, color:'#fff' }}>
                S/ {cuota.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2})}
              </div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,.55)', marginTop:4 }}>
                TEA {(tea*100).toFixed(0)}% · TEM {(tem*100).toFixed(4)}%
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
              {[['Total a pagar',`S/ ${Math.round(totalPagar).toLocaleString('es-PE')}`],['Total intereses',`S/ ${Math.round(totalInt).toLocaleString('es-PE')}`]].map(([l,v]) => (
                <div key={l} style={{ background:'#F4F6FB', borderRadius:10, padding:12, textAlign:'center' }}>
                  <div style={{ fontSize:11, color:'#7B84A3', marginBottom:2 }}>{l}</div>
                  <div style={{ fontSize:14, fontWeight:700, color:'#0D2461' }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ background:'#F4F6FB', borderRadius:10, padding:10, fontSize:12, color:'#7B84A3', marginBottom:14 }}>
              <strong>Fórmula:</strong> TEM = (1+TEA)^(1/12)−1 = {(tem*100).toFixed(4)}% · Cuota = M×TEM/[1−(1+TEM)^−n]
            </div>
            <button onClick={() => setTab('solicitar')} className="btn-primary" style={{ width:'100%', fontFamily:'inherit', fontSize:15, padding:13 }}>
              Solicitar este crédito →
            </button>
          </div>

          <div className="card">
            <div style={{ fontFamily:"'Sora',sans-serif", fontSize:15, fontWeight:700, color:'#0D2461', marginBottom:4 }}>Tabla de amortización</div>
            <div style={{ fontSize:12, color:'#7B84A3', marginBottom:14 }}>Primeras {tabla.length} cuotas (método francés)</div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', fontSize:12, borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid #DDE2F0' }}>
                    {['#','Cuota','Interés','Capital','Saldo'].map(h => (
                      <th key={h} style={{ textAlign:h==='#'?'center':'right', padding:'6px 8px', fontSize:11, color:'#7B84A3', textTransform:'uppercase', letterSpacing:'.06em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tabla.map(r => (
                    <tr key={r.n} style={{ borderBottom:'1px solid #F4F6FB' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#F4F6FB'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ textAlign:'center', padding:'7px 8px', color:'#7B84A3', fontWeight:600 }}>{r.n}</td>
                      <td style={{ textAlign:'right', padding:'7px 8px', fontWeight:700 }}>S/ {r.cuota.toFixed(2)}</td>
                      <td style={{ textAlign:'right', padding:'7px 8px', color:'#F97316' }}>S/ {r.interes.toFixed(2)}</td>
                      <td style={{ textAlign:'right', padding:'7px 8px', color:'#00A896' }}>S/ {r.capital.toFixed(2)}</td>
                      <td style={{ textAlign:'right', padding:'7px 8px', color:'#0D2461', fontWeight:600 }}>S/ {r.saldo.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── SOLICITAR ── */}
      {tab === 'solicitar' && (
        <div style={{ maxWidth:720 }}>
          {solEnviada ? (
            <div style={{ background:'#DCFCE7', border:'1px solid #86EFAC', borderRadius:16, padding:28, textAlign:'center' }}>
              <div style={{ display:'grid', placeItems:'center', marginBottom:12 }}><div style={{ width:64, height:64, borderRadius:'50%', background:'#DCFCE7', display:'grid', placeItems:'center' }}><Icon name="checkCircle" size={36} color="#15803D"/></div></div>
              <h3 style={{ fontFamily:"'Sora',sans-serif", fontSize:20, fontWeight:700, color:'#15803D', marginBottom:8 }}>¡Solicitud enviada!</h3>
              <p style={{ fontSize:14, color:'#166534', lineHeight:1.6, marginBottom:20 }}>Tu solicitud de S/ {monto.toLocaleString('es-PE')} a {plazo} meses fue recibida. Un asesor la evaluará y recibirás respuesta pronto.</p>
              <button onClick={() => setSolEnviada(false)} className="btn-primary" style={{ fontFamily:'inherit' }}>Nueva solicitud</button>
            </div>
          ) : (
            <div className="card" style={{ padding:0, overflow:'hidden' }}>
              {/* Encabezado tipo banca */}
              <div style={{ background:'linear-gradient(120deg,#0D2461,#16357e)', padding:'18px 22px', color:'#fff' }}>
                <div style={{ fontFamily:"'Sora',sans-serif", fontSize:18, fontWeight:700 }}>Solicitud de Crédito — Producto Digital</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,.7)', marginTop:2 }}>Operaciones › Solicitar préstamo · Crédito Empresarial Micro Micro</div>
              </div>

              <div style={{ padding:'20px 22px' }}>
                <div style={{ fontSize:12.5, fontWeight:800, color:'#B3261E', letterSpacing:.5, marginBottom:14 }} ><span style={{display:'inline-flex',alignItems:'center',gap:6}}><Icon name="doc" size={14} color="#B3261E"/> DATOS DE LA SOLICITUD</span></div>

                {/* Grid de 2 columnas */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                  <Campo label="Monto solicitado (S/)">
                    <input type="number" value={monto} onChange={e => setMonto(Number(e.target.value) || 0)} className="input-field" placeholder="Ej. 1000"/>
                  </Campo>
                  <Campo label="Plazo (n° de cuotas / meses)">
                    <input type="number" value={plazo} onChange={e => setPlazo(Number(e.target.value) || 0)} className="input-field" placeholder="Ej. 12"/>
                  </Campo>
                  <Campo label="Tipo de crédito">
                    <select value={tipoCredito} onChange={e => setTipoCredito(e.target.value)} className="input-field">
                      <option value="ME">ME — Microempresa</option>
                      <option value="PE">PE — Pequeña empresa</option>
                      <option value="MES">MES — Mediana empresa</option>
                    </select>
                  </Campo>
                  <Campo label="Ingreso neto mensual (S/)">
                    <input type="number" value={ingreso} onChange={e => setIngreso(Number(e.target.value) || 0)} className="input-field" placeholder="Ej. 2500"/>
                  </Campo>
                </div>

                <div style={{ marginTop:14 }}>
                  <Campo label="Actividad económica (CIIU)">
                    <select value={actividad} onChange={e => setActividad(e.target.value)} className="input-field">
                      <option>4711 — Comercio minorista (bodegas/abarrotes)</option>
                      <option>5610 — Restaurantes y servicio de comida</option>
                      <option>4520 — Mantenimiento y reparación de vehículos</option>
                      <option>1410 — Confección de prendas de vestir</option>
                      <option>4773 — Venta de productos de farmacia</option>
                      <option>9602 — Peluquería y belleza</option>
                      <option>0111 — Agricultura y cultivos</option>
                    </select>
                  </Campo>
                </div>

                <div style={{ marginTop:14 }}>
                  <Campo label="Propósito del crédito">
                    <input type="text" value={proposito} onChange={e => setProposito(e.target.value)} placeholder="Capital de trabajo, remodelación, vehículo..." className="input-field"/>
                  </Campo>
                </div>

                {/* Seguro de desgravamen */}
                <div style={{ display:'flex', alignItems:'center', gap:10, background:'#F4F9FB', border:'1px solid #D7E7EC', borderRadius:10, padding:'10px 14px', marginTop:14 }}>
                  <input type="checkbox" id="seguro" checked={conSeguro} onChange={e => setConSeguro(e.target.checked)} style={{ width:16, height:16, accentColor:'#0FA0AD' }}/>
                  <label htmlFor="seguro" style={{ fontSize:12.5, color:'#374060' }}>
                    <b>Seguro de desgravamen</b> — TEA {conSeguro ? '40.92%' : '43.92%'} (Crédito Empresarial Micro Micro · cuota fija)
                  </label>
                </div>

                {/* Resumen de evaluación (RDS) */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginTop:16 }}>
                  <ResumenBox titulo="Cuota mensual" valor={`S/ ${cuota.toFixed(2)}`} sub={`TEA ${conSeguro ? '40.92' : '43.92'}%`} />
                  <ResumenBox titulo="Total a pagar" valor={`S/ ${totalPagar.toLocaleString('es-PE',{maximumFractionDigits:0})}`} sub={`Interés S/ ${totalInt.toLocaleString('es-PE',{maximumFractionDigits:0})}`} />
                  {(() => {
                    const rds = ingreso > 0 ? cuota / ingreso : 1;
                    const semaforo = rds <= 0.30 ? ['#DCFCE7','#15803D','Verde · aprobable'] : rds <= 0.40 ? ['#FEF3C7','#92400E','Ámbar · a comité'] : ['#FEE2E2','#B91C1C','Rojo · alto riesgo'];
                    return <ResumenBox titulo="RDS (cuota/ingreso)" valor={`${(rds*100).toFixed(0)}%`} sub={semaforo[2]} bg={semaforo[0]} fg={semaforo[1]} />;
                  })()}
                </div>

                {errorSol && (
                  <div style={{ background:'#FEE2E2', border:'1px solid #FCA5A5', color:'#B91C1C', borderRadius:10, padding:'10px 14px', fontSize:13, marginTop:14 }} ><span style={{display:'inline-flex',alignItems:'center',gap:6}}><Icon name="alert" size={15} color="#B91C1C"/> {errorSol}</span></div>
                )}

                <button onClick={enviarSolicitud} disabled={enviando} className="btn-primary" style={{ width:'100%', fontFamily:'inherit', fontSize:15, padding:13, marginTop:16 }}>
                  {enviando ? 'Enviando solicitud...' : 'Enviar solicitud al asesor →'}
                </button>
              </div>
            </div>
          )}
          {misSolicitudes.length > 0 && (
            <div className="card" style={{ marginTop:16 }}>
              <div style={{ fontFamily:"'Sora',sans-serif", fontSize:15, fontWeight:700, color:'#0D2461', marginBottom:10 }} ><span style={{display:'inline-flex',alignItems:'center',gap:7}}><Icon name="list" size={16} color="#0D2461"/> Mis solicitudes (historial)</span></div>
              {misSolicitudes.map(sol => {
                const colores = { pendiente:['#FEF3C7','#92400E'], en_evaluacion:['#DBEAFE','#1D4ED8'], en_comite:['#EDE9FE','#6D28D9'], aprobado:['#DCFCE7','#15803D'], desembolsado:['#D1FAE5','#065F46'], rechazado:['#FEE2E2','#B91C1C'] };
                const [bg, fg] = colores[sol.estado] || ['#EEF1F8','#374060'];
                return (
                  <div key={sol.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid #EEF1F8', fontSize:13 }}>
                    <div>
                      <div style={{ fontWeight:700, color:'#0D2461' }}>S/ {Number(sol.monto).toLocaleString('es-PE')} · {sol.plazo_meses} meses</div>
                      <div style={{ color:'#7B84A3', fontSize:12 }}>{sol.proposito || 'Crédito'} · {new Date(sol.created_at).toLocaleDateString('es-PE')}</div>
                    </div>
                    <span style={{ background:bg, color:fg, padding:'4px 12px', borderRadius:14, fontWeight:700, fontSize:11.5, textTransform:'capitalize' }}>{(sol.estado || '').replace('_',' ')}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Helpers de UI del formulario
function Campo({ label, children }) {
  return (
    <div>
      <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374060', marginBottom:5 }}>{label}</label>
      {children}
    </div>
  );
}
function ResumenBox({ titulo, valor, sub, bg='#EEF1F8', fg='#0D2461' }) {
  return (
    <div style={{ background:bg, borderRadius:10, padding:'11px 13px' }}>
      <div style={{ fontSize:10.5, color:'#7B84A3', fontWeight:700, textTransform:'uppercase', letterSpacing:.3 }}>{titulo}</div>
      <div style={{ fontSize:17, fontWeight:800, color:fg, fontFamily:"'Sora',sans-serif", marginTop:2 }}>{valor}</div>
      <div style={{ fontSize:11, color:fg, opacity:.8 }}>{sub}</div>
    </div>
  );
}