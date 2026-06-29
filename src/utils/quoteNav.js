/** Top-level app tabs for the quote module (B2B = existing format; B2C reserved). */
export const QUOTE_TAB_B2B = 'Quote B2B';
export const QUOTE_TAB_B2C = 'Quote B2C';
export const QUOTE_TAB_LEGACY = 'Quote';

export function isQuoteModuleTab(tab) {
    const t = String(tab || '').trim();
    return t === QUOTE_TAB_B2B || t === QUOTE_TAB_B2C || t === QUOTE_TAB_LEGACY;
}

/** Map legacy session / deep-link tab ids to B2B. */
export function normalizeAppTabId(tab) {
    const t = String(tab || '').trim();
    if (t === QUOTE_TAB_LEGACY) return QUOTE_TAB_B2B;
    return t;
}
