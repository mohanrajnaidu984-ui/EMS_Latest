/*
  Diagnostic SQL for the Quote module "Pending Quote" summary (GET /api/quotes/list/pending).

  Source of truth: server/lib/pendingQuoteListQuery.js (runPendingQuoteListQuery).
  Access + department: server/lib/quotePricingAccess.js (resolvePricingAccessContext).

  1) Set @UserEmail to the exact address shown in the app header (top right).
     Default: bmi.mathew@almoayyedcg.com — change @UserEmail if needed.
  2) Run the whole script. First result set = access flags; second = pending tuples the API loads
     before mapQuoteListingRows / shouldOmitFromPendingQuoteList.
  3) If the first result set shows UserFound = 0, the Node API returns [] without running the main query
     (same as: no row in Master_ConcernedSE for that EmailId).
*/

DECLARE @UserEmail NVARCHAR(320) = N'bmi.mathew@almoayyedcg.com';

DECLARE @NormEmail NVARCHAR(320) =
    LOWER(
        REPLACE(
            REPLACE(LTRIM(RTRIM(@UserEmail)), N'@almcg.com', N'@almoayyedcg.com'),
            N'@ALMCG.COM',
            N'@almoayyedcg.com'
        )
    );

DECLARE @FullName NVARCHAR(500);
DECLARE @Roles NVARCHAR(500);
DECLARE @Dept NVARCHAR(500);

SELECT
    @FullName = LTRIM(RTRIM(ISNULL(m.FullName, N''))),
    @Roles = LOWER(LTRIM(RTRIM(ISNULL(m.Roles, N'')))),
    @Dept = LTRIM(RTRIM(ISNULL(m.Department, N'')))
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
                  LIKE N'%,' + @NormEmail + N',%'
        ) THEN 1
        ELSE 0
    END;

/* Strip leading "L1 - " / "Sub Job - " from Department (same idea as normalizePricingJobName in JS). */
DECLARE @DeptNorm NVARCHAR(500) =
    LOWER(
        LTRIM(
            RTRIM(
                CASE
                    WHEN PATINDEX(N'L[0-9]%', @Dept) = 1 AND CHARINDEX(N' - ', @Dept) > 0 THEN
                        SUBSTRING(@Dept, CHARINDEX(N' - ', @Dept) + 3, 500)
                    WHEN @Dept LIKE N'Sub Job%' AND CHARINDEX(N' - ', @Dept) > 0 THEN
                        SUBSTRING(@Dept, CHARINDEX(N' - ', @Dept) + 3, 500)
                    ELSE @Dept
                END
            )
        )
    );

DECLARE @HasDeptScope BIT =
    CASE
        WHEN LEN(LTRIM(RTRIM(ISNULL(@Dept, N'')))) > 0 OR LEN(LTRIM(RTRIM(ISNULL(@DeptNorm, N'')))) > 0 THEN 1
        ELSE 0
    END;

SELECT
    @NormEmail AS NormEmail,
    CASE WHEN @FullName IS NULL THEN 0 ELSE 1 END AS UserFound,
    @FullName AS MasterFullName,
    @Roles AS RolesLower,
    @Dept AS DepartmentRaw,
    @DeptNorm AS DepartmentNorm,
    @IsAdmin AS IsAdmin,
    @IsCcUser AS IsCcUser,
    @HasDeptScope AS HasDeptScope;

IF @FullName IS NULL
BEGIN
    SELECT N'No Master_ConcernedSE row for this email — API returns empty pending list.' AS Message;
    RETURN;
END;

IF @IsAdmin = 1
BEGIN
    /* Admin branch: no department / ConcernedSE gate on EnquiryMaster (pendingQuoteListQuery.js ~327). */
    SELECT DISTINCT
        E.RequestNo,
        E.ProjectName,
        E.Status,
        E.DueDate,
        LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N''))) AS ListPendingOwnJobItem,
        LTRIM(RTRIM(ISNULL(PV.LeadJobName, N''))) AS ListPendingLeadJobName,
        LTRIM(RTRIM(ISNULL(PV.CustomerName, N''))) AS ListPendingCustomerName,
        ISNULL(PV.ID, 0) AS ListPendingPvId
    FROM dbo.EnquiryMaster E
    INNER JOIN dbo.EnquiryPricingOptions PO ON E.RequestNo = PO.RequestNo
    INNER JOIN dbo.EnquiryPricingValues PV ON PO.ID = PV.OptionID
    INNER JOIN dbo.EnquiryFor EF ON E.RequestNo = EF.RequestNo
    WHERE PV.Price > 0
      AND LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N''))) <> N''
      AND LTRIM(RTRIM(ISNULL(PV.LeadJobName, N''))) <> N''
      AND LTRIM(RTRIM(ISNULL(PV.CustomerName, N''))) <> N''
      AND EXISTS (
          SELECT 1
          FROM dbo.Master_EnquiryFor MEF
          WHERE (
              EF.ItemName = MEF.ItemName
              OR EF.ItemName LIKE N'%- ' + MEF.ItemName
              OR MEF.ItemName LIKE N'%' + EF.ItemName + N'%'
          )
      )
      AND (
          EF.ItemName = PO.ItemName
          OR EF.ItemName LIKE PO.ItemName + N'%'
          OR PO.ItemName LIKE EF.ItemName + N'%'
      )
      AND (
          (PV.EnquiryForID IS NOT NULL AND PV.EnquiryForID <> 0 AND PV.EnquiryForID = EF.ID)
          OR (
              (PV.EnquiryForID IS NULL OR PV.EnquiryForID = 0)
              AND LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N''))) = LTRIM(RTRIM(ISNULL(EF.ItemName, N'')))
          )
      )
      AND NOT EXISTS (
          SELECT 1
          FROM dbo.EnquiryPricingValues PVN
          WHERE PVN.RequestNo = PV.RequestNo
            AND LTRIM(RTRIM(ISNULL(PVN.EnquiryForItem, N''))) = LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N'')))
            AND LTRIM(RTRIM(ISNULL(PVN.LeadJobName, N''))) = LTRIM(RTRIM(ISNULL(PV.LeadJobName, N'')))
            AND LTRIM(RTRIM(ISNULL(PVN.CustomerName, N''))) = LTRIM(RTRIM(ISNULL(PV.CustomerName, N'')))
            AND (
                  ISNULL(PVN.UpdatedAt, '19000101') > ISNULL(PV.UpdatedAt, '19000101')
                  OR (
                      ISNULL(PVN.UpdatedAt, '19000101') = ISNULL(PV.UpdatedAt, '19000101')
                      AND ISNULL(PVN.ID, 0) > ISNULL(PV.ID, 0)
                  )
            )
      )
      AND NOT EXISTS (
          SELECT 1
          FROM dbo.EnquiryQuotes EQ
          WHERE EQ.RequestNo = E.RequestNo
            AND (
                LOWER(LTRIM(RTRIM(ISNULL(EQ.OwnJob, N'')))) = LOWER(LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N''))))
                OR (
                    LOWER(LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N'')))) LIKE LOWER(LTRIM(RTRIM(ISNULL(EQ.OwnJob, N'')))) + N'-%'
                    OR LOWER(LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N'')))) LIKE LOWER(LTRIM(RTRIM(ISNULL(EQ.OwnJob, N'')))) + N' %'
                )
                OR (
                    LOWER(LTRIM(RTRIM(ISNULL(EQ.OwnJob, N'')))) LIKE LOWER(LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N'')))) + N'-%'
                    OR LOWER(LTRIM(RTRIM(ISNULL(EQ.OwnJob, N'')))) LIKE LOWER(LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N'')))) + N' %'
                )
                OR (
                    LEN(LOWER(LTRIM(RTRIM(ISNULL(EQ.OwnJob, N''))))) >= 3
                    AND LEN(LOWER(LTRIM(RTRIM(ISNULL(EQ.OwnJob, N''))))) <= 80
                    AND LOWER(LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N'')))) LIKE N'%' + LOWER(LTRIM(RTRIM(ISNULL(EQ.OwnJob, N'')))) + N'%'
                )
            )
            AND (
                LOWER(LTRIM(RTRIM(ISNULL(EQ.LeadJob, N'')))) = LOWER(LTRIM(RTRIM(ISNULL(PV.LeadJobName, N''))))
                OR (
                    LOWER(LTRIM(RTRIM(ISNULL(PV.LeadJobName, N'')))) LIKE LOWER(LTRIM(RTRIM(ISNULL(EQ.LeadJob, N'')))) + N'-%'
                    OR LOWER(LTRIM(RTRIM(ISNULL(PV.LeadJobName, N'')))) LIKE LOWER(LTRIM(RTRIM(ISNULL(EQ.LeadJob, N'')))) + N' %'
                )
                OR (
                    LOWER(LTRIM(RTRIM(ISNULL(EQ.LeadJob, N'')))) LIKE LOWER(LTRIM(RTRIM(ISNULL(PV.LeadJobName, N'')))) + N'-%'
                    OR LOWER(LTRIM(RTRIM(ISNULL(EQ.LeadJob, N'')))) LIKE LOWER(LTRIM(RTRIM(ISNULL(PV.LeadJobName, N'')))) + N' %'
                )
                OR (
                    LEN(LOWER(LTRIM(RTRIM(ISNULL(EQ.LeadJob, N''))))) >= 2
                    AND LEN(LOWER(LTRIM(RTRIM(ISNULL(EQ.LeadJob, N''))))) <= 14
                    AND LOWER(LTRIM(RTRIM(ISNULL(EQ.LeadJob, N'')))) LIKE N'l[0-9]%'
                    AND CHARINDEX(LOWER(LTRIM(RTRIM(ISNULL(EQ.LeadJob, N'')))) + N')', LOWER(LTRIM(RTRIM(ISNULL(PV.LeadJobName, N''))))) > 0
                )
            )
            AND (
                LOWER(
                    LTRIM(
                        RTRIM(
                            CASE
                                WHEN PATINDEX(N'% (L[0-9]%', LTRIM(RTRIM(ISNULL(EQ.ToName, N'')))) > 0
                                     AND RIGHT(RTRIM(LTRIM(RTRIM(ISNULL(EQ.ToName, N''))))), 1) = N')'
                                    THEN RTRIM(
                                        LEFT(
                                            LTRIM(RTRIM(ISNULL(EQ.ToName, N''))),
                                            (
                                                LEN(LTRIM(RTRIM(ISNULL(EQ.ToName, N''))))
                                                - CHARINDEX(N'(', REVERSE(LTRIM(RTRIM(ISNULL(EQ.ToName, N'')))))
                                                + 1
                                            )
                                              - 2
                                        )
                                    )
                                ELSE LTRIM(RTRIM(ISNULL(EQ.ToName, N'')))
                            END
                        )
                    )
                )
                = LOWER(
                    LTRIM(
                        RTRIM(
                            CASE
                                WHEN PATINDEX(N'% (L[0-9]%', LTRIM(RTRIM(ISNULL(PV.CustomerName, N'')))) > 0
                                     AND RIGHT(RTRIM(LTRIM(RTRIM(ISNULL(PV.CustomerName, N''))))), 1) = N')'
                                    THEN RTRIM(
                                        LEFT(
                                            LTRIM(RTRIM(ISNULL(PV.CustomerName, N''))),
                                            (
                                                LEN(LTRIM(RTRIM(ISNULL(PV.CustomerName, N''))))
                                                - CHARINDEX(N'(', REVERSE(LTRIM(RTRIM(ISNULL(PV.CustomerName, N'')))))
                                                + 1
                                            )
                                              - 2
                                        )
                                    )
                                ELSE LTRIM(RTRIM(ISNULL(PV.CustomerName, N'')))
                            END
                        )
                    )
                )
            )
      )
    ORDER BY E.DueDate DESC, E.RequestNo DESC;
    RETURN;
END;

/* Non-admin (Concerned SE + CC): same gates as pendingQuoteListQuery.js — CC users skip ConcernedSE assignment EXISTS. */
SELECT DISTINCT
    E.RequestNo,
    E.ProjectName,
    E.Status,
    E.DueDate,
    LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N''))) AS ListPendingOwnJobItem,
    LTRIM(RTRIM(ISNULL(PV.LeadJobName, N''))) AS ListPendingLeadJobName,
    LTRIM(RTRIM(ISNULL(PV.CustomerName, N''))) AS ListPendingCustomerName,
    ISNULL(PV.ID, 0) AS ListPendingPvId
FROM dbo.EnquiryMaster E
INNER JOIN dbo.EnquiryPricingOptions PO ON E.RequestNo = PO.RequestNo
INNER JOIN dbo.EnquiryPricingValues PV ON PO.ID = PV.OptionID
INNER JOIN dbo.EnquiryFor EF ON E.RequestNo = EF.RequestNo
WHERE PV.Price > 0
  AND LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N''))) <> N''
  AND LTRIM(RTRIM(ISNULL(PV.LeadJobName, N''))) <> N''
  AND LTRIM(RTRIM(ISNULL(PV.CustomerName, N''))) <> N''
  AND EXISTS (
      SELECT 1
      FROM dbo.Master_EnquiryFor MEF
      WHERE (
          EF.ItemName = MEF.ItemName
          OR EF.ItemName LIKE N'%- ' + MEF.ItemName
          OR EF.ItemName LIKE N'%- ' + MEF.DivisionCode
          OR MEF.ItemName LIKE N'%' + EF.ItemName + N'%'
      )
        AND (
            @HasDeptScope = 0
            OR (
                LOWER(LTRIM(RTRIM(MEF.ItemName))) LIKE N'%' + LOWER(LTRIM(RTRIM(@Dept))) + N'%'
                OR LOWER(LTRIM(RTRIM(EF.ItemName))) LIKE N'%' + LOWER(LTRIM(RTRIM(@Dept))) + N'%'
                OR (
                    LEN(LTRIM(RTRIM(ISNULL(@DeptNorm, N'')))) > 0
                    AND (
                        LOWER(LTRIM(RTRIM(MEF.ItemName))) LIKE N'%' + @DeptNorm + N'%'
                        OR LOWER(LTRIM(RTRIM(EF.ItemName))) LIKE N'%' + @DeptNorm + N'%'
                    )
                )
            )
        )
        AND (
            @IsCcUser = 0
            OR REPLACE(ISNULL(MEF.CCMailIds, N''), N'@almcg.com', N'@almoayyedcg.com') LIKE N'%' + @NormEmail + N'%'
        )
  )
  AND (
      @IsCcUser = 1
      OR EXISTS (
          SELECT 1
          FROM dbo.ConcernedSE cs
          INNER JOIN dbo.Master_ConcernedSE m
            ON UPPER(LTRIM(RTRIM(ISNULL(m.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(cs.SEName, N''))))
          WHERE LTRIM(RTRIM(ISNULL(cs.RequestNo, N''))) = LTRIM(RTRIM(ISNULL(E.RequestNo, N'')))
            AND LOWER(
                REPLACE(
                    REPLACE(LTRIM(RTRIM(ISNULL(m.EmailId, N''))), N'@almcg.com', N'@almoayyedcg.com'),
                    N'@ALMCG.COM',
                    N'@almoayyedcg.com'
                )
            ) = @NormEmail
      )
  )
  AND (
      EF.ItemName = PO.ItemName
      OR EF.ItemName LIKE PO.ItemName + N'%'
      OR PO.ItemName LIKE EF.ItemName + N'%'
  )
  AND (
      (PV.EnquiryForID IS NOT NULL AND PV.EnquiryForID <> 0 AND PV.EnquiryForID = EF.ID)
      OR (
          (PV.EnquiryForID IS NULL OR PV.EnquiryForID = 0)
          AND LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N''))) = LTRIM(RTRIM(ISNULL(EF.ItemName, N'')))
      )
  )
  AND NOT EXISTS (
      SELECT 1
      FROM dbo.EnquiryPricingValues PVN
      WHERE PVN.RequestNo = PV.RequestNo
        AND LTRIM(RTRIM(ISNULL(PVN.EnquiryForItem, N''))) = LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N'')))
        AND LTRIM(RTRIM(ISNULL(PVN.LeadJobName, N''))) = LTRIM(RTRIM(ISNULL(PV.LeadJobName, N'')))
        AND LTRIM(RTRIM(ISNULL(PVN.CustomerName, N''))) = LTRIM(RTRIM(ISNULL(PV.CustomerName, N'')))
        AND (
              ISNULL(PVN.UpdatedAt, '19000101') > ISNULL(PV.UpdatedAt, '19000101')
              OR (
                  ISNULL(PVN.UpdatedAt, '19000101') = ISNULL(PV.UpdatedAt, '19000101')
                  AND ISNULL(PVN.ID, 0) > ISNULL(PV.ID, 0)
              )
        )
  )
  AND NOT EXISTS (
      SELECT 1
      FROM dbo.EnquiryQuotes EQ
      WHERE EQ.RequestNo = E.RequestNo
        AND (
            LOWER(LTRIM(RTRIM(ISNULL(EQ.OwnJob, N'')))) = LOWER(LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N''))))
            OR (
                LOWER(LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N'')))) LIKE LOWER(LTRIM(RTRIM(ISNULL(EQ.OwnJob, N'')))) + N'-%'
                OR LOWER(LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N'')))) LIKE LOWER(LTRIM(RTRIM(ISNULL(EQ.OwnJob, N'')))) + N' %'
            )
            OR (
                LOWER(LTRIM(RTRIM(ISNULL(EQ.OwnJob, N'')))) LIKE LOWER(LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N'')))) + N'-%'
                OR LOWER(LTRIM(RTRIM(ISNULL(EQ.OwnJob, N'')))) LIKE LOWER(LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N'')))) + N' %'
            )
            OR (
                LEN(LOWER(LTRIM(RTRIM(ISNULL(EQ.OwnJob, N''))))) >= 3
                AND LEN(LOWER(LTRIM(RTRIM(ISNULL(EQ.OwnJob, N''))))) <= 80
                AND LOWER(LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N'')))) LIKE N'%' + LOWER(LTRIM(RTRIM(ISNULL(EQ.OwnJob, N'')))) + N'%'
            )
        )
        AND (
            LOWER(LTRIM(RTRIM(ISNULL(EQ.LeadJob, N'')))) = LOWER(LTRIM(RTRIM(ISNULL(PV.LeadJobName, N''))))
            OR (
                LOWER(LTRIM(RTRIM(ISNULL(PV.LeadJobName, N'')))) LIKE LOWER(LTRIM(RTRIM(ISNULL(EQ.LeadJob, N'')))) + N'-%'
                OR LOWER(LTRIM(RTRIM(ISNULL(PV.LeadJobName, N'')))) LIKE LOWER(LTRIM(RTRIM(ISNULL(EQ.LeadJob, N'')))) + N' %'
            )
            OR (
                LOWER(LTRIM(RTRIM(ISNULL(EQ.LeadJob, N'')))) LIKE LOWER(LTRIM(RTRIM(ISNULL(PV.LeadJobName, N'')))) + N'-%'
                OR LOWER(LTRIM(RTRIM(ISNULL(EQ.LeadJob, N'')))) LIKE LOWER(LTRIM(RTRIM(ISNULL(PV.LeadJobName, N'')))) + N' %'
            )
            OR (
                LEN(LOWER(LTRIM(RTRIM(ISNULL(EQ.LeadJob, N''))))) >= 2
                AND LEN(LOWER(LTRIM(RTRIM(ISNULL(EQ.LeadJob, N''))))) <= 14
                AND LOWER(LTRIM(RTRIM(ISNULL(EQ.LeadJob, N'')))) LIKE N'l[0-9]%'
                AND CHARINDEX(LOWER(LTRIM(RTRIM(ISNULL(EQ.LeadJob, N'')))) + N')', LOWER(LTRIM(RTRIM(ISNULL(PV.LeadJobName, N''))))) > 0
            )
        )
        AND (
            LOWER(
                LTRIM(
                    RTRIM(
                        CASE
                            WHEN PATINDEX(N'% (L[0-9]%', LTRIM(RTRIM(ISNULL(EQ.ToName, N'')))) > 0
                                 AND RIGHT(RTRIM(LTRIM(RTRIM(ISNULL(EQ.ToName, N''))))), 1) = N')'
                                THEN RTRIM(
                                    LEFT(
                                        LTRIM(RTRIM(ISNULL(EQ.ToName, N''))),
                                        (
                                            LEN(LTRIM(RTRIM(ISNULL(EQ.ToName, N''))))
                                            - CHARINDEX(N'(', REVERSE(LTRIM(RTRIM(ISNULL(EQ.ToName, N'')))))
                                            + 1
                                        )
                                          - 2
                                    )
                                )
                            ELSE LTRIM(RTRIM(ISNULL(EQ.ToName, N'')))
                        END
                    )
                )
            )
            = LOWER(
                LTRIM(
                    RTRIM(
                        CASE
                            WHEN PATINDEX(N'% (L[0-9]%', LTRIM(RTRIM(ISNULL(PV.CustomerName, N'')))) > 0
                                 AND RIGHT(RTRIM(LTRIM(RTRIM(ISNULL(PV.CustomerName, N''))))), 1) = N')'
                                THEN RTRIM(
                                    LEFT(
                                        LTRIM(RTRIM(ISNULL(PV.CustomerName, N''))),
                                        (
                                            LEN(LTRIM(RTRIM(ISNULL(PV.CustomerName, N''))))
                                            - CHARINDEX(N'(', REVERSE(LTRIM(RTRIM(ISNULL(PV.CustomerName, N'')))))
                                            + 1
                                        )
                                          - 2
                                    )
                                )
                            ELSE LTRIM(RTRIM(ISNULL(PV.CustomerName, N'')))
                        END
                    )
                )
            )
        )
  )
ORDER BY E.DueDate DESC, E.RequestNo DESC;

/* If the list above is empty, check assignment on a known enquiry (e.g. 16): */
SELECT
    cs.RequestNo,
    cs.SEName,
    m.EmailId AS MasterEmail,
    LOWER(
        REPLACE(
            REPLACE(LTRIM(RTRIM(ISNULL(m.EmailId, N''))), N'@almcg.com', N'@almoayyedcg.com'),
            N'@ALMCG.COM',
            N'@almoayyedcg.com'
        )
    ) AS MasterEmailNorm
FROM dbo.ConcernedSE cs
INNER JOIN dbo.Master_ConcernedSE m
  ON UPPER(LTRIM(RTRIM(ISNULL(m.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(cs.SEName, N''))))
WHERE LTRIM(RTRIM(ISNULL(cs.RequestNo, N''))) IN (N'16')
  AND LOWER(
      REPLACE(
          REPLACE(LTRIM(RTRIM(ISNULL(m.EmailId, N''))), N'@almcg.com', N'@almoayyedcg.com'),
          N'@ALMCG.COM',
          N'@almoayyedcg.com'
      )
  ) = @NormEmail;
