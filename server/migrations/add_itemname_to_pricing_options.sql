IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[EnquiryPricingOptions]') 
    AND name = 'ItemName'
)
BEGIN
    ALTER TABLE [dbo].[EnquiryPricingOptions]
    ADD [ItemName] NVARCHAR(255) NULL;
    
    PRINT 'Added ItemName column to EnquiryPricingOptions table';
END
ELSE
BEGIN
    PRINT 'ItemName column already exists in EnquiryPricingOptions table';
END
GO
