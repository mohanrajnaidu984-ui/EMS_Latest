# Quote Pagination Architecture Repair — Delivery Report

**Date:** 2026-10-29  
**Scope:** EMS Quote A4 preview / PDF pack → verify → peel → soft-split → integrity → export gate

## Root causes addressed

| # | Cause | Fix |
|---|--------|-----|
| 1 | Pack measure CSS understated live paint (12.5px/15px vs 13px/1.4) | Measure host + export CSS use `QUOTE_PACK_MEASURE_*` / 13px·1.4 |
| 2 | Sole tall unit abandoned → clipped by `overflow:hidden` | Soft-split via `softSplitOversizedUnitHtml`; else integrity fail (PDF blocked) |
| 3 | Integrity treated stamps under clip as visible | `measureLiveContentFit` temporarily unclips; fails on bottom > limit / fully below |
| 4 | PDF integrity throw swallowed | Re-throw integrity errors; abort download |
| 5 | Coverage-only OK cleared banner early | Pack path only sets failed=true; visibility peel clears |
| 6 | Dead `livePeelEpochRef` | Pack apply aborts if peel advanced during measure |
| 7 | CONTENT START/END always shown | DEV-only (`import.meta.env.DEV`) |
| 8 | Geometry duplicated across CSS/JS | `quotePageGeometry.js` SoT; re-exported; wired into QuoteForm + print CSS |

## Files changed (summary)

- `EMS/src/components/Quote/quotePageGeometry.js` — **new** geometry SoT
- `EMS/src/components/Quote/quoteClausePagination.js` — re-exports geometry; soft-split; unclipped measure; repeated-state helper
- `EMS/src/components/Quote/QuoteForm.jsx` — measure CSS match; peel soft-split; race; DEV marks; PDF abort
- `EMS/src/components/Quote/quotePrintExportCss.js` — bands from geometry; cell fonts match live
- `EMS/src/components/Quote/__tests__/*` — Vitest suite
- `EMS/e2e/quote-pagination.spec.js` — Playwright (fixture + live soft-skip)
- `vitest.config.js`, `playwright.config.js`, `package.json` scripts

## Test results

### Vitest (`npm test`) — **13/13 passed**

- Geometry: content 220mm, usablePx 831, start 36 / end 256
- 100-row BOQ split: 100 ordered unique row segments; tables stay tables
- Mixed paragraph + table order preserved
- Soft-split long paragraph → ≥2 `<p>` parts
- Fill-pack deterministic; no missing/dupes
- Repeated-state detector trips
- Visibility integrity fails on overshoot / missing DOM stamps
- Unclipped measure fails when true bottom exceeds limit

### Playwright (`EMS_E2E_SKIP_WEBSERVER=1 npx playwright test e2e/quote-pagination.spec.js`)

- **1 passed:** 100-row BOQ fixture in a single 220mm box overflows as expected (pagination required). Screenshot: `e2e/artifacts/boq-100-unpaginated-overflow.png`
- **2 skipped:** live `#quote-preview` / PDF-block tests (no Vite / no `EMS_E2E_QUOTE_URL`)

```bash
npm test
npm run test:e2e
# live quote:
# EMS_E2E_QUOTE_URL=http://127.0.0.1:5173/... EMS_E2E_SKIP_WEBSERVER=1 npm run test:e2e
```

## Manual validation still required

1. Open a real EMS enquiry (e.g. 1515) with 100-row BOQ + mixed paste.
2. Align Page → integrity banner clear → Download PDF.
3. Confirm PDF page count, break positions, and text order match preview.
4. Confirm production build has **no** CONTENT START/END marks.
5. Confirm VAT / pricing totals still sum after new BOQ rows.

## Remaining limitations

- Extreme rowspan/colspan merges across pages still rely on existing rowspan-lead restore; pathological Word merges may need manual edit.
- Soft-split of a single atomic Note block or image-tall cell may still fail integrity (correct: PDF blocked rather than clipped).
- No CI pixel-diff of PDF vs preview yet; Playwright live suite needs authenticated `EMS_E2E_QUOTE_URL`.
- happy-dom cannot exercise full `rejoinSplitTableHtml` office selectors (`o\:p`); rejoin coverage remains browser/manual.
