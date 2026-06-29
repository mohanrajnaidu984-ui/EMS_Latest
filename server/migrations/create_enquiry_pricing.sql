-- Pricing Module Database Migration Script
-- Creates tables for dynamic N×M pricing grid

-- Options table (row headers - dynamic number of pricing options)
IF OBJECT_ID('[dbo].[EnquiryPricingOptions]', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[EnquiryPricingOptions] (
        [ID] INT NOT NULL IDENTITY(1,1),
        [RequestNo] NVARCHAR(50) NOT NULL,
        [OptionName] NVARCHAR(255) NOT NULL,
        [SortOrder] INT DEFAULT 0,
        [CreatedAt] DATETIME DEFAULT GETDATE(),
        PRIMARY KEY ([ID])
    );
    PRINT 'Created EnquiryPricingOptions table';
END
ELSE
    PRINT 'EnquiryPricingOptions table already exists';
GO

-- Values table (grid cells - stores price for each option × job combination)
IF OBJECT_ID('[dbo].[EnquiryPricingValues]', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[EnquiryPricingValues] (
        [ID] INT NOT NULL IDENTITY(1,1),
        [RequestNo] NVARCHAR(50) NOT NULL,
        [OptionID] INT NOT NULL,
        [EnquiryForItem] NVARCHAR(255) NOT NULL,
        [Price] DECIMAL(18,2) DEFAULT 0,
        [UpdatedBy] NVARCHAR(100),
        [UpdatedAt] DATETIME DEFAULT GETDATE(),
        PRIMARY KEY ([ID])
    );
    PRINT 'Created EnquiryPricingValues table';
END
ELSE
    PRINT 'EnquiryPricingValues table already exists';
GO

-- Create index for faster lookups
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PricingValues_RequestNo')
BEGIN
    CREATE INDEX IX_PricingValues_RequestNo ON EnquiryPricingValues(RequestNo);
    PRINT 'Created index IX_PricingValues_RequestNo';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PricingOptions_RequestNo')
BEGIN
    CREATE INDEX IX_PricingOptions_RequestNo ON EnquiryPricingOptions(RequestNo);
    PRINT 'Created index IX_PricingOptions_RequestNo';
END
GO

PRINT 'Pricing module migration complete';
