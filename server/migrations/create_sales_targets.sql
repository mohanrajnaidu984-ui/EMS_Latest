IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SalesTargets' AND xtype='U')
BEGIN
    CREATE TABLE SalesTargets (
        ID INT IDENTITY(1,1) PRIMARY KEY,
        FinancialYear INT NOT NULL, -- e.g., 2026
        Quarter NVARCHAR(2) NOT NULL, -- 'Q1', 'Q2', 'Q3', 'Q4'
        Division NVARCHAR(100) NOT NULL,
        ItemName NVARCHAR(200) NOT NULL,
        SalesEngineer NVARCHAR(200) NOT NULL, -- Store FullName for display/joining
        TargetValue DECIMAL(18, 2) DEFAULT 0,
        CreatedBy NVARCHAR(100), -- Manager Email
        CreatedAt DATETIME DEFAULT GETDATE(),
        UpdatedAt DATETIME DEFAULT GETDATE()
    );
END
