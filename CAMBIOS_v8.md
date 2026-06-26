# 🚀 CAMBIOS v8 — CMAC Arequipa · Framework SI Real

## 📐 ENFOQUE: Framework de Sistemas de Información
Basado en el diagrama de Laudon & Laudon:

  RETOS DE NEGOCIOS
       ↓
  Administración + Organización + Tecnología
       ↓
  SISTEMA DE INFORMACIÓN (Core CMAC)
       ↓
  SOLUCIONES DE NEGOCIOS

---

## 🖥️ FRONTEND — Dashboard reestructurado

### Mapa conceptual interactivo (nuevo)
Cada caja del framework es clickeable y navega al tab correspondiente:
- ⚠️ Retos → muestra alertas críticas en tiempo real
- 👔 Administración → monitoreo, fichas, asesores
- 🏢 Organización → agencias, estructura, flujos
- ⚙️ Tecnología → scoring, canales digitales
- ✅ Soluciones → resultados, ingresos, colocación

### Tab SISTEMA (nuevo)
Vista global del sistema de información con todas las capas integradas.

### Tab ADMINISTRACIÓN (mejorado)
- Monitorear desembolsos vs meta (estrategia)
- Semáforo de mora por agencia
- KPIs de fichas de campo y asesores

### Tab ORGANIZACIÓN (nuevo)
- Estructura por nivel de asesor (Senior I/II, Junior I/II)
- Cartera por agencia con flujos de trabajo
- Red de agencias por región

### Tab TECNOLOGÍA (mejorado)
- Segmentos de scoring dinámico
- Correlación Score vs Mora (scatter plot)
- Radar 5 dimensiones del modelo
- TEA → TEM con fórmula correcta

### Tab SOLUCIONES (mejorado)
- TOTALYTD desembolsos acumulados
- Techo crediticio por segmento
- TEA por agencia
- Créditos desembolsados por mes

---

## 🔧 BACKEND — Rutas del framework

### 4 endpoints nuevos en /api/dashboard:
- GET /api/dashboard/retos        → Mora, solicitudes pendientes, alertas
- GET /api/dashboard/administracion → Fichas, asesores, rendimiento
- GET /api/dashboard/organizacion   → Agencias, regiones, estructura
- GET /api/dashboard/tecnologia     → Scores, canales, segmentos
- GET /api/dashboard/soluciones     → Conversión, montos, ingresos

Todos con fallback a datos demo si Supabase no responde.

### Rate limiting sin librerías externas:
- /api/auth        → 20 req/min (fuerza bruta)
- /api/transacciones → 60 req/min
- /api/dashboard   → 120 req/min (dashboards son frecuentes)
- /api/scoring     → 40 req/min

### Headers de seguridad en todas las respuestas:
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- X-XSS-Protection: 1; mode=block
- Referrer-Policy: strict-origin-when-cross-origin

---

## 🔗 Conexión Frontend ↔ Backend
El Dashboard llama a los 5 endpoints al montar (Promise.allSettled)
→ Si el backend no responde: usa datos estáticos (no se rompe)
→ Botón "↻ Actualizar" para recargar desde la API
→ Indicador visual mientras carga ("⏳ Actualizando...")
