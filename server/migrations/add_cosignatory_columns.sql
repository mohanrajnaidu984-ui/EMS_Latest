-- Co-signatory fields on quote header (left panel).
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.EnquiryQuotes') AND name = N'CoSignatory'
)
BEGIN
    ALTER TABLE dbo.EnquiryQuotes ADD CoSignatory NVARCHAR(255) NULL;
    PRINT 'CoSignatory added to EnquiryQuotes';
END
ELSE
    PRINT 'CoSignatory already exists on EnquiryQuotes';

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.EnquiryQuotes') AND name = N'CoSignatoryDesignation'
)
BEGIN
    ALTER TABLE dbo.EnquiryQuotes ADD CoSignatoryDesignation NVARCHAR(255) NULL;
    PRINT 'CoSignatoryDesignation added to EnquiryQuotes';
END
ELSE
    PRINT 'CoSignatoryDesignation already exists on EnquiryQuotes';
