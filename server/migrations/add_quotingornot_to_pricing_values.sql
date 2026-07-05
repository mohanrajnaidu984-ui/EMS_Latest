-- Decline-to-quote flag per EnquiryPricingValues row (Yes / No).
IF COL_LENGTH('dbo.EnquiryPricingValues', 'Quotingornot') IS NULL
BEGIN
    ALTER TABLE dbo.EnquiryPricingValues
    ADD Quotingornot NVARCHAR(8) NOT NULL
        CONSTRAINT DF_EnquiryPricingValues_Quotingornot DEFAULT N'No';
    PRINT 'Added Quotingornot column to EnquiryPricingValues';
END
ELSE
    PRINT 'Quotingornot column already exists on EnquiryPricingValues';
GO
