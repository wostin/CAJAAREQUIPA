// src/routes/scoring.js
// Core Financiero — Scoring Transaccional y Fichas de Campo
// Solo accesible por asesores, admins y gerentes

import { Router } from 'express';
import { supabaseAdmin, supabaseAsUser } from '../supabase.js';
import { requireAuth, requireAsesor } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireAsesor);

// POST /api/scoring/evaluar
// Ejecuta el pipeline completo: features → score → resultado
// Body: { user_id, monto_pedido, plazo_meses }
router.post('/evaluar', async (req, res) => {
  const { user_id, monto_pedido, plazo_meses } = req.body;

  if (!user_id || !monto_pedido || !plazo_meses) {
    return res.status(400).json({ success: false, message: 'user_id, monto_pedido y plazo_meses requeridos' });
  }

  // Llamar a la stored function via Supabase RPC
  const { data, error } = await supabaseAdmin.rpc('evaluar_credito_campo', {
    p_user_id:      user_id,
    p_monto_pedido: Number(monto_pedido),
    p_plazo_meses:  Number(plazo_meses)
  });

  if (error) return res.status(500).json({ success: false, message: error.message });
  return res.json({ success: true, data: data[0] });
});

// GET /api/scoring/universo — lista de clientes elegibles con score
router.get('/universo', async (req, res) => {
  const { segmento, agencia, limit = 50, offset = 0 } = req.query;

  let query = supabaseAdmin
    .from('vw_pbi_universo_scoring')
    .select('*')
    .range(Number(offset), Number(offset) + Number(limit) - 1)
    .order('score_transaccional', { ascending: false });

  if (segmento) query = query.eq('segmento_preliminar', segmento);

  const { data, error } = await query;
  if (error) return res.status(500).json({ success: false, message: error.message });
  return res.json({ success: true, data, count: data?.length });
});

// GET /api/scoring/cliente/:user_id — score de un cliente específico
router.get('/cliente/:user_id', async (req, res) => {
  const { data: score, error: e1 } = await supabaseAdmin
    .from('scores_transaccionales')
    .select('*')
    .eq('user_id', req.params.user_id)
    .single();

  const { data: features } = await supabaseAdmin
    .from('features_scoring')
    .select('*')
    .eq('user_id', req.params.user_id)
    .single();

  const { data: perfil } = await supabaseAdmin
    .from('perfiles_clientes')
    .select('*')
    .eq('user_id', req.params.user_id)
    .single();

  if (e1) return res.status(404).json({ success: false, message: 'Score no encontrado. Calcular primero.' });

  return res.json({ success: true, data: { score, features, perfil } });
});

// POST /api/scoring/fichas — crear ficha de visita de campo
router.post('/fichas', async (req, res) => {
  const sb = supabaseAsUser(req.token);
  const ficha = {
    ...req.body,
    // Si el asesor tiene id_asesor, vincularlo
    asesor_nombre: req.body.asesor_nombre || `${req.perfil?.nombre} ${req.perfil?.apellido}`.trim()
  };

  const { data, error } = await sb
    .from('fichas_campo')
    .insert(ficha)
    .select()
    .single();

  if (error) return res.status(400).json({ success: false, message: error.message });
  return res.status(201).json({ success: true, data });
});

// GET /api/scoring/fichas — listado de fichas (filtrable)
router.get('/fichas', async (req, res) => {
  const { agencia, estado, segmento, limit = 50, offset = 0 } = req.query;

  let query = supabaseAdmin
    .from('vw_pbi_fichas_campo')
    .select('*')
    .range(Number(offset), Number(offset) + Number(limit) - 1)
    .order('fecha_visita', { ascending: false });

  if (agencia)  query = query.eq('agencia', agencia);
  if (estado)   query = query.eq('estado_ficha', estado);
  if (segmento) query = query.eq('segmento_resultante', segmento);

  const { data, error } = await query;
  if (error) return res.status(500).json({ success: false, message: error.message });
  return res.json({ success: true, data });
});

// PUT /api/scoring/fichas/:id — actualizar ficha (comité de agencia)
router.put('/fichas/:id', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('fichas_campo')
    .update({ ...req.body, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ success: false, message: error.message });
  return res.json({ success: true, data });
});

// GET /api/scoring/kpis — KPIs gerenciales para dashboard
router.get('/kpis', async (req, res) => {
  const [
    { data: kpis },
    { data: embudo },
    { data: universo }
  ] = await Promise.all([
    supabaseAdmin.from('vw_pbi_kpis_piloto').select('*').order('mes', { ascending: false }).limit(6),
    supabaseAdmin.from('vw_pbi_embudo_campania').select('*').order('mes', { ascending: false }).limit(12),
    supabaseAdmin.from('scores_transaccionales').select('segmento_preliminar').eq('es_valido', true)
  ]);

  // Resumen de distribución por segmento
  const distribucion = (universo || []).reduce((acc, s) => {
    acc[s.segmento_preliminar] = (acc[s.segmento_preliminar] || 0) + 1;
    return acc;
  }, {});

  return res.json({
    success: true,
    data: {
      kpis: kpis || [],
      embudo: embudo || [],
      distribucion_segmentos: distribucion
    }
  });
});

export default router;
