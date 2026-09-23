-- Add Currency to Master_EnquiryFor (safe if re-run)
IF COL_LENGTH('dbo.Master_EnquiryFor', 'Currency') IS NULL
BEGIN
    ALTER TABLE dbo.Master_EnquiryFor ADD Currency NVARCHAR(20) NULL;
END
GO
