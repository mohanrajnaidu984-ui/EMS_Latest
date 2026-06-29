IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='EnquiryQuotes' and xtype='U')
BEGIN
    CREATE TABLE EnquiryQuotes (
        ID INT IDENTITY(1,1) PRIMARY KEY,
        RequestNo NVARCHAR(50),
        QuoteNumber NVARCHAR(100),
        QuoteNo INT,
        RevisionNo INT,
        ValidityDays INT DEFAULT 30,
        PreparedBy NVARCHAR(100),
        PreparedByEmail NVARCHAR(100),
        
        ShowScopeOfWork BIT DEFAULT 1,
        ShowBasisOfOffer BIT DEFAULT 1,
        ShowExclusions BIT DEFAULT 1,
        ShowPricingTerms BIT DEFAULT 1,
        ShowSchedule BIT DEFAULT 1,
        ShowWarranty BIT DEFAULT 1,
        ShowResponsibilityMatrix BIT DEFAULT 1,
        ShowTermsConditions BIT DEFAULT 1,
        ShowAcceptance BIT DEFAULT 1,
        ShowBillOfQuantity BIT DEFAULT 1,
        
        ScopeOfWork NVARCHAR(MAX),
        BasisOfOffer NVARCHAR(MAX),
        Exclusions NVARCHAR(MAX),
        PricingTerms NVARCHAR(MAX),
        Schedule NVARCHAR(MAX),
        Warranty NVARCHAR(MAX),
        ResponsibilityMatrix NVARCHAR(MAX),
        TermsConditions NVARCHAR(MAX),
        Acceptance NVARCHAR(MAX),
        BillOfQuantity NVARCHAR(MAX),
        
        TotalAmount DECIMAL(18, 3),
        Status NVARCHAR(50) DEFAULT 'Draft',
        CustomClauses NVARCHAR(MAX),
        ClauseOrder NVARCHAR(MAX),
        
        QuoteDate DATETIME,
        CustomerReference NVARCHAR(100),
        Subject NVARCHAR(255),
        Signatory NVARCHAR(100),
        SignatoryDesignation NVARCHAR(100),
        ToName NVARCHAR(100),
        ToAddress NVARCHAR(MAX),
        ToPhone NVARCHAR(50),
        ToEmail NVARCHAR(100),
        
        CreatedAt DATETIME DEFAULT GETDATE(),
        UpdatedAt DATETIME DEFAULT GETDATE()
    );
    PRINT 'Table EnquiryQuotes created.';
END
ELSE
BEGIN
    PRINT 'Table EnquiryQuotes already exists.';
END

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='QuoteTemplates' and xtype='U')
BEGIN
    CREATE TABLE QuoteTemplates (
        ID INT IDENTITY(1,1) PRIMARY KEY,
        TemplateName NVARCHAR(100) UNIQUE,
        ClausesConfig NVARCHAR(MAX),
        CreatedBy NVARCHAR(100),
        CreatedAt DATETIME DEFAULT GETDATE()
    );
    PRINT 'Table QuoteTemplates created.';
END
ELSE
BEGIN
    PRINT 'Table QuoteTemplates already exists.';
END
