/*
  Step-1 SQL for GET /api/pricing/list/pending?userEmail=… (enquiry rows before Node pending filter).

  Source: server/routes/pricing.js → getEnquiryPricingList (baseQuery only).
  - No filter on EnquiryMaster.Status (API uses WHERE 1=1 + access EXISTS only).
  - CC users: CCMailIds on Master_EnquiryFor OR ConcernedSE+Master email (same as app).

  Default @UserEmail: aacqs2@almoayyedcg.com — change as needed.

  The UI "Pending Pricing" list then drops enquiries where getEnquiryPricingList finds no pending
  gaps. For Concerned SE (non-admin, non-CC) with a Master department, pending uses
  server/lib/pendingPricingSummarySpec.js (internal parent + EnquiryCustomer externals + Base Price rows).
  Otherwise legacy checks apply (pendingFromVisibleJobsBase, pendingStrictBaseMissing,
  pendingExternalCustomerDirectGap). This script does NOT replicate the Node filter.
*/

DECLARE @UserEmail NVARCHAR(320) = N'aacqs2@almoayyedcg.com';

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

SELECT
    @NormEmail AS NormEmail,
    CASE WHEN @FullName IS NULL AND @Roles IS NULL THEN 0 ELSE 1 END AS UserFoundInMaster,
    @FullName AS MasterFullName,
    @Department AS MasterDepartment,
    @Roles AS RolesLower,
    @IsAdmin AS IsAdmin,
    @IsCcUser AS IsCcUser;

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
    WHERE 1 = 1
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
        E.RequestNo,
        E.ProjectName,
        E.CustomerName,
        E.Status,
        E.DueDate,
        E.EnquiryDate,
        E.CreatedBy
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
