-- Check Enquiry 43 pricing data
-- Run this in your SQL Server Management Studio or query tool

-- 1. Show all jobs for Enquiry 43
SELECT 'JOBS' as Type, ID, ParentID, ItemName
FROM EnquiryFor
WHERE RequestNo = 43
ORDER BY ID;

-- 2. Show all pricing options for Enquiry 43
SELECT 'OPTIONS' as Type, ID as OptionID, OptionName, ItemName, CustomerName
FROM EnquiryPricingOptions
WHERE RequestNo = 43
ORDER BY ID;

-- 3. Show all pricing values for Enquiry 43
SELECT 'VALUES' as Type, OptionID, EnquiryForID, EnquiryForItem, Price, CustomerName
FROM EnquiryPricingValues
WHERE RequestNo = 43
ORDER BY OptionID, EnquiryForID;

-- 4. Find pricing values with zero or NULL price for Enquiry 43
SELECT 'ZERO/NULL PRICES' as Type, v.OptionID, o.OptionName, v.EnquiryForID, v.EnquiryForItem, v.Price, ef.ItemName as JobName
FROM EnquiryPricingValues v
LEFT JOIN EnquiryPricingOptions o ON v.OptionID = o.ID
LEFT JOIN EnquiryFor ef ON v.EnquiryForID = ef.ID
WHERE v.RequestNo = 43 AND (v.Price IS NULL OR v.Price <= 0)
ORDER BY v.OptionID;
