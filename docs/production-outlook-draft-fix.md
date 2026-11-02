# Production quote email draft failure — 31 October 2026

## Findings

Production `http://151.50.1.38/` and `/api/quote-pdf/health` returned HTTP 200.
The supplied deployment contains the same QuoteForm-B5pnkTGU.js as the failing
browser. PDF generation is not the failure shown in the screenshots.

1. `127.0.0.1:39281` is the browser user's workstation, not IIS. No helper was
   listening here; this reproduced the screenshot's connection-refused error.
2. The subsequent `/api/quotes/outlook-draft` tries to automate Outlook on the
   API host. It cannot open a remote user's Outlook. Office automation under
   IIS/services is unsupported and requires an interactive user profile.
3. The old installer calls `require(helper)` as its resolution test. This starts
   an indefinite server, preventing installation from completing. Copying only
   helpers also fails because the legacy helper eagerly imports backend/SQL
   dependencies. Its instructions to copy backend/.env to user PCs are unsuitable.
4. After installing a standalone helper, a real browser-origin test reproduced
   another blocker: Chrome rejects HTTP production -> loopback because the
   request client is not a secure context. CORS headers or IIS proxy changes
   cannot grant this browser permission.

References: [Microsoft Outlook service limitation](https://learn.microsoft.com/en-us/microsoft-365-apps/outlook/user-interface/oom-unsuitable-in-windows-service),
[Chrome loopback access requirements](https://developer.chrome.com/docs/modern-web-guidance/guides/security/local-network-access).

## Corrections

The targeted frontend hotfix skips impossible loopback requests on non-local
HTTP origins and never invokes server Outlook COM from a remote browser. It
uses the **existing** `/api/quotes/email-draft` endpoint to download one editable
`X-Unsent: 1` .eml containing the current PDF, selected additional attachments,
recipients, subject and body. It clearly instructs the user to open the draft in
Outlook. It does not send mail. This removes the separate executable-VBS
fallback and its unreliable Downloads filename assumptions.

Local development can retain its same-PC Outlook behavior. Secure production
can use the workstation helper. A new standalone quote helper needs only Node
22+ and Classic Outlook; no database/SMTP secrets or backend installation. It
starts hidden at the user's sign-in, binds only to loopback, checks the EMS
origin and Host, limits request size, and refuses overlapping draft requests.
It preserves the existing Outlook signature and opens the draft without sending.
This helper is quote-only; existing legacy enquiry-helper installations need
assessment before replacement because the same port is shared.

## Production rollout

Package: `EMS_Outlook_Hotfix_2026-10-31` beside the original deployment folder.
The original deployment package remains the baseline. This hotfix includes
frontend hashed assets/index, a workstation installer and an apply script.
It contains no backend environment files, customer uploads or credentials.

1. Copy the hotfix folder to the IIS server. Run
   `powershell -NoProfile -File APPLY_FRONTEND_HOTFIX.ps1`
   with permission to update `C:\inetpub\wwwroot\EMS\frontend`. If the real IIS
   physical path differs, pass `-IisFrontendPath` with that path.
2. The script backs up index.html, adds hashed assets, retains old assets and
   switches index.html last. It does not change web.config, backend, uploads,
   database, PM2, or IIS settings; no service restart is needed.
3. Hard-refresh EMS, open a quote and click Email. On the current HTTP address,
   open the downloaded `.eml` **with Classic Outlook**, check the PDF and any
   additional attachments, then review and send manually. This workstation's
   default .eml association is an AppX handler, so choose Classic Outlook
   explicitly if a different mail application opens.
4. Roll back by restoring the backed-up index.html. Previous hashed assets remain.

For automatic opening: provision a trusted HTTPS EMS DNS name/certificate and
IIS HTTPS binding using the organisation's certificate policy. Preserve the
existing API proxy and Socket.IO paths. Install `workstation\INSTALL.cmd` for
each user with that exact HTTPS origin (see workstation/README.md), then grant
the site's loopback/local-network permission when the browser prompts. Do not
install Outlook on IIS, change DCOM identities, copy backend/.env to clients or
disable browser security. Domain/certificate details were not provided, so no
HTTPS binding was changed during this investigation.

## Verification and current status

* Five standalone helper tests passed: attachment payload, origin restriction,
  health/preflight, invalid data/COM failures, duplicate clicks.
* All 32 application unit tests and the frontend production build passed.
* The new helper is installed for the current Windows user in
  `%LOCALAPPDATA%\EMS\OutlookClient`, with a Startup shortcut and versioned health
  response. It permits the current production origin. HTTPS rollout requires
  configuring the new exact origin.
* Actual COM test opened a recipient-free, unsent test draft in Classic Outlook
  with a PDF and text attachment. The signature images remained. PDF bytes
  matched the original; only that labelled test draft was discarded afterward.
* The existing production endpoint returned an .eml with `X-Unsent: 1`, both
  attachments and byte-identical PDF. No SMTP send or quote write occurred.
* The corrected frontend function was executed from the actual live production
  browser origin, calling only `/api/quotes/email-draft` and successfully
  downloading EMS_Connection_Test.eml. No loopback or server-COM call occurred.
* Evidence is in `e2e/artifacts/outlook-production`.
* Server administrative share access was denied; no production frontend files
  or IIS settings were changed. IT must apply the prepared frontend hotfix.
  Automatic Outlook opening on the current HTTP origin remains blocked by the
  browser; the .eml path is the verified immediate workaround after deployment.
