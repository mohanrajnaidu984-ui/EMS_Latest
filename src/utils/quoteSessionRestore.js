const STORAGE_PREFIX = 'ems_quote_workspace_v1:';

function normalizeEmail(raw) {
    return String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/@almcg\.com/g, '@almoayyedcg.com');
}

function storageKey(userEmail) {
    const e = normalizeEmail(userEmail);
    return e ? `${STORAGE_PREFIX}${e}` : '';
}

export function readQuoteSessionSnapshot(userEmail) {
    const key = storageKey(userEmail);
    if (!key) return null;
    try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || !parsed.payload) return null;
        return parsed;
    } catch {
        return null;
    }
}

export function writeQuoteSessionSnapshot(userEmail, payload) {
    const key = storageKey(userEmail);
    if (!key || !payload) return false;
    try {
        sessionStorage.setItem(
            key,
            JSON.stringify({
                version: 1,
                savedAt: new Date().toISOString(),
                payload,
            })
        );
        return true;
    } catch (e) {
        console.warn('[quoteSessionRestore] write failed', e);
        return false;
    }
}

export function clearQuoteSessionSnapshot(userEmail) {
    const key = storageKey(userEmail);
    if (!key) return;
    try {
        sessionStorage.removeItem(key);
    } catch {
        /* ignore */
    }
}
