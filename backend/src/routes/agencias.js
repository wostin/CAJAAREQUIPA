// src/routes/agencias.js
import { Router } from 'express';
import { supabaseAdmin as supabaseAdminBase, supabaseAsUser } from '../supabase.js';
import { requireAuth, requireAsesor } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireAsesor);

router.get('/', async (req, res) => {
  const supabaseAdmin = req.token ? supabaseAsUser(req.token) : supabaseAdminBase; // token del usuario, RLS
  const { region } = req.query;
  let query = supabaseAdmin.from('agencias').select('*').order('codigo');
  if (region) query = query.eq('region', region);
  const { data, error } = await query;
  if (error) return res.status(500).json({ success: false, message: error.message });
  return res.json({ success: true, data });
});

router.get('/:id/asesores', async (req, res) => {
  const supabaseAdmin = req.token ? supabaseAsUser(req.token) : supabaseAdminBase; // token del usuario, RLS
  const { data, error } = await supabaseAdmin
    .from('asesores_negocio')
    .select('*')
    .eq('id_agencia', req.params.id)
    .eq('activo', true)
    .order('nivel');
  if (error) return res.status(500).json({ success: false, message: error.message });
  return res.json({ success: true, data });
});

router.get('/vista/resumen', async (req, res) => {
  const supabaseAdmin = req.token ? supabaseAsUser(req.token) : supabaseAdminBase; // token del usuario, RLS
  const { data, error } = await supabaseAdmin.from('vw_pbi_agencias').select('*');
  if (error) return res.status(500).json({ success: false, message: error.message });
  return res.json({ success: true, data });
});

export default router;
