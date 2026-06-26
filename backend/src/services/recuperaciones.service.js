// src/services/recuperaciones.service.js
// Capa SERVICIO (Crit.5): reglas de negocio del módulo de mora.
// Orquesta el repositorio y aplica validaciones antes de tocar la BD.
import * as repo from '../repositories/recuperaciones.repo.js';

// Definición de bandas (alineada a la rúbrica Banco Andino)
export const BANDAS = {
  Vigente:    { min: -9999, max: 0,    color: 'verde'   },
  Preventiva: { min: 1,     max: 8,    color: 'verde'   },
  Temprana:   { min: 9,     max: 30,   color: 'ambar'   },
  Tardia:     { min: 31,    max: 120,  color: 'naranja' },
  Judicial:   { min: 121,   max: 180,  color: 'rojo'    },
  Castigo:    { min: 181,   max: 9999, color: 'negro'   },
};

// ── R1: resumen de cartera morosa con KPIs ────────────────
export async function resumenCartera() {
  const { data: bandas, error } = await repo.kpisPorBanda();
  if (error) throw new Error(error.message);

  const totalCreditos = bandas.reduce((a, b) => a + Number(b.num_creditos), 0);
  const saldoTotal    = bandas.reduce((a, b) => a + Number(b.saldo_cartera), 0);
  const enMora        = bandas
    .filter(b => b.banda_mora !== 'Vigente')
    .reduce((a, b) => a + Number(b.num_creditos), 0);
  const saldoEnMora   = bandas
    .filter(b => b.banda_mora !== 'Vigente')
    .reduce((a, b) => a + Number(b.saldo_cartera), 0);

  return {
    bandas,
    kpis: {
      total_creditos: totalCreditos,
      creditos_en_mora: enMora,
      ratio_mora_pct: totalCreditos ? +((enMora / totalCreditos) * 100).toFixed(2) : 0,
      saldo_total: +saldoTotal.toFixed(2),
      saldo_en_mora: +saldoEnMora.toFixed(2),
    },
  };
}

export async function listarCartera(filtros) {
  const { data, error } = await repo.carteraMorosa(filtros);
  if (error) throw new Error(error.message);
  return data;
}

// ── R2: registrar una gestión de cobranza ─────────────────
export async function registrarGestion({ credito_id, gestor, body }) {
  const { data: credito, error } = await repo.creditoPorId(credito_id);
  if (error) throw new Error('Crédito no encontrado');

  const canales    = ['llamada', 'visita', 'sms', 'email', 'whatsapp', 'carta'];
  const resultados = ['contacto_efectivo', 'promesa_pago', 'no_contacto', 'negativa', 'renegociacion', 'pago_realizado'];
  if (!canales.includes(body.canal))       throw new Error('Canal inválido');
  if (!resultados.includes(body.resultado)) throw new Error('Resultado inválido');

  const gestion = {
    credito_id,
    user_id: credito.user_id,
    gestor_id: gestor.id,
    gestor_nombre: gestor.nombre || gestor.email,
    canal: body.canal,
    resultado: body.resultado,
    compromiso_monto: body.compromiso_monto ?? 0,
    compromiso_fecha: body.compromiso_fecha ?? null,
    banda_al_gestionar: credito.banda_mora,
    dias_mora_al_gestionar: credito.dias_mora,
    observacion: body.observacion ?? null,
  };
  const { data, error: e2 } = await repo.insertarGestion(gestion);
  if (e2) throw new Error(e2.message);
  return data;
}

export async function historialGestiones(credito_id) {
  const { data, error } = await repo.listarGestiones(credito_id);
  if (error) throw new Error(error.message);
  return data;
}

// ── R3: transición a judicial / castigo (umbrales en la BD) ─
export async function transicion({ credito_id, accion, gestor }) {
  if (!['judicial', 'castigo'].includes(accion))
    throw new Error('Acción inválida (judicial | castigo)');
  const { data, error } = await repo.rpcTransicion({
    credito_id, accion, gestor_id: gestor.id, gestor_nombre: gestor.nombre || gestor.email,
  });
  if (error) throw new Error(error.message);  // la BD lanza si no cumple el umbral
  return data;
}
