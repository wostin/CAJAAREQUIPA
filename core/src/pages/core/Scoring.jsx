// src/pages/core/Scoring.jsx
// Scoring Transaccional · Core Financiero — v13 (rediseño consola)
// Modelo: 800 pts · 5 dimensiones · segmentación PREMIER/ESTANDAR/BASICO/NO_APLICA
import { useState, useMemo } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import Icon from '../../components/Icon';
import api from '../../api/axios';

/* ── Paleta ─────────────────────────── */
const NAVY = '#0D2461', BLUE = '#1A3A8F', TEAL = '#00A896';
const GOLD = '#FFB300', ORANGE = '#F97316', PURPLE = '#7C3AED', GREEN = '#16A34A', GRAY = '#94A3B8';

/* ── Modelo ─────────────────────────── */
const DIMENSIONES = [
  { codigo: 'A', nombre: 'Saldo promedio',        peso: 200, icon: 'money',      color: BLUE,   descripcion: 'Nivel de saldo promedio en cuentas activas' },
  { codigo: 'B', nombre: 'Regularidad',           peso: 160, icon: 'chart',      color: GREEN,  descripcion: 'Frecuencia y consistencia de movimientos' },
  { codigo: 'C', nombre: 'Disciplina de pago',    peso: 160, icon: 'receipt',    color: PURPLE, descripcion: 'Cumplimiento puntual de obligaciones' },
  { codigo: 'D', nombre: 'Vínculo institucional', peso: 160, icon: 'building',   color: ORANGE, descripcion: 'Tiempo y profundidad de relación con la caja' },
  { codigo: 'E', nombre: 'Riesgo SBS',            peso: 120, icon: 'lock',       color: '#E24B4A', descripcion: 'Historial en central de riesgos SBS Perú' },
];
const DIM_COLOR = { A: BLUE, B: GREEN, C: ORANGE, D: PURPLE, E: TEAL };

const SEG = {
  PREMIER:   { label: 'PREMIER',   color: GOLD,   pill: { bg: '#FEF3C7', fg: '#92400E' } },
  ESTANDAR:  { label: 'ESTÁNDAR',  color: BLUE,   pill: { bg: '#E0E7FF', fg: '#3730A3' } },
  BASICO:    { label: 'BÁSICO',    color: GREEN,  pill: { bg: '#DCFCE7', fg: '#166534' } },
  NO_APLICA: { label: 'NO APLICA', color: GRAY,   pill: { bg: '#F1F5F9', fg: '#475569' } },
};

function calcularSegmento(s) {
  if (s >= 600) return 'PREMIER';
  if (s >= 440) return 'ESTANDAR';
  if (s >= 280) return 'BASICO';
  return 'NO_APLICA';
}
const colorScore = (s) => SEG[calcularSegmento(s)].color;

/* ── Íconos SVG en línea (pequeños, para no depender de Icon) ── */
const I = {
  eye: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>,
  dots: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>,
  filter: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 3H2l8 9.5V19l4 2v-8.5L22 3Z"/></svg>,
  pencil: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"/></svg>,
  left: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>,
  right: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>,
  close: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>,
  down: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>,
};

/* ── Demo ───────────────────────────── */
function clienteDemo(seed = 1) {
  const scores = {
    A: Math.floor(80 + seed * 37) % 200, B: Math.floor(60 + seed * 53) % 160,
    C: Math.floor(40 + seed * 71) % 160, D: Math.floor(20 + seed * 83) % 160,
    E: Math.floor(60 + seed * 97) % 120,
  };
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  return {
    id: `USR-${1000 + seed}`,
    nombre: ['Carlos Mamani', 'Rosa Quispe', 'Juan Flores', 'Ana Ccori', 'Pedro Huanca'][seed % 5],
    email: `cliente${seed}@demo.pe`,
    scores, score_total: total, segmento: calcularSegmento(total),
    ultima_evaluacion: new Date(Date.now() - seed * 86400000 * 3).toLocaleDateString('es-PE'),
    techo_credito: total >= 600 ? 5000 : total >= 440 ? 2500 : total >= 280 ? 1000 : 0,
  };
}
const UNIVERSO = Array.from({ length: 24 }, (_, i) => clienteDemo(i + 1));
const PAGE_SIZE = 8;

function radarData(scores, pesos) {
  return DIMENSIONES.map(d => ({
    dimension: d.codigo, nombre: d.nombre,
    valor: Math.round((scores[d.codigo] / pesos[d.codigo]) * 100),
  }));
}

/* ════════════════════════════════════════════ */
export default function CoreScoring() {
  const [busqueda, setBusqueda] = useState('');
  const [filtroSegmento, setFiltroSegmento] = useState('');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState(null);            // cliente para modal detalle
  const [editFormula, setEditFormula] = useState(false);
  const [pesos, setPesos] = useState(Object.fromEntries(DIMENSIONES.map(d => [d.codigo, d.peso])));
  // Evaluar por ID
  const [evalOpen, setEvalOpen] = useState(false);
  const [evaluandoId, setEvaluandoId] = useState('');
  const [evaluando, setEvaluando] = useState(false);

  const totalPesos = Object.values(pesos).reduce((a, b) => a + b, 0);

  const filtrado = useMemo(() => {
    let arr = UNIVERSO.filter(c => {
      const okB = !busqueda ||
        c.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        c.email.toLowerCase().includes(busqueda.toLowerCase());
      const okS = !filtroSegmento || c.segmento === filtroSegmento;
      return okB && okS;
    });
    arr = [...arr].sort((a, b) => sortDir === 'desc' ? b.score_total - a.score_total : a.score_total - b.score_total);
    return arr;
  }, [busqueda, filtroSegmento, sortDir]);

  const totalPaginas = Math.max(1, Math.ceil(filtrado.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPaginas);
  const desde = (pageSafe - 1) * PAGE_SIZE;
  const visibles = filtrado.slice(desde, desde + PAGE_SIZE);

  const stats = {
    total: UNIVERSO.length,
    premier:  UNIVERSO.filter(c => c.segmento === 'PREMIER').length,
    estandar: UNIVERSO.filter(c => c.segmento === 'ESTANDAR').length,
    basico:   UNIVERSO.filter(c => c.segmento === 'BASICO').length,
    no_aplica:UNIVERSO.filter(c => c.segmento === 'NO_APLICA').length,
  };

  async function evaluarCliente() {
    if (!evaluandoId.trim()) return;
    setEvaluando(true);
    try {
      const res = await api.post('/api/scoring/evaluar', { user_id: evaluandoId });
      setSel(res.data); setEvalOpen(false);
    } catch {
      await new Promise(r => setTimeout(r, 900));
      const seed = parseInt(evaluandoId.replace(/\D/g, '').slice(-2)) || 7;
      setSel(clienteDemo(seed)); setEvalOpen(false);
    } finally { setEvaluando(false); setEvaluandoId(''); }
  }

  /* ── estilos reutilizables ── */
  const cardStyle = { background: '#fff', border: '1px solid #E9EDF4', borderRadius: 16, boxShadow: '0 1px 3px rgba(13,36,97,.06)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY }}>Scoring Transaccional</h1>
            <button onClick={() => setEditFormula(v => !v)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, letterSpacing: '.04em',
                color: editFormula ? '#fff' : '#B3261E', background: editFormula ? '#B3261E' : '#fff',
                border: '1px solid #f0c9c5', borderRadius: 8, padding: '5px 11px', cursor: 'pointer', textTransform: 'uppercase' }}>
              {I.pencil} {editFormula ? 'Cerrar' : 'Editar fórmula'}
            </button>
          </div>
          <p style={{ fontSize: 13, color: '#7B84A3', marginTop: 4 }}>
            Modelo: <strong style={{ color: '#374060' }}>{totalPesos} pts</strong> · 5 dimensiones · CMAC Arequipa
          </p>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, color: '#7B84A3' }}>
          <div>Score máximo: <strong style={{ color: NAVY }}>800 pts</strong></div>
          <div>Última actualización: <strong style={{ color: '#374060' }}>{new Date().toLocaleDateString('es-PE')}</strong></div>
        </div>
      </div>

      {/* ── Composición del modelo (banda oscura) ── */}
      <div style={{ background: 'linear-gradient(135deg,#0d2461,#1a3a8f)', borderRadius: 16, padding: '16px 18px', color: '#fff', boxShadow: '0 8px 28px rgba(13,36,97,.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="calculator" size={15} color="#9DB2FF" />
            <span style={{ fontSize: 13, fontWeight: 700 }}>Composición del modelo de scoring</span>
          </div>
          {editFormula && (
            <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 50,
              background: totalPesos === 800 ? 'rgba(34,197,94,.2)' : 'rgba(249,115,22,.2)',
              color: totalPesos === 800 ? '#86EFAC' : '#FDBA74' }}>
              Total: {totalPesos} / 800 {totalPesos === 800 ? '✓' : '⚠'}
            </span>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 4 }}>
          {DIMENSIONES.map((d, i) => (
            <div key={d.codigo} style={{ textAlign: 'center', padding: '4px 10px',
              borderRight: i < DIMENSIONES.length - 1 ? '1px dashed rgba(255,255,255,.18)' : 'none' }}>
              <div style={{ width: 46, height: 46, borderRadius: 14, margin: '0 auto 8px',
                background: `${d.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 4px 14px ${d.color}66` }}>
                <Icon name={d.icon} size={20} color="#fff" />
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.85)', marginBottom: 4 }}>{d.nombre}</div>
              {editFormula ? (
                <input type="number" value={pesos[d.codigo]} min={0} max={400} step={10}
                  onChange={e => setPesos(p => ({ ...p, [d.codigo]: Number(e.target.value) || 0 }))}
                  style={{ width: 70, textAlign: 'center', fontWeight: 800, fontSize: 14, color: '#fff',
                    background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.3)', borderRadius: 8, padding: '3px 4px', outline: 'none' }} />
              ) : (
                <div style={{ fontWeight: 800, fontSize: 15 }}>{pesos[d.codigo]} pts</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Tarjetas resumen ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
        <StatCard icon="users" iconColor={BLUE} value={stats.total} label="Total evaluados" foot={<span style={{ color: GREEN, fontWeight: 700 }}>↗ cartera activa</span>} />
        <StatCard icon="star"  iconColor={GOLD}   value={stats.premier}   label="Premier"   foot={`${((stats.premier/stats.total)*100).toFixed(1)}%`} valueColor={GOLD} />
        <StatCard icon="user"  iconColor={BLUE}   value={stats.estandar}  label="Estándar"  foot={`${((stats.estandar/stats.total)*100).toFixed(1)}%`} valueColor={BLUE} />
        <StatCard icon="chart" iconColor={GREEN}  value={stats.basico}    label="Básico"    foot={`${((stats.basico/stats.total)*100).toFixed(1)}%`} valueColor={GREEN} />
        <StatCard icon="alert" iconColor={'#DC2626'} value={stats.no_aplica} label="No aplica" foot={`${((stats.no_aplica/stats.total)*100).toFixed(1)}%`} valueColor={'#DC2626'} />
      </div>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#7B84A3' }}>
            <Icon name="search" size={15} color="#7B84A3" />
          </span>
          <input value={busqueda} onChange={e => { setBusqueda(e.target.value); setPage(1); }}
            placeholder="Buscar cliente por nombre o email..."
            style={{ width: '100%', padding: '10px 12px 10px 36px', border: '1px solid #DDE2F0', borderRadius: 12, fontSize: 14, outline: 'none', background: '#fff' }} />
        </div>
        <select value={filtroSegmento} onChange={e => { setFiltroSegmento(e.target.value); setPage(1); }}
          style={{ padding: '10px 12px', border: '1px solid #DDE2F0', borderRadius: 12, fontSize: 14, background: '#fff', color: '#374060', minWidth: 180 }}>
          <option value="">Todos los segmentos</option>
          <option value="PREMIER">⭐ Premier</option>
          <option value="ESTANDAR">Estándar</option>
          <option value="BASICO">Básico</option>
          <option value="NO_APLICA">No aplica</option>
        </select>
        <button onClick={() => setEvalOpen(true)}
          style={{ padding: '10px 16px', background: TEAL, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          Evaluar por ID
        </button>
        <button title="Filtros" style={{ width: 42, height: 42, display: 'grid', placeItems: 'center', background: '#fff', border: '1px solid #DDE2F0', borderRadius: 12, color: '#7B84A3', cursor: 'pointer' }}>
          {I.filter}
        </button>
      </div>

      {/* ── Tabla ── */}
      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F8FAFD' }}>
                <Th>Cliente</Th>
                <Th center>
                  <button onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', color: 'inherit', letterSpacing: '.08em' }}>
                    SCORE <span style={{ transform: sortDir === 'asc' ? 'rotate(180deg)' : 'none', display: 'inline-flex' }}>{I.down}</span>
                  </button>
                </Th>
                <Th center>Segmento</Th>
                {['A', 'B', 'C', 'D', 'E'].map(x => <Th key={x} center>{x}</Th>)}
                <Th center>Techo</Th>
                <Th center>Acción</Th>
              </tr>
            </thead>
            <tbody>
              {visibles.map(c => {
                const seg = SEG[c.segmento];
                return (
                  <tr key={c.id} style={{ borderTop: '1px solid #EEF1F8' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#F8FAFD'}
                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                          background: `${seg.color}22`, color: seg.color, display: 'grid', placeItems: 'center',
                          fontSize: 12, fontWeight: 800 }}>
                          {c.nombre.split(' ').map(n => n[0]).slice(0, 2).join('')}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: NAVY }}>{c.nombre}</div>
                          <div style={{ fontSize: 12, color: '#A0A8C0' }}>{c.email}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '11px 8px', textAlign: 'center' }}>
                      <span style={{ fontWeight: 800, fontSize: 18, color: colorScore(c.score_total) }}>{c.score_total}</span>
                    </td>
                    <td style={{ padding: '11px 8px', textAlign: 'center' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 50, fontSize: 11, fontWeight: 700, background: seg.pill.bg, color: seg.pill.fg }}>{seg.label}</span>
                    </td>
                    {['A', 'B', 'C', 'D', 'E'].map(dim => (
                      <td key={dim} style={{ padding: '11px 8px', textAlign: 'center', fontWeight: 700, color: DIM_COLOR[dim] }}>{c.scores[dim]}</td>
                    ))}
                    <td style={{ padding: '11px 8px', textAlign: 'center', fontWeight: 600, color: '#374060' }}>
                      {c.techo_credito > 0 ? `S/ ${c.techo_credito.toLocaleString()}` : '—'}
                    </td>
                    <td style={{ padding: '11px 8px', textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <button onClick={() => setSel(c)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, border: '1px solid #DDE2F0', background: '#fff', color: NAVY, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                          {I.eye} Ver detalle
                        </button>
                        <button title="Más" style={{ width: 28, height: 28, display: 'grid', placeItems: 'center', border: '1px solid #DDE2F0', borderRadius: 8, background: '#fff', color: '#7B84A3', cursor: 'pointer' }}>{I.dots}</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visibles.length === 0 && (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 32, color: '#A0A8C0' }}>Sin resultados para los filtros aplicados.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer paginación */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, padding: '12px 16px', borderTop: '1px solid #EEF1F8' }}>
          <span style={{ fontSize: 12, color: '#7B84A3' }}>
            Mostrando {filtrado.length === 0 ? 0 : desde + 1} a {Math.min(desde + PAGE_SIZE, filtrado.length)} de {filtrado.length} resultados
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <PagBtn disabled={pageSafe <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>{I.left}</PagBtn>
            {Array.from({ length: totalPaginas }, (_, i) => i + 1).map(n => (
              <button key={n} onClick={() => setPage(n)}
                style={{ minWidth: 32, height: 32, borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  border: '1px solid', borderColor: n === pageSafe ? NAVY : '#DDE2F0',
                  background: n === pageSafe ? NAVY : '#fff', color: n === pageSafe ? '#fff' : '#374060' }}>
                {n}
              </button>
            ))}
            <PagBtn disabled={pageSafe >= totalPaginas} onClick={() => setPage(p => Math.min(totalPaginas, p + 1))}>{I.right}</PagBtn>
          </div>
        </div>
      </div>

      {/* ── Modal detalle ── */}
      {sel && <ModalDetalle cliente={sel} pesos={pesos} onClose={() => setSel(null)} />}

      {/* ── Modal evaluar por ID ── */}
      {evalOpen && (
        <Overlay onClose={() => setEvalOpen(false)}>
          <div style={{ width: 'min(440px,92vw)' }}>
            <ModalHead title="Evaluar cliente por ID" onClose={() => setEvalOpen(false)} />
            <div style={{ padding: 18 }}>
              <p style={{ fontSize: 12, color: '#7B84A3', marginBottom: 12 }}>
                Ejecuta <code style={{ background: '#F0F4FF', padding: '1px 5px', borderRadius: 4 }}>calcular_score_transaccional()</code> vía RPC en Supabase. En demo, ingresa cualquier número (ej. 7).
              </p>
              <input value={evaluandoId} onChange={e => setEvaluandoId(e.target.value)}
                placeholder="UUID del cliente (auth.users id)"
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #DDE2F0', borderRadius: 10, fontSize: 14, outline: 'none', marginBottom: 12 }} />
              <button onClick={evaluarCliente} disabled={evaluando || !evaluandoId.trim()}
                style={{ width: '100%', padding: '11px 16px', background: TEAL, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer', opacity: (evaluando || !evaluandoId.trim()) ? .6 : 1 }}>
                {evaluando ? 'Calculando…' : 'Evaluar'}
              </button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}

/* ── Subcomponentes ── */
function Th({ children, center }) {
  return <th style={{ padding: '10px 12px', textAlign: center ? 'center' : 'left', fontSize: 10.5, fontWeight: 800,
    letterSpacing: '.08em', textTransform: 'uppercase', color: '#7B84A3', borderBottom: '1px solid #E2E8F6' }}>{children}</th>;
}

function StatCard({ icon, iconColor, value, label, foot, valueColor = NAVY }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E9EDF4', borderRadius: 16, boxShadow: '0 1px 3px rgba(13,36,97,.06)', padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 46, height: 46, borderRadius: 12, flexShrink: 0, background: `${iconColor}1A`, display: 'grid', placeItems: 'center' }}>
        <Icon name={icon} size={20} color={iconColor} />
      </div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 800, color: valueColor, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 12, color: '#7B84A3', marginTop: 3 }}>{label}</div>
        <div style={{ fontSize: 11, color: '#A0A8C0', marginTop: 2 }}>{foot}</div>
      </div>
    </div>
  );
}

function PagBtn({ children, disabled, onClick }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center',
        border: '1px solid #DDE2F0', background: '#fff', color: disabled ? '#C7D0E0' : '#374060',
        cursor: disabled ? 'default' : 'pointer' }}>{children}</button>
  );
}

function Overlay({ children, onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(13,27,62,.45)', backdropFilter: 'blur(2px)', display: 'grid', placeItems: 'center', zIndex: 300, padding: 16, animation: 'fadeIn .2s ease' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, boxShadow: '0 24px 60px rgba(13,36,97,.3)', maxHeight: '90vh', overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  );
}

function ModalHead({ title, onClose }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid #EEF1F8' }}>
      <h3 style={{ fontSize: 15, fontWeight: 800, color: NAVY }}>{title}</h3>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7B84A3' }}>{I.close}</button>
    </div>
  );
}

function ModalDetalle({ cliente, pesos, onClose }) {
  const seg = SEG[cliente.segmento];
  const cuota = cliente.techo_credito > 0 ? (() => {
    const tem = Math.pow(1.6, 1 / 12) - 1;
    return (cliente.techo_credito * tem / (1 - Math.pow(1 + tem, -12))).toFixed(2);
  })() : null;

  return (
    <Overlay onClose={onClose}>
      <div style={{ width: 'min(760px,94vw)' }}>
        <ModalHead title={`Detalle de scoring · ${cliente.nombre}`} onClose={onClose} />
        <div style={{ padding: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 18 }}>

          {/* Radar + barras */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 800, color: NAVY, fontSize: 16 }}>{cliente.nombre}</div>
                <div style={{ fontSize: 12, color: '#7B84A3' }}>{cliente.email}</div>
                <div style={{ fontSize: 11, color: '#A0A8C0' }}>Última evaluación: {cliente.ultima_evaluacion}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 34, fontWeight: 900, color: colorScore(cliente.score_total) }}>{cliente.score_total}</div>
                <div style={{ fontSize: 11, color: '#A0A8C0' }}>/ 800 pts</div>
                <span style={{ padding: '3px 10px', borderRadius: 50, fontSize: 11, fontWeight: 700, background: seg.pill.bg, color: seg.pill.fg }}>{seg.label}</span>
              </div>
            </div>

            <ResponsiveContainer width="100%" height={230}>
              <RadarChart data={radarData(cliente.scores, pesos)} outerRadius={85}>
                <PolarGrid stroke="#E2E8F6" />
                <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 13, fill: '#374060', fontWeight: 700 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#A0A8C0' }} />
                <Radar dataKey="valor" stroke={NAVY} fill={BLUE} fillOpacity={0.45} />
                <Tooltip formatter={(v, n, p) => [`${v}%`, p.payload.nombre]} />
              </RadarChart>
            </ResponsiveContainer>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
              {DIMENSIONES.map(d => {
                const v = cliente.scores[d.codigo], max = pesos[d.codigo];
                const pct = Math.min((v / max) * 100, 100);
                return (
                  <div key={d.codigo}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                      <span style={{ color: '#374060' }}><b style={{ color: DIM_COLOR[d.codigo] }}>{d.codigo}.</b> {d.nombre}</span>
                      <span style={{ fontWeight: 600 }}>{v}/{max}</span>
                    </div>
                    <div style={{ background: '#EEF1F8', borderRadius: 9999, height: 7 }}>
                      <div style={{ width: `${pct}%`, height: 7, borderRadius: 9999, background: DIM_COLOR[d.codigo] }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Decisión crediticia */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ border: `1px solid #E9EDF4`, borderTop: `4px solid ${seg.color}`, borderRadius: 14, padding: 14 }}>
              <h4 style={{ fontWeight: 800, color: NAVY, marginBottom: 10 }}>Decisión crediticia</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Box label="Segmento"><span style={{ padding: '3px 10px', borderRadius: 50, fontSize: 11, fontWeight: 700, background: seg.pill.bg, color: seg.pill.fg }}>{seg.label}</span></Box>
                <Box label="Techo crediticio"><b style={{ color: TEAL, fontSize: 17 }}>{cliente.techo_credito > 0 ? `S/ ${cliente.techo_credito.toLocaleString()}` : 'No aplica'}</b></Box>
                <Box label="Cuota estimada (12m)"><b style={{ color: NAVY }}>{cuota ? `S/ ${cuota}` : '—'}</b></Box>
                <Box label="TEA aplicada"><b style={{ color: NAVY }}>60% anual</b></Box>
              </div>
            </div>

            <div style={{ border: '1px solid #E9EDF4', borderRadius: 14, padding: 14 }}>
              <h4 style={{ fontWeight: 800, color: NAVY, marginBottom: 8 }}>Referencia: Clasificación SBS</h4>
              {[
                { cat: 'Normal', dias: '0 días', bg: '#DCFCE7', fg: '#166534' },
                { cat: 'CPP', dias: '1–8 días', bg: '#FEF9C3', fg: '#854D0E' },
                { cat: 'Deficiente', dias: '9–30 días', bg: '#FFEDD5', fg: '#9A3412' },
                { cat: 'Dudoso', dias: '31–60 días', bg: '#FEE2E2', fg: '#991B1B' },
                { cat: 'Pérdida', dias: '> 60 días', bg: '#FECACA', fg: '#7F1D1D' },
              ].map(m => (
                <div key={m.cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '3px 0' }}>
                  <span style={{ padding: '2px 8px', borderRadius: 6, fontWeight: 600, background: m.bg, color: m.fg }}>{m.cat}</span>
                  <span style={{ color: '#7B84A3' }}>{m.dias} de atraso</span>
                </div>
              ))}
              <p style={{ fontSize: 11, color: '#A0A8C0', marginTop: 8 }}>Resolución SBS 11356-2008</p>
            </div>
          </div>
        </div>
      </div>
    </Overlay>
  );
}

function Box({ label, children }) {
  return (
    <div style={{ background: '#F8FAFF', borderRadius: 10, padding: 10 }}>
      <div style={{ fontSize: 11, color: '#7B84A3', marginBottom: 3 }}>{label}</div>
      {children}
    </div>
  );
}