-- Workflow identity + creator snapshot for approval emails.
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.QuoteApprovalSteps') AND name = 'WorkflowNo'
)
BEGIN
    ALTER TABLE dbo.QuoteApprovalSteps ADD WorkflowNo NVARCHAR(50) NULL;
    PRINT 'QuoteApprovalSteps.WorkflowNo column added';
END
ELSE PRINT 'QuoteApprovalSteps.WorkflowNo already exists';

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.QuoteApprovalSteps') AND name = 'CreatedByName'
)
BEGIN
    ALTER TABLE dbo.QuoteApprovalSteps ADD CreatedByName NVARCHAR(255) NULL;
    PRINT 'QuoteApprovalSteps.CreatedByName column added';
END
ELSE PRINT 'QuoteApprovalSteps.CreatedByName already exists';

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.QuoteApprovalSteps') AND name = 'CreatedByCompanyName'
)
BEGIN
    ALTER TABLE dbo.QuoteApprovalSteps ADD CreatedByCompanyName NVARCHAR(255) NULL;
    PRINT 'QuoteApprovalSteps.CreatedByCompanyName column added';
END
ELSE PRINT 'QuoteApprovalSteps.CreatedByCompanyName already exists';

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.QuoteApprovalSteps') AND name = 'CreatedByDivisionName'
)
BEGIN
    ALTER TABLE dbo.QuoteApprovalSteps ADD CreatedByDivisionName NVARCHAR(255) NULL;
    PRINT 'QuoteApprovalSteps.CreatedByDivisionName column added';
END
ELSE PRINT 'QuoteApprovalSteps.CreatedByDivisionName already exists';

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_QuoteApprovalSteps_WorkflowNo')
    CREATE INDEX IX_QuoteApprovalSteps_WorkflowNo ON dbo.QuoteApprovalSteps(WorkflowNo);
