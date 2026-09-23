-- Correction requests raised by approvers during quote approval (history + audit).
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name = 'QuoteApprovalCorrections' AND xtype = 'U')
BEGIN
    CREATE TABLE [dbo].[QuoteApprovalCorrections] (
        [ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [QuoteId] INT NULL,
        [DraftQuoteId] INT NULL,
        [RequestNo] NVARCHAR(50) NOT NULL,
        [Reason] NVARCHAR(MAX) NOT NULL,
        [RequestedByEmail] NVARCHAR(320) NOT NULL,
        [RequestedByName] NVARCHAR(255) NULL,
        [RequestedByDesignation] NVARCHAR(255) NULL,
        [WorkflowNo] NVARCHAR(50) NULL,
        [CreatedAt] DATETIME2 NOT NULL CONSTRAINT DF_QuoteApprovalCorrections_CreatedAt DEFAULT (SYSUTCDATETIME())
    );
    PRINT 'QuoteApprovalCorrections table created';
END
ELSE
    PRINT 'QuoteApprovalCorrections already exists';

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_QuoteApprovalCorrections_DraftQuoteId')
    CREATE INDEX IX_QuoteApprovalCorrections_DraftQuoteId ON dbo.QuoteApprovalCorrections(DraftQuoteId);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_QuoteApprovalCorrections_QuoteId')
    CREATE INDEX IX_QuoteApprovalCorrections_QuoteId ON dbo.QuoteApprovalCorrections(QuoteId);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_QuoteApprovalCorrections_RequestNo')
    CREATE INDEX IX_QuoteApprovalCorrections_RequestNo ON dbo.QuoteApprovalCorrections(RequestNo);
