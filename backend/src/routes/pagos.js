// src/routes/pagos.js
// M4: Módulo de Pagos de Servicios
// POST /api/pagos         → Pagar servicio (agua, luz, cable, etc.)
// GET  /api/pagos         → Historial de pagos
// GET  /api/pagos/servicios → Catálogo de servicios disponibles

import { Router } from 'express';
import { supabaseAsUser } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// Catálogo de empresas por servicio (datos reales del sur del Perú)
const EMPRESAS = {
  agua:      ['SEDAPAR Arequipa', 'SEDA Huánuco', 'SEDAM Huancayo', 'EMAPICA Ica'],
  luz:       ['Seal Arequipa', 'Electro Sur Este', 'Electro Centro', 'Hidrandina'],
  cable:     ['DirecTV', 'Claro TV', 'Movistar TV', 'Win Sports'],
  telefono:  ['Movistar', 'Claro', 'Entel', 'Bitel'],
  gas:       ['Cálidda', 'Quavii', 'GNL Contugas'],
  internet:  ['Movistar Fibra', 'Claro Internet', 'Bitel Fibra', 'Entel Fibra'],
  municipio: ['Municipalidad de Arequipa', 'SAT Arequipa', 'SAT Cusco', 'SAT Lima']
};

// GET /api/pagos/servicios
router.get('/servicios', (req, res) => {
  const servicios = Object.keys(EMPRESAS).map(s => ({
    id: s,
    nombre: s.charAt(0).toUpperCase() + s.slice(1),
    empresas: EMPRESAS[s]
  }));
  return res.json({ success: true, data: servicios });
});

// GET /api/pagos
router.get('/', async (req, res) => {
  const { servicio, limit = 20, offset = 0 } = req.query;
  const sb = supabaseAsUser(req.token);

  let query = sb
    .from('pagos')
    .select('*')
    .eq('user_id', req.user.id)
    .order('fecha', { ascending: false })
    .range(Number(offset), Number(offset) + Number(limit) - 1);

  if (servicio) query = query.eq('servicio', servicio);

  const { data, error } = await query;
  if (error) return res.status(500).json({ success: false, message: error.message });
  return res.json({ success: true, data });
});

// POST /api/pagos
router.post('/', async (req, res) => {
  const { servicio, numero_contrato, empresa, monto, cuenta_id } = req.body;

  // Validaciones de negocio
  if (!servicio || !numero_contrato || !empresa || !monto || !cuenta_id) {
    return res.status(400).json({ success: false, message: 'Todos los campos son requeridos' });
  }
  const serviciosValidos = ['agua','luz','cable','telefono','gas','internet','municipio'];
  if (!serviciosValidos.includes(servicio)) {
    return res.status(400).json({ success: false, message: 'Servicio no válido' });
  }
  if (Number(monto) <= 0 || Number(monto) > 5000) {
    return res.status(400).json({ success: false, message: 'Monto inválido (máx S/ 5,000 por pago)' });
  }

  const sb = supabaseAsUser(req.token);

  // Verificar saldo de cuenta origen
  const { data: cuenta } = await sb
    .from('cuentas')
    .select('saldo, estado')
    .eq('id', cuenta_id)
    .eq('user_id', req.user.id)
    .single();

  if (!cuenta) return res.status(404).json({ success: false, message: 'Cuenta no encontrada' });
  if (cuenta.estado !== 'activa') return res.status(400).json({ success: false, message: 'Cuenta bloqueada' });
  if (Number(cuenta.saldo) < Number(monto)) {
    return res.status(400).json({ success: false, message: 'Saldo insuficiente para realizar el pago' });
  }

  // Registrar pago
  const { data: pago, error } = await sb
    .from('pagos')
    .insert({ user_id: req.user.id, cuenta_id, servicio, numero_contrato, empresa, monto: Number(monto) })
    .select()
    .single();

  if (error) return res.status(500).json({ success: false, message: error.message });

  // Débitar de cuenta + registrar transacción
  await sb.from('cuentas').update({ saldo: Number(cuenta.saldo) - Number(monto) }).eq('id', cuenta_id);
  await sb.from('transacciones').insert({
    user_id: req.user.id,
    cuenta_id,
    tipo: 'debito',
    categoria: 'pago_servicio',
    descripcion: `Pago de ${servicio} - ${empresa} (${numero_contrato})`,
    monto: Number(monto),
    saldo_post: Number(cuenta.saldo) - Number(monto),
    canal: 'homebanking'
  });

  return res.status(201).json({
    success: true,
    message: `Pago de ${servicio.toUpperCase()} realizado exitosamente`,
    data: pago
  });
});

export default router;
