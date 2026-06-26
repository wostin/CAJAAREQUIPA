// src/routes/prestamos.js
// M5: Módulo de Préstamos
// Incluye cálculo real de cuota con TEA → TEM (fórmula francesa)
// GET  /api/prestamos           → Mis solicitudes
// POST /api/prestamos           → Solicitar préstamo
// POST /api/prestamos/simular   → Simular cuota sin guardar
// GET  /api/prestamos/:id       → Detalle de solicitud
// PUT  /api/prestamos/:id/estado → Cambiar estado (solo asesor/admin)

import { Router } from 'express';
import { supabaseAsUser, supabaseAdmin } from '../supabase.js';
import { requireAuth, requireAsesor, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// Tarifario Crédito Empresarial Micro Micro (casos del profesor):
//   Tarifario oficial Caja Arequipa (Capital de Trabajo, Moneda Nacional)
// ── TASAS REALES Caja Arequipa — Crédito Capital de Trabajo (MN) ──
// Tarifario oficial vigente 14-01-2025: TEA Mínima 10.85% · TEA Máxima 66.27%
// (https://www.cajaarequipa.pe/tasas-de-interes/ · Tarifario Capital de Trabajo)
// La tasa se fija según perfil de riesgo. Usamos una TEA representativa
// dentro del rango oficial; con seguro de desgravamen es ligeramente menor.
// TEA exactas del Crédito Empresarial Micro Micro (PDF 30 casos del profesor),
// dentro del rango oficial Caja Arequipa (Capital de Trabajo 10.85%–66.27%):
const TEA_CON_SEGURO = 0.4092;   // 40.92% con seguro de desgravamen
const TEA_SIN_SEGURO = 0.4392;   // 43.92% sin seguro de desgravamen
const TEA_MIN = 0.1085;          // referencia: mínima del tarifario oficial
const TEA_MAX = 0.6627;          // referencia: máxima del tarifario oficial
const TEA_REFERENCIAL = TEA_SIN_SEGURO;

// ── Ruta de aprobación por montos (rúbrica Crit.2) ────────
// Devuelve el rol mínimo que puede aprobar un monto dado.
function rutaAprobacion(monto) {
  const m = Number(monto);
  if (m <= 5000)  return { aprobador: 'asesor',  nivel: 'Asesor de negocio' };
  if (m <= 20000) return { aprobador: 'admin',   nivel: 'Jefe Regional / Administrador' };
  if (m <= 50000) return { aprobador: 'riesgos', nivel: 'Unidad de Riesgos' };
  return            { aprobador: 'comite',  nivel: 'Comité de créditos' };
}
const JERARQUIA = { asesor: 1, administrador: 2, jefe_regional: 2, admin: 2, analista: 3, riesgos: 3, comite: 4, gerente: 5 };
function puedeAprobar(rolActor, montoAprobado) {
  const req = rutaAprobacion(montoAprobado).aprobador;
  return (JERARQUIA[rolActor] || 0) >= (JERARQUIA[req] || 99);
}

/**
 * Calcula cuota mensual con sistema francés (cuotas iguales)
 * TEA → TEM = (1 + TEA)^(1/12) - 1
 * Cuota = Monto × TEM / [1 - (1 + TEM)^(-n)]
 */
function calcularCuota(monto, plazo_meses, tasa_anual = TEA_REFERENCIAL) {
  const tem = Math.pow(1 + tasa_anual, 1 / 12) - 1;
  const cuota = monto * tem / (1 - Math.pow(1 + tem, -plazo_meses));
  return Math.round(cuota * 100) / 100;
}

/**
 * Genera tabla de amortización completa (capital + interés + saldo)
 * Útil para mostrar al cliente en el HomeBanking
 */
function tablaAmortizacion(monto, plazo_meses, tasa_anual = TEA_REFERENCIAL) {
  const tem = Math.pow(1 + tasa_anual, 1 / 12) - 1;
  const cuota = calcularCuota(monto, plazo_meses, tasa_anual);
  const tabla = [];
  let saldo = monto;

  for (let i = 1; i <= plazo_meses; i++) {
    const interes = Math.round(saldo * tem * 100) / 100;
    const capital = Math.round((cuota - interes) * 100) / 100;
    saldo = Math.round((saldo - capital) * 100) / 100;
    tabla.push({
      cuota_num: i,
      cuota_total: cuota,
      interes,
      capital,
      saldo_capital: Math.max(0, saldo)
    });
  }
  return tabla;
}

// POST /api/prestamos/simular — no requiere autenticación de cuenta
router.post('/simular', async (req, res) => {
  const { monto, plazo_meses, tasa_anual = TEA_REFERENCIAL } = req.body;

  if (!monto || !plazo_meses) {
    return res.status(400).json({ success: false, message: 'monto y plazo_meses requeridos' });
  }
  if (Number(monto) < 500 || Number(monto) > 100000) {
    return res.status(400).json({ success: false, message: 'Monto entre S/ 500 y S/ 100,000' });
  }
  if (Number(plazo_meses) < 3 || Number(plazo_meses) > 84) {
    return res.status(400).json({ success: false, message: 'Plazo entre 3 y 84 meses' });
  }

  const cuota = calcularCuota(Number(monto), Number(plazo_meses), Number(tasa_anual));
  const total_pagar  = Math.round(cuota * plazo_meses * 100) / 100;
  const total_interes = Math.round((total_pagar - monto) * 100) / 100;
  const tabla = tablaAmortizacion(Number(monto), Number(plazo_meses), Number(tasa_anual));

  return res.json({
    success: true,
    simulacion: {
      monto: Number(monto),
      plazo_meses: Number(plazo_meses),
      tasa_anual: Number(tasa_anual),
      tem: Math.pow(1 + Number(tasa_anual), 1/12) - 1,
      cuota_mensual: cuota,
      total_a_pagar: total_pagar,
      total_interes,
      tabla_amortizacion: tabla
    }
  });
});

// POST /api/prestamos/evaluar-rds — RDS con semáforo (Crit.2)
// Body: { monto, plazo_meses, ingreso_neto, tasa_anual? }
router.post('/evaluar-rds', requireAsesor, async (req, res) => {
  const { monto, plazo_meses, ingreso_neto, tasa_anual = TEA_REFERENCIAL,
          tipo_credito = 'ME', gastos_familiares = 0, cuotas_sf = 0,
          deuda_externa = 0, n_entidades = null, es_recurrente = false } = req.body;
  if (!monto || !plazo_meses || ingreso_neto == null) {
    return res.status(400).json({ success: false, message: 'monto, plazo_meses e ingreso_neto requeridos' });
  }
  const { data, error } = await (req.token ? supabaseAsUser(req.token) : supabaseAdmin).rpc('fn_evaluar_rds', {
    p_monto: Number(monto),
    p_plazo_meses: Number(plazo_meses),
    p_tasa_anual: Number(tasa_anual),
    p_ingreso_neto: Number(ingreso_neto),
    p_tipo_credito: tipo_credito,
    p_gastos_familiares: Number(gastos_familiares),
    p_cuotas_sf: Number(cuotas_sf),
    p_deuda_externa: Number(deuda_externa),
    p_n_entidades: n_entidades == null ? null : Number(n_entidades),
    p_es_recurrente: Boolean(es_recurrente),
  });
  if (error) return res.status(500).json({ success: false, message: error.message });
  // La RPC del reglamento devuelve un JSONB (objeto), no un array
  const rds = data || {};
  return res.json({
    success: true,
    data: {
      ...rds,
      ruta_aprobacion: rutaAprobacion(monto),
      semaforo_texto: rds.semaforo === 'VERDE' ? 'RDS saludable, dentro de apetito (Art. 13)'
                     : rds.semaforo === 'AMARILLO' ? 'RDS en zona de tolerancia: elevar a comité'
                     : 'RDS fuera de tolerancia: rechazar o reducir monto',
    },
  });
});

// GET /api/prestamos
router.get('/', async (req, res) => {
  const isCore = ['asesor','administrador','jefe_regional','riesgos','comite','analista','admin','gerente'].includes(req.user?.rol);
  // Personal del Core: usa SU PROPIA sesión (la RLS permite al rol core ver todo);
  // así funciona incluso sin SERVICE_ROLE_KEY en el .env. Cliente: solo lo suyo.
  const sb = supabaseAsUser(req.token);

  // SIN join embebido (PostgREST exige una FK directa a perfiles que no existe):
  // 1) solicitudes, 2) perfiles de esos usuarios, 3) unir en JS.
  let query = sb
    .from('solicitudes_prestamo')
    .select('*')
    .order('created_at', { ascending: false });
  if (!isCore) query = query.eq('user_id', req.user.id);

  const { data, error } = await query;
  if (error) return res.status(500).json({ success: false, message: error.message });

  let lista = data || [];
  if (isCore && lista.length) {
    const ids = [...new Set(lista.map(s => s.user_id))];
    const { data: perfiles } = await sb
      .from('perfiles')
      .select('id, nombre, apellido, email, dni')
      .in('id', ids);
    const porId = Object.fromEntries((perfiles || []).map(p => [p.id, p]));
    lista = lista.map(s => ({ ...s, perfiles: porId[s.user_id] || null }));
  }

  // ── Enriquecer créditos DESEMBOLSADOS con datos reales del cronograma ──
  // El frontend (Dashboard/Prestamos) necesita: cuotas_pagadas, saldo_capital,
  // fecha_proximo_pago. Estos viven en creditos_preaprobados + cronograma_cuotas,
  // no en solicitudes_prestamo. Los cruzamos aquí para entregar datos 100% reales.
  const desembolsados = lista.filter(s => s.estado === 'desembolsado');
  if (desembolsados.length) {
    const userIds = [...new Set(desembolsados.map(s => s.user_id))];

    // 1) Créditos desembolsados de esos usuarios
    const { data: creditos } = await sb
      .from('creditos_preaprobados')
      .select('id, user_id, monto_aprobado, plazo_meses, cuota_mensual, fecha_desembolso, dias_mora, estado_pago')
      .in('user_id', userIds)
      .eq('estado', 'desembolsado');

    if (creditos?.length) {
      const creditoIds = creditos.map(c => c.id);

      // 2) Cuotas de esos créditos
      const { data: cuotas } = await sb
        .from('cronograma_cuotas')
        .select('credito_id, nro_cuota, fecha_vencimiento, saldo_capital, estado')
        .in('credito_id', creditoIds);

      // 3) Resumen por crédito: pagadas, saldo actual, próximo vencimiento
      const resumen = {};
      for (const c of creditos) {
        const cs = (cuotas || []).filter(q => q.credito_id === c.id)
          .sort((a, b) => a.nro_cuota - b.nro_cuota);
        const pagadas = cs.filter(q => q.estado === 'pagada').length;
        const pendientes = cs.filter(q => q.estado !== 'pagada');
        // saldo: el saldo_capital de la última cuota pagada (o el monto si ninguna)
        const ultPagada = cs.filter(q => q.estado === 'pagada').pop();
        const saldo = ultPagada ? Number(ultPagada.saldo_capital) : Number(c.monto_aprobado);
        resumen[c.user_id] = {
          credito_id: c.id,
          cuotas_pagadas: pagadas,
          saldo_capital: saldo,
          fecha_proximo_pago: pendientes[0]?.fecha_vencimiento || null,
          dias_mora: c.dias_mora,
          estado_pago: c.estado_pago,
        };
      }

      // 4) Inyectar en cada solicitud desembolsada (match por user_id)
      lista = lista.map(s => {
        if (s.estado === 'desembolsado' && resumen[s.user_id]) {
          return { ...s, ...resumen[s.user_id] };
        }
        return s;
      });
    }
  }

  return res.json({ success: true, data: lista });
});

// POST /api/prestamos
router.post('/', async (req, res) => {
  const { monto, plazo_meses, proposito, con_seguro } = req.body;
  // TEA según seguro de desgravamen (tarifario Micro Micro), salvo tasa explícita
  const tasa_anual = Number(req.body.tasa_anual) > 0
    ? Number(req.body.tasa_anual)
    : (con_seguro ? TEA_CON_SEGURO : TEA_SIN_SEGURO);

  if (!monto || !plazo_meses) {
    return res.status(400).json({ success: false, message: 'Monto y plazo son requeridos' });
  }
  if (Number(monto) < 500) return res.status(400).json({ success: false, message: 'Monto mínimo S/ 500' });
  if (Number(monto) > 100000) return res.status(400).json({ success: false, message: 'Monto máximo S/ 100,000 (Crédito Empresarial Micro Micro)' });
  if (Number(plazo_meses) < 3 || Number(plazo_meses) > 84) {
    return res.status(400).json({ success: false, message: 'Plazo entre 3 y 84 meses' });
  }

  const cuota_mensual = calcularCuota(Number(monto), Number(plazo_meses), Number(tasa_anual));

  const sb = supabaseAsUser(req.token);
  const { data, error } = await sb
    .from('solicitudes_prestamo')
    .insert({
      user_id: req.user.id,
      monto: Number(monto),
      plazo_meses: Number(plazo_meses),
      tasa_anual: Number(tasa_anual),
      cuota_mensual,
      proposito,
      estado: 'pendiente'
    })
    .select()
    .single();

  if (error) return res.status(400).json({ success: false, message: error.message });
  return res.status(201).json({ success: true, data });
});

// GET /api/prestamos/:id
router.get('/:id', async (req, res) => {
  const sb = supabaseAsUser(req.token);
  const { data, error } = await sb
    .from('solicitudes_prestamo')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error) return res.status(404).json({ success: false, message: 'Solicitud no encontrada' });

  // Incluir tabla de amortización en el detalle
  const tabla = tablaAmortizacion(Number(data.monto), data.plazo_meses, Number(data.tasa_anual));
  return res.json({ success: true, data: { ...data, tabla_amortizacion: tabla } });
});

// PUT /api/prestamos/:id/estado — solo Core Financiero
router.put('/:id/estado', requireAsesor, async (req, res) => {
  const { estado } = req.body;
  const estadosValidos = ['pendiente','en_evaluacion','en_comite','aprobado','rechazado','desembolsado'];
  if (!estadosValidos.includes(estado)) {
    return res.status(400).json({ success: false, message: 'Estado inválido' });
  }

  // Ruta de aprobación por monto (Crit.2): al APROBAR, el rol debe alcanzar el umbral
  if (estado === 'aprobado') {
    const { data: sol } = await supabaseAsUser(req.token)
      .from('solicitudes_prestamo').select('monto').eq('id', req.params.id).single();
    if (sol && !puedeAprobar(req.user.rol, sol.monto)) {
      const ruta = rutaAprobacion(sol.monto);
      return res.status(403).json({
        success: false,
        message: `Monto S/ ${sol.monto} requiere aprobación de: ${ruta.nivel}`,
        ruta_aprobacion: ruta,
        tu_rol: req.user.rol,
      });
    }
  }

  const { data, error } = await supabaseAsUser(req.token)
    .from('solicitudes_prestamo')
    .update({ estado, evaluado_por: req.user.id, fecha_evaluacion: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ success: false, message: error.message });
  return res.json({ success: true, data });
});

// POST /api/prestamos/:id/desembolsar — flujo end-to-end (Crit.1)
// Crea el crédito en el Core, abona el saldo en el Homebanking,
// registra la transacción y genera el cronograma. Acción crítica.
router.post('/:id/desembolsar', requireRole('comite', 'administrador', 'admin', 'gerente'), async (req, res) => {
  const { data, error } = await (req.token ? supabaseAsUser(req.token) : supabaseAdmin).rpc('fn_desembolsar_credito', {
    p_solicitud_id: req.params.id,
  });
  if (error) return res.status(400).json({ success: false, message: error.message });
  return res.status(201).json({ success: true, data });
});

// GET /api/prestamos/:id/cronograma — cuotas generadas tras el desembolso
router.get('/:id/cronograma', async (req, res) => {
  // :id puede ser credito_id; el cliente solo ve lo suyo vía RLS
  const sb = supabaseAsUser(req.token);
  const { data, error } = await sb
    .from('cronograma_cuotas')
    .select('*')
    .eq('credito_id', req.params.id)
    .order('nro_cuota');
  if (error) return res.status(500).json({ success: false, message: error.message });
  return res.json({ success: true, data });
});

export default router;
