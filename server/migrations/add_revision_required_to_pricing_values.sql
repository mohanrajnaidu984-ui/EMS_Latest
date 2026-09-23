-- Revision-required flag per EnquiryPricingValues row (Yes or NULL).
IF COL_LENGTH('dbo.EnquiryPricingValues', 'RevisionRequired') IS NULL
BEGIN
    ALTER TABLE dbo.EnquiryPricingValues
    ADD RevisionRequired NVARCHAR(8) NULL;
    PRINT 'Added RevisionRequired column to EnquiryPricingValues';
END
ELSE
    PRINT 'RevisionRequired column already exists on EnquiryPricingValues';
GO
