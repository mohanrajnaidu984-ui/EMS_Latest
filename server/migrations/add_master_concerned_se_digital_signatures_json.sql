-- Per-user digital signature library (drawn/uploaded images), keyed by Master_ConcernedSE.EmailId.
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.Master_ConcernedSE') AND name = N'DigitalSignaturesJson'
)
BEGIN
    ALTER TABLE dbo.Master_ConcernedSE ADD DigitalSignaturesJson NVARCHAR(MAX) NULL;
    PRINT 'DigitalSignaturesJson added to Master_ConcernedSE';
END
ELSE
    PRINT 'DigitalSignaturesJson already exists on Master_ConcernedSE';
