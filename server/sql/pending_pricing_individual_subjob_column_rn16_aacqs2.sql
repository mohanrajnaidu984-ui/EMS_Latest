/*
  "Individual & Subjob Base prices" (Pending Pricing column 4) for Enquiry 16, user aacqs2@almoayyedcg.com

  The on-screen tree (parent line + "→" subjob lines, BD amounts, times, priced-by) is built in
  server/routes/pricing.js → getEnquiryPricingList: JSON field PricingListDisplayJson = { customerTotals, jobForest }.
  There is no single SQL that reproduces jobForest; use this script to load the SAME raw rows the API uses.

  Run each section in order. Section 4 matches EnquiryPricingValues + MatchedEnquiryFor from pricing.js.
*/

DECLARE @RequestNo INT = 16;
DECLARE @UserEmail NVARCHAR(320) = N'aacqs2@almoayyedcg.com';

DECLARE @NormEmail NVARCHAR(320) =
    LOWER(
        REPLACE(
            REPLACE(LTRIM(RTRIM(@UserEmail)), N'@almcg.com', N'@almoayyedcg.com'),
            N'@ALMCG.COM',
            N'@almoayyedcg.com'
        )
    );

/* ---- 1) User profile (Master_ConcernedSE.Department drives visibility / anchors) ---- */
SELECT
    m.FullName,
    m.Roles,
    m.Department,
    m.EmailId
FROM dbo.Master_ConcernedSE m
WHERE LOWER(
          REPLACE(
              REPLACE(LTRIM(RTRIM(ISNULL(m.EmailId, N''))), N'@almcg.com', N'@almoayyedcg.com'),
              N'@ALMCG.COM',
              N'@almoayyedcg.com'
          )
      ) = @NormEmail;

/* ---- 2) This user on ConcernedSE for this enquiry? (if no rows, list API will not return this enquiry for SE path) ---- */
SELECT
    c.RequestNo,
    c.SEName,
    m.EmailId,
    m.Department
FROM dbo.ConcernedSE c
INNER JOIN dbo.Master_ConcernedSE m
    ON UPPER(LTRIM(RTRIM(ISNULL(m.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(c.SEName, N''))))
WHERE c.RequestNo = @RequestNo
  AND LOWER(
          REPLACE(
              REPLACE(LTRIM(RTRIM(ISNULL(m.EmailId, N''))), N'@almcg.com', N'@almoayyedcg.com'),
              N'@ALMCG.COM',
              N'@almoayyedcg.com'
          )
      ) = @NormEmail;

/* ---- 3) EnquiryFor tree (ItemName, ParentID, LeadJobName — structure for jobForest) ---- */
SELECT
    EF.ID,
    EF.RequestNo,
    EF.ParentID,
    EF.ItemName,
    EF.LeadJobCode,
    EF.LeadJobName,
    MEF.CCMailIds
FROM dbo.EnquiryFor EF
LEFT JOIN dbo.Master_EnquiryFor MEF
    ON (EF.ItemName = MEF.ItemName OR EF.ItemName LIKE N'% - ' + MEF.ItemName)
WHERE EF.RequestNo = @RequestNo
ORDER BY EF.ID;

/* ---- 4) EnquiryCustomer (externals for headers / multi-customer trees) ---- */
SELECT RequestNo, CustomerName
FROM dbo.EnquiryCustomer
WHERE RequestNo = @RequestNo
ORDER BY CustomerName;

/* ---- 5) EnquiryPricingValues with MatchedEnquiryFor (same as getEnquiryPricingList in pricing.js) ---- */
SELECT
    v.ID,
    v.RequestNo,
    v.OptionID,
    v.EnquiryForID,
    v.EnquiryForItem,
    v.Price,
    v.UpdatedAt,
    v.UpdatedBy,
    v.PriceOption,
    v.CustomerName,
    v.LeadJobName,
    m.MatchedEnquiryForId,
    m.MatchedItemName,
    m.MatchedParentId
FROM dbo.EnquiryPricingValues v
OUTER APPLY (
    SELECT TOP 1
        ef.ID AS MatchedEnquiryForId,
        ef.ItemName AS MatchedItemName,
        ef.ParentID AS MatchedParentId
    FROM dbo.EnquiryFor ef
    WHERE ef.RequestNo = v.RequestNo
      AND (
            (v.EnquiryForID IS NOT NULL AND v.EnquiryForID <> 0 AND v.EnquiryForID = ef.ID)
         OR (
                LTRIM(RTRIM(ISNULL(v.EnquiryForItem, N''))) <> N''
            AND LTRIM(RTRIM(v.EnquiryForItem)) = LTRIM(RTRIM(ef.ItemName))
            )
        )
    ORDER BY
        CASE WHEN v.EnquiryForID IS NOT NULL AND v.EnquiryForID <> 0 AND v.EnquiryForID = ef.ID THEN 0 ELSE 1 END,
        ef.ID
) AS m
WHERE v.RequestNo = @RequestNo
ORDER BY v.ID;

/* ---- 6) Base Price rows only (what usually feeds the column; app also maps OptionID → name) ---- */
SELECT
    v.ID,
    v.CustomerName,
    v.LeadJobName,
    v.EnquiryForItem,
    v.Price,
    v.PriceOption,
    v.UpdatedAt,
    v.UpdatedBy
FROM dbo.EnquiryPricingValues v
WHERE v.RequestNo = @RequestNo
  /* Price may be money/decimal OR nvarchar — always CAST to string before LTRIM/TRY_CONVERT to avoid 8114 */
  AND ISNULL(
      TRY_CONVERT(
          FLOAT,
          REPLACE(REPLACE(LTRIM(RTRIM(CAST(v.Price AS NVARCHAR(200)))), N',', N''), N' ', N'')
      ),
      0
  ) > 0
  AND (
      LOWER(LTRIM(RTRIM(ISNULL(v.PriceOption, N'')))) = N'base price'
      OR LOWER(LTRIM(RTRIM(ISNULL(v.PriceOption, N'')))) LIKE N'base price%'
  )
ORDER BY v.ID;
