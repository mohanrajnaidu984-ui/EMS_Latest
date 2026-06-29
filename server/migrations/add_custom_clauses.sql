-- Add CustomClauses column to EnquiryQuotes table
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('EnquiryQuotes') AND name = 'CustomClauses')
BEGIN
    ALTER TABLE EnquiryQuotes
    ADD CustomClauses NVARCHAR(MAX);
    PRINT 'CustomClauses column added to EnquiryQuotes table';
END
ELSE
BEGIN
    PRINT 'CustomClauses column already exists';
END
