-- Per-division accountable SE on enquiries (optional columns; server detects at runtime).
IF COL_LENGTH('dbo.ConcernedSE', 'LeadJobCode') IS NULL
BEGIN
    ALTER TABLE dbo.ConcernedSE ADD LeadJobCode NVARCHAR(20) NULL;
    PRINT 'LeadJobCode added to ConcernedSE';
END

IF COL_LENGTH('dbo.ConcernedSE', 'Accountability') IS NULL
BEGIN
    ALTER TABLE dbo.ConcernedSE ADD Accountability NVARCHAR(10) NULL;
    PRINT 'Accountability added to ConcernedSE';
END

IF COL_LENGTH('dbo.ConcernedSE', 'ownjob') IS NULL
BEGIN
    ALTER TABLE dbo.ConcernedSE ADD ownjob NVARCHAR(255) NULL;
    PRINT 'ownjob added to ConcernedSE';
END
