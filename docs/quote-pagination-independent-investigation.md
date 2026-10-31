# Independent Quote pagination investigation

Development only. Primary case: enquiry 1515, Simplex Project, Cinqo,
saved quotation SMA/SXP/1515-L1/1504-R4. No production deployment authorized.

## Existing pipeline

1. `QuoteForm.jsx` builds the selected clause list and formats its HTML, including pricing/VAT data.
2. `splitClauseHtmlToSegments` in `quoteClausePagination.js` walks that HTML. It unwraps block containers, splits lists into items, splits tables into row fragments with table identity/header/column metadata, and divides long paragraphs into estimated two-line pieces.
3. `mergeSegmentsIntoSheetBlocks` stamps segment IDs, rejoins related table rows and prose/list fragments, and groups them by clause for rendering.
4. A React layout effect first publishes estimated pages, then waits for fonts and runs measured packing in an off-screen DOM. The development flag selected `packSegmentsByRealDomFit`; otherwise an older continuation packer ran.
5. The real-DOM packer greedily tests a candidate page, applies limited keep-with-next rules, then verifies downward and fills upward. It forces progress for an oversized atomic unit; that is not proof the unit fits.
6. React paints the groups. Other effects initialize pasted-table columns, relax row heights, reconcile VAT and adjust styles.
7. A separate live recovery effect formerly rebuilt all groups from stamped-node height deltas plus fudge, surgically peeled overflow tails, merged short trailing pages, and rescued missing IDs onto a final page. Pass-count and repeated-state guards stopped that process even if invalid.
8. Export checks preview visibility, clones the document, embeds images, initializes tables, expands clipped row heights, pins print layout, and sends standalone HTML to the PDF API. Client raster PDF and browser print are fallbacks. The raster path also contains a separate export-time peel.

## Source-level failure mechanisms

- **Different measurement documents:** the bare measurement host did not have the `#quote-preview` / continuation-sheet ancestry used by the preview CSS. The measure-only font/table rules also differed. Matching the A4 constants alone did not make heights equivalent.
- **Post-measure mutations:** pasted-column initialization and VAT normalization happen after React paints. A candidate measured before these operations can wrap differently in the real page.
- **Primary mismatch confirmed on R4:** the packer stripped saved row-height locks from its measurement DOM. The rendered quotation HTML retained those locks; subsequent React commits restored them after the live relaxation effect had run. The same matrix row measured approximately 14px but painted at 25px with identical fonts and widths. A temporary DOM mutation was therefore mistaken for a persistent rendering rule.
- **Non-additive heights:** rejoined table headers, collapsed paragraph/list margins, rowspan cells and clause headings cannot be reconstructed accurately by adding independently measured fragment heights. Inflating those values then causes unused space.
- **Competing page owners:** greedy packing, full live height-reflow, tail peeling, sparse-page merging and rescue-to-tail could overwrite one another. Repeated-state detection prevented infinite work but did not establish validity or order.
- **Identity loss during prose merge:** only the first paragraph element survived a merge, so stamps attached to later paragraph elements disappeared. A coverage check could interpret merged text as missing and move its index to the end.
- **Content loss:** oversized-unit splitting truncated results with `slice(0, maxParts)` instead of preserving all pieces. Long-paragraph splitting also flattened inline HTML into plain text.
- **Export is a separate layout stage:** a clean preview is insufficient when clone normalization and fallback pagination can change layout after validation.

## Correction under development

Reuse the existing real-DOM packer, segmentation and quotation model. Measure candidates in an isolated shallow clone of the actual continuation-page ancestry, apply the same table/VAT normalization, respect the saved row dimensions, and remove the clone after synchronous measurement. Share the page-block HTML normalization with React rendering. Remove transient row-height relaxation from packing, preview and pre-export checks. One measured packer owns page groups; live paint validates rather than estimating a second set of breaks. Preserve paragraph tracking inside inline spans, preserve markup while splitting prose, and never truncate oversized-unit output.

No pricing formulas, VAT rules, saved quotation records, approval logic or branding are intentionally changed.

## Independent baseline

The supplied checkout already contained uncommitted pagination repairs. Those were preserved in `scratch/pagination-investigation-baseline/` before editing.

The current pre-change checkout differs from the older 14-page/18-overflow report:

- Latest enquiry draft: 9 pages, no detected stamped overflows or sparse pages; three Align operations had identical group assignments.
- Explicitly selected saved R4: 9 pages, no detected stamped overflows; three Align operations had identical assignments. The download attempt timed out, so PDF parity was **not** established.
- New regression requires exact assignments across three Align operations and exact PDF page count/content per page, rather than allowing page-count drift.

## Validation status

The first simplified measurement trial produced 7 pages but still overflowed; that trial failed and is not a successful fix. Applying pasted-column/VAT normalization alone did not fix it. Respecting the saved row heights then produced **8 pages, all 172 tracked units, zero detected overflows, and no sparse pages** across three identical Align operations.

A real R4 PDF was downloaded from the isolated development API: **8 pages**. All clause bodies matched their corresponding PDF pages in sequence. Comparing the concatenated bodies as one string was an invalid test because PDF text correctly includes headings between bodies; the regression now compares each block, including its heading, in sequence.

Visual review detected later-page logo clipping despite image objects being present. The client and API export paths now avoid clipping the outer sheet and logo grid; the fixed body box and integrity gate still enforce the printable boundary. The API also previously reduced continuation bottom padding by 48px and replaced fixed bands with auto rows. It now preserves the client-pinned bands, 15mm margins, and matching logo dimensions.

Empty paragraph tails were another independent source of unused space. Pagination now trims those tails without editing saved clause HTML. Images, tables and explicit page breaks are retained. R4's 172 original units become **134 sequential units after removing 38 empty trailing fragments**; every resulting index appears exactly once.

## Final result — verified in development

| Check | Result |
|---|---|
| Saved quotation | SMA/SXP/1515-L1/1504-R4, explicitly selected in Previous Quotes |
| Preview / downloaded PDF | **8 / 8 A4 pages** |
| Three Align clicks | Identical complete page assignments |
| Overflow / sparse-page checks | **0 / 0** |
| Segment coverage | All 134 indices in document order, no duplicates or gaps |
| Preview zoom | 80%, 100%, 125% — no detected overflow or page-count change |
| PDF content | Every clause block, including headings, matches its assigned PDF page in order |
| Matrix symbols | All 32 checked-box symbols preserved, including the final legend |
| Dirty-preview export probe | Blocked despite an already-warmed PDF cache |
| PDF visual inspection | All 8 rendered pages inspected; logos, tables, margins and footers checked |
| Logo pixel check | Visible logo on every rendered PDF page |
| Embedded fonts | Selawik regular, semibold and bold |
| Unit tests | **18 passed** |
| Frontend build / backend syntax | Passed / passed |
| Production deployment | **Not performed** |

The isolated development frontend is `http://127.0.0.1:5176`, using the API on port 5008 with server PDF enabled and daily reminders disabled. Existing services were not restarted.

Artifacts are under `e2e/artifacts/independent-investigation/`: `validation-summary.json` includes the tested source hashes; `preview.json`, `zoom.json`, `pdf-parity.json` and `export-gate.json` provide the detailed checks. `quote-1515-R4.pdf` is the actual browser download. `pdf-page-1.png` through `pdf-page-8.png` are its final rendered pages.

This verifies the primary R4 portrait-A4 case. It is not a claim that every possible pasted Word table, rowspan combination, landscape layout or image taller than one page has been validated. Oversized atomic content must remain blocked by the integrity gate rather than be silently clipped.

## Test-harness corrections

- The helper previously supplied the Playwright timeout object as the function argument, and searched for a select inside the wrong label container. It now checks the lead-job select and supplies timeout in the proper position.
- Empty split wrappers can have a zero-size rect at viewport origin. After scrolling/zoom, subtracting the page top produced a false overflow. The independent checker now skips zero-size painted boxes, matching the application gate, while retaining identity coverage checks.
- Writing diagnostic `.html` files inside Vite's project tree triggers a client reload. Markup snapshots use `.txt` so export tests retain their selected revision.
