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
    return !segmentHasBody(seg);
}

function segmentHasBody(seg) {
    const html = String(seg?.html || '');
    return /<(?:table|img|svg|hr)\b/i.test(html) || Boolean(html
        .replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ')
        .replace(/[\s\u00a0\u200b\ufeff]/g, ''));
}

// A run of editor spacer units is not the first paragraph of a heading.
function endsWithOrphanHeading(group, segments) {
    for (let i = group.length - 1; i >= 0; i--) {
        const seg = segments[group[i]];
        if (seg?.showHeading) return !segmentHasBody(seg);
        if (segmentHasBody(seg)) return false;
    }
    return false;
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
 * - Heading-only → first real body unit (already paragraph/row sized)
 */
function keepWithFollowCount(seg) {
    if (isNoteLabelOnlyHtml(seg?.html)) return 1;
    if (isTableSectionHeaderHtml(seg?.html)) return 1;
    if (segmentIsHeadingOnly(seg)) return 1;
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
        for (let k = 0; k < want && nextIi < indices.length;) {
            const follow = indices[nextIi];
            const followSeg = segments[follow];
            if (followSeg?.clauseIdx !== seg.clauseIdx && seg.clauseIdx != null) break;
            /* Never glue a full note block onto something else mid-chain. */
            if (k > 0 && isBoqNoteBlockHtml(followSeg?.html)) break;
            chain.push(follow);
            nextIi += 1;
            if (segmentHasBody(followSeg) && !segmentNeedsCappedKeepWith(followSeg)) k += 1;
        }
        return { chain, nextIi };
    };

    // Search whole candidate pages instead of rebuilding the DOM for every
    // additional row. Existing fit, keep-with, verification and fill rules remain
    // authoritative; exponential bounds avoid measuring an entire long BOQ first.
    let ii = 0;
    while (ii < indices.length) {
        const pageIdx = pages.length;
        const first = buildChain(ii);
        let firstEnd = first.nextIi;
        if (!fitOf(first.chain, pageIdx).ok) {
            firstEnd = ii + 1;
            if (!fitOf([indices[ii]], pageIdx).ok) {
                // Preserve the oversized atomic unit. The live integrity gate
                // blocks export until it can fit; never discard its content.
                pages.push([indices[ii++]]);
                continue;
            }
        }
        const ends = [ii, firstEnd];
        for (let cursor = firstEnd; cursor < indices.length;) {
            cursor = buildChain(cursor).nextIi;
            ends.push(cursor);
        }
        const count = ends.length - 1;
        let best = 1;
        let failed = count + 1;
        let probe = Math.min(2, count);
        while (probe > best) {
            if (fitOf(indices.slice(ii, ends[probe]), pageIdx).ok) {
                best = probe;
                if (probe === count) break;
                probe = Math.min(count, probe * 2);
            } else {
                failed = probe;
                break;
            }
        }
        let lo = best + 1;
        let hi = Math.min(count, failed - 1);
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (fitOf(indices.slice(ii, ends[mid]), pageIdx).ok) {
                best = mid;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        pages.push(indices.slice(ii, ends[best]));
        ii = ends[best];
    }

    let groups = ensureSegmentPageGroupsCoverAll(
        pages.filter((g) => g.length > 0),
        segments.length
    );

    /*
     * Verify-down with binary search: find the longest prefix that still fits.
     * Heuristic "peel N by overshoot/16" left BOQ pages overpacked (enquiry 1515).
     * Cap sweeps generously — sole tall units are left alone for soft-split.
     */
    for (let sweep = 0; sweep < 128; sweep += 1) {
        let changed = false;
        for (let si = 0; si < groups.length; si += 1) {
            const g = groups[si];
            if (!g || g.length <= 1) continue;
            const fit = fitOf(g, si);
            if (fit.ok) continue;

            /* Binary search longest fitting prefix (at least 1 unit stays). */
            let lo = 1;
            let hi = g.length - 1;
            let best = 1;
            while (lo <= hi) {
                const mid = (lo + hi) >> 1;
                const prefix = g.slice(0, mid);
                const prefFit = fitOf(prefix, si);
                if (prefFit.ok) {
                    best = mid;
                    lo = mid + 1;
                } else {
                    hi = mid - 1;
                }
            }
            if (best >= g.length) continue;
            const movedBatch = g.splice(best);
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

    /*
     * Fill-up: binary-search how many leading units from the next page still fit.
     * One-at-a-time left nearly-empty trailing sheets after coarse verify-down peels.
     */
    for (let sweep = 0; sweep < 64; sweep += 1) {
        let changed = false;
        for (let si = 0; si < groups.length - 1; si += 1) {
            const curG = groups[si];
            const next = groups[si + 1];
            if (!curG?.length || !next?.length) continue;
            let lo = 1;
            let hi = next.length;
            let best = 0;
            while (lo <= hi) {
                const mid = (lo + hi) >> 1;
                const trial = [...curG, ...next.slice(0, mid)];
                const fit = fitOf(trial, si);
                if (fit.ok) {
                    best = mid;
                    lo = mid + 1;
                } else {
                    hi = mid - 1;
                }
            }
            while (best > 0 && endsWithOrphanHeading([...curG, ...next.slice(0, best)], segments)) best--;
            if (best < 1) continue;
            const moved = next.splice(0, best);
            curG.push(...moved);
            if (!next.length) groups.splice(si + 1, 1);
            changed = true;
            break;
        }
        if (!changed) break;
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
