// src/pages/core/Clientes.jsx — Cartera de clientes con proceso crediticio completo
import { useState, useEffect } from 'react';
import Icon from '../../components/Icon';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';

// Cálculo cuota francesa
const calcCuota = (M, n, tea = 0.60) => {
  const tem = Math.pow(1 + tea, 1/12) - 1;
  if (tem === 0) return M / n;
  return M * tem * Math.pow(1+tem, n) / (Math.pow(1+tem, n) - 1);
};

const tem60 = Math.pow(1.60, 1/12) - 1;

// Mora SBS
const clasificarMora = dias => {
  if (dias === 0)    return { cat:'Normal',     color:'#15803D', bg:'#DCFCE7', urgente:false };
  if (dias <= 8)     return { cat:'CPP',         color:'#D97706', bg:'#FEF3C7', urgente:false };
  if (dias <= 30)    return { cat:'Deficiente',  color:'#C2410C', bg:'#FFEDD5', urgente:false };
  if (dias <= 60)    return { cat:'Dudoso',      color:'#B91C1C', bg:'#FEE2E2', urgente:true  };
  return               { cat:'Pérdida',       color:'#7F1D1D', bg:'#FCA5A5', urgente:true  };
};

const ESTADOS = {
  pendiente:      { label:'Pendiente',          color:'#6B7280', bg:'#F3F4F6' },
  en_evaluacion:  { label:'En evaluación',      color:'#2563EB', bg:'#DBEAFE' },
  aprobado:       { label:'Aprobado',           color:'#15803D', bg:'#DCFCE7' },
  rechazado:      { label:'Rechazado',          color:'#DC2626', bg:'#FEE2E2' },
  desembolsado:   { label:'Desembolsado',     color:'#7C3AED', bg:'#EDE9FE' },
};

const CLIENTES = [
  { id:'c1', nombre:'Carlos Alberto Mamani Quispe', dni:'29834521', email:'c.mamani@gmail.com', telefono:'959 123 456',
    negocio:'Bodega El Progreso', tipo_negocio:'Bodega / Abarrotes', distrito:'Huancayo',
    score:672, segmento:'PREMIER', techo:5000,
    prestamo:{ monto:4500, plazo:12, mora_dias:0, estado:'desembolsado', fecha_desembolso:'2026-02-15', cuotas_pagadas:3 },
    saldo_capital:3210.80, fecha_prox_cuota:'2026-06-05' },
  { id:'c2', nombre:'Rosa Elena Flores Ccori', dni:'40123678', email:'r.flores@hotmail.com', telefono:'958 654 321',
    negocio:'Salón de belleza Rosa', tipo_negocio:'Servicios Generales', distrito:'El Tambo',
    score:511, segmento:'ESTANDAR', techo:2500,
    prestamo:{ monto:2000, plazo:12, mora_dias:5, estado:'desembolsado', fecha_desembolso:'2026-01-10', cuotas_pagadas:4 },
    saldo_capital:1560.20, fecha_prox_cuota:'2026-06-10' },
  { id:'c3', nombre:'Juan Carlos Condori Pari', dni:'43210987', email:'j.condori@gmail.com', telefono:'957 111 222',
    negocio:'Taller mecánico JC', tipo_negocio:'Servicios Generales', distrito:'Chilca',
    score:388, segmento:'BASICO', techo:1000,
    prestamo:{ monto:800, plazo:12, mora_dias:22, estado:'desembolsado', fecha_desembolso:'2025-12-01', cuotas_pagadas:5 },
    saldo_capital:542.30, fecha_prox_cuota:'2026-05-28' },
  { id:'c4', nombre:'Ana María Quispe Ccama', dni:'45678901', email:'a.quispe@gmail.com', telefono:'956 777 888',
    negocio:'Tienda de ropa Ana', tipo_negocio:'Textilería / Confecciones', distrito:'Huancayo',
    score:589, segmento:'ESTANDAR', techo:2500,
    prestamo:{ monto:2200, plazo:12, mora_dias:0, estado:'aprobado', fecha_desembolso:null, cuotas_pagadas:0 },
    saldo_capital:0, fecha_prox_cuota:null },
  { id:'c5', nombre:'Pedro Huanca Turpo', dni:'32156789', email:'p.huanca@gmail.com', telefono:'955 444 555',
    negocio:'Puesto mercado central', tipo_negocio:'Bodega / Abarrotes', distrito:'Chilca',
    score:245, segmento:'NO_APLICA', techo:0,
    prestamo:{ monto:500, plazo:12, mora_dias:75, estado:'desembolsado', fecha_desembolso:'2025-10-01', cuotas_pagadas:7 },
    saldo_capital:310.10, fecha_prox_cuota:'2026-04-15' },
  { id:'c6', nombre:'María Elena Paredes Vda. de Llerena', dni:'28945612', email:'m.paredes@gmail.com', telefono:'954 222 333',
    negocio:'Farmacia Santa Elena', tipo_negocio:'Salud / Farmacia', distrito:'Huancayo',
    score:634, segmento:'PREMIER', techo:5000,
    prestamo:null, saldo_capital:0, fecha_prox_cuota:null },
  { id:'c7', nombre:'Jorge Luis Sulca Vera', dni:'47891023', email:'j.sulca@gmail.com', telefono:'953 888 999',
    negocio:'Restaurante El Buen Sabor', tipo_negocio:'Restaurante / Pollería', distrito:'El Tambo',
    score:456, segmento:'ESTANDAR', techo:2500,
    prestamo:{ monto:1800, plazo:6, mora_dias:0, estado:'en_evaluacion', fecha_desembolso:null, cuotas_pagadas:0 },
    saldo_capital:0, fecha_prox_cuota:null },
];

function ScoreBadge({ score, segmento }) {
  const cfg = {
    PREMIER:  { color:'#92400E', bg:'#FEF3C7' },
    ESTANDAR: { color:'#3730A3', bg:'#E0E7FF' },
    BASICO:   { color:'#065F46', bg:'#D1FAE5' },
    NO_APLICA:{ color:'#374151', bg:'#F3F4F6' },
  }[segmento] || { color:'#374060', bg:'#F4F6FB' };
  return (
    <span style={{ fontSize:11, fontWeight:700, color:cfg.color, background:cfg.bg, padding:'3px 8px', borderRadius:50, whiteSpace:'nowrap' }}>
      {segmento === 'PREMIER' && '⭐ '}{score} · {segmento}
    </span>
  );
}

function ModalExpediente({ c, onClose }) {
  const [estado, setEstado] = useState(c.prestamo?.estado || '');
  const [obs, setObs]       = useState('');
  const [guardado, setGuardado] = useState(false);
  const mora = c.prestamo ? clasificarMora(c.prestamo.mora_dias) : null;
  const cuota = c.prestamo ? calcCuota(c.prestamo.monto, c.prestamo.plazo, 0.60) : 0;
  // Tabla amortización (primeras 6 cuotas)
  let saldo = c.prestamo?.monto || 0;
  const tabla = c.prestamo ? Array.from({ length: Math.min(c.prestamo.plazo, 6) }, (_, i) => {
    const interes = saldo * tem60;
    const capital = cuota - interes;
    saldo = Math.max(saldo - capital, 0);
    return { n: i+1, cuota, interes, capital, saldo, pagada: i < c.prestamo.cuotas_pagadas };
  }) : [];

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:16, overflowY:'auto' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:'#fff', borderRadius:20, width:'100%', maxWidth:680, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 24px 60px rgba(0,0,0,.3)' }}>
        {/* Header */}
        <div style={{ background:'linear-gradient(135deg,#0D2461,#1A3A8F)', borderRadius:'20px 20px 0 0', padding:'20px 24px', color:'#fff' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div>
              <div style={{ fontFamily:"'Sora',sans-serif", fontSize:18, fontWeight:700 }}>{c.nombre}</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,.7)', marginTop:2 }}>DNI: {c.dni} · {c.email} · {c.telefono}</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,.6)', marginTop:1 }}>{c.negocio} · {c.tipo_negocio} · {c.distrito}</div>
            </div>
            <button onClick={onClose} style={{ background:'rgba(255,255,255,.15)', border:'none', color:'#fff', borderRadius:8, width:32, height:32, cursor:'pointer', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
          </div>
        </div>

        <div style={{ padding:24, display:'flex', flexDirection:'column', gap:16 }}>
          {/* Scoring */}
          <div style={{ background:'#F4F6FB', borderRadius:12, padding:14 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#374060', marginBottom:8, textTransform:'uppercase', letterSpacing:'.06em' }}>Score Transaccional · Modelo 800 pts</div>
            <div style={{ display:'flex', alignItems:'center', gap:16 }}>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontFamily:"'Sora',sans-serif", fontSize:36, fontWeight:800, color: c.score >= 600 ? '#F59E0B' : c.score >= 440 ? '#6366F1' : c.score >= 280 ? '#22C55E' : '#9CA3AF' }}>{c.score}</div>
                <ScoreBadge score={c.score} segmento={c.segmento}/>
              </div>
              <div style={{ flex:1 }}>
                <div style={{ height:10, background:'#DDE2F0', borderRadius:5, overflow:'hidden', marginBottom:6 }}>
                  <div style={{ height:'100%', borderRadius:5, background:`linear-gradient(90deg,#EF4444,#FACC15,#22C55E)`, width:`${(c.score/800)*100}%` }}/>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'#7B84A3' }}>
                  <span>0</span><span>280 BÁSICO</span><span>440 EST.</span><span>600 PREMIER</span><span>800</span>
                </div>
                <div style={{ marginTop:10, display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  <div style={{ background:'#fff', borderRadius:8, padding:'8px 12px' }}>
                    <div style={{ fontSize:11, color:'#7B84A3' }}>Techo crediticio</div>
                    <div style={{ fontWeight:700, color:'#DC2626', fontSize:16 }}>{c.techo > 0 ? `S/ ${c.techo.toLocaleString()}` : 'No aplica'}</div>
                  </div>
                  <div style={{ background:'#fff', borderRadius:8, padding:'8px 12px' }}>
                    <div style={{ fontSize:11, color:'#7B84A3' }}>Cuota estimada</div>
                    <div style={{ fontWeight:700, color:'#0D2461', fontSize:16 }}>
                      {c.techo > 0 ? `S/ ${calcCuota(c.techo, 12, 0.60).toFixed(2)}` : '—'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Préstamo */}
          {c.prestamo ? (
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:'#374060', marginBottom:10, textTransform:'uppercase', letterSpacing:'.06em' }}>Préstamo activo</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:12 }}>
                {[
                  ['Monto original',  `S/ ${c.prestamo.monto.toLocaleString('es-PE')}`],
                  ['Cuota mensual',   `S/ ${cuota.toFixed(2)}`],
                  ['Saldo capital',   c.saldo_capital > 0 ? `S/ ${c.saldo_capital.toFixed(2)}` : 'Sin saldo'],
                  ['TEA aplicada',    '60% anual'],
                  ['TEM',             `${(tem60*100).toFixed(4)}%`],
                  ['Plazo',           `${c.prestamo.plazo} meses`],
                ].map(([l,v]) => (
                  <div key={l} style={{ background:'#F4F6FB', borderRadius:8, padding:'8px 12px' }}>
                    <div style={{ fontSize:11, color:'#7B84A3' }}>{l}</div>
                    <div style={{ fontWeight:700, color:'#0D2461', fontSize:14 }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Mora */}
              {mora && c.prestamo.estado === 'desembolsado' && (
                <div style={{ background:mora.bg, borderRadius:10, padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                  <div>
                    <span style={{ fontWeight:700, color:mora.color }}>Clasificación SBS: {mora.cat}</span>
                    <span style={{ color:'#7B84A3', fontSize:12, marginLeft:8 }}>(Res. 11356-2008)</span>
                  </div>
                  <span style={{ fontWeight:700, color:mora.color, fontSize:16 }}>
                    {c.prestamo.mora_dias === 0 ? <span style={{display:'inline-flex',alignItems:'center',gap:4}}>Al día <Icon name='check' size={12} color='#15803D'/></span> : `${c.prestamo.mora_dias} días de atraso`}
                  </span>
                </div>
              )}
              {mora?.urgente && (
                <div style={{ background:'#FEE2E2', border:'1px solid #FECACA', borderRadius:10, padding:'10px 14px', fontSize:12, color:'#7F1D1D', marginBottom:12 }}>
                  <Icon name='alert' size={15} color='#B91C1C' style={{display:'inline',verticalAlign:'-2px',marginRight:5}}/><strong>Acción requerida:</strong> Crédito en categoría <strong>{mora.cat}</strong>. Coordinar con jefatura y área legal para cobranza coactiva. Registrar gestión en sistema.
                </div>
              )}

              {/* Tabla amortización */}
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:'#374060', marginBottom:8 }}>Tabla de amortización · Primeras {tabla.length} cuotas (método francés)</div>
                <div style={{ overflowX:'auto', borderRadius:10, border:'1px solid #DDE2F0' }}>
                  <table style={{ width:'100%', fontSize:12, borderCollapse:'collapse' }}>
                    <thead>
                      <tr style={{ background:'#F4F6FB' }}>
                        {['#','Cuota','Interés','Capital','Saldo','Estado'].map(h => (
                          <th key={h} style={{ padding:'8px 10px', textAlign:'right', fontSize:10, fontWeight:700, color:'#7B84A3', textTransform:'uppercase', letterSpacing:'.06em' }}>{h === '#' ? <span style={{ paddingLeft:10 }}>#</span> : h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tabla.map(r => (
                        <tr key={r.n} style={{ borderTop:'1px solid #F4F6FB', background: r.pagada ? '#F0FDF4' : 'transparent' }}>
                          <td style={{ padding:'7px 10px', fontWeight:600, color:'#7B84A3', textAlign:'center' }}>{r.n}</td>
                          <td style={{ padding:'7px 10px', textAlign:'right', fontWeight:700 }}>S/ {r.cuota.toFixed(2)}</td>
                          <td style={{ padding:'7px 10px', textAlign:'right', color:'#F97316' }}>S/ {r.interes.toFixed(2)}</td>
                          <td style={{ padding:'7px 10px', textAlign:'right', color:'#00A896' }}>S/ {r.capital.toFixed(2)}</td>
                          <td style={{ padding:'7px 10px', textAlign:'right', color:'#0D2461', fontWeight:600 }}>S/ {r.saldo.toFixed(2)}</td>
                          <td style={{ padding:'7px 10px', textAlign:'center' }}>
                            <span style={{ fontSize:10, fontWeight:600, color: r.pagada ? '#15803D' : '#7B84A3', background: r.pagada ? '#DCFCE7' : '#F4F6FB', padding:'2px 6px', borderRadius:4 }}>
                              {r.pagada ? <span style={{display:'inline-flex',alignItems:'center',gap:3}}><Icon name='check' size={11} color='#15803D'/> Pagada</span> : 'Pendiente'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ fontSize:11, color:'#7B84A3', marginTop:6 }}>
                  <Icon name='calculator' size={13} color='#7B84A3' style={{display:'inline',verticalAlign:'-2px',marginRight:4}}/>TEM = (1+60%)^(1/12)−1 = {(tem60*100).toFixed(4)}% · Cuota = M×TEM/[1−(1+TEM)^−n]
                </div>
              </div>

              {/* Cambiar estado */}
              <div style={{ marginTop:14, background:'#F4F6FB', borderRadius:10, padding:14 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#374060', marginBottom:10 }}>Actualizar estado de crédito</div>
                <div style={{ display:'flex', gap:8, marginBottom:8 }}>
                  <select value={estado} onChange={e => setEstado(e.target.value)} className="input-field" style={{ flex:2, fontSize:13 }}>
                    {Object.entries(ESTADOS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <button onClick={() => setGuardado(true)} className="btn-primary" style={{ fontFamily:'inherit', minWidth:100 }}>
                    {guardado ? <span style={{display:'inline-flex',alignItems:'center',gap:4}}><Icon name='check' size={13} color='#fff'/> Guardado</span> : 'Actualizar'}
                  </button>
                </div>
                <input value={obs} onChange={e => setObs(e.target.value)} placeholder="Observación del asesor (opcional)..." className="input-field" style={{ fontSize:13 }}/>
              </div>
            </div>
          ) : (
            <div style={{ background:'#F4F6FB', borderRadius:12, padding:20, textAlign:'center' }}>
              <div style={{ display:'grid', placeItems:'center', marginBottom:8 }}><Icon name='star' size={32} color='#FFB300'/></div>
              <div style={{ fontWeight:600, color:'#0D2461', marginBottom:4 }}>Sin préstamo activo</div>
              <div style={{ fontSize:13, color:'#7B84A3' }}>Elegible para crédito hasta <strong>{c.techo > 0 ? `S/ ${c.techo.toLocaleString()}` : 'verificar scoring'}</strong></div>
              <div style={{ fontSize:12, color:'#7B84A3', marginTop:4 }}>Iniciar ficha de campo para evaluación presencial</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CoreClientes() {
  const { perfil } = useAuth();
  const [busqueda, setBusqueda]     = useState('');
  const [filtroSeg, setFiltroSeg]   = useState('');
  const [filtroMora, setFiltroMora] = useState('');
  const [abierto, setAbierto]       = useState(null);

  const [clientesReales, setClientesReales] = useState(null);
  useEffect(() => {
    api.get('/api/dashboard/clientes')
      .then(r => { const rows = r.data?.data || []; if (rows.length) setClientesReales(rows); })
      .catch(() => {});
  }, []);
  const BASE = clientesReales || CLIENTES;

  const filtrados = BASE.filter(c => {
    const okB = !busqueda || c.nombre.toLowerCase().includes(busqueda.toLowerCase()) || c.dni.includes(busqueda);
    const okS = !filtroSeg  || c.segmento === filtroSeg;
    const okM = !filtroMora || (
      filtroMora === 'normal'   ? c.prestamo?.mora_dias === 0 :
      filtroMora === 'atraso'   ? (c.prestamo?.mora_dias||0) > 0 :
      filtroMora === 'critico'  ? (c.prestamo?.mora_dias||0) > 30 : true
    );
    return okB && okS && okM;
  });

  const stats = {
    total:    BASE.length,
    alDia:    BASE.filter(c => c.prestamo && c.prestamo.mora_dias === 0).length,
    atraso:   BASE.filter(c => c.prestamo && c.prestamo.mora_dias > 0).length,
    critico:  BASE.filter(c => c.prestamo && c.prestamo.mora_dias > 30).length,
    cartera:  BASE.filter(c => c.saldo_capital > 0).reduce((a, c) => a + c.saldo_capital, 0),
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      {abierto && <ModalExpediente c={abierto} onClose={() => setAbierto(null)}/>}

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <h1 style={{ fontFamily:"'Sora',sans-serif", fontSize:20, fontWeight:700, color:'#0D2461', marginBottom:4 }}>Cartera de Clientes</h1>
          <p style={{ fontSize:13, color:'#7B84A3' }}>{perfil?.nombre || 'Asesor'} · {BASE.length} clientes asignados · Zona Huancayo</p>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12 }}>
        {[
          { label:'Cartera',    val: BASE.length,                   color:'#0D2461', sub:'clientes' },
          { label:'Al día',     val: stats.alDia,                       color:'#15803D', sub:'Normal SBS' },
          { label:'Con atraso', val: stats.atraso,                      color:'#D97706', sub:'CPP/Deficiente' },
          { label:'Críticos',   val: stats.critico,                     color:'#DC2626', sub:'>30 días' },
          { label:'Saldo cap.', val: `S/ ${(stats.cartera/1000).toFixed(1)}K`, color:'#7C3AED', sub:'capital vivo' },
        ].map(k => (
          <div key={k.label} className="card" style={{ textAlign:'center', padding:14 }}>
            <div style={{ fontFamily:"'Sora',sans-serif", fontSize:22, fontWeight:800, color:k.color }}>{k.val}</div>
            <div style={{ fontSize:11, color:'#7B84A3', fontWeight:600 }}>{k.label}</div>
            <div style={{ fontSize:10, color:'#9CA3AF' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Alerta críticos */}
      {stats.critico > 0 && (
        <div style={{ background:'#FEE2E2', border:'1px solid #FECACA', borderRadius:12, padding:'12px 16px', display:'flex', alignItems:'center', gap:10, fontSize:13, color:'#7F1D1D' }}>
          <Icon name='alert' size={15} color='#B91C1C' style={{display:'inline',verticalAlign:'-2px',marginRight:5}}/><strong>{stats.critico} cliente(s)</strong> con más de 30 días de mora (Dudoso/Pérdida). Requieren gestión inmediata. Ver expediente para coordinar cobranza.
        </div>
      )}

      {/* Filtros */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar nombre o DNI..." className="input-field" style={{ width:240, fontSize:13 }}/>
        <select value={filtroSeg} onChange={e => setFiltroSeg(e.target.value)} className="input-field" style={{ width:150, fontSize:13 }}>
          <option value="">Segmentos</option>
          {['PREMIER','ESTANDAR','BASICO','NO_APLICA'].map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={filtroMora} onChange={e => setFiltroMora(e.target.value)} className="input-field" style={{ width:150, fontSize:13 }}>
          <option value="">Mora SBS</option>
          <option value="normal">Normal</option>
          <option value="atraso">Con atraso</option>
          <option value="critico">Críticos +30d</option>
        </select>
      </div>

      {/* Cards clientes */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        {filtrados.map(c => {
          const mora  = c.prestamo ? clasificarMora(c.prestamo.mora_dias) : null;
          const est   = c.prestamo ? ESTADOS[c.prestamo.estado] : null;
          const cuota = c.prestamo ? calcCuota(c.prestamo.monto, c.prestamo.plazo, 0.60) : 0;
          return (
            <div key={c.id} onClick={() => setAbierto(c)}
              style={{ borderRadius:14, border:`1.5px solid ${mora?.urgente ? '#FECACA' : '#DDE2F0'}`, padding:16, cursor:'pointer', background:'#fff', transition:'.2s', borderLeft:`4px solid ${mora?.color || '#DDE2F0'}` }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 8px 24px rgba(13,36,97,.1)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                <div>
                  <div style={{ fontWeight:700, color:'#0D2461', fontSize:14 }}>{c.nombre}</div>
                  <div style={{ fontSize:11, color:'#7B84A3' }}>DNI {c.dni} · {c.negocio} · {c.distrito}</div>
                </div>
                <ScoreBadge score={c.score} segmento={c.segmento}/>
              </div>
              {c.prestamo ? (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
                  <div style={{ background:'#F4F6FB', borderRadius:8, padding:'8px', textAlign:'center' }}>
                    <div style={{ fontSize:10, color:'#7B84A3' }}>Cuota</div>
                    <div style={{ fontWeight:700, color:'#0D2461', fontSize:13 }}>S/ {cuota.toFixed(0)}</div>
                  </div>
                  <div style={{ background:'#F4F6FB', borderRadius:8, padding:'8px', textAlign:'center' }}>
                    <div style={{ fontSize:10, color:'#7B84A3' }}>Saldo cap.</div>
                    <div style={{ fontWeight:700, color:'#0D2461', fontSize:13 }}>
                      {c.saldo_capital > 0 ? `S/ ${c.saldo_capital.toFixed(0)}` : '—'}
                    </div>
                  </div>
                  <div style={{ background: mora?.bg || '#F4F6FB', borderRadius:8, padding:'8px', textAlign:'center' }}>
                    <div style={{ fontSize:10, color:'#7B84A3' }}>Mora SBS</div>
                    <div style={{ fontWeight:700, color: mora?.color || '#7B84A3', fontSize:13 }}>
                      {c.prestamo.mora_dias === 0 ? 'Normal' : `${c.prestamo.mora_dias}d`}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ background:'#F4F6FB', borderRadius:8, padding:10, textAlign:'center', fontSize:12, color:'#7B84A3' }}>
                  Sin préstamo · Elegible S/ {c.techo > 0 ? c.techo.toLocaleString() : '—'}
                </div>
              )}
              {est && (
                <div style={{ marginTop:8 }}>
                  <span style={{ fontSize:11, fontWeight:600, color:est.color, background:est.bg, padding:'2px 8px', borderRadius:4 }}>{est.label}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {filtrados.length === 0 && <div style={{ textAlign:'center', padding:40, color:'#7B84A3' }}>Sin resultados</div>}
      <p style={{ fontSize:12, color:'#7B84A3', textAlign:'center' }}>Haz click en un cliente para ver su expediente completo y tabla de amortización</p>
    </div>
  );
}
