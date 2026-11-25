/**
 * Generate EMS User Manual (.docx) from Help content — A4, branded headings, lists.
 * Usage: node scripts/generate-help-manual-docx.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  AlignmentType,
  Document,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  TextRun,
  BorderStyle,
  convertInchesToTwip,
} from 'docx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'docs');
const publicDir = path.join(root, 'public');
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(publicDir, { recursive: true });

const BRAND = '20396D';
const BODY = '334155';
const MUTED = '475569';

function title(text) {
  return new Paragraph({
    heading: HeadingLevel.TITLE,
    spacing: { after: 200 },
    children: [new TextRun({ text, bold: true, color: BRAND, size: 36, font: 'Calibri' })],
  });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 320, after: 120 },
    children: [new TextRun({ text, bold: true, color: BRAND, size: 26, font: 'Calibri' })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 100 },
    children: [new TextRun({ text, bold: true, color: BRAND, size: 22, font: 'Calibri' })],
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 160, after: 80 },
    children: [new TextRun({ text, bold: true, color: BRAND, size: 20, font: 'Calibri' })],
  });
}

/** Parse simple **bold** segments into TextRuns */
function runsFrom(text, { muted = false, size = 20 } = {}) {
  const color = muted ? MUTED : BODY;
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part) => {
    const m = part.match(/^\*\*([^*]+)\*\*$/);
    if (m) return new TextRun({ text: m[1], bold: true, color, size, font: 'Calibri' });
    return new TextRun({ text: part, color, size, font: 'Calibri' });
  });
}

function p(text, { muted = true, after = 100 } = {}) {
  return new Paragraph({
    spacing: { after },
    children: runsFrom(text, { muted }),
  });
}

function bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: 'help-bullets', level },
    spacing: { after: 60 },
    children: runsFrom(text, { muted: true }),
  });
}

function numbered(text, level = 0) {
  return new Paragraph({
    numbering: { reference: 'help-numbers', level },
    spacing: { after: 60 },
    children: runsFrom(text, { muted: true }),
  });
}

function spacer() {
  return new Paragraph({ spacing: { after: 80 }, children: [] });
}

const children = [
  title('EMS - User Manual'),
  p(
    'This guide reflects the latest EMS application flow. It covers how to access the app, complete authentication steps, and use each module with practical process guidance.',
    { after: 200 }
  ),

  h1('Access, Login and Password Setup (Detailed)'),
  h3('1. Open the application'),
  numbered('Open a supported browser (Chrome or Edge recommended).'),
  numbered('Enter the EMS URL provided by your IT/admin team.'),
  numbered('Wait for the EMS sign-in screen to load fully before entering details.'),

  h3('2. First-time login flow (create password)'),
  numbered('Enter your registered official email address and click **Next**.'),
  numbered('If your account is marked first-time, EMS opens the password setup step automatically.'),
  numbered('Enter a new password and confirm it.'),
  numbered(
    'Password policy: minimum 10 characters with at least 1 uppercase, 1 lowercase, 1 number, and 1 special character.'
  ),
  numbered('Click **Set Password & Login** to continue into the application.'),

  h3('3. Regular sign-in flow'),
  numbered('Enter your registered email and click **Next**.'),
  numbered('Enter your password on the sign-in step.'),
  numbered('Optionally enable **Remember me** if allowed on your machine.'),
  numbered('Click **Sign In**.'),

  h3('4. Forgot password flow'),
  numbered('On the password step, click **Forgot Password?**.'),
  numbered('Submit the request for your registered email.'),
  numbered('EMS sends a temporary password to your email address.'),
  numbered(
    'Sign in using the temporary password, then immediately update your password from profile options.'
  ),

  h3('5. Change password after login'),
  numbered('Open user/profile controls in the top-right area.'),
  numbered('Select **Change Password**.'),
  numbered('Enter current password, new password, and confirm password.'),
  numbered('New password must follow the same 10-character complexity policy.'),

  h1('Login Troubleshooting'),
  bullet('If email is not recognized, verify spelling and contact admin to confirm your account is active.'),
  bullet('If password is rejected, verify uppercase/lowercase and special characters exactly.'),
  bullet('If page looks stale after updates, do a hard refresh once (Ctrl+F5).'),
  bullet('If sign-in still fails after reset, contact IT/admin with your email and timestamp of attempt.'),

  h1('How To Use EMS (End-to-End)'),
  numbered('Create or open an enquiry in the Enquiry module.'),
  numbered('Prepare pricing details in Pricing.'),
  numbered(
    'Create quote and revisions in Quote; configure approval hierarchy and send for approval when required.'
  ),
  numbered('Approvers review quotes in Quote → Approvals (pending list and read-and-approve preview).'),
  numbered('Track status progression in Probability.'),
  numbered('Analyze outcomes in Sales Report.'),
  numbered('Set targets in Sales Target.'),

  h2('Operational Process (Detailed)'),
  numbered('**Capture:** Register enquiry with customer, project scope, and source details.'),
  numbered('**Qualify:** Division ownership and SE responsibility are assigned for action tracking.'),
  numbered('**Estimate:** Prepare commercial values and validate assumptions.'),
  numbered(
    '**Submit:** Issue customer quote reference, create revisions if required, and route through internal approval when needed.'
  ),
  numbered('**Follow-up:** Probability status is updated based on market/customer response.'),
  numbered('**Close/Carry:** Enquiry is marked Won/Lost or carried as Follow Up/On Hold.'),
  numbered('**Review:** Use Sales Report and Sales Target for period review and planning.'),

  h1('Module-Wise User Manual'),

  h2('1. Dashboard'),
  p(
    '**Purpose:** Calendar-based snapshot of enquiry and quote activity with monthly trends and drill-down lists for daily and period review.'
  ),
  p(
    '**Layout:** Two side-by-side panels. The **left panel** shows **Monthly Overview** (KPI chips for the selected month) and the day-by-day calendar grid. The **right panel** shows **Monthly History Overview** — a rolling table of month-wise totals anchored to the month shown on the left calendar.'
  ),
  p(
    '**Monthly History window:** The history table shows the **last 12 months plus the next 2 months** relative to the anchor month. Past months, the anchor month (Selected), and future months are shown in one scrollable list. A year-total row summarizes the anchor year.'
  ),
  p(
    '**Metrics tracked:** Enquiry Received, Due, Lapsed, New Quote, and Rev Quote — same categories on the monthly overview chips, calendar day labels, and history table columns.'
  ),
  p(
    '**Filters:** Left panel — Division and Sales Engineer (SE). Right panel — search and date-type filters. SE attribution uses Concerned SE Own Job / assignment context. Filter choices persist across dashboard navigation.'
  ),
  p(
    '**Due and Lapsed rules:** Due counts enquiries with no quote and due date today or later. Lapsed counts enquiries with no quote and due date before today. Once any quote exists, the enquiry is excluded from Due and Lapsed. Monthly totals match day-by-day values.'
  ),
  p(
    '**Loading indicator:** When division, SE, or calendar month changes, a centred Updating dashboard… spinner appears until fresh data is loaded.'
  ),
  p(
    '**Typical user action:** Start on Dashboard, review Monthly Overview and history trends, click a day chip, monthly KPI, or history cell to open the matching enquiry list, then open records in Enquiry, Pricing, or Quote.'
  ),
  p(
    '**Example:** Set the left calendar to June 2026, scan the history table for rising New Quote counts, then click a Rev Quote value for May 2026 to open that month’s quoted enquiries.'
  ),
  p(
    '**Process view:** Dashboard → filter division/SE → review Monthly Overview + 12+2 history → click chip/bar/cell → open list modal → complete action in Enquiry/Pricing/Quote.'
  ),

  h2('2. Enquiry'),
  p(
    '**Purpose:** Create and maintain enquiry master data, including later scope changes via addendums.'
  ),
  p(
    '**Key fields:** enquiry number, customers, received-from contacts, enquiry-for hierarchy, concerned SEs, due date, attachments, division, status, and addendums.'
  ),
  p(
    '**How to use:** Create or modify enquiry, validate mandatory fields, save. Use search and modify flows for updates. On Windows with classic Outlook installed, email actions run from the EMS server or optional local helper.'
  ),
  p(
    '**Addendums:** On Modify, use **Addendum +** to capture extra customer instructions after the original enquiry. Each row needs Details and Addendum Received Date. Anyone who can open the enquiry can see its addendums. On save, Concerned SEs are emailed (To) with Master_EnquiryFor CCMailIds in CC; From is the person who saved the addendum.'
  ),
  p(
    '**Internal notification (on Add Enquiry):** After a successful add, EMS can send an internal notification email via Outlook to all concerned SEs (To), with manager concerns in CC.'
  ),
  p(
    '**Customer acknowledgement (optional):** Before saving a new active enquiry, check **Send acknowledgement mail**, select the point-of-contact Sales representative, and ensure customer/received-from email pairs are complete. EMS opens one Outlook draft per customer (not auto-sent).'
  ),
  p(
    '**Step process:** New Enquiry → fill mandatory fields → set concerned SEs and emails → optionally enable acknowledgement → save → review Outlook mail → later add addendums as needed → move to Pricing.'
  ),
  p(
    '**Validation notes:** Customer name, project name, division, due date, and contact emails must be complete. Acknowledgement requires a selected SE and valid received-from email per customer row. Addendum details and received date are mandatory before save.'
  ),
  p(
    '**Expected output:** One reliable enquiry record, internal team notified, optional customer acknowledgement drafts ready to send, and a clear addendum trail when scope changes after creation.'
  ),

  h2('3. Pricing'),
  p(
    '**Purpose:** Build the commercial estimate for an enquiry before quoting. Prices are entered per **job** (lead job and sub-jobs from Enquiry For) and per **customer** tab, using structured price lines called **options**.'
  ),
  p(
    '**Pending Updates list:** Shows enquiries where at least one visible **Base Price** is still **Not Updated**. Open a row to enter pricing. Use Division and Category filters and the search bar to narrow the list.'
  ),
  p(
    '**Session keep / return to open price screen:** After you open an enquiry editor (customer tabs visible), leaving Pricing for another module and coming back restores that enquiry and the selected customer tab. Close the editor intentionally (X) when you want the list again.'
  ),
  p('**Price option types:**'),
  bullet(
    '**Base Price** — The main mandatory price for each job on each customer tab. Until Base Price is entered (greater than zero), the cell shows **Not Updated**. Pending Updates is driven by missing Base Price lines. Base Price is the primary value carried into Quote.'
  ),
  bullet(
    '**Optional** — A separate add-on line for the same job (for example Option2 with Spring Return Actuator). Optional may be left at **zero** when not applicable. Optional lines are **per customer tab** — ARAFCON’s Option2 does not appear under Hybrid or Eco Cool.'
  ),
  p(
    '**How to use:** Open an enquiry from Pending Updates or Search → select the **lead job** and **customer tab** → enter **Base Price** → enter **Optional** where needed → click **Save All Prices** → proceed to Quote. Use **Decline to Quote** when that customer will not be quoted.'
  ),
  p(
    '**Example:** For lead job BMS Project, set Base Price 1,525 on Hybrid and Eco Cool tabs; on ARAFCON set Base Price 1,525 and Option2 2,135. Quote for Hybrid must show only Hybrid’s Base Price, not ARAFCON Option2.'
  ),
  p(
    '**Step process:** Pending/Search → open enquiry → complete Base Price on all required jobs per customer → add Optional as needed on that customer only → Save All → verify totals → Quote (context retained if you switch tabs).'
  ),
  p(
    '**Validation notes:** Confirm prices on the correct customer tab and lead job. Optional zero is allowed; Base Price must be updated where that job is in scope.'
  ),
  p(
    '**Expected output:** All required Base Price lines updated, Optional and other options recorded where applicable per customer, and a consistent commercial basis ready for quote preparation and revisions.'
  ),

  h2('4. Quote'),
  p(
    '**Purpose:** Manage customer quotations and revisions, preview A4 layout, run internal approval, and deliver PDF or Outlook mail to the customer.'
  ),
  p(
    '**Key activities:** select enquiry, lead job, and customer; prepare the quote (draft); edit clauses; map pricing summary; preview A4 layout; download PDF; send via Outlook; configure approval hierarchy and send for approval. The official quote number / revision is created when the **final approver** approves.'
  ),
  p(
    '**Keep work when switching modules:** Quote B2B remains open in the background after first visit. Returning from Pricing or another tab restores enquiry, customer, draft, and preview.'
  ),
  p(
    '**Customer switch:** Changing Customer Name reloads that customer’s draft (or a blank shell). Pricing summary only shows that customer’s options (Base Price / Optional). Switching away from a large draft is designed not to freeze the browser.'
  ),
  p('**Assigned SEs:** Quote detail popups list Concerned SEs for the quote Own Job / division context.'),
  p(
    '**Sub-job final approval:** Promoting a sub-job quote can notify parent-job Concerned SEs by email (From = preparer).'
  ),
  p(
    '**Preview and PDF:** Use A4 preview to verify cover letter, headers, clause content, and pricing summary tables before download. PDF download produces a protected document (editing/copying restricted; printing allowed). While refreshing, a centred Updating preview… indicator appears.'
  ),
  p(
    '**Outlook email:** On Windows with classic Outlook, open a draft or send the quote PDF as an attachment. Ensure Outlook is running and the EMS server (or local helper on port 39281) can reach Outlook.'
  ),
  p('**Attachments:**'),
  bullet('**Public** — visible to assigned ConcernedSE, their CCMailIds, Approvers, and Admin.'),
  bullet('**Private** — visible only to own-job ConcernedSE, CCMailIds for that division, Approvers, and Admin.'),

  h3('Approval workflow — where'),
  p(
    'On the Quote screen, open the right-hand **Workflow** tab. Hierarchy is required before Send for Approval. Approvers then use **Quote → Approvals** to review and act.'
  ),

  h3('How to create an approval hierarchy (procedure)'),
  numbered(
    'Select enquiry → lead job → customer, prepare the quote content, and **save the draft**.'
  ),
  numbered('Open the **Workflow** tab on the right.'),
  numbered('Click **Set hierarchy** (hierarchy manager).'),
  numbered('Enter a **Hierarchy name** (for example "IFM standard path") so you can reuse it later.'),
  numbered(
    'Under **Add approvers**, pick each person and click **Add approver**. Reorder with up/down (final approver stays last) and remove steps if needed.'
  ),
  numbered(
    'If there is **more than one approver**, mark **exactly one** person as the **Final Approver**. With only one approver, that person is treated as final automatically.'
  ),
  numbered('Click **Save** in the hierarchy manager to store the template against your login.'),
  numbered(
    'Back on the Workflow panel, select the saved hierarchy. Confirm every step shows name, designation, and email.'
  ),
  numbered(
    'Click **Send for Approval**. EMS stores the path and emails pending approvers (SMTP). Hierarchy editing is then locked until the workflow is reset or completed.'
  ),
  p(
    '**Reuse a hierarchy:** Open **Set hierarchy**, load a previously saved name, adjust if needed, save, then apply it on the Workflow panel.'
  ),

  h3('What “Final Approver” means'),
  bullet(
    'The final approver is the person whose approval **commits** the quote: EMS issues / advances the official **quote number and revision (R#)** and finalizes the workflow for locking.'
  ),
  bullet(
    'Other approvers may approve in **any order** (parallel). Approvals are recorded with timestamps and optional comments; digital signatures appear on the cover when available.'
  ),
  bullet(
    'When there is more than one step, EMS requires exactly one final approver. That person is shown last and labelled **Final Approver**.'
  ),
  bullet(
    'After the final approver has approved, non-final pending steps may still Approve, but **Reject** / **Correction required** is no longer allowed for a finalized quote.'
  ),

  h3('When editing is locked'),
  bullet(
    '**After Send for Approval:** The approval path / hierarchy is locked until completed or unlocked (e.g. after rejection / correction).'
  ),
  bullet(
    '**After Final Approver approval:** Quote content edit is locked; quote number/revision is committed. Removing existing attachments after final approval is restricted.'
  ),
  bullet(
    '**Previous Quotes / browse mode:** Opening a saved revision is view-oriented; do not expect free draft editing on a committed revision.'
  ),
  bullet(
    '**Approvals module:** Approvers work in read-and-approve mode — they do not edit quote content.'
  ),
  bullet(
    '**To edit again after lock:** Create a **new revision** (or follow correction/reject unlock), set hierarchy again if required, and Send for Approval. The next R# is assigned when the final approver approves that round.'
  ),
  p(
    '**Quote approval prerequisites:** Draft/quote context must be saved. Enquiry number must be present. Every approver needs a registered email. Final approver must be marked when there is more than one step.'
  ),
  p(
    '**Example:** Save draft for enquiry 1483, open Workflow → Set hierarchy → name it "IFM Civil path" → add Manivannan, Sanal, and Irshad → mark Irshad as Final Approver → Save → Send for Approval. After Irshad approves, the quote number/revision is issued and content edit is locked.'
  ),
  p(
    '**Step process:** Select enquiry → lead job → customer → prepare/save draft → edit clauses and pricing summary → preview → create/select hierarchy & mark final approver → Send for Approval → track status in Approvals → after final approval, download PDF or Outlook draft as required.'
  ),
  p(
    '**Validation notes:** Confirm latest revision before Probability updates. Creating any quote removes the enquiry from Dashboard Due/Lapsed counts. Rejection requires approver comments.'
  ),
  p(
    '**Expected output:** Complete quote trail with aligned preview/PDF, documented approval history (including digital signatures where placed), email notifications to approvers, and optional customer delivery via Outlook.'
  ),

  h2('4a. Quote — Approvals Page'),
  p(
    '**Purpose:** Dedicated workspace for approvers to find quotes awaiting their sign-off and complete read-and-approve actions without editing quote content.'
  ),
  p(
    '**Where to open:** Top navigation **Quote** → **Approvals**. A badge shows the count of quotes pending your approval.'
  ),
  p('**List modes:**'),
  bullet(
    '**Pending for Approval** — quotes assigned to you that are still awaiting your approval (excludes workflows already rejected by anyone).'
  ),
  bullet('**Approved by Me** — quotes you personally approved.'),
  bullet('**Correction requested** — quotes where you requested a correction during approval.'),
  p('**Approver process (step-by-step):**'),
  numbered('Open **Quote → Approvals** and confirm **Pending for Approval** is selected.'),
  numbered('Select a quote row from the list on the left.'),
  numbered(
    'Review the quote in **Read and Approve Mode** — full A4 preview with zoom, page navigation, download, print, and email actions where permitted.'
  ),
  numbered(
    'Check the **Approval Workflow** panel on the right for your step, status ticks, and who is marked **Final Approver**.'
  ),
  numbered(
    'Enter optional **Comments**, then click **Approve**. Use **Reject** only with comments, or **Correction required** when still allowed (before the final approver commits the quote).'
  ),
  numbered(
    'Approvers may act in **any order**. When the **final approver** approves, the quote number/revision is committed and author editing locks.'
  ),
  p(
    '**Cross-division access:** If you are assigned in the workflow on a quote from another division, you can still open and approve it. Visibility is workflow-tied.'
  ),
  p(
    '**Delete Workflow (final approver only, before final approve):** If the path must be restarted, the final approver can delete the workflow while the draft remains. Initiator and all approvers receive an email with a draft snapshot. The author then sets a new hierarchy and sends for approval again.'
  ),
  p(
    '**Filters:** On **Approved by Me** and **Correction requested**, use Criteria / From / To / Division and Search to narrow the list.'
  ),
  p(
    '**Loading:** While a quote preview is loading or refreshing, a centred loading indicator appears.'
  ),
  p(
    '**Example:** An IFM approver sees a quote in Pending for Approval, opens it, reads clauses and pricing, confirms their signature after Approve, and completes the step. If the hierarchy was wrong, the final approver deletes the workflow before approving; the author rebuilds the path.'
  ),
  p(
    '**Expected output:** Your approval step is recorded with timestamp (and signature when available); the workflow progresses; when the final approver approves, the quote is committed and content edit is locked. Workflow delete returns a clear path for rework without losing the draft.'
  ),

  h2('5. Probability'),
  p('**Purpose:** Control pipeline status and follow-up outcomes.'),
  p('**Status usage:** Won, Lost, Follow Up, On Hold, Cancelled, Retendered.'),
  p(
    '**How to use:** Select status, fill status-specific details (reason, remarks, expected/booked date, job value, GP), and save.'
  ),
  p(
    '**Example:** For Lost, capture lost-to contractor and reason. For Won, enter ERP job no., booked date, job value, and GP%.'
  ),
  p(
    '**Step process:** Select status → enter status-specific fields → save update → verify row reflects latest status.'
  ),
  p(
    '**Status field guide:** Lost requires lost-to/reason; Follow Up requires probability and remarks; Won requires job value, GP, and booked date.'
  ),
  p(
    '**Expected output:** Accurate latest-status pipeline record usable by reports and target tracking.'
  ),

  h2('6. Sales Report'),
  p('**Purpose:** View analytical insights across enquiries, quotes, and probability outcomes.'),
  p('**How to use:** Apply filters for Division and SE, then review charts and top-job tables by status.'),
  p(
    '**Follow Up sorting:** In **Jobs (Follow up)**, rows are ordered by probability block (99%, 90%, 75%, 50%, 25%) and then by highest value within each block.'
  ),
  p(
    '**What to monitor:** quoted value, won value, loss trends, follow-up pipeline, gross profit movement.'
  ),
  p(
    '**Example:** Select Division A + SE All and compare Won vs Lost distribution to identify conversion gaps.'
  ),
  p(
    '**Step process:** Apply filters → review charts/table → compare status buckets → prepare action list for pending opportunities.'
  ),
  p(
    '**Print / PDF output:** Use the print button to generate A4 landscape output. Print preview keeps report content, hides interactive controls, and formats the page for export-ready sharing.'
  ),
  p('**Expected output:** Insight-driven follow-up priorities and conversion analysis.'),
  p('**Section-wise explanation:**'),
  bullet(
    '**Top Filter Section:** Division and SE filters define report scope. All charts and tables refresh based on this selection.'
  ),
  bullet(
    '**Summary/KPI Section:** Shows consolidated high-level values for quick health check before deep analysis.'
  ),
  bullet(
    '**Top Jobs Section:** Status-driven detailed table (Quoted/Won/Lost/Follow Up/Pending) with job-wise value context.'
  ),
  bullet(
    '**Pipeline/Status Section:** Visual distribution of opportunities by stage/status to identify movement and backlog.'
  ),
  bullet(
    '**Print Footer:** Exported page includes: This report is generated from Enquiry Management System.'
  ),
  p('**Chart-wise explanation:**'),
  bullet('**Actual Bars:** Represent achieved values in the selected scope. Compare periods to detect growth/decline.'),
  bullet(
    '**Pipeline Chart:** Represents in-progress opportunity value by probability/status. Higher pending concentration indicates follow-up load.'
  ),
  bullet('**Status Comparison View:** Won vs Lost vs Follow Up mix helps understand conversion quality.'),
  bullet(
    '**Trend Interpretation:** Rising quoted with flat won indicates conversion delay; rising lost indicates pricing/competition pressure.'
  ),
  p(
    '**Detailed analysis process:** Select Division/SE → review Actual bars period-wise → inspect Pipeline concentration → open Top Jobs by status → identify high-value actionable records → update Probability/Quote records → recheck chart movement.'
  ),
  p('**How to read the report correctly (expanded):**'),
  bullet(
    '**Step 1 - Define scope first:** Always start with Division and SE filter confirmation. If scope is incorrect, every metric and chart interpretation becomes invalid.'
  ),
  bullet(
    '**Step 2 - Read achieved value trend:** Use Actual bars to identify whether performance is stable, rising, or declining across periods.'
  ),
  bullet(
    '**Step 3 - Validate pipeline support:** Check pipeline chart to confirm if upcoming potential is sufficient to support expected achievement.'
  ),
  bullet(
    '**Step 4 - Drill into Top Jobs table:** Switch status dropdown and inspect high-value rows first, then medium-value rows with near-term impact.'
  ),
  bullet(
    '**Step 5 - Diagnose conversion issues:** If Quoted value is high but Won is low, inspect Lost reasons and Follow Up probability bands.'
  ),
  bullet(
    '**Step 6 - Convert analysis into action:** Use identified rows to update Probability status, remarks, and dates.'
  ),
  p('**Status-wise interpretation guide:**'),
  bullet('**Quoted high + Pending high:** Opportunity exists, but progress actions may be pending.'),
  bullet('**Follow Up high with old dates:** Review for stale opportunities and refresh expected timelines.'),
  bullet('**Lost rising period-over-period:** Validate pricing competitiveness and reason patterns.'),
  bullet('**Won rising with healthy GP:** Indicates better conversion quality and commercial discipline.'),
  bullet('**Won rising but GP falling:** Revenue is improving, but margin protection requires review.'),
  p(
    '**Recommended review frequency:** Daily focus on Follow Up/Pending movement; weekly focus on Won-Lost ratio and value trend direction.'
  ),
  p(
    '**Example walkthrough:** If Division A shows strong quoted value but weak won value, switch Top Jobs to Lost and Follow Up, identify top 10 values, update Probability, then return to Sales Report and verify improved won conversion.'
  ),

  h2('7. Sales Target'),
  p('**Purpose:** Measure target achievement and forecast completion risk.'),
  p('**How to use:** Set period-wise targets first, then review actual achieved amount and pending gap.'),
  p('**Usage focus:** identify underperforming periods/divisions and plan corrective actions.'),
  p(
    '**Example:** If Q2 target achievement is below plan, use Probability + Sales Report to prioritize high-probability follow-ups.'
  ),
  p(
    '**Step process:** Check target gap → identify pipeline support value → assign actions → review progress in next cycle.'
  ),
  p('**Expected output:** Measurable target plan with periodic progress checkpoints.'),
  p(
    '**Detailed setup process:** Select year/period → enter target value by required scope → save → verify reflected baseline → compare against live achieved value.'
  ),
  p(
    '**Detailed review process:** Review target vs achieved weekly → note shortfall trend → cross-check open Follow Up/Won-ready opportunities → update action priorities → recheck closure in next review cycle.'
  ),

  h2('Common Process Controls'),
  bullet('Use the same enquiry reference across Pricing, Quote, and Probability to avoid data mismatch.'),
  bullet(
    'Enter Optional prices on the correct **customer tab** in Pricing; Quote only shows that customer’s options.'
  ),
  bullet(
    'You can switch between Pricing and Quote without losing the open enquiry/customer context (close the Pricing editor only when you intentionally want the list).'
  ),
  bullet(
    'Save a quote draft before sending it for internal approval; configure hierarchy and mark a final approver when there is more than one step; confirm approver emails are current in master data.'
  ),
  bullet(
    'Approvers should use Quote → Approvals for pending items; quote authors track workflow status on the draft/quote. Edit locks after Send for Approval (hierarchy) and after Final Approver approval (content / quote number).'
  ),
  bullet(
    'Final approver may Delete Workflow before final approve if the path must be rebuilt; initiator and approvers are emailed.'
  ),
  bullet('Update Probability immediately after any commercial or customer response change.'),
  bullet('Use the latest quote revision when entering Won/Lost/Follow Up decisions.'),
  bullet('Review Sales Report after status updates to confirm values are reflected correctly.'),
  bullet('Check Sales Target at regular intervals to track gap closure actions.'),

  h2('Master Entry Guide - Customer / Client / Consultant / Received From'),
  p(
    '**Where to create:** During enquiry creation or edit, use the relevant dropdown/lookup field. If the required name is not available, use the add-new option in that module popup/form.'
  ),
  p(
    '**Recommended order:** Create master record first, verify saved values, then continue enquiry save.'
  ),
  p('**Step-by-step flow:**'),
  numbered('Open the relevant module/form where the master is required (typically Enquiry flow).'),
  numbered('In the field (Customer/Client/Consultant/Received From), search existing values first.'),
  numbered('If not found, click add-new/create option.'),
  numbered(
    'Enter mandatory details such as name, contact person, mobile/email, and remarks as applicable.'
  ),
  numbered('Save the master entry and wait for confirmation.'),
  numbered('Re-select/refresh the same field and choose the newly created value.'),
  numbered('Complete remaining enquiry details and save.'),
  p(
    '**Validation checks:** avoid duplicate spellings, confirm correct customer group/type, and ensure email/phone formats are valid before final save.'
  ),

  h2('Scanning Function - How to Use'),
  p(
    'EMS supports scan/OCR-assisted data capture in modules where contact card or image-based details are collected.'
  ),
  p('**Step-by-step scanning process:**'),
  numbered('Open the form where contact details are being captured.'),
  numbered('Click the scan/upload option.'),
  numbered('Upload a clear image of the business card/document (good lighting, no blur).'),
  numbered('Wait for OCR processing to complete.'),
  numbered('Review extracted values (name, company, phone, email, designation, etc.).'),
  numbered('Correct any OCR mismatch manually before saving.'),
  numbered('Save the entry and verify it appears correctly in lookup/search.'),
  p(
    '**Best practices:** use high-resolution images, crop unnecessary background, and always manually validate email/mobile values after scan.'
  ),

  h2('Troubleshooting Checklist'),
  bullet('If data does not appear in report, confirm Division and SE filter selection.'),
  bullet('If quote details are missing in status row, reselect Quote Reference and save once.'),
  bullet('If alignment or field rendering appears incorrect, refresh page and reopen the record.'),
  bullet(
    'If status-based fields are not visible, ensure selected status is saved before editing details.'
  ),
  bullet(
    'If target impact is not visible, verify that the opportunity is marked Won with final values.'
  ),
  bullet(
    'If Pricing returns to the search list after switching modules, hard-refresh once (Ctrl+F5), reopen the enquiry, then switch modules again — keep-alive should retain the editor. Close (X) only when you want the list.'
  ),
  bullet(
    'If Quote freezes when changing customer, hard-refresh and retry; customer switch now clears the previous draft before loading the new one.'
  ),
  bullet(
    'If Quote shows another customer’s Optional line (for example ARAFCON Option2 on Hybrid), confirm Pricing was saved on the correct customer tab and reopen that customer on Quote.'
  ),
  bullet(
    'If addendum email did not arrive, confirm Concerned SE emails in master data, Outlook/helper for the sender, and that the enquiry is Active.'
  ),
  bullet(
    'If workflow Delete is unavailable, only the marked Final Approver can delete before final approval; after final approve the path is committed.'
  ),

  h1('Outlook Integration (Windows)'),
  bullet(
    'Enquiry internal notifications, **addendum notifications**, and customer acknowledgement drafts require **classic Outlook on Windows** (or SMTP fallback where configured). Addendum mail is From the person who saved the addendum.'
  ),
  bullet(
    'Internal enquiry mail is sent automatically after add; customer acknowledgement opens drafts for you to review and send.'
  ),
  bullet('Quote PDF mail uses the same Outlook integration for draft or send with attachment.'),
  bullet(
    '**Quote approval request emails**, **workflow-deleted emails**, and **parent/sub-job promote notifications** are sent via the EMS server **SMTP** configuration. Approvers / parent SEs receive notification with quote/enquiry details; no Outlook action is required on the sender’s PC for those steps.'
  ),
  bullet(
    'Keep the EMS server running after backend updates. Optional: run node scripts/quote-outlook-local-helper.js if your environment uses the local helper on port 39281 (required for addendum From = your Outlook account).'
  ),
  bullet(
    'Ensure contact emails exist in master data for SEs, approvers, and received-from contacts used in To/CC fields.'
  ),

  h1('System Architecture'),
  p(
    'EMS is built on a three-layer architecture: Frontend (React), Backend (Node.js/Express), and Database (MSSQL). Each user action in UI travels through secured API routes to database operations and returns a structured response.'
  ),
  p('**Architecture Components:**'),
  numbered(
    '**Presentation Layer:** React components, forms, tables, charts, filters, and role-based menu visibility.'
  ),
  numbered(
    '**Application Layer:** Express routes, validation, business logic, workflow/status rules, API response shaping.'
  ),
  numbered(
    '**Data Layer:** SQL Server tables/procedures for enquiries, quotes, probability updates, and reporting datasets.'
  ),

  h3('Request Lifecycle Example (Won Update)'),
  numbered('User sets status to Won in Probability and enters job value + GP% + booked date.'),
  numbered('Frontend sends payload to backend route for probability update.'),
  numbered('Backend validates required fields and status-specific constraints.'),
  numbered('Backend stores update in Probability table and keeps latest update ordering.'),
  numbered('Sales Report APIs read latest scoped records and reflect updated metrics/charts.'),

  h3('Business Process Integration Example'),
  numbered('Enquiry ENQ-1024 is created for a new project; Concerned SEs are notified.'),
  numbered('If the customer later changes scope, an addendum is saved and SEs receive an addendum email.'),
  numbered(
    'Pricing prepares Base Price (and Optional lines per customer tab) and confirms commercial baseline.'
  ),
  numbered(
    'Author opens Quote for the same enquiry/customer (context retained if switching from Pricing).'
  ),
  numbered(
    'Quote draft is prepared; author configures approval hierarchy (marks final approver), sends for approval.'
  ),
  numbered(
    'Approvers review in Quote → Approvals (any order). If the path is wrong, final approver may Delete Workflow before approving; author re-sends with a new hierarchy.'
  ),
  numbered(
    'When the final approver approves, quote number/revision is committed and editing locks. Sub-job promotes may notify parent-job SEs.'
  ),
  numbered('Probability is updated to Follow Up with expected date.'),
  numbered('After confirmation, status changes to Won with booked date and GP%.'),
  numbered('Sales Report reflects the win; Sales Target shows achievement impact.'),

  spacer(),
  p(
    '**Security and Access:** Authentication controls session access, while role permissions control module visibility and actions.'
  ),
  p(
    '**Technical Stack Summary:** React + Bootstrap UI, Node.js/Express APIs, MSSQL database, REST-based module communication.'
  ),
  spacer(),
  p('This manual is generated from Enquiry Management System (EMS). Almoayyed Contracting Group.', {
    muted: true,
    after: 0,
  }),
];

const doc = new Document({
  creator: 'EMS',
  title: 'EMS - User Manual',
  description: 'Enquiry Management System user manual',
  styles: {
    default: {
      document: {
        styles: [
          {
            id: 'Normal',
            name: 'Normal',
            run: { font: 'Calibri', size: 20, color: BODY },
            paragraph: { spacing: { after: 100, line: 276 } },
          },
        ],
      },
    },
  },
  numbering: {
    config: [
      {
        reference: 'help-bullets',
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: '•',
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: {
                indent: { left: convertInchesToTwip(0.35), hanging: convertInchesToTwip(0.2) },
              },
            },
          },
        ],
      },
      {
        reference: 'help-numbers',
        levels: [
          {
            level: 0,
            format: LevelFormat.DECIMAL,
            text: '%1.',
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: {
                indent: { left: convertInchesToTwip(0.35), hanging: convertInchesToTwip(0.25) },
              },
            },
          },
        ],
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 }, // A4 twips
          margin: {
            top: convertInchesToTwip(0.7),
            right: convertInchesToTwip(0.7),
            bottom: convertInchesToTwip(0.75),
            left: convertInchesToTwip(0.7),
          },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              border: {
                bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CBD5E1', space: 8 },
              },
              children: [
                new TextRun({
                  text: 'Enquiry Management System — User Manual',
                  italics: true,
                  color: '64748B',
                  size: 16,
                  font: 'Calibri',
                }),
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              border: {
                top: { style: BorderStyle.SINGLE, size: 6, color: 'CBD5E1', space: 8 },
              },
              children: [
                new TextRun({ text: 'Page ', color: '64748B', size: 16, font: 'Calibri' }),
                new TextRun({ children: [PageNumber.CURRENT], color: '64748B', size: 16, font: 'Calibri' }),
                new TextRun({ text: ' of ', color: '64748B', size: 16, font: 'Calibri' }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], color: '64748B', size: 16, font: 'Calibri' }),
                new TextRun({
                  text: '  |  Almoayyed Contracting Group',
                  color: '64748B',
                  size: 16,
                  font: 'Calibri',
                }),
              ],
            }),
          ],
        }),
      },
      children,
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
const outDocs = path.join(outDir, 'EMS-User-Manual.docx');
const outPublic = path.join(publicDir, 'EMS-User-Manual.docx');
fs.writeFileSync(outDocs, buffer);
fs.writeFileSync(outPublic, buffer);
console.log(outDocs);
console.log(outPublic);
