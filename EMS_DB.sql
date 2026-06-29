-- =============================================
-- EMS_DB File Structure
-- Based on Enquiry Form UI Requirements
-- =============================================

-- ---------------------------------------------
-- 1. MASTER TABLE (Holds all single-value enquiry details)
-- ---------------------------------------------
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='EnquiryMaster' AND xtype='U')
CREATE TABLE EnquiryMaster (
    RequestNo NVARCHAR(50) PRIMARY KEY, -- Unique Enquiry Reference Number
    
    -- 1. Source
    SourceOfEnquiry NVARCHAR(255),

    -- 2. Dates
    EnquiryDate DATETIME,
    DueDate DATETIME,
    SiteVisitDate DATETIME,

    -- 3. Customer
    CustomerName NVARCHAR(255),
    ReceivedFrom NVARCHAR(MAX),

    -- 4. Project Details
    ProjectName NVARCHAR(255),
    ClientName NVARCHAR(255),
    ConsultantName NVARCHAR(255),
    
    -- 5. Details
    EnquiryDetails NVARCHAR(MAX),
    
    -- 6. Documents Received
    Doc_HardCopies BIT DEFAULT 0,
    Doc_Drawing BIT DEFAULT 0,
    Doc_CD_DVD BIT DEFAULT 0,
    Doc_Spec BIT DEFAULT 0,
    Doc_EquipmentSchedule BIT DEFAULT 0,
    
    -- 7. Others
    OthersSpecify NVARCHAR(MAX),
    
    -- 8. Remarks
    Remarks NVARCHAR(MAX),
    
    -- 9. Footer
    SendAcknowledgementMail BIT DEFAULT 0,
    ED_CEOSignatureRequired BIT DEFAULT 0,
    
    -- System Fields
    Status NVARCHAR(50) DEFAULT 'Open',
    CreatedAt DATETIME DEFAULT GETDATE(),
    CreatedBy NVARCHAR(100)
);

-- ---------------------------------------------
-- 2. TRANSACTION TABLES (For Multi-Select Inputs with +/-)
-- These tables store the multiple values selected for a single enquiry
-- ---------------------------------------------

-- Category: Enquiry Type
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='EnquiryType' AND xtype='U')
CREATE TABLE EnquiryType (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    RequestNo NVARCHAR(50) FOREIGN KEY REFERENCES EnquiryMaster(RequestNo) ON DELETE CASCADE,
    TypeName NVARCHAR(255),
    CONSTRAINT UK_EnquiryType UNIQUE (RequestNo, TypeName) -- Ensure unique types per enquiry
);

-- Category: Enquiry For
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='EnquiryFor' AND xtype='U')
CREATE TABLE EnquiryFor (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    RequestNo NVARCHAR(50) FOREIGN KEY REFERENCES EnquiryMaster(RequestNo) ON DELETE CASCADE,
    ItemName NVARCHAR(255)
);

-- Category: Received From
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ReceivedFrom' AND xtype='U')
CREATE TABLE ReceivedFrom (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    RequestNo NVARCHAR(50) FOREIGN KEY REFERENCES EnquiryMaster(RequestNo) ON DELETE CASCADE,
    ContactName NVARCHAR(255),
    CompanyName NVARCHAR(255)
);

-- Category: Concerned SE
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ConcernedSE' AND xtype='U')
CREATE TABLE ConcernedSE (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    RequestNo NVARCHAR(50) FOREIGN KEY REFERENCES EnquiryMaster(RequestNo) ON DELETE CASCADE,
    SEName NVARCHAR(255)
);

-- Category: Customer Name
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='EnquiryCustomer' AND xtype='U')
CREATE TABLE EnquiryCustomer (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    RequestNo NVARCHAR(50) FOREIGN KEY REFERENCES EnquiryMaster(RequestNo) ON DELETE CASCADE,
    CustomerName NVARCHAR(255)  
);

-- Category: Attachments
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Attachments' AND xtype='U')
CREATE TABLE Attachments (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    RequestNo NVARCHAR(50) FOREIGN KEY REFERENCES EnquiryMaster(RequestNo) ON DELETE CASCADE,
    FileName NVARCHAR(255),
    FilePath NVARCHAR(MAX),
    UploadedAt DATETIME DEFAULT GETDATE()
);

-- ---------------------------------------------
-- 3. MASTER DATA TABLES (For Dropdown Lists / "Popup Datas")
-- These tables store the available options shown in the dropdowns
-- ---------------------------------------------

-- Master for "Source of Enquiry"
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Master_SourceOfEnquiry' AND xtype='U')
CREATE TABLE Master_SourceOfEnquiry (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    SourceName NVARCHAR(255) UNIQUE
);

-- Master for "Enquiry Type"
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Master_EnquiryType' AND xtype='U')
CREATE TABLE Master_EnquiryType (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    TypeName NVARCHAR(255) UNIQUE
);


-- Master for "Enquiry For" (Item Details)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Master_EnquiryFor' AND xtype='U')
CREATE TABLE Master_EnquiryFor (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    ItemName NVARCHAR(255) UNIQUE,
    CompanyName NVARCHAR(255), -- Company Name (Dept)
    DepartmentName NVARCHAR(255),
    Status NVARCHAR(50) DEFAULT 'Active',
    CommonMailIds NVARCHAR(MAX), -- List of emails
    CCMailIds NVARCHAR(MAX)      -- List of emails
);

-- Master for "Received From" (Contacts)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Master_ReceivedFrom' AND xtype='U')
CREATE TABLE Master_ReceivedFrom (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    Category NVARCHAR(50),
    CompanyName NVARCHAR(255),
    ContactName NVARCHAR(255),
    Designation NVARCHAR(100),
    CategoryOfDesignation NVARCHAR(50),
    Address1 NVARCHAR(MAX),
    Address2 NVARCHAR(MAX),
    FaxNo NVARCHAR(50),
    Phone NVARCHAR(50),
    Mobile1 NVARCHAR(50),
    Mobile2 NVARCHAR(50),
    EmailId NVARCHAR(255)
);

-- Master for "Concerned SE" (User Details)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Master_ConcernedSE' AND xtype='U')
CREATE TABLE Master_ConcernedSE (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    FullName NVARCHAR(255) UNIQUE,
    Designation NVARCHAR(100),
    EmailId NVARCHAR(255),
    LoginPassword NVARCHAR(255),
    Status NVARCHAR(50) DEFAULT 'Active',
    Department NVARCHAR(100),
    Roles NVARCHAR(MAX) -- Multi-select roles stored as comma-separated string
);

-- Master for "Customer Name" (CCC Details)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Master_CustomerName' AND xtype='U')
CREATE TABLE Master_CustomerName (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    Category NVARCHAR(50),
    CompanyName NVARCHAR(255) UNIQUE,
    Address1 NVARCHAR(MAX),
    Address2 NVARCHAR(MAX),
    Rating NVARCHAR(50),
    Type NVARCHAR(50),
    FaxNo NVARCHAR(50),
    Phone1 NVARCHAR(50),
    Phone2 NVARCHAR(50),
    EmailId NVARCHAR(255),
    Website NVARCHAR(255),
    Status NVARCHAR(50) DEFAULT 'Active'
);

-- Master for "Client Name" (CCC Details)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Master_ClientName' AND xtype='U')
CREATE TABLE Master_ClientName (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    Category NVARCHAR(50) DEFAULT 'Client',
    CompanyName NVARCHAR(255) UNIQUE,
    Address1 NVARCHAR(MAX),
    Address2 NVARCHAR(MAX),
    Rating NVARCHAR(50),
    Type NVARCHAR(50),
    FaxNo NVARCHAR(50),
    Phone1 NVARCHAR(50),
    Phone2 NVARCHAR(50),
    EmailId NVARCHAR(255),
    Website NVARCHAR(255),
    Status NVARCHAR(50) DEFAULT 'Active'
);

-- Master for "Consultant Name" (CCC Details)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Master_ConsultantName' AND xtype='U')
CREATE TABLE Master_ConsultantName (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    Category NVARCHAR(50) DEFAULT 'Consultant',
    CompanyName NVARCHAR(255) UNIQUE,
    Address1 NVARCHAR(MAX),
    Address2 NVARCHAR(MAX),
    Rating NVARCHAR(50),
    Type NVARCHAR(50),
    FaxNo NVARCHAR(50),
    Phone1 NVARCHAR(50),
    Phone2 NVARCHAR(50),
    EmailId NVARCHAR(255),
    Website NVARCHAR(255),
    Status NVARCHAR(50) DEFAULT 'Active'
);
