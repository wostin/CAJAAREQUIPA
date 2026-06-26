// src/pages/homebanking/Transacciones.jsx — v14: íconos SVG, datos reales, export CSV
import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import api from '../../api/axios';
import Icon from '../../components/Icon';
import { useAuth } from '../../context/AuthContext';

const NAVY = '#0D2461', TEAL = '#00A896';
const fmt = n => `S/ ${Math.abs(n || 0).toLocaleString('es-PE', { minimumFractionDigits:2 })}`;

const CANAL_LABELS = { homebanking:'HomeBanking', app_movil:'App Móvil', ventanilla:'Ventanilla', atm:'Cajero ATM', api:'API', pago_servicio:'Pago servicio' };

// Estilos compartidos para campos con ícono
const lblStyle   = { display:'block', fontSize:12, fontWeight:600, color:'#374060', marginBottom:6 };
const helpStyle  = { fontSize:11, color:'#9AA2BC', marginTop:5 };
const fieldWrap  = { display:'flex', alignItems:'center', gap:8, background:'#fff', border:'1.5px solid #E2E8F6', borderRadius:9, padding:'9px 12px' };
const fieldInput = { flex:1, border:'none', background:'none', outline:'none', fontSize:13, color:'#0D2461', fontFamily:"'DM Sans',sans-serif", width:'100%' };
const CANAL_COLORS = { homebanking:'#0D2461', app_movil:'#00A896', ventanilla:'#F97316', atm:'#6B21A8', api:'#374060', pago_servicio:'#0EA5E9' };

// Devuelve la fecha y hora actual en formato 'YYYY-MM-DDTHH:mm' (lo que entiende datetime-local)
function ahoraLocal() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
}

const DEMO_TX = [
  { id:'t1',  tipo:'credito', descripcion:'Abono sueldo — Textilería Andina SAC',  canal:'homebanking', monto:3200,   fecha:'2026-05-23', saldo_post:16510 },
  { id:'t2',  tipo:'debito',  descripcion:'Pago servicio — SEAL Eléctrica',        canal:'app_movil',   monto:142.50, fecha:'2026-05-22', saldo_post:13310 },
  { id:'t3',  tipo:'debito',  descripcion:'Transferencia — Juan Condori Pari',     canal:'homebanking', monto:500,    fecha:'2026-05-21', saldo_post:13167 },
  { id:'t4',  tipo:'debito',  descripcion:'Cuota préstamo MYPE #12 — 36 meses',    canal:'ventanilla',  monto:1420,   fecha:'2026-05-20', saldo_post:13667 },
  { id:'t5',  tipo:'credito', descripcion:'Depósito efectivo — Agencia Huancayo',  canal:'atm',         monto:2000,   fecha:'2026-05-18', saldo_post:15087 },
  { id:'t6',  tipo:'debito',  descripcion:'Pago agua — SEDAM Huancayo',            canal:'app_movil',   monto:52.50,  fecha:'2026-05-16', saldo_post:13087 },
  { id:'t7',  tipo:'credito', descripcion:'Transferencia recibida — Rosa Flores',  canal:'api',         monto:800,    fecha:'2026-05-15', saldo_post:13140 },
  { id:'t8',  tipo:'debito',  descripcion:'Pago internet — Claro 50 Mbps',         canal:'homebanking', monto:89,     fecha:'2026-05-14', saldo_post:12340 },
  { id:'t9',  tipo:'credito', descripcion:'Abono intereses — Cuenta Ahorro Plus',  canal:'homebanking', monto:24.15,  fecha:'2026-05-12', saldo_post:12429 },
  { id:'t10', tipo:'debito',  descripcion:'Retiro ATM — Agencia Centro',           canal:'atm',         monto:300,    fecha:'2026-05-10', saldo_post:12405 },
];

const PIE_COLORS = ['#0D2461','#00A896','#F97316','#6B21A8','#374060','#0EA5E9'];

// Construye serie mensual abonos vs cargos desde transacciones reales
function buildMensual(txs) {
  const porMes = {};
  txs.slice().reverse().forEach(t => {
    const mes = new Date(t.fecha).toLocaleDateString('es-PE', { month:'short' });
    if (!porMes[mes]) porMes[mes] = { mes, abonos:0, cargos:0 };
    if (t.tipo === 'credito') porMes[mes].abonos += Number(t.monto);
    else porMes[mes].cargos += Number(t.monto);
  });
  return Object.values(porMes).slice(-5);
}
// Distribución por canal desde transacciones reales
function buildCanal(txs) {
  const c = {};
  txs.forEach(t => { c[t.canal] = (c[t.canal] || 0) + 1; });
  const total = txs.length || 1;
  return Object.entries(c).map(([k, v]) => ({ name: CANAL_LABELS[k] || k, value: Math.round((v/total)*100), canal:k }));
}

export default function HBTransacciones() {
  const { perfil } = useAuth();
  const [txs, setTxs]           = useState(DEMO_TX);
  const [usandoReal, setUsandoReal] = useState(false);
  const [cuentas, setCuentas]   = useState([]);
  const [filtro, setFiltro]     = useState('todos');
  const [busqueda, setBusqueda] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ cuenta_id:'', tipo:'credito', descripcion:'', monto:'', canal:'homebanking', fecha:ahoraLocal(), estado:'completada' });
  const [msg, setMsg]           = useState('');
  const [enviando, setEnviando] = useState(false);
  const [verSaldo, setVerSaldo] = useState(true);

  async function cargar() {
    try {
      const [rC, rT] = await Promise.all([
        api.get('/api/cuentas').catch(() => ({ data:{ data:[] } })),
        api.get('/api/transacciones'),
      ]);
      setCuentas(rC.data?.data || []);
      const lista = rT.data?.data || [];
      if (lista.length) { setTxs(lista); setUsandoReal(true); }
    } catch { /* quedan demo */ }
  }
  useEffect(() => { cargar(); }, []);

  const txFiltradas = txs.filter(t => {
    const okTipo = filtro === 'todos' || t.tipo === filtro;
    const okBusq = !busqueda || (t.descripcion || '').toLowerCase().includes(busqueda.toLowerCase());
    return okTipo && okBusq;
  });

  const totalAbonos = txs.filter(t => t.tipo === 'credito').reduce((a, t) => a + Number(t.monto), 0);
  const totalCargos = txs.filter(t => t.tipo === 'debito').reduce((a, t) => a + Number(t.monto), 0);
  const dataMensual = buildMensual(txs);
  const dataCanal   = buildCanal(txs);

  // ── Cuenta seleccionada en el formulario y saldos en vivo ──
  const cuentaSel    = cuentas.find(c => c.id === form.cuenta_id) || null;
  const saldoActual  = cuentaSel ? Number(cuentaSel.saldo || 0) : null;
  const montoNum     = Number(form.monto) || 0;
  const saldoNuevo   = saldoActual != null
    ? (form.tipo === 'credito' ? saldoActual + montoNum : saldoActual - montoNum)
    : null;
  const saldoInsuficiente = form.tipo === 'debito' && saldoActual != null && montoNum > saldoActual;
  const nombreCliente = [perfil?.nombre, perfil?.apellido].filter(Boolean).join(' ') || 'Cliente';
  const inicial = (perfil?.nombre || 'C').trim().charAt(0).toUpperCase();
  const monedaCuenta = cuentaSel?.moneda || cuentaSel?.cuentas?.moneda || 'PEN';
  const monedaLabel  = monedaCuenta === 'USD' ? 'Dólares (US$)' : 'Soles (S/)';

  const registrar = async (e) => {
    e.preventDefault(); setMsg('');
    if (!form.cuenta_id) { setMsg('❌ Selecciona una cuenta.'); return; }
    if (montoNum <= 0)   { setMsg('❌ El monto debe ser mayor a 0.'); return; }
    if (saldoInsuficiente) { setMsg('❌ Saldo insuficiente para este retiro.'); return; }
    setEnviando(true);
    try {
      const payload = {
        cuenta_id: form.cuenta_id, tipo: form.tipo, descripcion: form.descripcion,
        monto: montoNum, canal: form.canal, estado: form.estado,
      };
      if (form.fecha) payload.fecha = new Date(form.fecha).toISOString();
      await api.post('/api/transacciones', payload);
      setMsg('✅ Transacción registrada correctamente');
      setForm(f => ({ ...f, descripcion:'', monto:'', fecha:ahoraLocal() }));
      await cargar();
    } catch (err) { setMsg('❌ ' + (err.response?.data?.message || 'Error al registrar. Verifica el saldo disponible.')); }
    finally { setEnviando(false); }
  };

  const exportarCSV = () => {
    const header = ['Fecha','Descripcion','Canal','Tipo','Monto','SaldoPost'];
    const rows = txFiltradas.map(t => [
      t.fecha, `"${(t.descripcion||'').replace(/"/g,'""')}"`,
      CANAL_LABELS[t.canal] || t.canal, t.tipo,
      (t.tipo === 'credito' ? '' : '-') + Number(t.monto).toFixed(2),
      t.saldo_post != null ? Number(t.saldo_post).toFixed(2) : '',
    ]);
    const csv = [header, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type:'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `movimientos_${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h1 style={{ fontFamily:"'Sora',sans-serif", fontSize:20, fontWeight:700, color:NAVY, marginBottom:4 }}>Mis Movimientos</h1>
          <p style={{ fontSize:13, color:'#7B84A3', display:'flex', alignItems:'center', gap:6 }}>
            Historial de transacciones · {txs.length} registros
            {usandoReal && <span style={{ display:'inline-flex', alignItems:'center', gap:4, color:TEAL, fontWeight:600 }}><Icon name="checkCircle" size={13} color={TEAL}/> datos reales</span>}
          </p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary" style={{ display:'inline-flex', alignItems:'center', gap:7 }}>
          <Icon name={showForm ? 'close' : 'plus'} size={16} color="#fff"/> {showForm ? 'Cerrar' : 'Registrar movimiento'}
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14 }}>
        {[
          { label:'Total abonos', val: fmt(totalAbonos), color:'#15803D', bg:'#DCFCE7', icon:'arrowUp' },
          { label:'Total cargos', val: fmt(totalCargos), color:'#DC2626', bg:'#FEE2E2', icon:'arrowDown' },
          { label:'Flujo neto',   val: fmt(totalAbonos - totalCargos), color: totalAbonos >= totalCargos ? '#15803D' : '#DC2626', bg: totalAbonos >= totalCargos ? '#DCFCE7' : '#FEE2E2', icon:'transfer' },
        ].map(k => (
          <div key={k.label} className="card" style={{ display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ width:44, height:44, borderRadius:12, background:k.bg, display:'grid', placeItems:'center', flexShrink:0 }}>
              <Icon name={k.icon} size={21} color={k.color}/>
            </div>
            <div>
              <div style={{ fontSize:12, color:'#7B84A3', marginBottom:2 }}>{k.label}</div>
              <div style={{ fontFamily:"'Sora',sans-serif", fontSize:18, fontWeight:700, color:k.color }}>{k.val}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Gráficos */}
      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:14 }}>
        <div className="card">
          <div style={{ fontFamily:"'Sora',sans-serif", fontSize:14, fontWeight:700, color:NAVY, marginBottom:4 }}>Abonos vs Cargos</div>
          <div style={{ fontSize:12, color:'#7B84A3', marginBottom:14 }}>{usandoReal ? 'Calculado de tus movimientos reales' : 'Últimos meses en Soles'}</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={dataMensual}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F4F6FB"/>
              <XAxis dataKey="mes" tick={{ fontSize:11 }}/>
              <YAxis tick={{ fontSize:10 }} tickFormatter={v => `S/${(v/1000).toFixed(0)}K`}/>
              <Tooltip formatter={(v, n) => [fmt(v), n === 'abonos' ? 'Abonos' : 'Cargos']}/>
              <Bar dataKey="abonos" fill={TEAL} radius={[4,4,0,0]} name="abonos"/>
              <Bar dataKey="cargos" fill="#F97316" radius={[4,4,0,0]} name="cargos"/>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <div style={{ fontFamily:"'Sora',sans-serif", fontSize:14, fontWeight:700, color:NAVY, marginBottom:4 }}>Por canal</div>
          <div style={{ fontSize:12, color:'#7B84A3', marginBottom:8 }}>Distribución de operaciones</div>
          <ResponsiveContainer width="100%" height={130}>
            <PieChart>
              <Pie data={dataCanal} dataKey="value" cx="50%" cy="50%" outerRadius={58} innerRadius={28}>
                {dataCanal.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]}/>)}
              </Pie>
              <Tooltip formatter={(v, n) => [`${v}%`, n]}/>
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display:'flex', flexDirection:'column', gap:4, marginTop:8 }}>
            {dataCanal.map((d, i) => (
              <div key={d.name} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11 }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background:PIE_COLORS[i % PIE_COLORS.length], flexShrink:0 }}/>
                <span style={{ flex:1, color:'#374060' }}>{d.name}</span>
                <span style={{ fontWeight:600, color:NAVY }}>{d.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Formulario */}
      {showForm && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {/* ── Tarjeta resumen de cuenta ── */}
          <div className="card" style={{ display:'flex', alignItems:'center', gap:0, flexWrap:'wrap', padding:0, overflow:'hidden', border:'1px solid #E6EAF4' }}>
            {/* Cliente */}
            <div style={{ display:'flex', alignItems:'center', gap:13, padding:'18px 22px', flex:'1 1 220px', minWidth:220 }}>
              <div style={{ width:48, height:48, borderRadius:'50%', background:'linear-gradient(135deg,#1A3A8F,#0D2461)', display:'grid', placeItems:'center', flexShrink:0 }}>
                <Icon name="user" size={24} color="#fff"/>
              </div>
              <div>
                <div style={{ fontFamily:"'Sora',sans-serif", fontSize:14.5, fontWeight:700, color:NAVY }}>{nombreCliente}</div>
                <div style={{ fontSize:12, color:'#7B84A3' }}>DNI: {perfil?.dni || '—'}</div>
                <span style={{ display:'inline-flex', alignItems:'center', gap:4, marginTop:4, fontSize:11, fontWeight:600, color:'#15803D', background:'#DCFCE7', padding:'2px 9px', borderRadius:50 }}>
                  <Icon name="checkCircle" size={11} color="#15803D"/> Cliente Activo
                </span>
              </div>
            </div>
            {/* Cuenta */}
            <div style={{ padding:'18px 22px', flex:'1 1 200px', minWidth:180, borderLeft:'1px solid #EEF1F8' }}>
              <div style={{ fontSize:11, color:'#9AA2BC', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>Cuenta</div>
              <div style={{ fontSize:13.5, fontWeight:700, color:NAVY, textTransform:'capitalize' }}>{cuentaSel ? cuentaSel.tipo : 'Selecciona una cuenta'}</div>
              <div style={{ fontSize:12, color:'#7B84A3', marginTop:2 }}>{cuentaSel ? (cuentaSel.numero_cuenta || '—') : '—'}</div>
            </div>
            {/* Saldo */}
            <div style={{ padding:'18px 22px', flex:'1 1 180px', minWidth:170, borderLeft:'1px solid #EEF1F8' }}>
              <div style={{ fontSize:11, color:'#9AA2BC', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>Saldo disponible</div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontFamily:"'Sora',sans-serif", fontSize:21, fontWeight:800, color: saldoActual != null ? '#15803D' : '#A0A8C0' }}>
                  {saldoActual != null ? (verSaldo ? fmt(saldoActual) : 'S/ ••••••') : '—'}
                </span>
                {saldoActual != null && (
                  <button onClick={() => setVerSaldo(v => !v)} style={{ background:'none', border:'none', cursor:'pointer', padding:0, display:'flex' }}>
                    <Icon name={verSaldo ? 'eye' : 'eyeOff'} size={16} color="#7B84A3"/>
                  </button>
                )}
              </div>
            </div>
            {/* Estado */}
            <div style={{ padding:'18px 22px', flex:'1 1 150px', minWidth:140, borderLeft:'1px solid #EEF1F8' }}>
              <div style={{ fontSize:11, color:'#9AA2BC', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:6 }}>Estado de cuenta</div>
              <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:12, fontWeight:700,
                color: (cuentaSel?.estado === 'activa' || !cuentaSel) ? '#15803D' : '#B45309',
                background: (cuentaSel?.estado === 'activa' || !cuentaSel) ? '#DCFCE7' : '#FEF3C7',
                padding:'4px 12px', borderRadius:50, textTransform:'capitalize' }}>
                <span style={{ width:7, height:7, borderRadius:'50%', background: (cuentaSel?.estado === 'activa' || !cuentaSel) ? '#15803D' : '#B45309' }}/>
                {cuentaSel ? cuentaSel.estado : 'Activa'}
              </span>
            </div>
          </div>

          {/* ── Formulario ── */}
          <div className="card" style={{ padding:0, overflow:'hidden', border:'1px solid #E6EAF4', boxShadow:'0 4px 16px rgba(13,36,97,.08)' }}>
            {/* Encabezado */}
            <div style={{ display:'flex', alignItems:'center', gap:12, padding:'16px 22px', background:'linear-gradient(120deg,#0D2461,#16357e)' }}>
              <div style={{ width:38, height:38, borderRadius:10, background:'rgba(255,255,255,.14)', display:'grid', placeItems:'center', flexShrink:0 }}>
                <Icon name="plus" size={19} color="#fff"/>
              </div>
              <div>
                <div style={{ fontFamily:"'Sora',sans-serif", fontSize:15.5, fontWeight:700, color:'#fff' }}>Registrar transacción</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,.7)', marginTop:1 }}>Operaciones › Nuevo movimiento en cuenta</div>
              </div>
            </div>

            <div style={{ padding:'20px 22px' }}>
              {msg && (
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, padding:'10px 14px', borderRadius:10, fontSize:13, fontWeight:500,
                  background: msg.startsWith('✅') ? '#DCFCE7' : '#FEE2E2',
                  border: `1px solid ${msg.startsWith('✅') ? '#86EFAC' : '#FCA5A5'}`,
                  color: msg.startsWith('✅') ? '#15803D' : '#B91C1C' }}>
                  <Icon name={msg.startsWith('✅') ? 'checkCircle' : 'alert'} size={16} color={msg.startsWith('✅') ? '#15803D' : '#DC2626'}/>
                  <span>{msg.replace(/^[✅❌]\s*/, '')}</span>
                </div>
              )}
              <form onSubmit={registrar}>
                {/* Fila 1: Cuenta, Tipo, Canal */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14 }}>
                  <div>
                    <label style={lblStyle}>Cuenta <span style={{color:'#DC2626'}}>*</span></label>
                    <div style={fieldWrap}>
                      <Icon name="card" size={15} color="#7B84A3"/>
                      <select value={form.cuenta_id} onChange={e => setForm(f => ({...f, cuenta_id:e.target.value}))} required style={fieldInput}>
                        <option value="">Seleccionar...</option>
                        {cuentas.filter(c => c.estado === 'activa').map(c => (
                          <option key={c.id} value={c.id}>{c.tipo} — S/ {(c.saldo||0).toFixed(2)}</option>
                        ))}
                      </select>
                    </div>
                    {cuentas.length === 0 && (
                      <div style={{ fontSize:11.5, color:'#B45309', marginTop:6, display:'flex', alignItems:'center', gap:4 }}>
                        <Icon name="alert" size={12} color="#B45309"/> Sin cuentas activas. Abre una en "Mis Cuentas".
                      </div>
                    )}
                  </div>
                  <div>
                    <label style={lblStyle}>Tipo de operación <span style={{color:'#DC2626'}}>*</span></label>
                    <div style={fieldWrap}>
                      <Icon name={form.tipo === 'credito' ? 'arrowUp' : 'arrowDown'} size={15} color={form.tipo === 'credito' ? '#15803D' : '#DC2626'}/>
                      <select value={form.tipo} onChange={e => setForm(f => ({...f, tipo:e.target.value}))} style={fieldInput}>
                        <option value="credito">Abono / Depósito</option>
                        <option value="debito">Cargo / Retiro</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={lblStyle}>Canal <span style={{color:'#DC2626'}}>*</span></label>
                    <div style={fieldWrap}>
                      <Icon name="smartphone" size={15} color="#7B84A3"/>
                      <select value={form.canal} onChange={e => setForm(f => ({...f, canal:e.target.value}))} style={fieldInput}>
                        {Object.entries(CANAL_LABELS).filter(([k]) => k !== 'pago_servicio').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Fila 2: Fecha, Moneda, Estado */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14, marginTop:14 }}>
                  <div>
                    <label style={lblStyle}>Fecha y hora</label>
                    <div style={fieldWrap}>
                      <Icon name="calendar" size={15} color="#7B84A3"/>
                      <input type="datetime-local" value={form.fecha} onChange={e => setForm(f => ({...f, fecha:e.target.value}))} style={fieldInput}/>
                    </div>
                    <div style={helpStyle}>Se completa automáticamente con la fecha y hora actual</div>
                  </div>
                  <div>
                    <label style={lblStyle}>Moneda</label>
                    <div style={{ ...fieldWrap, background:'#F4F6FB' }}>
                      <Icon name="money" size={15} color="#7B84A3"/>
                      <input value={monedaLabel} readOnly disabled style={{ ...fieldInput, color:'#374060', cursor:'not-allowed' }}/>
                    </div>
                    <div style={helpStyle}>Determinada por la cuenta</div>
                  </div>
                  <div>
                    <label style={lblStyle}>Estado <span style={{color:'#DC2626'}}>*</span></label>
                    <div style={fieldWrap}>
                      <Icon name="checkCircle" size={15} color="#15803D"/>
                      <select value={form.estado} onChange={e => setForm(f => ({...f, estado:e.target.value}))} style={fieldInput}>
                        <option value="completada">Completada</option>
                        <option value="sospechosa">Pendiente / Revisión</option>
                        <option value="reversada">Reversada</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Fila 3: Descripción + Monto */}
                <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:14, marginTop:14 }}>
                  <div>
                    <label style={lblStyle}>Descripción <span style={{color:'#DC2626'}}>*</span></label>
                    <div style={fieldWrap}>
                      <Icon name="edit" size={15} color="#7B84A3"/>
                      <input value={form.descripcion} maxLength={200} onChange={e => setForm(f => ({...f, descripcion:e.target.value}))} required style={fieldInput} placeholder="Ej. Abono sueldo, Pago servicio..."/>
                    </div>
                    <div style={{ ...helpStyle, textAlign:'right' }}>{form.descripcion.length}/200</div>
                  </div>
                  <div>
                    <label style={lblStyle}>Monto (S/) <span style={{color:'#DC2626'}}>*</span></label>
                    <div style={{ ...fieldWrap, borderColor: saldoInsuficiente ? '#FCA5A5' : '#E2E8F6' }}>
                      <span style={{ fontSize:13, fontWeight:700, color:'#7B84A3' }}>S/</span>
                      <input type="number" min="0.01" step="0.01" value={form.monto} onChange={e => setForm(f => ({...f, monto:e.target.value}))} required style={fieldInput} placeholder="0.00"/>
                    </div>
                    {saldoActual != null && (
                      <div style={{ ...helpStyle, color: saldoInsuficiente ? '#B91C1C' : '#7B84A3' }}>
                        {saldoInsuficiente ? 'Supera el saldo disponible' : `Monto máximo disponible: ${fmt(saldoActual)}`}
                      </div>
                    )}
                  </div>
                </div>

                {/* Recuadro saldo anterior → resultante */}
                {cuentaSel && (
                  <div style={{ display:'flex', alignItems:'center', gap:20, flexWrap:'wrap', background:'#F4F6FB', border:'1px solid #E6EAF4', borderRadius:12, padding:'14px 18px', marginTop:16 }}>
                    <div>
                      <div style={{ fontSize:11, color:'#9AA2BC', textTransform:'uppercase', letterSpacing:'.05em' }}>Saldo anterior</div>
                      <div style={{ fontWeight:700, color:NAVY, fontSize:15 }}>{fmt(saldoActual)}</div>
                    </div>
                    <Icon name="arrowRight" size={16} color="#A0A8C0"/>
                    <div>
                      <div style={{ fontSize:11, color:'#9AA2BC', textTransform:'uppercase', letterSpacing:'.05em' }}>Monto operación</div>
                      <div style={{ fontWeight:700, fontSize:15, color: form.tipo === 'credito' ? '#15803D' : '#DC2626' }}>
                        {form.tipo === 'credito' ? '+ ' : '- '}{fmt(montoNum)}
                      </div>
                    </div>
                    <Icon name="arrowRight" size={16} color="#A0A8C0"/>
                    <div>
                      <div style={{ fontSize:11, color:'#9AA2BC', textTransform:'uppercase', letterSpacing:'.05em' }}>Saldo resultante</div>
                      <div style={{ fontWeight:800, fontSize:16, color: saldoInsuficiente ? '#DC2626' : '#0EA5E9', fontFamily:"'Sora',sans-serif" }}>{fmt(saldoNuevo)}</div>
                    </div>
                  </div>
                )}

                {/* Botones */}
                <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:20, paddingTop:16, borderTop:'1px solid #EEF1F8' }}>
                  <button type="button" onClick={() => setShowForm(false)} className="btn-secondary" style={{ fontFamily:'inherit' }}>Cancelar</button>
                  <button type="submit" disabled={enviando || saldoInsuficiente} className="btn-primary" style={{ fontFamily:'inherit', minWidth:160, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6, opacity: saldoInsuficiente ? .6 : 1 }}>
                    {enviando ? 'Procesando…' : <><Icon name="check" size={15} color="#fff"/> Registrar transacción</>}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Filtros + tabla */}
      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #DDE2F0', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, background:'#F0F4FF', border:'1.5px solid #E2E8F6', borderRadius:9, padding:'7px 12px', width:240 }}>
            <Icon name="search" size={15} color="#7B84A3"/>
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar transacción..." style={{ border:'none', background:'none', outline:'none', fontSize:13, width:'100%', color:NAVY, fontFamily:"'DM Sans',sans-serif" }}/>
          </div>
          <div style={{ display:'flex', gap:4 }}>
            {[['todos','Todos'],['credito','Abonos'],['debito','Cargos']].map(([k, l]) => (
              <button key={k} onClick={() => setFiltro(k)} style={{ padding:'7px 14px', borderRadius:8, border:'none', fontSize:12, fontWeight:600, cursor:'pointer', background: filtro === k ? NAVY : '#F4F6FB', color: filtro === k ? '#fff' : '#374060', fontFamily:'inherit' }}>{l}</button>
            ))}
          </div>
          <span style={{ fontSize:12, color:'#7B84A3', marginLeft:'auto' }}>{txFiltradas.length} transacciones</span>
        </div>

        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', fontSize:13, borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'#F4F6FB' }}>
                {['Fecha','Descripción','Canal','Tipo','Monto','Saldo post'].map(h => (
                  <th key={h} style={{ textAlign: h === 'Monto' || h === 'Saldo post' ? 'right' : 'left', padding:'10px 16px', fontSize:11, fontWeight:600, color:'#7B84A3', textTransform:'uppercase', letterSpacing:'.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {txFiltradas.map(t => (
                <tr key={t.id} style={{ borderBottom:'1px solid #F4F6FB' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#FAFBFE'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding:'12px 16px', color:'#7B84A3', fontSize:12, whiteSpace:'nowrap' }}>
                    {new Date(t.fecha).toLocaleDateString('es-PE', { day:'2-digit', month:'short', year:'numeric' })}
                  </td>
                  <td style={{ padding:'12px 16px', fontWeight:500, color:NAVY, maxWidth:280 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ width:26, height:26, borderRadius:7, background: t.tipo === 'credito' ? '#DCFCE7' : '#FEE2E2', display:'grid', placeItems:'center', flexShrink:0 }}>
                        <Icon name={t.tipo === 'credito' ? 'arrowUp' : 'arrowDown'} size={14} color={t.tipo === 'credito' ? '#15803D' : '#DC2626'}/>
                      </div>
                      <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.descripcion}</span>
                    </div>
                  </td>
                  <td style={{ padding:'12px 16px' }}>
                    <span style={{ fontSize:11, background: (CANAL_COLORS[t.canal]||'#374060') + '15', color: CANAL_COLORS[t.canal]||'#374060', padding:'2px 8px', borderRadius:6, fontWeight:600 }}>
                      {CANAL_LABELS[t.canal] || t.canal}
                    </span>
                  </td>
                  <td style={{ padding:'12px 16px' }}>
                    <span style={{ fontSize:11, fontWeight:600, color: t.tipo === 'credito' ? '#15803D' : '#DC2626', background: t.tipo === 'credito' ? '#DCFCE7' : '#FEE2E2', padding:'2px 8px', borderRadius:6 }}>
                      {t.tipo === 'credito' ? 'Abono' : 'Cargo'}
                    </span>
                  </td>
                  <td style={{ padding:'12px 16px', textAlign:'right', fontWeight:700, fontSize:14, color: t.tipo === 'credito' ? '#15803D' : '#DC2626' }}>
                    {t.tipo === 'credito' ? '+' : '-'}{fmt(t.monto)}
                  </td>
                  <td style={{ padding:'12px 16px', textAlign:'right', color:'#374060', fontSize:12 }}>
                    {t.saldo_post != null ? fmt(t.saldo_post) : '—'}
                  </td>
                </tr>
              ))}
              {txFiltradas.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign:'center', padding:'40px', color:'#7B84A3' }}>Sin transacciones para los filtros aplicados</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ padding:'12px 20px', background:'#F4F6FB', borderTop:'1px solid #DDE2F0', fontSize:11, color:'#7B84A3', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ display:'inline-flex', alignItems:'center', gap:5 }}><Icon name="shield" size={13} color="#7B84A3"/> Datos en tiempo real · Supabase · RLS activo</span>
          <button onClick={exportarCSV} style={{ display:'inline-flex', alignItems:'center', gap:5, background:'none', border:'none', color:TEAL, cursor:'pointer', fontSize:11.5, fontWeight:600 }}>
            <Icon name="download" size={13} color={TEAL}/> Exportar CSV
          </button>
        </div>
      </div>
    </div>
  );
}