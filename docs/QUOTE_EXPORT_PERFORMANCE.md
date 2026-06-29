# Quote PDF & Email Export Performance

## Enable profiling

In the browser (quote page):

- Add `?emsQuotePerf=1` to the URL, **or**
- Run `localStorage.setItem('emsQuotePerf', '1')` and reload.

Open DevTools → Console. Each flow logs `[QuotePerf]` `console.time` / `console.table` breakdowns.

## PDF download stages (client)

| Stage | Label |
|-------|--------|
| Health | `PDF — API health` |
| Layout | `PDF — cover gap sync` |
| Stage 1 | `PDF — DOM clone & capture` |
| Stage 1 | `PDF — HTML generation` |
| Stage 2 | `PDF — server rendering` (see server header below) |
| Stage 3 | `PDF — blob / download stream` |
| Save | `PDF — file save` |

**html2pdf fallback:** `PDF html2pdf — gap sync`, `DOM clone`, `rendering`.

Server adds `X-EMS-PDF-Timing` (base64 JSON): `dataPrepMs`, `browserLaunchMs`, `pageLoadMs`, `imagesMs`, `renderMs`, `restrictMs`, `totalMs`.

## Email draft stages (client)

| Stage | Label |
|-------|--------|
| Payload | `Email — draft payload` |
| Parallel | `Email — PDF generation`, `Email — outlook fields`, `Email — attachments fetch` |
| VBS path | `Email — VBS attachment downloads` |
| Outlook | `Email — open Outlook` (+ base64 / local / server in `quoteOutlookDraft.js`) |

## Optimizations implemented

1. **Server PDF** — Puppeteer browser pool (`quotePdfBrowserPool.cjs`); warm on `GET /api/quote-pdf/health?launch=1` when the quote tab loads.
2. **PDF blob cache** — Same preview key reuses blob for Download + Email (no second render).
3. **Outlook fields preload** — Fetched when enquiry + attention are set; cache reused on Email click.
4. **Email parallel fetch** — PDF, To/CC API, and attachments in one `Promise.all` (removed duplicate PDF call).
5. **Instrumentation** — Stage timings for demo tuning and regression checks.

## Targets

| Flow | Ideal | Max |
|------|-------|-----|
| Small quote PDF | &lt; 2 s | — |
| Medium quote PDF | &lt; 5 s | — |
| Large BOQ PDF | — | &lt; 10 s |
| Email draft | &lt; 1 s | &lt; 2 s |

**Note:** First PDF after server idle may include Chromium launch (~2–8 s). Second download/email with unchanged quote should be much faster (pool + cache).

## Before vs after (typical)

Measure on your machine with `emsQuotePerf=1`. Example patterns:

| Scenario | Before (typical) | After (typical) |
|----------|------------------|-----------------|
| First PDF (cold Chrome) | 8–25 s | 5–15 s |
| Second PDF (same quote) | 8–25 s | 1–4 s (cache + warm pool) |
| Email after PDF cached | 10–30 s sequential | 2–6 s (parallel + cache) |
| Email with preloaded To/CC | +1–3 s API wait | +0 ms (cache hit) |

Record your numbers in the table above after testing small / medium / large BOQ quotes.

## Local vs server PDF pagination

Pagination is computed **in the browser** (sheet split). The API **renders** that HTML with Puppeteer.

| Factor | Local dev | IIS / server |
|--------|-----------|--------------|
| PDF engine | Often Puppeteer **Chrome** on your PC | Often **Edge** via `PUPPETEER_EXECUTABLE_PATH` — different line metrics |
| Logs | Browser: `?emsQuotePerf=1` | API: `EMS_QUOTE_PDF_PERF_LOG=1` in `backend/.env` → PM2 logs `[quote-pdf][perf]` |
| CSS profile | `quotePdfCssVersion` on `/api/quote-pdf/health` | Must show `2026-06-04-continuation-fit` after deploy |

**Symptoms on server:** extra PDF pages, white band above footer on continuation sheets — caused by `min-height: 297mm` + grid `1fr` middle row. Fix: continuation sheets use `min-height: auto` + `grid-template-rows: auto auto auto` in export CSS (see `quotePrintExportCss.js`).

**Verify deploy:** `GET /api/quote-pdf/health` → `quotePdfCssVersion`, `chromeEngine`. Compare `[quote-pdf][pagination]` sheet heights in PM2 for the same quote as local.

## Bottlenecks (usual)

1. **Puppeteer first launch** — Mitigated by pool + `health?launch=1`.
2. **Large HTML capture** — BOQ sheet count drives `captureMs` / server `pageLoadMs`.
3. **Client html2pdf** — Only when server PDF disabled; avoid for large BOQ in production.
4. **Email PDF base64** — Large PDFs add `base64Ms`; server/local helper path avoids VBS wait when COM works.
