cd C:\Users\Vignesh\Downloads\New-EMS\New-EMS-Updated-- Auto-generated Schema Export --
-- WARNING: THIS SCRIPT WILL WIPE ALL DATA IN THE DATABASE --
-- IT IS INTENDED FOR A CLEAN REBUILD --

-- 1. Drop all Foreign Key Constraints first (to allow dropping tables)
DECLARE @sql NVARCHAR(MAX) = N'';
SELECT @sql += 'ALTER TABLE ' + QUOTENAME(OBJECT_SCHEMA_NAME(parent_object_id))
    + '.' + QUOTENAME(OBJECT_NAME(parent_object_id)) 
    + ' DROP CONSTRAINT ' + QUOTENAME(name) + ';'
FROM sys.foreign_keys;
EXEC sp_executesql @sql;
GO

-- Table: Attachments
IF OBJECT_ID('[dbo].[Attachments]', 'U') IS NOT NULL DROP TABLE [dbo].[Attachments];
GO

CREATE TABLE [dbo].[Attachments] (
    [ID] INT NOT NULL IDENTITY(1,1),
    [RequestNo] NVARCHAR(50),
    [FileName] NVARCHAR(255),
    [FilePath] NVARCHAR(MAX),
    [UploadedAt] DATETIME DEFAULT (getdate()),
    PRIMARY KEY ([ID])
);
GO

-- Table: ConcernedSE
IF OBJECT_ID('[dbo].[ConcernedSE]', 'U') IS NOT NULL DROP TABLE [dbo].[ConcernedSE];
GO

CREATE TABLE [dbo].[ConcernedSE] (
    [ID] INT NOT NULL IDENTITY(1,1),
    [RequestNo] NVARCHAR(50),
    [SEName] NVARCHAR(255),
    PRIMARY KEY ([ID])
);
GO

-- Table: EnquiryCustomer
IF OBJECT_ID('[dbo].[EnquiryCustomer]', 'U') IS NOT NULL DROP TABLE [dbo].[EnquiryCustomer];
GO

CREATE TABLE [dbo].[EnquiryCustomer] (
    [ID] INT NOT NULL IDENTITY(1,1),
    [RequestNo] NVARCHAR(50),
    [CustomerName] NVARCHAR(255),
    PRIMARY KEY ([ID])
);
GO

-- Table: EnquiryFor
IF OBJECT_ID('[dbo].[EnquiryFor]', 'U') IS NOT NULL DROP TABLE [dbo].[EnquiryFor];
GO

CREATE TABLE [dbo].[EnquiryFor] (
    [ID] INT NOT NULL IDENTITY(1,1),
    [RequestNo] NVARCHAR(50),
    [ItemName] NVARCHAR(255),
    PRIMARY KEY ([ID])
);
GO

-- Table: EnquiryMaster
IF OBJECT_ID('[dbo].[EnquiryMaster]', 'U') IS NOT NULL DROP TABLE [dbo].[EnquiryMaster];
GO

CREATE TABLE [dbo].[EnquiryMaster] (
    [RequestNo] NVARCHAR(50) NOT NULL,
    [EnquiryDate] DATETIME,
    [DueDate] DATETIME,
    [SiteVisitDate] DATETIME,
    [SourceOfEnquiry] NVARCHAR(255),
    [CustomerName] NVARCHAR(255),
    [ProjectName] NVARCHAR(255),
    [ClientName] NVARCHAR(255),
    [ConsultantName] NVARCHAR(255),
    [EnquiryDetails] NVARCHAR(MAX),
    [Doc_HardCopies] BIT DEFAULT ((0)),
    [Doc_Drawing] BIT DEFAULT ((0)),
    [Doc_CD_DVD] BIT DEFAULT ((0)),
    [Doc_Spec] BIT DEFAULT ((0)),
    [Doc_EquipmentSchedule] BIT DEFAULT ((0)),
    [OthersSpecify] NVARCHAR(MAX),
    [Remarks] NVARCHAR(MAX),
    [SendAcknowledgementMail] BIT DEFAULT ((0)),
    [ED_CEOSignatureRequired] BIT DEFAULT ((0)),
    [Status] NVARCHAR(50) DEFAULT ('Open'),
    [CreatedAt] DATETIME DEFAULT (getdate()),
    [CreatedBy] NVARCHAR(100),
    [ReceivedFrom] NVARCHAR(255),
    [AdditionalNotificationEmails] NVARCHAR(MAX),
    [AcknowledgementSE] NVARCHAR(255),
    PRIMARY KEY ([RequestNo])
);
GO

-- Table: EnquiryNotes
IF OBJECT_ID('[dbo].[EnquiryNotes]', 'U') IS NOT NULL DROP TABLE [dbo].[EnquiryNotes];
GO

CREATE TABLE [dbo].[EnquiryNotes] (
    [ID] INT NOT NULL IDENTITY(1,1),
    [EnquiryID] NVARCHAR(50) NOT NULL,
    [UserID] INT NOT NULL,
    [UserName] NVARCHAR(255),
    [UserProfileImage] NVARCHAR(MAX),
    [NoteContent] NVARCHAR(MAX),
    [CreatedAt] DATETIME DEFAULT (getdate()),
    PRIMARY KEY ([ID])
);
GO

-- Table: EnquiryType
IF OBJECT_ID('[dbo].[EnquiryType]', 'U') IS NOT NULL DROP TABLE [dbo].[EnquiryType];
GO

CREATE TABLE [dbo].[EnquiryType] (
    [ID] INT NOT NULL IDENTITY(1,1),
    [RequestNo] NVARCHAR(50),
    [TypeName] NVARCHAR(255),
    PRIMARY KEY ([ID])
);
GO

-- Table: Master_AdditionalEmails
IF OBJECT_ID('[dbo].[Master_AdditionalEmails]', 'U') IS NOT NULL DROP TABLE [dbo].[Master_AdditionalEmails];
GO

CREATE TABLE [dbo].[Master_AdditionalEmails] (
    [ID] INT NOT NULL IDENTITY(1,1),
    [Name] NVARCHAR(255) NOT NULL,
    [EmailId] NVARCHAR(255) NOT NULL,
    PRIMARY KEY ([ID])
);
GO

-- Table: Master_ClientName
IF OBJECT_ID('[dbo].[Master_ClientName]', 'U') IS NOT NULL DROP TABLE [dbo].[Master_ClientName];
GO

CREATE TABLE [dbo].[Master_ClientName] (
    [ID] INT NOT NULL IDENTITY(1,1),
    [Category] NVARCHAR(50) DEFAULT ('Client'),
    [CompanyName] NVARCHAR(255),
    [Address1] NVARCHAR(MAX),
    [Address2] NVARCHAR(MAX),
    [Rating] NVARCHAR(50),
    [Type] NVARCHAR(50),
    [FaxNo] NVARCHAR(50),
    [Phone1] NVARCHAR(50),
    [Phone2] NVARCHAR(50),
    [EmailId] NVARCHAR(255),
    [Website] NVARCHAR(255),
    [Status] NVARCHAR(50) DEFAULT ('Active'),
    [RequestNo] NVARCHAR(50),
    PRIMARY KEY ([ID])
);
GO

-- Table: Master_ConcernedSE
IF OBJECT_ID('[dbo].[Master_ConcernedSE]', 'U') IS NOT NULL DROP TABLE [dbo].[Master_ConcernedSE];
GO

CREATE TABLE [dbo].[Master_ConcernedSE] (
    [ID] INT NOT NULL IDENTITY(1,1),
    [FullName] NVARCHAR(255),
    [Designation] NVARCHAR(100),
    [EmailId] NVARCHAR(255),
    [LoginPassword] NVARCHAR(255),
    [Status] NVARCHAR(50) DEFAULT ('Active'),
    [Department] NVARCHAR(100),
    [Roles] NVARCHAR(MAX),
    [RequestNo] NVARCHAR(50),
    [ProfilePicture] NVARCHAR(MAX),
    [ProfileImage] NVARCHAR(MAX),
    PRIMARY KEY ([ID])
);
GO

-- Table: Master_ConsultantName
IF OBJECT_ID('[dbo].[Master_ConsultantName]', 'U') IS NOT NULL DROP TABLE [dbo].[Master_ConsultantName];
GO

CREATE TABLE [dbo].[Master_ConsultantName] (
    [ID] INT NOT NULL IDENTITY(1,1),
    [Category] NVARCHAR(50) DEFAULT ('Consultant'),
    [CompanyName] NVARCHAR(255),
    [Address1] NVARCHAR(MAX),
    [Address2] NVARCHAR(MAX),
    [Rating] NVARCHAR(50),
    [Type] NVARCHAR(50),
    [FaxNo] NVARCHAR(50),
    [Phone1] NVARCHAR(50),
    [Phone2] NVARCHAR(50),
    [EmailId] NVARCHAR(255),
    [Website] NVARCHAR(255),
    [Status] NVARCHAR(50) DEFAULT ('Active'),
    [RequestNo] NVARCHAR(50),
    PRIMARY KEY ([ID])
);
GO

-- Table: Master_CustomerName
IF OBJECT_ID('[dbo].[Master_CustomerName]', 'U') IS NOT NULL DROP TABLE [dbo].[Master_CustomerName];
GO

CREATE TABLE [dbo].[Master_CustomerName] (
    [ID] INT NOT NULL IDENTITY(1,1),
    [Category] NVARCHAR(50),
    [CompanyName] NVARCHAR(255),
    [Address1] NVARCHAR(MAX),
    [Address2] NVARCHAR(MAX),
    [Rating] NVARCHAR(50),
    [Type] NVARCHAR(50),
    [FaxNo] NVARCHAR(50),
    [Phone1] NVARCHAR(50),
    [Phone2] NVARCHAR(50),
    [EmailId] NVARCHAR(255),
    [Website] NVARCHAR(255),
    [Status] NVARCHAR(50) DEFAULT ('Active'),
    [RequestNo] NVARCHAR(50),
    PRIMARY KEY ([ID])
);
GO

-- Table: Master_EnquiryFor
IF OBJECT_ID('[dbo].[Master_EnquiryFor]', 'U') IS NOT NULL DROP TABLE [dbo].[Master_EnquiryFor];
GO

CREATE TABLE [dbo].[Master_EnquiryFor] (
    [ID] INT NOT NULL IDENTITY(1,1),
    [ItemName] NVARCHAR(255),
    [CompanyName] NVARCHAR(255),
    [DepartmentName] NVARCHAR(255),
    [Status] NVARCHAR(50) DEFAULT ('Active'),
    [CommonMailIds] NVARCHAR(MAX),
    [CCMailIds] NVARCHAR(MAX),
    [RequestNo] NVARCHAR(50),
    PRIMARY KEY ([ID])
);
GO

-- Table: Master_EnquiryType
IF OBJECT_ID('[dbo].[Master_EnquiryType]', 'U') IS NOT NULL DROP TABLE [dbo].[Master_EnquiryType];
GO

CREATE TABLE [dbo].[Master_EnquiryType] (
    [ID] INT NOT NULL IDENTITY(1,1),
    [TypeName] NVARCHAR(255),
    [RequestNo] NVARCHAR(50),
    PRIMARY KEY ([ID])
);
GO

-- Table: Master_ReceivedFrom
IF OBJECT_ID('[dbo].[Master_ReceivedFrom]', 'U') IS NOT NULL DROP TABLE [dbo].[Master_ReceivedFrom];
GO

CREATE TABLE [dbo].[Master_ReceivedFrom] (
    [ID] INT NOT NULL IDENTITY(1,1),
    [Category] NVARCHAR(50),
    [CompanyName] NVARCHAR(255),
    [ContactName] NVARCHAR(255),
    [Designation] NVARCHAR(100),
    [CategoryOfDesignation] NVARCHAR(50),
    [Address1] NVARCHAR(MAX),
    [Address2] NVARCHAR(MAX),
    [FaxNo] NVARCHAR(50),
    [Phone] NVARCHAR(50),
    [Mobile1] NVARCHAR(50),
    [Mobile2] NVARCHAR(50),
    [EmailId] NVARCHAR(255),
    [RequestNo] NVARCHAR(50),
    PRIMARY KEY ([ID])
);
GO

-- Table: Master_SourceOfEnquiry
IF OBJECT_ID('[dbo].[Master_SourceOfEnquiry]', 'U') IS NOT NULL DROP TABLE [dbo].[Master_SourceOfEnquiry];
GO

CREATE TABLE [dbo].[Master_SourceOfEnquiry] (
    [ID] INT NOT NULL IDENTITY(1,1),
    [SourceName] NVARCHAR(255),
    [RequestNo] NVARCHAR(50),
    PRIMARY KEY ([ID])
);
GO

-- Table: Notifications
IF OBJECT_ID('[dbo].[Notifications]', 'U') IS NOT NULL DROP TABLE [dbo].[Notifications];
GO

CREATE TABLE [dbo].[Notifications] (
    [ID] INT NOT NULL IDENTITY(1,1),
    [UserID] INT NOT NULL,
    [Type] NVARCHAR(50) NOT NULL,
    [Message] NVARCHAR(MAX) NOT NULL,
    [LinkID] NVARCHAR(255),
    [IsRead] BIT DEFAULT ((0)),
    [CreatedAt] DATETIME DEFAULT (getdate()),
    [CreatedBy] NVARCHAR(255),
    PRIMARY KEY ([ID])
);
GO

-- Table: ReceivedFrom
IF OBJECT_ID('[dbo].[ReceivedFrom]', 'U') IS NOT NULL DROP TABLE [dbo].[ReceivedFrom];
GO

CREATE TABLE [dbo].[ReceivedFrom] (
    [ID] INT NOT NULL IDENTITY(1,1),
    [RequestNo] NVARCHAR(50),
    [ContactName] NVARCHAR(255),
    [CompanyName] NVARCHAR(255),
    PRIMARY KEY ([ID])
);
GO

