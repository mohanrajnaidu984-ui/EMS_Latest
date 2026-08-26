-- EnquiryQuotesDraft — same shape as EnquiryQuotes for in-progress quote drafts.
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name = 'EnquiryQuotesDraft' AND xtype = 'U')
BEGIN
    CREATE TABLE [dbo].[EnquiryQuotesDraft] (
        [ID] INT NOT NULL IDENTITY(1,1),
        [RequestNo] NVARCHAR(50) NOT NULL,
        [QuoteNumber] NVARCHAR(100) NOT NULL,
        [QuoteNo] INT NOT NULL DEFAULT 0,
        [RevisionNo] INT NOT NULL DEFAULT 0,
        [QuoteDate] DATE NULL,
        [ValidityDays] INT NULL DEFAULT 30,
        [PreparedBy] NVARCHAR(255) NULL,
        [PreparedByEmail] NVARCHAR(255) NULL,
        [ShowScopeOfWork] BIT NULL DEFAULT 1,
        [ShowBasisOfOffer] BIT NULL DEFAULT 1,
        [ShowExclusions] BIT NULL DEFAULT 1,
        [ShowPricingTerms] BIT NULL DEFAULT 1,
        [ShowSchedule] BIT NULL DEFAULT 1,
        [ShowWarranty] BIT NULL DEFAULT 1,
        [ShowResponsibilityMatrix] BIT NULL DEFAULT 1,
        [ShowTermsConditions] BIT NULL DEFAULT 1,
        [ShowAcceptance] BIT NULL DEFAULT 1,
        [ShowBillOfQuantity] BIT NULL DEFAULT 0,
        [ScopeOfWork] NVARCHAR(MAX) NULL,
        [BasisOfOffer] NVARCHAR(MAX) NULL,
        [Exclusions] NVARCHAR(MAX) NULL,
        [PricingTerms] NVARCHAR(MAX) NULL,
        [Schedule] NVARCHAR(MAX) NULL,
        [Warranty] NVARCHAR(MAX) NULL,
        [ResponsibilityMatrix] NVARCHAR(MAX) NULL,
        [TermsConditions] NVARCHAR(MAX) NULL,
        [Acceptance] NVARCHAR(MAX) NULL,
        [BillOfQuantity] NVARCHAR(MAX) NULL,
        [TotalAmount] DECIMAL(18,2) NULL,
        [Status] NVARCHAR(50) NULL DEFAULT 'Draft',
        [CustomClauses] NVARCHAR(MAX) NULL,
        [ClauseOrder] NVARCHAR(MAX) NULL,
        [DigitalSignaturesJson] NVARCHAR(MAX) NULL,
        [CustomerReference] NVARCHAR(255) NULL,
        [YourRef] NVARCHAR(255) NULL,
        [QuoteType] NVARCHAR(500) NULL,
        [Subject] NVARCHAR(500) NULL,
        [Signatory] NVARCHAR(255) NULL,
        [SignatoryDesignation] NVARCHAR(255) NULL,
        [CoSignatory] NVARCHAR(255) NULL,
        [CoSignatoryDesignation] NVARCHAR(255) NULL,
        [ToName] NVARCHAR(4000) NULL,
        [ToAddress] NVARCHAR(MAX) NULL,
        [ToPhone] NVARCHAR(100) NULL,
        [ToEmail] NVARCHAR(255) NULL,
        [ToFax] NVARCHAR(100) NULL,
        [ToAttention] NVARCHAR(255) NULL,
        [LeadJob] NVARCHAR(255) NULL,
        [OwnJob] NVARCHAR(255) NULL,
        [CreatedAt] DATETIME NULL DEFAULT GETDATE(),
        [UpdatedAt] DATETIME NULL DEFAULT GETDATE(),
        PRIMARY KEY ([ID])
    );
    PRINT 'EnquiryQuotesDraft table created';
END
ELSE
    PRINT 'EnquiryQuotesDraft already exists';

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_EnquiryQuotesDraft_RequestNo')
    CREATE INDEX IX_EnquiryQuotesDraft_RequestNo ON dbo.EnquiryQuotesDraft(RequestNo);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_EnquiryQuotesDraft_Scope')
    CREATE INDEX IX_EnquiryQuotesDraft_Scope ON dbo.EnquiryQuotesDraft(RequestNo, LeadJob, ToName, OwnJob, PreparedByEmail);
