/*
  Pending pricing — diagnostic SQL for user bini.mathew@almoayyedcg.com (literal + variables).

  A) Same enquiry scope as GET /api/pricing/list/pending?userEmail=bini.mathew@almoayyedcg.com (step 1–3).
  B) Spec-aligned slots (see server/lib/pendingPricingSummarySpec.js):
     - Internal: EnquiryFor J where department matches J.ItemName → parent P → (P.ItemName, P.LeadJobName).
     - Externals: EnquiryCustomer when a “lead job” row exists (department match + ItemName = LeadJobName).
     - Base rows: EnquiryPricingValues with Price > 0 and Base Price option.

  Department ↔ ItemName uses a simplified LIKE on raw @Department (not every JS normalisation).
  Final pending yes/no is still computed in Node for SE+dept; use this to inspect data behind the list.
*/

DECLARE @UserEmail NVARCHAR(320) = N'bini.mathew@almoayyedcg.com';

DECLARE @NormEmail NVARCHAR(320) =
    LOWER(
        REPLACE(
            REPLACE(LTRIM(RTRIM(@UserEmail)), N'@almcg.com', N'@almoayyedcg.com'),
            N'@ALMCG.COM',
            N'@almoayyedcg.com'
        )
    );

DECLARE @CcPattern NVARCHAR(400) = N'%,' + @NormEmail + N',%';

DECLARE @FullName NVARCHAR(500);
DECLARE @Roles NVARCHAR(500);
DECLARE @Department NVARCHAR(500);

SELECT
    @FullName = LTRIM(RTRIM(ISNULL(m.FullName, N''))),
    @Roles = LOWER(LTRIM(RTRIM(ISNULL(m.Roles, N'')))),
    @Department = LTRIM(RTRIM(ISNULL(m.Department, N'')))
FROM dbo.Master_ConcernedSE m
WHERE LOWER(
          REPLACE(
              REPLACE(LTRIM(RTRIM(ISNULL(m.EmailId, N''))), N'@almcg.com', N'@almoayyedcg.com'),
              N'@ALMCG.COM',
              N'@almoayyedcg.com'
          )
      ) = @NormEmail;

DECLARE @IsAdmin BIT =
    CASE
        WHEN @Roles LIKE N'%admin%' OR @Roles LIKE N'%system%' THEN 1
        ELSE 0
    END;

DECLARE @IsCcUser BIT =
    CASE
        WHEN EXISTS (
            SELECT 1
            FROM dbo.Master_EnquiryFor mef
            WHERE N',' + REPLACE(REPLACE(ISNULL(mef.CCMailIds, N''), N' ', N''), N';', N',') + N','
                  LIKE @CcPattern
        ) THEN 1
        ELSE 0
    END;

/* --- Result 1: access --- */
SELECT
    @UserEmail AS InputEmail,
    @NormEmail AS NormEmail,
    CASE WHEN @FullName IS NULL AND @Roles IS NULL THEN 0 ELSE 1 END AS UserFoundInMaster,
    @FullName AS MasterFullName,
    @Department AS MasterDepartment,
    @Roles AS RolesLower,
    @IsAdmin AS IsAdmin,
    @IsCcUser AS IsCcUser;

/* Department substring match (rough align with pricing anchors) */
DECLARE @DeptLike NVARCHAR(500) =
    N'%' + LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(@Department, N''), N'Project', N''), N' ', N'')))) + N'%';

/* --- Result 2: enquiry list (same branches as API) --- */
IF @IsAdmin = 1
BEGIN
    SELECT
        N'admin: all enquiries (no ConcernedSE filter)' AS Branch,
        E.RequestNo,
        E.ProjectName,
        E.CustomerName,
        E.Status,
        E.DueDate
    FROM dbo.EnquiryMaster E
    WHERE 1 = 1
    ORDER BY E.DueDate DESC, E.RequestNo DESC;
END
ELSE IF @IsCcUser = 1
BEGIN
    SELECT
        N'cc: CCMailIds OR ConcernedSE' AS Branch,
        E.RequestNo,
        E.ProjectName,
        E.CustomerName,
        E.Status,
        E.DueDate
    FROM dbo.EnquiryMaster E
    WHERE 1 = 1
      AND (
          EXISTS (
              SELECT 1
              FROM dbo.EnquiryFor ef
              INNER JOIN dbo.Master_EnquiryFor mef
                  ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE N'% - ' + mef.ItemName)
              WHERE ef.RequestNo = E.RequestNo
                AND N',' + REPLACE(REPLACE(ISNULL(mef.CCMailIds, N''), N' ', N''), N';', N',') + N','
                      LIKE @CcPattern
          )
          OR EXISTS (
              SELECT 1
              FROM dbo.ConcernedSE c
              INNER JOIN dbo.Master_ConcernedSE m
                  ON UPPER(LTRIM(RTRIM(ISNULL(m.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(c.SEName, N''))))
              WHERE c.RequestNo = E.RequestNo
                AND LOWER(
                    REPLACE(
                        REPLACE(LTRIM(RTRIM(ISNULL(m.EmailId, N''))), N'@almcg.com', N'@almoayyedcg.com'),
                        N'@ALMCG.COM',
                        N'@almoayyedcg.com'
                    )
                ) = @NormEmail
          )
      )
    ORDER BY E.DueDate DESC, E.RequestNo DESC;
END
ELSE
BEGIN
    SELECT
        N'se: ConcernedSE + Master email = ' + @NormEmail AS Branch,
        E.RequestNo,
        E.ProjectName,
        E.CustomerName,
        E.Status,
        E.DueDate
    FROM dbo.EnquiryMaster E
    WHERE 1 = 1
      AND EXISTS (
          SELECT 1
          FROM dbo.ConcernedSE c
          INNER JOIN dbo.Master_ConcernedSE m
              ON UPPER(LTRIM(RTRIM(ISNULL(m.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(c.SEName, N''))))
          WHERE c.RequestNo = E.RequestNo
            AND LOWER(
                REPLACE(
                    REPLACE(LTRIM(RTRIM(ISNULL(m.EmailId, N''))), N'@almcg.com', N'@almoayyedcg.com'),
                    N'@ALMCG.COM',
                    N'@almoayyedcg.com'
                )
            ) = @NormEmail
      )
    ORDER BY E.DueDate DESC, E.RequestNo DESC;
END;

/* --- Result 3–5: spec diagnostics (only for non-admin SE with a department) --- */
/* CTEs only apply to a single T-SQL statement; we use #ScopedEnq for multiple result sets. */
IF @IsAdmin = 0 AND @IsCcUser = 0 AND LEN(LTRIM(RTRIM(ISNULL(@Department, N'')))) > 0
BEGIN
    IF OBJECT_ID(N'tempdb..#ScopedEnq', N'U') IS NOT NULL DROP TABLE #ScopedEnq;

    SELECT
        E.RequestNo
    INTO #ScopedEnq
    FROM dbo.EnquiryMaster E
    WHERE EXISTS (
        SELECT 1
        FROM dbo.ConcernedSE c
        INNER JOIN dbo.Master_ConcernedSE m
            ON UPPER(LTRIM(RTRIM(ISNULL(m.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(c.SEName, N''))))
        WHERE c.RequestNo = E.RequestNo
          AND LOWER(
                REPLACE(
                    REPLACE(LTRIM(RTRIM(ISNULL(m.EmailId, N''))), N'@almcg.com', N'@almoayyedcg.com'),
                    N'@ALMCG.COM',
                    N'@almoayyedcg.com'
                )
            ) = @NormEmail
    );

    /* Result 3: internal slots (spec 4a.i) */
    SELECT DISTINCT
        N'Internal slots (spec 4a.i)' AS Section,
        CAST(J.RequestNo AS NVARCHAR(50)) AS RequestNo,
        LTRIM(
            RTRIM(
                COALESCE(
                    NULLIF(LTRIM(RTRIM(ISNULL(P.ItemName, N''))), N''),
                    LTRIM(RTRIM(ISNULL(J.ItemName, N'')))
                )
            )
        ) AS InternalParentCustomer,
        LTRIM(
            RTRIM(
                COALESCE(
                    NULLIF(LTRIM(RTRIM(ISNULL(P.LeadJobName, N''))), N''),
                    LTRIM(RTRIM(ISNULL(J.LeadJobName, N'')))
                )
            )
        ) AS InternalLeadJobName,
        J.ID AS DeptJobId,
        P.ID AS ParentJobId
    FROM dbo.EnquiryFor J
    INNER JOIN #ScopedEnq S ON S.RequestNo = J.RequestNo
    LEFT JOIN dbo.EnquiryFor P
        ON P.RequestNo = J.RequestNo
        AND J.ParentID IS NOT NULL
        AND LTRIM(RTRIM(CONVERT(NVARCHAR(50), J.ParentID))) NOT IN (N'', N'0')
        AND P.ID = J.ParentID
    WHERE LOWER(LTRIM(RTRIM(ISNULL(J.ItemName, N'')))) LIKE @DeptLike
    ORDER BY RequestNo, InternalParentCustomer;

    /* Result 4: EnquiryCustomer (spec 4a.ii) — same predicate as old LeadJobRows CTE, inlined */
    SELECT
        N'EnquiryCustomer externals (spec 4a.ii, only if lead row exists)' AS Section,
        EC.RequestNo,
        EC.CustomerName
    FROM dbo.EnquiryCustomer EC
    WHERE EXISTS (
        SELECT 1
        FROM dbo.EnquiryFor L
        INNER JOIN #ScopedEnq S ON S.RequestNo = L.RequestNo
        WHERE L.RequestNo = EC.RequestNo
          AND LOWER(LTRIM(RTRIM(ISNULL(L.ItemName, N'')))) LIKE @DeptLike
          AND LTRIM(RTRIM(ISNULL(L.ItemName, N''))) <> N''
          AND LTRIM(RTRIM(ISNULL(L.LeadJobName, N''))) <> N''
          AND LOWER(LTRIM(RTRIM(L.ItemName))) = LOWER(LTRIM(RTRIM(L.LeadJobName)))
    )
    ORDER BY EC.RequestNo, EC.CustomerName;

    /* Result 5: base prices for scoped enquiries */
    SELECT
        N'Base Price rows (EnquiryPricingValues) for scoped enquiries' AS Section,
        V.RequestNo,
        V.ID,
        V.CustomerName,
        V.LeadJobName,
        V.EnquiryForItem,
        V.Price,
        V.PriceOption,
        V.UpdatedAt
    FROM dbo.EnquiryPricingValues V
    INNER JOIN #ScopedEnq S ON S.RequestNo = V.RequestNo
    WHERE
        ISNULL(
            TRY_CONVERT(
                FLOAT,
                REPLACE(REPLACE(LTRIM(RTRIM(CAST(V.Price AS NVARCHAR(200)))), N',', N''), N' ', N'')
            ),
            0
        ) > 0
        AND (
            LOWER(LTRIM(RTRIM(ISNULL(V.PriceOption, N'')))) = N'base price'
            OR LOWER(LTRIM(RTRIM(ISNULL(V.PriceOption, N'')))) LIKE N'base price%'
        )
    ORDER BY V.RequestNo, V.ID;
END
ELSE
BEGIN
    SELECT
        N'Skip spec diagnostics: admin/CC user or blank Master.Department — use API/legacy pending only.' AS Message,
        @IsAdmin AS IsAdmin,
        @IsCcUser AS IsCcUser,
        @Department AS DepartmentRaw;
END;
