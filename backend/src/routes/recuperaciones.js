// src/routes/recuperaciones.js
// Módulo de Recuperaciones / Mora (rúbrica Crit.4 — R1·R2·R3)
// Capa RUTAS: solo HTTP + RBAC. La lógica vive en el servicio.
//
//   R1  GET  /api/recuperaciones/bandas      → KPIs por banda
//       GET  /api/recuperaciones/cartera      → listado de cartera morosa
//   R2  GET  /api/recuperaciones/:id/gestiones  → historial
//       POST /api/recuperaciones/:id/gestiones  → registrar gestión
//   R3  POST /api/recuperaciones/:id/judicial    → derivar judicial (≥121d)  [riesgos/gerente]
//       POST /api/recuperaciones/:id/castigo      → castigar (>180d)          [riesgos/gerente]
import { Router } from 'express';
import { requireAuth, requireAsesor, requireRiesgos } from '../middleware/auth.js';
import * as svc from '../services/recuperaciones.service.js';

const router = Router();
router.use(requireAuth);

const gestorDe = (req) => ({
  id: req.user.id,
  email: req.user.email,
  nombre: [req.user.nombre, req.user.apellido].filter(Boolean).join(' ').trim(),
});

// ── R1: consulta de cartera por bandas + KPIs ─────────────
router.get('/bandas', requireAsesor, async (_req, res) => {
  try { res.json({ success: true, data: await svc.resumenCartera() }); }
  catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/cartera', requireAsesor, async (req, res) => {
  try {
    const { banda, limit, offset } = req.query;
    res.json({ success: true, data: await svc.listarCartera({ banda, limit, offset }) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── R2: gestiones de cobranza ─────────────────────────────
router.get('/:id/gestiones', requireAsesor, async (req, res) => {
  try { res.json({ success: true, data: await svc.historialGestiones(req.params.id) }); }
  catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/:id/gestiones', requireAsesor, async (req, res) => {
  try {
    const data = await svc.registrarGestion({ credito_id: req.params.id, gestor: gestorDe(req), body: req.body });
    res.status(201).json({ success: true, data });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

// ── R3: transiciones (acciones críticas → solo riesgos/gerente) ──
router.post('/:id/judicial', requireRiesgos, async (req, res) => {
  try {
    const data = await svc.transicion({ credito_id: req.params.id, accion: 'judicial', gestor: gestorDe(req) });
    res.json({ success: true, data });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

router.post('/:id/castigo', requireRiesgos, async (req, res) => {
  try {
    const data = await svc.transicion({ credito_id: req.params.id, accion: 'castigo', gestor: gestorDe(req) });
    res.json({ success: true, data });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

export default router;
