-- Migration: Add GrossProfitTarget column to SalesTargets
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'SalesTargets' AND COLUMN_NAME = 'GrossProfitTarget'
)
BEGIN
    ALTER TABLE SalesTargets ADD GrossProfitTarget DECIMAL(18, 2) NULL DEFAULT 0;
    PRINT 'Column GrossProfitTarget added to SalesTargets.';
END
ELSE
BEGIN
    PRINT 'Column GrossProfitTarget already exists in SalesTargets.';
END
