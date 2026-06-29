/*
  Pending pricing — API step-1 enquiry list WITH LITERAL VALUES

  User (example):  bmseng4@almoayyedcg.com
  Diagnostic RN:  9

  Run QUERY 1 first. Then run ONLY ONE of QUERY 2A / 2B / 2C:
    2A = Admin
    2B = CC coordinator (CCMailIds contains this email)
    2C = Sales engineer (ConcernedSE + Master_ConcernedSE email) — most common

  The on-screen "Pending Pricing" grid also filters in Node (hasPendingItems).
  This SQL is the same row set the API loads before that filter.
*/

/* ========== QUERY 1 — Profile (who is this user?) ========== */
SELECT
    m.FullName,
    m.Roles,
    m.Department,
    m.EmailId AS EmailId_Raw
FROM dbo.Master_ConcernedSE m
WHERE LOWER(
          REPLACE(
              REPLACE(LTRIM(RTRIM(ISNULL(m.EmailId, N''))), N'@almcg.com', N'@almoayyedcg.com'),
              N'@ALMCG.COM',
              N'@almoayyedcg.com'
          )
      ) = N'bmseng4@almoayyedcg.com';

/*
========== QUERY 2A — ADMIN (uncomment and run alone if Roles contain admin/system) ==========
SELECT E.RequestNo, E.ProjectName, E.CustomerName, E.Status, E.DueDate, E.EnquiryDate, E.CreatedBy
FROM dbo.EnquiryMaster E
WHERE (
    E.Status IN (N'Open', N'Enquiry', N'Priced', N'Estimated', N'Quote', N'Pricing', N'Pending', N'Quoted', N'Submitted')
    OR E.Status IS NULL OR LTRIM(RTRIM(ISNULL(E.Status, N''))) = N''
)
ORDER BY E.DueDate DESC, E.RequestNo DESC;
*/

/*
========== QUERY 2B — CC (uncomment if user is CC; CCMailIds pattern) ==========
SELECT E.RequestNo, E.ProjectName, E.CustomerName, E.Status, E.DueDate, E.EnquiryDate, E.CreatedBy
FROM dbo.EnquiryMaster E
WHERE (
    E.Status IN (N'Open', N'Enquiry', N'Priced', N'Estimated', N'Quote', N'Pricing', N'Pending', N'Quoted', N'Submitted')
    OR E.Status IS NULL OR LTRIM(RTRIM(ISNULL(E.Status, N''))) = N''
)
AND EXISTS (
    SELECT 1 FROM dbo.EnquiryFor ef
    INNER JOIN dbo.Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE N'% - ' + mef.ItemName)
    WHERE ef.RequestNo = E.RequestNo
      AND N',' + REPLACE(REPLACE(ISNULL(mef.CCMailIds, N''), N' ', N''), N';', N',') + N','
            LIKE N'%,' + N'bmseng4@almoayyedcg.com' + N',%'
)
ORDER BY E.DueDate DESC, E.RequestNo DESC;
*/

/* ========== QUERY 2C — ConcernedSE path (default for bmseng4@almoayyedcg.com) ========== */
SELECT
    E.RequestNo,
    E.ProjectName,
    E.CustomerName,
    E.Status,
    E.DueDate,
    E.EnquiryDate,
    E.CreatedBy
FROM dbo.EnquiryMaster E
WHERE (
    E.Status IN (N'Open', N'Enquiry', N'Priced', N'Estimated', N'Quote', N'Pricing', N'Pending', N'Quoted', N'Submitted')
    OR E.Status IS NULL
    OR LTRIM(RTRIM(ISNULL(E.Status, N''))) = N''
)
  AND EXISTS (
        SELECT 1
        FROM dbo.ConcernedSE c
        INNER JOIN dbo.Master_ConcernedSE m
            ON UPPER(LTRIM(RTRIM(ISNULL(m.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(c.SEName, N''))))
        WHERE c.RequestNo = E.RequestNo
          AND LOWER(LTRIM(RTRIM(m.EmailId))) = LOWER(LTRIM(N'bmseng4@almoayyedcg.com'))
    )
ORDER BY E.DueDate DESC, E.RequestNo DESC;

/* ========== QUERY 3 — Enquiry 9 only (jobs + values) ========== */
SELECT c.RequestNo, c.SEName, m.EmailId, m.Department, m.Roles
FROM dbo.ConcernedSE c
LEFT JOIN dbo.Master_ConcernedSE m
    ON UPPER(LTRIM(RTRIM(ISNULL(m.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(c.SEName, N''))))
WHERE c.RequestNo = 9;

SELECT ef.ID, ef.ParentID, ef.ItemName, ef.LeadJobCode, ef.LeadJobName
FROM dbo.EnquiryFor ef
WHERE ef.RequestNo = 9
ORDER BY ef.ID;

SELECT
    v.ID,
    v.RequestNo,
    v.EnquiryForID,
    v.EnquiryForItem,
    v.OptionID,
    v.PriceOption,
    v.Price,
    v.UpdatedAt,
    v.UpdatedBy
FROM dbo.EnquiryPricingValues v
WHERE v.RequestNo = 9
ORDER BY v.ID;
