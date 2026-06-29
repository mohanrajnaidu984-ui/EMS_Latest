-- Approval workflow JSON on saved quotes and collaborative drafts.
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.EnquiryQuotes') AND name = N'ApprovalWorkflowJson'
)
BEGIN
    ALTER TABLE dbo.EnquiryQuotes ADD ApprovalWorkflowJson NVARCHAR(MAX) NULL;
    PRINT 'ApprovalWorkflowJson added to EnquiryQuotes';
END
ELSE
    PRINT 'ApprovalWorkflowJson already exists on EnquiryQuotes';

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.EnquiryQuotesDraft') AND name = N'ApprovalWorkflowJson'
)
BEGIN
    ALTER TABLE dbo.EnquiryQuotesDraft ADD ApprovalWorkflowJson NVARCHAR(MAX) NULL;
    PRINT 'ApprovalWorkflowJson added to EnquiryQuotesDraft';
END
ELSE
    PRINT 'ApprovalWorkflowJson already exists on EnquiryQuotesDraft';
