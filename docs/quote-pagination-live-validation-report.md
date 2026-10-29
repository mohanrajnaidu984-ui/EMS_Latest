# EMS Quote Pagination — Live Validation Report (Enquiry 1515)

**Date:** 2026-10-29  
**Environment:** Vite `http://localhost:5174` + API `:5002`  
**Quote:** Enquiry **1515** / Simplex Project / M/s. Cinqo Contracting W.L.L (R4 content)  
**Harness:** `e2e/quote-pagination-live-validation.spec.js`  
**Artifacts:** `e2e/artifacts/live-validation/`

---

## Production-readiness conclusion

**NOT production-ready.**

Align Page (3 attempts) still leaves stamped units past CONTENT END on continuation sheets 3–6. Content is clipped by `overflow:hidden`. The integrity banner correctly appears and **blocks PDF download** while dirty, but the layout itself is not yet clean. PDF vs preview parity therefore could not be certified on a clean export.

---

## Tests executed

| Suite / phase | Result | Notes |
|---|---|---|
| Vitest unit (`npm test`) | **13/13 pass** | Geometry, split, soft-split, pack coverage, integrity helpers |
| Playwright fixture (100-row BOQ box) | **PASS** | Unpaginated overflow expected |
| Playwright (prev. skipped) stamped units ≤ CONTENT END | **FAIL** | Executed against 1515; **18 overflows** — not marked pass |
| Playwright (prev. skipped) PDF blocked on integrity | **FAIL** | Executed; gate did not reliably block under probe path |
| Phase 1 — Open 1515 + Align + geometry | **FAIL** | 14 sheets, 172 units; **18 overflows** after 3 Aligns; integrity banner **ON**; logo/footer OK |
| Phase 2 — Zoom 80 / 100 / 125% | **FAIL** | Overflows at all zooms |
| Phase 3 — PDF download (dirty preview) | **PASS (gate only)** | Alert blocked download; **no clean PDF** → parity **not verified** |
| Phase 4 — Overflow probe export gate | **FAIL** | Download occurred without captured alert (gate gap) |
| Phase 5 — Conclusion | Complete | **`productionReady: false`** |

---

## Phase 1 detail (real quotation)

- **Sheets:** 1 cover + 13 continuation (14 total)  
- **Stamped pack units:** 172  
- **Content box height:** 831px (220mm) on all measured sheets  
- **Logo + footer bands:** present on every continuation sheet  
- **Overflows (limit 819.5 = usable−12):** sheets **3, 4, 5, 6** — e.g. sheet 6 units through `bottomPx` **1044** (≈225px past end)  
- **Integrity banner:** true  

### Screenshots

| File | Meaning |
|---|---|
| `preview-full.png` | Full quote preview after Align |
| `continuation-page-1.png` … `continuation-page-8.png` | Per-sheet continuation captures |
| `preview-zoom-80.png` / `100` / `125` | Zoom sweeps |
| `after-row-click.png` / `after-customer-select.png` | Open-flow diagnostics |

---

## Phase 3 — PDF

- Preview was **dirty** → download correctly blocked with:
  > Quote pagination integrity check failed — some content may be missing. PDF download is disabled until pagination succeeds.
- **No PDF bytes written** (`pdfBytes: 0`).  
- Full PDF↔preview parity (page count, breaks, fonts) **not certified** because a clean export was unavailable.

---

## Phase 4 — Failure handling

- Intentional overflow probe detected (6 overflows).  
- One run still produced a download event without a captured alert → **export-gate gap** under probe conditions; treat as unresolved.  
- Baseline dirty-preview path (Phase 3) did block correctly.

---

## Unresolved / unsupported

1. **Pack/peel still overpacks** long BOQ/matrix content on enquiry 1515 (sheets 3–6).  
2. Near-empty continuation sheets (7–13 with 1 stamp each) suggest peel/split fragmentation side-effects.  
3. Zoom≠100% measurement via `document.body.zoom` is not equivalent to EMS preview zoom shell — retest zoom with `--quote-preview-zoom` only.  
4. Phase 4 download-without-alert race needs a hardened gate (always re-check unclipped visibility synchronously before any blob fetch).  
5. Extreme Word rowspan/colspan and unsplittable image-tall cells remain limited as previously documented.

---

## What is working

- Live open of enquiry 1515 through Search Quote + Simplex + Cinqo.  
- Geometry bands (15 / 21 / 220 / 26 → 831px content).  
- Integrity **banner + PDF block** when preview is known-dirty (Phase 3).  
- Vitest coverage for geometry/split/determinism.  
- Artifact trail for screenshots + JSON report.

---

## Recommendation

**Do not approve for production** until:

1. Enquiry 1515 Align Page yields **zero** stamped units with `bottom > usable−12`.  
2. Integrity banner clears, then PDF downloads and page count/order match preview.  
3. Phase 4 probe cannot obtain a PDF without an integrity alert.  
4. Zoom 80/100/125 rechecked with the real preview zoom shell.
