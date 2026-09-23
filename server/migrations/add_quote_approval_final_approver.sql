-- Final approver flag for parallel quote approval (commit gate).
IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.QuoteApprovalHierarchyStep')
      AND name = N'IsFinalApprover'
)
BEGIN
    ALTER TABLE dbo.QuoteApprovalHierarchyStep ADD IsFinalApprover BIT NOT NULL
        CONSTRAINT DF_QuoteApprovalHierarchyStep_IsFinalApprover DEFAULT (0);
    PRINT 'QuoteApprovalHierarchyStep.IsFinalApprover column added';
END
ELSE
    PRINT 'QuoteApprovalHierarchyStep.IsFinalApprover already exists';

IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.QuoteApprovalSteps')
      AND name = N'IsFinalApprover'
)
BEGIN
    ALTER TABLE dbo.QuoteApprovalSteps ADD IsFinalApprover BIT NOT NULL
        CONSTRAINT DF_QuoteApprovalSteps_IsFinalApprover DEFAULT (0);
    PRINT 'QuoteApprovalSteps.IsFinalApprover column added';
END
ELSE
    PRINT 'QuoteApprovalSteps.IsFinalApprover already exists';
