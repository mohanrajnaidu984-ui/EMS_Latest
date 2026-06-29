-- Speed up notification list/count queries per user (active + history tabs).
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Notifications_UserID_Active')
BEGIN
    CREATE INDEX IX_Notifications_UserID_Active
        ON dbo.Notifications (UserID, CreatedAt DESC)
        WHERE IsAcknowledged = 0;
    PRINT 'Created index IX_Notifications_UserID_Active';
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Notifications_UserID_History')
BEGIN
    CREATE INDEX IX_Notifications_UserID_History
        ON dbo.Notifications (UserID, AcknowledgedAt DESC, CreatedAt DESC)
        WHERE IsAcknowledged = 1;
    PRINT 'Created index IX_Notifications_UserID_History';
END
