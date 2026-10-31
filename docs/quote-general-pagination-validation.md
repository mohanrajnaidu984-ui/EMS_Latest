# General quote pagination correction and validation

Local validation, 31 October 2026. No production deployment or saved quote changes.

## Shared correction

The paginator and PDF exporter contain no quote-ID or division-specific fix.
The previous segmentation, Word prose-row splitting, blank-tail handling and
content-boundary guards remain shared by every quotation.

This broader investigation found two further general defects:

* A heading was glued to two complete body units. When only the heading and first
  paragraph fit, this could unnecessarily move content or leave the heading
  alone. It now requires the first real body unit, looking past blank units and
  section labels. A deterministic regression exercises 100 varied documents,
  clause lengths, spacer runs and alternating page capacities.
* Export copied body typography but allowed clause-heading spacing and the
  content container's block/flex flow to change. This changed margin collapse
  and accumulated vertical drift. Export now captures all clause typography and
  spacing, records the preview container's actual flow, and restores that flow
  after the existing export cleanup. No second paginator was added.

A global `flow-root` experiment passed the initial sample but failed the 1515
edit regression; it was removed. The retained correction mirrors measured live
layout rather than imposing a new layout on every quote.

## Validation method and evidence

`e2e/quote-general-pagination.spec.js` loads actual saved quotations through the
existing approval-review QuoteForm loader. A test-only Vite entry mounts the
real form and its normal authenticated enquiry/profile/quote reads. It is not a
production entry. Quote writes are blocked during tests.

Each quote is aligned twice, with identical unit-to-page assignments required.
Tests reject preview overflow, integrity warnings, empty continuation pages,
download alerts, page errors and differing PDF page counts.

PDF extraction can return list items after the footer despite correct visual
placement. Therefore whole-page extraction order is diagnostic only. The
stronger check crops the PDF at each preview unit's measured page coordinates
and requires its complete normalized text there, including clause headings.
The tolerance is 3 PDF points for glyph edges. Rendered pages are also reviewed.
The cover's individual fields and image pixels are not exhaustively compared by
this text-position check.

Machine-readable final results and rendered samples are in
`e2e/artifacts/general-pagination/summary.json` and `general-contact.png`.
Per-quote reports retain assignments, overflow checks, downloaded PDFs and all
text-position checks. The sample covers Scaffolding, Aluminium, Simplex,
Direct Sales, HVAC, Interiors, Landscape, IFM Cleaning, Electrical and BMS,
including saved HTML sizes from about 6 KB to 520 KB. A separate Scaffolding
variant exercises mixed portrait/landscape pages through the normal page control.

The ordinary Quote screen is additionally exercised using enquiry 1515 saved
R4 and browser-only pricing, preceding-paragraph, standard-clause, long custom
clause/blank-tail and removal variants. Those runs use the production build.
Export failure tests ensure a layout rejection cannot silently produce a
different raster PDF.

## Final local results

* Ten saved quotations from ten divisions passed twice-run alignment, zero
  detected overflow, matching PDF page counts and all text-position checks.
* The extra mixed-orientation variant passed. Across these eleven runs,
  40 PDF pages and 573 heading/body text regions were checked.
* The five 1515 edit variants passed with page counts 9, 8, 9, 9 and 8;
  every preview/PDF text-position check passed and all 32 matrix checkmarks
  remained present. No variant generated a blank final page.
* All 29 unit tests passed, including the 100-document packing regression.
  The production frontend build and `git diff --check` passed.
* Rendered PDF review confirms clause 4 begins immediately below its heading
  and clause 6 point 5.01 is fully present in the downloaded document.
* Saved 1515 R4 passed three consecutive aligns, zoom checks and 8-page
  preview/PDF parity. Client and server failure guards blocked invalid exports.

## Limits

Passing a representative set and regression suite does not prove every stored
or future arbitrary HTML quotation is perfect. Oversized indivisible objects
and unsupported imported markup still need explicit layout validation. Existing
preview and server boundary checks block detected invalid exports. The result
is a shared correction with repeatable broader coverage, not a guarantee based
only on enquiry 1515. IIS production validation and deployment remain separate.
