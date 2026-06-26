-- ============================================================
-- SEGURIDAD BD — Roles, Usuarios, Permisos y Auditoría
-- CMAC Arequipa · SQL Server · v9
-- ============================================================
-- BASADO EN: SQLQuery1.sql + SQLQuery2.sql (subidos por el usuario)
-- CORRECCIONES APLICADAS:
--   ✓ Typo: IdProductox|INT → IdProducto INT
--   ✓ Roles asignados a usuarios (faltaba EXEC sp_addrolemember)
--   ✓ Trigger de auditoría mejorado con INSERT, UPDATE, DELETE separados
--   ✓ Tabla AuditoriaAccesos con detalle de operación
-- ============================================================

USE master;
GO

-- ── 1. CREAR BASE DE DATOS ────────────────────────────────
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'SeguridadBD')
    CREATE DATABASE SeguridadBD;
GO
USE SeguridadBD;
GO

-- ── 2. TABLAS ─────────────────────────────────────────────
IF OBJECT_ID('Ventas',    'U') IS NOT NULL DROP TABLE Ventas;
IF OBJECT_ID('Clientes',  'U') IS NOT NULL DROP TABLE Clientes;
IF OBJECT_ID('Productos', 'U') IS NOT NULL DROP TABLE Productos;

CREATE TABLE Clientes (
    IdCliente   INT         PRIMARY KEY IDENTITY,
    Nombre      NVARCHAR(100),
    Email       NVARCHAR(100) UNIQUE,
    Telefono    NVARCHAR(20),
    NivelAcceso NVARCHAR(20)
);

CREATE TABLE Productos (
    IdProducto  INT          PRIMARY KEY IDENTITY,   -- FIX: era "IdProductox|INT"
    Nombre      NVARCHAR(100),
    Precio      DECIMAL(10,2)
);

CREATE TABLE Ventas (
    IdVenta    INT          PRIMARY KEY IDENTITY,
    IdCliente  INT,
    IdProducto INT,
    Fecha      DATE,
    Total      DECIMAL(10,2),
    FOREIGN KEY (IdCliente)  REFERENCES Clientes(IdCliente),
    FOREIGN KEY (IdProducto) REFERENCES Productos(IdProducto)
);

-- ── 3. ROLES DE BASE DE DATOS ─────────────────────────────
IF DATABASE_PRINCIPAL_ID('Administrador')  IS NULL CREATE ROLE Administrador;
IF DATABASE_PRINCIPAL_ID('Analista')       IS NULL CREATE ROLE Analista;
IF DATABASE_PRINCIPAL_ID('UsuarioGeneral') IS NULL CREATE ROLE UsuarioGeneral;

-- ── 4. PERMISOS POR ROL ───────────────────────────────────
-- Administrador: control total
GRANT SELECT, INSERT, UPDATE, DELETE ON Clientes  TO Administrador;
GRANT SELECT, INSERT, UPDATE, DELETE ON Productos TO Administrador;
GRANT SELECT, INSERT, UPDATE, DELETE ON Ventas    TO Administrador;

-- Analista: solo lectura en todo
GRANT SELECT ON Clientes  TO Analista;
GRANT SELECT ON Productos TO Analista;
GRANT SELECT ON Ventas    TO Analista;

-- UsuarioGeneral: solo ver productos
GRANT SELECT ON Productos TO UsuarioGeneral;

-- ── 5. LOGINS Y USUARIOS ─────────────────────────────────
-- Logins de servidor (si no existen)
IF NOT EXISTS (SELECT name FROM sys.server_principals WHERE name = 'admin_user')
    CREATE LOGIN admin_user    WITH PASSWORD = 'Admin2026!',
        CHECK_POLICY = ON, CHECK_EXPIRATION = ON;

IF NOT EXISTS (SELECT name FROM sys.server_principals WHERE name = 'analista_user')
    CREATE LOGIN analista_user WITH PASSWORD = 'Analista2026!',
        CHECK_POLICY = ON, CHECK_EXPIRATION = ON;

IF NOT EXISTS (SELECT name FROM sys.server_principals WHERE name = 'usuario_user')
    CREATE LOGIN usuario_user  WITH PASSWORD = 'Usuario2026!',
        CHECK_POLICY = ON, CHECK_EXPIRATION = ON;

IF NOT EXISTS (SELECT name FROM sys.server_principals WHERE name = 'seguridad_user')
    CREATE LOGIN seguridad_user WITH PASSWORD = 'S3gur@2026!',
        CHECK_POLICY = ON, CHECK_EXPIRATION = ON;

-- Usuarios de base de datos
IF DATABASE_PRINCIPAL_ID('admin_user')    IS NULL CREATE USER admin_user    FOR LOGIN admin_user;
IF DATABASE_PRINCIPAL_ID('analista_user') IS NULL CREATE USER analista_user FOR LOGIN analista_user;
IF DATABASE_PRINCIPAL_ID('usuario_user')  IS NULL CREATE USER usuario_user  FOR LOGIN usuario_user;

-- Asignar usuarios a roles (FIX: esto faltaba en SQLQuery1.sql)
EXEC sp_addrolemember 'Administrador',  'admin_user';
EXEC sp_addrolemember 'Analista',       'analista_user';
EXEC sp_addrolemember 'UsuarioGeneral', 'usuario_user';

-- ── 6. TABLA DE AUDITORÍA ─────────────────────────────────
IF OBJECT_ID('AuditoriaAccesos', 'U') IS NULL
    CREATE TABLE AuditoriaAccesos (
        Id        INT          IDENTITY PRIMARY KEY,
        Usuario   NVARCHAR(100) NOT NULL,
        Fecha     DATETIME      DEFAULT GETDATE(),
        Accion    NVARCHAR(50)  NOT NULL,   -- INSERT / UPDATE / DELETE / SELECT
        Tabla     NVARCHAR(50)  NOT NULL,
        Detalle   NVARCHAR(500) NULL        -- JSON con valores antes/después
    );

-- ── 7. TRIGGER DE AUDITORÍA MEJORADO ──────────────────────
-- Registra INSERT, UPDATE y DELETE en Clientes con detalle
GO
CREATE OR ALTER TRIGGER trg_AuditoriaClientes
ON Clientes
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Usuario NVARCHAR(100) = SUSER_SNAME();
    DECLARE @Accion  NVARCHAR(50);
    DECLARE @Detalle NVARCHAR(500) = '';

    IF EXISTS (SELECT 1 FROM inserted) AND EXISTS (SELECT 1 FROM deleted)
    BEGIN
        SET @Accion = 'UPDATE';
        SELECT TOP 1 @Detalle = 'ID=' + CAST(i.IdCliente AS NVARCHAR) +
            ' | Antes: ' + ISNULL(d.Nombre,'') +
            ' | Después: ' + ISNULL(i.Nombre,'')
        FROM inserted i JOIN deleted d ON i.IdCliente = d.IdCliente;
    END
    ELSE IF EXISTS (SELECT 1 FROM inserted)
    BEGIN
        SET @Accion = 'INSERT';
        SELECT TOP 1 @Detalle = 'ID=' + CAST(IdCliente AS NVARCHAR) +
            ' | Nombre: ' + ISNULL(Nombre,'')
        FROM inserted;
    END
    ELSE
    BEGIN
        SET @Accion = 'DELETE';
        SELECT TOP 1 @Detalle = 'ID=' + CAST(IdCliente AS NVARCHAR) +
            ' | Nombre: ' + ISNULL(Nombre,'')
        FROM deleted;
    END

    INSERT INTO AuditoriaAccesos (Usuario, Accion, Tabla, Detalle)
    VALUES (@Usuario, @Accion, 'Clientes', @Detalle);
END;
GO

-- ── 8. DATOS DE PRUEBA ────────────────────────────────────
INSERT INTO Productos (Nombre, Precio) VALUES
    ('Crédito MES 12 meses', 0.00),
    ('Crédito Consumo 6 meses', 0.00),
    ('Cuenta de Ahorro Libre', 0.00);

INSERT INTO Clientes (Nombre, Email, Telefono, NivelAcceso) VALUES
    ('Juan Pérez',   'juan@empresa.com',   '987654321', 'Administrador'),
    ('Rosa García',  'rosa@empresa.com',   '991569844', 'Analista'),
    ('Pedro Huanca', 'pedro@empresa.com',  '956123456', 'UsuarioGeneral');

-- Verificar auditoría
SELECT * FROM AuditoriaAccesos;

-- ── 9. AUDITORÍA DE SERVIDOR (opcional, requiere permisos SA) ──
-- NOTA: solo ejecutar si tienes permisos de sysadmin
-- Crea la carpeta C:\AuditoriaSQL\ antes de ejecutar

/*
USE master;
IF NOT EXISTS (SELECT 1 FROM sys.server_audits WHERE name = 'AuditoriaGeneral')
BEGIN
    CREATE SERVER AUDIT AuditoriaGeneral
    TO FILE (FILEPATH = 'C:\AuditoriaSQL\', MAXSIZE = 100 MB);
    ALTER SERVER AUDIT AuditoriaGeneral WITH (STATE = ON);

    CREATE SERVER AUDIT SPECIFICATION AuditoriaLogin
    FOR SERVER AUDIT AuditoriaGeneral
    ADD (SUCCESSFUL_LOGIN_GROUP),
    ADD (FAILED_LOGIN_GROUP);
    ALTER SERVER AUDIT SPECIFICATION AuditoriaLogin WITH (STATE = ON);
END
*/

-- ── VERIFICACIÓN FINAL ────────────────────────────────────
SELECT 'Clientes'        AS tabla, COUNT(*) AS registros FROM Clientes  UNION ALL
SELECT 'Productos',                COUNT(*)               FROM Productos UNION ALL
SELECT 'AuditoriaAccesos',         COUNT(*)               FROM AuditoriaAccesos;

SELECT dp.name AS usuario, r.name AS rol
FROM sys.database_role_members m
JOIN sys.database_principals r ON m.role_principal_id = r.principal_id
JOIN sys.database_principals dp ON m.member_principal_id = dp.principal_id
ORDER BY r.name;

-- ============================================================
-- FIN — 01_seguridad_roles_auditoria.sql · CMAC Arequipa v9
-- ============================================================
