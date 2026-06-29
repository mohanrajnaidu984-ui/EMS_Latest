-- Script to view and clean up duplicate or test enquiries
-- Run this in SQL Server Management Studio

-- 1. View all enquiries starting with 9 in December 2025
SELECT RequestNo, ProjectName, ClientName, EnquiryDate, CreatedAt, CreatedBy
FROM EnquiryMaster
WHERE RequestNo LIKE 'EYS/2025/12/9%'
ORDER BY RequestNo DESC;

-- 2. If you want to delete a specific enquiry (replace with actual RequestNo)
-- UNCOMMENT and modify the RequestNo below to delete
/*
DECLARE @RequestNoToDelete NVARCHAR(50) = 'EYS/2025/12/9000000';

-- Delete from related tables first (due to foreign key constraints)
DELETE FROM EnquiryCustomer WHERE RequestNo = @RequestNoToDelete;
DELETE FROM EnquiryType WHERE RequestNo = @RequestNoToDelete;
DELETE FROM EnquiryFor WHERE RequestNo = @RequestNoToDelete;
DELETE FROM ReceivedFrom WHERE RequestNo = @RequestNoToDelete;
DELETE FROM ConcernedSE WHERE RequestNo = @RequestNoToDelete;
DELETE FROM Attachments WHERE RequestNo = @RequestNoToDelete;

-- Finally delete from master table
DELETE FROM EnquiryMaster WHERE RequestNo = @RequestNoToDelete;

PRINT 'Enquiry ' + @RequestNoToDelete + ' deleted successfully';
*/

-- 3. View count of enquiries by month
SELECT 
    SUBSTRING(RequestNo, 1, 12) AS YearMonth,
    COUNT(*) AS EnquiryCount
FROM EnquiryMaster
GROUP BY SUBSTRING(RequestNo, 1, 12)
ORDER BY YearMonth DESC;
