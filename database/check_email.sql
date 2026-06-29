-- Check if the email exists in Master_ConcernedSE table
-- Run this query in SQL Server Management Studio

SELECT 
    ID,
    FullName,
    EmailId,
    LoginPassword,
    Roles,
    Status,
    CASE 
        WHEN LoginPassword IS NULL OR LoginPassword = '' THEN 'First Time Login'
        ELSE 'Has Password'
    END AS PasswordStatus
FROM Master_ConcernedSE
WHERE EmailId LIKE '%mohan%'
   OR EmailId LIKE '%almoayyed%';

-- If no results, check all emails
SELECT ID, FullName, EmailId, Status
FROM Master_ConcernedSE
ORDER BY ID DESC;
