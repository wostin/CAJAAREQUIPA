// src/routes/transacciones.js
// M3: Módulo de Transacciones (v2: + fecha y estado)
import { Router } from 'express';
import { supabaseAsUser } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// Estados permitidos por el CHECK de la tabla transacciones
const ESTADOS_VALIDOS = ['completada', 'reversada', 'sospechosa'];

// GET /api/transacciones?cuenta_id=&limit=&offset=
router.get('/', async (req, res) => {
  const { cuenta_id, limit = 20, offset = 0, tipo } = req.query;
  const sb = supabaseAsUser(req.token);

  let query = sb
    .from('transacciones')
    .select('*, cuentas(numero_cuenta, tipo, moneda)')
    .eq('user_id', req.user.id)
    .order('fecha', { ascending: false })
    .range(Number(offset), Number(offset) + Number(limit) - 1);

  if (cuenta_id) query = query.eq('cuenta_id', cuenta_id);
  if (tipo)      query = query.eq('tipo', tipo);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ success: false, message: error.message });
  return res.json({ success: true, data, count });
});

// POST /api/transacciones — registrar débito o crédito
router.post('/', async (req, res) => {
  const {
    cuenta_id, tipo, descripcion, monto,
    canal = 'homebanking', referencia,
    fecha,                       // ← NUEVO: fecha/hora elegida (ISO). Si no viene, usa now()
    estado = 'completada',       // ← NUEVO: completada | reversada | sospechosa
  } = req.body;

  if (!cuenta_id || !tipo || !descripcion || !monto) {
    return res.status(400).json({ success: false, message: 'Campos requeridos faltantes' });
  }
  if (!['debito', 'credito'].includes(tipo)) {
    return res.status(400).json({ success: false, message: 'Tipo inválido' });
  }
  if (Number(monto) <= 0) {
    return res.status(400).json({ success: false, message: 'El monto debe ser mayor a 0' });
  }
  if (!ESTADOS_VALIDOS.includes(estado)) {
    return res.status(400).json({ success: false, message: 'Estado inválido' });
  }

  const sb = supabaseAsUser(req.token);

  // Obtener cuenta y validar saldo suficiente para débitos
  const { data: cuenta, error: cErr } = await sb
    .from('cuentas')
    .select('saldo, estado')
    .eq('id', cuenta_id)
    .eq('user_id', req.user.id)
    .single();

  if (cErr || !cuenta) return res.status(404).json({ success: false, message: 'Cuenta no encontrada' });
  if (cuenta.estado !== 'activa') return res.status(400).json({ success: false, message: 'Cuenta no activa' });
  if (tipo === 'debito' && Number(cuenta.saldo) < Number(monto)) {
    return res.status(400).json({ success: false, message: 'Saldo insuficiente' });
  }

  const nuevo_saldo = tipo === 'credito'
    ? Number(cuenta.saldo) + Number(monto)
    : Number(cuenta.saldo) - Number(monto);

  // Armar el registro. Solo incluimos fecha si vino una válida.
  const registro = {
    user_id: req.user.id,
    cuenta_id,
    tipo,
    descripcion,
    monto: Number(monto),
    saldo_post: nuevo_saldo,
    canal,
    estado,
    referencia,
  };
  if (fecha) {
    const d = new Date(fecha);
    if (!isNaN(d.getTime())) registro.fecha = d.toISOString();
  }

  // Registrar transacción
  const { data: tx, error: txErr } = await sb
    .from('transacciones')
    .insert(registro)
    .select()
    .single();

  if (txErr) return res.status(500).json({ success: false, message: txErr.message });

  // Solo movemos el saldo de la cuenta si la transacción quedó completada
  if (estado === 'completada') {
    await sb.from('cuentas').update({ saldo: nuevo_saldo }).eq('id', cuenta_id);
  }

  return res.status(201).json({ success: true, data: { ...tx, saldo_post: nuevo_saldo } });
});

export default router;