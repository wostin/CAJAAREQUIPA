// src/routes/cuentas.js
// M2: Módulo de Cuentas
// GET  /api/cuentas              → Cuentas del usuario autenticado
// POST /api/cuentas              → Abrir nueva cuenta
// GET  /api/cuentas/:id          → Detalle de cuenta
// GET  /api/cuentas/:id/resumen  → Resumen financiero de la cuenta
// POST /api/cuentas/plazo-fijo   → Abrir depósito a plazo fijo (NUEVO)
// GET  /api/cuentas/plazo-fijo   → Listar depósitos a plazo fijo del cliente (NUEVO)

import { Router } from 'express';
import { supabaseAsUser } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// GET /api/cuentas
router.get('/', async (req, res) => {
  const sb = supabaseAsUser(req.token);
  const { data, error } = await sb
    .from('cuentas')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ success: false, message: error.message });
  return res.json({ success: true, data });
});

// POST /api/cuentas
router.post('/', async (req, res) => {
  const { tipo, moneda = 'PEN' } = req.body;
  if (!tipo || !['corriente', 'ahorro'].includes(tipo)) {
    return res.status(400).json({ success: false, message: 'Tipo de cuenta inválido' });
  }

  const numero_cuenta = 'CMAC' + Date.now().toString().slice(-10);

  const sb = supabaseAsUser(req.token);
  const { data, error } = await sb
    .from('cuentas')
    .insert({ user_id: req.user.id, tipo, numero_cuenta, saldo: 0, moneda })
    .select()
    .single();

  if (error) return res.status(400).json({ success: false, message: error.message });
  return res.status(201).json({ success: true, data });
});

// ── PLAZO FIJO ──────────────────────────────────────────────
// GET /api/cuentas/plazo-fijo — listar depósitos a plazo fijo del cliente
// (va ANTES de /:id para que no lo capture la ruta con parámetro)
router.get('/plazo-fijo', async (req, res) => {
  const sb = supabaseAsUser(req.token);
  const { data, error } = await sb
    .from('depositos_plazo_fijo')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ success: false, message: error.message });
  return res.json({ success: true, data });
});

// POST /api/cuentas/plazo-fijo — abrir depósito a plazo fijo
// Body: { cuenta_id, monto, tea, plazo_dias, producto }
router.post('/plazo-fijo', async (req, res) => {
  const { cuenta_id, monto, tea, plazo_dias, producto } = req.body;
  const sb = supabaseAsUser(req.token);

  // Validaciones
  if (!cuenta_id || !monto || !tea || !plazo_dias || !producto) {
    return res.status(400).json({ success: false, message: 'Faltan datos del depósito' });
  }
  if (Number(monto) <= 0) {
    return res.status(400).json({ success: false, message: 'El monto debe ser mayor a 0' });
  }

  // Verificar cuenta y saldo suficiente
  const { data: cuenta, error: cErr } = await sb
    .from('cuentas')
    .select('id, saldo, estado, moneda')
    .eq('id', cuenta_id)
    .eq('user_id', req.user.id)
    .single();

  if (cErr || !cuenta) return res.status(404).json({ success: false, message: 'Cuenta no encontrada' });
  if (cuenta.estado !== 'activa') return res.status(400).json({ success: false, message: 'Cuenta no activa' });
  if (Number(cuenta.saldo) < Number(monto)) {
    return res.status(400).json({ success: false, message: 'Saldo insuficiente para el depósito' });
  }

  // Cálculos del depósito
  const teaDecimal = Number(tea) > 1 ? Number(tea) / 100 : Number(tea); // acepta 6.5 o 0.065
  const fechaApertura = new Date();
  const fechaVenc = new Date(fechaApertura.getTime() + Number(plazo_dias) * 86400000);
  // Interés simple proporcional al plazo: monto * tea * (dias/360)
  const interes = Number(monto) * teaDecimal * (Number(plazo_dias) / 360);
  const montoFinal = Number(monto) + interes;
  const nuevoSaldo = Number(cuenta.saldo) - Number(monto);

  // 1) Descontar del saldo de la cuenta
  const { error: updErr } = await sb
    .from('cuentas')
    .update({ saldo: nuevoSaldo })
    .eq('id', cuenta_id);
  if (updErr) return res.status(500).json({ success: false, message: updErr.message });

  // 2) Registrar la transacción del depósito (débito)
  const { error: txErr } = await sb
    .from('transacciones')
    .insert({
      user_id: req.user.id,
      cuenta_id,
      tipo: 'debito',
      descripcion: `Apertura de depósito a plazo fijo (${producto})`,
      monto: Number(monto),
      saldo_post: nuevoSaldo,
      canal: 'homebanking',
      estado: 'completada',
      referencia: 'PF-' + Date.now() + '-' + Math.floor(Math.random() * 100000),
    });
  if (txErr) {
    // Revertir el saldo si la transacción falla
    await sb.from('cuentas').update({ saldo: cuenta.saldo }).eq('id', cuenta_id);
    return res.status(500).json({ success: false, message: txErr.message });
  }

  // 3) Crear el depósito a plazo fijo
  const { data: deposito, error: pfErr } = await sb
    .from('depositos_plazo_fijo')
    .insert({
      user_id: req.user.id,
      cuenta_id,
      monto: Number(monto),
      moneda: cuenta.moneda || 'PEN',
      tea: teaDecimal * 100,                          // se guarda en formato 6.50
      plazo_dias: Number(plazo_dias),
      producto,
      fecha_apertura: fechaApertura.toISOString().slice(0, 10),
      fecha_vencimiento: fechaVenc.toISOString().slice(0, 10),
      interes_estimado: Number(interes.toFixed(2)),
      monto_final: Number(montoFinal.toFixed(2)),
      estado: 'activo',
    })
    .select()
    .single();

  if (pfErr) {
    // Revertir saldo si el depósito no se pudo crear
    await sb.from('cuentas').update({ saldo: cuenta.saldo }).eq('id', cuenta_id);
    return res.status(500).json({ success: false, message: pfErr.message });
  }

  return res.status(201).json({
    success: true,
    data: { deposito, nuevo_saldo: nuevoSaldo, interes_estimado: Number(interes.toFixed(2)), monto_final: Number(montoFinal.toFixed(2)) },
  });
});

// POST /api/cuentas/plazo-fijo/procesar-vencimientos
// Revisa los depósitos del cliente que ya vencieron (fecha_vencimiento <= hoy)
// y devuelve capital + interés a la cuenta, marcándolos como 'vencido'.
router.post('/plazo-fijo/procesar-vencimientos', async (req, res) => {
  const sb = supabaseAsUser(req.token);
  const hoy = new Date().toISOString().slice(0, 10);

  // Buscar depósitos activos ya vencidos
  const { data: vencidos, error } = await sb
    .from('depositos_plazo_fijo')
    .select('*')
    .eq('user_id', req.user.id)
    .eq('estado', 'activo')
    .lte('fecha_vencimiento', hoy);

  if (error) return res.status(500).json({ success: false, message: error.message });
  if (!vencidos || !vencidos.length) {
    return res.json({ success: true, procesados: 0, mensaje: 'No hay depósitos vencidos' });
  }

  let procesados = 0;
  let totalDevuelto = 0;

  for (const dep of vencidos) {
    if (!dep.cuenta_id) continue;
    // Leer saldo actual de la cuenta destino
    const { data: cuenta } = await sb
      .from('cuentas').select('saldo').eq('id', dep.cuenta_id).single();
    if (!cuenta) continue;

    const nuevoSaldo = Number(cuenta.saldo) + Number(dep.monto_final);

    // Devolver capital + interés a la cuenta
    await sb.from('cuentas').update({ saldo: nuevoSaldo }).eq('id', dep.cuenta_id);

    // Registrar transacción del abono por vencimiento
    await sb.from('transacciones').insert({
      user_id: req.user.id,
      cuenta_id: dep.cuenta_id,
      tipo: 'credito',
      descripcion: `Vencimiento de plazo fijo (${dep.producto}) — capital + interés`,
      monto: Number(dep.monto_final),
      saldo_post: nuevoSaldo,
      canal: 'homebanking',
      estado: 'completada',
      referencia: 'PFV-' + Date.now() + '-' + Math.floor(Math.random() * 100000),
    });

    // Marcar el depósito como vencido
    await sb.from('depositos_plazo_fijo').update({ estado: 'vencido' }).eq('id', dep.id);

    procesados++;
    totalDevuelto += Number(dep.monto_final);
  }

  return res.json({ success: true, procesados, total_devuelto: totalDevuelto });
});

// POST /api/cuentas/plazo-fijo/:id/simular-vencimiento
// Fuerza el vencimiento de UN depósito (para demostración).
router.post('/plazo-fijo/:id/simular-vencimiento', async (req, res) => {
  const sb = supabaseAsUser(req.token);

  // Buscar el depósito del cliente
  const { data: dep, error } = await sb
    .from('depositos_plazo_fijo')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();

  if (error || !dep) return res.status(404).json({ success: false, message: 'Depósito no encontrado' });
  if (dep.estado !== 'activo') return res.status(400).json({ success: false, message: 'El depósito ya no está activo' });
  if (!dep.cuenta_id) return res.status(400).json({ success: false, message: 'El depósito no tiene cuenta asociada' });

  // Leer saldo de la cuenta
  const { data: cuenta } = await sb
    .from('cuentas').select('saldo').eq('id', dep.cuenta_id).single();
  if (!cuenta) return res.status(404).json({ success: false, message: 'Cuenta no encontrada' });

  const nuevoSaldo = Number(cuenta.saldo) + Number(dep.monto_final);

  // Devolver capital + interés
  await sb.from('cuentas').update({ saldo: nuevoSaldo }).eq('id', dep.cuenta_id);

  // Registrar la transacción del vencimiento
  await sb.from('transacciones').insert({
    user_id: req.user.id,
    cuenta_id: dep.cuenta_id,
    tipo: 'credito',
    descripcion: `Vencimiento de plazo fijo (${dep.producto}) — capital + interés`,
    monto: Number(dep.monto_final),
    saldo_post: nuevoSaldo,
    canal: 'homebanking',
    estado: 'completada',
    referencia: 'PFV-' + Date.now() + '-' + Math.floor(Math.random() * 100000),
  });

  // Marcar como vencido
  await sb.from('depositos_plazo_fijo').update({ estado: 'vencido' }).eq('id', dep.id);

  return res.json({ success: true, nuevo_saldo: nuevoSaldo, devuelto: Number(dep.monto_final) });
});

// GET /api/cuentas/:id
router.get('/:id', async (req, res) => {
  const sb = supabaseAsUser(req.token);
  const { data, error } = await sb
    .from('cuentas')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error) return res.status(404).json({ success: false, message: 'Cuenta no encontrada' });
  return res.json({ success: true, data });
});

// GET /api/cuentas/:id/resumen — últimas transacciones + estadísticas
router.get('/:id/resumen', async (req, res) => {
  const sb = supabaseAsUser(req.token);

  const [{ data: cuenta }, { data: transacciones }] = await Promise.all([
    sb.from('cuentas').select('*').eq('id', req.params.id).single(),
    sb.from('transacciones')
      .select('tipo, monto, descripcion, canal, fecha')
      .eq('cuenta_id', req.params.id)
      .order('fecha', { ascending: false })
      .limit(10)
  ]);

  if (!cuenta) return res.status(404).json({ success: false, message: 'Cuenta no encontrada' });

  const txs = transacciones || [];
  const total_abonos = txs.filter(t => t.tipo === 'credito').reduce((a, t) => a + Number(t.monto), 0);
  const total_cargos = txs.filter(t => t.tipo === 'debito').reduce((a, t) => a + Number(t.monto), 0);

  return res.json({
    success: true,
    data: {
      cuenta,
      ultimas_transacciones: txs,
      resumen: { total_abonos, total_cargos, num_movimientos: txs.length }
    }
  });
});

export default router;