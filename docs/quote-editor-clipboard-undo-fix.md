# Quote table clipboard and undo fix — 8 November 2026

## Confirmed causes

The live HTTP site served index-DLKASM5m.js / QuoteForm-bgU5Zreh.js during this
investigation. Reading that bundle confirmed table clipboard version 7:
Ctrl+C/Ctrl+X cancelled keydown and invoked the asynchronous Clipboard API;
Ctrl+V could consume a cached row/column instead of the current clipboard.
Localhost is a secure context, so that path can work locally while failing over
the production HTTP origin. Normal browser ClipboardEvents can carry HTML on
HTTP and do not require enabling the asynchronous Clipboard API.

Chromium can target Copy/Cut at body when custom table-cell selection has no
native text range. Listening only on a replaceable wysiwyg element misses those
events. Local source already contained partial listener/clipboard/history work;
this correction retains it and addresses the remaining event and history faults.

Additional defects found:

* A cached internal table could override a newly copied external plain-text or
  same-size grid. Grid dimensions alone did not establish clipboard identity.
* Single-cell paste and explicit row/column commands did not consistently record
  structural history.
* The Word-list detector treated a two-column description/amount table as a list
  when its amount began with `12.`. It discarded the description and could leave
  only `340`. Numeric quantities in narrow columns were also mistaken for gutters.
  Detection now requires a genuine marker column; decimal values and ordinary
  words do not satisfy the one-cell list-prefix test.
* Cell, document and native history stacks were prioritised by content type,
  not chronological order. Ordinary paragraph edits could be skipped when undo
  first restored an older table snapshot. Empty editor states were excluded.

## Correction

Use synchronous Copy/Cut events with HTML + plain-text payloads, allow native
keyboard clipboard events to happen, and handle body-targeted events only while
this editor owns focus. Native paste reads the current event instead of cached
row commands. The explicit Copy/Paste Row/Column controls retain their intended
structural behaviour. User-invoked toolbar copy also has a synchronous Copy-event
path. Clipboard listeners live on a durable host with cleanup on destruction.

Cached rich HTML is reused only when the current plain text matches, and a live
grid snapshot requires matching internal clipboard HTML. Fresh external data
wins. Cell/row/column paste and cut are recorded before mutation and committed
afterwards.

While the editor is active, one chronological document stack records typing,
formatting and table edits. Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z and beforeinput history
commands route to that stack. Stale cell/native stacks cannot replay an undone
paste. Snapshots accept empty HTML, retain caret/selection positions, invalidate
redo on a new edit and are cleared when an external clause history is applied.
The existing quote history outside active editing remains in place.
Starting a new paste or undo finishes a pending Office cleanup/history transaction
first, preventing the next paste from being omitted from the undo stack.

## Verification

`npm run test:editor-production` builds the real ClauseEditor using Vite's
production/minification pipeline, then runs it in Chromium at
`http://ems-editor.test`. Playwright serves the built fixture; browser security
is not disabled and `navigator.clipboard` is absent. No business quote or database
record is written. The native clipboard check copies with real Ctrl+C and pastes
into a separate browser tab with real Ctrl+V, not a mocked clipboard.

All 27 browser checks passed:

* Native system clipboard on HTTP; native Copy-event delivery; rich HTML payload.
* Copying a paragraph after selecting a table row copies the paragraph text.
* Fresh external text after an internal table copy.
* Single-cell paste undo/redo; table typing and paragraph typing in chronological order.
* Paragraph formatting undo/redo.
* Word/Excel-style whole-table paste with header styling, rowspan and bold text,
  followed by undo/redo.
* Row paste/undo, column paste/undo, native row cut/undo.
* Description/decimal-amount, narrow quantity/amount and single-cell decimal
  tables remain tables, with undo verified for each successive paste.

All 37 unit tests and the full application production build passed. Unit
regressions cover empty content, no-op changes, mixed table/text/format history
and redo branching. Evidence: `e2e/artifacts/editor-production/results.json`;
build output: `e2e/editor-application-build.log`.

The full application production build was also exercised through QuoteForm using
real enquiry 1515, with quote-write requests blocked. Headed and headerless table
paste, content retention and Ctrl+Z removal passed without JavaScript errors.
That enquiry also logged an existing matrix-row duplication pagination warning;
this editor regression does not constitute a fresh pagination/PDF validation.
Full-screen test: `e2e/quote-editor-build-smoke.spec.js`.

The Office clipboard fixture exercises rich HTML supplied through ClipboardEvent;
it is not an automated session inside desktop Excel or Word. Real user acceptance
with the organisation's Office version remains part of deployment validation.

## Rollout

Extract `EMS_Quote_Editor_Fix_2026-11-08.zip` on the IIS server, open PowerShell
with access to the frontend directory, and run from that extracted folder:

```powershell
powershell -NoProfile -File .\APPLY_FRONTEND_FIX.ps1
```

Default target: `C:\inetpub\wwwroot\EMS\frontend`. If the IIS site's actual
physical frontend path differs, pass `-IisFrontendPath` with that path. The script
backs up index.html, copies hashed assets and switches entry HTML last. It retains
old assets and does not modify IIS configuration or restart the API. Roll back
by restoring the backed-up index.html, then hard-refresh the browser.

Production requires a new frontend deployment. This is an editor fix, not an IIS
clipboard permission setting; do not enable insecure browser flags. No backend
or database migration is required for these source changes. Hard-refresh after
deployment, and verify a temporary quote before making business edits.

The frontend package is built from the current working tree, which already
contained other uncommitted work before this request. Review it through the
normal release process; do not treat it as a surgical replacement for one old
production JavaScript file. Prior assets must remain available for rollback and
already-open browser sessions. No production deployment was performed here.
