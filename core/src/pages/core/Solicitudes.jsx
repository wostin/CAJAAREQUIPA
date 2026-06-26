// src/pages/core/Solicitudes.jsx — Bandeja de flujo de trabajo (estilo Banco Andino)
// El cliente envía desde el Homebanking (:5174); aquí el personal consulta,
// registra y gestiona las solicitudes de crédito hasta el desembolso.
import { useState, useEffect, useCallback, useMemo } from 'react';
import Icon from '../../components/Icon';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';

const NAVY = '#0d2461', TEAL = '#0fa0ad', MUTE = '#7b89a3', LINE = '#e9edf4';
const ESTADOS = {
  pendiente:     { bg: '#FEF3C7', fg: '#92400E', lbl: 'Pendiente' },
  en_evaluacion: { bg: '#DBEAFE', fg: '#1D4ED8', lbl: 'En Evaluación' },
  en_comite:     { bg: '#EDE9FE', fg: '#6D28D9', lbl: 'En Comité' },
  aprobado:      { bg: '#DCFCE7', fg: '#15803D', lbl: 'Aprobado' },
  desembolsado:  { bg: '#D1FAE5', fg: '#065F46', lbl: 'Desembolsado' },
  rechazado:     { bg: '#FEE2E2', fg: '#B91C1C', lbl: 'Rechazado' },
};
const fmt = (n) => 'S/ ' + Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 });
const codSol = (id) => 'SOL' + String(id || '').replace(/-/g, '').slice(0, 7).toUpperCase();

function rutaAprobacion(monto) {
  const m = Number(monto);
  if (m <= 5000)  return 'Asesor';
  if (m <= 20000) return 'Jefe Regional / Administrador';
  if (m <= 50000) return 'Unidad de Riesgos';
  return 'Comité de créditos';
}

// Tarjeta de sección con cabecera roja-suave tipo Banco Andino
function Seccion({ titulo, extra, children }) {
  return (
    <div style={{ background:'#fff', border:'1px solid '+LINE, borderRadius:12, marginBottom:14, overflow:'hidden', boxShadow:'0 1px 3px rgba(13,36,97,.05)' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 16px', background:'#F8FAFD', borderBottom:'1px solid '+LINE }}>
        <span style={{ fontSize:11.5, fontWeight:800, letterSpacing:.6, color:'#B3261E' }}>{titulo}</span>
        {extra}
      </div>
      <div style={{ padding:'14px 16px' }}>{children}</div>
    </div>
  );
}

const lbl = { display:'block', fontSize:10.5, fontWeight:700, color:MUTE, letterSpacing:.4, textTransform:'uppercase', marginBottom:3 };
const val = { fontSize:13.5, color:NAVY, fontWeight:700 };

// ── Evaluación de elegibilidad: ¿es SUJETO DE CRÉDITO? ──
// Reglas mínimas tipo Caja Municipal / SBS para créditos MYPE.
// Carga datos reales del cliente (perfil + score) vía /api/scoring/cliente/:id;
// si no hay score calculado aún, evalúa con lo disponible y marca lo pendiente.
function evaluarElegibilidad({ perfil, score, monto, plazo }) {
  const edad        = perfil?.edad ?? null;
  const antigNeg    = perfil?.antiguedad_negocio_meses ?? null;      // meses
  const ingreso     = perfil?.ingreso_promedio ?? perfil?.ingreso_mensual ?? null;
  const scoreFinal  = score?.score_final ?? score?.score_transaccional ?? null;
  const segmento    = score?.segmento_preliminar ?? score?.segmento ?? null;
  const diasMora    = perfil?.dias_mora ?? 0;
  const n           = Number(plazo) > 0 ? Number(plazo) : 12;        // plazo real de la solicitud
  const tem         = Math.pow(1.4092, 1/12) - 1;                    // TEM desde TEA 40.92%
  const cuotaEst    = monto ? (Number(monto) * tem) / (1 - Math.pow(1 + tem, -n)) : null;
  const rds         = (ingreso && cuotaEst) ? (cuotaEst / Number(ingreso)) : null; // ratio deuda/ingreso

  // Cada criterio: nombre, regla, valor real, ¿cumple?, peso (bloqueante o no)
  const criterios = [
    {
      nombre: 'Edad del titular',
      regla: '18 a 70 años',
      valor: edad != null ? `${edad} años` : 'Sin dato',
      cumple: edad != null ? (edad >= 18 && edad <= 70) : null,
      bloqueante: true,
    },
    {
      nombre: 'Antigüedad del negocio',
      regla: '≥ 6 meses de operación',
      valor: antigNeg != null ? `${antigNeg} meses` : 'Sin dato',
      cumple: antigNeg != null ? (antigNeg >= 6) : null,
      bloqueante: true,
    },
    {
      nombre: 'Ingreso mensual demostrable',
      regla: '≥ S/ 800',
      valor: ingreso != null ? `S/ ${Number(ingreso).toLocaleString('es-PE')}` : 'Sin dato',
      cumple: ingreso != null ? (Number(ingreso) >= 800) : null,
      bloqueante: true,
    },
    {
      nombre: 'Capacidad de pago (RDS)',
      regla: 'Cuota ≤ 40% del ingreso',
      valor: rds != null ? `${(rds * 100).toFixed(1)}%` : 'Sin dato',
      cumple: rds != null ? (rds <= 0.40) : null,
      bloqueante: true,
    },
    {
      nombre: 'Score interno',
      regla: '≥ 440 pts (no descalificado)',
      valor: scoreFinal != null ? `${scoreFinal} pts${segmento ? ` · ${segmento}` : ''}` : 'No calculado',
      cumple: scoreFinal != null ? (scoreFinal >= 440) : null,
      bloqueante: false,
    },
    {
      nombre: 'Historial RCC / SBS',
      regla: 'Sin clasificación Deficiente/Dudoso/Pérdida',
      valor: diasMora > 0 ? `${diasMora} días de mora` : 'Normal (sin deuda vencida)',
      cumple: diasMora <= 8,
      bloqueante: true,
    },
    {
      nombre: 'Monto solicitado',
      regla: 'Dentro del rango S/ 500 – 100,000',
      valor: monto ? `S/ ${Number(monto).toLocaleString('es-PE')}` : '—',
      cumple: monto ? (Number(monto) >= 500 && Number(monto) <= 100000) : null,
      bloqueante: true,
    },
  ];

  const evaluables = criterios.filter(c => c.cumple !== null);
  const bloqueantesFallidos = criterios.filter(c => c.bloqueante && c.cumple === false);
  const pendientes = criterios.filter(c => c.cumple === null);

  let veredicto;
  if (bloqueantesFallidos.length > 0)      veredicto = 'NO_ELEGIBLE';
  else if (pendientes.some(c => c.bloqueante)) veredicto = 'REQUIERE_DATOS';
  else if (criterios.some(c => !c.bloqueante && c.cumple === false)) veredicto = 'ELEGIBLE_CONDICIONAL';
  else if (pendientes.length > 0)          veredicto = 'ELEGIBLE_CONDICIONAL'; // falta algún no-bloqueante (ej. score)
  else                                      veredicto = 'ELEGIBLE';

  return { criterios, veredicto, cumplidos: evaluables.filter(c => c.cumple).length, total: evaluables.length };
}

function PanelElegibilidad({ sel, cliente }) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let ok = true;
    setCargando(true);
    api.get(`/api/scoring/cliente/${sel.user_id}`)
      .then(r => { if (ok) setDatos(r.data?.data || null); })
      .catch(() => { if (ok) setDatos(null); })
      .finally(() => { if (ok) setCargando(false); });
    return () => { ok = false; };
  }, [sel.user_id]);

  const { criterios, veredicto, cumplidos, total } = evaluarElegibilidad({
    perfil: datos?.perfil || datos?.features || {},
    score:  datos?.score || {},
    monto:  sel.monto,
    plazo:  sel.plazo_meses,
  });

  const estilos = {
    ELEGIBLE:             { bg:'#DCFCE7', fg:'#15803D', icon:'checkCircle', txt:'SUJETO DE CRÉDITO' },
    ELEGIBLE_CONDICIONAL: { bg:'#FEF3C7', fg:'#92400E', icon:'alert',       txt:'ELEGIBLE CON CONDICIONES' },
    REQUIERE_DATOS:       { bg:'#DBEAFE', fg:'#1D4ED8', icon:'search',      txt:'REQUIERE COMPLETAR EVALUACIÓN' },
    NO_ELEGIBLE:          { bg:'#FEE2E2', fg:'#B91C1C', icon:'close',       txt:'NO ES SUJETO DE CRÉDITO' },
  }[veredicto];

  return (
    <div style={{ border:'1px solid '+LINE, borderRadius:12, marginBottom:14, overflow:'hidden' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 16px', background:'#F8FAFD', borderBottom:'1px solid '+LINE }}>
        <span style={{ fontSize:11.5, fontWeight:800, letterSpacing:.6, color:'#B3261E' }}>ELEGIBILIDAD — ¿ES SUJETO DE CRÉDITO?</span>
        <span style={{ display:'inline-flex', alignItems:'center', gap:7, background:estilos.bg, color:estilos.fg, padding:'4px 12px', borderRadius:20, fontSize:11.5, fontWeight:800 }}>
          <Icon name={estilos.icon} size={14} color={estilos.fg}/> {estilos.txt}
        </span>
      </div>
      <div style={{ padding:'12px 16px' }}>
        {cargando ? (
          <div style={{ fontSize:12.5, color:MUTE, padding:'8px 0' }}>Evaluando criterios del cliente…</div>
        ) : (
          <>
            <div style={{ fontSize:12, color:MUTE, marginBottom:10 }}>
              Cumple <b style={{ color:NAVY }}>{cumplidos} de {total}</b> criterios evaluables ·
              Reglas mínimas tipo Caja Municipal / SBS para crédito MYPE
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {criterios.map(c => {
                const color = c.cumple === true ? '#15803D' : c.cumple === false ? '#B91C1C' : '#94A3B8';
                const ic    = c.cumple === true ? 'checkCircle' : c.cumple === false ? 'close' : 'clock';
                const bg    = c.cumple === true ? '#F0FDF4' : c.cumple === false ? '#FEF2F2' : '#F8FAFC';
                return (
                  <div key={c.nombre} style={{ display:'flex', gap:9, alignItems:'flex-start', background:bg, border:'1px solid '+LINE, borderRadius:9, padding:'9px 11px' }}>
                    <Icon name={ic} size={16} color={color} style={{ flexShrink:0, marginTop:1 }}/>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12.5, fontWeight:700, color:NAVY, display:'flex', justifyContent:'space-between', gap:6 }}>
                        <span>{c.nombre}</span>
                        {c.bloqueante && <span style={{ fontSize:9.5, color:'#B3261E', fontWeight:800, letterSpacing:.3 }}>OBLIGATORIO</span>}
                      </div>
                      <div style={{ fontSize:11, color:MUTE, marginTop:1 }}>{c.regla}</div>
                      <div style={{ fontSize:12, fontWeight:700, color, marginTop:3 }}>{c.valor}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            {veredicto === 'NO_ELEGIBLE' && (
              <div style={{ marginTop:11, background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:9, padding:'9px 12px', fontSize:12, color:'#B91C1C', display:'flex', gap:7, alignItems:'flex-start' }}>
                <Icon name='alert' size={15} color='#B91C1C' style={{ flexShrink:0, marginTop:1 }}/>
                <span>El cliente <b>no cumple uno o más criterios obligatorios</b>. Según política de riesgo, la solicitud debería <b>rechazarse</b> o derivarse a evaluación excepcional del comité con sustento.</span>
              </div>
            )}
            {veredicto === 'REQUIERE_DATOS' && (
              <div style={{ marginTop:11, background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:9, padding:'9px 12px', fontSize:12, color:'#1D4ED8', display:'flex', gap:7, alignItems:'flex-start' }}>
                <Icon name='search' size={15} color='#1D4ED8' style={{ flexShrink:0, marginTop:1 }}/>
                <span>Faltan datos del cliente (perfil o score sin calcular). Completar <b>ficha de campo</b> y <b>calcular score</b> en el módulo de Scoring antes de aprobar.</span>
              </div>
            )}
            {veredicto === 'ELEGIBLE' && (
              <div style={{ marginTop:11, background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:9, padding:'9px 12px', fontSize:12, color:'#15803D', display:'flex', gap:7, alignItems:'flex-start' }}>
                <Icon name='checkCircle' size={15} color='#15803D' style={{ flexShrink:0, marginTop:1 }}/>
                <span>El cliente <b>califica como sujeto de crédito</b>. Puede continuar al flujo de evaluación, comité y desembolso según la ruta por monto.</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function CoreSolicitudes() {
  const { perfil, user } = useAuth();
  const [solicitudes, setSolicitudes] = useState([]);
  const [searchParams] = useSearchParams();
  const faseToEstado = { pre: 'pendiente', registro: 'pendiente', comite: 'en_comite', desembolso: 'aprobado' };
  const faseInicial = faseToEstado[searchParams.get('fase')] || 'todas';
  const [filtro, setFiltro]       = useState(faseInicial);
  // re-sincroniza si cambian de fase desde el menú lateral
  useEffect(() => { setFiltro(faseToEstado[searchParams.get('fase')] || 'todas'); }, [searchParams]);
  const [busqueda, setBusqueda]   = useState('');
  const [selId, setSelId]         = useState(null);
  const [cargando, setCargando]   = useState(true);
  const [error, setError]         = useState('');
  const [msg, setMsg]             = useState('');
  const [accionando, setAccionando] = useState(false);

  const cargar = useCallback(() => {
    setCargando(true); setError('');
    api.get('/api/prestamos')
      .then(r => setSolicitudes(r.data?.data || []))
      .catch(e => setError(e.response?.data?.message || 'No se pudieron cargar las solicitudes. ¿Backend encendido en :3000?'))
      .finally(() => setCargando(false));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function cambiarEstado(id, estado) {
    setAccionando(true); setMsg(''); setError('');
    try {
      await api.put(`/api/prestamos/${id}/estado`, { estado });
      setMsg(estado === 'en_evaluacion' ? 'Solicitud tomada para evaluación.'
           : estado === 'en_comite'     ? 'Solicitud elevada a comité.'
           : `Solicitud ${ESTADOS[estado]?.lbl?.toLowerCase() || estado}.`);
      cargar();
    } catch (e) { setError(e.response?.data?.message || 'No se pudo actualizar.'); }
    finally { setAccionando(false); }
  }

  async function desembolsar(id) {
    setAccionando(true); setMsg(''); setError('');
    try {
      await api.post(`/api/prestamos/${id}/desembolsar`);
      setMsg('Crédito desembolsado: cuenta abonada y cronograma generado. El cliente ya lo ve en su Homebanking (:5174).');
      cargar();
    } catch (e) { setError(e.response?.data?.message || 'No se pudo desembolsar.'); }
    finally { setAccionando(false); }
  }

  const rol = perfil?.rol || '';
  const puedeDesembolsar = ['comite', 'administrador', 'admin', 'gerente'].includes(rol);
  const conteo = (e) => solicitudes.filter(s => s.estado === e).length;

  const lista = useMemo(() => solicitudes.filter(s => {
    const okEstado = filtro === 'todas' || s.estado === filtro;
    const cli = s.perfiles || {};
    const texto = `${codSol(s.id)} ${cli.nombre || ''} ${cli.apellido || ''} ${cli.dni || ''} ${cli.email || ''}`.toLowerCase();
    return okEstado && (!busqueda || texto.includes(busqueda.toLowerCase()));
  }), [solicitudes, filtro, busqueda]);

  const sel = solicitudes.find(s => s.id === selId) || null;
  const cliSel = sel?.perfiles || {};

  return (
    <div style={{ fontFamily: "'DM Sans',system-ui,sans-serif", color: '#1f2a44', padding: '24px 28px', maxWidth: 1180, margin: '0 auto' }}>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontFamily: "'Sora',sans-serif", fontSize: 22, color: NAVY, margin: 0 }}>Bandeja de flujo de trabajo</h1>
        <p style={{ color: MUTE, fontSize: 12.5, margin: '3px 0 0' }}>Consulta, registra y gestiona las solicitudes de crédito hasta el desembolso.</p>
      </div>

      {/* DATOS DEL USUARIO */}
      <Seccion titulo="DATOS DEL USUARIO">
        <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:14 }}>
          <div><span style={lbl}>Usuario</span><span style={val}>{perfil?.nombre || ''} {perfil?.apellido || ''} <span style={{ color:MUTE, fontWeight:500 }}>· {user?.email}</span></span></div>
          <div><span style={lbl}>Cargo / Rol</span><span style={{ ...val, textTransform:'capitalize' }}>{rol.replace('_',' ')}</span></div>
          <div><span style={lbl}>Sistema</span><span style={val}>Core Financiero</span></div>
        </div>
      </Seccion>

      {/* BÚSQUEDA Y FILTROS */}
      <Seccion titulo="BÚSQUEDA Y FILTROS" extra={
        <button onClick={cargar} style={{ border:'none', background:TEAL, color:'#fff', padding:'5px 14px', borderRadius:14, fontSize:11.5, fontWeight:700, cursor:'pointer' }}>↻ Actualizar</button>
      }>
        <div style={{ display:'grid', gridTemplateColumns:'220px 1fr', gap:12, alignItems:'end' }}>
          <div>
            <span style={lbl}>Estado de la solicitud</span>
            <select value={filtro} onChange={e => setFiltro(e.target.value)}
              style={{ width:'100%', padding:'9px 10px', borderRadius:9, border:'1px solid #cfe0ec', fontSize:13, color:NAVY, fontWeight:600, background:'#fff' }}>
              <option value="todas">TODOS ({solicitudes.length})</option>
              {Object.entries(ESTADOS).map(([k, v]) => (
                <option key={k} value={k}>{v.lbl} ({conteo(k)})</option>
              ))}
            </select>
          </div>
          <div>
            <span style={lbl}>Código de solicitud o cliente</span>
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="SOL0000123, nombre, DNI o correo…"
              style={{ width:'100%', padding:'9px 12px', borderRadius:9, border:'1px solid #cfe0ec', fontSize:13, boxSizing:'border-box' }} />
          </div>
        </div>
      </Seccion>

      {msg &&   <div style={{ background:'#DCFCE7', border:'1px solid #86EFAC', color:'#15803D', borderRadius:10, padding:'9px 14px', fontSize:13, marginBottom:12 }}><Icon name='check' size={14} color='#fff' style={{display:'inline',verticalAlign:'-2px',marginRight:5}}/>{msg}</div>}
      {error && <div style={{ background:'#FEE2E2', border:'1px solid #FCA5A5', color:'#B91C1C', borderRadius:10, padding:'9px 14px', fontSize:13, marginBottom:12 }} ><span style={{display:'inline-flex',alignItems:'center',gap:6}}><Icon name='alert' size={14} color='#B91C1C'/> {error}</span></div>}

      {/* TABLA DE SOLICITUDES */}
      <Seccion titulo={`SOLICITUDES DE CRÉDITO — mostrando ${lista.length} de ${solicitudes.length}`}>
        {cargando ? <div style={{ color:MUTE, padding:18 }}>Cargando solicitudes…</div> : (
          lista.length === 0 ? (
            <div style={{ color:MUTE, padding:18, fontSize:13 }}>
              No hay solicitudes con este filtro. Flujo de prueba: en el Homebanking (:5174) entra como <b>cli000007 / demo1234</b> → Mis Préstamos → Solicitar, y pulsa ↻ Actualizar aquí.
            </div>
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5 }}>
                <thead>
                  <tr style={{ textAlign:'left', color:MUTE, fontSize:10.5, letterSpacing:.5 }}>
                    {['CÓDIGO SOLICITUD','CLIENTE','DNI','PROPÓSITO','FECHA REGISTRO','MONTO','PLAZO','TEA','ESTADO'].map(h => (
                      <th key={h} style={{ padding:'8px 10px', borderBottom:'2px solid '+LINE, fontWeight:800 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lista.map(s => {
                    const est = ESTADOS[s.estado] || { bg:'#EEF1F8', fg:'#374060', lbl:s.estado };
                    const cli = s.perfiles || {};
                    const activa = s.id === selId;
                    return (
                      <tr key={s.id} onClick={() => setSelId(activa ? null : s.id)}
                        style={{ cursor:'pointer', background: activa ? '#F0FBFC' : 'transparent', borderLeft: activa ? '3px solid '+TEAL : '3px solid transparent' }}>
                        <td style={{ padding:'10px', borderBottom:'1px solid '+LINE, fontWeight:800, color:'#B3261E' }}>{codSol(s.id)}</td>
                        <td style={{ padding:'10px', borderBottom:'1px solid '+LINE, fontWeight:600, color:NAVY }}>{cli.nombre || 'Cliente'} {cli.apellido || ''}</td>
                        <td style={{ padding:'10px', borderBottom:'1px solid '+LINE, color:MUTE }}>{cli.dni || '—'}</td>
                        <td style={{ padding:'10px', borderBottom:'1px solid '+LINE, color:MUTE }}>{s.proposito || 'Crédito'}</td>
                        <td style={{ padding:'10px', borderBottom:'1px solid '+LINE }}>{new Date(s.created_at).toLocaleDateString('es-PE')}</td>
                        <td style={{ padding:'10px', borderBottom:'1px solid '+LINE, fontWeight:800, color:NAVY }}>{fmt(s.monto)}</td>
                        <td style={{ padding:'10px', borderBottom:'1px solid '+LINE }}>{s.plazo_meses}</td>
                        <td style={{ padding:'10px', borderBottom:'1px solid '+LINE }}>{(Number(s.tasa_anual) * 100).toFixed(2)}%</td>
                        <td style={{ padding:'10px', borderBottom:'1px solid '+LINE }}>
                          <span style={{ background:est.bg, color:est.fg, padding:'3px 10px', borderRadius:12, fontWeight:800, fontSize:11 }}>{est.lbl}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ color:MUTE, fontSize:11, marginTop:8 }}>Selecciona una fila para ver el detalle y usar las acciones.</div>
            </div>
          )
        )}
      </Seccion>

      {/* DATOS DE LA SOLICITUD seleccionada */}
      {sel && (
        <Seccion titulo={`DATOS DE LA SOLICITUD — ${codSol(sel.id)}`}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:14, marginBottom:14 }}>
            <div><span style={lbl}>Cliente</span><span style={val}>{cliSel.nombre || 'Cliente'} {cliSel.apellido || ''}</span></div>
            <div><span style={lbl}>DNI / Correo</span><span style={val}>{cliSel.dni || '—'}<div style={{ color:MUTE, fontSize:11.5, fontWeight:500 }}>{cliSel.email || ''}</div></span></div>
            <div><span style={lbl}>Monto · Plazo</span><span style={val}>{fmt(sel.monto)} · {sel.plazo_meses} meses</span></div>
            <div><span style={lbl}>Cuota mensual (TEA {(Number(sel.tasa_anual)*100).toFixed(2)}%)</span><span style={val}>{fmt(sel.cuota_mensual)}</span></div>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10, background:'#F8FAFD', borderRadius:10, padding:'10px 14px', marginBottom:14, fontSize:12.5 }}>
            <span>Nivel de aprobación requerido por monto: <b style={{ color:NAVY }}>{rutaAprobacion(sel.monto)}</b></span>
            <span style={{ color:MUTE }}>Flujo: Pendiente → En Evaluación → En Comité → Aprobado → Desembolsado</span>
          </div>

          {/* ── EVALUACIÓN DE ELEGIBILIDAD (SUJETO DE CRÉDITO) ── */}
          <PanelElegibilidad sel={sel} cliente={cliSel}/>


          {/* Barra de herramientas del asesor (estilo Banco Andino) */}
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:14, paddingBottom:14, borderBottom:'1px solid '+LINE }}>
            {[
              { ic:'users', t:'Historial cliente', d:`Cliente: ${cliSel.nombre || ''} ${cliSel.apellido || ''} · DNI ${cliSel.dni || '—'} · ${cliSel.email || ''}` },
              { ic:'chart', t:'Informe RCC', d:'Reporte crediticio (SBS/RCC): sin deudas vencidas reportadas (demo).' },
              { ic:'edit', t:'Registrar solicitud', d:`${codSol(sel.id)} · ${fmt(sel.monto)} · ${sel.plazo_meses} meses · ${sel.proposito || 'Crédito'}` },
              { ic:'search', t:'Evaluar solicitud', d:`Cuota ${fmt(sel.cuota_mensual)} · TEA ${(Number(sel.tasa_anual)*100).toFixed(2)}% · ruta: ${rutaAprobacion(sel.monto)}` },
            ].map(b => (
              <button key={b.t} onClick={() => setMsg(`${b.t}: ${b.d}`)}
                style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, background:'#fff', border:'1px solid '+LINE, borderRadius:10, padding:'10px 16px', cursor:'pointer', minWidth:96, transition:'all .15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = TEAL; e.currentTarget.style.background = '#F0FBFC'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = LINE; e.currentTarget.style.background = '#fff'; }}>
                <span style={{ display:'grid', placeItems:'center' }}><Icon name={b.ic} size={20} color={NAVY}/></span>
                <span style={{ fontSize:11, fontWeight:700, color:NAVY }}>{b.t}</span>
              </button>
            ))}
          </div>

          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {sel.estado === 'pendiente' && (
              <button disabled={accionando} onClick={() => cambiarEstado(sel.id, 'en_evaluacion')}
                style={{ border:'none', background:'#1D4ED8', color:'#fff', padding:'9px 18px', borderRadius:9, fontSize:12.5, fontWeight:700, cursor:'pointer' }}><Icon name='search' size={14} color='#fff' style={{display:'inline',verticalAlign:'-2px',marginRight:5}}/>Tomar para evaluación</button>
            )}
            {sel.estado === 'en_evaluacion' && (
              <button disabled={accionando} onClick={() => cambiarEstado(sel.id, 'en_comite')}
                style={{ border:'none', background:'#6D28D9', color:'#fff', padding:'9px 18px', borderRadius:9, fontSize:12.5, fontWeight:700, cursor:'pointer' }} ><span style={{display:'inline-flex',alignItems:'center',gap:6}}><Icon name='building' size={14} color='#fff'/> Enviar a comité</span></button>
            )}
            {['pendiente', 'en_evaluacion', 'en_comite'].includes(sel.estado) && (
              <>
                <button disabled={accionando} onClick={() => cambiarEstado(sel.id, 'aprobado')}
                  style={{ border:'none', background:'#15803D', color:'#fff', padding:'9px 18px', borderRadius:9, fontSize:12.5, fontWeight:700, cursor:'pointer' }}><Icon name='check' size={14} color='#fff' style={{display:'inline',verticalAlign:'-2px',marginRight:5}}/>Aprobar</button>
                <button disabled={accionando} onClick={() => cambiarEstado(sel.id, 'rechazado')}
                  style={{ border:'none', background:'#B91C1C', color:'#fff', padding:'9px 18px', borderRadius:9, fontSize:12.5, fontWeight:700, cursor:'pointer' }}><Icon name='close' size={14} color='#fff' style={{display:'inline',verticalAlign:'-2px',marginRight:5}}/>Rechazar</button>
              </>
            )}
            {sel.estado === 'aprobado' && puedeDesembolsar && (
              <button disabled={accionando} onClick={() => desembolsar(sel.id)}
                style={{ border:'none', background:'linear-gradient(90deg,#16b8c6,#0fa0ad)', color:'#fff', padding:'9px 20px', borderRadius:9, fontSize:12.5, fontWeight:800, cursor:'pointer' }}><Icon name='send' size={14} color='#fff' style={{display:'inline',verticalAlign:'-2px',marginRight:5}}/>Desembolsar</button>
            )}
            {sel.estado === 'aprobado' && !puedeDesembolsar && (
              <span style={{ fontSize:12, color:MUTE, alignSelf:'center' }}>El desembolso lo ejecuta comité / administrador / gerencia (ej. usuario 11111115).</span>
            )}
            {sel.estado === 'desembolsado' && (
              <span style={{ fontSize:12.5, color:'#065F46', alignSelf:'center' }}><Icon name='check' size={14} color='#fff' style={{display:'inline',verticalAlign:'-2px',marginRight:5}}/>Crédito desembolsado: cuenta abonada y cronograma generado. No permite re-desembolso.</span>
            )}
            {accionando && <span style={{ fontSize:12, color:MUTE, alignSelf:'center' }}>Procesando…</span>}
          </div>
        </Seccion>
      )}

      <div style={{ background:'#f4f9fb', borderLeft:'4px solid '+TEAL, borderRadius:8, padding:'11px 15px', fontSize:12, color:'#475569', lineHeight:1.6 }}>
        <b style={{ color:NAVY }}>Home Banking vs Core:</b> el Homebanking (:5174) es la interfaz del cliente — formularios, saldos y botones.
        Este Core (:5173) es el sistema central: recibe la solicitud, valida reglas (RDS, ruta por monto), registra el crédito,
        abona la cuenta y genera el cronograma. El cliente solo ve el resultado en su portal.
      </div>
    </div>
  );
}
