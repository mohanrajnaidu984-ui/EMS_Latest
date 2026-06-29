/**
 * Master_ConcernedSE.DigitalSignaturesJson — per-user signature library.
 * EnquiryQuotes.DigitalSignaturesJson — placed stamps on a quote revision (multi-user).
 */

const crypto = require('crypto');
const MAX_USER_SIGNATURES = 12;

function newSigId() {
    return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `sig-${Date.now()}`;
}

function normalizeUserEmail(email) {
    return String(email || '')
        .trim()
        .toLowerCase()
        .replace(/@almcg\.com/g, '@almoayyedcg.com');
}

function parseJsonArray(raw) {
    if (raw == null || raw === '') return [];
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/** Master library: { version, defaultSignatureId, signatures[] } */
function parseUserSignatureMaster(raw) {
    if (raw == null || raw === '') {
        return { version: 1, defaultSignatureId: null, signatures: [] };
    }
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed)) {
            return {
                version: 1,
                defaultSignatureId: parsed[0]?.id || null,
                signatures: sanitizeUserSignatures(parsed),
            };
        }
        if (parsed && typeof parsed === 'object') {
            return {
                version: 1,
                defaultSignatureId: parsed.defaultSignatureId || null,
                signatures: sanitizeUserSignatures(parsed.signatures || parsed.items || []),
            };
        }
    } catch {
        /* fall through */
    }
    return { version: 1, defaultSignatureId: null, signatures: [] };
}

function sanitizeUserSignatures(list) {
    const arr = Array.isArray(list) ? list : [];
    return arr
        .filter((s) => s && String(s.imageDataUrl || '').length > 10)
        .slice(0, MAX_USER_SIGNATURES)
        .map((s) => ({
            id: String(s.id || newSigId()),
            label: String(s.label || s.name || 'Signature').trim().slice(0, 120),
            imageDataUrl: String(s.imageDataUrl || ''),
            createdAt: s.createdAt || new Date().toISOString(),
            showNameOnStamp: s.showNameOnStamp !== false,
            showDateTimeOnStamp: s.showDateTimeOnStamp !== false,
        }));
}

function serializeUserSignatureMaster({ defaultSignatureId, signatures }) {
    const sigs = sanitizeUserSignatures(signatures);
    let defId = defaultSignatureId || null;
    if (defId && !sigs.some((s) => s.id === defId)) defId = sigs[0]?.id || null;
    return JSON.stringify({
        version: 1,
        defaultSignatureId: defId,
        signatures: sigs,
    });
}

/** Quote stamps array (multiple users). */
function parseQuoteDigitalStamps(raw) {
    return parseJsonArray(raw)
        .map((s, i) => ({
            id: s.id || `db-stamp-${i}`,
            placedByEmail: normalizeUserEmail(s.placedByEmail || s.placedBy || ''),
            sheetIndex: (() => {
                const si = Number(s.sheetIndex);
                return Number.isFinite(si) && si >= 1 ? si : 1;
            })(),
            xPct: typeof s.xPct === 'number' && Number.isFinite(s.xPct) ? s.xPct : 82,
            yPct: typeof s.yPct === 'number' && Number.isFinite(s.yPct) ? s.yPct : 38,
            imageDataUrl: s.imageDataUrl || '',
            displayName: String(s.displayName || '').trim(),
            designation: String(s.designation || '').trim(),
            placedAtIso: s.placedAtIso || '',
            verificationCode: s.verificationCode || '',
            showNameOnStamp: s.showNameOnStamp !== false,
            showDateTimeOnStamp: s.showDateTimeOnStamp !== false,
            inheritedFromSubJob: !!s.inheritedFromSubJob,
        }))
        .filter((s) => s.imageDataUrl && String(s.imageDataUrl).length > 10);
}

function serializeQuoteDigitalStamps(stamps) {
    const list = Array.isArray(stamps) ? stamps : [];
    return JSON.stringify(
        list
            .filter((s) => s && !s.inheritedFromSubJob)
            .map((s) => ({
                id: s.id,
                placedByEmail: normalizeUserEmail(s.placedByEmail || s.placedBy || ''),
                sheetIndex: s.sheetIndex,
                xPct: s.xPct,
                yPct: s.yPct,
                imageDataUrl: s.imageDataUrl,
                displayName: s.displayName,
                designation: s.designation,
                placedAtIso: s.placedAtIso,
                verificationCode: s.verificationCode,
                showNameOnStamp: s.showNameOnStamp !== false,
                showDateTimeOnStamp: s.showDateTimeOnStamp !== false,
            }))
    );
}

/** Upsert one stamp by id; preserve stamps from other users. */
function mergeQuoteStamp(existingRaw, newStamp) {
    const list = parseQuoteDigitalStamps(existingRaw);
    const stamp = { ...newStamp, placedByEmail: normalizeUserEmail(newStamp.placedByEmail) };
    const idx = list.findIndex((s) => s.id === stamp.id);
    if (idx >= 0) list[idx] = { ...list[idx], ...stamp };
    else list.push(stamp);
    return list;
}

module.exports = {
    MAX_USER_SIGNATURES,
    normalizeUserEmail,
    parseUserSignatureMaster,
    serializeUserSignatureMaster,
    sanitizeUserSignatures,
    parseQuoteDigitalStamps,
    serializeQuoteDigitalStamps,
    mergeQuoteStamp,
};
