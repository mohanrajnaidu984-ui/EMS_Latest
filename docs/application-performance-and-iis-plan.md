# EMS responsiveness investigation and IIS rollout plan

Date: 2026-10-30. Changes are local only; nothing was deployed.
Primary case: enquiry 1515, Simplex Project, Cinqo, saved quotation
`SMA/SXP/1515-L1/1504-R4`.

## Outcome and limits

The A4 preview and repeated Align Page operation are substantially faster. The
actual quotation still produces eight valid pages, with identical preview/PDF
content and page breaks. This is not certification that every EMS operation is
instant. The sales report, full enquiry bootstrap, and full quote-history API
remain measurable bottlenecks. Production IIS load and concurrent-user capacity
have not been measured. No writes to quotation/pricing/enquiry records or SQL
index/schema changes were made for this investigation; local API startup retains
the application's existing initialization behavior.

## Measurements

Single-user Chromium automation on this workstation, against the configured SQL
database through an isolated local API on port 5008. Frontend ports: Vite 5176,
locally built production frontend 5180. These are individual samples, not p95
claims or IIS measurements.

| Operation | Before, development | After, development | After, production build locally |
|---|---:|---:|---:|
| Navigation shell ready | 4,819 ms | 425 ms | 237 ms |
| Startup foreground data settled | Exceeded 20-second observer limit | 3,691 ms | 2,727 ms |
| Select saved R4 to enabled Align | 10,329 ms | 3,703 ms | 1,635 ms |
| Repeated Align, first / second click | 4,767 / 5,133 ms | 597 / 498 ms | 113 / 97 ms |
| Download PDF | 2,784 ms | 8,090 ms outlier | 894 ms |

The production-build first measured pack itself was 1,025 ms; repeated Align
reused that pack only after validating the currently painted document. New or
changed large content still needs real layout work. The 8-second PDF outlier is
retained in the evidence; it prevents an unconditional cold-start latency claim.
Two separate warm server renders took 899 and 745 ms. PDF stage timings are
available in `scratch/pdf-performance-repeat.json` (base64 timing header).

Direct API before/after comparisons, same admin filters and fixed `today`:

| API | Before | After | Correctness |
|---|---:|---:|---|
| Dashboard current calendar | 6,282 ms | 263 ms | Identical daily counts and totals |
| Dashboard month history and year totals | 10,286 ms | 340 ms | Identical daily counts and totals |
| Users metadata payload | 4,904,096 bytes | 44,357 bytes | 153 metadata records; full endpoint retained |

Production-build module navigation samples:

| Screen | First feedback/paint after click | Foreground requests settled |
|---|---:|---:|
| Dashboard, already loaded | 41 ms | 74 ms |
| Enquiry | 68 ms | 847 ms |
| Pricing | 64 ms | 1,530 ms |
| Probability | 71 ms | 913 ms |
| Sales Report | 75 ms | 6,879 ms |
| Sales Target (`Reports`) | 73 ms | 854 ms |
| Approvals | 48 ms | 882 ms |
| Usage | 60 ms | 826 ms |
| Help | 48 ms | 383 ms |
| About | 47 ms | 397 ms |

First paint includes navigation/loading feedback, not proof the screen's data is
ready. The observer includes unrelated foreground requests still running during
navigation. Sales Report's readiness measurement was corrected to wait for lazy
code; the earlier baseline incorrectly observed it before its requests started.
Do not use that baseline to claim a sales-report speedup. ChatBox was disabled by
the existing configuration; B2C remains the existing placeholder. This audit does
not exercise every CRUD operation, upload, notification, email, or role variant.

## Causes and local corrections

1. **Eager module loading.** Main imported almost every screen, including the
   large Quote editor. Initial JavaScript was approximately 6.1 MB uncompressed.
   Screens now use one shared lazy-import promise with hover/focus preloading.
   Initial entry JavaScript is 396 KB (125 KB gzip); deferred Quote code is still
   about 2.86 MB and remains a candidate for future editor-only splitting.
2. **Duplicate external work.** HTML loaded a blocking public-CDN html2pdf script
   in addition to the module implementation. The fallback now imports the module
   only when invoked. Bootstrap, its icons, and the same Inter font weights are
   bundled locally instead of depending on three external CSS/font services.
3. **Repeated pagination layout.** A hidden segment-measurement tree duplicated
   all rich HTML; the measured pack then reconstructed every growing prefix,
   followed by fixed 250/900/1400 ms settling/repack timers. Removed the unused
   measurement tree, retained estimates for first paint, and changed the existing
   packer's prefix search to exponential bounds plus binary search over its
   keep-with-next boundaries. Existing fit/coverage verification remains.
4. **Unnecessary repacking.** An exact-content, document-local layout cache skips
   repacking unchanged content only when page groups, font readiness, loaded
   images, current visibility checks, and measured page geometry agree. React
   clears the busy state after actual validation rather than timer expiry.
   Same-length edits now invalidate the segment cache; the old head/tail/length
   signature could miss middle edits. Nothing is cached across saved documents
   or browser sessions.
5. **Effect churn and repeated JSON parsing.** Scoped quote fetches no longer
   depend on the changing `calculatedTabs` array identity. Branch identity is
   included in the primitive request key. User callback dependencies are scalar
   email fields, large quote-body console dumps are removed, and simultaneous
   identical quote reads share one fetch/JSON parse. Completed responses are not
   retained as a stale data cache. A valid division selection survives an options
   refresh. Tests now wait for lazy screens/options rather than assuming a fixed
   one-second delay is sufficient.
6. **Oversized shared data.** Startup user selectors fetched embedded photos,
   signatures, and password fields in every record. DataContext now requests an
   explicit metadata projection (`/api/users?summary=1`); the existing full API is
   retained for compatibility. Master selectors no longer wait for the full
   enquiry cache. Full enquiry data remains intact for existing editing flows.
7. **Dashboard repeated SQL scans.** History ran one batch per month plus missing
   anchor-year months, and each batch ran a second totals query although displayed
   totals were already defined as sums of daily rows. History now performs one
   range query and partitions the result into months. Current/pair queries use the
   same range predicates. Access, division, assigned engineer, no-quote and date
   filters remain in SQL. Redundant SQL-only totals diagnostics are now null;
   displayed counts and annual totals matched the saved baseline exactly.
8. **Usage polling.** Requests could await a Windows network-adapter PowerShell
   probe while a background probe was also running. One in-flight probe is now
   shared and optional network statistics are returned from the rolling sample,
   with a sample timestamp, without holding up the API. Unknown network rates
   remain null.
9. **IIS browser cache.** The local `public/web.config` now revalidates unversioned
   static files and gives Vite's content-hashed `/assets` a one-year public cache.
   This does not introduce caching for authenticated API responses. XML parses;
   effective IIS configuration still requires staging validation.

Pricing/VAT formulas, saved quotation payloads, editor content, branding and
workflow rules were not rewritten. There is still one measured pagination owner.

## Verification and evidence

- 21 unit tests passed, including a 2,048-unit BOQ packing budget/order test,
  concurrent read identity separation, retry and post-completion freshness.
- Frontend production build and changed backend JavaScript syntax checks pass.
- Actual R4: 134 nonempty units, eight pages, no duplicate/missing unit IDs,
  no overflow/sparse pages, stable repeated assignments, zoom 80/100/125%.
- Export: eight A4 PDF pages, ordered block/text parity on every page, all 32
  matrix checkmarks preserved; deliberately introduced overflow blocks download
  even when a previously generated PDF is cached. All PDF pages were freshly
  rendered and visually reviewed.
- `e2e/application-performance.spec.js`: reproducible module/quote timing probe.
- `e2e/quote-pagination-investigation.spec.js`: real preview/PDF correctness probe.
- `e2e/artifacts/performance/{baseline-dev,optimized-dev,optimized-production-build}/report.json`.
- `e2e/artifacts/independent-investigation/`: actual PDF, page images, preview,
  zoom, integrity gate, parity and validation-summary JSON.
- `scratch/dashboard-before.json` / `dashboard-after.json`: count comparison.
- `scratch/dashboard-filter-parity.json`: old/new SQL count parity for December
  2025, January 2026 and Simplex-filtered October 2026, covering year boundaries.
- `scratch/performance-baseline-20261030/`: before-performance source snapshot.

## Remaining latency work

1. **Sales report first.** `top-job-booked` took 5.9 seconds and returned 612 KB.
   The screen's global loading state waits for both summary and table. Its SQL
   includes latest-probability ranking, per-row quote matching using trimmed
   expressions, fallback branches and two concerned-engineer enrichment queries.
   Obtain actual execution plans for Won/Quoted/Pending and representative users;
   optimize the dominant plan before changing financial aggregation semantics.
   Candidate supporting indexes must be checked against existing indexes and
   write costs, especially quote reference/revision and probability scope/date
   columns. Do this on a staging database, with result-set/financial-total parity
   across all statuses. No indexes were added to the shared SQL server here.
2. **Full list payloads.** Startup still fetches ~6.7 MB of enquiries and quote
   history can fetch ~3.9 MB of full revisions. Introduce dedicated metadata list
   endpoints and full-record-on-selection loading, with explicit migration of
   callers that currently rely on cached HTML, signature and draft fields. Keep
   saves and permissions fresh; do not mask these costs with long-lived caches.
3. **Editor split.** Defer Jodit and export-only code until editing/export; keep
   paste/table normalization shared. Test preview, editor activation, toolbar,
   saved formatting and all PDF fallbacks after that change.
4. **Profile the largest supported quote.** Enquiry 1515 is the verified primary
   sample, not an unlimited-size benchmark. Record quote size, image sizes, row
   count, page count, first-pack CPU time and long tasks on normal user PCs.

## Windows Server 2012 R2 / IIS 8.5 plan

### Resolve the renderer/runtime constraint

IIS can serve the optimized static frontend. It cannot remove client-side layout
cost or make an obsolete server a supported modern Chromium host. Node 22 lists
Windows 10/Server 2016+ as Tier 1 and Windows 8.1/Server 2012 as experimental.
Chrome 109 was the last supported Chrome on Server 2012/R2. Local PDF validation
used Chrome 156 and Node 24; the repository backend declares Node 22. Therefore
neither the deployed runtime nor Node 22 parity is certified by these tests.

Prefer a supported Windows Server 2022/2025 application host for Node/PDF, or a
supported internal worker host behind the existing proxy while migration is
prepared. Windows is the simplest fit for the current UNC attachment identity
and integrated environment. Validate SQL connectivity, share credentials/ACLs,
SMTP, fonts and renderer version there. Do not replace Chrome with 109 and assume
the same PDF behavior. Microsoft lists October 13, 2026 as the 2012/R2 ESU end
date, already past at this investigation date.

### Stage the hosting changes

1. Inventory CPU/RAM, current Node/Chrome/PM2 versions, IIS effective config,
   compression role services, existing SQL indexes, network latency, and actual
   simultaneous users. Current concurrency is unknown.
2. Build on a supported machine with a recorded dependency lock/build manifest.
   The repository currently ignores `package-lock.json`; retain the tested lock
   in the release process so dependency resolution is reproducible. Deploy a
   compiled `dist`, never the Vite development server.
3. Test the new `web.config` in an IIS staging site. Confirm no 500.19 locked
   section errors; `/index.html` revalidates, hashed assets cache, APIs remain
   private/uncached, and old hashed files remain available during rollout to
   avoid breaking already-open browser sessions.
4. At the appropriate IIS administration scope, enable installed static/dynamic
   gzip compression for HTML/CSS/JS/JSON and verify `Content-Encoding`, `Vary`,
   transfer size and CPU cost. Do not blindly add potentially locked
   `httpCompression` configuration to the site's web.config. Avoid compressing
   PDFs/images/archives again or buffering Socket.IO/streaming responses.
5. Keep ARR rewrite destinations explicit and reachable. Retain the current
   WebSocket/Socket.IO routing and verified responseBufferLimit=0. Maintain Node
   keep-alive greater than the configured ARR idle timeout. Longer timeouts are
   not a performance fix. If moving the API host, restrict its listener/firewall
   to the intended proxy/application network.
6. Run Node under the existing supervised service/PM2 strategy without development
   watch mode. Keep a single application instance until presence, scheduler,
   draft/socket behavior and PDF pools support multiple processes. Do not enable
   cluster mode merely to hide a slow query or duplicate reminder scheduling.
7. Install/check Application Initialization before using application-pool
   AlwaysRunning and site preload. Warm a lightweight health path. Node service
   startup and the existing browser pool warm-up are separate from IIS preload.
   Do not generate real quotations or run full dashboard history as a warm-up.
8. Bound PDF parallelism/queue size to measured RAM/CPU; test one and two concurrent
   exports first. Keep normal API traffic responsive under PDF load and return an
   explicit busy response rather than growing an unbounded queue. Tune existing
   pool controls only after inspecting their effective values and behavior.

### Acceptance and release gates

- Treat immediate feedback as a separate target: p95 click feedback <=100 ms,
  repeated unchanged Align <=250 ms, ordinary scoped reads <=1 second, and first
  large preview <=2 seconds on agreed client hardware/LAN. These are proposed
  budgets, not measured production guarantees. Set separate cold PDF/report
  budgets from representative data and observed p95/p99.
- Run cold/warm tests, same enquiry 1515 plus largest representative quotes,
  normal/CC/admin access, changed middle paragraphs, image/font completion,
  landscape pages, draft switching and save/revision workflows.
- Check price/VAT totals, content hashes/order, PDF page parity, logos/footers,
  attachments, approval access and email behavior in a non-production dataset.
- Use an isolated staging database/SMTP sink for mutation tests. Load-test a
  realistic mixed read/edit/export workload at measured peak concurrency plus
  headroom. Until that number is supplied, 5/10/25-user stages are investigation
  scenarios, not capacity commitments. Do not run this load against shared live
  SQL without a scheduled approval/window.
- Collect endpoint p50/p95/p99, SQL duration/pool waits, Node event-loop lag,
  browser long tasks, transfer sizes, PDF queue time and IIS 5xx/error rates.
  Include pool recycles, worker restart and first request after idle.
- Publish only after those gates pass and deployment is approved. Keep the prior
  frontend assets/backend release/config for rollback; do not roll back saved
  business data. Recheck all eight pages and key timings after staging/release.

Official references:

- [Node 22 platform support](https://github.com/nodejs/node/blob/v22.x/BUILDING.md)
- [Chrome Windows/Windows Server support](https://support.google.com/chrome/a/answer/7100626?hl=en)
- [Windows Server ESU dates](https://learn.microsoft.com/en-us/windows-server/get-started/extended-security-updates-overview)
- [IIS client caching](https://learn.microsoft.com/en-us/iis/configuration/system.webserver/staticcontent/clientcache)
- [IIS compression](https://learn.microsoft.com/en-us/iis/configuration/system.webserver/httpcompression/)
- [IIS Application Initialization](https://learn.microsoft.com/en-us/iis/configuration/system.webserver/applicationinitialization/)
