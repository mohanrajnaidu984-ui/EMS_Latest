-- Create Database
CREATE DATABASE EMS_DB;
GO

USE EMS_DB;
GO

-- Master Tables
CREATE TABLE Customers (
    CustomerID INT IDENTITY(1,1) PRIMARY KEY,
    Category NVARCHAR(50),
    CompanyName NVARCHAR(255) NOT NULL,
    Address1 NVARCHAR(MAX),
    Address2 NVARCHAR(MAX),
    Rating NVARCHAR(50),
    CustomerType NVARCHAR(50),
    FaxNo NVARCHAR(50),
    Phone1 NVARCHAR(50),
    Phone2 NVARCHAR(50),
    Email NVARCHAR(100),
    Website NVARCHAR(100),
    Status NVARCHAR(20) DEFAULT 'Active'
);

CREATE TABLE Contacts (
    ContactID INT IDENTITY(1,1) PRIMARY KEY,
    Category NVARCHAR(50),
    CompanyName NVARCHAR(255),
    ContactName NVARCHAR(100) NOT NULL,
    Designation NVARCHAR(100),
    CategoryOfDesignation NVARCHAR(50),
    Address1 NVARCHAR(MAX),
    Address2 NVARCHAR(MAX),
    FaxNo NVARCHAR(50),
    Phone NVARCHAR(50),
    Mobile1 NVARCHAR(50),
    Mobile2 NVARCHAR(50),
    EmailId NVARCHAR(100)
);

CREATE TABLE Users (
    UserID INT IDENTITY(1,1) PRIMARY KEY,
    FullName NVARCHAR(100) NOT NULL,
    Designation NVARCHAR(100),
    MailId NVARCHAR(100) NOT NULL,
    LoginPassword NVARCHAR(100) NOT NULL, -- In production, store hashed passwords!
    Status NVARCHAR(20) DEFAULT 'Active',
    Department NVARCHAR(50),
    Roles NVARCHAR(MAX) -- Comma separated or JSON
);

CREATE TABLE EnquiryItems (
    ItemID INT IDENTITY(1,1) PRIMARY KEY,
    ItemName NVARCHAR(100) NOT NULL,
    CompanyName NVARCHAR(255),
    DepartmentName NVARCHAR(100),
    Status NVARCHAR(20) DEFAULT 'Active',
    CommonMailIds NVARCHAR(MAX),
    CCMailIds NVARCHAR(MAX)
);

-- Transaction Tables
CREATE TABLE Enquiries (
    RequestNo NVARCHAR(50) PRIMARY KEY,
    SourceOfInfo NVARCHAR(50),
    EnquiryDate DATE,
    DueOn DATE,
    SiteVisitDate DATE,
    EnquiryType NVARCHAR(MAX), -- JSON or Comma Separated
    EnquiryFor NVARCHAR(MAX), -- JSON or Comma Separated
    CustomerName NVARCHAR(MAX), -- Comma Separated
    ReceivedFrom NVARCHAR(MAX), -- Comma Separated
    ProjectName NVARCHAR(255),
    ClientName NVARCHAR(255),
    ConsultantName NVARCHAR(255),
    ConcernedSE NVARCHAR(MAX), -- Comma Separated
    DetailsOfEnquiry NVARCHAR(MAX),
    DocumentsReceived NVARCHAR(MAX),
    HardCopy BIT,
    Drawing BIT,
    DVD BIT,
    Spec BIT,
    EqpSchedule BIT,
    Remark NVARCHAR(MAX),
    AutoAck BIT,
    CeoSign BIT,
    Status NVARCHAR(50) DEFAULT 'Enquiry',
    CreatedAt DATETIME DEFAULT GETDATE()
);
GO
