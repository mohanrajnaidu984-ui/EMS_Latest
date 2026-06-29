-- Add CustomerName column to EnquiryPricingOptions if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[EnquiryPricingOptions]') AND name = 'CustomerName')
BEGIN
    ALTER TABLE [dbo].[EnquiryPricingOptions] ADD [CustomerName] NVARCHAR(255) NULL;
    PRINT 'Added CustomerName column to EnquiryPricingOptions table';
END

-- Add CustomerName column to EnquiryPricingValues if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[EnquiryPricingValues]') AND name = 'CustomerName')
BEGIN
    ALTER TABLE [dbo].[EnquiryPricingValues] ADD [CustomerName] NVARCHAR(255) NULL;
    PRINT 'Added CustomerName column to EnquiryPricingValues table';
END

-- Backfill data: Update existing records with CustomerName from EnquiryMaster
-- For Options
UPDATE opt
SET opt.CustomerName = em.CustomerName
FROM [dbo].[EnquiryPricingOptions] opt
INNER JOIN [dbo].[EnquiryMaster] em ON opt.RequestNo = em.RequestNo
WHERE opt.CustomerName IS NULL;

PRINT 'Backfilled CustomerName in EnquiryPricingOptions';

-- For Values
UPDATE val
SET val.CustomerName = em.CustomerName
FROM [dbo].[EnquiryPricingValues] val
INNER JOIN [dbo].[EnquiryMaster] em ON val.RequestNo = em.RequestNo
WHERE val.CustomerName IS NULL;

PRINT 'Backfilled CustomerName in EnquiryPricingValues';

-- Add Index for performance
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PricingOptions_CustomerName')
BEGIN
    CREATE INDEX IX_PricingOptions_CustomerName ON EnquiryPricingOptions(CustomerName);
    PRINT 'Created index IX_PricingOptions_CustomerName';
END
