import React from 'react';

export const manualIntro =
  'This guide reflects the latest EMS application flow. It covers how to access the app, complete authentication steps, and use each module with practical process guidance.';

export const manualPages = [
  {
    title: "Access, Login and Password Setup (Detailed)",
    content: (
      <>
        <div className="text-secondary">
          <p>1. Open the application</p>
          <ol style={{ paddingLeft: '1.1rem' }}>
            <li>Open a supported browser (Chrome or Edge recommended).</li>
            <li>Enter the EMS URL provided by your IT/admin team.</li>
            <li>Wait for the EMS sign-in screen to load fully before entering details.</li>
          </ol>

          <p>2. First-time login flow (create password)</p>
          <ol style={{ paddingLeft: '1.1rem' }}>
            <li>Enter your registered official email address and click Next.</li>
            <li>If your account is marked first-time, EMS opens the password setup step automatically.</li>
            <li>Enter a new password and confirm it.</li>
            <li>Password policy: minimum 10 characters with at least 1 uppercase, 1 lowercase, 1 number, and 1 special character.</li>
            <li>Click Set Password & Login to continue into the application.</li>
          </ol>

          <p>3. Regular sign-in flow</p>
          <ol style={{ paddingLeft: '1.1rem' }}>
            <li>Enter your registered email and click Next.</li>
            <li>Enter your password on the sign-in step.</li>
            <li>Optionally enable Remember me if allowed on your machine.</li>
            <li>Click Sign In.</li>
          </ol>

          <p>4. Forgot password flow</p>
          <ol style={{ paddingLeft: '1.1rem' }}>
            <li>On the password step, click Forgot Password?.</li>
            <li>Submit the request for your registered email.</li>
            <li>EMS sends a temporary password to your email address.</li>
            <li>Sign in using the temporary password, then immediately update your password from profile options.</li>
          </ol>

          <p>5. Change password after login</p>
          <ol style={{ paddingLeft: '1.1rem' }}>
            <li>Open user/profile controls in the top-right area.</li>
            <li>Select Change Password.</li>
            <li>Enter current password, new password, and confirm password.</li>
            <li>New password must follow the same 10-character complexity policy.</li>
          </ol>
        </div>
      </>
    ),
  },
  {
    title: "Login Troubleshooting",
    content: (
      <>
        <div className="text-secondary">
          <ul style={{ paddingLeft: '1.1rem' }}>
            <li>If email is not recognized, verify spelling and contact admin to confirm your account is active.</li>
            <li>If password is rejected, verify uppercase/lowercase and special characters exactly.</li>
            <li>If page looks stale after updates, do a hard refresh once (Ctrl+F5).</li>
            <li>If sign-in still fails after reset, contact IT/admin with your email and timestamp of attempt.</li>
          </ul>
        </div>
      </>
    ),
  },
  {
    title: "How To Use EMS (End-to-End)",
    content: (
      <>
        <ol className="text-secondary" style={{ paddingLeft: '1.1rem' }}>
          <li>Create or open an enquiry in the Enquiry module.</li>
          <li>Prepare pricing details in Pricing.</li>
          <li>Create quote and revisions in Quote; configure approval hierarchy and send for approval when required.</li>
          <li>Approvers review quotes in Quote &rarr; Approvals (pending list and read-and-approve preview).</li>
          <li>Track status progression in Probability.</li>
          <li>Analyze outcomes in Sales Report.</li>
          <li>Set targets in Sales Target.</li>
        </ol>

        <div className="text-secondary">
          <p>Operational Process (Detailed):</p>
          <ol style={{ paddingLeft: '1.1rem' }}>
            <li>Capture: Register enquiry with customer, project scope, and source details.</li>
            <li>Qualify: Division ownership and SE responsibility are assigned for action tracking.</li>
            <li>Estimate: Prepare commercial values and validate assumptions.</li>
            <li>Submit: Issue customer quote reference, create revisions if required, and route through internal approval when needed.</li>
            <li>Follow-up: Probability status is updated based on market/customer response.</li>
            <li>Close/Carry: Enquiry is marked Won/Lost or carried as Follow Up/On Hold.</li>
            <li>Review: Use Sales Report and Sales Target for period review and planning.</li>
          </ol>
        </div>
      </>
    ),
  },
  {
    title: "Dashboard",
    content: (
      <>
        <div className="text-secondary">
          <p>
            Purpose: Calendar-based snapshot of enquiry and quote activity with monthly trends and drill-down lists for daily and period review.
          </p>
          <p>
            Layout: Two side-by-side panels. The left panel shows Monthly Overview (KPI chips for the selected month) and the day-by-day calendar grid. The right panel shows Monthly History Overview — a rolling table of month-wise totals anchored to the month shown on the left calendar.
          </p>
          <p>
            Monthly History window: The history table shows the last 12 months plus the next 2 months relative to the anchor month (the month currently displayed in the left calendar). Past months, the anchor month (highlighted as <em>Selected</em>), and future months are shown in one scrollable list. A year-total row summarizes the anchor year. Change the left calendar month to move the anchor and refresh the history window.
          </p>
          <p>
            Metrics tracked: Enquiry Received, Due, Lapsed, New Quote, and Rev Quote — same categories on the monthly overview chips, calendar day labels, and history table columns.
          </p>
          <p>
            Filters: Left panel — Division and Sales Engineer (SE). Right panel — search and date-type filters (aligned with enquiry list behaviour). Filters apply to both calendars and history data. SE attribution uses Concerned SE Own Job / assignment context so lists match who is assigned on the jobs. Filter choices persist more reliably across dashboard navigation.
          </p>
          <p>
            Due and Lapsed rules: Due counts enquiries with no quote and due date today or later. Lapsed counts enquiries with no quote and due date before today. Once any quote exists on an enquiry, it is excluded from Due and Lapsed on both calendars and in list popups. Monthly bar and history totals match the sum of day-by-day values.
          </p>
          <p>
            Loading indicator: When division, SE, or calendar month changes, a centred <em>Updating dashboard…</em> spinner appears over the dashboard content until fresh data is loaded.
          </p>
          <p>
            Typical user action: Start on Dashboard, review Monthly Overview and history trends, click a day chip, monthly KPI, or history cell to open the matching enquiry list in a modal, then open records in Enquiry, Pricing, or Quote as needed.
          </p>
          <p>
            Example: Set the left calendar to June 2026, scan the history table for rising New Quote counts, then click a Rev Quote value for May 2026 to open that month&apos;s quoted enquiries.
          </p>
          <p>
            Process view: Dashboard &rarr; filter division/SE &rarr; review Monthly Overview + 12+2 history &rarr; click chip/bar/cell &rarr; open list modal &rarr; complete action in Enquiry/Pricing/Quote.
          </p>
        </div>
      </>
    ),
  },
  {
    title: "Enquiry",
    content: (
      <>
        <div className="text-secondary">
          <p>
            Purpose: Create and maintain enquiry master data, including later scope changes via addendums.
          </p>
          <p>
            Key fields: enquiry number, customers, received-from contacts, enquiry-for hierarchy, concerned SEs, due date, attachments, division, status, and addendums.
          </p>
          <p>
            How to use: Create or modify enquiry, validate mandatory fields, save. Use search and modify flows for updates. On Windows with classic Outlook installed, email actions run from the EMS server or optional local helper.
          </p>
          <p>
            Addendums: On Modify, use Addendum + to capture extra customer instructions after the original enquiry. Each row needs Details and Addendum Received Date. Anyone who can open the enquiry can see its addendums. On save, Concerned SEs are emailed (To) with Master_EnquiryFor CCMailIds in CC; From is the person who saved the addendum.
          </p>
          <p>
            Internal notification (on Add Enquiry): After a successful add, EMS can send an internal notification email via Outlook to all concerned SEs (To), with manager concerns in CC. This is sent automatically when Outlook integration is available.
          </p>
          <p>
            Customer acknowledgement (optional): Before saving a new active enquiry, check Send acknowledgement mail, select the point-of-contact Sales representative, and ensure customer/received-from email pairs are complete. EMS opens one Outlook draft per customer (not auto-sent). Each draft is addressed to the received-from contact, with concerned SEs and manager concerns in CC. The selected SE appears as contact in the body; your default Outlook signature is used.
          </p>
          <p>
            Step process: New Enquiry &rarr; fill mandatory fields &rarr; set concerned SEs and emails &rarr; optionally enable acknowledgement &rarr; save &rarr; review Outlook mail &rarr; later add addendums as needed &rarr; move to Pricing.
          </p>
          <p>
            Validation notes: Customer name, project name, division, due date, and contact emails must be complete. Acknowledgement requires a selected SE and valid received-from email per customer row. Addendum details and received date are mandatory before save.
          </p>
          <p>
            Expected output: One reliable enquiry record, internal team notified, optional customer acknowledgement drafts ready to send, and a clear addendum trail when scope changes after creation.
          </p>
        </div>
      </>
    ),
  },
  {
    title: "Pricing",
    content: (
      <>
        <div className="text-secondary">
          <p>
            Purpose: Build the commercial estimate for an enquiry before quoting. Prices are entered per job (lead job and sub-jobs from Enquiry For) and per customer tab, using structured price lines called options.
          </p>
          <p>
            Pending Updates list: Shows enquiries where at least one visible Base Price is still Not Updated. Open a row to enter pricing for that enquiry. Use Division and Category filters and the search bar to narrow the list.
          </p>
          <p>
            Session keep / return to open price screen: After you open an enquiry editor (customer tabs visible), leaving Pricing for another module and coming back restores that enquiry and the selected customer tab — you should not land only on the search/pending list. Close the editor intentionally (X) when you want the list again.
          </p>
          <p>
            Price option types:
          </p>
          <ul style={{ paddingLeft: '1.1rem' }}>
            <li>
              Base Price — The main mandatory price for each job on each customer tab. Until Base Price is entered (greater than zero), the cell shows Not Updated. Pending Updates is driven by missing Base Price lines. Base Price is the primary value carried into Quote.
            </li>
            <li>
              Optional — A separate add-on line for the same job (for example Option2 with Spring Return Actuator). Use it for alternate scope, upgrades, or supplementary amounts that are not part of the core Base Price. Optional may be left at zero when not applicable; it does not block the Pending list the way Base Price does. Optional lines are per customer tab — ARAFCON’s Option2 does not appear under Hybrid or Eco Cool.
            </li>
          </ul>
          <p>
            How to use: Open an enquiry from Pending Updates or Search &rarr; select the lead job and customer tab &rarr; enter Base Price for each relevant job row &rarr; enter Optional (or other options) where needed &rarr; click Save All Prices &rarr; review customer totals and sub-job roll-ups &rarr; proceed to Quote when Base Price lines are complete. Use Decline to Quote on a customer/job line when that customer will not be quoted.
          </p>
          <p>
            Example: For lead job BMS Project, set Base Price 1,525 on Hybrid and Eco Cool tabs; on ARAFCON set Base Price 1,525 and Option2 2,135. Quote for Hybrid must show only Hybrid’s Base Price, not ARAFCON Option2.
          </p>
          <p>
            Step process: Pending/Search &rarr; open enquiry &rarr; complete Base Price on all required jobs per customer &rarr; add Optional as needed on that customer only &rarr; Save All &rarr; verify totals &rarr; Quote (context retained if you switch tabs).
          </p>
          <p>
            Validation notes: Confirm prices on the correct customer tab and lead job. Optional zero is allowed; Base Price must be updated where that job is in scope. Check list columns Customer Name &amp; Total Price (Base Price roll-up) and Individual &amp; Subjob Base prices before leaving the enquiry.
          </p>
          <p>
            Expected output: All required Base Price lines updated, Optional and other options recorded where applicable per customer, and a consistent commercial basis ready for quote preparation and revisions.
          </p>
        </div>
      </>
    ),
  },
  {
    title: "Quote",
    content: (
      <>
        <div className="text-secondary">
          <p>
            Purpose: Manage customer quotations and revisions, preview A4 layout, run internal approval, and deliver PDF or Outlook mail to the customer.
          </p>
          <p>
            Key activities: select enquiry, lead job, and customer; prepare the quote (draft); edit clauses; map pricing summary; preview A4 layout; download PDF; send via Outlook; configure approval hierarchy and send for approval. The official quote number / revision is created when the final approver approves.
          </p>
          <p>
            Keep work when switching modules: Quote B2B remains open in the background after first visit. Returning from Pricing or another tab restores enquiry, customer, draft, and preview.
          </p>
          <p>
            Customer switch: Changing Customer Name reloads that customer’s draft (or a blank shell). Pricing summary only shows that customer’s options (Base Price / Optional). Switching away from a large draft is designed not to freeze the browser.
          </p>
          <p>
            Assigned SEs: Quote detail popups list Concerned SEs for the quote Own Job / division context.
          </p>
          <p>
            Sub-job final approval: Promoting a sub-job quote can notify parent-job Concerned SEs by email (From = preparer).
          </p>
          <p>
            Preview and PDF: Use A4 preview to verify cover letter, headers, clause content, and pricing summary tables before download. PDF download produces a protected document (editing/copying restricted; printing allowed). Preview styling matches the generated PDF. While pricing or quote context is refreshing, a centred <em>Updating preview…</em> indicator appears over the preview area.
          </p>
          <p>
            Outlook email: On Windows with classic Outlook, open a draft or send the quote PDF as an attachment from the quote screen. Ensure Outlook is running and the EMS server (or local helper on port 39281) can reach Outlook.
          </p>
          <p>
            Attachments:
          </p>
          <ul style={{ paddingLeft: '1.1rem' }}>
            <li>Public — visible to assigned ConcernedSE, their CCMailIds, Approvers, and Admin.</li>
            <li>Private — visible only to own-job ConcernedSE, CCMailIds for that division, Approvers, and Admin.</li>
          </ul>

          <p>
            Approval workflow — where: On the Quote screen, open the right-hand Workflow tab. Approval is available for the current draft / quote path (hierarchy is required before Send for Approval). Approvers then use Quote → Approvals to review and act.
          </p>

          <p>
            How to create an approval hierarchy (procedure):
          </p>
          <ol style={{ paddingLeft: '1.1rem' }}>
            <li>Select enquiry → lead job → customer, prepare the quote content, and save the draft (or ensure the draft is saved so the workflow can attach to it).</li>
            <li>Open the Workflow tab on the right.</li>
            <li>Click Set hierarchy (hierarchy manager).</li>
            <li>Enter a Hierarchy name (for example &quot;IFM standard path&quot;) so you can reuse it later.</li>
            <li>Under Add approvers, pick each person from the list and click Add approver. You can reorder steps with up/down (except the final approver stays last) and remove steps if needed.</li>
            <li>If there is more than one approver, mark exactly one person as the Final Approver (checkbox / flag on that step). With only one approver, that person is treated as final automatically.</li>
            <li>Click Save in the hierarchy manager to store the template against your login.</li>
            <li>Back on the Workflow panel, select the saved hierarchy from the dropdown (or keep the steps you just applied). Confirm every step shows name, designation, and email.</li>
            <li>Click Send for Approval. EMS stores the path on the quote/draft and emails pending approvers (SMTP). Hierarchy editing on that path is then locked until the workflow is reset or completed.</li>
          </ol>
          <p>
            Reuse a hierarchy: Open Set hierarchy, load a previously saved name from the picker, adjust if needed, save, then apply it on the Workflow panel. You can also pick a saved hierarchy directly from the Workflow dropdown without opening the manager.
          </p>

          <p>
            What “Final Approver” means:
          </p>
          <ul style={{ paddingLeft: '1.1rem' }}>
            <li>The final approver is the person whose approval commits the quote: EMS issues / advances the official quote number and revision (R#) and treats the workflow as finalized for locking purposes.</li>
            <li>Other approvers may approve in any order (parallel). Their approvals are recorded with timestamps and optional comments, and their digital signatures appear on the cover when they approve (if a signature is stored in their profile).</li>
            <li>When there is more than one step, EMS requires exactly one final approver. That person is shown last in the Workflow list and labelled Final Approver.</li>
            <li>After the final approver has approved, non-final pending steps may still Approve (to record their sign-off), but Reject / Correction required from remaining steps is no longer allowed for a finalized quote.</li>
          </ul>

          <p>
            When editing is locked:
          </p>
          <ul style={{ paddingLeft: '1.1rem' }}>
            <li>
              After Send for Approval: The approval path / hierarchy on that draft or quote is locked — you cannot change, reorder, or replace approvers until the workflow is completed or unlocked (for example after rejection / correction that returns the quote for rework).
            </li>
            <li>
              After Final Approver approval: Quote content edit is locked for normal authoring (clauses, commercial fields, signatories, etc.). The quote number/revision is committed. Private/public attachment rules still apply; removing existing attachments after final approval is restricted (new files may still be allowed where the UI permits).
            </li>
            <li>
              Previous Quotes / browse mode: Opening a saved revision in browse/previous-quotes mode is view-oriented; do not expect free draft editing on a committed revision.
            </li>
            <li>
              Approvals module: Approvers work in read-and-approve mode — they can approve/reject/request correction (when allowed) and view preview/attachments per rights, but they do not edit quote content.
            </li>
            <li>
              To edit again after lock: Typically create a new revision (or follow the correction/reject path that unlocks the draft for rework), set hierarchy again if required, and Send for Approval once more. The next R# is assigned when the final approver approves that round.
            </li>
          </ul>

          <p>
            Quote approval prerequisites: Draft/quote context must be saved. Enquiry number must be present. Every approver needs a registered email in master user data. Final approver must be marked when there is more than one step.
          </p>
          <p>
            Example: Save draft for enquiry 1483, open Workflow → Set hierarchy → name it &quot;IFM Civil path&quot; → add Manivannan, Sanal, and Irshad → mark Irshad as Final Approver → Save → Send for Approval. After Irshad approves, the quote number/revision is issued and content edit is locked.
          </p>
          <p>
            Step process: Select enquiry &rarr; lead job &rarr; customer &rarr; prepare/save draft &rarr; edit clauses and pricing summary &rarr; preview &rarr; create/select hierarchy &amp; mark final approver &rarr; Send for Approval &rarr; track status in Approvals tab &rarr; after final approval, download PDF or Outlook draft as required.
          </p>
          <p>
            Validation notes: Confirm latest revision before Probability updates. Creating any quote removes the enquiry from Dashboard Due/Lapsed counts. Rejection requires approver comments.
          </p>
          <p>
            Expected output: Complete quote trail with aligned preview/PDF, documented approval history (including digital signatures where placed), email notifications to approvers, and optional customer delivery via Outlook.
          </p>
        </div>
      </>
    ),
  },
  {
    title: "Quote Approvals",
    content: (
      <>
        <div className="text-secondary">
          <p>
            Purpose: Dedicated workspace for approvers to find quotes awaiting their sign-off and complete read-and-approve actions without editing quote content.
          </p>
          <p>
            Where to open: Top navigation Quote &rarr; Approvals. A badge shows the count of quotes pending your approval.
          </p>
          <p>
            List modes:
          </p>
          <ul style={{ paddingLeft: '1.1rem' }}>
            <li>Pending for Approval — quotes assigned to you that are still awaiting your approval (excludes workflows already rejected by anyone).</li>
            <li>Approved by Me — quotes you personally approved.</li>
            <li>Correction requested — quotes where you requested a correction during approval.</li>
          </ul>
          <p>
            Approver process (step-by-step):
          </p>
          <ol style={{ paddingLeft: '1.1rem' }}>
            <li>Open Quote &rarr; Approvals and confirm Pending for Approval is selected.</li>
            <li>Select a quote row from the list on the left.</li>
            <li>Review the quote in Read and Approve Mode — full A4 preview with zoom, page navigation, download, print, and email actions where permitted. Public/Private attachments appear according to your access rights.</li>
            <li>Check the Approval Workflow panel on the right for your step, status ticks, and who is marked Final Approver.</li>
            <li>Enter optional Comments, then click Approve (your stored digital signature is applied when available). Use Reject only with comments, or Correction required when that action is still allowed (before the final approver commits the quote).</li>
            <li>Approvers may act in any order. When the final approver approves, the quote number/revision is committed and author editing locks. Other pending non-final steps can still Approve to complete their sign-off.</li>
          </ol>
          <p>
            Cross-division access: If you are assigned in the workflow on a quote from another division, you can still open and approve it. Visibility is workflow-tied and enquiry-context-aware; broad division-only access is intentionally restricted.
          </p>
          <p>
            Delete Workflow (final approver only, before final approve): If the path must be restarted, the final approver can delete the workflow while the draft remains. Initiator and all approvers receive an email with a draft snapshot. The author then sets a new hierarchy and sends for approval again.
          </p>
          <p>
            Filters: On Approved by Me and Correction requested, use Criteria / From / To / Division and Search to narrow the list.
          </p>
          <p>
            Loading: While a quote preview is loading or refreshing, a centred loading indicator appears so you can wait for the update to complete.
          </p>
          <p>
            Example: An IFM approver sees a quote in Pending for Approval, opens it, reads clauses and pricing in the preview, confirms their signature appears after Approve, and completes the step. If the hierarchy was wrong, the final approver deletes the workflow before approving; the author rebuilds the path.
          </p>
          <p>
            Expected output: Your approval step is recorded with timestamp (and signature when available); the workflow progresses; when the final approver approves, the quote is committed and content edit is locked for the author. Workflow delete returns a clear path for rework without losing the draft.
          </p>
        </div>
      </>
    ),
  },
  {
    title: "Probability",
    content: (
      <>
        <div className="text-secondary">
          <p>
            Purpose: Control pipeline status and follow-up outcomes.
          </p>
          <p>
            Status usage: Won, Lost, Follow Up, On Hold, Cancelled, Retendered.
          </p>
          <p>
            How to use: Select status, fill status-specific details (reason, remarks, expected/booked date, job value, GP), and save.
          </p>
          <p>
            Example: For Lost, capture lost-to contractor and reason. For Won, enter ERP job no., booked date, job value, and GP%.
          </p>
          <p>
            Step process: Select status &rarr; enter status-specific fields &rarr; save update &rarr; verify row reflects latest status.
          </p>
          <p>
            Status field guide: Lost requires lost-to/reason; Follow Up requires probability and remarks; Won requires job value, GP, and booked date.
          </p>
          <p>
            Expected output: Accurate latest-status pipeline record usable by reports and target tracking.
          </p>
        </div>
      </>
    ),
  },
  {
    title: "Sales Report",
    content: (
      <>
        <div className="text-secondary">
          <p>
            Purpose: View analytical insights across enquiries, quotes, and probability outcomes.
          </p>
          <p>
            How to use: Apply filters for Division and SE, then review charts and top-job tables by status.
          </p>
          <p>
            Follow Up sorting: In Jobs (Follow up), rows are ordered by probability block (99%, 90%, 75%, 50%, 25%) and then by highest value within each block, making action prioritization clearer.
          </p>
          <p>
            What to monitor: quoted value, won value, loss trends, follow-up pipeline, gross profit movement.
          </p>
          <p>
            Example: Select Division A + SE All and compare Won vs Lost distribution to identify conversion gaps.
          </p>
          <p>
            Step process: Apply filters &rarr; review charts/table &rarr; compare status buckets &rarr; prepare action list for pending opportunities.
          </p>
          <p>
            Print / PDF output: Use the print button to generate A4 landscape output. Print preview keeps report content (including filter context and footer), hides interactive controls, and formats the page for export-ready sharing.
          </p>
          <p>
            Expected output: Insight-driven follow-up priorities and conversion analysis.
          </p>
          <p>
            Section-wise explanation:
          </p>
          <ul style={{ paddingLeft: '1.1rem' }}>
            <li>Top Filter Section: Division and SE filters define report scope. All charts and tables refresh based on this selection.</li>
            <li>Summary/KPI Section: Shows consolidated high-level values for quick health check before deep analysis.</li>
            <li>Top Jobs Section: Status-driven detailed table (Quoted/Won/Lost/Follow Up/Pending) with job-wise value context.</li>
            <li>Pipeline/Status Section: Visual distribution of opportunities by stage/status to identify movement and backlog.</li>
            <li>Print Footer: Exported page includes the system footer: <em>This report is generated from Enquiry Management System</em>.</li>
          </ul>
          <p>
            Chart-wise explanation:
          </p>
          <ul style={{ paddingLeft: '1.1rem' }}>
            <li>Actual Bars: Represent achieved values in the selected scope. Compare periods to detect growth/decline.</li>
            <li>Pipeline Chart: Represents in-progress opportunity value by probability/status. Higher pending concentration indicates follow-up load.</li>
            <li>Status Comparison View: Won vs Lost vs Follow Up mix helps understand conversion quality.</li>
            <li>Trend Interpretation: Rising quoted with flat won indicates conversion delay; rising lost indicates pricing/competition pressure.</li>
          </ul>
          <p>
            Detailed analysis process: Select Division/SE &rarr; review Actual bars period-wise &rarr; inspect Pipeline concentration &rarr; open Top Jobs by status &rarr;
            identify high-value actionable records &rarr; update Probability/Quote records &rarr; recheck chart movement.
          </p>
          <p>
            How to read the report correctly (expanded):
          </p>
          <ul style={{ paddingLeft: '1.1rem' }}>
            <li>
              Step 1 - Define scope first: Always start with Division and SE filter confirmation. If scope is incorrect, every metric and chart interpretation becomes invalid.
            </li>
            <li>
              Step 2 - Read achieved value trend: Use Actual bars to identify whether performance is stable, rising, or declining across periods. Compare with the previous period before drawing conclusions.
            </li>
            <li>
              Step 3 - Validate pipeline support: Check pipeline chart to confirm if upcoming potential is sufficient to support expected achievement. Large pipeline with low conversion indicates execution gap.
            </li>
            <li>
              Step 4 - Drill into Top Jobs table: Switch status dropdown (Quoted, Won, Lost, Follow Up, Pending) and inspect high-value rows first, then medium-value rows with near-term impact.
            </li>
            <li>
              Step 5 - Diagnose conversion issues: If Quoted value is high but Won is low, inspect Lost reasons and Follow Up probability bands. This helps identify whether delay is commercial, competitive, or tracking related.
            </li>
            <li>
              Step 6 - Convert analysis into action: Use identified rows to update Probability status, remarks, and dates. Reports become useful only when insights are converted into record-level updates.
            </li>
          </ul>
          <p>
            Status-wise interpretation guide:
          </p>
          <ul style={{ paddingLeft: '1.1rem' }}>
            <li>Quoted high + Pending high: Opportunity exists, but progress actions may be pending.</li>
            <li>Follow Up high with old dates: Review for stale opportunities and refresh expected timelines.</li>
            <li>Lost rising period-over-period: Validate pricing competitiveness and reason patterns.</li>
            <li>Won rising with healthy GP: Indicates better conversion quality and commercial discipline.</li>
            <li>Won rising but GP falling: Revenue is improving, but margin protection requires review.</li>
          </ul>
          <p>
            Recommended review frequency: Use the report for daily operational checks and weekly trend reviews.
            Daily focus should be on Follow Up/Pending movement; weekly focus should be on Won-Lost ratio and value trend direction.
          </p>
          <p>
            Example walkthrough: If Division A shows strong quoted value but weak won value, switch Top Jobs to Lost and Follow Up,
            identify top 10 values, check remarks/expected dates, update Probability for latest market position, then return to Sales Report and verify
            whether the next cycle shows improved won conversion.
          </p>
        </div>
      </>
    ),
  },
  {
    title: "Sales Target",
    content: (
      <>
        <div className="text-secondary">
          <p>
            Purpose: Measure target achievement and forecast completion risk.
          </p>
          <p>
            How to use: Set period-wise targets first, then review actual achieved amount and pending gap.
          </p>
          <p>
            Usage focus: identify underperforming periods/divisions and plan corrective actions.
          </p>
          <p>
            Example: If Q2 target achievement is below plan, use Probability + Sales Report to prioritize high-probability follow-ups.
          </p>
          <p>
            Step process: Check target gap &rarr; identify pipeline support value &rarr; assign actions &rarr; review progress in next cycle.
          </p>
          <p>
            Expected output: Measurable target plan with periodic progress checkpoints.
          </p>
          <p>
            Detailed setup process: Select year/period &rarr; enter target value by required scope &rarr; save &rarr; verify reflected baseline &rarr; compare against live achieved value.
          </p>
          <p>
            Detailed review process: Review target vs achieved weekly &rarr; note shortfall trend &rarr; cross-check open Follow Up/Won-ready opportunities &rarr; update action priorities &rarr; recheck closure in next review cycle.
          </p>
        </div>
      </>
    ),
  },
  {
    title: "Common Process Controls",
    content: (
      <>
        <div className="text-secondary">
          <ul style={{ paddingLeft: '1.1rem' }}>
            <li>Use the same enquiry reference across Pricing, Quote, and Probability to avoid data mismatch.</li>
            <li>Enter Optional prices on the correct customer tab in Pricing; Quote only shows that customer’s options.</li>
            <li>You can switch between Pricing and Quote without losing the open enquiry/customer context (close the Pricing editor only when you intentionally want the list).</li>
            <li>Save a quote draft before sending it for internal approval; configure hierarchy and mark a final approver when there is more than one step; confirm approver emails are current in master data.</li>
            <li>Approvers should use Quote &rarr; Approvals for pending items; quote authors track workflow status on the draft/quote. Edit locks after Send for Approval (hierarchy) and after Final Approver approval (content / quote number).</li>
            <li>Final approver may Delete Workflow before final approve if the path must be rebuilt; initiator and approvers are emailed.</li>
            <li>Update Probability immediately after any commercial or customer response change.</li>
            <li>Use the latest quote revision when entering Won/Lost/Follow Up decisions.</li>
            <li>Review Sales Report after status updates to confirm values are reflected correctly.</li>
            <li>Check Sales Target at regular intervals to track gap closure actions.</li>
          </ul>
        </div>
      </>
    ),
  },
  {
    title: "Master Entry Guide - Customer / Client / Consultant / Received From",
    content: (
      <>
        <div className="text-secondary">
          <p>
            Where to create: During enquiry creation or edit, use the relevant dropdown/lookup field.
            If the required name is not available, use the add-new option in that module popup/form.
          </p>
          <p>
            Recommended order: Create master record first, verify saved values, then continue enquiry save.
          </p>
          <p>
            Step-by-step flow:
          </p>
          <ol style={{ paddingLeft: '1.1rem' }}>
            <li>Open the relevant module/form where the master is required (typically Enquiry flow).</li>
            <li>In the field (Customer/Client/Consultant/Received From), search existing values first.</li>
            <li>If not found, click add-new/create option.</li>
            <li>Enter mandatory details such as name, contact person, mobile/email, and remarks as applicable.</li>
            <li>Save the master entry and wait for confirmation.</li>
            <li>Re-select/refresh the same field and choose the newly created value.</li>
            <li>Complete remaining enquiry details and save.</li>
          </ol>
          <p>
            Validation checks: avoid duplicate spellings, confirm correct customer group/type,
            and ensure email/phone formats are valid before final save.
          </p>
        </div>
      </>
    ),
  },
  {
    title: "Scanning Function - How to Use",
    content: (
      <>
        <div className="text-secondary">
          <p>
            EMS supports scan/OCR-assisted data capture in modules where contact card or image-based details
            are collected (for customer/contact related entry points).
          </p>
          <p>
            Step-by-step scanning process:
          </p>
          <ol style={{ paddingLeft: '1.1rem' }}>
            <li>Open the form where contact details are being captured.</li>
            <li>Click the scan/upload option.</li>
            <li>Upload a clear image of the business card/document (good lighting, no blur).</li>
            <li>Wait for OCR processing to complete.</li>
            <li>Review extracted values (name, company, phone, email, designation, etc.).</li>
            <li>Correct any OCR mismatch manually before saving.</li>
            <li>Save the entry and verify it appears correctly in lookup/search.</li>
          </ol>
          <p>
            Best practices: use high-resolution images, crop unnecessary background,
            and always manually validate email/mobile values after scan.
          </p>
        </div>
      </>
    ),
  },
  {
    title: "Troubleshooting Checklist",
    content: (
      <>
        <div className="text-secondary">
          <ul style={{ paddingLeft: '1.1rem' }}>
            <li>If data does not appear in report, confirm Division and SE filter selection.</li>
            <li>If quote details are missing in status row, reselect Quote Reference and save once.</li>
            <li>If alignment or field rendering appears incorrect, refresh page and reopen the record.</li>
            <li>If status-based fields are not visible, ensure selected status is saved before editing details.</li>
            <li>If target impact is not visible, verify that the opportunity is marked Won with final values.</li>
            <li>If Pricing returns to the search list after switching modules, hard-refresh once (Ctrl+F5), reopen the enquiry, then switch modules again — keep-alive should retain the editor. Close (X) only when you want the list.</li>
            <li>If Quote freezes when changing customer, hard-refresh and retry; customer switch now clears the previous draft before loading the new one.</li>
            <li>If Quote shows another customer’s Optional line (for example ARAFCON Option2 on Hybrid), confirm Pricing was saved on the correct customer tab and reopen that customer on Quote.</li>
            <li>If addendum email did not arrive, confirm Concerned SE emails in master data, Outlook/helper for the sender, and that the enquiry is Active.</li>
            <li>If workflow Delete is unavailable, only the marked Final Approver can delete before final approval; after final approve the path is committed.</li>
          </ul>
        </div>
      </>
    ),
  },
  {
    title: "Outlook Integration (Windows)",
    content: (
      <>
        <div className="text-secondary">
          <ul style={{ paddingLeft: '1.1rem' }}>
            <li>Enquiry internal notifications, addendum notifications, and customer acknowledgement drafts require classic Outlook on Windows (or SMTP fallback where configured). Addendum mail is From the person who saved the addendum.</li>
            <li>Internal enquiry mail is sent automatically after add; customer acknowledgement opens drafts for you to review and send.</li>
            <li>Quote PDF mail uses the same Outlook integration for draft or send with attachment.</li>
            <li>Quote approval request emails, workflow-deleted emails, and parent/sub-job promote notifications are sent via the EMS server SMTP configuration. Approvers / parent SEs receive notification with quote/enquiry details; no Outlook action is required on the sender&apos;s PC for those steps.</li>
            <li>Keep the EMS server running after backend updates. Optional: run <code>node scripts/quote-outlook-local-helper.js</code> if your environment uses the local helper on port 39281 (required for addendum From = your Outlook account).</li>
            <li>Ensure contact emails exist in master data for SEs, approvers, and received-from contacts used in To/CC fields.</li>
          </ul>
        </div>
      </>
    ),
  },
  {
    title: "System Architecture",
    content: (
      <>
        <p className="text-secondary">
          EMS is built on a three-layer architecture: Frontend (React), Backend (Node.js/Express), and Database (MSSQL).
          Each user action in UI travels through secured API routes to database operations and returns a structured response.
        </p>

        <div className="text-secondary">
          Architecture Components:
          <ol style={{ paddingLeft: '1.1rem' }}>
            <li>Presentation Layer: React components, forms, tables, charts, filters, and role-based menu visibility.</li>
            <li>Application Layer: Express routes, validation, business logic, workflow/status rules, API response shaping.</li>
            <li>Data Layer: SQL Server tables/procedures for enquiries, quotes, probability updates, and reporting datasets.</li>
          </ol>
        </div>

        <div className="text-secondary">
          Request Lifecycle Example (Won Update):
          <ol style={{ paddingLeft: '1.1rem' }}>
            <li>User sets status to Won in Probability and enters job value + GP% + booked date.</li>
            <li>Frontend sends payload to backend route for probability update.</li>
            <li>Backend validates required fields and status-specific constraints.</li>
            <li>Backend stores update in Probability table and keeps latest update ordering.</li>
            <li>Sales Report APIs read latest scoped records and reflect updated metrics/charts.</li>
          </ol>
        </div>

        <div className="text-secondary">
          Business Process Integration Example:
          <ol style={{ paddingLeft: '1.1rem' }}>
            <li>Enquiry `ENQ-1024` is created for a new project; Concerned SEs are notified.</li>
            <li>If the customer later changes scope, an addendum is saved and SEs receive an addendum email.</li>
            <li>Pricing prepares Base Price (and Optional lines per customer tab) and confirms commercial baseline.</li>
            <li>Author opens Quote for the same enquiry/customer (context retained if switching from Pricing).</li>
            <li>Quote draft is prepared; author configures approval hierarchy (marks final approver), sends for approval.</li>
            <li>Approvers review in Quote &rarr; Approvals (any order). If the path is wrong, final approver may Delete Workflow before approving; author re-sends with a new hierarchy.</li>
            <li>When the final approver approves, quote number/revision is committed and editing locks. Sub-job promotes may notify parent-job SEs.</li>
            <li>Probability is updated to Follow Up with expected date.</li>
            <li>After confirmation, status changes to Won with booked date and GP%.</li>
            <li>Sales Report reflects the win; Sales Target shows achievement impact.</li>
          </ol>
        </div>

        <p className="text-secondary">
          Security and Access: Authentication controls session access, while role permissions control module visibility and actions.
        </p>
        <p className="text-secondary">
          Technical Stack Summary: React + Bootstrap UI, Node.js/Express APIs, MSSQL database, REST-based module communication.
        </p>
      </>
    ),
  },
];
