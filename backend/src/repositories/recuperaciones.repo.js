// src/repositories/recuperaciones.repo.js
// Capa REPOSITORIO (Crit.5 — arquitectura en capas):
// SOLO acceso a datos. No contiene reglas de negocio.
import { supabaseAdmin } from '../supabase.js';

// ── R1: cartera por bandas (KPIs) ─────────────────────────
export async function kpisPorBanda() {
  return supabaseAdmin.from('vw_mora_bandas').select('*').order('banda_mora');
}

export async function carteraMorosa({ banda, limit = 100, offset = 0 } = {}) {
  let q = supabaseAdmin
    .from('vw_cartera_morosa')
    .select('*')
    .order('dias_mora', { ascending: false })
    .range(Number(offset), Number(offset) + Number(limit) - 1);
  if (banda) q = q.eq('banda_mora', banda);
  return q;
}

export async function creditoPorId(credito_id) {
  return supabaseAdmin.from('creditos_preaprobados').select('*').eq('id', credito_id).single();
}

// ── R2: gestiones de cobranza ─────────────────────────────
export async function listarGestiones(credito_id) {
  return supabaseAdmin
    .from('gestiones_cobranza')
    .select('*')
    .eq('credito_id', credito_id)
    .order('created_at', { ascending: false });
}

export async function insertarGestion(gestion) {
  return supabaseAdmin.from('gestiones_cobranza').insert(gestion).select().single();
}

// ── R3: transición vía RPC (umbrales validados en la BD) ──
export async function rpcTransicion({ credito_id, accion, gestor_id, gestor_nombre }) {
  return supabaseAdmin.rpc('fn_transicion_mora', {
    p_credito_id: credito_id,
    p_accion: accion,
    p_gestor_id: gestor_id,
    p_gestor_nombre: gestor_nombre,
  });
}
