import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { computeWordFlowExtraPageCount } from './quoteClauseWordFlowLayout';

/**
 * White page frame with a transparent content window (Word-style).
 * Four solid panels hide the ribbon outside the editable window on each page.
 * Header (logo) and footer bands are unchanged — only the middle content window is clipped.
 */
export function QuoteClauseWordFlowPageFrame({
    windowTopPx,
    windowHeightPx,
    includeTopPanel = true,
}) {
    const top = Math.max(0, Math.round(Number(windowTopPx) || 0));
    const height = Math.max(1, Math.round(Number(windowHeightPx) || 1));
    const bottomTop = top + height;
    return (
        <div className="quote-clause-word-flow-page-frame" aria-hidden="true">
            {includeTopPanel ? (
                <div
                    className="quote-clause-word-flow-page-frame__top"
                    style={{ height: `${top}px` }}
                />
            ) : null}
            <div
                className="quote-clause-word-flow-page-frame__bottom"
                style={{ top: `${bottomTop}px` }}
            />
            <div
                className="quote-clause-word-flow-page-frame__side quote-clause-word-flow-page-frame__side--left"
                style={{ top: `${top}px`, height: `${height}px` }}
            />
            <div
                className="quote-clause-word-flow-page-frame__side quote-clause-word-flow-page-frame__side--right"
                style={{ top: `${top}px`, height: `${height}px` }}
            />
            <div
                className="quote-clause-word-flow-page-frame__page-end"
                style={{ top: `${bottomTop - 1}px` }}
            />
        </div>
    );
}

/** @deprecated alias */
export const QuoteClauseWordFlowPageHole = QuoteClauseWordFlowPageFrame;

/**
 * Word-like clause edit: one continuous editor ribbon behind stacked fixed-height A4 frames.
 * Each page stays 297mm white; overflow flows onto extra pages (no inner scroll box).
 */
export default function QuoteClauseWordFlowEditor({
    wrapRef,
    flowStartRef,
    ribbonRef: ribbonRefProp,
    layoutSyncRef,
    firstPageUsablePx,
    contPageUsablePx,
    contPageWindowTopPx,
    onExtraPageCountChange,
    headingPanel,
    editor,
    quoteLogoDisplaySrc,
    renderFooter,
    baseSheetIndex,
}) {
    const localRibbonRef = useRef(null);
    const ribbonRef = ribbonRefProp || localRibbonRef;
    const [ribbonTopPx, setRibbonTopPx] = useState(0);
    const [extraPageCount, setExtraPageCount] = useState(0);

    const syncLayout = useCallback(() => {
        const wrap = wrapRef?.current;
        const flowStart = flowStartRef?.current;
        const ribbon = ribbonRef?.current;
        if (!wrap || !flowStart || !ribbon) return;

        const wrapTop = wrap.getBoundingClientRect().top;
        const startTop = flowStart.getBoundingClientRect().top;
        const nextTop = Math.max(0, Math.round(startTop - wrapTop));
        setRibbonTopPx((prev) => (prev === nextTop ? prev : nextTop));

        const ribbonH = Math.ceil(ribbon.getBoundingClientRect().height);
        const first = Math.max(1, Number(firstPageUsablePx) || 1);
        const cont = Math.max(1, Number(contPageUsablePx) || 1);
        const nextExtra = computeWordFlowExtraPageCount(ribbonH, first, cont);
        setExtraPageCount((prev) => (prev === nextExtra ? prev : nextExtra));
        onExtraPageCountChange?.(nextExtra);
    }, [
        wrapRef,
        flowStartRef,
        ribbonRef,
        firstPageUsablePx,
        contPageUsablePx,
        onExtraPageCountChange,
    ]);

    useLayoutEffect(() => {
        if (layoutSyncRef) {
            layoutSyncRef.current = syncLayout;
            return () => {
                if (layoutSyncRef.current === syncLayout) {
                    layoutSyncRef.current = null;
                }
            };
        }
        return undefined;
    }, [layoutSyncRef, syncLayout]);

    useLayoutEffect(() => {
        syncLayout();
        let raf2 = 0;
        const raf1 = requestAnimationFrame(() => {
            syncLayout();
            raf2 = requestAnimationFrame(syncLayout);
        });
        const ro =
            typeof ResizeObserver !== 'undefined'
                ? new ResizeObserver(() => syncLayout())
                : null;
        const ribbon = ribbonRef?.current;
        const wrap = wrapRef?.current;
        const wys = ribbon?.querySelector?.('.jodit-wysiwyg') || null;
        if (ro && ribbon) ro.observe(ribbon);
        if (ro && wrap) ro.observe(wrap);
        if (ro && wys) ro.observe(wys);
        window.addEventListener('resize', syncLayout);
        return () => {
            cancelAnimationFrame(raf1);
            cancelAnimationFrame(raf2);
            ro?.disconnect();
            window.removeEventListener('resize', syncLayout);
        };
    }, [syncLayout, ribbonRef, wrapRef, editor, firstPageUsablePx, contPageUsablePx]);

    const contWindowPx = Math.max(120, Math.floor(contPageUsablePx || 0));
    const contWindowTopPx = Math.max(0, Math.round(Number(contPageWindowTopPx) || 0));

    return (
        <>
            <div
                ref={ribbonRef}
                className="quote-clause-word-flow-ribbon"
                style={{ top: `${ribbonTopPx}px` }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
            >
                {headingPanel}
                <div className="quote-clause-inline-editor quote-clause-inline-editor--word-flow">
                    {editor}
                </div>
            </div>
            {Array.from({ length: extraPageCount }).map((_, extraIdx) => {
                const pageNumber = baseSheetIndex + extraIdx + 2;
                return (
                    <div
                        key={`word-flow-extra-${baseSheetIndex}-${extraIdx}`}
                        className="quote-a4-sheet quote-a4-sheet--continuation quote-a4-sheet--word-flow-extra"
                        data-word-flow-extra="1"
                    >
                        <QuoteClauseWordFlowPageFrame
                            windowTopPx={contWindowTopPx}
                            windowHeightPx={contWindowPx}
                            includeTopPanel
                        />
                        <div
                            className="quote-sheet-logo-row quote-clause-word-flow-chrome"
                            aria-hidden="true"
                            style={{ width: '100%' }}
                        >
                            <div style={{ textAlign: 'right', width: '100%' }}>
                                {quoteLogoDisplaySrc ? (
                                    <img
                                        src={quoteLogoDisplaySrc}
                                        alt=""
                                        style={{
                                            height: '68px',
                                            width: 'auto',
                                            maxWidth: '212px',
                                            objectFit: 'contain',
                                        }}
                                    />
                                ) : null}
                            </div>
                        </div>
                        <div
                            className="quote-sheet-main-flex"
                            style={{ display: 'flex', flexDirection: 'column' }}
                        >
                            <div
                                className="content-section quote-clause-word-flow-content-window"
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    minHeight: contWindowPx,
                                    height: contWindowPx,
                                }}
                            />
                        </div>
                        <div className="quote-clause-word-flow-chrome">{renderFooter(pageNumber)}</div>
                    </div>
                );
            })}
        </>
    );
}
