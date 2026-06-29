IF OBJECT_ID('[dbo].[EnquiryPricingOptions]', 'U') IS NOT NULL
DROP TABLE [dbo].[EnquiryPricingOptions];
GO

CREATE TABLE [dbo].[EnquiryPricingOptions] (
    [ID] INT NOT NULL IDENTITY(1,1),
    [RequestNo] NVARCHAR(50) NOT NULL,
    [OptionName] NVARCHAR(255) NOT NULL,
    [SortOrder] INT DEFAULT 0,
    [ItemName] NVARCHAR(255) NULL,
    [CustomerName] NVARCHAR(255) NULL,
    [LeadJobName] NVARCHAR(255) NULL,
    [CreatedAt] DATETIME DEFAULT GETDATE(),
    PRIMARY KEY ([ID])
);
GO

IF OBJECT_ID('[dbo].[EnquiryPricingValues]', 'U') IS NOT NULL
DROP TABLE [dbo].[EnquiryPricingValues];
GO

CREATE TABLE [dbo].[EnquiryPricingValues] (
    [ID] INT NOT NULL IDENTITY(1,1),
    [RequestNo] NVARCHAR(50) NOT NULL,
    [OptionID] INT NOT NULL,
    [EnquiryForItem] NVARCHAR(255) NULL,
    [EnquiryForID] INT NULL,
    [Price] DECIMAL(18,2) DEFAULT 0,
    [UpdatedBy] NVARCHAR(100),
    [UpdatedAt] DATETIME DEFAULT GETDATE(),
    [CustomerName] NVARCHAR(255) NULL,
    [LeadJobName] NVARCHAR(255) NULL,
    PRIMARY KEY ([ID])
);
GO

CREATE INDEX IX_PricingValues_RequestNo ON EnquiryPricingValues(RequestNo);
GO
CREATE INDEX IX_PricingOptions_RequestNo ON EnquiryPricingOptions(RequestNo);
GO
