-- Add VAT_Per (default VAT %) to Master_EnquiryFor — safe if re-run
IF COL_LENGTH('dbo.Master_EnquiryFor', 'VAT_Per') IS NULL
BEGIN
    ALTER TABLE dbo.Master_EnquiryFor ADD VAT_Per DECIMAL(9, 4) NULL;
END
GO

-- Seed from Currency when VAT_Per is still NULL (BHD → 10, SAR → 15)
UPDATE dbo.Master_EnquiryFor
SET VAT_Per = CASE
    WHEN UPPER(LTRIM(RTRIM(ISNULL(Currency, N'')))) = N'SAR' THEN 15
    ELSE 10
END
WHERE VAT_Per IS NULL;
GO
