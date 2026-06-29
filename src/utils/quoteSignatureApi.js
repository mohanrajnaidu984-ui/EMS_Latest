/**
 * API client: user signature library (Master_ConcernedSE) and quote stamps (EnquiryQuotes).
 */

const API_BASE = String(import.meta.env?.VITE_API_BASE ?? '').replace(/\/+$/, '');

function apiUrl(path) {
    const p = path.startsWith('/') ? path : `/${path}`;
    return API_BASE ? `${API_BASE}${p}` : p;
}

export function normalizeSignatureEmail(email) {
    return String(email || '')
        .trim()
        .toLowerCase()
        .replace(/@almcg\.com/g, '@almoayyedcg.com');
}

/** @returns {{ defaultSignatureId: string|null, signatures: Array }} */
export async function fetchUserSignatureLibrary(userEmail) {
    const email = normalizeSignatureEmail(userEmail);
    if (!email) return { defaultSignatureId: null, signatures: [] };
    const res = await fetch(
        `${apiUrl('/api/quotes/user-digital-signatures')}?userEmail=${encodeURIComponent(email)}`
    );
    if (!res.ok) {
        console.warn('[quoteSignatureApi] fetchUserSignatureLibrary failed', res.status);
        return { defaultSignatureId: null, signatures: [] };
    }
    const data = await res.json();
    return {
        defaultSignatureId: data.defaultSignatureId || null,
        signatures: Array.isArray(data.signatures) ? data.signatures : [],
    };
}

/** @param {{ defaultSignatureId?: string|null, signatures: Array }} library */
export async function saveUserSignatureLibrary(userEmail, library) {
    const email = normalizeSignatureEmail(userEmail);
    if (!email) return false;
    const res = await fetch(apiUrl('/api/quotes/user-digital-signatures'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userEmail: email,
            defaultSignatureId: library.defaultSignatureId ?? null,
            signatures: library.signatures || [],
        }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.details || res.statusText);
    }
    return true;
}

/** @returns {Array} placed stamps on a saved quote */
export async function fetchQuoteDigitalStamps(quoteId) {
    const id = String(quoteId ?? '').trim();
    if (!id) return [];
    const res = await fetch(apiUrl(`/api/quotes/${encodeURIComponent(id)}/digital-signatures`));
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.stamps) ? data.stamps : [];
}

/** Replace all stamps on a quote revision. */
export async function saveQuoteDigitalStamps(quoteId, stamps) {
    const id = String(quoteId ?? '').trim();
    if (!id) return false;
    const res = await fetch(apiUrl(`/api/quotes/${encodeURIComponent(id)}/digital-signatures`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stamps }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.details || res.statusText);
    }
    return true;
}

/** Append or upsert one stamp (multi-user safe read-merge-write on server). */
export async function appendQuoteDigitalStamp(quoteId, stamp) {
    const id = String(quoteId ?? '').trim();
    if (!id) return [];
    const res = await fetch(apiUrl(`/api/quotes/${encodeURIComponent(id)}/digital-signatures/stamps`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stamp }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.details || res.statusText);
    }
    const data = await res.json();
    return Array.isArray(data.stamps) ? data.stamps : [];
}
