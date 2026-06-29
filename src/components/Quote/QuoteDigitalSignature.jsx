import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PenLine, Upload, Trash2, X, GripHorizontal } from 'lucide-react';
import {
    fetchUserSignatureLibrary,
    saveUserSignatureLibrary,
    normalizeSignatureEmail,
} from '../../utils/quoteSignatureApi';
import { formatSignaturePlacedDateTime } from '../../utils/enquiryResultsHelpers';

/** Dispatched when placing from profile modal on Quote tab (QuoteForm listens). */
export const EMS_QUOTE_PLACE_STAMP_EVENT = 'ems-quote-place-digital-stamp';

export const SIG_LIB_STORAGE_PREFIX = 'ems_quote_sig_library_v1:';

const DEFAULT_SIG_ID_KEY = 'ems_quote_default_sig_id_v1:';

export function loadDefaultSignatureId(email) {
    if (!email) return null;
    try {
        return localStorage.getItem(DEFAULT_SIG_ID_KEY + normalizeSignatureEmail(email)) || null;
    } catch {
        return null;
    }
}

export function saveDefaultSignatureId(email, signatureId) {
    if (!email) return;
    try {
        const k = DEFAULT_SIG_ID_KEY + normalizeSignatureEmail(email);
        if (!signatureId) localStorage.removeItem(k);
        else localStorage.setItem(k, String(signatureId));
    } catch (e) {
        console.warn('[SignatureVault] save default id failed', e);
    }
}

export function resolveDefaultSignatureImage(email) {
    const id = loadDefaultSignatureId(email);
    if (!id) return null;
    const lib = loadSignatureLibrary(email);
    const hit = lib.find((x) => x.id === id);
    return hit?.imageDataUrl || null;
}

export function loadSignatureLibrary(email) {
    if (!email) return [];
    try {
        const raw = localStorage.getItem(SIG_LIB_STORAGE_PREFIX + normalizeSignatureEmail(email));
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

export function saveSignatureLibrary(email, items) {
    if (!email) return;
    try {
        localStorage.setItem(
            SIG_LIB_STORAGE_PREFIX + normalizeSignatureEmail(email),
            JSON.stringify(items.slice(0, 12))
        );
    } catch (e) {
        console.warn('[SignatureVault] save library failed', e);
    }
}

/** One-time upload of browser library to Master_ConcernedSE when server row is empty. */
export async function migrateLocalSignatureLibraryToServer(email) {
    const normalized = normalizeSignatureEmail(email);
    if (!normalized) return null;
    const local = loadSignatureLibrary(normalized);
    if (!local.length) return null;
    const server = await fetchUserSignatureLibrary(normalized);
    if (server.signatures?.length) return server;
    const defaultId = loadDefaultSignatureId(normalized);
    await saveUserSignatureLibrary(normalized, {
        defaultSignatureId: defaultId,
        signatures: local,
    });
    return fetchUserSignatureLibrary(normalized);
}

/** Safe segment for localStorage key (enquiry no + lead context + customer). */
function stampScopeSegment(s) {
    return String(s || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[^a-z0-9._-]+/g, '_')
        .slice(0, 120) || '_';
}

/**
 * Scoped stamp blob: same enquiry but different lead job / customer → different key
 * so placed signatures do not leak across quote contexts.
 */
export function stampStorageKey(requestNo, leadJobKey = '', customerToName = '') {
    const r = stampScopeSegment(requestNo || 'draft');
    return `ems_quote_digistamps_v2:${r}:${stampScopeSegment(leadJobKey)}:${stampScopeSegment(customerToName)}`;
}

export function loadStampsForEnquiry(requestNo, leadJobKey = '', customerToName = '') {
    if (!requestNo) return [];
    try {
        const raw = localStorage.getItem(stampStorageKey(requestNo, leadJobKey, customerToName));
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

export function saveStampsForEnquiry(requestNo, stamps, leadJobKey = '', customerToName = '') {
    if (!requestNo) return;
    try {
        localStorage.setItem(stampStorageKey(requestNo, leadJobKey, customerToName), JSON.stringify(stamps));
    } catch (e) {
        console.warn('[SignatureVault] save stamps failed', e);
    }
}

/** Parse stamps from EnquiryQuotes.DigitalSignaturesJson (saved revision). */
export function parseDigitalSignaturesFromQuoteRow(quote) {
    const raw = quote?.DigitalSignaturesJson ?? quote?.digitalSignaturesJson;
    if (raw == null || raw === undefined || raw === '') return [];
    try {
        const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!Array.isArray(arr)) return [];
        return arr
            .map((s, i) => ({
                id: s.id || `db-stamp-${i}`,
                placedByEmail: normalizeSignatureEmail(s.placedByEmail || s.placedBy || ''),
                sheetIndex: (() => {
                    const si = Number(s.sheetIndex);
                    return Number.isFinite(si) && si >= 1 ? si : 1;
                })(),
                xPct: typeof s.xPct === 'number' && Number.isFinite(s.xPct) ? s.xPct : 82,
                yPct: typeof s.yPct === 'number' && Number.isFinite(s.yPct) ? s.yPct : 38,
                imageDataUrl: s.imageDataUrl || '',
                displayName: (s.displayName || '').trim(),
                designation: (s.designation || '').trim(),
                placedAtIso: s.placedAtIso || '',
                verificationCode: s.verificationCode || '',
                showNameOnStamp: s.showNameOnStamp !== false,
                showDateTimeOnStamp: s.showDateTimeOnStamp !== false,
                removableBeforeNextCommit: false,
                inheritedFromSubJob: !!s.inheritedFromSubJob,
            }))
            .filter((s) => s.imageDataUrl && String(s.imageDataUrl).length > 10);
    } catch {
        return [];
    }
}

/** Body field for POST/PUT /api/quotes — only real stamps (no preview-only inherited overlays). */
export function serializeDigitalStampsForApi(stamps) {
    const list = Array.isArray(stamps) ? stamps : [];
    return JSON.stringify(
        list
            .filter((s) => s && !s.inheritedFromSubJob)
            .map((s) => ({
                id: s.id,
                placedByEmail: normalizeSignatureEmail(s.placedByEmail || ''),
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

/** Short deterministic-looking token for display (not cryptographic proof). */
export function makeVerificationCode(userEmail, isoNow) {
    const s = `${userEmail || ''}|${isoNow}|${Math.random().toString(36).slice(2, 11)}`;
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = Math.imul(31, h) + s.charCodeAt(i) | 0;
    }
    const part = (h >>> 0).toString(16).toUpperCase().padStart(8, '0').slice(0, 8);
    const d = (isoNow || '').slice(0, 10).replace(/-/g, '');
    return `EMS-${part}-${d}`;
}

/** Physical canvas pixels (saved PNG resolution; scales to modal width on screen). */
const CANVAS_W = 1440;
const CANVAS_H = 480;
const TRIM_PADDING_PX = 4;
/** Minimal padding around ink on quote stamps (display + tight save). */
const STAMP_DISPLAY_TRIM_PADDING_PX = 2;
/** Draw-pad saves at 50% of trimmed ink bounds (tight canvas, no empty margins). */
const DRAW_PAD_SIGNATURE_CONTENT_SCALE = 0.5;
/** Stroke width on the draw pad (slightly bold for readable quote stamps). */
const DRAW_PAD_LINE_WIDTH = 6;

function pixelLooksLikeContent(r, g, b, a, alphaThreshold = 8) {
    if (a < alphaThreshold) return false;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum > 248 && a > 200) return false;
    return true;
}

function getTrimBounds(imageData, width, height) {
    const { data } = imageData;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let found = false;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            if (pixelLooksLikeContent(data[i], data[i + 1], data[i + 2], data[i + 3])) {
                found = true;
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
        }
    }
    if (!found) return null;
    return { minX, minY, maxX, maxY };
}

/** Crop empty margins on all four sides before saving to library. */
function trimCanvasToContent(sourceCanvas, padding = TRIM_PADDING_PX) {
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const imageData = ctx.getImageData(0, 0, w, h);
    const bounds = getTrimBounds(imageData, w, h);
    if (!bounds) return null;
    const contentW = bounds.maxX - bounds.minX + 1;
    const contentH = bounds.maxY - bounds.minY + 1;
    const out = document.createElement('canvas');
    out.width = Math.max(1, contentW + padding * 2);
    out.height = Math.max(1, contentH + padding * 2);
    const octx = out.getContext('2d', { alpha: true });
    if (!octx) return null;
    octx.clearRect(0, 0, out.width, out.height);
    octx.drawImage(sourceCanvas, bounds.minX, bounds.minY, contentW, contentH, padding, padding, contentW, contentH);
    return out;
}

/** Trim, scale uniformly to `contentScale`, return tight canvas (no centered empty margins). */
function prepareDrawPadSignatureForQuote(sourceCanvas, contentScale = DRAW_PAD_SIGNATURE_CONTENT_SCALE) {
    const trimmed = trimCanvasToContent(sourceCanvas, TRIM_PADDING_PX);
    if (!trimmed) return null;
    const scale = Number(contentScale);
    if (!Number.isFinite(scale) || scale <= 0 || scale >= 1) return trimmed;
    const sw = trimmed.width;
    const sh = trimmed.height;
    const dw = Math.max(1, Math.round(sw * scale));
    const dh = Math.max(1, Math.round(sh * scale));
    const out = document.createElement('canvas');
    out.width = dw;
    out.height = dh;
    const ctx = out.getContext('2d', { alpha: true });
    if (!ctx) return trimmed;
    ctx.clearRect(0, 0, dw, dh);
    ctx.drawImage(trimmed, 0, 0, sw, sh, 0, 0, dw, dh);
    return trimCanvasToContent(out, STAMP_DISPLAY_TRIM_PADDING_PX) || out;
}

const signatureImageCropCache = new Map();

/** Crop transparent margins from a data URL (fixes legacy padded library images at display time). */
export function cropSignatureImageDataUrl(dataUrl, padding = STAMP_DISPLAY_TRIM_PADDING_PX) {
    if (!dataUrl || typeof dataUrl !== 'string') {
        return Promise.resolve(dataUrl);
    }
    const cached = signatureImageCropCache.get(dataUrl);
    if (cached) return Promise.resolve(cached);

    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            try {
                const c = document.createElement('canvas');
                c.width = img.naturalWidth || img.width;
                c.height = img.naturalHeight || img.height;
                if (!c.width || !c.height) {
                    resolve(dataUrl);
                    return;
                }
                const ctx = c.getContext('2d', { willReadFrequently: true, alpha: true });
                if (!ctx) {
                    resolve(dataUrl);
                    return;
                }
                ctx.clearRect(0, 0, c.width, c.height);
                ctx.drawImage(img, 0, 0);
                const cropped = trimCanvasToContent(c, padding);
                const out = (cropped || c).toDataURL('image/png');
                if (signatureImageCropCache.size > 96) signatureImageCropCache.clear();
                signatureImageCropCache.set(dataUrl, out);
                resolve(out);
            } catch {
                resolve(dataUrl);
            }
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
    });
}

function useCroppedSignatureImage(imageDataUrl) {
    const [croppedUrl, setCroppedUrl] = useState(imageDataUrl);

    useEffect(() => {
        let alive = true;
        setCroppedUrl(imageDataUrl);
        void cropSignatureImageDataUrl(imageDataUrl).then((url) => {
            if (alive && url) setCroppedUrl(url);
        });
        return () => {
            alive = false;
        };
    }, [imageDataUrl]);

    return croppedUrl;
}

export function resolveSignatureStampPrefs(item) {
    return {
        showNameOnStamp: item?.showNameOnStamp !== false,
        showDateTimeOnStamp: item?.showDateTimeOnStamp !== false,
    };
}

/**
 * Draw / upload / delete saved signatures.
 * When placementEnabled and onPlaceStamp are set (quote pen tool), library rows include Place on page.
 * Profile “Manage signatures” uses placementEnabled=false — place from the user menu dropdown instead.
 */
export function SignatureVaultModal({
    open,
    onClose,
    userEmail,
    totalSheets = 1,
    placementEnabled = true,
    onPlaceStamp,
    displayName,
    designation,
}) {
    const canvasRef = useRef(null);
    const drawing = useRef(false);
    const [library, setLibrary] = useState([]);
    const [newLabel, setNewLabel] = useState('');
    const [pageIndex, setPageIndex] = useState(0);
    const [defaultSigId, setDefaultSigId] = useState(null);
    const [libraryLoading, setLibraryLoading] = useState(false);
    const [librarySaveError, setLibrarySaveError] = useState('');
    const fileRef = useRef(null);

    useEffect(() => {
        if (!open || !userEmail) return;
        let cancelled = false;
        setLibraryLoading(true);
        setLibrarySaveError('');
        setPageIndex(0);
        setNewLabel('');
        (async () => {
            try {
                let master = await migrateLocalSignatureLibraryToServer(userEmail);
                if (!master) master = await fetchUserSignatureLibrary(userEmail);
                if (cancelled) return;
                const sigs = master?.signatures?.length ? master.signatures : loadSignatureLibrary(userEmail);
                const def =
                    master?.defaultSignatureId ||
                    loadDefaultSignatureId(userEmail) ||
                    sigs[0]?.id ||
                    null;
                setLibrary(sigs);
                setDefaultSigId(def);
            } catch (e) {
                if (!cancelled) {
                    console.warn('[SignatureVault] load from server failed', e);
                    setLibrary(loadSignatureLibrary(userEmail));
                    setDefaultSigId(loadDefaultSignatureId(userEmail));
                }
            } finally {
                if (!cancelled) setLibraryLoading(false);
            }
        })();
        const c = canvasRef.current;
        if (c) {
            const ctx = c.getContext('2d', { alpha: true });
            ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = DRAW_PAD_LINE_WIDTH;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
        }
        return () => {
            cancelled = true;
        };
    }, [open, userEmail]);

    const persistLibrary = useCallback(
        async (next, nextDefaultId = defaultSigId) => {
            setLibrary(next);
            saveSignatureLibrary(userEmail, next);
            try {
                await saveUserSignatureLibrary(userEmail, {
                    defaultSignatureId: nextDefaultId,
                    signatures: next,
                });
                if (nextDefaultId) saveDefaultSignatureId(userEmail, nextDefaultId);
                setLibrarySaveError('');
            } catch (e) {
                console.error('[SignatureVault] server save failed', e);
                setLibrarySaveError(e.message || 'Failed to save to server');
            }
        },
        [userEmail, defaultSigId]
    );

    const getCtx = () => {
        const c = canvasRef.current;
        if (!c) return null;
        const ctx = c.getContext('2d', { alpha: true });
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = DRAW_PAD_LINE_WIDTH;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        return ctx;
    };

    const pos = (e) => {
        const c = canvasRef.current;
        const r = c.getBoundingClientRect();
        const scaleX = c.width / r.width;
        const scaleY = c.height / r.height;
        return {
            x: (e.clientX - r.left) * scaleX,
            y: (e.clientY - r.top) * scaleY,
        };
    };

    const clearCanvas = () => {
        const c = canvasRef.current;
        if (!c) return;
        const ctx = c.getContext('2d', { alpha: true });
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    };

    const saveCanvasToLibrary = async () => {
        const c = canvasRef.current;
        if (!c) return;
        const finalCanvas = prepareDrawPadSignatureForQuote(c) || trimCanvasToContent(c, TRIM_PADDING_PX);
        const dataUrl = (finalCanvas || c).toDataURL('image/png');
        if (!dataUrl || dataUrl.length < 200) return;
        const id = globalThis.crypto?.randomUUID?.() || `sig-${Date.now()}`;
        const label = (newLabel || `Signature ${library.length + 1}`).trim();
        void persistLibrary([
            ...library,
            {
                id,
                label,
                imageDataUrl: dataUrl,
                createdAt: new Date().toISOString(),
                showNameOnStamp: true,
                showDateTimeOnStamp: true,
            },
        ]);
        setNewLabel('');
        clearCanvas();
    };

    const onFile = (e) => {
        const f = e.target.files?.[0];
        if (!f || !f.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = async () => {
                const c = document.createElement('canvas');
                c.width = CANVAS_W;
                c.height = CANVAS_H;
                const ctx = c.getContext('2d', { alpha: true });
                ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
                const scale = Math.min(CANVAS_W / img.width, CANVAS_H / img.height, 1);
                const w = img.width * scale;
                const h = img.height * scale;
                const x = (CANVAS_W - w) / 2;
                const y = (CANVAS_H - h) / 2;
                ctx.drawImage(img, x, y, w, h);
                const trimmedCanvas = trimCanvasToContent(c, TRIM_PADDING_PX);
                const tightCanvas = trimmedCanvas
                    ? trimCanvasToContent(trimmedCanvas, STAMP_DISPLAY_TRIM_PADDING_PX) || trimmedCanvas
                    : null;
                const dataUrl = (tightCanvas || trimmedCanvas || c).toDataURL('image/png');
                const id = globalThis.crypto?.randomUUID?.() || `sig-${Date.now()}`;
                const label = (newLabel || f.name.replace(/\.[^.]+$/, '') || 'Uploaded').trim();
                void persistLibrary([
                    ...library,
                    {
                        id,
                        label,
                        imageDataUrl: dataUrl,
                        createdAt: new Date().toISOString(),
                        showNameOnStamp: true,
                        showDateTimeOnStamp: true,
                    },
                ]);
                setNewLabel('');
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(f);
        e.target.value = '';
    };

    const updateLibraryItem = (id, patch) => {
        const next = library.map((x) => (x.id === id ? { ...x, ...patch } : x));
        void persistLibrary(next);
    };

    const removeFromLibrary = (id) => {
        const next = library.filter((x) => x.id !== id);
        const cur = defaultSigId || loadDefaultSignatureId(userEmail);
        const nextDef = cur === id ? next[0]?.id || null : cur;
        setDefaultSigId(nextDef);
        if (cur === id) saveDefaultSignatureId(userEmail, nextDef);
        void persistLibrary(next, nextDef);
    };

    if (!open) return null;

    const pages = Math.max(1, totalSheets | 0);

    /** Portal to body so `position:fixed` is viewport-centered (avoids transformed ancestors e.g. header profile scale). */
    const portalTarget = typeof document !== 'undefined' ? document.body : null;
    if (!portalTarget) return null;

    return createPortal(
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(15,23,42,0.45)',
                zIndex: 100500,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px',
                boxSizing: 'border-box',
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sig-vault-title"
        >
            <div
                style={{
                    background: '#fff',
                    borderRadius: '12px',
                    maxWidth: 'min(96vw, 1520px)',
                    width: '100%',
                    maxHeight: '92vh',
                    overflow: 'auto',
                    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                    border: '1px solid #e2e8f0',
                    margin: 'auto',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #e2e8f0' }}>
                    <h2 id="sig-vault-title" style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <PenLine size={20} /> Digital signatures
                    </h2>
                    <button type="button" onClick={onClose} style={{ border: 'none', background: '#f1f5f9', borderRadius: '8px', padding: '6px', cursor: 'pointer' }} aria-label="Close">
                        <X size={18} />
                    </button>
                </div>

                <div style={{ padding: '16px', fontSize: '13px', color: '#64748b', lineHeight: 1.5 }}>
                    {libraryLoading ? (
                        <div style={{ marginBottom: '8px', color: '#0369a1' }}>Loading your signatures from server…</div>
                    ) : null}
                    {librarySaveError ? (
                        <div style={{ marginBottom: '8px', color: '#b91c1c', fontWeight: 600 }}>{librarySaveError}</div>
                    ) : null}
                    {placementEnabled ? (
                        <>
                            Draw or upload, then <strong>Save to library</strong>. In <strong>Your library</strong> below: pick the <strong>Page</strong>, then{' '}
                            <strong>Place on page</strong> — the stamp appears on the quote preview. <strong>Drag anywhere on the stamp</strong> (not ×) to
                            move it. You can also <strong>Place on page</strong> from your profile menu (Quote tab) without opening this window.
                        </>
                    ) : (
                        <>
                            Draw or upload, then <strong>Save to library</strong>. Use <strong>Set as default</strong> on a row so it is pre-selected in your
                            profile menu. On the <strong>Quote</strong> tab, open your profile — pick signature, page, and <strong>Place on page</strong> there, or use the{' '}
                            <strong>pen</strong> icon next to Print on the quote screen.
                        </>
                    )}
                </div>

                <div style={{ padding: '0 16px 16px' }}>
                    <div style={{ marginBottom: '8px', fontWeight: '600', color: '#334155' }}>Draw</div>
                    <canvas
                        ref={canvasRef}
                        width={CANVAS_W}
                        height={CANVAS_H}
                        style={{
                            width: '100%',
                            maxWidth: '100%',
                            height: 'auto',
                            border: '1px solid #cbd5e1',
                            borderRadius: '8px',
                            touchAction: 'none',
                            cursor: 'crosshair',
                            display: 'block',
                            backgroundColor: '#f1f5f9',
                        }}
                        onPointerDown={(e) => {
                            e.currentTarget.setPointerCapture(e.pointerId);
                            drawing.current = true;
                            const ctx = getCtx();
                            if (!ctx) return;
                            const p = pos(e);
                            ctx.beginPath();
                            ctx.moveTo(p.x, p.y);
                        }}
                        onPointerMove={(e) => {
                            if (!drawing.current) return;
                            const ctx = getCtx();
                            if (!ctx) return;
                            const p = pos(e);
                            ctx.lineTo(p.x, p.y);
                            ctx.stroke();
                        }}
                        onPointerUp={(e) => {
                            drawing.current = false;
                            try {
                                e.currentTarget.releasePointerCapture(e.pointerId);
                            } catch {
                                /* ignore */
                            }
                        }}
                        onPointerLeave={() => {
                            drawing.current = false;
                        }}
                    />
                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <input
                            type="text"
                            value={newLabel}
                            onChange={(e) => setNewLabel(e.target.value)}
                            placeholder="Label (optional)"
                            style={{ flex: '1 1 140px', minWidth: '120px', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                        />
                        <button type="button" onClick={clearCanvas} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: '13px' }}>
                            Clear pad
                        </button>
                        <button type="button" onClick={saveCanvasToLibrary} style={{ padding: '8px 12px', borderRadius: '6px', border: 'none', background: '#1e293b', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                            Save to library
                        </button>
                    </div>

                    <div style={{ marginTop: '20px', marginBottom: '8px', fontWeight: '600', color: '#334155', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Upload size={16} /> Upload image
                    </div>
                    <button type="button" onClick={() => fileRef.current?.click()} style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', fontSize: '13px' }}>
                        Choose file…
                    </button>
                    <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={onFile} />

                    <div style={{ marginTop: '22px', marginBottom: '8px', fontWeight: '600', color: '#334155' }}>Your library</div>
                    {library.length === 0 ? (
                        <div style={{ color: '#94a3b8', fontSize: '13px', padding: '12px', background: '#f8fafc', borderRadius: '8px' }}>No signatures yet.</div>
                    ) : (
                        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {library.map((item) => (
                                <li
                                    key={item.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px',
                                        padding: '10px',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '8px',
                                        background: '#fafafa',
                                    }}
                                >
                                    <img src={item.imageDataUrl} alt="" style={{ width: '96px', height: '40px', objectFit: 'contain', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '4px' }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: '600', color: '#0f172a', fontSize: '13px' }}>{item.label}</div>
                                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>{item.createdAt?.slice(0, 10)}</div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '6px' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#475569', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={item.showNameOnStamp !== false}
                                                    onChange={(ev) =>
                                                        updateLibraryItem(item.id, { showNameOnStamp: ev.target.checked })
                                                    }
                                                />
                                                Show name
                                            </label>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#475569', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={item.showDateTimeOnStamp !== false}
                                                    onChange={(ev) =>
                                                        updateLibraryItem(item.id, { showDateTimeOnStamp: ev.target.checked })
                                                    }
                                                />
                                                Show date &amp; time
                                            </label>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'stretch' }}>
                                        {placementEnabled && typeof onPlaceStamp === 'function' ? (
                                            <>
                                                <label style={{ fontSize: '11px', color: '#64748b' }}>
                                                    Page
                                                    <select
                                                        value={pageIndex}
                                                        onChange={(e) => setPageIndex(Number(e.target.value))}
                                                        style={{ marginLeft: '6px', padding: '4px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                                                    >
                                                        {Array.from({ length: pages }, (_, i) => (
                                                            <option key={i} value={i}>
                                                                {i + 1}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const prefs = resolveSignatureStampPrefs(item);
                                                        onPlaceStamp({
                                                            imageDataUrl: item.imageDataUrl,
                                                            /** QuoteForm stamp filter uses 1-based page index. */
                                                            sheetIndex: pageIndex + 1,
                                                            displayName: displayName ?? '',
                                                            designation: designation ?? '',
                                                            showNameOnStamp: prefs.showNameOnStamp,
                                                            showDateTimeOnStamp: prefs.showDateTimeOnStamp,
                                                        });
                                                        onClose();
                                                    }}
                                                    style={{ padding: '6px 10px', fontSize: '12px', fontWeight: '600', border: 'none', borderRadius: '6px', background: '#0284c7', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}
                                                >
                                                    Place on page
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setDefaultSigId(item.id);
                                                        saveDefaultSignatureId(userEmail, item.id);
                                                        void persistLibrary(library, item.id);
                                                    }}
                                                    style={{
                                                        padding: '6px 10px',
                                                        fontSize: '12px',
                                                        fontWeight: '600',
                                                        border: defaultSigId === item.id ? '2px solid #0284c7' : '1px solid #cbd5e1',
                                                        borderRadius: '6px',
                                                        background: defaultSigId === item.id ? '#e0f2fe' : '#fff',
                                                        color: '#0f172a',
                                                        cursor: 'pointer',
                                                        whiteSpace: 'nowrap',
                                                    }}
                                                >
                                                    {defaultSigId === item.id ? 'Default ✓' : 'Set as default'}
                                                </button>
                                                {defaultSigId === item.id ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setDefaultSigId(null);
                                                            saveDefaultSignatureId(userEmail, null);
                                                            void persistLibrary(library, null);
                                                        }}
                                                        style={{ padding: '4px 8px', fontSize: '11px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#f8fafc', cursor: 'pointer' }}
                                                    >
                                                        Clear default
                                                    </button>
                                                ) : null}
                                            </>
                                        )}
                                        <button type="button" onClick={() => removeFromLibrary(item.id)} style={{ padding: '4px', border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Remove from library">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>,
        portalTarget
    );
}

function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
}

/** Shown on quote at 60% of cropped natural size (40% smaller than ink bounds). */
export const QUOTE_SIGNATURE_DISPLAY_SCALE = 0.6;
const QUOTE_SIGNATURE_NATURAL_MAX_WIDTH_PX = 172;
const QUOTE_SIGNATURE_NATURAL_MAX_HEIGHT_PX = 94;
/** Signature image max display width — anchor is the horizontal center of this image. */
export const QUOTE_SIGNATURE_IMAGE_WIDTH_PX = Math.round(
    QUOTE_SIGNATURE_NATURAL_MAX_WIDTH_PX * QUOTE_SIGNATURE_DISPLAY_SCALE
);
export const QUOTE_SIGNATURE_IMAGE_MAX_HEIGHT_PX = Math.round(
    QUOTE_SIGNATURE_NATURAL_MAX_HEIGHT_PX * QUOTE_SIGNATURE_DISPLAY_SCALE
);
const SIG_IMG_HALF = QUOTE_SIGNATURE_IMAGE_WIDTH_PX / 2;
const SIG_IMG_HALF_H = QUOTE_SIGNATURE_IMAGE_MAX_HEIGHT_PX / 2;

function computeQuoteSignatureDisplaySize(naturalWidth, naturalHeight) {
    const nw = Number(naturalWidth);
    const nh = Number(naturalHeight);
    if (!nw || !nh) return null;
    let w = nw * QUOTE_SIGNATURE_DISPLAY_SCALE;
    let h = nh * QUOTE_SIGNATURE_DISPLAY_SCALE;
    const maxW = QUOTE_SIGNATURE_IMAGE_WIDTH_PX;
    const maxH = QUOTE_SIGNATURE_IMAGE_MAX_HEIGHT_PX;
    if (w > maxW) {
        h = (h * maxW) / w;
        w = maxW;
    }
    if (h > maxH) {
        w = (w * maxH) / h;
        h = maxH;
    }
    return {
        w: Math.max(1, Math.round(w)),
        h: Math.max(1, Math.round(h)),
    };
}

/**
 * Click/drop point = center of signature image (not caption).
 * Same offsets for placed stamps (calc) and placement cursor (transform) — preview must match PDF.
 */
export const QUOTE_SIGNATURE_ANCHOR_OFFSET_X_PX = SIG_IMG_HALF;
export const QUOTE_SIGNATURE_ANCHOR_OFFSET_Y_PX = SIG_IMG_HALF_H;

function stampAnchorStyle(xPct, yPct, offsetX = QUOTE_SIGNATURE_ANCHOR_OFFSET_X_PX, offsetY = QUOTE_SIGNATURE_ANCHOR_OFFSET_Y_PX) {
    return {
        left: `calc(${xPct}% - ${offsetX}px)`,
        top: `calc(${yPct}% - ${offsetY}px)`,
    };
}

/** Follow-cursor placement preview only (not captured in PDF). Must match stampAnchorStyle offsets. */
const STAMP_PLACEMENT_CURSOR_TRANSFORM = `translate(${-QUOTE_SIGNATURE_ANCHOR_OFFSET_X_PX}px, -${QUOTE_SIGNATURE_ANCHOR_OFFSET_Y_PX}px)`;

function QuoteSignatureStampContent({
    imageDataUrl,
    displayName,
    placedStr,
    preview,
    showNameOnStamp = true,
    showDateTimeOnStamp = true,
    onImageLoad,
}) {
    const croppedImageUrl = useCroppedSignatureImage(imageDataUrl);
    const [displaySize, setDisplaySize] = useState(null);
    const nameText = showNameOnStamp ? displayName : '';
    const dateText = showDateTimeOnStamp ? placedStr : '';
    const hasCaption = Boolean(nameText || dateText);

    useEffect(() => {
        setDisplaySize(null);
    }, [croppedImageUrl]);

    const handleImageLoad = (e) => {
        const img = e.currentTarget;
        const size = computeQuoteSignatureDisplaySize(img.naturalWidth, img.naturalHeight);
        if (size) setDisplaySize(size);
        onImageLoad?.(e);
    };

    return (
        <div
            className="quote-signature-stamp-body"
            style={{
                display: 'inline-flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: hasCaption ? '3px' : 0,
                opacity: preview ? 0.92 : 1,
                filter: preview ? 'drop-shadow(0 2px 6px rgba(15,23,42,0.15))' : undefined,
            }}
        >
            <img
                src={croppedImageUrl}
                alt=""
                onLoad={handleImageLoad}
                style={{
                    width: displaySize ? `${displaySize.w}px` : 'auto',
                    height: displaySize ? `${displaySize.h}px` : 'auto',
                    maxWidth: `${QUOTE_SIGNATURE_IMAGE_WIDTH_PX}px`,
                    maxHeight: `${QUOTE_SIGNATURE_IMAGE_MAX_HEIGHT_PX}px`,
                    objectFit: 'contain',
                    objectPosition: 'left center',
                    display: 'block',
                    flexShrink: 0,
                    verticalAlign: 'middle',
                    pointerEvents: 'none',
                    backgroundColor: 'transparent',
                    mixBlendMode: 'multiply',
                }}
            />
            {hasCaption ? (
                <div
                    className="quote-signature-stamp-caption"
                    style={{
                        flexShrink: 0,
                        lineHeight: 1.2,
                        textAlign: 'left',
                        boxSizing: 'border-box',
                        maxWidth: '180px',
                        paddingLeft: 0,
                    }}
                >
                    {nameText ? (
                        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '9px' }}>{nameText}</div>
                    ) : null}
                    {dateText ? (
                        <div
                            style={{
                                fontSize: '8px',
                                color: '#64748b',
                                marginTop: nameText ? '2px' : 0,
                            }}
                        >
                            {dateText}
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

/** True when the logged-in user's email is listed on any enquiry division CCMailIds. */
export function isUserQuoteCcMailSigner(userEmail, divisionEmails) {
    const e = String(userEmail || '')
        .trim()
        .toLowerCase()
        .replace(/@almcg\.com/g, '@almoayyedcg.com');
    if (!e) return false;
    for (const div of divisionEmails || []) {
        const cc = String(div.ccMailIds || div.CCMailIds || '')
            .toLowerCase()
            .replace(/@almcg\.com/g, '@almoayyedcg.com')
            .split(/[,;]/)
            .map((m) => m.trim())
            .filter(Boolean);
        if (cc.includes(e)) return true;
    }
    return false;
}

/**
 * Follow-cursor placement: click the signature toolbar, move over the quote preview, click once to fix.
 * Escape cancels. Ignores clicks outside `.quote-a4-sheet` inside `#quote-preview`.
 */
export function QuoteSignaturePlacementOverlay({
    active,
    imageDataUrl,
    displayName = '',
    showNameOnStamp = true,
    showDateTimeOnStamp = true,
    onCancel,
    onPlaceAt,
}) {
    const [cursor, setCursor] = useState({ x: 0, y: 0 });

    useEffect(() => {
        if (!active) return undefined;

        const onMove = (e) => setCursor({ x: e.clientX, y: e.clientY });

        const onKey = (e) => {
            if (e.key === 'Escape') onCancel();
        };

        const onClickCapture = (e) => {
            if (e.target.closest('.no-print button, .no-print [role="button"], .signature-placement-ignore')) {
                return;
            }
            const sheet = e.target.closest?.('.quote-a4-sheet');
            const preview = document.getElementById('quote-preview');
            if (!sheet || !preview || !preview.contains(sheet)) return;

            e.preventDefault();
            e.stopPropagation();

            const rect = sheet.getBoundingClientRect();
            if (!rect.width || !rect.height) return;

            const xPct = clamp(((e.clientX - rect.left) / rect.width) * 100, 2, 96);
            const yPct = clamp(((e.clientY - rect.top) / rect.height) * 100, 2, 92);
            const sheets = [...preview.querySelectorAll('.quote-a4-sheet')];
            const sheetIndex0 = Math.max(0, sheets.indexOf(sheet));
            onPlaceAt({ sheetIndex: sheetIndex0 + 1, xPct, yPct });
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('keydown', onKey);
        document.addEventListener('click', onClickCapture, true);
        document.body.style.cursor = 'crosshair';

        return () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('click', onClickCapture, true);
            document.body.style.cursor = '';
        };
    }, [active, onCancel, onPlaceAt]);

    if (!active || !imageDataUrl) return null;

    const portalTarget = typeof document !== 'undefined' ? document.body : null;
    if (!portalTarget) return null;

    return createPortal(
        <>
            <div
                className="no-print signature-placement-ignore"
                aria-hidden
                style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 100400,
                    pointerEvents: 'none',
                }}
            />
            <div
                className="no-print signature-placement-ignore"
                style={{
                    position: 'fixed',
                    left: cursor.x,
                    top: cursor.y,
                    transform: STAMP_PLACEMENT_CURSOR_TRANSFORM,
                    pointerEvents: 'none',
                    zIndex: 100401,
                    maxWidth: 'min(430px, 60vw)',
                }}
            >
                <QuoteSignatureStampContent
                    imageDataUrl={imageDataUrl}
                    displayName={displayName}
                    placedStr={formatSignaturePlacedDateTime(new Date().toISOString())}
                    showNameOnStamp={showNameOnStamp}
                    showDateTimeOnStamp={showDateTimeOnStamp}
                    preview
                />
            </div>
            <div
                className="no-print signature-placement-ignore"
                style={{
                    position: 'fixed',
                    left: 12,
                    bottom: 12,
                    zIndex: 100402,
                    background: '#0f172a',
                    color: '#f8fafc',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 600,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                }}
            >
                Click on the quote to place your signature · Esc to cancel
            </div>
        </>,
        portalTarget
    );
}

/**
 * Stamp overlay on the quote sheet. Locked stamps (removableBeforeNextCommit !== true) cannot move or be removed.
 */
export function QuoteSignatureStamp({ stamp, onRemove, onMove, allowRemove = false, allowMove = false }) {
    const rootRef = useRef(null);
    const drag = useRef(null);
    const [anchorOffset, setAnchorOffset] = useState({
        x: QUOTE_SIGNATURE_ANCHOR_OFFSET_X_PX,
        y: QUOTE_SIGNATURE_ANCHOR_OFFSET_Y_PX,
    });

    const onStampImageLoad = useCallback((e) => {
        const img = e.currentTarget;
        const w = img.offsetWidth || QUOTE_SIGNATURE_IMAGE_WIDTH_PX;
        const h = img.offsetHeight || QUOTE_SIGNATURE_IMAGE_MAX_HEIGHT_PX;
        setAnchorOffset({ x: w / 2, y: h / 2 });
    }, []);

    const onPointerDown = (e) => {
        if (!allowMove) return;
        if (e.target.closest('button')) return;
        e.preventDefault();
        e.stopPropagation();
        const el = rootRef.current;
        const sheet = el?.closest('.quote-a4-sheet');
        if (!el || !sheet) return;
        const rect = sheet.getBoundingClientRect();
        drag.current = {
            startX: e.clientX,
            startY: e.clientY,
            startXPct: stamp.xPct,
            startYPct: stamp.yPct,
            rectW: rect.width || 1,
            rectH: rect.height || 1,
        };
    };

    useEffect(() => {
        if (!allowMove) return undefined;
        const onPointerMove = (e) => {
            const d = drag.current;
            if (!d) return;
            const dxp = ((e.clientX - d.startX) / d.rectW) * 100;
            const dyp = ((e.clientY - d.startY) / d.rectH) * 100;
            const xPct = clamp(d.startXPct + dxp, 4, 96);
            const yPct = clamp(d.startYPct + dyp, 4, 96);
            onMove(stamp.id, xPct, yPct);
        };
        const onPointerUp = () => {
            drag.current = null;
        };
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        return () => {
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);
        };
    }, [stamp.id, onMove, allowMove]);

    const placedStr =
        stamp.showDateTimeOnStamp !== false && stamp.placedAtIso
            ? formatSignaturePlacedDateTime(stamp.placedAtIso)
            : '';

    return (
        <div
            ref={rootRef}
            className="quote-digital-signature-stamp"
            onPointerDown={onPointerDown}
            style={{
                position: 'absolute',
                ...stampAnchorStyle(stamp.xPct, stamp.yPct, anchorOffset.x, anchorOffset.y),
                zIndex: 25,
                maxWidth: 'min(430px, 60vw)',
                padding: 0,
                background: 'transparent',
                border: 'none',
                boxShadow: 'none',
                outline: 'none',
                boxSizing: 'border-box',
                cursor: allowMove ? 'grab' : 'default',
                userSelect: 'none',
                touchAction: allowMove ? 'none' : 'auto',
            }}
            title={allowMove ? 'Drag to move on this page' : 'Signature placement is fixed'}
        >
            {allowMove || allowRemove ? (
                <div
                    className="no-print"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: allowRemove ? 'space-between' : 'flex-start',
                        marginBottom: '4px',
                        gap: '6px',
                    }}
                >
                    {allowMove ? (
                        <span style={{ fontSize: '8px', color: '#94a3b8', fontWeight: '500' }}>
                            <GripHorizontal size={11} style={{ verticalAlign: 'middle', marginRight: '2px' }} />
                            Drag
                        </span>
                    ) : (
                        <span />
                    )}
                    {allowRemove ? (
                        <button
                            type="button"
                            className="no-print"
                            aria-label="Remove signature from quote"
                            title="Remove this signature before it is fixed on the page"
                            onClick={(e) => {
                                e.stopPropagation();
                                onRemove(stamp.id);
                            }}
                            style={{
                                border: '1px solid #fecaca',
                                background: '#fef2f2',
                                color: '#b91c1c',
                                borderRadius: '6px',
                                padding: '2px 6px',
                                minWidth: '28px',
                                minHeight: '24px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                lineHeight: 1,
                            }}
                        >
                            <X size={14} strokeWidth={2.5} aria-hidden />
                        </button>
                    ) : null}
                </div>
            ) : null}
            <QuoteSignatureStampContent
                imageDataUrl={stamp.imageDataUrl}
                displayName={stamp.showNameOnStamp !== false ? stamp.displayName : ''}
                placedStr={placedStr}
                showNameOnStamp={stamp.showNameOnStamp !== false}
                showDateTimeOnStamp={stamp.showDateTimeOnStamp !== false}
                onImageLoad={onStampImageLoad}
            />
        </div>
    );
}
