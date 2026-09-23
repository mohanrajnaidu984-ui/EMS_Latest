-- Widen denormalized comma-joined list fields on EnquiryMaster.
-- Fixes: "String or binary data would be truncated" when adding many customers
-- (e.g. enquiry 996 with 8+ long company names). There is NO app limit of 8.

IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'EnquiryMaster' AND COLUMN_NAME = 'CustomerName'
      AND CHARACTER_MAXIMUM_LENGTH > 0 AND CHARACTER_MAXIMUM_LENGTH < 4000
)
    ALTER TABLE EnquiryMaster ALTER COLUMN CustomerName NVARCHAR(MAX) NULL;

IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'EnquiryMaster' AND COLUMN_NAME = 'ReceivedFrom'
      AND CHARACTER_MAXIMUM_LENGTH > 0 AND CHARACTER_MAXIMUM_LENGTH < 4000
)
    ALTER TABLE EnquiryMaster ALTER COLUMN ReceivedFrom NVARCHAR(MAX) NULL;

IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'EnquiryMaster' AND COLUMN_NAME = 'ConsultantName'
      AND CHARACTER_MAXIMUM_LENGTH > 0 AND CHARACTER_MAXIMUM_LENGTH < 4000
)
    ALTER TABLE EnquiryMaster ALTER COLUMN ConsultantName NVARCHAR(MAX) NULL;
