# 🚀 CAMBIOS v5 — CMAC Arequipa

## ✅ CORRECCIONES

### 🔍 Buscador funcional
- Antes: solo decorativo (no hacía nada)
- Ahora: escribes cualquier módulo y te lleva directamente
- Ejemplos: "scoring", "clientes", "agencias", "pagos"
- Aparece dropdown con resultados agrupados por sección

### 🔔 Notificaciones funcionales
- Antes: campana decorativa sin contenido
- Ahora: dropdown con notificaciones reales categorizadas
- Tipos: préstamo, seguridad, transacción, sistema
- Marcar como leída al hacer clic
- Contador de no leídas en la campana

### 🔗 Filtros con relaciones reales
- Antes: botones de zona/mes que NO filtraban las gráficas
- Ahora: al cambiar zona o mes, TODOS los charts se actualizan
- KPIs, gráficas de barras, líneas y treemap reflejan el filtro

---

## 📊 NUEVAS GRÁFICAS (6 nuevas)

1. **Evolución Cartera Vigente vs Vencida** — AreaChart con gradiente
2. **Ratio de Mora Mensual** — ComposedChart (barras + línea)
3. **Meta vs Real Desembolsos** — BarChart comparativo
4. **Cartera por Tipo de Crédito** — PieChart (donut)
5. **Clasificación SBS** — PieChart con colores oficiales
6. **Scoring — Perfil Cartera** — RadarChart 5 dimensiones
7. **Mora por Agencia** — Barras horizontales con colores semáforo
8. **TEA Promedio por Agencia** — BarChart con degradado
9. **Mapa Treemap** — mejorado con datos filtrados por zona

---

## 🏦 BRANDING CAJA AREQUIPA
- Header institucional con logo y nombre oficial
- Sidebar con badge CMAC visible
- Topbar muestra "CMAC Arequipa" siempre visible
- Switch Portal ↔ Core en sidebar

---

## 📁 ARCHIVOS MODIFICADOS
- `frontend/src/components/Layout.jsx` — búsqueda + notificaciones
- `frontend/src/pages/core/Dashboard.jsx` — 9 gráficas + filtros
- `SUPABASE_GUIA.md` — instrucciones Supabase completas

