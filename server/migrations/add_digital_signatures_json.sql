-- Per-revision digital signature stamps (JSON array), persisted with EnquiryQuotes.
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.EnquiryQuotes') AND name = N'DigitalSignaturesJson'
)
BEGIN
    ALTER TABLE dbo.EnquiryQuotes ADD DigitalSignaturesJson NVARCHAR(MAX) NULL;
    PRINT 'DigitalSignaturesJson added to EnquiryQuotes';
END
ELSE
    PRINT 'DigitalSignaturesJson already exists on EnquiryQuotes';
