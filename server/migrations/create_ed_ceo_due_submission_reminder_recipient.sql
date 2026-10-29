-- Recipients for the ED/CEO tender/quote due-submission reminder.
-- The reminder To list is loaded from active rows in this table (SortOrder, then ID).
IF NOT EXISTS (
    SELECT 1
    FROM sys.tables
    WHERE name = 'EdCeoDueSubmissionReminderRecipient'
      AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
    CREATE TABLE dbo.EdCeoDueSubmissionReminderRecipient (
        ID INT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
        Email NVARCHAR(320) NOT NULL,
        FullName NVARCHAR(255) NULL,
        SortOrder INT NOT NULL CONSTRAINT DF_EdCeoDueSubmissionReminderRecipient_SortOrder DEFAULT (0),
        IsActive BIT NOT NULL CONSTRAINT DF_EdCeoDueSubmissionReminderRecipient_IsActive DEFAULT (1),
        CreatedAt DATETIME NOT NULL CONSTRAINT DF_EdCeoDueSubmissionReminderRecipient_CreatedAt DEFAULT (GETDATE()),
        CONSTRAINT UQ_EdCeoDueSubmissionReminderRecipient_Email UNIQUE (Email)
    );
END

IF NOT EXISTS (SELECT 1 FROM dbo.EdCeoDueSubmissionReminderRecipient)
BEGIN
    INSERT INTO dbo.EdCeoDueSubmissionReminderRecipient (Email, FullName, SortOrder, IsActive)
    VALUES
        (N'hala@almoayyedcg.com', NULL, 1, 1),
        (N'mathews@almoayyedcg.com', NULL, 2, 1),
        (N'lohidas@almoayyedcg.com', NULL, 3, 1);
END

IF OBJECT_ID('dbo.Master_ConcernedSE', 'U') IS NOT NULL
BEGIN
    UPDATE r
    SET r.FullName = LTRIM(RTRIM(se.FullName))
    FROM dbo.EdCeoDueSubmissionReminderRecipient r
    INNER JOIN dbo.Master_ConcernedSE se
        ON LOWER(LTRIM(RTRIM(ISNULL(se.EmailId, N'')))) = LOWER(LTRIM(RTRIM(r.Email)))
    WHERE (r.FullName IS NULL OR LTRIM(RTRIM(r.FullName)) = N'')
      AND se.FullName IS NOT NULL
      AND LTRIM(RTRIM(se.FullName)) <> N'';
END

IF OBJECT_ID('dbo.Users', 'U') IS NOT NULL
   AND COL_LENGTH('dbo.Users', 'Email') IS NOT NULL
   AND COL_LENGTH('dbo.Users', 'FullName') IS NOT NULL
BEGIN
    UPDATE r
    SET r.FullName = LTRIM(RTRIM(u.FullName))
    FROM dbo.EdCeoDueSubmissionReminderRecipient r
    INNER JOIN dbo.Users u
        ON LOWER(LTRIM(RTRIM(ISNULL(u.Email, N'')))) = LOWER(LTRIM(RTRIM(r.Email)))
    WHERE (r.FullName IS NULL OR LTRIM(RTRIM(r.FullName)) = N'')
      AND u.FullName IS NOT NULL
      AND LTRIM(RTRIM(u.FullName)) <> N'';
END
