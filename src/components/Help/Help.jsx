import React from 'react';

const sectionTitleStyle = { color: '#20396D', fontWeight: 700 };

const Help = () => {
  return (
    <div className="py-3 d-flex justify-content-center">
      <div className="card border-0 shadow-sm" style={{ width: '50%', minWidth: '320px', maxWidth: '100%' }}>
        <div className="card-body p-4">
          <h4 className="mb-2" style={sectionTitleStyle}>EMS - User Manual</h4>
          <p className="text-secondary mb-4">
            This guide reflects the latest EMS application flow. It covers how to access the app, complete
            authentication steps, and use each module with practical process guidance.
          </p>

          <h6 className="mb-2" style={sectionTitleStyle}>Access, Login and Password Setup (Detailed)</h6>
          <div className="text-secondary mb-4">
            <p className="mb-1"><strong>1. Open the application</strong></p>
            <ol className="mb-2" style={{ paddingLeft: '1.1rem' }}>
              <li>Open a supported browser (Chrome or Edge recommended).</li>
              <li>Enter the EMS URL provided by your IT/admin team.</li>
              <li>Wait for the EMS sign-in screen to load fully before entering details.</li>
            </ol>

            <p className="mb-1"><strong>2. First-time login flow (create password)</strong></p>
            <ol className="mb-2" style={{ paddingLeft: '1.1rem' }}>
              <li>Enter your registered official email address and click <strong>Next</strong>.</li>
              <li>If your account is marked first-time, EMS opens the password setup step automatically.</li>
              <li>Enter a new password and confirm it.</li>
              <li>Password policy: minimum 10 characters with at least 1 uppercase, 1 lowercase, 1 number, and 1 special character.</li>
              <li>Click <strong>Set Password & Login</strong> to continue into the application.</li>
            </ol>

            <p className="mb-1"><strong>3. Regular sign-in flow</strong></p>
            <ol className="mb-2" style={{ paddingLeft: '1.1rem' }}>
              <li>Enter your registered email and click <strong>Next</strong>.</li>
              <li>Enter your password on the sign-in step.</li>
              <li>Optionally enable <strong>Remember me</strong> if allowed on your machine.</li>
              <li>Click <strong>Sign In</strong>.</li>
            </ol>

            <p className="mb-1"><strong>4. Forgot password flow</strong></p>
            <ol className="mb-2" style={{ paddingLeft: '1.1rem' }}>
              <li>On the password step, click <strong>Forgot Password?</strong>.</li>
              <li>Submit the request for your registered email.</li>
              <li>EMS sends a temporary password to your email address.</li>
              <li>Sign in using the temporary password, then immediately update your password from profile options.</li>
            </ol>

            <p className="mb-1"><strong>5. Change password after login</strong></p>
            <ol className="mb-0" style={{ paddingLeft: '1.1rem' }}>
              <li>Open user/profile controls in the top-right area.</li>
              <li>Select <strong>Change Password</strong>.</li>
              <li>Enter current password, new password, and confirm password.</li>
              <li>New password must follow the same 10-character complexity policy.</li>
            </ol>
          </div>

          <h6 className="mb-2" style={sectionTitleStyle}>Login Troubleshooting</h6>
          <div className="text-secondary mb-4">
            <ul className="mb-0" style={{ paddingLeft: '1.1rem' }}>
              <li>If email is not recognized, verify spelling and contact admin to confirm your account is active.</li>
              <li>If password is rejected, verify uppercase/lowercase and special characters exactly.</li>
              <li>If page looks stale after updates, do a hard refresh once (Ctrl+F5).</li>
              <li>If sign-in still fails after reset, contact IT/admin with your email and timestamp of attempt.</li>
            </ul>
          </div>

          <h6 className="mb-2" style={sectionTitleStyle}>How To Use EMS (End-to-End)</h6>
          <ol className="text-secondary mb-4" style={{ paddingLeft: '1.1rem' }}>
            <li>Create or open an enquiry in the Enquiry module.</li>
            <li>Prepare pricing details in Pricing.</li>
            <li>Create quote and revisions in Quote; configure approval hierarchy and send for approval when required.</li>
            <li>Approvers review quotes in Quote &rarr; Approvals (pending list and read-and-approve preview).</li>
            <li>Track status progression in Probability.</li>
            <li>Analyze outcomes in Sales Report.</li>
            <li>Set targets in Sales Target.</li>
          </ol>

          <div className="text-secondary mb-4">
            <p className="mb-1"><strong>Operational Process (Detailed):</strong></p>
            <ol className="mb-0" style={{ paddingLeft: '1.1rem' }}>
              <li><strong>Capture:</strong> Register enquiry with customer, project scope, and source details.</li>
              <li><strong>Qualify:</strong> Division ownership and SE responsibility are assigned for action tracking.</li>
              <li><strong>Estimate:</strong> Prepare commercial values and validate assumptions.</li>
              <li><strong>Submit:</strong> Issue customer quote reference, create revisions if required, and route through internal approval when needed.</li>
              <li><strong>Follow-up:</strong> Probability status is updated based on market/customer response.</li>
              <li><strong>Close/Carry:</strong> Enquiry is marked Won/Lost or carried as Follow Up/On Hold.</li>
              <li><strong>Review:</strong> Use Sales Report and Sales Target for period review and planning.</li>
            </ol>
          </div>

          <h6 className="mb-2" style={sectionTitleStyle}>Module-Wise User Manual</h6>

          <div className="text-secondary mb-3">
            <p className="mb-1"><strong>1. Dashboard</strong></p>
            <p className="mb-1">
              <strong>Purpose:</strong> Calendar-based snapshot of enquiry and quote activity with monthly trends and drill-down lists for daily and period review.
            </p>
            <p className="mb-1">
              <strong>Layout:</strong> Two side-by-side panels. The <strong>left panel</strong> shows <strong>Monthly Overview</strong> (KPI chips for the selected month) and the day-by-day calendar grid. The <strong>right panel</strong> shows <strong>Monthly History Overview</strong> — a rolling table of month-wise totals anchored to the month shown on the left calendar.
            </p>
            <p className="mb-1">
              <strong>Monthly History window:</strong> The history table shows the <strong>last 12 months plus the next 2 months</strong> relative to the anchor month (the month currently displayed in the left calendar). Past months, the anchor month (highlighted as <em>Selected</em>), and future months are shown in one scrollable list. A year-total row summarizes the anchor year. Change the left calendar month to move the anchor and refresh the history window.
            </p>
            <p className="mb-1">
              <strong>Metrics tracked:</strong> Enquiry Received, Due, Lapsed, New Quote, and Rev Quote — same categories on the monthly overview chips, calendar day labels, and history table columns.
            </p>
            <p className="mb-1">
              <strong>Filters:</strong> Left panel — Division and Sales Engineer (SE). Right panel — search and date-type filters (aligned with enquiry list behaviour). Filters apply to both calendars and history data.
            </p>
            <p className="mb-1">
              <strong>Due and Lapsed rules:</strong> Due counts enquiries with no quote and due date today or later. Lapsed counts enquiries with no quote and due date before today. Once any quote exists on an enquiry, it is excluded from Due and Lapsed on both calendars and in list popups. Monthly bar and history totals match the sum of day-by-day values.
            </p>
            <p className="mb-1">
              <strong>Loading indicator:</strong> When division, SE, or calendar month changes, a centred <em>Updating dashboard…</em> spinner appears over the dashboard content until fresh data is loaded.
            </p>
            <p className="mb-1">
              <strong>Typical user action:</strong> Start on Dashboard, review Monthly Overview and history trends, click a day chip, monthly KPI, or history cell to open the matching enquiry list in a modal, then open records in Enquiry, Pricing, or Quote as needed.
            </p>
            <p className="mb-0">
              <strong>Example:</strong> Set the left calendar to June 2026, scan the history table for rising New Quote counts, then click a Rev Quote value for May 2026 to open that month&apos;s quoted enquiries.
            </p>
            <p className="mb-0 mt-1">
              <strong>Process view:</strong> Dashboard &rarr; filter division/SE &rarr; review Monthly Overview + 12+2 history &rarr; click chip/bar/cell &rarr; open list modal &rarr; complete action in Enquiry/Pricing/Quote.
            </p>
          </div>

          <div className="text-secondary mb-3">
            <p className="mb-1"><strong>2. Enquiry</strong></p>
            <p className="mb-1">
              <strong>Purpose:</strong> Create and maintain enquiry master data.
            </p>
            <p className="mb-1">
              <strong>Key fields:</strong> enquiry number, customers, received-from contacts, enquiry-for hierarchy, concerned SEs, due date, attachments, division, and status.
            </p>
            <p className="mb-1">
              <strong>How to use:</strong> Create or modify enquiry, validate mandatory fields, save. Use search and modify flows for updates. On Windows with classic Outlook installed, email actions run from the EMS server or optional local helper.
            </p>
            <p className="mb-1">
              <strong>Internal notification (on Add Enquiry):</strong> After a successful add, EMS can send an internal notification email via Outlook to all concerned SEs (To), with manager concerns in CC. This is sent automatically when Outlook integration is available.
            </p>
            <p className="mb-1">
              <strong>Customer acknowledgement (optional):</strong> Before saving a new active enquiry, check <strong>Send acknowledgement mail</strong>, select the point-of-contact Sales representative, and ensure customer/received-from email pairs are complete. EMS opens one Outlook draft per customer (not auto-sent). Each draft is addressed to the received-from contact, with concerned SEs and manager concerns in CC. The selected SE appears as contact in the body; your default Outlook signature is used.
            </p>
            <p className="mb-0 mt-1">
              <strong>Step process:</strong> New Enquiry &rarr; fill mandatory fields &rarr; set concerned SEs and emails &rarr; optionally enable acknowledgement &rarr; save &rarr; review Outlook mail &rarr; move to Pricing.
            </p>
            <p className="mb-0 mt-1">
              <strong>Validation notes:</strong> Customer name, project name, division, due date, and contact emails must be complete. Acknowledgement requires a selected SE and valid received-from email per customer row.
            </p>
            <p className="mb-0 mt-1">
              <strong>Expected output:</strong> One reliable enquiry record, internal team notified, and optional customer acknowledgement drafts ready to send.
            </p>
          </div>

          <div className="text-secondary mb-3">
            <p className="mb-1"><strong>3. Pricing</strong></p>
            <p className="mb-1">
              <strong>Purpose:</strong> Build the commercial estimate for an enquiry before quoting. Prices are entered per <strong>job</strong> (lead job and sub-jobs from Enquiry For) and per <strong>customer</strong> tab, using structured price lines called <strong>options</strong>.
            </p>
            <p className="mb-1">
              <strong>Pending Updates list:</strong> Shows enquiries where at least one visible <strong>Base Price</strong> is still <strong>Not Updated</strong>. Open a row to enter pricing for that enquiry. Use Division and Category filters and the search bar to narrow the list.
            </p>
            <p className="mb-1">
              <strong>Price option types:</strong>
            </p>
            <ul className="mb-2" style={{ paddingLeft: '1.1rem' }}>
              <li>
                <strong>Base Price</strong> — The main mandatory price for each job on each customer tab. Until Base Price is entered (greater than zero), the cell shows <strong>Not Updated</strong>. Pending Updates is driven by missing Base Price lines. Base Price is the primary value carried into Quote.
              </li>
              <li>
                <strong>Optional</strong> — A separate add-on line for the same job. Use it for alternate scope, upgrades, or supplementary amounts that are not part of the core Base Price. Optional may be left at <strong>zero</strong> when not applicable; it does not block the Pending list the way Base Price does. In the grid it appears as its own option row; in list summaries it may show as <strong>Job name (Optional)</strong> next to the Base Price total.
              </li>
            </ul>
            <p className="mb-1">
              <strong>How to use:</strong> Open an enquiry from Pending Updates or Search &rarr; select the <strong>lead job</strong> and <strong>customer tab</strong> &rarr; enter <strong>Base Price</strong> for each relevant job row &rarr; enter <strong>Optional</strong> (or other options) where needed &rarr; click <strong>Save All</strong> &rarr; review customer totals and sub-job roll-ups &rarr; proceed to Quote when Base Price lines are complete.
            </p>
            <p className="mb-0">
              <strong>Example:</strong> For lead job L1 on a customer tab, set Base Price on the lead and each sub-job. Add Optional on a sub-job only if that scope is priced separately (for example enhanced specification). If costs change later, update the affected Base Price or Optional cells and save again before creating a revised quote.
            </p>
            <p className="mb-0 mt-1">
              <strong>Step process:</strong> Pending/Search &rarr; open enquiry &rarr; complete Base Price on all required jobs &rarr; add Optional as needed &rarr; Save All &rarr; verify totals &rarr; Quote.
            </p>
            <p className="mb-0 mt-1">
              <strong>Validation notes:</strong> Confirm prices on the correct customer tab and lead job. Optional zero is allowed; Base Price must be updated where that job is in scope. Check list columns <strong>Customer Name &amp; Total Price</strong> (Base Price roll-up) and <strong>Individual &amp; Subjob Base prices</strong> before leaving the enquiry.
            </p>
            <p className="mb-0 mt-1">
              <strong>Expected output:</strong> All required Base Price lines updated, Optional and other options recorded where applicable, and a consistent commercial basis ready for quote preparation and revisions.
            </p>
          </div>

          <div className="text-secondary mb-3">
            <p className="mb-1"><strong>4. Quote</strong></p>
            <p className="mb-1">
              <strong>Purpose:</strong> Manage customer quotations and revisions, preview A4 layout, run internal approval, and deliver PDF or Outlook mail to the customer.
            </p>
            <p className="mb-1">
              <strong>Key activities:</strong> select enquiry, lead job, and customer; create quote reference and revisions; edit clauses; map pricing summary; preview A4 layout; download PDF; send via Outlook; configure and send approval workflow.
            </p>
            <p className="mb-1">
              <strong>Preview and PDF:</strong> Use A4 preview to verify cover letter, headers, clause content, and pricing summary tables before download. PDF download produces a protected document (editing/copying restricted; printing allowed). Preview styling matches the generated PDF. While pricing or quote context is refreshing, a centred <em>Updating preview…</em> indicator appears over the preview area.
            </p>
            <p className="mb-1">
              <strong>Outlook email:</strong> On Windows with classic Outlook, open a draft or send the quote PDF as an attachment from the quote screen. Ensure Outlook is running and the EMS server (or local helper on port 39281) can reach Outlook.
            </p>
            <p className="mb-1">
              <strong>Approval workflow (Quote screen):</strong> Available when <strong>Previous Quotes / Revisions</strong> is enabled and a <strong>saved quote revision</strong> is active (not draft-only mode). The <strong>Approval Workflow</strong> panel on the right supports the full internal sign-off path:
            </p>
            <ol className="mb-2" style={{ paddingLeft: '1.1rem' }}>
              <li>
                <strong>Set or update hierarchy:</strong> Click <strong>Set hierarchy</strong> to open the hierarchy manager. Create a named approval path, add approvers in sequence (order matters), reorder or remove steps, and save. Saved hierarchies are personal templates you can reload later.
              </li>
              <li>
                <strong>Select approvers:</strong> Pick a saved hierarchy from the dropdown to load its approver list, or build the list step-by-step in the workflow panel. Each step shows approver name and pending/approved status.
              </li>
              <li>
                <strong>Send for Approval:</strong> After the quote revision is saved and at least one approver with a valid email is on the path, click <strong>Send for Approval</strong>. EMS saves the workflow to the quote revision and sends an <strong>email notification (SMTP)</strong> to all pending approvers with quote/enquiry context. The approval path is then locked from further hierarchy edits until the workflow is reset or completed.
              </li>
              <li>
                <strong>Sequential approval:</strong> Approvers act in step order. Only the current pending approver can approve. Each approval is recorded with timestamp and optional comments. When all steps are approved, the quote originator and relevant stakeholders can be notified of completion.
              </li>
            </ol>
            <p className="mb-1">
              <strong>Quote approval prerequisites:</strong> Save the quote revision first (Save or + Revision). Enquiry number must be present. Every approver on the path needs a registered email in master user data.
            </p>
            <p className="mb-0">
              <strong>Example:</strong> Enable Previous Quotes, open revision R1, set hierarchy &quot;Division Manager path&quot;, click Send for Approval, then ask approvers to use Quote &rarr; Approvals to review and approve.
            </p>
            <p className="mb-0 mt-1">
              <strong>Step process:</strong> Select enquiry &rarr; lead job &rarr; customer &rarr; create/save quote revision &rarr; edit clauses and pricing summary &rarr; preview &rarr; configure approval hierarchy &rarr; Send for Approval &rarr; track status in Approvals tab &rarr; download PDF or Outlook draft after approval (if required).
            </p>
            <p className="mb-0 mt-1">
              <strong>Validation notes:</strong> Confirm latest revision before Probability updates. Creating any quote removes the enquiry from Dashboard Due/Lapsed counts. Rejection requires approver comments.
            </p>
            <p className="mb-0 mt-1">
              <strong>Expected output:</strong> Complete quote trail with aligned preview/PDF, documented approval history, email notifications to approvers, and optional customer delivery via Outlook.
            </p>
          </div>

          <div className="text-secondary mb-3">
            <p className="mb-1"><strong>4a. Quote — Approvals Page</strong></p>
            <p className="mb-1">
              <strong>Purpose:</strong> Dedicated workspace for approvers to find quotes awaiting their sign-off and complete read-and-approve actions without editing quote content.
            </p>
            <p className="mb-1">
              <strong>Where to open:</strong> Top navigation <strong>Quote</strong> &rarr; <strong>Approvals</strong>. A badge shows the count of quotes pending your approval.
            </p>
            <p className="mb-1">
              <strong>List modes:</strong>
            </p>
            <ul className="mb-2" style={{ paddingLeft: '1.1rem' }}>
              <li><strong>Pending for Approval</strong> — quotes assigned to you that are still awaiting your approval (excludes workflows already rejected by anyone).</li>
              <li><strong>Rejected by Me</strong> — quotes you personally rejected.</li>
              <li><strong>Quote Search</strong> — find only workflow-linked quotes you are entitled to see by text and/or quote date (includes assigned rejected items and permitted cross-division workflow cases).</li>
            </ul>
            <p className="mb-1">
              <strong>Approver process (step-by-step):</strong>
            </p>
            <ol className="mb-2" style={{ paddingLeft: '1.1rem' }}>
              <li>Open <strong>Quote &rarr; Approvals</strong> and confirm <strong>Pending for Approval</strong> is selected.</li>
              <li>Select a quote row from the list on the left.</li>
              <li>Review the quote in <strong>Read and Approve Mode</strong> — full A4 preview with zoom, page navigation, download, print, and email actions where permitted.</li>
              <li>Check the <strong>Approval Workflow</strong> panel on the right for your step number and overall path status.</li>
              <li>Enter optional <strong>Comments</strong>, then click <strong>Approve</strong> when satisfied.</li>
              <li>After approval, the item leaves your pending list and the next approver in sequence becomes active (they receive workflow visibility in their pending list).</li>
            </ol>
            <p className="mb-1">
              <strong>Cross-division access:</strong> If you are assigned in the workflow on a quote from another division, you can still open and approve it. Visibility is workflow-tied and enquiry-context-aware; broad division-only access is intentionally restricted.
            </p>
            <p className="mb-1">
              <strong>Search visibility guardrails:</strong> Quote Search shows items through direct approver assignment, valid workflow teammate paths, and approved cross-division concern mapping for the same quote. Unrelated quotes from the same enquiry or customer are filtered out.
            </p>
            <p className="mb-1">
              <strong>Loading:</strong> While a quote preview is loading or refreshing, a centred loading indicator appears so you can wait for the update to complete.
            </p>
            <p className="mb-0">
              <strong>Example:</strong> A BMS approver sees an AAC quote in Pending for Approval, opens it, reads clauses and pricing in the preview, adds a comment &quot;Commercial terms OK&quot;, and clicks Approve.
            </p>
            <p className="mb-0 mt-1">
              <strong>Expected output:</strong> Your approval step is recorded with timestamp; the workflow advances to the next approver or completes when all steps are approved.
            </p>
          </div>

          <div className="text-secondary mb-3">
            <p className="mb-1"><strong>5. Probability</strong></p>
            <p className="mb-1">
              <strong>Purpose:</strong> Control pipeline status and follow-up outcomes.
            </p>
            <p className="mb-1">
              <strong>Status usage:</strong> Won, Lost, Follow Up, On Hold, Cancelled, Retendered.
            </p>
            <p className="mb-1">
              <strong>How to use:</strong> Select status, fill status-specific details (reason, remarks, expected/booked date, job value, GP), and save.
            </p>
            <p className="mb-0">
              <strong>Example:</strong> For Lost, capture lost-to contractor and reason. For Won, enter ERP job no., booked date, job value, and GP%.
            </p>
            <p className="mb-0 mt-1">
              <strong>Step process:</strong> Select status &rarr; enter status-specific fields &rarr; save update &rarr; verify row reflects latest status.
            </p>
            <p className="mb-0 mt-1">
              <strong>Status field guide:</strong> Lost requires lost-to/reason; Follow Up requires probability and remarks; Won requires job value, GP, and booked date.
            </p>
            <p className="mb-0 mt-1">
              <strong>Expected output:</strong> Accurate latest-status pipeline record usable by reports and target tracking.
            </p>
          </div>

          <div className="text-secondary mb-3">
            <p className="mb-1"><strong>6. Sales Report</strong></p>
            <p className="mb-1">
              <strong>Purpose:</strong> View analytical insights across enquiries, quotes, and probability outcomes.
            </p>
            <p className="mb-1">
              <strong>How to use:</strong> Apply filters for Division and SE, then review charts and top-job tables by status.
            </p>
            <p className="mb-1">
              <strong>Follow Up sorting:</strong> In <strong>Jobs (Follow up)</strong>, rows are ordered by probability block (99%, 90%, 75%, 50%, 25%) and then by highest value within each block, making action prioritization clearer.
            </p>
            <p className="mb-1">
              <strong>What to monitor:</strong> quoted value, won value, loss trends, follow-up pipeline, gross profit movement.
            </p>
            <p className="mb-0">
              <strong>Example:</strong> Select Division A + SE All and compare Won vs Lost distribution to identify conversion gaps.
            </p>
            <p className="mb-0 mt-1">
              <strong>Step process:</strong> Apply filters &rarr; review charts/table &rarr; compare status buckets &rarr; prepare action list for pending opportunities.
            </p>
            <p className="mb-0 mt-1">
              <strong>Print / PDF output:</strong> Use the print button to generate A4 landscape output. Print preview keeps report content (including filter context and footer), hides interactive controls, and formats the page for export-ready sharing.
            </p>
            <p className="mb-0 mt-1">
              <strong>Expected output:</strong> Insight-driven follow-up priorities and conversion analysis.
            </p>
            <p className="mb-0 mt-1">
              <strong>Section-wise explanation:</strong>
            </p>
            <ul className="mb-0" style={{ paddingLeft: '1.1rem' }}>
              <li><strong>Top Filter Section:</strong> Division and SE filters define report scope. All charts and tables refresh based on this selection.</li>
              <li><strong>Summary/KPI Section:</strong> Shows consolidated high-level values for quick health check before deep analysis.</li>
              <li><strong>Top Jobs Section:</strong> Status-driven detailed table (Quoted/Won/Lost/Follow Up/Pending) with job-wise value context.</li>
              <li><strong>Pipeline/Status Section:</strong> Visual distribution of opportunities by stage/status to identify movement and backlog.</li>
              <li><strong>Print Footer:</strong> Exported page includes the system footer: <em>This report is generated from Enquiry Management System</em>.</li>
            </ul>
            <p className="mb-0 mt-2">
              <strong>Chart-wise explanation:</strong>
            </p>
            <ul className="mb-0" style={{ paddingLeft: '1.1rem' }}>
              <li><strong>Actual Bars:</strong> Represent achieved values in the selected scope. Compare periods to detect growth/decline.</li>
              <li><strong>Pipeline Chart:</strong> Represents in-progress opportunity value by probability/status. Higher pending concentration indicates follow-up load.</li>
              <li><strong>Status Comparison View:</strong> Won vs Lost vs Follow Up mix helps understand conversion quality.</li>
              <li><strong>Trend Interpretation:</strong> Rising quoted with flat won indicates conversion delay; rising lost indicates pricing/competition pressure.</li>
            </ul>
            <p className="mb-0 mt-2">
              <strong>Detailed analysis process:</strong> Select Division/SE &rarr; review Actual bars period-wise &rarr; inspect Pipeline concentration &rarr; open Top Jobs by status &rarr;
              identify high-value actionable records &rarr; update Probability/Quote records &rarr; recheck chart movement.
            </p>
            <p className="mb-0 mt-2">
              <strong>How to read the report correctly (expanded):</strong>
            </p>
            <ul className="mb-0" style={{ paddingLeft: '1.1rem' }}>
              <li>
                <strong>Step 1 - Define scope first:</strong> Always start with Division and SE filter confirmation. If scope is incorrect, every metric and chart interpretation becomes invalid.
              </li>
              <li>
                <strong>Step 2 - Read achieved value trend:</strong> Use Actual bars to identify whether performance is stable, rising, or declining across periods. Compare with the previous period before drawing conclusions.
              </li>
              <li>
                <strong>Step 3 - Validate pipeline support:</strong> Check pipeline chart to confirm if upcoming potential is sufficient to support expected achievement. Large pipeline with low conversion indicates execution gap.
              </li>
              <li>
                <strong>Step 4 - Drill into Top Jobs table:</strong> Switch status dropdown (Quoted, Won, Lost, Follow Up, Pending) and inspect high-value rows first, then medium-value rows with near-term impact.
              </li>
              <li>
                <strong>Step 5 - Diagnose conversion issues:</strong> If Quoted value is high but Won is low, inspect Lost reasons and Follow Up probability bands. This helps identify whether delay is commercial, competitive, or tracking related.
              </li>
              <li>
                <strong>Step 6 - Convert analysis into action:</strong> Use identified rows to update Probability status, remarks, and dates. Reports become useful only when insights are converted into record-level updates.
              </li>
            </ul>
            <p className="mb-0 mt-2">
              <strong>Status-wise interpretation guide:</strong>
            </p>
            <ul className="mb-0" style={{ paddingLeft: '1.1rem' }}>
              <li><strong>Quoted high + Pending high:</strong> Opportunity exists, but progress actions may be pending.</li>
              <li><strong>Follow Up high with old dates:</strong> Review for stale opportunities and refresh expected timelines.</li>
              <li><strong>Lost rising period-over-period:</strong> Validate pricing competitiveness and reason patterns.</li>
              <li><strong>Won rising with healthy GP:</strong> Indicates better conversion quality and commercial discipline.</li>
              <li><strong>Won rising but GP falling:</strong> Revenue is improving, but margin protection requires review.</li>
            </ul>
            <p className="mb-0 mt-2">
              <strong>Recommended review frequency:</strong> Use the report for daily operational checks and weekly trend reviews.
              Daily focus should be on Follow Up/Pending movement; weekly focus should be on Won-Lost ratio and value trend direction.
            </p>
            <p className="mb-0 mt-2">
              <strong>Example walkthrough:</strong> If Division A shows strong quoted value but weak won value, switch Top Jobs to Lost and Follow Up,
              identify top 10 values, check remarks/expected dates, update Probability for latest market position, then return to Sales Report and verify
              whether the next cycle shows improved won conversion.
            </p>
          </div>

          <div className="text-secondary mb-3">
            <p className="mb-1"><strong>7. Sales Target</strong></p>
            <p className="mb-1">
              <strong>Purpose:</strong> Measure target achievement and forecast completion risk.
            </p>
            <p className="mb-1">
              <strong>How to use:</strong> Set period-wise targets first, then review actual achieved amount and pending gap.
            </p>
            <p className="mb-1">
              <strong>Usage focus:</strong> identify underperforming periods/divisions and plan corrective actions.
            </p>
            <p className="mb-0">
              <strong>Example:</strong> If Q2 target achievement is below plan, use Probability + Sales Report to prioritize high-probability follow-ups.
            </p>
            <p className="mb-0 mt-1">
              <strong>Step process:</strong> Check target gap &rarr; identify pipeline support value &rarr; assign actions &rarr; review progress in next cycle.
            </p>
            <p className="mb-0 mt-1">
              <strong>Expected output:</strong> Measurable target plan with periodic progress checkpoints.
            </p>
            <p className="mb-0 mt-1">
              <strong>Detailed setup process:</strong> Select year/period &rarr; enter target value by required scope &rarr; save &rarr; verify reflected baseline &rarr; compare against live achieved value.
            </p>
            <p className="mb-0 mt-1">
              <strong>Detailed review process:</strong> Review target vs achieved weekly &rarr; note shortfall trend &rarr; cross-check open Follow Up/Won-ready opportunities &rarr; update action priorities &rarr; recheck closure in next review cycle.
            </p>
          </div>

          <div className="text-secondary mb-3">
            <p className="mb-1"><strong>Common Process Controls</strong></p>
            <ul className="mb-0" style={{ paddingLeft: '1.1rem' }}>
              <li>Use the same enquiry reference across Pricing, Quote, and Probability to avoid data mismatch.</li>
              <li>Save a quote revision before sending it for internal approval; confirm approver emails are current in master data.</li>
              <li>Approvers should use Quote &rarr; Approvals for pending items; quote authors track workflow status on the saved revision.</li>
              <li>Update Probability immediately after any commercial or customer response change.</li>
              <li>Use the latest quote revision when entering Won/Lost/Follow Up decisions.</li>
              <li>Review Sales Report after status updates to confirm values are reflected correctly.</li>
              <li>Check Sales Target at regular intervals to track gap closure actions.</li>
            </ul>
          </div>

          <div className="text-secondary mb-3">
            <p className="mb-1"><strong>Master Entry Guide - Customer / Client / Consultant / Received From</strong></p>
            <p className="mb-1">
              <strong>Where to create:</strong> During enquiry creation or edit, use the relevant dropdown/lookup field.
              If the required name is not available, use the add-new option in that module popup/form.
            </p>
            <p className="mb-1">
              <strong>Recommended order:</strong> Create master record first, verify saved values, then continue enquiry save.
            </p>
            <p className="mb-1">
              <strong>Step-by-step flow:</strong>
            </p>
            <ol className="mb-1" style={{ paddingLeft: '1.1rem' }}>
              <li>Open the relevant module/form where the master is required (typically Enquiry flow).</li>
              <li>In the field (Customer/Client/Consultant/Received From), search existing values first.</li>
              <li>If not found, click add-new/create option.</li>
              <li>Enter mandatory details such as name, contact person, mobile/email, and remarks as applicable.</li>
              <li>Save the master entry and wait for confirmation.</li>
              <li>Re-select/refresh the same field and choose the newly created value.</li>
              <li>Complete remaining enquiry details and save.</li>
            </ol>
            <p className="mb-0 mt-1">
              <strong>Validation checks:</strong> avoid duplicate spellings, confirm correct customer group/type,
              and ensure email/phone formats are valid before final save.
            </p>
          </div>

          <div className="text-secondary mb-3">
            <p className="mb-1"><strong>Scanning Function - How to Use</strong></p>
            <p className="mb-1">
              EMS supports scan/OCR-assisted data capture in modules where contact card or image-based details
              are collected (for customer/contact related entry points).
            </p>
            <p className="mb-1">
              <strong>Step-by-step scanning process:</strong>
            </p>
            <ol className="mb-1" style={{ paddingLeft: '1.1rem' }}>
              <li>Open the form where contact details are being captured.</li>
              <li>Click the scan/upload option.</li>
              <li>Upload a clear image of the business card/document (good lighting, no blur).</li>
              <li>Wait for OCR processing to complete.</li>
              <li>Review extracted values (name, company, phone, email, designation, etc.).</li>
              <li>Correct any OCR mismatch manually before saving.</li>
              <li>Save the entry and verify it appears correctly in lookup/search.</li>
            </ol>
            <p className="mb-0 mt-1">
              <strong>Best practices:</strong> use high-resolution images, crop unnecessary background,
              and always manually validate email/mobile values after scan.
            </p>
          </div>

          <div className="text-secondary mb-3">
            <p className="mb-1"><strong>Troubleshooting Checklist</strong></p>
            <ul className="mb-0" style={{ paddingLeft: '1.1rem' }}>
              <li>If data does not appear in report, confirm Division and SE filter selection.</li>
              <li>If quote details are missing in status row, reselect Quote Reference and save once.</li>
              <li>If alignment or field rendering appears incorrect, refresh page and reopen the record.</li>
              <li>If status-based fields are not visible, ensure selected status is saved before editing details.</li>
              <li>If target impact is not visible, verify that the opportunity is marked Won with final values.</li>
            </ul>
          </div>

          <h6 className="mb-2 mt-2" style={sectionTitleStyle}>Outlook Integration (Windows)</h6>
          <div className="text-secondary mb-4">
            <ul className="mb-0" style={{ paddingLeft: '1.1rem' }}>
              <li>Enquiry internal notifications and customer acknowledgement drafts require <strong>classic Outlook on Windows</strong>.</li>
              <li>Internal enquiry mail is sent automatically after add; customer acknowledgement opens drafts for you to review and send.</li>
              <li>Quote PDF mail uses the same Outlook integration for draft or send with attachment.</li>
              <li><strong>Quote approval request emails</strong> are sent via the EMS server <strong>SMTP</strong> configuration when you click <strong>Send for Approval</strong>. Approvers receive notification with quote/enquiry details; no Outlook action is required on the sender&apos;s PC for that step.</li>
              <li>Keep the EMS server running after backend updates. Optional: run <code>node scripts/quote-outlook-local-helper.js</code> if your environment uses the local helper on port 39281.</li>
              <li>Ensure contact emails exist in master data for SEs, approvers, and received-from contacts used in To/CC fields.</li>
            </ul>
          </div>

          <hr className="my-3" />

          <h6 className="mb-2" style={sectionTitleStyle}>System Architecture</h6>
          <p className="mb-2 text-secondary">
            EMS is built on a three-layer architecture: Frontend (React), Backend (Node.js/Express), and Database (MSSQL).
            Each user action in UI travels through secured API routes to database operations and returns a structured response.
          </p>

          <div className="text-secondary mb-3">
            <strong>Architecture Components:</strong>
            <ol className="mb-0 mt-1" style={{ paddingLeft: '1.1rem' }}>
              <li><strong>Presentation Layer:</strong> React components, forms, tables, charts, filters, and role-based menu visibility.</li>
              <li><strong>Application Layer:</strong> Express routes, validation, business logic, workflow/status rules, API response shaping.</li>
              <li><strong>Data Layer:</strong> SQL Server tables/procedures for enquiries, quotes, probability updates, and reporting datasets.</li>
            </ol>
          </div>

          <div className="text-secondary mb-3">
            <strong>Request Lifecycle Example (Won Update):</strong>
            <ol className="mb-0 mt-1" style={{ paddingLeft: '1.1rem' }}>
              <li>User sets status to Won in Probability and enters job value + GP% + booked date.</li>
              <li>Frontend sends payload to backend route for probability update.</li>
              <li>Backend validates required fields and status-specific constraints.</li>
              <li>Backend stores update in Probability table and keeps latest update ordering.</li>
              <li>Sales Report APIs read latest scoped records and reflect updated metrics/charts.</li>
            </ol>
          </div>

          <div className="text-secondary mb-3">
            <strong>Business Process Integration Example:</strong>
            <ol className="mb-0 mt-1" style={{ paddingLeft: '1.1rem' }}>
              <li>Enquiry `ENQ-1024` is created for a new project.</li>
              <li>Pricing prepares estimate and confirms commercial baseline.</li>
              <li>Quote issues `Q-1024-R0`; customer requests changes.</li>
              <li>Quote issues `Q-1024-R1` with revised value; author configures approval hierarchy and sends for approval.</li>
              <li>Sequential approvers review in Quote &rarr; Approvals and approve each step.</li>
              <li>Probability is updated to Follow Up with expected date.</li>
              <li>After confirmation, status changes to Won with booked date and GP%.</li>
              <li>Sales Report reflects the win; Sales Target shows achievement impact.</li>
            </ol>
          </div>

          <p className="mb-1 text-secondary">
            <strong>Security and Access:</strong> Authentication controls session access, while role permissions control module visibility and actions.
          </p>
          <p className="mb-0 text-secondary">
            <strong>Technical Stack Summary:</strong> React + Bootstrap UI, Node.js/Express APIs, MSSQL database, REST-based module communication.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Help;
