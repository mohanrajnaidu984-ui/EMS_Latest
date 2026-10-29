import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
    extractFlowPlainText,
    normalizeQuoteFlowText,
} from './quotePagedDocument.js';

/**
 * Debounced Paged.js preview iframe.
 * Uses a blob: URL (not srcdoc) so Paged.js can resolve font/CSS urls — about:srcdoc
 * makes `new URL(href, documentURL)` throw Invalid URL.
 */
export default function QuotePagedPreview({
    html,
    scale = 1,
    onIntegrityChange,
    onPageCountChange,
    updatingLabel = 'Updating…',
}) {
    const iframeRef = useRef(null);
    const genRef = useRef(0);
    const blobUrlRef = useRef('');
    const lastGoodHtmlRef = useRef('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [iframeSrc, setIframeSrc] = useState('');

    const revokeBlob = useCallback(() => {
        if (blobUrlRef.current) {
            try {
                URL.revokeObjectURL(blobUrlRef.current);
            } catch {
                /* ignore */
            }
            blobUrlRef.current = '';
        }
    }, []);

    const runIntegrity = useCallback(
        (doc, sourceText, unitIds) => {
            try {
                const pages = [...doc.querySelectorAll('.pagedjs_page')];
                const pageText = normalizeQuoteFlowText(
                    pages.map((p) => p.innerText || p.textContent || '').join(' ')
                );
                const source = normalizeQuoteFlowText(sourceText);
                const missing = [];
                const units = Array.isArray(unitIds) ? unitIds : [];
                units.forEach((id) => {
                    const n = doc.querySelectorAll(`[data-ems-unit-id="${id}"]`).length;
                    if (n < 1) missing.push(`${id}×0`);
                });
                const sourceCore = source.replace(/\s+/g, ' ');
                const pageCore = pageText.replace(/\s+/g, ' ');
                const leakedCss = /\.xl\d+\s*\{/i.test(pageCore);
                let ok = !leakedCss && pages.length > 0 && missing.length === 0;
                if (ok && sourceCore.length > 80) {
                    const head = sourceCore.slice(0, Math.min(60, sourceCore.length)).trim();
                    if (head && !pageCore.includes(head.slice(0, 40))) {
                        ok = false;
                        missing.push('source-head-mismatch');
                    }
                }
                if (leakedCss) missing.push('leaked-css');
                const result = {
                    ok,
                    pageCount: pages.length,
                    missing,
                    leakedCss,
                    fonts: doc.fonts
                        ? `${[...doc.fonts].filter((f) => f.status === 'loaded').length} loaded`
                        : 'n/a',
                };
                onIntegrityChange?.(result);
                onPageCountChange?.(pages.length);
                return result;
            } catch (e) {
                const result = {
                    ok: false,
                    pageCount: 0,
                    missing: [String(e?.message || e)],
                    leakedCss: false,
                };
                onIntegrityChange?.(result);
                return result;
            }
        },
        [onIntegrityChange, onPageCountChange]
    );

    useEffect(() => {
        const next = String(html || '');
        if (!next) return undefined;
        const gen = ++genRef.current;
        setBusy(true);
        setError('');
        const t = setTimeout(() => {
            if (gen !== genRef.current) return;
            revokeBlob();
            const blob = new Blob([next], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            blobUrlRef.current = url;
            setIframeSrc(url);
        }, 500);
        return () => clearTimeout(t);
    }, [html, revokeBlob]);

    useEffect(() => () => revokeBlob(), [revokeBlob]);

    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe || !iframeSrc) return undefined;
        const gen = genRef.current;
        let cancelled = false;
        let pollTimer = null;

        const onLoad = () => {
            const doc = iframe.contentDocument;
            const win = iframe.contentWindow;
            if (!doc || cancelled || gen !== genRef.current) return;

            const sourceText =
                win.__EMS_SOURCE_TEXT__ ||
                extractFlowPlainText(
                    doc.getElementById('ems-quote-flow')?.innerHTML ||
                        doc.querySelector('.ems-quote-flow')?.innerHTML ||
                        ''
                );
            const unitIds = win.__EMS_UNIT_IDS__ || [];

            const finish = () => {
                if (cancelled || gen !== genRef.current) return;
                try {
                    if (doc.fonts?.ready) {
                        doc.fonts.ready
                            .then(() => {
                                console.info(
                                    '[EMS paged preview] fonts',
                                    [...(doc.fonts || [])]
                                        .map((f) => `${f.family}:${f.status}`)
                                        .slice(0, 12)
                                );
                            })
                            .catch(() => {});
                    }
                } catch {
                    /* ignore */
                }
                const integ = runIntegrity(doc, sourceText, unitIds);
                if (integ.ok) {
                    lastGoodHtmlRef.current = String(html || '');
                    setError('');
                } else {
                    setError(
                        `Pagination integrity failed${
                            integ.missing?.length ? `: ${integ.missing.slice(0, 4).join(', ')}` : ''
                        }`
                    );
                }
                setBusy(false);
            };

            let tries = 0;
            const poll = () => {
                if (cancelled || gen !== genRef.current) return;
                const ready = doc.documentElement?.getAttribute('data-ems-paged-ready');
                const pages = doc.querySelectorAll('.pagedjs_page').length;
                if (ready === '1' || pages > 0) {
                    setTimeout(finish, 120);
                    return;
                }
                if (ready === '0') {
                    setError('Paged.js failed to paginate');
                    setBusy(false);
                    onIntegrityChange?.({ ok: false, pageCount: 0, missing: ['paged-failed'] });
                    return;
                }
                tries += 1;
                if (tries > 100) {
                    setError('Paged.js timed out');
                    setBusy(false);
                    onIntegrityChange?.({ ok: false, pageCount: 0, missing: ['timeout'] });
                    return;
                }
                pollTimer = setTimeout(poll, 100);
            };
            poll();
        };

        iframe.addEventListener('load', onLoad);
        return () => {
            cancelled = true;
            iframe.removeEventListener('load', onLoad);
            if (pollTimer) clearTimeout(pollTimer);
        };
    }, [iframeSrc, html, runIntegrity, onIntegrityChange]);

    return (
        <div className="ems-paged-preview-host" style={{ position: 'relative', width: '100%' }}>
            {busy ? (
                <div
                    className="ems-paged-preview-updating"
                    style={{
                        position: 'absolute',
                        top: 8,
                        right: 12,
                        zIndex: 2,
                        fontSize: 12,
                        color: '#64748b',
                        background: 'rgba(255,255,255,0.9)',
                        padding: '2px 8px',
                        borderRadius: 4,
                        pointerEvents: 'none',
                    }}
                >
                    {updatingLabel}
                </div>
            ) : null}
            {error ? (
                <div
                    role="alert"
                    style={{
                        margin: '8px 12px',
                        padding: '8px 12px',
                        background: '#fef2f2',
                        color: '#991b1b',
                        border: '1px solid #fecaca',
                        borderRadius: 6,
                        fontSize: 13,
                    }}
                >
                    {error}. PDF download is disabled until this is fixed.
                </div>
            ) : null}
            <div
                style={{
                    transform: scale !== 1 ? `scale(${scale})` : undefined,
                    transformOrigin: 'top center',
                    width: scale !== 1 ? `${100 / scale}%` : '100%',
                }}
            >
                <iframe
                    ref={iframeRef}
                    title="Quote paged preview"
                    src={iframeSrc || undefined}
                    /* No sandbox: blob + same-origin scripts/fonts; sandbox+srcdoc caused Paged URL failures. */
                    style={{
                        width: '210mm',
                        minHeight: '297mm',
                        height: '85vh',
                        border: 'none',
                        display: 'block',
                        margin: '0 auto',
                        background: '#e2e8f0',
                    }}
                />
            </div>
        </div>
    );
}
