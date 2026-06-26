-- ============================================================
-- VISTAS SQL SERVER — Relación Core Financiero ↔ Power BI
-- CMAC Arequipa · SQL Server · v9
-- ============================================================
-- EJECUTAR DESPUÉS DE: sqlserver/01_DDL_create_tables.sql
--                    + sqlserver/02_INSERT_catalogos.sql
--                    + sqlserver/03_INSERT_clientes.sql
-- ============================================================

USE bd_core_financiero;  -- Cambia al nombre de tu BD
GO

-- ── VISTA 1: KPIs de cartera por oficina y mes (Power BI) ──
CREATE OR ALTER VIEW vw_kpis_cartera AS
SELECT
    k.nIdKpi,
    k.nAnio,
    k.nMes,
    CAST(k.nAnio AS NVARCHAR) + '-' + RIGHT('0' + CAST(k.nMes AS NVARCHAR), 2) AS periodo,
    o.cDesOficin    AS oficina,
    z.cDesZona      AS zona,
    k.nCarteraTotal,
    k.nCarteraVigente,
    k.nCarteraVencida,
    k.nRatioMora,
    k.nNroClientes,
    k.nNroCreditos,
    k.nDesembolsos,
    k.nTasaPromedio,
    -- Columna calculada para Power BI
    ROUND(k.nCarteraVencida / NULLIF(k.nCarteraTotal, 0) * 100, 4) AS ratio_mora_calc
FROM KPIS_CARTERA_MENSUAL k
JOIN GENTOficinas o ON k.cCodOficin = o.cCodOficin
JOIN GentZonas   z ON o.nCodZona   = z.nCodZona;
GO

-- ── VISTA 2: Créditos con detalle completo ─────────────────
CREATE OR ALTER VIEW vw_creditos_detalle AS
SELECT
    c.cCodCtaCre,
    c.dFecDesCre,
    CAST(YEAR(c.dFecDesCre) AS NVARCHAR) + '-' +
        RIGHT('0' + CAST(MONTH(c.dFecDesCre) AS NVARCHAR), 2) AS periodo_desembolso,
    cli.cNomCliente,
    cli.cNumDocIde,
    p.cNomPerson    AS asesor,
    o.cDesOficin    AS oficina,
    z.cDesZona      AS zona,
    t.cDesTipCre    AS tipo_credito,
    t.cDesSubTip    AS sub_tipo,
    c.cEstCreCon,
    est.cDescriEst  AS estado_credito,
    c.nMonCapDes    AS monto_desembolsado,
    c.nMonCapPag    AS monto_pagado,
    c.nMonSalNor    AS saldo_vigente,
    c.nMonSalVen    AS saldo_vencido,
    c.nMonSalJud    AS saldo_judicial,
    c.nTasintCom    AS tasa_mensual,
    c.nTEACre       AS tea,
    c.nNumCuoApr    AS plazo_cuotas,
    c.nDiaAtrCre    AS dias_atraso,
    c.cCodTipMon    AS moneda,
    -- Clasificación SBS calculada
    CASE
        WHEN c.nDiaAtrCre = 0     THEN 'Normal'
        WHEN c.nDiaAtrCre <= 8    THEN 'CPP'
        WHEN c.nDiaAtrCre <= 30   THEN 'Deficiente'
        WHEN c.nDiaAtrCre <= 60   THEN 'Dudoso'
        ELSE                           'Pérdida'
    END AS clasificacion_sbs,
    g.cCondicCon    AS condicion_crediticia,
    g.cCodLinCre    AS linea_credito
FROM KPYMCRECONVEN   c
JOIN CLIMCLIENTES    cli ON c.cCodCliente = cli.cCodCliente
JOIN SIPMPERSONAL    p   ON c.cCodUsuAna  = p.cCodPerson
JOIN GENTOficinas    o   ON c.cCodOficin  = o.cCodOficin
JOIN GentZonas       z   ON o.nCodZona    = z.nCodZona
JOIN KPYTSUBTIPCRE   t   ON c.cCodTipCre  = t.cCodTipCre
                        AND c.cCodProduc  = t.cCodProduc
                        AND c.cCodSubPro  = t.cCodSubPro
JOIN KPYTEstCreCon   est ON c.cEstCreCon  = est.cEstCreCon
JOIN GENMCRECLI      g   ON c.cCodCtaCre  = g.cCodCtaCre;
GO

-- ── VISTA 3: Scoring mensual por cliente ───────────────────
CREATE OR ALTER VIEW vw_scoring_clientes AS
SELECT
    s.nIdScoring,
    s.nAnio,
    s.nMes,
    CAST(s.nAnio AS NVARCHAR) + '-' + RIGHT('0' + CAST(s.nMes AS NVARCHAR), 2) AS periodo,
    cli.cNomCliente,
    cli.cNumDocIde,
    o.cDesOficin    AS oficina,
    z.cDesZona      AS zona,
    s.nPuntaje,
    s.cClasifica,
    -- Segmento según puntaje
    CASE
        WHEN s.nPuntaje >= 600 THEN 'PREMIER'
        WHEN s.nPuntaje >= 440 THEN 'ESTÁNDAR'
        WHEN s.nPuntaje >= 280 THEN 'BÁSICO'
        ELSE                        'NO APLICA'
    END AS segmento,
    s.nMoraMaxima,
    s.nMoraPromedio,
    s.nNroCreditos,
    s.nSaldoTotal
FROM SCORING_MENSUAL  s
JOIN CLIMCLIENTES     cli ON s.cCodCliente = cli.cCodCliente
JOIN GENTOficinas     o   ON cli.cCodOficin = o.cCodOficin
JOIN GentZonas        z   ON o.nCodZona     = z.nCodZona;
GO

-- ── VISTA 4: Plan de pagos con mora real ───────────────────
CREATE OR ALTER VIEW vw_plan_pagos AS
SELECT
    pp.nIdPlanPago,
    pp.cCodCtaCre,
    pp.nNroCuota,
    pp.nMontoCuota,
    pp.nMontoCapit,
    pp.dFecVenCuo,
    pp.cEstadoCuo,
    pp.nDiaVenCuo,
    cli.cNomCliente,
    o.cDesOficin    AS oficina,
    -- Cuota pagada o pendiente
    CASE pp.cEstadoCuo WHEN 'P' THEN 'PAGADA' ELSE 'PENDIENTE' END AS estado_desc,
    -- Interés de la cuota (monto total - capital)
    pp.nMontoCuota - pp.nMontoCapit AS interes_cuota
FROM KPYDPLANPAGCRE  pp
JOIN KPYMCRECONVEN   c   ON pp.cCodCtaCre  = c.cCodCtaCre
JOIN CLIMCLIENTES    cli ON c.cCodCliente   = cli.cCodCliente
JOIN GENTOficinas    o   ON c.cCodOficin    = o.cCodOficin;
GO

-- ── VISTA 5: Personal con área y oficina ───────────────────
CREATE OR ALTER VIEW vw_personal_completo AS
SELECT
    p.cCodPerson,
    p.cNomPerson,
    p.cNumDocIde,
    p.dFecIngIns    AS fecha_ingreso,
    p.dFecCesIns    AS fecha_cese,
    CASE WHEN p.dFecCesIns IS NULL THEN 'ACTIVO' ELSE 'CESADO' END AS estado,
    DATEDIFF(YEAR, p.dFecIngIns, ISNULL(p.dFecCesIns, GETDATE())) AS anos_servicio,
    car.cDesCarPer  AS cargo,
    a.cDesArea      AS area,
    o.cDesOficin    AS oficina,
    z.cDesZona      AS zona
FROM SIPMPERSONAL  p
JOIN SIPTCARGOPER  car ON p.cCodGruPer = car.cCodGruPer
JOIN SIPTAreaOrg   a   ON p.cCodArea   = a.cCodArea
JOIN GENTOficinas  o   ON p.cCodOficin = o.cCodOficin
JOIN GentZonas     z   ON o.nCodZona   = z.nCodZona;
GO

-- ── VERIFICACIÓN ──────────────────────────────────────────
SELECT 'vw_kpis_cartera'      AS vista, COUNT(*) AS filas FROM vw_kpis_cartera       UNION ALL
SELECT 'vw_creditos_detalle',            COUNT(*)          FROM vw_creditos_detalle   UNION ALL
SELECT 'vw_scoring_clientes',            COUNT(*)          FROM vw_scoring_clientes   UNION ALL
SELECT 'vw_plan_pagos',                  COUNT(*)          FROM vw_plan_pagos         UNION ALL
SELECT 'vw_personal_completo',           COUNT(*)          FROM vw_personal_completo;
GO

-- ============================================================
-- FIN — 02_sqlserver_vistas_powerbi.sql · CMAC Arequipa v9
-- ============================================================
