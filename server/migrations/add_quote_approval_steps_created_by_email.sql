-- Add CreatedByEmail column to QuoteApprovalSteps (user who sent for approval).
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.QuoteApprovalSteps')
      AND name = 'CreatedByEmail'
)
BEGIN
    ALTER TABLE dbo.QuoteApprovalSteps ADD CreatedByEmail NVARCHAR(320) NULL;
    PRINT 'QuoteApprovalSteps.CreatedByEmail column added';
END
ELSE
    PRINT 'QuoteApprovalSteps.CreatedByEmail already exists';
