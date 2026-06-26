-- ============================================================
-- CORE FINANCIERO SIMULADO - PARTE 1: CREAR TABLAS
-- Periodo: 2015-2024 | Power BI Dashboard - StrategyMGE
-- ============================================================

-- ============================================================
-- 1. TABLAS CATALOGO
-- ============================================================

CREATE TABLE GentZonas (
    nCodZona    CHAR(2)       NOT NULL,
    cDesZona    VARCHAR(50)   NOT NULL,
    cAbrZona    VARCHAR(20)   NOT NULL,
    CONSTRAINT PK_GentZonas PRIMARY KEY (nCodZona)
);

CREATE TABLE GENTOficinas (
    cCodOficin  CHAR(3)       NOT NULL,
    cDesOficin  VARCHAR(80)   NOT NULL,
    nCodZona    CHAR(2)       NOT NULL,
    lConEstado  CHAR(1)       NOT NULL DEFAULT '1',
    CONSTRAINT PK_GENTOficinas PRIMARY KEY (cCodOficin),
    CONSTRAINT FK_Oficinas_Zona FOREIGN KEY (nCodZona) REFERENCES GentZonas(nCodZona)
);

CREATE TABLE KPYTSUBTIPCRE (
    cCodTipCre  CHAR(2)       NOT NULL,
    cCodProduc  CHAR(2)       NOT NULL,
    cCodSubPro  CHAR(2)       NOT NULL,
    cDesTipCre  VARCHAR(50)   NOT NULL,
    cDesProCre  VARCHAR(50)   NOT NULL,
    cDesSubCre  VARCHAR(60)   NOT NULL,
    cDesSubTip  VARCHAR(60)   NOT NULL,
    cDesSubProd VARCHAR(60)   NOT NULL,
    lEstado     CHAR(1)       NOT NULL DEFAULT '1',
    CONSTRAINT PK_KPYTSUBTIPCRE PRIMARY KEY (cCodTipCre, cCodProduc, cCodSubPro)
);

CREATE TABLE KPYTEstCreCon (
    cEstCreCon  CHAR(1)       NOT NULL,
    cDescriEst  VARCHAR(50)   NOT NULL,
    CONSTRAINT PK_KPYTEstCreCon PRIMARY KEY (cEstCreCon)
);

CREATE TABLE KPYTConCredit (
    cCondicCon  CHAR(2)       NOT NULL,
    cDesConCre  VARCHAR(50)   NOT NULL,
    CONSTRAINT PK_KPYTConCredit PRIMARY KEY (cCondicCon)
);

CREATE TABLE SIPTCARGOPER (
    cCodGruPer  CHAR(3)       NOT NULL,
    cDesCarPer  VARCHAR(80)   NOT NULL,
    CONSTRAINT PK_SIPTCARGOPER PRIMARY KEY (cCodGruPer)
);

CREATE TABLE SIPTAreaOrg (
    cCodArea    CHAR(3)       NOT NULL,
    cDesArea    VARCHAR(80)   NOT NULL,
    lConEstado  CHAR(1)       NOT NULL DEFAULT '1',
    CONSTRAINT PK_SIPTAreaOrg PRIMARY KEY (cCodArea)
);

CREATE TABLE GENTTipCambio (
    dFecTipCam  DATE          NOT NULL,
    nTipCamFij  NUMERIC(8,4)  NOT NULL,
    CONSTRAINT PK_GENTTipCambio PRIMARY KEY (dFecTipCam)
);

-- ============================================================
-- 2. TABLAS MAESTRO
-- ============================================================

CREATE TABLE CLIMCLIENTES (
    cCodCliente  CHAR(12)      NOT NULL,
    cNomCliente  VARCHAR(100)  NOT NULL,
    cNumDocIde   CHAR(8)       NOT NULL,
    dFecNacCli   DATE          NOT NULL,
    cSexoCli     CHAR(1)       NOT NULL,
    cCodOficin   CHAR(3)       NOT NULL,
    CONSTRAINT PK_CLIMCLIENTES PRIMARY KEY (cCodCliente),
    CONSTRAINT FK_Clientes_Oficina FOREIGN KEY (cCodOficin) REFERENCES GENTOficinas(cCodOficin)
);

CREATE TABLE SIPMPERSONAL (
    cCodPerson   CHAR(6)       NOT NULL,
    cNomPerson   VARCHAR(100)  NOT NULL,
    cNumDocIde   CHAR(8)       NOT NULL,
    cCodGruPer   CHAR(3)       NOT NULL,
    cCodArea     CHAR(3)       NOT NULL,
    cCodOficin   CHAR(3)       NOT NULL,
    dFecIngIns   DATE          NOT NULL,
    dFecCesIns   DATE          NULL,
    CONSTRAINT PK_SIPMPERSONAL PRIMARY KEY (cCodPerson),
    CONSTRAINT FK_Personal_Cargo   FOREIGN KEY (cCodGruPer) REFERENCES SIPTCARGOPER(cCodGruPer),
    CONSTRAINT FK_Personal_Area    FOREIGN KEY (cCodArea)   REFERENCES SIPTAreaOrg(cCodArea),
    CONSTRAINT FK_Personal_Oficina FOREIGN KEY (cCodOficin) REFERENCES GENTOficinas(cCodOficin)
);

-- ============================================================
-- 3. TABLAS TRANSACCIONALES
-- ============================================================

CREATE TABLE KPYMCRECONVEN (
    cCodCtaCre   CHAR(18)      NOT NULL,
    cCodCliente  CHAR(12)      NOT NULL,
    cCodUsuAna   CHAR(6)       NOT NULL,
    cCodOficin   CHAR(3)       NOT NULL,
    cCodTipCre   CHAR(2)       NOT NULL,
    cCodProduc   CHAR(2)       NOT NULL,
    cCodSubPro   CHAR(2)       NOT NULL,
    cCodModCre   CHAR(2)       NOT NULL DEFAULT '01',
    cEstCreCon   CHAR(1)       NOT NULL,
    nMonCapDes   NUMERIC(14,4) NOT NULL,
    nMonCapPag   NUMERIC(14,4) NOT NULL DEFAULT 0,
    nMonSalNor   NUMERIC(14,4) NOT NULL DEFAULT 0,
    nMonSalVen   NUMERIC(14,4) NOT NULL DEFAULT 0,
    nMonSalJud   NUMERIC(14,4) NOT NULL DEFAULT 0,
    nTasintCom   NUMERIC(8,6)  NOT NULL,
    nTEACre      NUMERIC(10,6) NOT NULL,
    nNumCuoApr   INT           NOT NULL,
    nDiaAtrCre   INT           NOT NULL DEFAULT 0,
    cCodTipMon   CHAR(1)       NOT NULL DEFAULT '1',
    dFecDesCre   DATE          NOT NULL,
    cCodRefina   CHAR(1)       NOT NULL DEFAULT 'N',
    cCodJudici   CHAR(1)       NOT NULL DEFAULT 'N',
    cCodCastig   CHAR(1)       NOT NULL DEFAULT 'N',
    CONSTRAINT PK_KPYMCRECONVEN   PRIMARY KEY (cCodCtaCre),
    CONSTRAINT FK_Cre_Cliente      FOREIGN KEY (cCodCliente) REFERENCES CLIMCLIENTES(cCodCliente),
    CONSTRAINT FK_Cre_Asesor       FOREIGN KEY (cCodUsuAna)  REFERENCES SIPMPERSONAL(cCodPerson),
    CONSTRAINT FK_Cre_Oficina      FOREIGN KEY (cCodOficin)  REFERENCES GENTOficinas(cCodOficin)
);

CREATE TABLE GENMCRECLI (
    cCodCtaCre   CHAR(18)      NOT NULL,
    cCodCliente  CHAR(12)      NOT NULL,
    cCodLinCre   CHAR(3)       NOT NULL DEFAULT 'MIC',
    cCondicCon   CHAR(2)       NOT NULL DEFAULT '01',
    CONSTRAINT PK_GENMCRECLI   PRIMARY KEY (cCodCtaCre),
    CONSTRAINT FK_Gen_Cliente  FOREIGN KEY (cCodCliente) REFERENCES CLIMCLIENTES(cCodCliente)
);

CREATE TABLE KPYDPLANPAGCRE (
    nIdPlanPago  INT           NOT NULL,
    cCodCtaCre   CHAR(18)      NOT NULL,
    nNroCuota    INT           NOT NULL,
    nMontoCuota  NUMERIC(14,4) NOT NULL,
    nMontoCapit  NUMERIC(14,4) NOT NULL,
    nDiaVenCuo   INT           NOT NULL DEFAULT 0,
    dFecVenCuo   DATE          NOT NULL,
    cEstadoCuo   CHAR(1)       NOT NULL DEFAULT 'P',
    CONSTRAINT PK_KPYDPLANPAGCRE PRIMARY KEY (nIdPlanPago),
    CONSTRAINT FK_Plan_Credito   FOREIGN KEY (cCodCtaCre) REFERENCES KPYMCRECONVEN(cCodCtaCre)
);

-- ============================================================
-- 4. TABLAS ANALITICAS
-- ============================================================

CREATE TABLE SCORING_MENSUAL (
    nIdScoring    INT           NOT NULL,
    cCodCliente   CHAR(12)      NOT NULL,
    nAnio         INT           NOT NULL,
    nMes          INT           NOT NULL,
    nPuntaje      INT           NOT NULL,
    nMoraMaxima   INT           NOT NULL DEFAULT 0,
    nMoraPromedio NUMERIC(8,2)  NOT NULL DEFAULT 0,
    nNroCreditos  INT           NOT NULL DEFAULT 0,
    nSaldoTotal   NUMERIC(14,4) NOT NULL DEFAULT 0,
    cClasifica    CHAR(1)       NOT NULL,
    CONSTRAINT PK_SCORING_MENSUAL PRIMARY KEY (nIdScoring),
    CONSTRAINT FK_Scoring_Cliente  FOREIGN KEY (cCodCliente) REFERENCES CLIMCLIENTES(cCodCliente)
);

CREATE TABLE KPIS_CARTERA_MENSUAL (
    nIdKpi          INT           NOT NULL,
    cCodOficin      CHAR(3)       NOT NULL,
    nAnio           INT           NOT NULL,
    nMes            INT           NOT NULL,
    nCarteraTotal   NUMERIC(16,4) NOT NULL,
    nCarteraVigente NUMERIC(16,4) NOT NULL,
    nCarteraVencida NUMERIC(16,4) NOT NULL,
    nRatioMora      NUMERIC(8,4)  NOT NULL,
    nNroClientes    INT           NOT NULL,
    nNroCreditos    INT           NOT NULL,
    nDesembolsos    NUMERIC(16,4) NOT NULL,
    nTasaPromedio   NUMERIC(8,4)  NOT NULL,
    CONSTRAINT PK_KPIS_CARTERA    PRIMARY KEY (nIdKpi),
    CONSTRAINT FK_Kpis_Oficina    FOREIGN KEY (cCodOficin) REFERENCES GENTOficinas(cCodOficin)
);

-- ============================================================
-- INDICES PARA POWER BI
-- ============================================================
CREATE INDEX IX_CRE_CLI ON KPYMCRECONVEN(cCodCliente);
CREATE INDEX IX_CRE_OFI ON KPYMCRECONVEN(cCodOficin);
CREATE INDEX IX_CRE_FEC ON KPYMCRECONVEN(dFecDesCre);
CREATE INDEX IX_CRE_EST ON KPYMCRECONVEN(cEstCreCon);
CREATE INDEX IX_GEN_CLI ON GENMCRECLI(cCodCliente);
CREATE INDEX IX_PAG_CTA ON KPYDPLANPAGCRE(cCodCtaCre);
CREATE INDEX IX_SCO_CLI ON SCORING_MENSUAL(cCodCliente, nAnio, nMes);
CREATE INDEX IX_KPI_OFI ON KPIS_CARTERA_MENSUAL(cCodOficin, nAnio, nMes);
