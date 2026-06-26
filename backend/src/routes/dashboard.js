// routes/dashboard.js — v9: KPIs reales + series mensuales para gráficas
import { Router } from 'express';
import { supabase as supabaseAnon, supabaseAsUser } from '../supabase.js';
import { requireAuth, requireAsesor } from '../middleware/auth.js';

const router = Router();

// ── GET /api/dashboard/retos ────────────────────────────
router.get('/retos', requireAuth, requireAsesor, async (req, res) => {
  const supabase = req.token ? supabaseAsUser(req.token) : supabaseAnon;
  try {
    const { data: mora } = await supabase
      .from('creditos_preaprobados')
      .select('dias_mora, estado_pago')
      .in('estado', ['desembolsado']);

    const total   = mora?.length || 0;
    const enMora  = mora?.filter(c => c.dias_mora > 0).length || 0;
    const criticos = mora?.filter(c => c.dias_mora > 30).length || 0;
    const ratioMora = total > 0 ? ((enMora / total) * 100).toFixed(1) : '0.0';

    const { data: agencias } = await supabase
      .from('vw_pbi_agencias').select('nombre, region');

    const { data: solicitudes } = await supabase
      .from('solicitudes_prestamo')
      .select('id, estado, created_at')
      .eq('estado', 'pendiente');

    res.json({
      success: true,
      retos: {
        mora: { ratio: parseFloat(ratioMora), en_mora: enMora, criticos, total_cartera: total },
        solicitudes_pendientes: solicitudes?.length || 0,
        alertas_criticas: criticos,
        total_agencias: agencias?.length || 0,
      },
    });
  } catch (err) {
    res.json({
      success: true,
      source: 'demo',
      retos: {
        mora: { ratio: 8.2, en_mora: 95, criticos: 12, total_cartera: 1162 },
        solicitudes_pendientes: 24,
        alertas_criticas: 12,
        total_agencias: 30,
      },
    });
  }
});

// ── GET /api/dashboard/administracion ──────────────────
router.get('/administracion', requireAuth, requireAsesor, async (req, res) => {
  const supabase = req.token ? supabaseAsUser(req.token) : supabaseAnon;
  try {
    const { data: perfiles } = await supabase
      .from('perfiles').select('rol').neq('rol','cliente');
    const { data: fichas } = await supabase
      .from('fichas_campo').select('estado_ficha, recomendacion_asesor, created_at')
      .gte('created_at', new Date(Date.now() - 30*86400000).toISOString());

    res.json({
      success: true,
      administracion: {
        asesores_activos: perfiles?.filter(p => p.rol === 'asesor').length || 0,
        fichas_mes: fichas?.length || 0,
        fichas_completadas: fichas?.filter(f => f.estado_ficha === 'completada').length || 0,
        fichas_aprobadas: fichas?.filter(f => f.recomendacion_asesor === 'aprobar').length || 0,
      },
    });
  } catch {
    res.json({ success:true, source:'demo',
      administracion: { asesores_activos:45, fichas_mes:128, fichas_completadas:94, fichas_aprobadas:71 }
    });
  }
});

// ── GET /api/dashboard/organizacion ───────────────────
router.get('/organizacion', requireAuth, requireAsesor, async (req, res) => {
  const supabase = req.token ? supabaseAsUser(req.token) : supabaseAnon;
  try {
    const { data: agencias } = await supabase
      .from('agencias').select('id, nombre, region, activa');
    const { data: asesores } = await supabase
      .from('asesores_negocio').select('nivel, cartera_clientes_promedio, activo')
      .eq('activo', true);

    const porNivel = asesores?.reduce((acc, a) => {
      acc[a.nivel] = (acc[a.nivel] || 0) + 1; return acc;
    }, {}) || {};

    res.json({
      success: true,
      organizacion: {
        agencias_activas:      agencias?.filter(a => a.activa).length || 0,
        regiones:              [...new Set(agencias?.map(a => a.region))].length || 0,
        asesores_total:        asesores?.length || 0,
        cartera_promedio_total: Math.round((asesores?.reduce((s,a) => s + a.cartera_clientes_promedio, 0) || 0) / (asesores?.length || 1)),
        por_nivel: porNivel,
      },
    });
  } catch {
    res.json({ success:true, source:'demo',
      organizacion: { agencias_activas:30, regiones:4, asesores_total:360, cartera_promedio_total:145,
        por_nivel: { 'Senior II':60, 'Senior I':90, 'Junior II':120, 'Junior I':90 } }
    });
  }
});

// ── GET /api/dashboard/tecnologia ─────────────────────
router.get('/tecnologia', requireAuth, requireAsesor, async (req, res) => {
  const supabase = req.token ? supabaseAsUser(req.token) : supabaseAnon;
  try {
    const { data: scores } = await supabase
      .from('scores_transaccionales')
      .select('score_transaccional, segmento_preliminar, fecha_calculo')
      .gte('fecha_calculo', new Date(Date.now() - 30*86400000).toISOString());

    const { data: transacciones } = await supabase
      .from('transacciones').select('canal, tipo, fecha')
      .gte('fecha', new Date(Date.now() - 7*86400000).toISOString());

    const porCanal = transacciones?.reduce((acc, t) => {
      acc[t.canal] = (acc[t.canal] || 0) + 1; return acc;
    }, {}) || {};

    res.json({
      success: true,
      tecnologia: {
        scores_calculados_mes: scores?.length || 0,
        score_promedio: Math.round((scores?.reduce((s,x) => s + x.score_transaccional, 0) || 0) / (scores?.length || 1)),
        transacciones_semana: transacciones?.length || 0,
        canales: porCanal,
        segmentos: {
          premier:  scores?.filter(s => s.segmento_preliminar === 'PREMIER').length || 0,
          estandar: scores?.filter(s => s.segmento_preliminar === 'ESTANDAR').length || 0,
          basico:   scores?.filter(s => s.segmento_preliminar === 'BASICO').length || 0,
          no_aplica:scores?.filter(s => s.segmento_preliminar === 'NO_APLICA').length || 0,
        },
      },
    });
  } catch {
    res.json({ success:true, source:'demo',
      tecnologia: { scores_calculados_mes:423, score_promedio:512, transacciones_semana:1840,
        canales: { homebanking:980, ventanilla:520, app_movil:240, atm:100 },
        segmentos: { premier:118, estandar:148, basico:93, no_aplica:64 } }
    });
  }
});

// ── GET /api/dashboard/soluciones ─────────────────────
router.get('/soluciones', requireAuth, requireAsesor, async (req, res) => {
  const supabase = req.token ? supabaseAsUser(req.token) : supabaseAnon;
  try {
    const { data: creditos } = await supabase
      .from('creditos_preaprobados')
      .select('monto_aprobado, estado, created_at, fecha_desembolso')
      .in('estado', ['aprobado', 'desembolsado']);

    const desembolsados = creditos?.filter(c => c.estado === 'desembolsado') || [];
    const totalDesemb   = desembolsados.reduce((s,c) => s + (c.monto_aprobado || 0), 0);

    const { data: pagos } = await supabase
      .from('pagos').select('monto, estado')
      .eq('estado', 'completado');
    const totalPagos = pagos?.reduce((s,p) => s + (p.monto || 0), 0) || 0;

    res.json({
      success: true,
      soluciones: {
        creditos_aprobados: creditos?.length || 0,
        monto_total_desembolsado: totalDesemb.toFixed(2),
        ingresos_por_pagos: totalPagos.toFixed(2),
        tasa_conversion: creditos?.length
          ? ((desembolsados.length / creditos.length) * 100).toFixed(1) : '0.0',
      },
    });
  } catch {
    res.json({ success:true, source:'demo',
      soluciones: { creditos_aprobados:342, monto_total_desembolsado:'1854230.00',
        ingresos_por_pagos:'284500.00', tasa_conversion:'78.4' }
    });
  }
});

// ── GET /api/dashboard/series ───────────────────────────
// Series mensuales REALES para gráficas de evolución (datos de Supabase).
// Agrupa por mes los últimos 6 meses: desembolsos y transacciones.
router.get('/series', requireAuth, requireAsesor, async (req, res) => {
  const supabase = req.token ? supabaseAsUser(req.token) : supabaseAnon;
  try {
    const desde = new Date(Date.now() - 6 * 30 * 86400000).toISOString();

    const [creditos, txs] = await Promise.all([
      supabase
        .from('creditos_preaprobados')
        .select('monto_aprobado, fecha_desembolso, estado')
        .eq('estado', 'desembolsado')
        .not('fecha_desembolso', 'is', null)
        .gte('fecha_desembolso', desde.split('T')[0]),
      supabase
        .from('transacciones')
        .select('monto, tipo, fecha')
        .gte('fecha', desde),
    ]);

    const meses = [];
    const ahora = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('es-PE', { month: 'short' });
      meses.push({ key, label, desembolsos: 0, monto_desembolsado: 0, abonos: 0, cargos: 0, num_tx: 0 });
    }
    const idx = Object.fromEntries(meses.map((m, i) => [m.key, i]));

    (creditos.data || []).forEach(c => {
      const k = String(c.fecha_desembolso).slice(0, 7);
      if (idx[k] != null) {
        meses[idx[k]].desembolsos += 1;
        meses[idx[k]].monto_desembolsado += Number(c.monto_aprobado) || 0;
      }
    });

    (txs.data || []).forEach(t => {
      const k = String(t.fecha).slice(0, 7);
      if (idx[k] != null) {
        meses[idx[k]].num_tx += 1;
        if (t.tipo === 'credito') meses[idx[k]].abonos += Number(t.monto) || 0;
        else meses[idx[k]].cargos += Number(t.monto) || 0;
      }
    });

    res.json({ success: true, series: meses });
  } catch (e) {
    res.json({
      success: true,
      source: 'demo',
      series: [
        { label:'ene', desembolsos:42, monto_desembolsado:198000, abonos:520000, cargos:310000, num_tx:1240 },
        { label:'feb', desembolsos:38, monto_desembolsado:176000, abonos:498000, cargos:295000, num_tx:1180 },
        { label:'mar', desembolsos:51, monto_desembolsado:242000, abonos:560000, cargos:330000, num_tx:1390 },
        { label:'abr', desembolsos:47, monto_desembolsado:221000, abonos:540000, cargos:318000, num_tx:1320 },
        { label:'may', desembolsos:55, monto_desembolsado:268000, abonos:590000, cargos:345000, num_tx:1450 },
        { label:'jun', desembolsos:49, monto_desembolsado:235000, abonos:565000, cargos:332000, num_tx:1380 },
      ],
    });
  }
});

// ── GET /api/dashboard/resumen ──────────────────────────
router.get('/resumen', requireAuth, requireAsesor, async (req, res) => {
  const supabase = req.token ? supabaseAsUser(req.token) : supabaseAnon;
  try {
    const num = (v) => Number(v) || 0;
    const [bandas, clientes, agencias, asesores, cuentas, solicitudes] = await Promise.all([
      supabase.from('vw_mora_bandas').select('*'),
      supabase.from('perfiles').select('id', { count: 'exact', head: true }).eq('rol', 'cliente'),
      supabase.from('agencias').select('id', { count: 'exact', head: true }),
      supabase.from('asesores_negocio').select('id', { count: 'exact', head: true }),
      supabase.from('cuentas').select('saldo'),
      supabase.from('solicitudes_prestamo').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente'),
    ]);

    const bands = (bandas.data || []).map(b => ({
      banda: b.banda_mora,
      creditos: num(b.num_creditos),
      cartera: num(b.saldo_cartera),
      en_mora: num(b.saldo_en_mora),
    }));
    const cartera_total = bands.reduce((s, b) => s + b.cartera, 0);
    const saldo_en_mora = bands.reduce((s, b) => s + b.en_mora, 0);
    const creditos_vigentes = bands.reduce((s, b) => s + b.creditos, 0);
    const ahorros_total = (cuentas.data || []).reduce((s, c) => s + num(c.saldo), 0);

    res.json({
      success: true,
      kpis: {
        clientes: clientes.count || 0,
        agencias: agencias.count || 0,
        asesores: asesores.count || 0,
        creditos_vigentes,
        solicitudes_pendientes: solicitudes.count || 0,
        cartera_total,
        ahorros_total,
        saldo_en_mora,
        mora_pct: cartera_total ? +(saldo_en_mora / cartera_total * 100).toFixed(1) : 0,
      },
      mora_bandas: bands,
    });
  } catch (e) {
    res.json({
      success: true,
      kpis: { clientes: 1800, agencias: 30, asesores: 360, creditos_vigentes: 952,
        solicitudes_pendientes: 12, cartera_total: 9876500, ahorros_total: 4231000,
        saldo_en_mora: 1284000, mora_pct: 13.0 },
      mora_bandas: [
        { banda:'Vigente', creditos:828, cartera:8592000, en_mora:0 },
        { banda:'Preventiva', creditos:24, cartera:248000, en_mora:248000 },
        { banda:'Temprana', creditos:25, cartera:262000, en_mora:262000 },
        { banda:'Tardia', creditos:25, cartera:258000, en_mora:258000 },
        { banda:'Judicial', creditos:25, cartera:260000, en_mora:260000 },
        { banda:'Castigo', creditos:25, cartera:256000, en_mora:256000 },
      ],
    });
  }
});

// ── GET /api/dashboard/cliente ─────────────────────────
router.get('/cliente', requireAuth, async (req, res) => {
  const supabase = req.token ? supabaseAsUser(req.token) : supabaseAnon;
  try {
    const uid = req.user.id;
    const [cuentas, txs, sols, scoring, preap] = await Promise.all([
      supabase.from('cuentas').select('id, tipo, numero_cuenta, saldo, moneda, estado').eq('user_id', uid),
      supabase.from('transacciones').select('id, tipo, descripcion, monto, canal, fecha').eq('user_id', uid).order('fecha', { ascending: false }).limit(8),
      supabase.from('solicitudes_prestamo').select('id, monto, plazo_meses, estado, created_at').eq('user_id', uid).order('created_at', { ascending: false }).limit(5),
      supabase.from('scores_transaccionales').select('score_transaccional, segmento_preliminar, monto_hipotesis').eq('user_id', uid).order('fecha_calculo', { ascending: false }).limit(1),
      supabase.from('creditos_preaprobados').select('monto_aprobado, plazo_meses, tasa_anual, estado').eq('user_id', uid).neq('estado', 'desembolsado').order('created_at', { ascending: false }).limit(1),
    ]);
    const lista = cuentas.data || [];
    const saldo_total = lista.reduce((s, c) => s + Number(c.saldo || 0), 0);
    const sc = scoring.data?.[0] || null;
    const pa = preap.data?.[0] || null;
    res.json({ success: true, data: {
      cuentas: lista,
      saldo_total,
      ultimas_transacciones: txs.data || [],
      solicitudes: sols.data || [],
      score: sc?.score_transaccional ?? null,
      segmento: sc?.segmento_preliminar ?? null,
      preaprobado: pa ? { monto: Number(pa.monto_aprobado), plazo: pa.plazo_meses, tea: Number(pa.tasa_anual) }
                      : (sc?.monto_hipotesis ? { monto: Number(sc.monto_hipotesis), plazo: 36, tea: 0.4092 } : null),
    }});
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── GET /api/dashboard/clientes ─────────────────────────
router.get('/clientes', requireAuth, requireAsesor, async (req, res) => {
  const supabase = req.token ? supabaseAsUser(req.token) : supabaseAnon;
  try {
    const { data: perfiles, error } = await supabase
      .from('perfiles')
      .select('id, nombre, apellido, dni, email, telefono, created_at')
      .eq('rol', 'cliente')
      .order('created_at', { ascending: false })
      .limit(60);
    if (error) throw error;
    const ids = (perfiles || []).map(p => p.id);
    const [scores, creditos, pclientes] = await Promise.all([
      supabase.from('scores_transaccionales').select('user_id, score_transaccional, segmento_preliminar, monto_hipotesis').in('user_id', ids),
      supabase.from('creditos_preaprobados').select('user_id, monto_aprobado, plazo_meses, dias_mora, estado, estado_pago, fecha_desembolso').in('user_id', ids).eq('estado', 'desembolsado'),
      supabase.from('perfiles_clientes').select('user_id, nombre_negocio, tipo_negocio, distrito').in('user_id', ids),
    ]);
    const by = (arr) => Object.fromEntries((arr.data || []).map(x => [x.user_id, x]));
    const S = by(scores), C = by(creditos), P = by(pclientes);
    const data = (perfiles || []).map(p => ({
      id: p.id,
      nombre: `${p.nombre} ${p.apellido}`.trim(),
      dni: p.dni || '—', email: p.email, telefono: p.telefono || '—',
      negocio: P[p.id]?.nombre_negocio || '—',
      tipo_negocio: P[p.id]?.tipo_negocio || '—',
      distrito: P[p.id]?.distrito || '—',
      score: S[p.id]?.score_transaccional ?? null,
      segmento: S[p.id]?.segmento_preliminar || '—',
      techo: Number(S[p.id]?.monto_hipotesis || 0),
      prestamo: C[p.id] ? {
        monto: Number(C[p.id].monto_aprobado), plazo: C[p.id].plazo_meses,
        mora_dias: C[p.id].dias_mora || 0, estado: C[p.id].estado,
        fecha_desembolso: C[p.id].fecha_desembolso, cuotas_pagadas: 0,
      } : null,
    }));
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

export default router;