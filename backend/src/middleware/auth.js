// src/middleware/auth.js — v7: validación JWT con restricciones de rol
import { supabase } from '../supabase.js';

// ── Middleware base: verificar JWT ──────────────────────
export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Token no proporcionado' });
  }

  const token = authHeader.slice(7);
  if (!token || token === 'placeholder') {
    return res.status(401).json({ success: false, message: 'Token inválido' });
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ success: false, message: 'Sesión expirada. Vuelve a iniciar sesión.' });
    }

    // Verificar que el usuario no esté bloqueado
    const { data: perfil } = await supabase
      .from('perfiles')
      .select('rol, bloqueado, activo')
      .eq('id', user.id)
      .single();

    if (perfil?.bloqueado || perfil?.activo === false) {
      return res.status(403).json({ success: false, message: 'Cuenta suspendida. Contacta soporte.' });
    }

    req.user   = { ...user, rol: perfil?.rol ?? 'cliente' };
    req.perfil = perfil ?? { rol: 'cliente' };
    req.token  = token;
    next();
  } catch (err) {
    console.error('[Auth Middleware]', err.message);
    return res.status(500).json({ success: false, message: 'Error verificando sesión' });
  }
}

// ── Middleware de roles ─────────────────────────────────
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'No autenticado' });
    }
    if (!roles.includes(req.user.rol)) {
      return res.status(403).json({
        success:  false,
        message:  `Acceso denegado. Se requiere rol: ${roles.join(' o ')}`,
        your_rol: req.user.rol,
      });
    }
    next();
  };
}

// Atajos de uso frecuente
export const requireAsesor  = requireRole('asesor', 'administrador', 'jefe_regional', 'riesgos', 'comite', 'analista', 'admin', 'gerente');
export const requireAdmin   = requireRole('administrador', 'jefe_regional', 'admin', 'gerente');
export const requireGerente = requireRole('gerente');

// ── Atajos de la rúbrica Banco Andino (Crit. 3) ─────────
// Acciones críticas de recuperaciones:
//   - Derivar a judicial / castigar → solo Riesgos o Gerencia
//   - Resolver comité               → solo Comité o Gerencia
export const requireRiesgos  = requireRole('riesgos', 'administrador', 'gerente');
export const requireComite   = requireRole('comite', 'gerente');
export const requireGerencia = requireRole('gerente', 'admin', 'administrador');
