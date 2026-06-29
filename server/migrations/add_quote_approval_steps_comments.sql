-- Add Comments column to QuoteApprovalSteps for approval/rejection notes.
IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.QuoteApprovalSteps')
      AND name = N'Comments'
)
BEGIN
    ALTER TABLE dbo.QuoteApprovalSteps ADD Comments NVARCHAR(MAX) NULL;
    PRINT 'QuoteApprovalSteps.Comments column added';
END
ELSE
    PRINT 'QuoteApprovalSteps.Comments already exists';
