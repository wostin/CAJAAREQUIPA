  // src/pages/core/Recuperaciones.jsx
  // Módulo de Recuperaciones / Mora — R1 (bandas+KPIs) · R2 (gestiones) · R3 (transiciones)
  import { useEffect, useState } from 'react';
  import api from '../../api/axios';
  import { useAuth } from '../../context/AuthContext';

  const BANDA_STYLE = {
    Vigente:    { color: '#15803D', bg: '#DCFCE7' },
    Preventiva: { color: '#15803D', bg: '#DCFCE7' },
    Temprana:   { color: '#D97706', bg: '#FEF3C7' },
    Tardia:     { color: '#C2410C', bg: '#FFEDD5' },
    Judicial:   { color: '#B91C1C', bg: '#FEE2E2' },
    Castigo:    { color: '#7F1D1D', bg: '#FCA5A5' },
  };
  const soles = n => 'S/ ' + Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 });

  export default function Recuperaciones() {
    const { perfil } = useAuth();
    const rol = perfil?.rol;
    const puedeTransicion = ['riesgos', 'gerente'].includes(rol);

    const [resumen, setResumen]   = useState(null);
    const [cartera, setCartera]   = useState([]);
    const [filtroBanda, setFiltro] = useState('');
    const [sel, setSel]           = useState(null);   // crédito seleccionado (R2)
    const [gestiones, setGest]    = useState([]);
    const [msg, setMsg]           = useState(null);
    const [loading, setLoading]   = useState(true);

    const [form, setForm] = useState({ canal: 'llamada', resultado: 'contacto_efectivo', compromiso_monto: '', compromiso_fecha: '', observacion: '' });

    const cargar = async (banda = '') => {
      setLoading(true);
      try {
        const [r1, r2] = await Promise.all([
          api.get('/api/recuperaciones/bandas'),
          api.get('/api/recuperaciones/cartera', { params: { banda: banda || undefined, limit: 100 } }),
        ]);
        setResumen(r1.data?.data || null);
        setCartera(r2.data?.data || []);
      } catch (e) {
        setMsg({ tipo: 'error', txt: e.response?.data?.message || 'No se pudo cargar la cartera' });
      } finally { setLoading(false); }
    };

    useEffect(() => { cargar(); }, []);

    const verGestiones = async (credito) => {
      setSel(credito); setMsg(null);
      try {
        const r = await api.get(`/api/recuperaciones/${credito.credito_id}/gestiones`);
        setGest(r.data?.data || []);
      } catch { setGest([]); }
    };

    const registrarGestion = async () => {
      if (!sel) return;
      try {
        await api.post(`/api/recuperaciones/${sel.credito_id}/gestiones`, {
          ...form,
          compromiso_monto: form.compromiso_monto ? Number(form.compromiso_monto) : 0,
          compromiso_fecha: form.compromiso_fecha || null,
        });
        setMsg({ tipo: 'ok', txt: 'Gestión registrada' });
        setForm({ canal: 'llamada', resultado: 'contacto_efectivo', compromiso_monto: '', compromiso_fecha: '', observacion: '' });
        verGestiones(sel);
      } catch (e) { setMsg({ tipo: 'error', txt: e.response?.data?.message || 'Error al registrar' }); }
    };

    const transicion = async (accion) => {
      if (!sel) return;
      try {
        const r = await api.post(`/api/recuperaciones/${sel.credito_id}/${accion}`);
        setMsg({ tipo: 'ok', txt: `Transición ${accion} aplicada (${r.data?.data?.dias_mora} días)` });
        cargar(filtroBanda); verGestiones(sel);
      } catch (e) {
        // 403 si el rol no corresponde; o error de umbral desde la BD
        setMsg({ tipo: 'error', txt: e.response?.data?.message || `No autorizado para ${accion}` });
      }
    };

    const k = resumen?.kpis;

    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ fontFamily: "'Sora',sans-serif", color: '#0D2461', marginBottom: 4 }}>Recuperaciones / Mora</h1>
        <p style={{ color: '#7B84A3', fontSize: 13, marginBottom: 20 }}>R1 consulta por bandas · R2 gestión de cobranza · R3 transiciones judicial/castigo</p>

        {msg && (
          <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 10, fontSize: 13,
            background: msg.tipo === 'ok' ? '#DCFCE7' : '#FEE2E2', color: msg.tipo === 'ok' ? '#15803D' : '#DC2626' }}>
            {msg.txt}
          </div>
        )}

        {/* ── R1: KPIs ───────────────────────────────────── */}
        {k && (
          <div className="grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 18 }}>
            <Kpi label="Créditos vigentes+mora" value={k.total_creditos} />
            <Kpi label="Créditos en mora" value={k.creditos_en_mora} />
            <Kpi label="Ratio de mora" value={k.ratio_mora_pct + ' %'} accent="#DC2626" />
            <Kpi label="Saldo en mora" value={soles(k.saldo_en_mora)} />
          </div>
        )}

        {/* ── R1: bandas ─────────────────────────────────── */}
        <div className="card" style={{ background: '#fff', borderRadius: 14, padding: 18, marginBottom: 18, boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
          <h3 style={{ fontFamily: "'Sora',sans-serif", color: '#0D2461', marginBottom: 12 }}>Cartera por banda</h3>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <BandaChip label="Todas" activo={!filtroBanda} onClick={() => { setFiltro(''); cargar(''); }} />
            {(resumen?.bandas || []).map(b => (
              <BandaChip key={b.banda_mora} label={`${b.banda_mora} (${b.num_creditos})`} banda={b.banda_mora}
                activo={filtroBanda === b.banda_mora} onClick={() => { setFiltro(b.banda_mora); cargar(b.banda_mora); }} />
            ))}
          </div>
        </div>

        {/* ── Listado de cartera ─────────────────────────── */}
        <div className="card" style={{ background: '#fff', borderRadius: 14, padding: 18, marginBottom: 18, boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
          {loading ? <p style={{ color: '#7B84A3' }}>Cargando…</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#7B84A3', borderBottom: '1px solid #EEF1F8' }}>
                  <th style={{ padding: 8 }}>Cliente</th><th>Monto</th><th>Cuota</th>
                  <th>Días mora</th><th>Banda</th><th>Gestiones</th><th></th>
                </tr>
              </thead>
              <tbody>
                {cartera.map(c => {
                  const st = BANDA_STYLE[c.banda_mora] || {};
                  return (
                    <tr key={c.credito_id} style={{ borderBottom: '1px solid #F4F6FB' }}>
                      <td style={{ padding: 8 }}>
                        <div style={{ fontWeight: 600, color: '#0D2461' }}>{c.cliente}</div>
                        <div style={{ fontSize: 11, color: '#7B84A3' }}>{c.email}</div>
                      </td>
                      <td>{soles(c.monto_aprobado)}</td>
                      <td>{soles(c.cuota_mensual)}</td>
                      <td style={{ fontWeight: 700 }}>{c.dias_mora}</td>
                      <td><span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, color: st.color, background: st.bg }}>{c.banda_mora}</span></td>
                      <td>{c.num_gestiones}</td>
                      <td><button onClick={() => verGestiones(c)} style={btnSm}>Gestionar</button></td>
                    </tr>
                  );
                })}
                {!cartera.length && <tr><td colSpan={7} style={{ padding: 16, color: '#7B84A3' }}>Sin créditos en esta banda.</td></tr>}
              </tbody>
            </table>
          )}
        </div>

        {/* ── R2 + R3: panel del crédito seleccionado ────── */}
        {sel && (
          <div className="card" style={{ background: '#fff', borderRadius: 14, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontFamily: "'Sora',sans-serif", color: '#0D2461' }}>{sel.cliente} — {sel.dias_mora} días ({sel.banda_mora})</h3>
              <button onClick={() => setSel(null)} style={{ ...btnSm, background: '#F4F6FB', color: '#7B84A3' }}>Cerrar</button>
            </div>

            {/* R2 formulario */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 12 }}>
              <Select label="Canal" value={form.canal} onChange={v => setForm({ ...form, canal: v })}
                opts={['llamada','visita','sms','email','whatsapp','carta']} />
              <Select label="Resultado" value={form.resultado} onChange={v => setForm({ ...form, resultado: v })}
                opts={['contacto_efectivo','promesa_pago','no_contacto','negativa','renegociacion','pago_realizado']} />
              <Input label="Compromiso S/" type="number" value={form.compromiso_monto} onChange={v => setForm({ ...form, compromiso_monto: v })} />
              <Input label="Fecha compromiso" type="date" value={form.compromiso_fecha} onChange={v => setForm({ ...form, compromiso_fecha: v })} />
              <Input label="Observación" value={form.observacion} onChange={v => setForm({ ...form, observacion: v })} />
            </div>
            <button onClick={registrarGestion} style={{ ...btnSm, background: '#00A896', color: '#fff', marginBottom: 12 }}>Registrar gestión (R2)</button>

            {/* R3 transiciones */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <button onClick={() => transicion('judicial')} disabled={!puedeTransicion}
                title={puedeTransicion ? 'Requiere ≥121 días' : 'Solo Riesgos / Gerencia'}
                style={{ ...btnSm, background: puedeTransicion ? '#B91C1C' : '#E5E7EB', color: puedeTransicion ? '#fff' : '#9CA3AF' }}>
                Derivar judicial (≥121d)
              </button>
              <button onClick={() => transicion('castigo')} disabled={!puedeTransicion}
                title={puedeTransicion ? 'Requiere >180 días' : 'Solo Riesgos / Gerencia'}
                style={{ ...btnSm, background: puedeTransicion ? '#7F1D1D' : '#E5E7EB', color: puedeTransicion ? '#fff' : '#9CA3AF' }}>
                Castigar (&gt;180d)
              </button>
              {!puedeTransicion && <span style={{ fontSize: 12, color: '#7B84A3', alignSelf: 'center' }}>Acciones críticas: solo rol Riesgos o Gerencia</span>}
            </div>

            {/* Historial */}
            <h4 style={{ color: '#0D2461', fontSize: 14, marginBottom: 8 }}>Historial de gestiones</h4>
            {gestiones.length ? gestiones.map(g => (
              <div key={g.id} style={{ borderLeft: '3px solid #00A896', padding: '6px 12px', marginBottom: 6, background: '#F8FAFC', fontSize: 12 }}>
                <strong>{g.canal}</strong> · {g.resultado} · {new Date(g.created_at).toLocaleDateString('es-PE')}
                {g.compromiso_monto > 0 && <> · compromiso {soles(g.compromiso_monto)}</>}
                {g.observacion && <div style={{ color: '#7B84A3' }}>{g.observacion}</div>}
              </div>
            )) : <p style={{ color: '#7B84A3', fontSize: 12 }}>Sin gestiones registradas.</p>}
          </div>
        )}
      </div>
    );
  }

  const btnSm = { border: 'none', padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, background: '#0D2461', color: '#fff' };

  function Kpi({ label, value, accent = '#0D2461' }) {
    return (
      <div style={{ background: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
        <div style={{ fontSize: 12, color: '#7B84A3' }}>{label}</div>
        <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 22, fontWeight: 700, color: accent }}>{value}</div>
      </div>
    );
  }
  function BandaChip({ label, banda, activo, onClick }) {
    const st = BANDA_STYLE[banda] || { color: '#0D2461', bg: '#EEF1F8' };
    return (
      <button onClick={onClick} style={{ border: activo ? `2px solid ${st.color}` : '1px solid #E5E7EB',
        background: activo ? st.bg : '#fff', color: st.color, padding: '6px 12px', borderRadius: 20, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
        {label}
      </button>
    );
  }
  function Input({ label, value, onChange, type = 'text' }) {
    return (
      <label style={{ fontSize: 11, color: '#7B84A3' }}>{label}
        <input type={type} value={value} onChange={e => onChange(e.target.value)}
          style={{ width: '100%', padding: '7px 9px', borderRadius: 8, border: '1px solid #E5E7EB', marginTop: 3, fontSize: 12 }} />
      </label>
    );
  }
  function Select({ label, value, onChange, opts }) {
    return (
      <label style={{ fontSize: 11, color: '#7B84A3' }}>{label}
        <select value={value} onChange={e => onChange(e.target.value)}
          style={{ width: '100%', padding: '7px 9px', borderRadius: 8, border: '1px solid #E5E7EB', marginTop: 3, fontSize: 12 }}>
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
    );
  }
  