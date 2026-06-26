// src/pages/homebanking/Ahorro.jsx — v16: plazo fijo + vencimiento + lista
import { useState, useEffect } from 'react';
import api from '../../api/axios';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Icon from '../../components/Icon';

const NAVY = '#0D2461', TEAL = '#00A896', PURPLE = '#7C3AED';

const TASAS = [
  { plazo:'Plazo Libre',     icon:'wallet',   dias:'Sin restricción de retiro', tasa:'3.5%', tea:0.035, plazo_dias:0,   gold:false },
  { plazo:'Plazo Fijo 30d',  icon:'calendar', dias:'Bloqueo 30 días',           tasa:'4.5%', tea:0.045, plazo_dias:30,  gold:false },
  { plazo:'Plazo Fijo 90d',  icon:'calendar', dias:'Bloqueo 90 días',           tasa:'5.5%', tea:0.055, plazo_dias:90,  gold:false },
  { plazo:'Plazo Fijo 180d', icon:'trophy',   dias:'Mejor rendimiento',         tasa:'6.5%', tea:0.065, plazo_dias:180, gold:true  },
];

function calcProyeccion(saldo, deposito, meses, tea) {
  const tem = Math.pow(1 + tea, 1/12) - 1;
  const data = [];
  let s = saldo;
  for (let m = 0; m <= meses; m++) {
    data.push({ mes: m === 0 ? 'Hoy' : `M${m}`, saldo: Math.round(s) });
    s = s * (1 + tem) + deposito;
  }
  return data;
}

export default function HBAhorro() {
  const [deposito, setDeposito]   = useState(800);
  const [plazoSel, setPlazoSel]   = useState(0);
  const [saldoReal, setSaldoReal] = useState(null);
  const [cuentaAhorro, setCuentaAhorro] = useState(null); // cuenta real para el depósito

  // Modal de plazo fijo
  const [modalAbierto, setModalAbierto] = useState(false);
  const [montoPF, setMontoPF] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [resultado, setResultado] = useState(null); // {ok, msg, deposito}
  const [depositos, setDepositos] = useState([]); // lista de plazos fijos
  const [simulandoId, setSimulandoId] = useState(null); // id en proceso de simular vencimiento
  const [avisoVenc, setAvisoVenc] = useState(''); // aviso cuando algo vence solo

  function cargarCuentas() {
    api.get('/api/cuentas').then(r => {
      const cts = r.data?.data || [];
      const ah = cts.find(c => c.tipo === 'ahorro') || cts[0];
      if (ah) { setSaldoReal(Number(ah.saldo || 0)); setCuentaAhorro(ah); }
    }).catch(() => {});
  }

  function cargarDepositos() {
    api.get('/api/cuentas/plazo-fijo')
      .then(r => setDepositos(r.data?.data || []))
      .catch(() => setDepositos([]));
  }

  // Al entrar: procesa vencimientos reales, luego carga cuentas y depósitos
  useEffect(() => {
    api.post('/api/cuentas/plazo-fijo/procesar-vencimientos')
      .then(r => {
        if (r.data?.procesados > 0) {
          setAvisoVenc(`Se procesaron ${r.data.procesados} depósito(s) vencido(s). Se devolvió S/ ${Number(r.data.total_devuelto).toLocaleString('es-PE', { minimumFractionDigits: 2 })} a tu cuenta.`);
        }
      })
      .catch(() => {})
      .finally(() => { cargarCuentas(); cargarDepositos(); });
  }, []);

  // Forzar el vencimiento de un depósito (demo)
  async function simularVencimiento(id) {
    setSimulandoId(id);
    try {
      const r = await api.post(`/api/cuentas/plazo-fijo/${id}/simular-vencimiento`);
      if (r.data?.success) {
        setAvisoVenc(`Depósito vencido. Se devolvieron S/ ${Number(r.data.devuelto).toLocaleString('es-PE', { minimumFractionDigits: 2 })} a tu cuenta.`);
        if (r.data.nuevo_saldo != null) setSaldoReal(Number(r.data.nuevo_saldo));
        cargarCuentas();
        cargarDepositos();
      }
    } catch (e) {
      setAvisoVenc('No se pudo simular el vencimiento: ' + (e?.response?.data?.message || e.message));
    }
    setSimulandoId(null);
  }


  const saldo = saldoReal ?? 8320;
  const metaAhorro = 13400;
  const tasaSel = TASAS[plazoSel];
  const tea = tasaSel.tea;
  const proyeccion = calcProyeccion(saldo, deposito, 12, tea);
  const pct = Math.min(Math.round((saldo / metaAhorro) * 100), 100);
  const fmt = (n) => `S/ ${Number(n).toLocaleString('es-PE', { minimumFractionDigits:2 })}`;

  // Cálculo del interés del depósito en el modal
  const montoNum = Number(montoPF) || 0;
  const interesPF = tasaSel.plazo_dias > 0 ? montoNum * tea * (tasaSel.plazo_dias / 360) : 0;
  const montoFinalPF = montoNum + interesPF;
  const saldoInsuficiente = montoNum > saldo;
  const esPlazoLibre = tasaSel.plazo_dias === 0;

  function abrirModal() {
    setResultado(null);
    setMontoPF('');
    setModalAbierto(true);
  }

  async function confirmarPlazoFijo() {
    if (!cuentaAhorro || montoNum <= 0 || saldoInsuficiente || esPlazoLibre) return;
    setProcesando(true);
    setResultado(null);
    try {
      const r = await api.post('/api/cuentas/plazo-fijo', {
        cuenta_id: cuentaAhorro.id,
        monto: montoNum,
        tea: tasaSel.tea,
        plazo_dias: tasaSel.plazo_dias,
        producto: tasaSel.plazo,
      });
      const d = r.data?.data;
      setResultado({ ok: true, deposito: d, msg: 'Depósito creado correctamente' });
      // Actualizar saldo en pantalla
      if (d?.nuevo_saldo != null) setSaldoReal(Number(d.nuevo_saldo));
      cargarCuentas();
      cargarDepositos();
    } catch (e) {
      const msg = e?.response?.data?.message || e.message || 'No se pudo crear el depósito';
      setResultado({ ok: false, msg });
    }
    setProcesando(false);
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      <div>
        <h1 style={{ fontFamily:"'Sora',sans-serif", fontSize:20, fontWeight:700, color:NAVY, marginBottom:4 }}>Cuenta de Ahorro</h1>
        <p style={{ fontSize:13, color:'#7B84A3', display:'flex', alignItems:'center', gap:6 }}>
          Cuenta Ahorro Plus · Plazo libre · 3.5% TEA
          {saldoReal !== null && <span style={{ display:'inline-flex', alignItems:'center', gap:4, color:TEAL, fontWeight:600 }}><Icon name="checkCircle" size={13} color={TEAL}/> saldo real</span>}
        </p>
      </div>

      {/* Card de ahorro */}
      <div style={{ background:'linear-gradient(135deg,#6B21A8,#7C3AED)', borderRadius:20, padding:24, color:'#fff', position:'relative', overflow:'hidden', boxShadow:'0 8px 28px rgba(108,33,168,.25)' }}>
        <div style={{ position:'absolute', right:-40, top:-40, width:160, height:160, borderRadius:'50%', background:'rgba(255,255,255,.06)' }}/>
        <div style={{ position:'relative', zIndex:1 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
            <div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,.65)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Saldo actual · Cuenta Ahorro Plus</div>
              <div style={{ fontFamily:"'Sora',sans-serif", fontSize:30, fontWeight:800, marginBottom:4 }}>{fmt(saldo)}</div>
            </div>
            <div style={{ width:50, height:50, borderRadius:14, background:'rgba(255,255,255,.12)', display:'grid', placeItems:'center' }}>
              <Icon name="trophy" size={26} color="#F4C430"/>
            </div>
          </div>
          <div style={{ fontSize:13, color:'rgba(255,255,255,.7)', marginBottom:16 }}>Meta de ahorro: {fmt(metaAhorro)} · {(tea*100).toFixed(1)}% TEA</div>
          <div style={{ height:8, background:'rgba(255,255,255,.2)', borderRadius:4, marginBottom:6 }}>
            <div style={{ height:'100%', borderRadius:4, background:'#F4C430', width:`${pct}%`, transition:'width .5s ease' }}/>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'rgba(255,255,255,.6)' }}>
            <span>S/ 0</span><span>{pct}% completado</span><span>{fmt(metaAhorro)}</span>
          </div>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        {/* Proyección */}
        <div className="card">
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
            <Icon name="trendUp" size={18} color={PURPLE}/>
            <span style={{ fontFamily:"'Sora',sans-serif", fontSize:15, fontWeight:700, color:NAVY }}>Proyección de ahorro</span>
          </div>
          <div style={{ fontSize:12, color:'#7B84A3', marginBottom:16 }}>Depósito mensual: {fmt(deposito)} · TEA {(tea*100).toFixed(1)}%</div>

          <div style={{ marginBottom:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, fontWeight:600, color:'#374060', marginBottom:6 }}>
              Depósito mensual <span style={{ color:TEAL, fontWeight:700 }}>S/ {deposito}</span>
            </div>
            <input type="range" min={100} max={5000} step={100} value={deposito}
              onChange={e => setDeposito(+e.target.value)}
              style={{ width:'100%', accentColor:TEAL, height:5, cursor:'pointer' }}/>
          </div>

          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={proyeccion}>
              <defs>
                <linearGradient id="gAhorro" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={PURPLE} stopOpacity={0.2}/>
                  <stop offset="95%" stopColor={PURPLE} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F4F6FB"/>
              <XAxis dataKey="mes" tick={{ fontSize:10 }}/>
              <YAxis tick={{ fontSize:10 }} tickFormatter={v => `S/${(v/1000).toFixed(0)}K`}/>
              <Tooltip formatter={v => [fmt(v), 'Saldo proyectado']}/>
              <Area type="monotone" dataKey="saldo" stroke={PURPLE} strokeWidth={2.5} fill="url(#gAhorro)" dot={false}/>
            </AreaChart>
          </ResponsiveContainer>

          <div style={{ marginTop:12, background:'#F4F6FB', borderRadius:10, padding:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:12, color:'#7B84A3' }}>En 12 meses tendrás</span>
            <span style={{ fontFamily:"'Sora',sans-serif", fontSize:16, fontWeight:700, color:'#6B21A8' }}>
              {fmt(proyeccion[12]?.saldo || 0)}
            </span>
          </div>
        </div>

        {/* Tasas disponibles */}
        <div className="card">
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
            <Icon name="money" size={18} color={TEAL}/>
            <span style={{ fontFamily:"'Sora',sans-serif", fontSize:15, fontWeight:700, color:NAVY }}>Tasas disponibles</span>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {TASAS.map((t, i) => {
              const sel = plazoSel === i;
              return (
                <div key={i} onClick={() => setPlazoSel(i)}
                  style={{ borderRadius:12, padding:14, display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer', transition:'.2s',
                    background: t.gold ? 'linear-gradient(135deg,#6B21A8,#7C3AED)' : sel ? '#E0F2F1' : '#F4F6FB',
                    border: sel && !t.gold ? `1.5px solid ${TEAL}` : '1.5px solid transparent',
                  }}>
                  <div style={{ display:'flex', alignItems:'center', gap:11 }}>
                    <div style={{ width:38, height:38, borderRadius:10, background: t.gold ? 'rgba(255,255,255,.15)' : '#fff', display:'grid', placeItems:'center', flexShrink:0 }}>
                      <Icon name={t.icon} size={19} color={t.gold ? '#F4C430' : TEAL}/>
                    </div>
                    <div>
                      <div style={{ fontWeight:600, fontSize:14, color: t.gold ? '#fff' : NAVY }}>{t.plazo}</div>
                      <div style={{ fontSize:12, color: t.gold ? 'rgba(255,255,255,.7)' : '#7B84A3' }}>{t.dias}</div>
                    </div>
                  </div>
                  <div style={{ fontFamily:"'Sora',sans-serif", fontSize:18, fontWeight:700, color: t.gold ? '#F4C430' : TEAL }}>{t.tasa}</div>
                </div>
              );
            })}
          </div>
          <button onClick={abrirModal} className="btn-primary" style={{ width:'100%', fontFamily:'inherit', fontSize:14, marginTop:14, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:7 }}>
            <Icon name="plus" size={16} color="#fff"/> Abrir depósito a plazo fijo
          </button>
        </div>
      </div>

      {/* Aviso de vencimiento procesado */}
      {avisoVenc && (
        <div style={{ display:'flex', alignItems:'center', gap:10, background:'#DCFCE7', border:'1px solid #86EFAC', borderRadius:12, padding:'12px 16px' }}>
          <Icon name="checkCircle" size={18} color="#15803D"/>
          <span style={{ flex:1, fontSize:13, color:'#15803D', fontWeight:500 }}>{avisoVenc}</span>
          <button onClick={() => setAvisoVenc('')} style={{ background:'none', border:'none', cursor:'pointer', display:'flex' }}>
            <Icon name="close" size={16} color="#15803D"/>
          </button>
        </div>
      )}

      {/* ── MIS DEPÓSITOS A PLAZO FIJO ── */}
      {depositos.length > 0 && (
        <div className="card">
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
            <Icon name="trophy" size={18} color={PURPLE}/>
            <span style={{ fontFamily:"'Sora',sans-serif", fontSize:15, fontWeight:700, color:NAVY }}>Mis depósitos a plazo fijo</span>
          </div>
          <div style={{ fontSize:12, color:'#7B84A3', marginBottom:14 }}>
            {depositos.filter(d => d.estado === 'activo').length} activo(s) · {depositos.filter(d => d.estado === 'vencido').length} vencido(s)
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {depositos.map(d => {
              const vencido = d.estado === 'vencido';
              const color = vencido ? '#15803D' : PURPLE;
              return (
                <div key={d.id} style={{ display:'flex', alignItems:'center', gap:14, flexWrap:'wrap', border:`1px solid ${vencido ? '#86EFAC' : '#E2E8F6'}`, borderRadius:12, padding:'14px 16px', background: vencido ? '#F0FDF4' : '#fff' }}>
                  <div style={{ width:42, height:42, borderRadius:11, background: color+'18', display:'grid', placeItems:'center', flexShrink:0 }}>
                    <Icon name={vencido ? 'checkCircle' : 'calendar'} size={20} color={color}/>
                  </div>
                  <div style={{ flex:'1 1 160px', minWidth:140 }}>
                    <div style={{ fontWeight:700, fontSize:14, color:NAVY }}>{d.producto}</div>
                    <div style={{ fontSize:12, color:'#7B84A3' }}>
                      {fmt(d.monto)} · {Number(d.tea).toFixed(1)}% TEA · {d.plazo_dias} días
                    </div>
                  </div>
                  <div style={{ flex:'1 1 130px', minWidth:120 }}>
                    <div style={{ fontSize:11, color:'#9AA2BC', textTransform:'uppercase', letterSpacing:'.05em' }}>{vencido ? 'Devuelto' : 'Recibirás'}</div>
                    <div style={{ fontWeight:700, fontSize:14, color }}>{fmt(d.monto_final)}</div>
                    <div style={{ fontSize:11, color:'#7B84A3' }}>Vence: {d.fecha_vencimiento}</div>
                  </div>
                  <div style={{ flexShrink:0 }}>
                    {vencido ? (
                      <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:12, fontWeight:700, color:'#15803D', background:'#DCFCE7', padding:'5px 12px', borderRadius:50 }}>
                        <Icon name="checkCircle" size={13} color="#15803D"/> Vencido y abonado
                      </span>
                    ) : (
                      <button onClick={() => simularVencimiento(d.id)} disabled={simulandoId === d.id}
                        style={{ fontSize:12, fontWeight:600, color:'#fff', background:PURPLE, border:'none', borderRadius:9, padding:'8px 14px', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:6, opacity: simulandoId === d.id ? .6 : 1 }}>
                        {simulandoId === d.id ? 'Procesando…' : <><Icon name="bolt" size={13} color="#fff"/> Simular vencimiento</>}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop:12, fontSize:11, color:'#9AA2BC', display:'flex', alignItems:'center', gap:5 }}>
            <Icon name="alert" size={12} color="#9AA2BC"/>
            "Simular vencimiento" fuerza el cierre del depósito y devuelve capital + interés (para demostración). En producción, vence solo al llegar la fecha.
          </div>
        </div>
      )}

      {/* ── MODAL PLAZO FIJO ── */}
      {modalAbierto && (
        <div onClick={() => !procesando && setModalAbierto(false)}
          style={{ position:'fixed', inset:0, background:'rgba(13,36,97,.45)', display:'grid', placeItems:'center', zIndex:1000, padding:16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background:'#fff', borderRadius:18, width:'100%', maxWidth:440, boxShadow:'0 20px 60px rgba(13,36,97,.3)', overflow:'hidden' }}>
            {/* Header */}
            <div style={{ background:'linear-gradient(135deg,#6B21A8,#7C3AED)', padding:'20px 24px', color:'#fff' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:40, height:40, borderRadius:11, background:'rgba(255,255,255,.15)', display:'grid', placeItems:'center' }}>
                    <Icon name="trophy" size={21} color="#F4C430"/>
                  </div>
                  <div>
                    <div style={{ fontFamily:"'Sora',sans-serif", fontSize:17, fontWeight:700 }}>Abrir depósito a plazo fijo</div>
                    <div style={{ fontSize:12, color:'rgba(255,255,255,.75)' }}>{tasaSel.plazo} · {tasaSel.tasa} TEA</div>
                  </div>
                </div>
                {!procesando && (
                  <button onClick={() => setModalAbierto(false)} style={{ background:'none', border:'none', color:'#fff', fontSize:22, cursor:'pointer', lineHeight:1 }}>×</button>
                )}
              </div>
            </div>

            {/* Body */}
            <div style={{ padding:24 }}>
              {resultado?.ok ? (
                /* Éxito */
                <div style={{ textAlign:'center' }}>
                  <div style={{ marginBottom:10, display:'grid', placeItems:'center' }}>
                    <Icon name="checkCircle" size={52} color="#15803D"/>
                  </div>
                  <h3 style={{ fontFamily:"'Sora',sans-serif", fontSize:18, color:'#15803D', margin:'0 0 6px' }}>¡Depósito abierto!</h3>
                  <p style={{ fontSize:13, color:'#7B84A3', margin:'0 0 16px' }}>Tu depósito a plazo fijo fue registrado.</p>
                  <div style={{ background:'#F4F6FB', borderRadius:12, padding:16, textAlign:'left', fontSize:13, display:'flex', flexDirection:'column', gap:8 }}>
                    <div style={{ display:'flex', justifyContent:'space-between' }}><span style={{ color:'#7B84A3' }}>Monto depositado</span><strong>{fmt(resultado.deposito?.deposito?.monto)}</strong></div>
                    <div style={{ display:'flex', justifyContent:'space-between' }}><span style={{ color:'#7B84A3' }}>Interés estimado</span><strong style={{ color:TEAL }}>{fmt(resultado.deposito?.interes_estimado)}</strong></div>
                    <div style={{ display:'flex', justifyContent:'space-between' }}><span style={{ color:'#7B84A3' }}>Recibirás al vencimiento</span><strong style={{ color:'#6B21A8' }}>{fmt(resultado.deposito?.monto_final)}</strong></div>
                    <div style={{ display:'flex', justifyContent:'space-between' }}><span style={{ color:'#7B84A3' }}>Vence el</span><strong>{resultado.deposito?.deposito?.fecha_vencimiento}</strong></div>
                  </div>
                  <button onClick={() => setModalAbierto(false)} className="btn-primary" style={{ width:'100%', marginTop:18, fontSize:14 }}>Listo</button>
                </div>
              ) : (
                /* Formulario */
                <>
                  {esPlazoLibre && (
                    <div style={{ background:'#FEF3C7', border:'1px solid #FCD34D', borderRadius:10, padding:'10px 14px', fontSize:12.5, color:'#92400E', marginBottom:16 }}>
                      El <strong>Plazo Libre</strong> no es un depósito a plazo fijo. Elegí 30, 90 o 180 días en las tasas para abrir uno.
                    </div>
                  )}
                  <label style={{ display:'block', fontSize:13, fontWeight:600, color:'#374060', marginBottom:6 }}>Monto a depositar</label>
                  <div style={{ display:'flex', alignItems:'center', border:`1.5px solid ${saldoInsuficiente ? '#DC2626' : '#E2E8F6'}`, borderRadius:10, padding:'10px 14px', marginBottom:6 }}>
                    <span style={{ color:'#7B84A3', fontWeight:600, marginRight:8 }}>S/</span>
                    <input type="number" value={montoPF} onChange={e => setMontoPF(e.target.value)}
                      placeholder="0.00" min={0} max={saldo}
                      style={{ border:'none', outline:'none', fontSize:16, width:'100%', fontFamily:"'Sora',sans-serif", color:NAVY }}/>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:11.5, marginBottom:16 }}>
                    <span style={{ color: saldoInsuficiente ? '#DC2626' : '#7B84A3' }}>
                      {saldoInsuficiente ? 'Saldo insuficiente' : `Disponible: ${fmt(saldo)}`}
                    </span>
                    <button onClick={() => setMontoPF(String(Math.floor(saldo)))}
                      style={{ background:'none', border:'none', color:TEAL, fontWeight:700, cursor:'pointer', fontSize:11.5 }}>Usar todo</button>
                  </div>

                  {/* Resumen del cálculo */}
                  {montoNum > 0 && !esPlazoLibre && (
                    <div style={{ background:'#F4F6FB', borderRadius:12, padding:16, fontSize:13, display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
                      <div style={{ display:'flex', justifyContent:'space-between' }}><span style={{ color:'#7B84A3' }}>Plazo</span><strong>{tasaSel.plazo_dias} días</strong></div>
                      <div style={{ display:'flex', justifyContent:'space-between' }}><span style={{ color:'#7B84A3' }}>Tasa (TEA)</span><strong>{tasaSel.tasa}</strong></div>
                      <div style={{ display:'flex', justifyContent:'space-between' }}><span style={{ color:'#7B84A3' }}>Interés estimado</span><strong style={{ color:TEAL }}>{fmt(interesPF)}</strong></div>
                      <div style={{ borderTop:'1px solid #E2E8F6', paddingTop:8, display:'flex', justifyContent:'space-between' }}>
                        <span style={{ color:'#374060', fontWeight:600 }}>Recibirás al vencimiento</span>
                        <strong style={{ color:'#6B21A8', fontFamily:"'Sora',sans-serif" }}>{fmt(montoFinalPF)}</strong>
                      </div>
                    </div>
                  )}

                  {resultado && !resultado.ok && (
                    <div style={{ background:'#FEE2E2', border:'1px solid #FCA5A5', borderRadius:10, padding:'10px 14px', fontSize:12.5, color:'#B91C1C', marginBottom:16 }}>
                      {resultado.msg}
                    </div>
                  )}

                  <button onClick={confirmarPlazoFijo}
                    disabled={procesando || montoNum <= 0 || saldoInsuficiente || esPlazoLibre || !cuentaAhorro}
                    className="btn-primary" style={{ width:'100%', fontSize:14, opacity: (procesando || montoNum <= 0 || saldoInsuficiente || esPlazoLibre) ? 0.5 : 1 }}>
                    {procesando ? 'Procesando…' : `Confirmar depósito de ${fmt(montoNum)}`}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}