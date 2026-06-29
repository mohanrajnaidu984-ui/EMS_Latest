/*
  Pending pricing – access + enquiry list (same gate as GET /api/pricing/list/pending)

  Set @UserEmailRaw to the same string the app uses for /api/pricing/* (session currentUser email
  shown top-right after the Pricing module change — not localStorage currentUserEmail alone).

  Change @UserEmailRaw / @DiagnosticRequestNo for another user or enquiry.
*/

DECLARE @UserEmailRaw NVARCHAR(320) = N'bmseng4@almoayyedcg.com';
/* Optional: set to an enquiry number for section 4 diagnostics */
DECLARE @DiagnosticRequestNo INT = 9;

DECLARE @NormEmail NVARCHAR(320) =
    LOWER(
        REPLACE(
            REPLACE(LTRIM(RTRIM(@UserEmailRaw)), N'@almcg.com', N'@almoayyedcg.com'),
            N'@ALMCG.COM',
            N'@almoayyedcg.com'
        )
    );

/* ----- 1) Profile (same as server: Master_ConcernedSE by normalized email) ----- */
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
      ) = @NormEmail;

/* ----- 2) Flags: Admin / CC user (same logic as quotePricingAccess.js) ----- */
DECLARE @Roles NVARCHAR(500) =
(
    SELECT LOWER(LTRIM(RTRIM(ISNULL(m.Roles, N''))))
    FROM dbo.Master_ConcernedSE m
    WHERE LOWER(
              REPLACE(
                  REPLACE(LTRIM(RTRIM(ISNULL(m.EmailId, N''))), N'@almcg.com', N'@almoayyedcg.com'),
                  N'@ALMCG.COM',
                  N'@almoayyedcg.com'
              )
          ) = @NormEmail
);

DECLARE @IsAdmin BIT =
    CASE
        WHEN @Roles LIKE N'%admin%' OR @Roles LIKE N'%system%' THEN 1
        ELSE 0
    END;

/* ISNULL(mef.CCMailIds, N'') — two arguments; inner REPLACE must not break parentheses */
DECLARE @IsCcUser BIT =
    CASE
        WHEN EXISTS (
            SELECT 1
            FROM dbo.Master_EnquiryFor mef
            WHERE N',' + REPLACE(REPLACE(ISNULL(mef.CCMailIds, N''), N' ', N''), N';', N',') + N','
                  LIKE N'%,' + @NormEmail + N',%'
        ) THEN 1
        ELSE 0
    END;

SELECT @NormEmail AS NormEmail, @IsAdmin AS IsAdmin, @IsCcUser AS IsCcUser, @Roles AS RolesLower;

/* ----- 3) Enquiry list: same WHERE as pricing.js getEnquiryPricingList (pendingOnly) ----- */
IF @IsAdmin = 1
BEGIN
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
    ORDER BY E.DueDate DESC, E.RequestNo DESC;
END
ELSE IF @IsCcUser = 1
BEGIN
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
            FROM dbo.EnquiryFor ef
            INNER JOIN dbo.Master_EnquiryFor mef
                ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE N'% - ' + mef.ItemName)
            WHERE ef.RequestNo = E.RequestNo
              AND N',' + REPLACE(REPLACE(ISNULL(mef.CCMailIds, N''), N' ', N''), N';', N',') + N','
                    LIKE N'%,' + @NormEmail + N',%'
        )
    ORDER BY E.DueDate DESC, E.RequestNo DESC;
END
ELSE
BEGIN
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
              AND LOWER(LTRIM(RTRIM(m.EmailId))) = LOWER(LTRIM(@NormEmail))
        )
    ORDER BY E.DueDate DESC, E.RequestNo DESC;
END;

/* ----- 4) Single enquiry: ConcernedSE + jobs + pricing values (optional diagnostic) ----- */
SELECT c.RequestNo, c.SEName, m.EmailId, m.Department, m.Roles
FROM dbo.ConcernedSE c
LEFT JOIN dbo.Master_ConcernedSE m
    ON UPPER(LTRIM(RTRIM(ISNULL(m.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(c.SEName, N''))))
WHERE c.RequestNo = @DiagnosticRequestNo;

SELECT ef.ID, ef.ParentID, ef.ItemName, ef.LeadJobCode, ef.LeadJobName
FROM dbo.EnquiryFor ef
WHERE ef.RequestNo = @DiagnosticRequestNo
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
WHERE v.RequestNo = @DiagnosticRequestNo
ORDER BY v.ID;

/*
================================================================================
LITERAL VALUES ONLY (copy if you prefer no variables)

User email:  bmseng4@almoayyedcg.com
Enquiry:     9

Run the profile SELECT first. If that user is Admin or CC, use the matching
branch from section 3 above — the block below is the usual Sales Engineer
(ConcernedSE + Master_ConcernedSE email) gate only.
================================================================================
*/
GO

/* Profile — same as section 1 */
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

/* Pending-style enquiry list — ConcernedSE path (literal email) */
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

/* Enquiry 9 — ConcernedSE + jobs + pricing values */
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
