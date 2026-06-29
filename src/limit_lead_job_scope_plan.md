# Implementation Plan - Restrict Lead Job Selection Scope

## Problem
Users with "Lead" access (e.g., Civil Division) were able to see and select Lead Jobs from other divisions (e.g., L2 - Electrical, L3 - BMS) in the Quote Module. This was due to a blanket permission check (`hasLeadAccess`) that bypassed more granular visibility filters.

## Solution
1.  **Modify `QuoteForm.jsx`**:
    *   Locate the Lead Job dropdown rendering logic.
    *   Remove the `if (pricingData.access.hasLeadAccess) return true;` line which indiscriminately granted access to all Lead Jobs.
    *   Replace it with an explicit check for Admins (`currentUser.role === 'Admin'`).
    *   Ensure that for non-admin users (even Leads), the logic proceeds to check `visibleJobs` and `editableJobs` to strictly filter accessible Lead Jobs.

## Verification
1.  **Login as Civil User**:
    *   Open Enquiry 12 (which has L1-Civil, L2-Elec, L3-BMS).
    *   Check Lead Job Dropdown.
    *   **Expectation**: Only "L1 - Civil Project" should be visible. L2 and L3 should be hidden.
2.  **Login as Admin**:
    *   Open Enquiry 12.
    *   Check Lead Job Dropdown.
    *   **Expectation**: All Lead Jobs (L1, L2, L3) should be visible.
