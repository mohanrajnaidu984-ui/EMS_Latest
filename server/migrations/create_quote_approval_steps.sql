-- QuoteApprovalSteps — sequential quote approval path and approval audit rows.
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name = 'QuoteApprovalSteps' AND xtype = 'U')
BEGIN
    CREATE TABLE [dbo].[QuoteApprovalSteps] (
        [ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [QuoteId] INT NULL,
        [DraftQuoteId] INT NULL,
        [RequestNo] NVARCHAR(50) NOT NULL,
        [LeadJobName] NVARCHAR(255) NULL,
        [OwnJob] NVARCHAR(255) NULL,
        [CustomerName] NVARCHAR(400) NULL,
        [QuoteNo] INT NULL,
        [RevisionNo] INT NULL,
        [QuoteRef] NVARCHAR(150) NULL,
        [QuoteNumber] NVARCHAR(150) NULL,
        [ApproverEmail] NVARCHAR(320) NULL,
        [ApproverName] NVARCHAR(255) NOT NULL,
        [ApproverDesignation] NVARCHAR(255) NULL,
        [ApproverSequence] INT NOT NULL,
        [Status] NVARCHAR(20) NOT NULL CONSTRAINT DF_QuoteApprovalSteps_Status DEFAULT ('Pending'),
        [ApprovedAt] DATETIME2 NULL,
        [ApproverDigitalSignatureJson] NVARCHAR(MAX) NULL,
        [WorkflowNo] NVARCHAR(50) NULL,
        [CreatedByEmail] NVARCHAR(320) NULL,
        [CreatedByName] NVARCHAR(255) NULL,
        [CreatedByCompanyName] NVARCHAR(255) NULL,
        [CreatedByDivisionName] NVARCHAR(255) NULL,
        [Comments] NVARCHAR(MAX) NULL,
        [CreatedAt] DATETIME2 NOT NULL CONSTRAINT DF_QuoteApprovalSteps_CreatedAt DEFAULT (SYSUTCDATETIME()),
        [UpdatedAt] DATETIME2 NOT NULL CONSTRAINT DF_QuoteApprovalSteps_UpdatedAt DEFAULT (SYSUTCDATETIME())
    );
    PRINT 'QuoteApprovalSteps table created';
END
ELSE
    PRINT 'QuoteApprovalSteps already exists';

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_QuoteApprovalSteps_QuoteId')
    CREATE INDEX IX_QuoteApprovalSteps_QuoteId ON dbo.QuoteApprovalSteps(QuoteId);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_QuoteApprovalSteps_DraftQuoteId')
    CREATE INDEX IX_QuoteApprovalSteps_DraftQuoteId ON dbo.QuoteApprovalSteps(DraftQuoteId);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_QuoteApprovalSteps_Scope')
    CREATE INDEX IX_QuoteApprovalSteps_Scope ON dbo.QuoteApprovalSteps(RequestNo, LeadJobName, CustomerName, OwnJob);
