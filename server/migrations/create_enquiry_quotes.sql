-- Quote Module Database Schema
-- Run this to create the EnquiryQuotes table

-- Table: EnquiryQuotes - Stores saved quotes with their clauses and content
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='EnquiryQuotes' AND xtype='U')
CREATE TABLE [dbo].[EnquiryQuotes] (
    [ID] INT NOT NULL IDENTITY(1,1),
    [RequestNo] NVARCHAR(50) NOT NULL,
    [QuoteNumber] NVARCHAR(100) NOT NULL, -- Format: AAC/{EnquiryNo}/{QuoteNo}-R{RevNo}
    [QuoteNo] INT NOT NULL DEFAULT 1, -- Sequential quote number per enquiry
    [RevisionNo] INT NOT NULL DEFAULT 0, -- Revision number (R0, R1, R2...)
    [QuoteDate] DATE DEFAULT GETDATE(),
    [ValidityDays] INT DEFAULT 30,
    [PreparedBy] NVARCHAR(100),
    [PreparedByEmail] NVARCHAR(255),
    
    -- Clause visibility toggles
    [ShowScopeOfWork] BIT DEFAULT 1,
    [ShowBasisOfOffer] BIT DEFAULT 1,
    [ShowExclusions] BIT DEFAULT 1,
    [ShowPricingTerms] BIT DEFAULT 1,
    [ShowSchedule] BIT DEFAULT 1,
    [ShowWarranty] BIT DEFAULT 1,
    [ShowResponsibilityMatrix] BIT DEFAULT 1,
    [ShowTermsConditions] BIT DEFAULT 1,
    [ShowAcceptance] BIT DEFAULT 1,
    
    -- Clause content (JSON or text for each clause)
    [ScopeOfWork] NVARCHAR(MAX),
    [BasisOfOffer] NVARCHAR(MAX),
    [Exclusions] NVARCHAR(MAX),
    [PricingTerms] NVARCHAR(MAX),
    [Schedule] NVARCHAR(MAX),
    [Warranty] NVARCHAR(MAX),
    [ResponsibilityMatrix] NVARCHAR(MAX),
    [TermsConditions] NVARCHAR(MAX),
    [Acceptance] NVARCHAR(MAX),
    
    -- Additional fields
    [TotalAmount] DECIMAL(18,2),
    [Status] NVARCHAR(50) DEFAULT 'Draft', -- Draft, Sent, Accepted, Rejected
    [CreatedAt] DATETIME DEFAULT GETDATE(),
    [UpdatedAt] DATETIME DEFAULT GETDATE(),
    
    PRIMARY KEY ([ID])
);

-- Create index for faster lookups
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_EnquiryQuotes_RequestNo')
CREATE INDEX IX_EnquiryQuotes_RequestNo ON EnquiryQuotes(RequestNo);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_EnquiryQuotes_QuoteNumber')
CREATE INDEX IX_EnquiryQuotes_QuoteNumber ON EnquiryQuotes(QuoteNumber);

PRINT 'EnquiryQuotes table created successfully';
