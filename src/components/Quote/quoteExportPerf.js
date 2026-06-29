/**
 * Quote PDF / email export timing — enable with localStorage.emsQuotePerf = '1' or ?emsQuotePerf=1
 */

const PERF_FLAG_KEY = 'emsQuotePerf';

export function isQuoteExportPerfEnabled() {
    try {
        if (typeof window === 'undefined') return false;
        if (window.localStorage?.getItem(PERF_FLAG_KEY) === '1') return true;
        return /(?:^|[?&])emsQuotePerf=1(?:&|$)/.test(String(window.location?.search || ''));
    } catch {
        return false;
    }
}

/**
 * @param {string} label
 * @returns {{ end: (extra?: Record<string, unknown>) => number }}
 */
export function quotePerfStart(label) {
    const enabled = isQuoteExportPerfEnabled();
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (enabled) {
        console.time(`[QuotePerf] ${label}`);
    }
    return {
        end(extra) {
            const ms = Math.round(
                (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0
            );
            if (enabled) {
                console.timeEnd(`[QuotePerf] ${label}`);
                if (extra && Object.keys(extra).length) {
                    console.log(`[QuotePerf] ${label} detail`, extra);
                }
            }
            return ms;
        },
    };
}

/**
 * @param {string} flow e.g. 'PDF Download' | 'Email Draft'
 * @param {Record<string, number>} stages ms per stage
 */
export function quotePerfSummary(flow, stages) {
    if (!isQuoteExportPerfEnabled()) return;
    const total = Object.values(stages).reduce((s, n) => s + (Number(n) || 0), 0);
    console.table(
        Object.entries(stages).map(([stage, ms]) => ({
            flow,
            stage,
            ms: Number(ms) || 0,
            pct: total > 0 ? `${Math.round(((Number(ms) || 0) / total) * 100)}%` : '—',
        }))
    );
    console.log(`[QuotePerf] ${flow} TOTAL: ${total}ms`);
}
