/**
 * Real-DOM fit packer: break decisions use a fixed-height content box
 * (height: usablePx, overflow:hidden) and the painted bottom of the last unit
 * relative to the box top — never scrollHeight of an auto-growing box.
 *
 * Gated by EMS_FILL_PACK / VITE_EMS_FILL_PACK.
 */

import {
    PACK_HEIGHT_SAFETY_PX,
    EMS_QUOTE_CONT_USABLE_PX_FALLBACK,
    ensureSegmentPageGroupsCoverAll,
    assertSegmentPageGroupsIntegrity,
} from './quoteClausePagination.js';

/** @returns {boolean} */
export function isEmsFillPackEnabled() {
    try {
        if (typeof window !== 'undefined') {
            if (window.EMS_FILL_PACK === true || window.EMS_FILL_PACK === 'true') return true;
            if (window.EMS_FILL_PACK === false || window.EMS_FILL_PACK === 'false') return false;
            const ls = window.localStorage?.getItem?.('EMS_FILL_PACK');
            if (ls === 'true') return true;
            if (ls === 'false') return false;
        }
    } catch {
        /* ignore */
    }
    try {
        const v = String(
            (typeof import.meta !== 'undefined' && import.meta.env?.VITE_EMS_FILL_PACK) || ''
        )
            .trim()
            .toLowerCase();
        return v === '1' || v === 'true' || v === 'yes';
    } catch {
        return false;
    }
}

function isTableSectionHeaderHtml(html) {
    const plain = String(html || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return /^(general|notes?)\s*:?\s*$/i.test(plain) || /^general\b/i.test(plain);
}

function isBoqNoteBlockHtml(html) {
    return /data-ems-boq-note\s*=\s*["']?1/i.test(String(html || ''));
}

function isNoteLabelOnlyHtml(html) {
    if (isBoqNoteBlockHtml(html)) return false;
    const plain = String(html || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return /^notes?\s*:?\s*$/i.test(plain);
}

function segmentIsHeadingOnly(seg) {
    if (!seg?.showHeading) return false;
    const plain = String(seg.html || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\u00a0/g, ' ')
        .trim();
    return plain.length < 8;
}

/**
 * Cap keep-with: heading-only, General row, or Note label (when not already a full note block).
 * Note blocks that already include bullets must not glue another unit.
 */
function segmentNeedsCappedKeepWith(seg) {
    if (!seg) return false;
    if (isBoqNoteBlockHtml(seg.html)) return false;
    if (isNoteLabelOnlyHtml(seg.html)) return true;
    if (isTableSectionHeaderHtml(seg.html)) return true;
    return segmentIsHeadingOnly(seg);
}

/**
 * How many following units to glue (capped).
 * - Note label → 1 (first bullet)
 * - General → 1 (first data row)
 * - Heading-only → up to 2 (first ~2 lines / units)
 */
function keepWithFollowCount(seg) {
    if (isNoteLabelOnlyHtml(seg?.html)) return 1;
    if (isTableSectionHeaderHtml(seg?.html)) return 1;
    if (segmentIsHeadingOnly(seg)) return 2;
    return 0;
}

/**
 * @typedef {{
 *   ok: boolean,
 *   bottomPx: number,
 *   limitPx: number,
 *   scrollHeight: number,
 *   clientHeight: number,
 *   rule: string,
 * }} FitResult
 */

/**
 * Pack by fixed-box last-child bottom fit.
 *
 * @param {number[]} indices
 * @param {{
 *   segments: Array<{ html?: string, showHeading?: boolean, clauseIdx?: number, key?: string }>,
 *   measureFit: (groupIndices: number[], pageIdx: number) => FitResult,
 *   usablePx?: number,
 *   reservePx?: number,
 * }} options
 * @returns {number[][]}
 */
export function packSegmentsByRealDomFit(indices, options = {}) {
    const segments = options.segments || [];
    const measureFit = options.measureFit;
    if (!indices?.length || typeof measureFit !== 'function') return [];

    const usable = Math.max(options.usablePx || EMS_QUOTE_CONT_USABLE_PX_FALLBACK, 240);
    const reserve = Number.isFinite(options.reservePx) ? options.reservePx : PACK_HEIGHT_SAFETY_PX;
    const limit = Math.max(usable - reserve, 200);

    /** @type {number[][]} */
    const pages = [];
    /** @type {number[]} */
    let cur = [];

    const fitOf = (group, pageIdx) => {
        if (!group.length) {
            return {
                ok: true,
                bottomPx: 0,
                limitPx: limit,
                scrollHeight: 0,
                clientHeight: usable,
                rule: 'empty',
            };
        }
        const r = measureFit(group, pageIdx) || {};
        const bottomPx = Number(r.bottomPx) || 0;
        const limitPx = Number.isFinite(r.limitPx) ? Number(r.limitPx) : limit;
        /* Prefer measureFit.ok (same gate as live) — do not re-derive from bottom alone. */
        const ok =
            typeof r.ok === 'boolean' ? Boolean(r.ok) : bottomPx <= limitPx + 0.5;
        return {
            ok,
            bottomPx,
            limitPx,
            scrollHeight: Number(r.scrollHeight) || 0,
            clientHeight: Number(r.clientHeight) || usable,
            rule: r.rule || (ok ? 'fits' : 'overflow'),
        };
    };

    /**
     * Build a capped keep-with chain starting at indices[ii].
     * @returns {{ chain: number[], nextIi: number }}
     */
    const buildChain = (ii) => {
        const idx = indices[ii];
        const seg = segments[idx];
        /** @type {number[]} */
        const chain = [idx];
        let nextIi = ii + 1;
        if (!segmentNeedsCappedKeepWith(seg)) {
            return { chain, nextIi };
        }
        const want = keepWithFollowCount(seg);
        for (let k = 0; k < want && nextIi < indices.length; k += 1) {
            const follow = indices[nextIi];
            const followSeg = segments[follow];
            if (followSeg?.clauseIdx !== seg.clauseIdx && seg.clauseIdx != null) break;
            /* Never glue a full note block onto something else mid-chain. */
            if (k > 0 && isBoqNoteBlockHtml(followSeg?.html)) break;
            chain.push(follow);
            nextIi += 1;
        }
        return { chain, nextIi };
    };

    let ii = 0;
    while (ii < indices.length) {
        const pageIdx = pages.length;
        const { chain, nextIi } = buildChain(ii);
        const sheetEmpty = cur.length === 0;
        const trial = [...cur, ...chain];
        const fit = fitOf(trial, pageIdx);

        if (fit.ok) {
            cur = trial;
            ii = nextIi;
            continue;
        }

        /* Does not fit. */
        if (sheetEmpty) {
            /*
             * Forced progress ONLY on an empty sheet when a single unit (or minimal
             * keep-with chain) is taller than the limit.
             */
            if (chain.length === 1 || segmentNeedsCappedKeepWith(segments[chain[0]])) {
                /* Try shrinking keep-with to just the head unit if chain > 1. */
                if (chain.length > 1) {
                    const headOnly = [chain[0]];
                    const headFit = fitOf(headOnly, pageIdx);
                    if (headFit.ok) {
                        /* Minimal chain does not fit as a whole → start new sheet with head… wait, sheet is empty.
                         * Head alone fits: place head only, leave follow for later (do not force full chain). */
                        cur = headOnly;
                        ii = ii + 1;
                        continue;
                    }
                    /* Head alone overflows empty sheet — forced progress. */
                    cur = headOnly;
                    pages.push(cur);
                    cur = [];
                    ii = ii + 1;
                    continue;
                }
                /* Single oversized unit on empty sheet. */
                cur = chain;
                pages.push(cur);
                cur = [];
                ii = nextIi;
                continue;
            }
        }

        /* Non-empty sheet: never force. Close sheet and retry chain on a new sheet. */
        if (cur.length) {
            pages.push(cur);
            cur = [];
            /* retry same ii on fresh sheet */
            continue;
        }

        /* Empty sheet but chain still fails after shrink — force head only. */
        cur = [chain[0]];
        pages.push(cur);
        cur = [];
        ii = ii + 1;
    }

    if (cur.length) {
        pages.push(cur);
    }

    let groups = ensureSegmentPageGroupsCoverAll(
        pages.filter((g) => g.length > 0),
        segments.length
    );

    /* Verify-down until each page's measureFit says ok (cap 48). Prevents BOQ/matrix
     * rows being handed to the live preview already past CONTENT END. */
    for (let sweep = 0; sweep < 48; sweep += 1) {
        let changed = false;
        for (let si = 0; si < groups.length; si += 1) {
            const g = groups[si];
            if (!g || g.length <= 1) continue;
            const fit = fitOf(g, si);
            if (fit.ok) continue;
            const overshootPx = Math.max(0, (fit.bottomPx || 0) - (fit.limitPx || 0));
            const batch = Math.min(
                g.length - 1,
                Math.max(1, Math.ceil(overshootPx / 16) || 1)
            );
            /** @type {number[]} */
            const movedBatch = [];
            for (let k = 0; k < batch && g.length > 1; k += 1) {
                const moved = g.pop();
                if (moved == null) break;
                movedBatch.unshift(moved);
            }
            if (!movedBatch.length) continue;
            if (si + 1 < groups.length) {
                groups[si + 1] = [...movedBatch, ...groups[si + 1]];
            } else {
                groups.push([...movedBatch]);
            }
            changed = true;
            break;
        }
        if (!changed) break;
        groups = ensureSegmentPageGroupsCoverAll(
            groups.filter((g) => g.length > 0),
            segments.length
        );
    }

    const integrity = assertSegmentPageGroupsIntegrity(groups, segments.length);
    if (!integrity.ok) {
        console.error('[EMS fill-pack] integrity failed', integrity);
    }

    const matrixCheck = assertMatrixRowsAppearOnce(groups, segments);
    if (!matrixCheck.ok) {
        console.error('[EMS fill-pack] matrix row id check failed', matrixCheck);
    }

    return groups.filter((g) => g.length > 0);
}

/**
 * Extract matrix-like row numbers (1–31) from segment HTML and ensure each appears once.
 * @returns {{ ok: boolean, missing: number[], dupes: number[], seen: Map<number, number> }}
 */
export function assertMatrixRowsAppearOnce(groups, segments) {
    /** @type {Map<number, number>} */
    const seen = new Map();
    for (const g of groups || []) {
        for (const idx of g || []) {
            const html = String(segments[idx]?.html || '');
            /* First cell-ish number at start of a row fragment */
            const m = html.match(
                /<t[dh][^>]*>\s*(?:<[^>]+>\s*)*(\d{1,2})\s*(?:<|$)/i
            );
            if (!m) continue;
            const n = parseInt(m[1], 10);
            if (n < 1 || n > 31) continue;
            /* Only count when nearby text looks like a responsibility / schedule matrix row */
            if (
                !/data-ems-table-split/i.test(html) &&
                !/responsibility|boring|cage|concrete|soil/i.test(html)
            ) {
                /* still count numbered split table rows */
                if (!/<tr\b/i.test(html)) continue;
            }
            seen.set(n, (seen.get(n) || 0) + 1);
        }
    }
    /** @type {number[]} */
    const missing = [];
    /** @type {number[]} */
    const dupes = [];
    /* Only validate the range that actually appeared (avoid false missing on quotes without matrix). */
    if (seen.size >= 8) {
        for (let n = 1; n <= 31; n += 1) {
            const c = seen.get(n) || 0;
            if (c === 0) missing.push(n);
            else if (c > 1) dupes.push(n);
        }
    }
    return { ok: missing.length === 0 && dupes.length === 0, missing, dupes, seen };
}
