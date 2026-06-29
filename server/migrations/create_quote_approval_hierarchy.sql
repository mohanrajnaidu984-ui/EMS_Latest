-- Saved approval hierarchies (named approver sequences per user).
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name = 'QuoteApprovalHierarchy' AND xtype = 'U')
BEGIN
    CREATE TABLE [dbo].[QuoteApprovalHierarchy] (
        [ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [HierarchyName] NVARCHAR(200) NOT NULL,
        [OwnerEmail] NVARCHAR(320) NOT NULL,
        [CreatedAt] DATETIME2 NOT NULL CONSTRAINT DF_QuoteApprovalHierarchy_CreatedAt DEFAULT (SYSUTCDATETIME()),
        [UpdatedAt] DATETIME2 NOT NULL CONSTRAINT DF_QuoteApprovalHierarchy_UpdatedAt DEFAULT (SYSUTCDATETIME())
    );
    PRINT 'QuoteApprovalHierarchy table created';
END
ELSE
    PRINT 'QuoteApprovalHierarchy already exists';

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name = 'QuoteApprovalHierarchyStep' AND xtype = 'U')
BEGIN
    CREATE TABLE [dbo].[QuoteApprovalHierarchyStep] (
        [ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [HierarchyId] INT NOT NULL,
        [ApproverSequence] INT NOT NULL,
        [ApproverEmail] NVARCHAR(320) NULL,
        [ApproverName] NVARCHAR(255) NOT NULL,
        [ApproverDesignation] NVARCHAR(255) NULL,
        CONSTRAINT FK_QuoteApprovalHierarchyStep_Hierarchy
            FOREIGN KEY (HierarchyId) REFERENCES dbo.QuoteApprovalHierarchy(ID) ON DELETE CASCADE
    );
    PRINT 'QuoteApprovalHierarchyStep table created';
END
ELSE
    PRINT 'QuoteApprovalHierarchyStep already exists';

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_QuoteApprovalHierarchy_OwnerEmail')
    CREATE INDEX IX_QuoteApprovalHierarchy_OwnerEmail ON dbo.QuoteApprovalHierarchy(OwnerEmail);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'UQ_QuoteApprovalHierarchy_Owner_Name')
    CREATE UNIQUE INDEX UQ_QuoteApprovalHierarchy_Owner_Name
        ON dbo.QuoteApprovalHierarchy(OwnerEmail, HierarchyName);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_QuoteApprovalHierarchyStep_HierarchyId')
    CREATE INDEX IX_QuoteApprovalHierarchyStep_HierarchyId ON dbo.QuoteApprovalHierarchyStep(HierarchyId);
