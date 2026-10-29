-- Per-sheet page orientations (JSON map of 0-based sheet index → "landscape").
-- Cover page (index 0) stays portrait; client never stores landscape for it.
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.EnquiryQuotes') AND name = N'PageOrientationsJson'
)
BEGIN
    ALTER TABLE dbo.EnquiryQuotes ADD PageOrientationsJson NVARCHAR(MAX) NULL;
    PRINT 'PageOrientationsJson added to EnquiryQuotes';
END
ELSE
    PRINT 'PageOrientationsJson already exists on EnquiryQuotes';

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.EnquiryQuotesDraft') AND name = N'PageOrientationsJson'
)
BEGIN
    ALTER TABLE dbo.EnquiryQuotesDraft ADD PageOrientationsJson NVARCHAR(MAX) NULL;
    PRINT 'PageOrientationsJson added to EnquiryQuotesDraft';
END
ELSE
    PRINT 'PageOrientationsJson already exists on EnquiryQuotesDraft';
