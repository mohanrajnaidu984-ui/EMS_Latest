# Enquiry 1515 draft: clause gaps and PDF clipping

Local investigation, 31 October 2026. No production deployment.

## Why the previous check missed this

The previous primary test loaded saved R4 with Pricing & Payments unchecked. The
reported draft includes Pricing & Payments and different preceding content, so
the same assumptions table falls near a different page boundary. The supplied
PDFs are retained as before-evidence; they are not instructions or editable quote
records. Automated tests use the actual enquiry's clause HTML and browser-only
content changes, not a rewrite of the uploaded draft's unsaved financial values.

## Root causes

1. The assumptions clause contains a borderless Word table. Its first numbered
   row (`3.01 / General / body`) contains several paragraphs inside a single tall
   row. Treating that row as atomic moved its body to the next page. Leading empty
   Word paragraphs carried the heading, and the heading rule counted these empty
   units as its following content.
2. Other empty editor lines could carry onto a continuation page, leaving a large
   blank band before Notes. Whitespace-only Word P nodes also became visual caret
   lines. These are distinct from deliberate blank lines within a page.
3. PDF CSS changed continuation content from block flow to a flex column. Heading
   margins stopped collapsing as in the preview: one six-clause page accumulated
   about 43 px of vertical drift. Additional export-only table line-height,
   padding and height resets changed wrapping, while export cloned/expanded rows
   after the page assignments had already been validated. That combination can
   crop a boundary item such as 5.01.
4. A vector-render layout failure silently fell back to raster HTML-to-PDF. During
   the regression this produced ten raster pages from a nine-page preview.

## Correction

- The existing measured packer remains the single page-assignment owner.
- Long borderless numbered prose rows split at paragraph/line/word boundaries,
  retaining column widths, first-fragment labels, formatting and content order.
  Fragments join into the original row within a page. Ordinary BOQ rows retain
  their row boundaries and repeated headers.
- Heading chains look past spacer units; fill-up cannot leave a heading without
  body content. Added/removed clauses invalidate existing content/layout keys.
- Whitespace-only Word P artifacts are ignored. Explicit BR/NBSP blank lines and
  dimensioned spacers remain within a page. Blank continuation units do not carry
  an empty band onto the next page. Document-end empty paragraphs cannot generate
  continuation pages; saved editor HTML is not rewritten by this trimming.
- Table clipping expansion happens consistently during measurement and live
  preview, not as an export-only reflow. Export captures the validated typography
  and spacing and retains block flow on continuation pages.
- Chromium checks actual unit/text bounds after print layout. A failing layout
  stops download; it cannot silently bypass validation through raster fallback.
- Replaced an invalid Word namespace CSS selector with a portable DOM lookup.

Pricing/VAT formulas, quote saving, workflow rules and branding were not changed.
Test quote mutations are blocked from saving to the database. The isolated API
uses port 5008 with reminder scheduling disabled; the built frontend is at 5180.
The user's separate 5002/5174 processes were not restarted.

## Reproducible checks

- `e2e/quote-clause-mutations.spec.js`: actual 1515 draft with pricing, added
  preceding paragraphs, another selected standard clause, a newly added custom
  clause, removal, repeated Align, and per-page PDF/content comparison.
- `EMS_MUTATION_STRESS=1`: a long custom paragraph plus 100 trailing empty editor
  paragraphs, exercising flow and blank-page prevention.
- `e2e/quote-pagination-investigation.spec.js`: saved R4 regression, three stable
  Align assignments, zoom 80/100/125%, all PDF block text/order and export gate.
- `e2e/quote-export-layout-guard.spec.js`: renderer failure produces an alert and
  no unverified raster download.
- `scratch/test-pdf-boundary-guard.mjs`: deliberately overflowing export is refused
  by the real local PDF renderer.
- Unit tests cover prose/table round trips, preserved inline markup and labels,
  every segment identity, unchanged BOQ rows, orphan headings, intentional middle
  spacing, trailing blank paragraphs and continuation-page spacer handling.

Final artifacts are under `e2e/artifacts/clause-mutations-1515-stress/` and
`e2e/artifacts/independent-investigation/`. The earlier non-stress artifacts retain
intermediate investigation evidence; use the final validation JSON and source
fingerprints for the verified result.

## Final result

Verified on the locally built production frontend (port 5180), using the isolated
API on port 5008. All 27 unit tests, frontend build and backend syntax checks pass.

| Actual 1515 test layout | Preview pages | PDF pages | Overflow / content mismatch |
|---|---:|---:|---|
| pricing | 9 | 9 | 0 / 0 |
| additional-preceding-paragraphs | 8 | 8 | 0 / 0 |
| additional-standard-clause | 9 | 9 | 0 / 0 |
| additional-custom-clause-with-blank-tail | 10 | 10 | 0 / 0 |
| clauses-removed | 8 | 8 | 0 / 0 |
| Saved R4 | 8 | 8 | 0 / 0 |

Every variant retained all 32 matrix checkmarks and had meaningful final-page
content. No carried blank band remained at the start of a continuation page.
The stress custom clause contains a long paragraph plus 100 trailing empty
paragraphs; it flows across pages without blank pages at the end. Repeated Align
clicks preserve identical assignments. Saved R4 also passes 80/100/125% zoom.

The eight-page changed-content PDF was freshly rendered and visually checked,
including the clause 4 flow, complete 5.01 text, Notes page start, logos and
footers. The long custom clause final page was also visually checked. The renderer
rejects deliberately overflowing HTML, and the client refuses an unverified raster
download on a renderer layout failure.

`final-validation.json` records the checks and SHA-256 fingerprints of the source
and built index used for the result. This is a local verification, not production
IIS certification or a guarantee for every possible pasted HTML document.
