# 🚀 CAMBIOS v6 — CMAC Arequipa

## ✅ CORRECCIONES Y MEJORAS

### 📊 14 Gráficas en 4 tabs — todas funcionales
### 🔘 Todos los botones filtran datos en tiempo real

---

## TAB 1 — RESUMEN
- Cartera Vigente vs Vencida (BarChart apilado)
- Desembolsos vs Meta (BarChart comparativo)
- Tipo de Crédito (PieChart donut)
- Clasificación SBS con barras semáforo
- TEA → TEM por segmento con cálculo correcto

## TAB 2 — MORA
- Evolución Ratio Mora mensual (ComposedChart línea+barra)
- Mora por Agencia en semáforo horizontal
- Cartera vencida por tramo de días (SBS)
- Mora por tipo de crédito comparativo

## TAB 3 — DESEMBOLSOS
- Acumulado anual TOTALYTD (AreaChart)
- Número de créditos por mes (BarChart)
- Ticket promedio por agencia (horizontal)
- TEA promedio por agencia (horizontal)

## TAB 4 — SCORING
- Distribución por segmento PREMIER/ESTÁNDAR/BÁSICO
- Radar 5 dimensiones (Saldo/Regularidad/Disciplina/Vínculo/Riesgo)
- Correlación Score vs Mora (ScatterChart)
- Techo crediticio promedio por segmento

---

## 🔘 FILTROS FUNCIONALES (todos afectan todas las gráficas)

### Zona
- Todas | Norte | Lima | Sur | Oriente
→ Cambia KPIs, mora por agencia, ticket, TEA

### Periodo
- 2025 | 2024 | 2024–2025 (acumulado)
→ Cambia series de tiempo, KPIs, número de barras

### Tabs
→ Navegan entre los 4 módulos de análisis

---

## 📐 CÁLCULO TEA → TEM (correcto, según diapositiva S11)
TEM = (1 + TEA/100)^(1/12) − 1
Ejemplo: TEA 60% → TEM 3.98% (NO usar TEA/12 = 5%)
