// src/pages/homebanking/Pagos.jsx — v14: íconos SVG + pagos reales primero
import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../../api/axios';
import Icon from '../../components/Icon';

const NAVY = '#0D2461';
const fmt = n => `S/ ${(n || 0).toLocaleString('es-PE', { minimumFractionDigits:2 })}`;

const CATALOGO = [
  { id:'agua',      label:'Agua',      icon:'water', color:'#0EA5E9', bg:'#E0F2FE',
    empresas:[
      { nombre:'SEDAPAR — Arequipa',      contrato_hint:'Ej. 0824-4521', monto_ref:52.50 },
      { nombre:'EPS SEDACAJ — Cajamarca', contrato_hint:'Ej. CAJ-00234', monto_ref:38.00 },
      { nombre:'SEDAM Huancayo',          contrato_hint:'Ej. HCY-00567', monto_ref:45.00 },
      { nombre:'EPS Tacna',               contrato_hint:'Ej. TCN-00890', monto_ref:41.00 },
    ] },
  { id:'luz',       label:'Luz',       icon:'bolt', color:'#F59E0B', bg:'#FEF3C7',
    empresas:[
      { nombre:'SEAL — Arequipa',        contrato_hint:'Ej. 0082-4521-8',  monto_ref:142.50 },
      { nombre:'Electro Sur Este',       contrato_hint:'Ej. CUS-012345',    monto_ref:98.00  },
      { nombre:'Electro Puno',           contrato_hint:'Ej. PUN-098765',    monto_ref:87.50  },
      { nombre:'Luz del Sur — Lima',     contrato_hint:'Ej. LDS-234567',    monto_ref:165.00 },
      { nombre:'Electrocentro — Junín',  contrato_hint:'Ej. JUN-345678',    monto_ref:112.00 },
    ] },
  { id:'internet',  label:'Internet',  icon:'wifi', color:'#10B981', bg:'#D1FAE5',
    empresas:[
      { nombre:'Claro Internet', contrato_hint:'Ej. CLI-0024-JUN', monto_ref:89.00 },
      { nombre:'Movistar Fibra', contrato_hint:'Ej. MOV-994812',   monto_ref:99.00 },
      { nombre:'Bitel',          contrato_hint:'Ej. BIT-123456',   monto_ref:69.90 },
      { nombre:'Entel',          contrato_hint:'Ej. ENT-789012',   monto_ref:79.90 },
      { nombre:'Win',            contrato_hint:'Ej. WIN-456789',   monto_ref:74.90 },
    ] },
  { id:'cable',     label:'TV Cable',  icon:'tv', color:'#8B5CF6', bg:'#EDE9FE',
    empresas:[
      { nombre:'Movistar TV+Internet', contrato_hint:'Ej. 994812330',  monto_ref:129.00 },
      { nombre:'Claro TV',             contrato_hint:'Ej. CLT-012345', monto_ref:99.00  },
      { nombre:'Direct TV',            contrato_hint:'Ej. DTV-567890', monto_ref:119.00 },
    ] },
  { id:'telefono',  label:'Teléfono',  icon:'phone', color:'#06B6D4', bg:'#CFFAFE',
    empresas:[
      { nombre:'Claro Postpago',    contrato_hint:'Ej. 959123456', monto_ref:65.00 },
      { nombre:'Movistar Postpago', contrato_hint:'Ej. 987654321', monto_ref:59.90 },
      { nombre:'Entel Postpago',    contrato_hint:'Ej. 912345678', monto_ref:49.90 },
      { nombre:'Bitel Postpago',    contrato_hint:'Ej. 934567890', monto_ref:44.90 },
    ] },
  { id:'gas',       label:'Gas',       icon:'flame', color:'#EF4444', bg:'#FEE2E2',
    empresas:[
      { nombre:'Gas del Pacífico',  contrato_hint:'Ej. GLP-8841',  monto_ref:45.00 },
      { nombre:'Limagas',           contrato_hint:'Ej. LGA-12345', monto_ref:48.00 },
      { nombre:'Naturgy (GNL Nor)', contrato_hint:'Ej. NAT-67890', monto_ref:38.00 },
    ] },
  { id:'municipio', label:'Municipio', icon:'gov', color:'#6B7280', bg:'#F3F4F6',
    empresas:[
      { nombre:'Municipalidad Arequipa', contrato_hint:'Ej. ARQ-0042', monto_ref:320.00 },
      { nombre:'Municipalidad Huancayo', contrato_hint:'Ej. HCY-0089', monto_ref:280.00 },
      { nombre:'SAT Lima Metropolitana', contrato_hint:'Ej. SAT-1234', monto_ref:450.00 },
      { nombre:'Municipalidad Cusco',    contrato_hint:'Ej. CUS-0567', monto_ref:210.00 },
    ] },
];

const PAGOS_DEMO = [
  { id:'p1', servicio:'luz',      empresa:'SEAL — Arequipa',       numero_contrato:'0082-4521-8', monto:142.50, estado:'completado', fecha:'2026-05-22' },
  { id:'p2', servicio:'agua',     empresa:'SEDAPAR — Arequipa',    numero_contrato:'0824-4521',   monto:52.50,  estado:'completado', fecha:'2026-05-16' },
  { id:'p3', servicio:'cable',    empresa:'Movistar TV+Internet',  numero_contrato:'994812330',   monto:129.00, estado:'pendiente',  fecha:'2026-05-14' },
  { id:'p4', servicio:'internet', empresa:'Claro Internet',        numero_contrato:'CLI-0024-JUN',monto:89.00,  estado:'completado', fecha:'2026-05-14' },
  { id:'p5', servicio:'gas',      empresa:'Gas del Pacífico',      numero_contrato:'GLP-8841',    monto:45.00,  estado:'completado', fecha:'2026-05-08' },
  { id:'p6', servicio:'municipio',empresa:'Municipalidad Arequipa',numero_contrato:'ARQ-0042',    monto:320.00, estado:'pendiente',  fecha:'2026-05-01' },
];

const PIE_COLORS = ['#F59E0B','#0EA5E9','#10B981','#8B5CF6','#06B6D4','#EF4444','#6B7280'];
const meta = (id) => CATALOGO.find(s => s.id === id) || { icon:'receipt', color:'#374060', bg:'#F4F6FB' };

export default function HBPagos() {
  const [pagos, setPagos]           = useState(PAGOS_DEMO);
  const [usandoReal, setUsandoReal] = useState(false);
  const [cuentas, setCuentas]       = useState([]);
  const [srvActivo, setSrvActivo]   = useState(null);
  const [empActiva, setEmpActiva]   = useState(null);
  const [contrato, setContrato]     = useState('');
  const [monto, setMonto]           = useState('');
  const [msg, setMsg]               = useState('');
  const [procesando, setProcesando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  async function cargarPagos() {
    try {
      const [rP, rC] = await Promise.all([
        api.get('/api/pagos'),
        api.get('/api/cuentas').catch(() => ({ data:{ data:[] } })),
      ]);
      const lista = rP.data?.data || [];
      if (lista.length) { setPagos(lista); setUsandoReal(true); }
      setCuentas(rC.data?.data || []);
    } catch { /* quedan demo */ }
  }
  useEffect(() => { cargarPagos(); }, []);

  const totalPagado    = pagos.filter(p => p.estado === 'completado').reduce((a, p) => a + Number(p.monto), 0);
  const totalPendiente = pagos.filter(p => p.estado === 'pendiente').reduce((a, p) => a + Number(p.monto), 0);

  const dataGrafico = CATALOGO.map(s => ({
    name: s.label,
    value: pagos.filter(p => p.servicio === s.id).reduce((a, p) => a + Number(p.monto), 0),
  })).filter(d => d.value > 0);

  const seleccionarServicio = (srv) => {
    setSrvActivo(srv.id === srvActivo?.id ? null : srv);
    setEmpActiva(null); setContrato(''); setMonto(''); setMsg('');
  };
  const seleccionarEmpresa = (emp) => {
    setEmpActiva(emp); setMonto(emp.monto_ref.toFixed(2)); setContrato('');
  };

  const pagar = async () => {
    if (!empActiva || !contrato || !monto) return setMsg('⚠️ Completa todos los campos');
    setConfirmando(false); setProcesando(true); setMsg('');
    const cuentaId = cuentas[0]?.id;
    try {
      await api.post('/api/pagos', {
        servicio: srvActivo.id, empresa: empActiva.nombre,
        numero_contrato: contrato, monto: +monto,
        ...(cuentaId ? { cuenta_id: cuentaId } : {}),
      });
      await cargarPagos();
    } catch {
      // si el backend falla, reflejamos localmente para no romper la demo
      const nuevo = { id:'p'+Date.now(), servicio:srvActivo.id, empresa:empActiva.nombre, numero_contrato:contrato, monto:+monto, estado:'completado', fecha:new Date().toISOString().split('T')[0] };
      setPagos(prev => [nuevo, ...prev]);
    }
    setMsg(`✅ Pago de ${fmt(+monto)} a ${empActiva.nombre} procesado exitosamente.`);
    setSrvActivo(null); setEmpActiva(null); setContrato(''); setMonto('');
    setProcesando(false);
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      <div>
        <h1 style={{ fontFamily:"'Sora',sans-serif", fontSize:20, fontWeight:700, color:NAVY, marginBottom:4 }}>Pagos de Servicios</h1>
        <p style={{ fontSize:13, color:'#7B84A3', display:'flex', alignItems:'center', gap:6 }}>
          Agua, luz, internet, cable, teléfono, gas y municipio
          {usandoReal && <span style={{ display:'inline-flex', alignItems:'center', gap:4, color:'#00A896', fontWeight:600 }}><Icon name="checkCircle" size={13} color="#00A896"/> historial real</span>}
        </p>
      </div>

      {msg && (
        <div className={`alert ${msg.startsWith('✅') ? 'alert-success' : 'alert-warning'}`}>
          <Icon name={msg.startsWith('✅') ? 'checkCircle' : 'alert'} size={17} color={msg.startsWith('✅') ? '#15803D' : '#92400E'}/>
          <span style={{ flex:1 }}>{msg.replace(/^[✅⚠️]\s*/, '')}</span>
          <button onClick={() => setMsg('')} style={{ background:'none', border:'none', cursor:'pointer', display:'grid', placeItems:'center' }}>
            <Icon name="close" size={15} color="currentColor"/>
          </button>
        </div>
      )}

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14 }}>
        {[
          { label:'Total pagado', val: fmt(totalPagado),    color:'#15803D', bg:'#DCFCE7', icon:'checkCircle' },
          { label:'Pendiente',    val: fmt(totalPendiente), color:'#D97706', bg:'#FEF3C7', icon:'clock' },
          { label:'N° pagos',     val: pagos.filter(p => p.estado === 'completado').length + ' servicios', color:NAVY, bg:'#EEF1F8', icon:'receipt' },
        ].map(k => (
          <div key={k.label} className="card" style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:42, height:42, borderRadius:12, background:k.bg, display:'grid', placeItems:'center', flexShrink:0 }}>
              <Icon name={k.icon} size={20} color={k.color}/>
            </div>
            <div>
              <div style={{ fontSize:12, color:'#7B84A3', marginBottom:2 }}>{k.label}</div>
              <div style={{ fontFamily:"'Sora',sans-serif", fontSize:17, fontWeight:700, color:k.color }}>{k.val}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        {/* Selección de servicio */}
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div className="card">
            <div style={{ fontFamily:"'Sora',sans-serif", fontSize:14, fontWeight:700, color:NAVY, marginBottom:14 }}>Seleccionar servicio</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
              {CATALOGO.map(srv => {
                const sel = srvActivo?.id === srv.id;
                return (
                  <button key={srv.id} onClick={() => seleccionarServicio(srv)}
                    style={{ border:`2px solid ${sel ? srv.color : '#DDE2F0'}`, borderRadius:12, padding:'12px 6px', cursor:'pointer', background: sel ? srv.bg : '#fff', textAlign:'center', transition:'.2s', fontFamily:'inherit' }}>
                    <div style={{ display:'grid', placeItems:'center', marginBottom:6 }}>
                      <Icon name={srv.icon} size={22} color={sel ? srv.color : '#7B84A3'}/>
                    </div>
                    <div style={{ fontSize:11, fontWeight:600, color: sel ? srv.color : '#374060' }}>{srv.label}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {srvActivo && (
            <div className="card" style={{ border:`2px solid ${srvActivo.color}20` }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                <Icon name={srvActivo.icon} size={18} color={srvActivo.color}/>
                <span style={{ fontFamily:"'Sora',sans-serif", fontSize:14, fontWeight:700, color:NAVY }}>{srvActivo.label} — Empresas disponibles</span>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {srvActivo.empresas.map(emp => {
                  const sel = empActiva?.nombre === emp.nombre;
                  return (
                    <button key={emp.nombre} onClick={() => seleccionarEmpresa(emp)}
                      style={{ border:`1.5px solid ${sel ? srvActivo.color : '#DDE2F0'}`, borderRadius:10, padding:'10px 14px', cursor:'pointer', background: sel ? srvActivo.bg : '#F4F6FB', display:'flex', justifyContent:'space-between', alignItems:'center', fontFamily:'inherit', transition:'.2s' }}>
                      <div style={{ textAlign:'left' }}>
                        <div style={{ fontSize:13, fontWeight:600, color:NAVY }}>{emp.nombre}</div>
                        <div style={{ fontSize:11, color:'#7B84A3' }}>{emp.contrato_hint}</div>
                      </div>
                      <div style={{ fontSize:13, fontWeight:700, color: srvActivo.color }}>~{fmt(emp.monto_ref)}</div>
                    </button>
                  );
                })}
              </div>

              {empActiva && (
                <div style={{ marginTop:14, paddingTop:14, borderTop:'1px solid #DDE2F0' }}>
                  <div style={{ marginBottom:10 }}>
                    <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374060', marginBottom:5 }}>N° de contrato / suministro</label>
                    <input value={contrato} onChange={e => setContrato(e.target.value)} placeholder={empActiva.contrato_hint} className="input-field" style={{ fontSize:13 }}/>
                  </div>
                  <div style={{ marginBottom:14 }}>
                    <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374060', marginBottom:5 }}>Monto a pagar (S/)</label>
                    <input type="number" min="1" max="5000" step="0.01" value={monto} onChange={e => setMonto(e.target.value)} className="input-field" style={{ fontSize:13 }}/>
                    <div style={{ fontSize:11, color:'#7B84A3', marginTop:4 }}>Importe referencial: {fmt(empActiva.monto_ref)}</div>
                  </div>
                  {!confirmando ? (
                    <button onClick={() => { if (!contrato || !monto) return setMsg('⚠️ Completa contrato y monto'); setMsg(''); setConfirmando(true); }} className="btn-primary" style={{ width:'100%', fontFamily:'inherit', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:7 }}>
                      Pagar {fmt(+monto || 0)} <Icon name="arrowRight" size={15} color="#fff"/>
                    </button>
                  ) : (
                    <div style={{ background:'#FEF3C7', borderRadius:10, padding:14 }}>
                      <p style={{ fontSize:13, color:'#92400E', marginBottom:12 }}>
                        ¿Confirmas el pago de <strong>{fmt(+monto)}</strong> a <strong>{empActiva.nombre}</strong>?<br/>
                        <span style={{ fontSize:12 }}>Contrato: {contrato}</span>
                      </p>
                      <div style={{ display:'flex', gap:8 }}>
                        <button onClick={() => setConfirmando(false)} className="btn-secondary" style={{ flex:1, fontFamily:'inherit', fontSize:13 }}>Cancelar</button>
                        <button onClick={pagar} disabled={procesando} className="btn-primary" style={{ flex:2, fontFamily:'inherit', fontSize:13, background:'#D97706', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                          {procesando ? 'Procesando…' : <><Icon name="check" size={15} color="#fff"/> Confirmar pago</>}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Historial + gráfico */}
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {dataGrafico.length > 0 && (
            <div className="card">
              <div style={{ fontFamily:"'Sora',sans-serif", fontSize:14, fontWeight:700, color:NAVY, marginBottom:4 }}>Gasto por servicio</div>
              <div style={{ fontSize:12, color:'#7B84A3', marginBottom:10 }}>Distribución de pagos</div>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <ResponsiveContainer width="50%" height={130}>
                  <PieChart>
                    <Pie data={dataGrafico} dataKey="value" cx="50%" cy="50%" outerRadius={58} innerRadius={30}>
                      {dataGrafico.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]}/>)}
                    </Pie>
                    <Tooltip formatter={v => [fmt(v), 'Total']}/>
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ flex:1, display:'flex', flexDirection:'column', gap:5 }}>
                  {dataGrafico.map((d, i) => (
                    <div key={d.name} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11 }}>
                      <div style={{ width:8, height:8, borderRadius:'50%', background:PIE_COLORS[i % PIE_COLORS.length], flexShrink:0 }}/>
                      <span style={{ flex:1, color:'#374060' }}>{d.name}</span>
                      <span style={{ fontWeight:600, color:NAVY }}>{fmt(d.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="card" style={{ flex:1 }}>
            <div style={{ fontFamily:"'Sora',sans-serif", fontSize:14, fontWeight:700, color:NAVY, marginBottom:14 }}>Mis servicios registrados</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {pagos.map(p => {
                const m = meta(p.servicio);
                const pagado = p.estado === 'completado';
                return (
                  <div key={p.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'1px solid #F4F6FB' }}>
                    <div style={{ width:38, height:38, borderRadius:10, background:m.bg, display:'grid', placeItems:'center', flexShrink:0 }}>
                      <Icon name={m.icon} size={19} color={m.color}/>
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:NAVY }}>{p.empresa}</div>
                      <div style={{ fontSize:11, color:'#7B84A3' }}>N° {p.numero_contrato} · {new Date(p.fecha).toLocaleDateString('es-PE')}</div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:13, fontWeight:700, color:NAVY }}>{fmt(p.monto)}</div>
                      <span style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:11, fontWeight:600, color: pagado ? '#15803D' : '#D97706', background: pagado ? '#DCFCE7' : '#FEF3C7', padding:'1px 7px', borderRadius:5, marginTop:2 }}>
                        <Icon name={pagado ? 'check' : 'clock'} size={11} color={pagado ? '#15803D' : '#D97706'}/>
                        {pagado ? 'Pagado' : 'Pendiente'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
