# Enquiry Management System (EMS) - Application Process Flow

This document outlines the end-to-end process flow and key workflows within the EMS application.

## 1. Authentication Module

### Login Process
1.  **User Access**: User navigates to the application URL.
2.  **Email Entry**: User enters their email address (e.g., `ranigovardhan@gmail.com`).
3.  **Validation**:
    *   System checks if the email exists in the `Master_ConcernedSE` table.
    *   **If valid**: User proceeds to the password screen.
    *   **If invalid**: "Email not found" error is displayed.
4.  **Password Entry**:
    *   **First Time**: If no password is set, User is prompted to create a new password.
    *   **Returning User**: User enters their existing password.
5.  **Authentication**:
    *   Backend verifies the hash.
    *   **Success**: User is redirected to the Dashboard.
    *   **Failure**: "Invalid password" error is displayed.
    *   **Forgot Password**: Triggers an alert to contact the Administrator (currently simulated).

---

## 2. Dashboard & Navigation

*   **Overview**: The landing page after login, providing a high-level view of key metrics (Active Enquiries, Pending Quotes, etc. - *Feature in Development*).
*   **Navigation Bar**: Provides access to core modules:
    *   Dashboard
    *   Enquiry (Data Entry & Search)
    *   Pricing (Cost Estimation)
    *   Quote (Proposal Generation)
    *   Probability (Sales Forecasting)
    *   Sales Target (Performance Tracking)
    *   Reports

---

## 3. Enquiry Module (Core Data Entry)

### A. Creating a New Enquiry
1.  **Form Initialization**: Navigate to the **Enquiry** tab. The form loads with basic defaults (current date, etc.).
2.  **Data Entry**:
    *   **Information Source**: Select source (Email, Phone, Tender Board, etc.).
    *   **Dates**: Set Enquiry Date, Due Date, and Site Visit Date.
    *   **Customer Selection**:
        *   User can search and select multiple Customers (e.g., "Genpact", "TCS").
        *   **Multi-Select Logic**: Selecting multiple customers allows generating separate quotes for each later.
    *   **Enquiry Scope**:
        *   Select "Enquiry For" items (e.g., "Civil Project", "BMS").
        *   System identifies the **Lead Job** (e.g., `L1 - Civil Project`) which determines the Division Code (e.g., `CVLP`) and Department Code (e.g., `ACC`).
    *   **Stakeholders**:
        *   Select Client Name, Consultant Name.
        *   Assign **Concerned SE** (Sales Engineer) and **Estimation Team**.
    *   **Project Details**: Enter Project Name, details, and upload received documents/remarks.
3.  **Submission**:
    *   Click **Save**.
    *   System generates a unique **Request No** (Enquiry No).
    *   **Notifications**: Automated acknowledgement emails are sent to the "Received From" contact and internal CC list (if "Auto Ack" is checked).

### B. Modifying an Enquiry
1.  **Search**: Enter the **Request No** (e.g., `103`) in the search bar.
2.  **Load Data**: Form populates with existing details from `EnquiryMaster`, `EnquiryFor`, `EnquiryCustomer`, etc.
3.  **Edit**: User modifies specific fields (e.g., extending a due date, adding a new document comment).
4.  **Update**: Click **Update** to save changes.

---

## 4. Pricing Module (Estimation)

1.  **Access**: Navigate to **Pricing**.
2.  **Search**: Load an enquiry by Request No.
3.  **Interface**:
    *   Pricing is grouped by **Job/Item** (e.g., Civil Project, BMS).
    *   Tabs allow switching between multiple **Customers** (e.g., "Genpact" tab, "TCS" tab).
4.  **Costing**:
    *   Users add line items for costs (Material, Labor, Overheads).
    *   **Lead Job Pricing**: The main scope's pricing.
    *   **Sub-Job Pricing**: Additional optional scopes.
    *   **Base Price**: The fundamental cost without markup.
5.  **Validation**:
    *   Zero values are filtered out.
    *   Duplicate pricing entries are prevented.
6.  **Save**: Costs are saved to `PricingMaster` and `PricingDetail`.

---

## 5. Quote Module (Proposal Generation)

1.  **Access**: Navigate to **Quote**.
2.  **Search**: Load an enquiry by Request No (e.g., `103`).
3.  **Generation Flow**:
    *   **Customer Selection**:
        *   Dropdown lists valid individual customers (e.g., "Genpact", "TCS").
        *   **Selection Logic**: Selecting "TCS" updates the "To" address in the header.
    *   **Quote Reference**:
        *   Format: `DeptCode/DivCode/ReqNo-LeadJobPrefix/QuoteNo-RevisionNo`.
        *   Example: `ACC/CVLP/103-L1/1-R0`.
        *   *Note*: The Division/Dept codes are derived from the *Lead Job*, not the Customer.
    *   **Signatory & Footer**:
        *   **Signatory Label**: "For Almoayyed Contracting" (always confirms the **Sender** identity).
        *   **Footer**: Displays Almoayyed Contracting's contact details (Address, Phone, Fax).
    *   **Pricing Integration**:
        *   System pulls active pricing data for the selected customer.
        *   Displays a summary table (Description vs. Amount).
    *   **Clauses**:
        *   User selects standard clauses (Scope, Payment Terms, Warranty).
        *   User can add **Custom Clauses**.
        *   Clauses can be reordered and edited rich-text.
4.  **Action**:
    *   **Save**: Saves the quote as a Draft or Final version.
    *   **Revise**: Creates a new revision (e.g., `R0` -> `R1`).
    *   **Print**: Generates a printer-friendly version for PDF export.

---

## 6. System Administration (Backend)

*   **Database**: MSSQL Server (`EMS_DB`).
*   **Master Tables**:
    *   `Master_ConcernedSE`: Users and Login credentials.
    *   `Master_CustomerName`: Customer repository.
    *   `Master_EnquiryFor`: list of Services/Divisions (Codes, Logos).
*   **API**: Node.js/Express server handling logic, email triggers, and database transactions.

---
*Generated by Antigravity Agent*
