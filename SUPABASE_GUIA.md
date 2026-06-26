# 📋 GUÍA SUPABASE — CMAC Arequipa v5

## ¿QUÉ PONER EN SUPABASE? — Orden de ejecución

Ve a: **Supabase → tu proyecto → SQL Editor**

---

## PASO 1: Script principal (OBLIGATORIO)
Copia y pega el contenido de:
```
sql/00_setup_supabase.sql
```
Esto crea:
- Tabla `perfiles` (usuarios del sistema)
- Tabla `cuentas` (cuentas corriente/ahorro)
- Tabla `transacciones`
- Tabla `pagos`
- Tabla `solicitudes_prestamo`
- Tabla `agencias` + datos de las 30 agencias
- Tabla `asesores_negocio` + 360 asesores (12 por agencia)
- RLS (seguridad por rol)
- Funciones de scoring
- Vistas para Power BI

---

## PASO 2: Scoring (OBLIGATORIO para módulo Scoring)
```
sql/01_scoring_supabase.sql
```
Crea funciones avanzadas de scoring transaccional.

---

## PASO 3: Agencias y asesores extendido
```
sql/02_agencias_asesores_supabase.sql
```

---

## PASO 4: Datos demo (RECOMENDADO para pruebas)
```
sql/03_seed_demo_supabase.sql
```
Inserta ~50 clientes demo con transacciones, scores y fichas de campo.

---

## VARIABLES DE ENTORNO (.env)

```env
VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...TU_CLAVE_ANON...
VITE_API_URL=http://localhost:3001
```

---

## CREAR USUARIOS CON ROL (en Supabase SQL Editor)

```sql
-- Ver todos los usuarios con su rol
SELECT id, email, nombre, rol FROM public.perfiles ORDER BY rol;

-- Cambiar un usuario a asesor
UPDATE public.perfiles SET rol = 'asesor' WHERE email = 'tu@email.com';

-- Cambiar a gerente
UPDATE public.perfiles SET rol = 'gerente' WHERE email = 'jefe@email.com';
```

---

## TABLA ALERTAS_USUARIO — Para notificaciones reales

Para que las notificaciones del sistema sean reales (no demo),
inserta alertas en Supabase para el usuario logueado:

```sql
INSERT INTO public.alertas_usuario (user_id, tipo, titulo, mensaje, urgente)
VALUES (
  'UUID_DEL_USUARIO',  -- copia de auth.users
  'prestamo',
  'Cuota próxima a vencer',
  'La cuota del crédito CTR-2026-0481 vence en 3 días. Monto: S/ 284.50',
  true
);
```

Tipos válidos: `transaccion` | `seguridad` | `prestamo` | `sistema` | `pago`

---

## CONECTAR DASHBOARD CON DATOS REALES

Para conectar el Dashboard Gerencial con datos reales de Supabase,
reemplaza las constantes del archivo `src/pages/core/Dashboard.jsx`
con llamadas a Supabase como esta:

```javascript
import { supabase } from '../../api/supabase';
import { useEffect, useState } from 'react';

// En el componente:
const [kpis, setKpis] = useState(null);

useEffect(() => {
  async function cargarKpis() {
    const { data } = await supabase
      .from('vw_pbi_agencias')
      .select('*');
    setKpis(data);
  }
  cargarKpis();
}, []);
```

---

## NOTAS IMPORTANTES

1. Ejecuta los scripts **en orden**: 00 → 01 → 02 → 03
2. Si ya ejecutaste antes, el script 00 tiene `DROP TABLE IF EXISTS` — borra todo y recrea
3. El script asigna automáticamente rol 'asesor' a emails que contengan 'asesor' o terminen en '02@mibanco.com'
4. Para acceder al **Core Financiero** (Dashboard Gerencial), el usuario debe tener rol: `asesor`, `admin` o `gerente`
5. Los clientes solo acceden al **Portal HomeBanking**

