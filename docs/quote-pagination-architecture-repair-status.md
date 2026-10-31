# EMS Quote Pagination Architecture Repair — Status

**Enquiry 1515 primary regression · Dev only · Not deployed**

## Root causes (confirmed)

1. **Live peel ↔ fill-up oscillation** (`QuoteForm.jsx` peel effect)  
   Blind fill-up re-overflowed pages; peel restored a previously seen signature and aborted while content remained past CONTENT END (18 residual overflows, sheets 3–6).

2. **Pack group ↔ painted stamp desync**  
   Peel cut positions used React page groups that no longer matched `[data-ems-pack-seg]` order, causing 1-unit drip peels and nearly-empty continuation sheets.

3. **Zero-height / understated unit heights**  
   Split table stamps often report `height: 0`; packing by raw box height under-filled the height budget and overpacked live paint.

4. **E2E false overflows from zoom** (`emsSession.js`)  
   Dividing layout by `--quote-preview-zoom` when no CSS transform was present inflated bottoms (e.g. 527 → 826) and masked real progress.

5. **PDF warm-cache bypass**  
   Hover-warmed blobs could download without a fresh visibility assert; “Download anyway” is DEV-only.

## Algorithm correction (single engine — no competing packer)

| Stage | Behaviour |
|--------|-----------|
| Pack | `packSegmentsByRealDomFit` — binary verify-down + fill-up (`quoteRealDomFitPack.js`) |
| Live overflow | DOM-authoritative height reflow (bottom-delta heights + fudge) then surgical peel |
| Sparse tails | One-shot merge-up of ≤2-stamp / &lt;80px trailing sheets into previous when spare allows |
| Late reflow | Delayed peel kicks at 250ms / 900ms after Align pack |
| PDF | Always re-assert visibility before download; clear warm cache on failure |

## Enquiry 1515 — before / after (Phase 1 first Align)

| Metric | Before | After |
|--------|--------|-------|
| Continuation + cover sheets | 14 | **9** |
| Overflow units past CONTENT END | **18** | **0** |
| Sparse (≤2 stamps, &lt;35% filled) | sheets 7–13 | **none** |
| Integrity banner | true | **false** |
| Align attempts to clear | 3 failed | **1** |

Artifacts: `e2e/artifacts/live-validation/` (`preview-full.png`, `continuation-page-*.png`, `validation-report.json`).

## Automated results

- Vitest pagination suites: geometry + integrity + fill-pack — passing  
- Playwright live validation (serial): Phase 1 **PASS** (0 overflows); Phase 4 PDF gate **PASS** (probe blocked)  
- Phase 2 zoom + Phase 1 second Align still show **determinism / zoom-harness** issues (see limitations)

## Remaining limitations

1. **Second Align sheet-count drift** — re-pack can temporarily diverge before peels settle; overflows must still clear (tighten Align busy-until-clean).  
2. **Browser zoom harness** — `document.body.style.zoom` + transform still confuses measure at 80/125%; prefer preview CSS zoom only.  
3. **PDF ↔ preview byte parity** — skipped while Phase 2 leaves preview dirty in the serial suite; re-run Phase 3 alone after a clean Align.  
4. **Live fill-up** — disabled (froze tab); densify via pack fill-up + merge-up only.

## Files touched

- `src/components/Quote/QuoteForm.jsx` — peel/reflow/merge-up/PDF gate  
- `src/components/Quote/quoteRealDomFitPack.js` — binary verify-down + fill-up  
- `src/components/Quote/quotePageGeometry.js` — pack CSS parity, `PACK_HEIGHT_SAFETY_PX = 20`  
- `src/components/Quote/quoteClausePagination.js` — unclip overflow with `!important`  
- `e2e/helpers/emsSession.js` — measure/zoom/align settle  
- `e2e/quote-pagination-live-validation.spec.js` — real pipeline assertions  
- `e2e/quote-pagination-peel-debug.spec.js` — fast diagnostic  
- `src/components/Quote/__tests__/quoteRealDomFitPack.test.js` — pack unit tests  
