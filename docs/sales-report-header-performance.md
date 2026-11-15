# Sales Report header and loading improvements

Validated on 11 November 2026 using read-only requests for the 2026 report.

- Top divisions include their annual booked value in BHD, formatted to one decimal place (for example, `5.4M`). The value is bold green.
- The header requests `view=header`, so it loads booking/GP quarterly totals and the leaderboard without running quoted-value and pipeline-funnel queries that the header does not display.
- The Won table ranks quote revisions once and joins that result by normalized quote reference, replacing a separate `TOP 1` quote lookup for every job.
- Report API callbacks depend on the normalized user email rather than the full profile object, avoiding repeated report requests when a profile refresh leaves the identity unchanged.
- Charts no longer stay blocked while the separate jobs table loads; the table has its own loading indicator.

Observed API durations in this environment (milliseconds):

| Request | Baseline | Optimized, three consecutive runs |
|---|---:|---|
| Header | 1,423 | 780 / 475 / 456 |
| Report summary | 776 | 979 / 415 / 588 |
| Won table | 1,404 | 446 / 508 / 427 |

Timings vary with database load and cache warmth. These are request measurements, not a guarantee of end-to-end browser load time.

The header's booking and GP actual/target values matched the original full summary for every quarter. The report summary and all returned Won-table rows matched the baseline. Requests made no changes to database records. Browser checks cover the amount display, user scope parameters, two-second leaderboard rotation, five-second KPI rotation, and fit above the menu at 1280px and 1600px.
