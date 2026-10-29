-- Approval mode per hierarchy and per running workflow: 'parallel' or 'sequential' (NULL = division default).
IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.QuoteApprovalHierarchy')
      AND name = N'ApprovalMode'
)
BEGIN
    ALTER TABLE dbo.QuoteApprovalHierarchy ADD ApprovalMode NVARCHAR(20) NULL;
    PRINT 'QuoteApprovalHierarchy.ApprovalMode column added';
END
ELSE
    PRINT 'QuoteApprovalHierarchy.ApprovalMode already exists';

IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.QuoteApprovalSteps')
      AND name = N'ApprovalMode'
)
BEGIN
    ALTER TABLE dbo.QuoteApprovalSteps ADD ApprovalMode NVARCHAR(20) NULL;
    PRINT 'QuoteApprovalSteps.ApprovalMode column added';
END
ELSE
    PRINT 'QuoteApprovalSteps.ApprovalMode already exists';
