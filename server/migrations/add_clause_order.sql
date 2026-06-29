-- Add ClauseOrder column to EnquiryQuotes table
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('EnquiryQuotes') AND name = 'ClauseOrder')
BEGIN
    ALTER TABLE EnquiryQuotes
    ADD ClauseOrder NVARCHAR(MAX);
    PRINT 'ClauseOrder column added to EnquiryQuotes table';
END
ELSE
BEGIN
    PRINT 'ClauseOrder column already exists';
END
