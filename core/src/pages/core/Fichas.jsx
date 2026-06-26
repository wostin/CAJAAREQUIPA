// src/pages/core/Fichas.jsx
// Fichas de Campo — Scoring de visita presencial del asesor
// F1: Negocio (60pts) · F2: Capacidad de pago (60pts) ·
// F3: Deuda informal (40pts) · F4: Activos (40pts) · F5: Carácter
// El asesor llena la ficha tras visitar al cliente en campo
import { useState, useEffect } from 'react';
import Icon from '../../components/Icon';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';

// ── Definición de cada ficha con sus ítems ─────────────────
const FICHAS = {
  F1: {
    titulo: 'Negocio / Actividad económica',
    puntaje_max: 60,
    color: 'bg-blue-600',
    items: [
      { id: 'f1_antiguedad', label: 'Antigüedad del negocio',
        opciones: [{ label: '≥ 3 años', pts: 20 },{ label: '1–3 años', pts: 12 },{ label: '< 1 año', pts: 5 }] },
      { id: 'f1_local', label: 'Local del negocio',
        opciones: [{ label: 'Propio', pts: 20 },{ label: 'Alquilado estable', pts: 12 },{ label: 'Sin local fijo', pts: 5 }] },
      { id: 'f1_ventas', label: 'Ventas mensuales declaradas',
        opciones: [{ label: '> S/ 5,000', pts: 20 },{ label: 'S/ 2,000–5,000', pts: 12 },{ label: '< S/ 2,000', pts: 5 }] },
    ],
  },
  F2: {
    titulo: 'Capacidad de pago',
    puntaje_max: 60,
    color: 'bg-green-600',
    items: [
      { id: 'f2_ingresos_netos', label: 'Ingresos netos mensuales',
        opciones: [{ label: '> S/ 3,000', pts: 25 },{ label: 'S/ 1,500–3,000', pts: 15 },{ label: '< S/ 1,500', pts: 5 }] },
      { id: 'f2_endeudamiento', label: 'Ratio deuda/ingresos',
        opciones: [{ label: '< 30%', pts: 20 },{ label: '30–50%', pts: 12 },{ label: '> 50%', pts: 3 }] },
      { id: 'f2_excedente', label: 'Excedente familiar mensual',
        opciones: [{ label: '> S/ 1,000', pts: 15 },{ label: 'S/ 400–1,000', pts: 8 },{ label: '< S/ 400', pts: 2 }] },
    ],
  },
  F3: {
    titulo: 'Deuda informal',
    puntaje_max: 40,
    color: 'bg-orange-600',
    items: [
      { id: 'f3_prestamistas', label: 'Deudas con prestamistas informales',
        opciones: [{ label: 'Ninguna', pts: 25 },{ label: 'Menor (< S/ 500)', pts: 10 },{ label: 'Significativa', pts: 0 }] },
      { id: 'f3_juntas', label: 'Participación en juntas / panderos',
        opciones: [{ label: 'No participa', pts: 15 },{ label: 'Organizado (1)', pts: 8 },{ label: 'Múltiples', pts: 2 }] },
    ],
  },
  F4: {
    titulo: 'Activos / Garantías',
    puntaje_max: 40,
    color: 'bg-purple-600',
    items: [
      { id: 'f4_inmueble', label: 'Propiedad inmueble',
        opciones: [{ label: 'Escritura pública', pts: 20 },{ label: 'Declaración jurada', pts: 10 },{ label: 'Ninguno', pts: 0 }] },
      { id: 'f4_vehiculo', label: 'Vehículo / activo productivo',
        opciones: [{ label: 'Propio con tarjeta', pts: 20 },{ label: 'En proceso', pts: 10 },{ label: 'Ninguno', pts: 0 }] },
    ],
  },
  F5: {
    titulo: 'Carácter / Referencias',
    puntaje_max: 30,
    color: 'bg-cmac-red',
    items: [
      { id: 'f5_referencias', label: 'Referencias personales verificadas',
        opciones: [{ label: 'Excelentes (2+)', pts: 15 },{ label: 'Buenas (1)', pts: 8 },{ label: 'Sin referencias', pts: 0 }] },
      { id: 'f5_historial', label: 'Historial en la caja',
        opciones: [{ label: 'Cliente fiel ≥2 años', pts: 15 },{ label: 'Cliente nuevo', pts: 7 },{ label: 'Incumplimientos pasados', pts: 0 }] },
    ],
  },
};

const PUNTAJE_TOTAL_MAX = Object.values(FICHAS).reduce((a, f) => a + f.puntaje_max, 0); // 230 pts

// Mapea cada ítem del formulario a la columna real de fichas_campo y su valor de CHECK.
// La clave es item.id; según los PUNTOS elegidos se decide el valor permitido por la tabla.
// [columna_valor, columna_puntos, [valorAlto, valorMedio, valorBajo]]
const MAPEO_COLUMNAS = {
  f1_antiguedad: { col:'antiguedad_negocio', pts:'pts_antiguedad', vals:{ 20:'mas_3_anios', 12:'1_a_3_anios', 5:'menos_1_anio' } },
  f1_local:      { col:'tenencia_local',      pts:'pts_tenencia',   vals:{ 20:'propio', 12:'alquilado_con_contrato', 5:'alquilado_sin_contrato' } },
  f1_ventas:     { col:'ventas_diarias_rango',pts:'pts_ventas',     vals:{ 20:'mas_300', 12:'151_a_300', 5:'50_a_150' } },
  f2_endeudamiento:{ col:'ratio_gastos',      pts:'pts_gastos',     vals:{ 20:'menos_50pct', 12:'50_a_80pct', 3:'mas_80pct' } },
  f3_prestamistas:{ col:'tiene_deuda_informal',pts:'pts_deuda_informal', vals:{ 25:'no', 10:'si_menor', 0:'si_significativa' } },
  f3_juntas:     { col:'participa_pandero',   pts:'pts_pandero',    vals:{ 15:'no', 8:'si_menor_cuota', 2:'si_mayor_cuota' } },
  f4_inmueble:   { col:'stock_visible',       pts:'pts_stock',      vals:{ 20:'abundante', 10:'moderado', 0:'escaso' } },
  f4_vehiculo:   { col:'activos_hogar',       pts:'pts_activos',    vals:{ 20:'al_menos_uno', 10:'al_menos_uno', 0:'ninguno' } },
};

function calcularSegmentoFicha(puntaje) {
  const pct = puntaje / PUNTAJE_TOTAL_MAX;
  if (pct >= 0.75) return { label: 'APROBADO CAMPO', color: 'text-green-600', bg: 'bg-green-50 border-green-200' };
  if (pct >= 0.55) return { label: 'CONDICIONAL',    color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200' };
  return                  { label: 'NO APROBADO',    color: 'text-red-600',    bg: 'bg-red-50 border-red-200' };
}

// Mapea el segmento real de la base (vw_pbi_fichas_campo) a etiqueta + colores
function decisionPorSegmento(segmento, puntaje) {
  switch ((segmento || '').toUpperCase()) {
    case 'PREMIER':
    case 'ESTANDAR':
      return { label: 'APROBADO CAMPO', txt:'#15803D', bg:'#DCFCE7', bd:'#86EFAC' };
    case 'BASICO':
      return { label: 'CONDICIONAL', txt:'#B45309', bg:'#FEF3C7', bd:'#FCD34D' };
    case 'DESCALIFICADO':
    case 'NO_APLICA':
      return { label: 'NO APROBADO', txt:'#B91C1C', bg:'#FEE2E2', bd:'#FCA5A5' };
    default: {
      // Si no hay segmento, decidir por puntaje
      const d = calcularSegmentoFicha(puntaje);
      const map = {
        'APROBADO CAMPO': { txt:'#15803D', bg:'#DCFCE7', bd:'#86EFAC' },
        'CONDICIONAL':    { txt:'#B45309', bg:'#FEF3C7', bd:'#FCD34D' },
        'NO APROBADO':    { txt:'#B91C1C', bg:'#FEE2E2', bd:'#FCA5A5' },
      };
      return { label: d.label, ...map[d.label] };
    }
  }
}

// Iniciales para avatar
const iniciales = (nombre) => (nombre || '?').trim().split(/\s+/).slice(0,2).map(p => p[0]).join('').toUpperCase();

// Fichas guardadas (demo)
const FICHAS_GUARDADAS_DEMO = [
  { id: 'F001', cliente: 'Carlos Mamani Quispe', fecha: '2026-05-20', asesor: 'Luisa Torres', puntaje_total: 178, estado: 'completada' },
  { id: 'F002', cliente: 'Rosa Flores Ccori',    fecha: '2026-05-19', asesor: 'Luisa Torres', puntaje_total: 142, estado: 'completada' },
  { id: 'F003', cliente: 'Juan Condori Pari',    fecha: '2026-05-18', asesor: 'Luisa Torres', puntaje_total: 96,  estado: 'completada' },
];

export default function CoreFichas() {
  const { perfil } = useAuth();
  const [vista, setVista] = useState('lista'); // lista | nueva | resultado
  const [clienteId, setClienteId] = useState('');
  const [clienteNombre, setClienteNombre] = useState('');
  const [respuestas, setRespuestas] = useState({});
  const [observaciones, setObservaciones] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [resultadoFicha, setResultadoFicha] = useState(null);
  const [fichasReales, setFichasReales] = useState(null); // null = cargando
  const [usandoReal, setUsandoReal] = useState(false);
  const [paso, setPaso] = useState(0); // paso actual del formulario (0..4 = F1..F5, 5 = revisión)
  const [clientes, setClientes] = useState([]); // lista de clientes reales para el selector
  const [agencia, setAgencia] = useState(''); // agencia de la visita

  // Cargar clientes reales para el selector (user_id real = UUID)
  useEffect(() => {
    api.get('/api/dashboard/clientes')
      .then(r => setClientes(r.data?.data || []))
      .catch(() => setClientes([]));
  }, []);

  // Cargar fichas reales desde Supabase (vw_pbi_fichas_campo)
  useEffect(() => {
    let ok = true;
    api.get('/api/scoring/fichas?limit=30')
      .then(r => {
        if (!ok) return;
        const lista = r.data?.data || [];
        if (lista.length) {
          const mapeadas = lista.map((f, i) => ({
            id: f.id_ficha || `F${i}`,
            cliente: f.nombre_cliente || 'Cliente sin perfil',
            asesor: f.asesor_nombre || '—',
            agencia: f.agencia || '—',
            fecha: f.fecha_visita || '—',
            puntaje_total: Number(f.score_final) || 0,
            segmento: f.segmento_resultante || null,
          }));
          setFichasReales(mapeadas);
          setUsandoReal(true);
        } else {
          setFichasReales([]);
        }
      })
      .catch(() => { if (ok) setFichasReales([]); });
    return () => { ok = false; };
  }, []);

  // Calcular puntaje en tiempo real
  const puntajeActual = Object.values(respuestas).reduce((a, b) => a + (b || 0), 0);
  const pctCompletado = Object.keys(respuestas).length /
    Object.values(FICHAS).reduce((a, f) => a + f.items.length, 0) * 100;

  function setRespuesta(itemId, pts) {
    setRespuestas(prev => ({ ...prev, [itemId]: pts }));
  }

  async function guardarFicha() {
    if (!clienteId || !clienteNombre) return;
    setGuardando(true);

    // Construir el registro con las COLUMNAS REALES de fichas_campo
    const registro = {
      user_id: clienteId,                                  // UUID real del cliente (selector)
      asesor_nombre: `${perfil?.nombre || ''} ${perfil?.apellido || ''}`.trim() || 'Asesor',
      agencia: agencia || 'Huancayo Centro',
      fecha_visita: new Date().toISOString().slice(0, 10),
      negocio_verificado: true,
      caracter_resultado: 'sin_penalidad',
      obs_finales: observaciones || null,
    };
    // Mapear cada ítem respondido a su columna + puntos
    for (const [itemId, pts] of Object.entries(respuestas)) {
      const m = MAPEO_COLUMNAS[itemId];
      if (!m) continue;
      registro[m.col] = m.vals[pts] ?? null;
      registro[m.pts] = pts;
    }

    let guardadoReal = false;
    let errorMsg = '';
    try {
      const r = await api.post('/api/scoring/fichas', registro);
      guardadoReal = r.data?.success !== false;
    } catch (e) {
      errorMsg = e?.response?.data?.message || e.message || 'Error desconocido';
      guardadoReal = false;
    }

    setResultadoFicha({
      cliente: clienteNombre,
      puntaje_total: puntajeActual,
      max: PUNTAJE_TOTAL_MAX,
      guardadoReal,
      errorMsg,
      decision: calcularSegmentoFicha(puntajeActual),
      resumenFichas: Object.entries(FICHAS).map(([key, f]) => ({
        key, titulo: f.titulo, max: f.puntaje_max,
        obtenido: f.items.reduce((a, it) => a + (respuestas[it.id] || 0), 0),
      })),
    });

    // Si se guardó real, recargar la lista de fichas para que aparezca
    if (guardadoReal) {
      try {
        const lr = await api.get('/api/scoring/fichas?limit=30');
        const lista = lr.data?.data || [];
        if (lista.length) {
          setFichasReales(lista.map((f, i) => ({
            id: f.id_ficha || `F${i}`,
            cliente: f.nombre_cliente || 'Cliente sin perfil',
            asesor: f.asesor_nombre || '—',
            agencia: f.agencia || '—',
            fecha: f.fecha_visita || '—',
            puntaje_total: Number(f.score_final) || 0,
            segmento: f.segmento_resultante || null,
          })));
          setUsandoReal(true);
        }
      } catch { /* la lista se queda como estaba */ }
    }

    setGuardando(false);
    setVista('resultado');
  }

  function nuevaFicha() {
    setVista('nueva');
    setPaso(0);
    setRespuestas({});
    setObservaciones('');
    setResultadoFicha(null);
    setClienteId('');
    setClienteNombre('');
    setAgencia('');
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Fichas de Campo</h1>
          <p className="text-sm text-gray-500">Scoring de visita presencial · 5 fichas · {PUNTAJE_TOTAL_MAX} pts máx</p>
        </div>
        {vista !== 'nueva' && (
          <button onClick={nuevaFicha} className="btn-primary text-sm">
            + Nueva ficha
          </button>
        )}
      </div>

      {/* ── LISTA ── */}
      {vista === 'lista' && (
        <div className="space-y-4">
          {/* Resumen fichas F1-F5 con barra de progreso */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {Object.entries(FICHAS).map(([key, f]) => (
              <div key={key} className="card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className={`text-xs font-bold text-white ${f.color} rounded-full w-9 h-9 flex items-center justify-center flex-shrink-0`}>
                    {key}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-gray-500 font-medium leading-tight truncate">{f.titulo.split(/[/·]/)[0].trim()}</div>
                    <div className="text-base font-extrabold text-gray-800 leading-tight">{f.puntaje_max} pts</div>
                  </div>
                </div>
                <div className="bg-gray-100 rounded-full h-1.5 mb-1.5">
                  <div className={`h-1.5 rounded-full ${f.color}`} style={{ width: '100%' }}/>
                </div>
                <div className="flex justify-between text-[11px] text-gray-400">
                  <span>{f.puntaje_max} / {f.puntaje_max} pts</span>
                  <span className="font-semibold">100%</span>
                </div>
              </div>
            ))}
          </div>

          {/* Tabla historial — datos reales */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-700">Fichas registradas</h3>
              <span className="text-xs text-gray-400">
                {usandoReal
                  ? <span className="inline-flex items-center gap-1 text-teal-600 font-semibold"><Icon name="checkCircle" size={12} color="#0d9488"/> {fichasReales?.length} reales de Supabase</span>
                  : 'datos de referencia'}
              </span>
            </div>

            {fichasReales === null ? (
              <div className="text-center py-8 text-gray-400 text-sm">Cargando fichas…</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-[11px] text-gray-500 uppercase tracking-wide">
                      <th className="text-left py-2.5 px-3">Cliente</th>
                      <th className="text-left py-2.5 px-3 hidden sm:table-cell">Asesor</th>
                      <th className="text-left py-2.5 px-3">Puntaje</th>
                      <th className="text-center py-2.5 px-3">Decisión</th>
                      <th className="text-left py-2.5 px-3 hidden md:table-cell">Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(fichasReales?.length ? fichasReales : FICHAS_GUARDADAS_DEMO).map(f => {
                      const dec = decisionPorSegmento(f.segmento, f.puntaje_total);
                      const pct = Math.round((f.puntaje_total / PUNTAJE_TOTAL_MAX) * 100);
                      return (
                        <tr key={f.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                          {/* Cliente con avatar */}
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                                {iniciales(f.cliente)}
                              </div>
                              <div className="min-w-0">
                                <div className="font-semibold text-gray-800 truncate">{f.cliente}</div>
                                <div className="text-[11px] text-gray-400">{f.agencia || ''}</div>
                              </div>
                            </div>
                          </td>
                          {/* Asesor con avatar */}
                          <td className="py-3 px-3 hidden sm:table-cell">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-slate-700 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                                {iniciales(f.asesor)}
                              </div>
                              <span className="text-gray-600 text-xs">{f.asesor}</span>
                            </div>
                          </td>
                          {/* Puntaje con barra */}
                          <td className="py-3 px-3">
                            <div className="font-bold text-gray-800 mb-1">{f.puntaje_total} <span className="text-gray-400 font-normal">/ {PUNTAJE_TOTAL_MAX}</span></div>
                            <div className="flex items-center gap-2">
                              <div className="w-24 bg-gray-200 rounded-full h-1.5">
                                <div className="h-1.5 rounded-full bg-blue-600" style={{ width: `${pct}%` }}/>
                              </div>
                              <span className="text-[11px] text-gray-400">{pct}%</span>
                            </div>
                          </td>
                          {/* Decisión badge */}
                          <td className="py-3 px-3 text-center">
                            <span style={{ background:dec.bg, color:dec.txt, border:`1px solid ${dec.bd}` }}
                              className="inline-block text-[11px] font-bold px-3 py-1 rounded-full whitespace-nowrap">
                              {dec.label}
                            </span>
                          </td>
                          {/* Fecha */}
                          <td className="py-3 px-3 hidden md:table-cell">
                            <div className="flex items-center gap-1.5 text-gray-400 text-xs">
                              <Icon name="calendar" size={13} color="#9ca3af"/> {f.fecha}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── NUEVA FICHA ── */}
      {vista === 'nueva' && (() => {
        const claves = Object.keys(FICHAS);           // ['F1','F2','F3','F4','F5']
        const totalPasos = claves.length;             // 5 fichas
        const enRevision = paso >= totalPasos;
        const fichaActualKey = claves[paso];
        const fichaActual = FICHAS[fichaActualKey];
        const dec = calcularSegmentoFicha(puntajeActual);
        const itemsTotales = Object.values(FICHAS).reduce((a, f) => a + f.items.length, 0);
        const itemsRespondidos = Object.keys(respuestas).length;
        const pctRegistro = Math.round((itemsRespondidos / itemsTotales) * 100);

        return (
          <div className="space-y-4">
            {/* Encabezado con acciones */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <button onClick={() => setVista('lista')} className="text-gray-400 hover:text-gray-700">
                  <Icon name="arrowRight" size={18} color="currentColor" style={{ transform:'rotate(180deg)' }}/>
                </button>
                <div>
                  <h2 className="text-lg font-bold text-gray-800">Nueva Ficha de Campo</h2>
                  <p className="text-xs text-gray-500">Complete cada sección. El puntaje se calcula automáticamente.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setVista('lista')} className="btn-secondary text-sm">Cancelar</button>
                <button onClick={guardarFicha}
                  disabled={guardando || !clienteId || !clienteNombre || itemsRespondidos < 3}
                  className="btn-primary text-sm">
                  {guardando ? 'Guardando…' : 'Registrar ficha'}
                </button>
              </div>
            </div>

            {/* Stepper de pasos */}
            <div className="card">
              <div className="flex items-center justify-between overflow-x-auto gap-2">
                {claves.map((key, i) => {
                  const activo = i === paso;
                  const completado = FICHAS[key].items.every(it => respuestas[it.id] != null);
                  return (
                    <button key={key} onClick={() => setPaso(i)}
                      className="flex items-center gap-2 flex-shrink-0 group">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                        activo ? 'bg-teal-600 text-white' :
                        completado ? 'bg-green-100 text-green-700' :
                        'bg-gray-100 text-gray-400'}`}>
                        {completado && !activo ? '✓' : i + 1}
                      </div>
                      <span className={`text-xs font-medium hidden lg:block ${activo ? 'text-teal-700' : 'text-gray-400'}`}>
                        {FICHAS[key].titulo.split(/[/·]/)[0].trim()}
                      </span>
                      {i < claves.length - 1 && <div className="w-6 h-px bg-gray-200 hidden lg:block"/>}
                    </button>
                  );
                })}
                {/* Paso revisión */}
                <button onClick={() => setPaso(totalPasos)} className="flex items-center gap-2 flex-shrink-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    enRevision ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                    {totalPasos + 1}
                  </div>
                  <span className={`text-xs font-medium hidden lg:block ${enRevision ? 'text-teal-700' : 'text-gray-400'}`}>Revisión y envío</span>
                </button>
              </div>
            </div>

            {/* Cuerpo: contenido (izq) + resumen (der) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Columna principal */}
              <div className="lg:col-span-2 space-y-4">
                {/* Datos del cliente (siempre visibles arriba en el paso 0) */}
                {paso === 0 && (
                  <div className="card">
                    <div className="flex items-center gap-2 mb-3">
                      <Icon name="user" size={16} color="#0d9488"/>
                      <h3 className="font-semibold text-gray-700">Datos de la visita</h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Cliente <span className="text-red-500">*</span></label>
                        <select
                          value={clienteId}
                          onChange={e => {
                            const c = clientes.find(x => x.id === e.target.value);
                            setClienteId(e.target.value);
                            setClienteNombre(c ? c.nombre : '');
                          }}
                          className="input-field">
                          <option value="">— Selecciona un cliente —</option>
                          {clientes.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.nombre}{c.dni && c.dni !== '—' ? ` · DNI ${c.dni}` : ''}
                            </option>
                          ))}
                        </select>
                        {!clientes.length && (
                          <p className="text-[11px] text-amber-600 mt-1">No se pudieron cargar clientes. Entra como asesor/administrador.</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Agencia</label>
                        <input value={agencia} onChange={e => setAgencia(e.target.value)}
                          placeholder="Ej. Huancayo Centro" className="input-field"/>
                      </div>
                    </div>
                    {clienteNombre && (
                      <div className="mt-3 flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                        <Icon name="checkCircle" size={14} color="#0d9488"/>
                        Cliente seleccionado: <strong className="text-gray-700">{clienteNombre}</strong>
                      </div>
                    )}
                  </div>
                )}

                {/* Ficha del paso actual (o revisión) */}
                {!enRevision ? (
                  <div className="card">
                    <div className="flex items-center gap-2 mb-4">
                      <div className={`text-white text-sm font-bold ${fichaActual.color} rounded-full w-9 h-9 flex items-center justify-center`}>
                        {fichaActualKey}
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-800">{fichaActual.titulo}</h4>
                        <p className="text-xs text-gray-400">
                          Puntaje: {fichaActual.items.reduce((a, it) => a + (respuestas[it.id] || 0), 0)}/{fichaActual.puntaje_max} pts
                        </p>
                      </div>
                    </div>
                    <div className="space-y-5">
                      {fichaActual.items.map(item => (
                        <div key={item.id}>
                          <p className="text-sm text-gray-700 font-medium mb-2">{item.label}</p>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {item.opciones.map(opcion => (
                              <button key={opcion.label}
                                onClick={() => setRespuesta(item.id, opcion.pts)}
                                className={`p-3 rounded-lg border text-xs text-left transition-all ${
                                  respuestas[item.id] === opcion.pts
                                    ? 'border-teal-500 bg-teal-50 text-teal-700 font-semibold'
                                    : 'border-gray-200 hover:border-gray-400 text-gray-600'
                                }`}>
                                <div>{opcion.label}</div>
                                <div className="font-bold mt-0.5">{opcion.pts} pts</div>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* Paso de revisión: observaciones + resumen de puntajes */
                  <div className="card">
                    <div className="flex items-center gap-2 mb-4">
                      <Icon name="checkCircle" size={18} color="#0d9488"/>
                      <h4 className="font-semibold text-gray-800">Revisión y envío</h4>
                    </div>
                    <div className="space-y-2 mb-4">
                      {Object.entries(FICHAS).map(([key, f]) => {
                        const obt = f.items.reduce((a, it) => a + (respuestas[it.id] || 0), 0);
                        return (
                          <div key={key} className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">{key} — {f.titulo.split(/[/·]/)[0].trim()}</span>
                            <div className="flex items-center gap-2">
                              <div className="w-28 bg-gray-200 rounded-full h-1.5">
                                <div className="h-1.5 rounded-full bg-teal-600" style={{ width: `${(obt/f.puntaje_max)*100}%` }}/>
                              </div>
                              <span className="text-xs font-semibold w-12 text-right">{obt}/{f.puntaje_max}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {!clienteId && (
                      <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
                        <p className="text-xs text-amber-700 font-semibold mb-2">⚠ Falta seleccionar el cliente para poder registrar.</p>
                        <select
                          value={clienteId}
                          onChange={e => {
                            const c = clientes.find(x => x.id === e.target.value);
                            setClienteId(e.target.value);
                            setClienteNombre(c ? c.nombre : '');
                          }}
                          className="input-field">
                          <option value="">— Selecciona un cliente —</option>
                          {clientes.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.nombre}{c.dni && c.dni !== '—' ? ` · DNI ${c.dni}` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <label className="block text-sm font-medium text-gray-700 mb-2">Observaciones del asesor</label>
                    <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)}
                      rows={3} className="input-field"
                      placeholder="Condiciones del negocio, actitud del cliente, observaciones del entorno..."/>
                    <button onClick={guardarFicha}
                      disabled={guardando || !clienteId || !clienteNombre || itemsRespondidos < 3}
                      className="btn-primary w-full mt-4">
                      {guardando ? 'Guardando ficha…' : <span style={{display:'inline-flex',alignItems:'center',gap:7}}><Icon name='download' size={15} color='#fff'/> Registrar ficha de campo</span>}
                    </button>
                    {itemsRespondidos < 3 && (
                      <p className="text-xs text-center text-gray-400 mt-2">Completa al menos 3 ítems para guardar</p>
                    )}
                  </div>
                )}

                {/* Navegación entre pasos */}
                <div className="flex items-center justify-between">
                  <button onClick={() => setPaso(p => Math.max(0, p - 1))} disabled={paso === 0}
                    className={`text-sm px-4 py-2 rounded-lg border ${paso === 0 ? 'text-gray-300 border-gray-100' : 'text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                    ← Anterior
                  </button>
                  {!enRevision && (
                    <button onClick={() => setPaso(p => Math.min(totalPasos, p + 1))}
                      className="btn-primary text-sm">
                      Siguiente →
                    </button>
                  )}
                </div>
              </div>

              {/* Columna derecha: Resumen de la ficha */}
              <div className="space-y-4">
                <div className="card">
                  <h4 className="font-semibold text-gray-700 mb-3">Resumen de la ficha</h4>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-start gap-2">
                      <Icon name="user" size={15} color="#9ca3af"/>
                      <div>
                        <div className="text-xs text-gray-400">Cliente</div>
                        <div className="font-medium text-gray-700">{clienteNombre || '—'}</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Icon name="doc" size={15} color="#9ca3af"/>
                      <div>
                        <div className="text-xs text-gray-400">ID / DNI</div>
                        <div className="font-medium text-gray-700">{clienteId || '—'}</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Icon name="user" size={15} color="#9ca3af"/>
                      <div>
                        <div className="text-xs text-gray-400">Asesor</div>
                        <div className="font-medium text-gray-700">{perfil?.nombre} {perfil?.apellido}</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Icon name="star" size={15} color="#9ca3af"/>
                      <div>
                        <div className="text-xs text-gray-400">Puntaje actual</div>
                        <div className="font-bold text-gray-800">{puntajeActual} / {PUNTAJE_TOTAL_MAX} pts</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Icon name="checkCircle" size={15} color="#9ca3af"/>
                      <div>
                        <div className="text-xs text-gray-400">Proyección</div>
                        <span style={{
                          background: dec.label === 'APROBADO CAMPO' ? '#DCFCE7' : dec.label === 'CONDICIONAL' ? '#FEF3C7' : '#FEE2E2',
                          color: dec.label === 'APROBADO CAMPO' ? '#15803D' : dec.label === 'CONDICIONAL' ? '#B45309' : '#B91C1C',
                        }} className="inline-block text-xs font-bold px-2.5 py-0.5 rounded-full mt-0.5">
                          {itemsRespondidos > 0 ? dec.label : 'Sin evaluar'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Progreso del registro */}
                <div className="card">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-gray-700 text-sm">Progreso del registro</h4>
                    <span className="text-sm font-bold text-teal-600">{pctRegistro}%</span>
                  </div>
                  <div className="bg-gray-100 rounded-full h-2 mb-2">
                    <div className="h-2 rounded-full bg-gradient-to-r from-teal-500 to-teal-600 transition-all duration-300"
                      style={{ width: `${pctRegistro}%` }}/>
                  </div>
                  <p className="text-xs text-gray-400">
                    {itemsRespondidos} de {itemsTotales} ítems · {pctRegistro < 100 ? 'completa los ítems para continuar' : 'listo para registrar'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── RESULTADO ── */}
      {vista === 'resultado' && resultadoFicha && (
        <div className="space-y-4 max-w-lg mx-auto">
          <div className={`card border-2 ${resultadoFicha.decision.bg}`}>
            <div className="text-center mb-4">
              <div className="mb-2" style={{ display:'grid', placeItems:'center' }}>
                {resultadoFicha.decision.label === 'APROBADO CAMPO'
                  ? <Icon name='checkCircle' size={48} color='#15803D'/>
                  : resultadoFicha.decision.label === 'CONDICIONAL'
                  ? <Icon name='alert' size={48} color='#D97706'/>
                  : <Icon name='close' size={48} color='#DC2626'/>}
              </div>
              <h3 className={`text-2xl font-black ${resultadoFicha.decision.color}`}>
                {resultadoFicha.decision.label}
              </h3>
              <p className="text-gray-600 font-medium mt-1">{resultadoFicha.cliente}</p>
              <p className="text-gray-400 text-sm">{resultadoFicha.puntaje_total} / {resultadoFicha.max} pts</p>
              {resultadoFicha.guardadoReal ? (
                <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-3 py-1 rounded-full">
                  <Icon name="checkCircle" size={13} color="#15803d"/> Guardado en Supabase
                </div>
              ) : (
                <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg text-left">
                  <strong>No se guardó en la base.</strong> {resultadoFicha.errorMsg || 'Revisa la conexión.'}
                </div>
              )}
            </div>
            <div className="space-y-2">
              {resultadoFicha.resumenFichas.map(f => (
                <div key={f.key} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{f.key} — {f.titulo}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 bg-gray-200 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full bg-cmac-red"
                           style={{ width: `${(f.obtenido/f.max)*100}%` }}/>
                    </div>
                    <span className="text-xs font-semibold w-12 text-right">{f.obtenido}/{f.max}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 bg-white/60 rounded text-xs text-gray-600">
              <strong>Siguiente paso:</strong>{' '}
              {resultadoFicha.decision.label === 'APROBADO CAMPO'
                ? 'Pasar al Comité de Créditos con el expediente completo para aprobación final y desembolso.'
                : resultadoFicha.decision.label === 'CONDICIONAL'
                ? 'Solicitar documentación adicional y segunda visita antes de elevar a comité.'
                : 'Registrar en sistema. Comunicar rechazo al cliente y orientar a mejorar indicadores.'}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={nuevaFicha} className="btn-primary flex-1">Nueva ficha</button>
            <button onClick={() => setVista('lista')} className="btn-secondary flex-1">Ver lista</button>
          </div>
        </div>
      )}
    </div>
  );
}