-- Quote form browser-session drafts stored per user (MSSQL).
-- Run via: node server/migrations/run_create_quote_form_drafts.js

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'QuoteFormDrafts' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE [dbo].[QuoteFormDrafts] (
        [Id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_QuoteFormDrafts PRIMARY KEY DEFAULT NEWID(),
        [UserEmail] NVARCHAR(320) NOT NULL,
        [Label] NVARCHAR(500) NOT NULL,
        [DraftPayloadJson] NVARCHAR(MAX) NOT NULL,
        [CreatedAt] DATETIME2(3) NOT NULL CONSTRAINT DF_QuoteFormDrafts_CreatedAt DEFAULT SYSUTCDATETIME(),
        [UpdatedAt] DATETIME2(3) NOT NULL CONSTRAINT DF_QuoteFormDrafts_UpdatedAt DEFAULT SYSUTCDATETIME()
    );

    CREATE INDEX IX_QuoteFormDrafts_UserEmail_CreatedAt
        ON [dbo].[QuoteFormDrafts] ([UserEmail], [CreatedAt] DESC);
END
