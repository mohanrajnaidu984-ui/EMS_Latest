'use strict';

const { getPricingAnchorJobs, getPricingAnchorJobsForDivision, expandVisibleJobIdsFromAnchors } = require('./quotePricingAccess');

function jsNormKey(s) {
    return String(s || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

/** Strip trailing " (L12)" from customer labels (align with pendingQuoteListQuery sqlTupleCustomerKey). */
function jsStripCustomerLeadSuffix(s) {
    const t = String(s || '').trim();
    const m = t.match(/^(.+)\s+\(L\d+\)\s*$/i);
    return m ? m[1].trim() : t;
}

/** Quote / pricing OwnJob vs EnquiryForItem (same shape as sqlTupleOwnJobMatch). */
function jsTupleOwnJobMatch(quoteOwn, pvEnquiryForItem) {
    const eqO = jsNormKey(quoteOwn);
    const pvO = jsNormKey(pvEnquiryForItem);
    if (!eqO || !pvO) return false;
    return (
        eqO === pvO ||
        pvO.startsWith(`${eqO}-`) ||
        pvO.startsWith(`${eqO} `) ||
        eqO.startsWith(`${pvO}-`) ||
        eqO.startsWith(`${pvO} `) ||
        (eqO.length >= 3 && eqO.length <= 80 && pvO.includes(eqO)) ||
        /** QuoteForm often persists OwnJob as "L1 - BMS Project" while PV is "BMS Project". */
        (pvO.length >= 3 && pvO.length <= 80 && eqO.includes(pvO))
    );
}

/**
 * EnquiryQuotes.LeadJob vs pricing LeadJobName — strict only:
 * if both sides yield an L-code, codes must match; else full normalized string equality.
 * No prefix / substring / fuzzy lead matching (per product requirement).
 */
function jsTupleLeadJobMatch(quoteLead, pvLeadName) {
    const lq = extractLCodeFromLeadJobName(quoteLead || '');
    const lp = extractLCodeFromLeadJobName(pvLeadName || '');
    if (lq && lp) return lq === lp;
    const eqL = jsNormKey(quoteLead);
    const pvL = jsNormKey(pvLeadName);
    return Boolean(eqL && pvL && eqL === pvL);
}

/** Quote ToName vs list/pricing customer — exact normalized alnum key only (no fuzzy / prefix). */
function jsTupleCustomerMatch(quoteToName, pvCustomerName) {
    const ka = normCustomerKeyForRollup(quoteToName);
    const kb = normCustomerKeyForRollup(pvCustomerName);
    return Boolean(ka && kb && ka === kb);
}

function normalizeDeptKey(s) {
    return String(s || '')
        .trim()
        .toLowerCase()
        .replace(/^(l\d+|sub job)\s*-\s*/i, '')
        .replace(/\s+/g, ' ');
}

function quoteRowToName(q) {
    if (!q) return '';
    return String(q.ToName ?? q.toName ?? q.TOName ?? q.toname ?? '').trim();
}

function isBasePricePricingRow(p) {
    const po = String(p.PriceOption ?? p.priceOption ?? p.priceoption ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    return po === 'base price';
}

function isDeclineToQuotePricingRow(pr) {
    const v = String(pr?.Quotingornot ?? pr?.quotingornot ?? '').trim().toLowerCase();
    return v === 'yes' || v === 'y' || v === '1' || v === 'true';
}

function pricingRowMatchesLeadLine(pr, lineLeadCode, pvLead) {
    const code = extractLCodeFromLeadJobName(pr.LeadJobName || '');
    const want = String(lineLeadCode || '').trim().toUpperCase();
    if (want && code === want) return true;
    if (pvLead && jsTupleLeadJobMatch(pvLead, pr.LeadJobName)) return true;
    return false;
}

function findDeclinedPricingForLeadLine(
    pricesForReq,
    pvOwn,
    pvLead,
    customerCandidates,
    lineLeadCode,
    subtreeJobIdSet
) {
    const cands = (customerCandidates || [])
        .map((c) => jsStripCustomerLeadSuffix(String(c || '').trim()))
        .filter(Boolean);
    const wantKeys = [
        ...new Set(cands.map((c) => normCustomerKeyForRollup(c)).filter(Boolean)),
    ];
    let subtreeBest = null;
    let generalBest = null;
    for (const pr of pricesForReq || []) {
        if (!isDeclineToQuotePricingRow(pr)) continue;
        if (!isBasePricePricingRow(pr)) continue;
        const cn = String(pr.CustomerName ?? pr.customerName ?? '').trim();
        if (wantKeys.length > 0 && !wantKeys.some((k) => pricingCustomerRowMatchesKeyQuote(cn, k))) {
            continue;
        }
        const jid = pvRowMatchedJobId(pr);
        if (subtreeJobIdSet && subtreeJobIdSet.size > 0 && jid && subtreeJobIdSet.has(String(jid))) {
            if (!subtreeBest || new Date(pr.UpdatedAt) > new Date(subtreeBest.UpdatedAt)) {
                subtreeBest = pr;
            }
            continue;
        }
        if (pvOwn && !jsTupleOwnJobMatch(pvOwn, pr.EnquiryForItem)) continue;
        if (!pricingRowMatchesLeadLine(pr, lineLeadCode, pvLead)) continue;
        if (!generalBest || new Date(pr.UpdatedAt) > new Date(generalBest.UpdatedAt)) {
            generalBest = pr;
        }
    }
    return subtreeBest || generalBest;
}

function quoteDetailLineResolved(ln) {
    if (!ln) return false;
    if (ln.declinedToQuote) return true;
    const t = String(ln.textLine || '');
    if (/\(Decline to Quote\)/i.test(t)) return true;
    if (/\(Not Quoted\)/i.test(t)) return false;
    return true;
}

function quoteRowMatchesTuple(q, pvOwn, pvLeadName, pvCust) {
    return (
        jsTupleOwnJobMatch(q.OwnJob, pvOwn) &&
        jsTupleLeadJobMatch(q.LeadJob, pvLeadName) &&
        jsTupleCustomerMatch(quoteRowToName(q), pvCust)
    );
}

/** EMS QuoteNumber paths include the lead segment, e.g. AAC/BMP/9-L1/1-R0 — only when LeadJob has no L-code. */
function quoteNumberEmbedsLeadCode(quoteNumber, lineLeadCode) {
    const qn = String(quoteNumber || '').toUpperCase();
    const lc = String(lineLeadCode || '').trim().toUpperCase();
    if (!qn || !/^L\d+$/.test(lc)) return false;
    return qn.includes(`-${lc}/`) || qn.includes(`-${lc}-`) || qn.includes(`/${lc}/`);
}

/**
 * Match list line lead to saved quote using EnquiryQuotes.LeadJob first (extracted L-code, then strict LeadJob vs PV lead).
 * QuoteNumber L-segment is a last resort when LeadJob carries no L# (legacy rows).
 */
function quoteMatchesLeadLine(q, lineLeadCode, pvLeadName) {
    const wantLc = String(lineLeadCode || '').trim().toUpperCase();
    const lq = extractLCodeFromLeadJobName(String(q.LeadJob || ''));
    if (wantLc && /^L\d+$/.test(wantLc) && lq && lq === wantLc) return true;
    const pv = String(pvLeadName || '').trim();
    if (pv && jsTupleLeadJobMatch(q.LeadJob, pvLeadName)) return true;
    if (wantLc && /^L\d+$/.test(wantLc) && !lq && quoteNumberEmbedsLeadCode(q.QuoteNumber, wantLc)) return true;
    return false;
}

/** Resolve saved quote row for one list line: prefer EnquiryQuotes.LeadJob (+ exact ToName), not QuoteNumber parsing. */
function findQuoteRowForLeadLine(quotesForReq, pvOwn, pvLeadName, customerCandidates, lineLeadCode) {
    const cands = (customerCandidates || [])
        .map((c) => jsStripCustomerLeadSuffix(String(c || '').trim()))
        .filter(Boolean);
    const seen = new Set();
    const uniq = [];
    for (const c of cands) {
        const k = jsNormKey(c);
        if (!k || seen.has(k)) continue;
        seen.add(k);
        uniq.push(c);
    }
    const customersRequired = uniq.length > 0;
    const matchesAnyCustomer = (q) => uniq.some((c) => jsTupleCustomerMatch(quoteRowToName(q), c));

    /** Multi-customer same L#: use EnquiryQuotes.LeadJob (and ToName), not QuoteNumber L-segment. */
    if (pvOwn && quotesForReq.length && (lineLeadCode || pvLeadName)) {
        const byLead = quotesForReq.filter(
            (q) => jsTupleOwnJobMatch(q.OwnJob, pvOwn) && quoteMatchesLeadLine(q, lineLeadCode, pvLeadName)
        );
        if (uniq.length) {
            const narrowed = byLead.filter(matchesAnyCustomer);
            if (narrowed.length >= 1) return pickLatestQuoteRow(narrowed);
        } else if (byLead.length >= 1) {
            return pickLatestQuoteRow(byLead);
        }
    }

    const strict = quotesForReq.filter(
        (q) =>
            jsTupleOwnJobMatch(q.OwnJob, pvOwn) &&
            jsTupleLeadJobMatch(q.LeadJob, pvLeadName) &&
            matchesAnyCustomer(q)
    );
    let best = pickLatestQuoteRow(strict);
    if (best && String(best.QuoteNumber || '').trim()) return best;
    const loose = quotesForReq.filter(
        (q) => jsTupleOwnJobMatch(q.OwnJob, pvOwn) && jsTupleLeadJobMatch(q.LeadJob, pvLeadName)
    );
    if (loose.length === 1) {
        const only = loose[0];
        if (!customersRequired || matchesAnyCustomer(only)) return only;
    }
    if (loose.length > 1) {
        const narrowed = loose.filter(matchesAnyCustomer);
        if (narrowed.length >= 1) return pickLatestQuoteRow(narrowed);
        if (!customersRequired) return pickLatestQuoteRow(loose);
    }
    /**
     * Do not fall back to a quote that only matches customer+lead: another department (e.g. HVAC) can share the same
     * L# on a different top-level root — that quote must not satisfy this row’s `pvOwn` (e.g. Electrical).
     */
    if ((!best || !String(best.QuoteNumber || '').trim()) && customersRequired && uniq.length && quotesForReq.length) {
        const matchesLeadForLine = (q) => quoteMatchesLeadLine(q, lineLeadCode, pvLeadName);
        const fb = quotesForReq.filter(
            (q) => matchesAnyCustomer(q) && matchesLeadForLine(q) && jsTupleOwnJobMatch(q.OwnJob, pvOwn)
        );
        if (fb.length >= 1) {
            return pickLatestQuoteRow(fb);
        }
    }
    /**
     * Data correction fallback: some saved quotes carry a different LeadJob/L# than pricing rows
     * for the same OwnJob + customer (example: quote saved under HVAC/L1 while pricing line is L2).
     * If there is exactly one quote-ref family for OwnJob + customer, use it.
     */
    if ((!best || !String(best.QuoteNumber || '').trim()) && customersRequired && uniq.length && pvOwn) {
        const byOwnAndCustomer = quotesForReq.filter(
            (q) => jsTupleOwnJobMatch(q.OwnJob, pvOwn) && matchesAnyCustomer(q)
        );
        const quoteFamilyKey = (q) => {
            const qno = Number(q?.QuoteNo ?? q?.quoteNo);
            if (!Number.isNaN(qno) && qno > 0) return `qno:${qno}`;
            const qref = String(q?.QuoteNumber || '').trim();
            if (!qref) return '';
            return qref.replace(/-R\d+\s*$/i, '');
        };
        const refSet = new Set(
            byOwnAndCustomer.map((q) => quoteFamilyKey(q)).filter(Boolean)
        );
        if (refSet.size === 1 && byOwnAndCustomer.length >= 1) {
            return pickLatestQuoteRow(byOwnAndCustomer);
        }
    }
    return best;
}

function pickLatestQuoteRow(rows) {
    if (!rows || rows.length === 0) return null;
    const sorted = [...rows].sort((a, b) => {
        const qnA = Number(a.QuoteNo) || 0;
        const qnB = Number(b.QuoteNo) || 0;
        if (qnB !== qnA) return qnB - qnA;
        const rA = Number(a.RevisionNo) || 0;
        const rB = Number(b.RevisionNo) || 0;
        return rB - rA;
    });
    return sorted[0];
}

function preparedByFromQuoteNumber(allQuotes, requestNo, quoteNumber) {
    const req = String(requestNo || '').trim();
    const want = String(quoteNumber || '').trim();
    if (!req || !want) return '';
    const matches = (allQuotes || []).filter(
        (q) => String(q.RequestNo ?? '').trim() === req && String(q.QuoteNumber || '').trim() === want
    );
    if (!matches.length) return '';
    const best = pickLatestQuoteRow(matches);
    return best ? String(best.PreparedBy ?? best.preparedBy ?? '').trim() : '';
}

/** Union SQL ListPreparedBy with PreparedBy from each quoted QuoteNumber on the row (merged or single). */
function collectPreparedByForMappedRow(requestNo, row, allQuotes) {
    const out = new Set();
    const add = (v) => {
        const t = String(v || '').trim();
        if (!t) return;
        t.split(',')
            .map((x) => x.trim())
            .filter(Boolean)
            .forEach((x) => out.add(x));
    };
    add(row.ListPreparedBy ?? row.listpreparedby);
    const refSet = new Set();
    if (Array.isArray(row.ListMultiLeadQuoteRefs)) {
        for (const e of row.ListMultiLeadQuoteRefs) {
            if (e.quoteNumber) refSet.add(String(e.quoteNumber).trim());
        }
    }
    if (row.ListQuoteRef) {
        String(row.ListQuoteRef)
            .split(/\s*\|\s*/)
            .map((x) => x.trim())
            .filter(Boolean)
            .forEach((x) => refSet.add(x));
    }
    for (const qn of refSet) {
        add(preparedByFromQuoteNumber(allQuotes, requestNo, qn));
    }
    return Array.from(out)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
        .join(', ');
}

function enrichRowPreparedBy(row, allQuotes) {
    if (!row) return row;
    const req = String(row.RequestNo ?? '').trim();
    const combined = collectPreparedByForMappedRow(req, row, allQuotes).trim();
    const existing = String(row.ListPreparedBy ?? row.listpreparedby ?? '').trim();
    const next = combined || existing;
    return next ? { ...row, ListPreparedBy: next } : row;
}

/**
 * When the same own-job + customer has Base Price rows under multiple LeadJobName values, roll up
 * quote refs (latest revision per lead) + None / Partial / All Quoted status for the summary grid.
 */
function isPendingPvListRow(row) {
    const pv = row.ListPendingPvId ?? row.listpendingpvid;
    const n = Number(pv);
    return pv != null && pv !== '' && !Number.isNaN(n) && n > 0;
}

function mergeRollupStatuses(statuses) {
    const ranks = statuses
        .map((s) => {
            if (!s) return -1;
            if (s === 'None Quoted') return 0;
            if (s === 'Partial Quoted') return 1;
            if (s === 'All Quoted') return 2;
            return -1;
        })
        .filter((x) => x >= 0);
    if (ranks.length === 0) return null;
    const mx = Math.max(...ranks);
    const mn = Math.min(...ranks);
    if (mx === 2 && mn === 2) return 'All Quoted';
    if (mx >= 1) return 'Partial Quoted';
    return 'None Quoted';
}

/** None / Partial / All from the same per-lead lines as Quote details (fixes merged PV rows where SQL tuple status is always None). */
function rollupStatusFromLeadDetailLines(lines) {
    if (!Array.isArray(lines) || lines.length === 0) return null;
    let nResolved = 0;
    for (const ln of lines) {
        if (quoteDetailLineResolved(ln)) nResolved++;
    }
    const n = lines.length;
    if (nResolved === 0) return 'None Quoted';
    if (nResolved === n) return 'All Quoted';
    return 'Partial Quoted';
}

function uniqueSubjobPriceSegments(rows) {
    const seen = new Set();
    const out = [];
    for (const r of rows) {
        const raw = r.SubJobPrices || r.subJobPrices || '';
        for (const seg of String(raw).split(';;').filter(Boolean)) {
            if (seen.has(seg)) continue;
            seen.add(seg);
            out.push(seg);
        }
    }
    return out.join(';;');
}

function mergeMultiLeadQuoteRefEntries(rows) {
    const seen = new Set();
    const out = [];
    for (const r of rows) {
        const arr = r.ListMultiLeadQuoteRefs;
        if (!Array.isArray(arr)) continue;
        for (const e of arr) {
            const qn = String(e.quoteNumber || '').trim();
            if (!qn) continue;
            const lc = extractLCodeFromLeadJobName(String(e.leadName || '')) || '_';
            const k = `${lc}|${qn}`;
            if (seen.has(k)) continue;
            seen.add(k);
            out.push(e);
        }
    }
    return out.length ? out : null;
}

/**
 * When buildMultiLeadQuoteRollup already resolved a quote per pricing lead, reuse QuoteNumber
 * so detail lines match the grid even if tuple matching on LeadJob strings differs slightly.
 */
function pickQuoteRowFromMultiLeadRefs(mergedRefs, lineLeadCode, quotesForReq, pvLeadForLine) {
    if (!Array.isArray(mergedRefs) || mergedRefs.length === 0) return null;
    const lc = String(lineLeadCode || '').trim().toUpperCase();
    if (!/^L\d+$/.test(lc)) return null;
    let entry = mergedRefs.find((e) => extractLCodeFromLeadJobName(String(e.leadName || '')) === lc);
    if (!entry && pvLeadForLine) {
        const lp = extractLCodeFromLeadJobName(String(pvLeadForLine || ''));
        if (lp) {
            entry = mergedRefs.find((e) => extractLCodeFromLeadJobName(String(e.leadName || '')) === lp);
        }
    }
    if (!entry || !String(entry.quoteNumber || '').trim()) return null;
    const qn = String(entry.quoteNumber).trim();
    const matches = (quotesForReq || []).filter((q) => String(q.QuoteNumber ?? q.quoteNumber ?? '').trim() === qn);
    if (matches.length === 0) return null;
    const leadOk = matches.filter((q) => quoteMatchesLeadLine(q, lineLeadCode, pvLeadForLine));
    return leadOk.length ? pickLatestQuoteRow(leadOk) : null;
}

function fmtRowDetailDate(raw) {
    try {
        const dt = raw ? new Date(raw) : null;
        if (!dt || Number.isNaN(dt.getTime())) return '—';
        const d = dt.getDate();
        const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][dt.getMonth()];
        const y = dt.getFullYear();
        return `${String(d).padStart(2, '0')}-${mon}-${y}`;
    } catch {
        return '—';
    }
}

/** L1 / L2 / L3 from pricing LeadJobName or pending tuple label (e.g. "… (L2)", "L1 - HVAC"). */
function extractLCodeFromLeadJobName(s) {
    const t = String(s || '').trim();
    if (!t) return '';
    const mParen = t.match(/\(([lL]\d+)\)\s*$/);
    if (mParen) return mParen[1].toUpperCase();
    const mStart = t.match(/^\s*([lL]\d+)\b/);
    if (mStart) return mStart[1].toUpperCase();
    const mAny = t.match(/\b([lL]\d+)\b/);
    if (mAny) return mAny[1].toUpperCase();
    return '';
}

function lCodeSortKey(code) {
    const m = String(code || '').match(/^L(\d+)$/i);
    return m ? Number(m[1]) : 999;
}

/** Same normalization as pricing list `normPricingCustomerKey` (strip trailing " (L2)", alnum key). */
function normCustomerKeyForRollup(s) {
    return String(s || '')
        .replace(/\s*\(L\d+\)\s*$/i, '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

function pricingCustomerRowMatchesKeyQuote(cnRaw, wantKey) {
    if (!wantKey) return false;
    const n = normCustomerKeyForRollup(cnRaw);
    if (!n) return false;
    if (n === wantKey) return true;
    const shorter = n.length <= wantKey.length ? n : wantKey;
    const longer = n.length <= wantKey.length ? wantKey : n;
    if (shorter.length < 4) return false;
    return longer.startsWith(shorter);
}

function isInternalLeadSubmittedPricingRow(pr) {
    const cn = String(pr.CustomerName ?? pr.customerName ?? '').trim();
    const lj = String(pr.LeadJobName ?? pr.leadJobName ?? '').trim();
    if (!cn || !lj) return false;
    return normCustomerKeyForRollup(cn) === normCustomerKeyForRollup(lj);
}

function pvRowMatchedJobId(pr) {
    const mid = pr.MatchedEnquiryForId ?? pr.matchedEnquiryForId ?? pr.MatchedEnquiryForID;
    if (mid != null && String(mid) !== '' && String(mid) !== '0') return String(mid);
    if (pr.EnquiryForID && pr.EnquiryForID != 0 && pr.EnquiryForID != '0') return String(pr.EnquiryForID);
    return null;
}

function getEnquiryJobsForRequestNo(enqJobs, reqStr) {
    const r = String(reqStr ?? '').trim();
    if (!r) return [];
    return (enqJobs || []).filter((j) => String(j.RequestNo ?? j.requestNo ?? '').trim() === r);
}

function findEnquiryForJobByOwnName(jobs, ownRaw) {
    const s = String(ownRaw || '').trim();
    if (!s) return null;
    return jobs.find((j) => jsTupleOwnJobMatch(s, j.ItemName)) || null;
}

function getEnquiryForRootJob(jobs, start) {
    if (!start) return null;
    const byId = (id) => jobs.find((j) => String(j.ID) === String(id) || String(j.id) === String(id));
    let j = start;
    const vis = new Set();
    for (let n = 0; n < 500 && j; n++) {
        const pid = j.ParentID ?? j.parentID ?? j.ParentId;
        if (pid == null || pid === '' || pid === 0 || pid === '0') {
            return j;
        }
        if (vis.has(String(j.ID))) return j;
        vis.add(String(j.ID));
        const p = byId(pid);
        if (!p) return j;
        j = p;
    }
    return j;
}

/** All EnquiryFor IDs in the tree under `root` (inclusive). */
function getSubtreeJobIdSetForRoot(jobs, root) {
    const out = new Set();
    if (!root) return out;
    out.add(String(root.ID ?? root.id));
    let changed = true;
    let guard = 0;
    while (changed && guard++ < 200) {
        changed = false;
        for (const j of jobs) {
            const jid = String(j.ID ?? j.id);
            const pid = j.ParentID ?? j.parentID;
            if (pid == null || pid === '' || pid === 0 || pid === '0') continue;
            if (out.has(String(pid)) && !out.has(jid)) {
                out.add(jid);
                changed = true;
            }
        }
    }
    return out;
}

/**
 * Keep Base Price rows whose EnquiryFor belongs to the same top-level lead root as `own`.
 * Prevents a quote/pricing tuple for another lead root (e.g. standalone HVAC) from marking "All Quoted" for Civil→Electrical.
 */
function filterPriceRowsToOwnJobLeadRoot(priceRows, enqJobs, reqStr, own) {
    const jobs = getEnquiryJobsForRequestNo(enqJobs, reqStr);
    if (!jobs.length || !Array.isArray(priceRows) || priceRows.length === 0) return priceRows;
    const ownJob = findEnquiryForJobByOwnName(jobs, own);
    if (!ownJob) return priceRows;
    const root = getEnquiryForRootJob(jobs, ownJob);
    const sub = getSubtreeJobIdSetForRoot(jobs, root);
    if (!sub.size) return priceRows;
    return priceRows.filter((p) => {
        const jid = pvRowMatchedJobId(p);
        if (!jid) return false;
        return sub.has(String(jid));
    });
}

/**
 * Own-job + subjob Base Price total for one external customer on one lead (includes internal HVAC-style rows
 * where CustomerName = LeadJobName, same rule as pricing list).
 */
function sumCustomerBasePricingInLeadSubtree(pricesForReq, leadCode, customerDisplayName, subtreeJobIdSet) {
    const wantKey = normCustomerKeyForRollup(customerDisplayName);
    if (!wantKey || !subtreeJobIdSet || subtreeJobIdSet.size === 0) return 0;
    const lc = String(leadCode || '').trim().toUpperCase();

    const rowInSubtree = (pr) => {
        const jid = pvRowMatchedJobId(pr);
        return Boolean(jid && subtreeJobIdSet.has(String(jid)));
    };

    const wantLeadKeys = new Set();
    for (const pr of pricesForReq || []) {
        if (parseFloat(pr.Price || 0) <= 0) continue;
        if (!isBasePricePricingRow(pr)) continue;
        if (extractLCodeFromLeadJobName(pr.LeadJobName || '') !== lc) continue;
        if (!rowInSubtree(pr)) continue;
        const cn = String(pr.CustomerName ?? pr.customerName ?? '').trim();
        if (!pricingCustomerRowMatchesKeyQuote(cn, wantKey)) continue;
        const lk = normCustomerKeyForRollup(String(pr.LeadJobName ?? pr.leadJobName ?? '').trim());
        if (lk) wantLeadKeys.add(lk);
    }

    let sum = 0;
    for (const pr of pricesForReq || []) {
        if (parseFloat(pr.Price || 0) <= 0) continue;
        if (!isBasePricePricingRow(pr)) continue;
        if (extractLCodeFromLeadJobName(pr.LeadJobName || '') !== lc) continue;
        if (!rowInSubtree(pr)) continue;
        const cn = String(pr.CustomerName ?? pr.customerName ?? '').trim();
        if (pricingCustomerRowMatchesKeyQuote(cn, wantKey)) {
            sum += parseFloat(pr.Price) || 0;
            continue;
        }
        if (isInternalLeadSubmittedPricingRow(pr)) {
            const lk = normCustomerKeyForRollup(String(pr.LeadJobName ?? pr.leadJobName ?? '').trim());
            if (lk && wantLeadKeys.has(lk)) {
                sum += parseFloat(pr.Price) || 0;
            }
        }
    }
    return sum;
}

/**
 * Job-tree + pricing context so each enquiry root (L1, L2, …) gets a stable label and LeadJobName for quote matching.
 * Parent job repeats per lead when the user's subjob sits under the same parent across leads; otherwise external customer (e.g. BEMCO on L3).
 * When `quoteListShowAllLeadsForAdmin` is false and `pendingOwnItem` is set, only leads whose EnquiryFor branch contains that own job are included (avoids e.g. L2 HVAC line for a BMS-only pending row).
 */
function buildListQuoteLeadContext({
    enqJobs,
    roots,
    rootLabelMap,
    stringChildrenMap,
    enqPrices,
    pendingOwnItem,
    stripLeadPrefix,
    normalize,
    internalCustomerNorm,
    jobNameSetNorm,
    externalCustomers,
    quoteListShowAllLeadsForAdmin = false,
}) {
    const collectBranch = (root) => {
        const out = [];
        const stack = [root];
        const seen = new Set();
        while (stack.length) {
            const cur = stack.pop();
            const sid = String(cur.ID);
            if (seen.has(sid)) continue;
            seen.add(sid);
            out.push(cur);
            const kids = stringChildrenMap[sid] || [];
            for (const k of kids) stack.push(k);
        }
        return out;
    };

    const ownNorm = normalize(stripLeadPrefix(String(pendingOwnItem || '')));
    const ownItemTrim = String(pendingOwnItem || '').trim();
    const filterLeadsByOwnBranch = Boolean(ownItemTrim) && !quoteListShowAllLeadsForAdmin;
    const leadCodesWhereOwnParticipates = new Set();
    if (filterLeadsByOwnBranch) {
        for (const root of roots || []) {
            const lc = String(rootLabelMap[root.ID] || '').trim().toUpperCase();
            if (!/^L\d+$/.test(lc)) continue;
            const branch = collectBranch(root);
            if (branch.some((j) => jsTupleOwnJobMatch(ownItemTrim, j.ItemName))) {
                leadCodesWhereOwnParticipates.add(lc);
            }
        }
    }
    const jobSet = jobNameSetNorm instanceof Set ? jobNameSetNorm : new Set(Array.from(jobNameSetNorm || []));

    const isExternalPricingCustomer = (customerName) => {
        const cn = jsStripCustomerLeadSuffix(String(customerName || '').trim());
        const cnN = normalize(cn);
        return Boolean(cn && cnN !== internalCustomerNorm && !jobSet.has(cnN));
    };

    const priceRowsForLead = (leadCode) =>
        (enqPrices || []).filter(
            (p) =>
                isBasePricePricingRow(p) &&
                parseFloat(p.Price || 0) > 0 &&
                extractLCodeFromLeadJobName(p.LeadJobName || '') === leadCode
        );

    const bestPriceRowForLead = (leadCode, preferExternalWhenNoOwnInBranch) => {
        const rows = priceRowsForLead(leadCode);
        if (!rows.length) return null;
        if (preferExternalWhenNoOwnInBranch) {
            const ext = rows.find((p) => isExternalPricingCustomer(p.CustomerName));
            if (ext) return ext;
        }
        const byOwn = rows.filter((p) => jsTupleOwnJobMatch(pendingOwnItem, p.EnquiryForItem));
        return byOwn[0] || rows[0];
    };

    const allCodes = [];
    const leadLabelsByCode = {};
    const pvLeadByCode = {};

    const extList = Array.isArray(externalCustomers) ? externalCustomers.filter(Boolean) : [];

    for (const root of roots || []) {
        const leadCode = String(rootLabelMap[root.ID] || '').trim().toUpperCase();
        if (!/^L\d+$/.test(leadCode)) continue;
        if (filterLeadsByOwnBranch && !leadCodesWhereOwnParticipates.has(leadCode)) {
            continue;
        }
        allCodes.push(leadCode);
        const branch = collectBranch(root);
        const ownNode = ownItemTrim ? branch.find((j) => jsTupleOwnJobMatch(ownItemTrim, j.ItemName)) : null;
        const preferExternal = !ownNode;

        const rootNorm = normalize(stripLeadPrefix(String(root.ItemName || '')));
        const isOwnThisLeadRoot = Boolean(ownNorm && rootNorm && ownNorm === rootNorm && extList.length > 0);

        let label = '';
        if (isOwnThisLeadRoot) {
            label = extList
                .map((c) => jsStripCustomerLeadSuffix(String(c || '').replace(/,\s*$/, '').trim()))
                .filter(Boolean)
                .join(', ');
        }
        if (!label && ownNode && ownNode.ParentID != null && ownNode.ParentID !== '' && ownNode.ParentID !== 0 && ownNode.ParentID !== '0') {
            const par = enqJobs.find((pj) => String(pj.ID) === String(ownNode.ParentID));
            if (par) {
                label = stripLeadPrefix(String(par.ItemName || '')).trim() || String(par.ItemName || '').trim();
            }
        }
        if (!label) {
            const prow = bestPriceRowForLead(leadCode, preferExternal);
            if (prow && isExternalPricingCustomer(prow.CustomerName)) {
                label = jsStripCustomerLeadSuffix(String(prow.CustomerName || '').trim());
            }
        }
        if (!label) {
            const prow = bestPriceRowForLead(leadCode, false);
            if (prow) {
                const cn = jsStripCustomerLeadSuffix(String(prow.CustomerName || '').trim());
                const cnN = normalize(cn);
                if (cn && cnN !== internalCustomerNorm && !jobSet.has(cnN)) {
                    label = cn;
                }
            }
        }
        if (!label) {
            label = stripLeadPrefix(String(root.ItemName || '')).trim() || String(root.ItemName || '').trim();
        }
        leadLabelsByCode[leadCode] = label;

        const prow2 = bestPriceRowForLead(leadCode, preferExternal);
        pvLeadByCode[leadCode] = prow2 && String(prow2.LeadJobName || '').trim()
            ? String(prow2.LeadJobName).trim()
            : leadCode;
    }

    const extraFromPrices = new Set();
    for (const p of enqPrices || []) {
        if (!isBasePricePricingRow(p) || parseFloat(p.Price || 0) <= 0) continue;
        const c = extractLCodeFromLeadJobName(p.LeadJobName || '');
        if (c && !leadLabelsByCode[c]) extraFromPrices.add(c);
    }
    for (const c of extraFromPrices) {
        if (filterLeadsByOwnBranch && !leadCodesWhereOwnParticipates.has(c)) {
            continue;
        }
        allCodes.push(c);
        const rows = priceRowsForLead(c);
        const ext = rows.find((p) => isExternalPricingCustomer(p.CustomerName));
        const prow = ext || rows.find((p) => jsTupleOwnJobMatch(pendingOwnItem, p.EnquiryForItem)) || rows[0];
        if (prow) {
            if (ext) {
                leadLabelsByCode[c] = jsStripCustomerLeadSuffix(String(ext.CustomerName || '').trim());
            } else {
                leadLabelsByCode[c] =
                    jsStripCustomerLeadSuffix(String(prow.CustomerName || '').trim()) || c;
            }
            pvLeadByCode[c] = String(prow.LeadJobName || '').trim() || c;
        } else {
            leadLabelsByCode[c] = c;
            pvLeadByCode[c] = c;
        }
    }

    const allLeadCodesSorted = [...new Set(allCodes)].sort((a, b) => lCodeSortKey(a) - lCodeSortKey(b));
    /** EnquiryFor IDs under each visual root for that lead — used to roll up Base Price per external customer (own job + subjobs). */
    const subtreeJobIdsByLeadCode = {};
    for (const c of allLeadCodesSorted) {
        const codeU = String(c || '').trim().toUpperCase();
        const rootFound = (roots || []).find(
            (r) => String(rootLabelMap[r.ID] || '').trim().toUpperCase() === codeU
        );
        if (!rootFound) {
            subtreeJobIdsByLeadCode[c] = new Set();
            continue;
        }
        if (filterLeadsByOwnBranch && !leadCodesWhereOwnParticipates.has(codeU)) {
            subtreeJobIdsByLeadCode[c] = new Set();
            continue;
        }
        subtreeJobIdsByLeadCode[c] = new Set(collectBranch(rootFound).map((j) => String(j.ID)));
    }
    return {
        allLeadCodesSorted,
        leadLabelsByCode,
        pvLeadByCode,
        ownBranchLeadCodeSet: filterLeadsByOwnBranch ? leadCodesWhereOwnParticipates : null,
        subtreeJobIdsByLeadCode,
    };
}

/**
 * One line per lead job (L1, L2, …): "{Parent or customer} - L# (QuoteNo - date time) BD …" or "(Not Quoted)".
 * @param {object|null} lineCtx from buildListQuoteLeadContext (optional; legacy behaviour if null).
 */
function buildEnquiryLeadQuoteDetailLines(requestNo, groupRows, allQuotes, pricesForReq, lineCtx) {
    const req = String(requestNo || '').trim();
    if (!req || !Array.isArray(groupRows) || groupRows.length === 0) return [];
    const quotesForReq = (allQuotes || []).filter((q) => String(q.RequestNo ?? '').trim() === req);
    const ownBranchLeadSet =
        lineCtx && lineCtx.ownBranchLeadCodeSet instanceof Set ? lineCtx.ownBranchLeadCodeSet : null;
    const leadAllowed = (code) => {
        const c = String(code || '').trim().toUpperCase();
        if (!c) return false;
        if (!ownBranchLeadSet) return true;
        return ownBranchLeadSet.has(c);
    };

    /** ToName / customer for label when ListQuoteDetailToName is blank on merged rows. */
    const displayCustomerLabelForLeadRow = (g) => {
        const raw =
            String(g.ListQuoteDetailToName || '').trim() ||
            String(g.ListPendingCustomerName ?? g.listpendingcustomername ?? '').trim() ||
            String(g.CustomerName || '')
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean)[0] ||
            '';
        const stripped = jsStripCustomerLeadSuffix(raw);
        return stripped || raw || '—';
    };

    const g0 = groupRows[0];
    const leadToRow = new Map();

    if (lineCtx && Array.isArray(lineCtx.allLeadCodesSorted) && lineCtx.allLeadCodesSorted.length > 0) {
        for (const code of lineCtx.allLeadCodesSorted) {
            if (!leadAllowed(code)) continue;
            const specific = groupRows.find(
                (r) => extractLCodeFromLeadJobName(r.ListPendingLeadJobName ?? r.listpendingleadjobname ?? '') === code
            );
            const base = specific || g0;
            let pvLead = '';
            if (specific) {
                pvLead = String(specific.ListPendingLeadJobName ?? specific.listpendingleadjobname ?? '').trim();
            }
            if (!pvLead && lineCtx.pvLeadByCode && lineCtx.pvLeadByCode[code]) {
                pvLead = String(lineCtx.pvLeadByCode[code]).trim();
            }
            if (!pvLead) {
                const gen = String(g0.ListPendingLeadJobName ?? g0.listpendingleadjobname ?? '').trim();
                if (gen && extractLCodeFromLeadJobName(gen) === code) {
                    pvLead = gen;
                }
            }
            if (!pvLead) pvLead = code;
            /** Per-lead customer/label for ToName matching (g0 alone is enquiry-wide and misses e.g. BEMCO on L3). */
            const leadLabelRaw =
                lineCtx.leadLabelsByCode && String(lineCtx.leadLabelsByCode[code] || '').trim()
                    ? String(lineCtx.leadLabelsByCode[code]).trim()
                    : '';
            const leadLabelPrimary = leadLabelRaw.split(',')[0].trim();
            const leadLabelForCust = leadLabelPrimary ? jsStripCustomerLeadSuffix(leadLabelPrimary) : '';
            leadToRow.set(code, {
                ...base,
                ListPendingLeadJobName: pvLead,
                ...(leadLabelForCust
                    ? {
                          ListQuoteDetailToName: leadLabelForCust,
                          ListPendingCustomerName: leadLabelForCust,
                      }
                    : {}),
            });
        }
    }

    for (const g of groupRows) {
        const code = extractLCodeFromLeadJobName(g.ListPendingLeadJobName ?? g.listpendingleadjobname ?? '');
        if (!code) continue;
        if (!leadAllowed(code)) continue;
        if (!leadToRow.has(code)) leadToRow.set(code, g);
    }

    for (const p of pricesForReq || []) {
        if (!isBasePricePricingRow(p)) continue;
        const priced = parseFloat(p.Price || 0) > 0;
        const declined = isDeclineToQuotePricingRow(p);
        if (!priced && !declined) continue;
        const code = extractLCodeFromLeadJobName(p.LeadJobName || '');
        if (!code || leadToRow.has(code)) continue;
        if (!leadAllowed(code)) continue;
        let matchedG = null;
        for (const g of groupRows) {
            const own = String(g.ListPendingOwnJobItem ?? g.listpendingownjobitem ?? '').trim();
            const cust =
                String(g.ListQuoteDetailToName ?? '').trim() ||
                String(g.ListPendingCustomerName ?? g.listpendingcustomername ?? '').trim() ||
                displayCustomerLabelForLeadRow(g);
            if (jsTupleOwnJobMatch(own, p.EnquiryForItem) && jsTupleCustomerMatch(cust, p.CustomerName)) {
                matchedG = g;
                break;
            }
        }
        if (!matchedG) {
            for (const g of groupRows) {
                const own = String(g.ListPendingOwnJobItem ?? g.listpendingownjobitem ?? '').trim();
                if (jsTupleOwnJobMatch(own, p.EnquiryForItem)) {
                    matchedG = g;
                    break;
                }
            }
        }
        if (!matchedG) continue;
        leadToRow.set(code, {
            ListQuoteDetailToName: String(p.CustomerName || '').trim(),
            ListPendingCustomerName:
                matchedG.ListPendingCustomerName ?? matchedG.listpendingcustomername ?? '',
            CustomerName: matchedG.CustomerName ?? '',
            ListPendingLeadJobName: p.LeadJobName,
            ListPendingOwnJobItem: matchedG.ListPendingOwnJobItem ?? matchedG.listpendingownjobitem ?? '',
            ListQuoteUnderRefTotal: null,
            ListMultiLeadQuoteRefs: null,
            ListQuoteRef: '',
            ListQuoteDate: null,
        });
    }

    const codes = [...leadToRow.keys()].sort((a, b) => lCodeSortKey(a) - lCodeSortKey(b));
    const mergedRollupRefs = mergeMultiLeadQuoteRefEntries(groupRows);
    const lines = [];
    for (const code of codes) {
        const g = leadToRow.get(code);
        const namePartRaw =
            lineCtx &&
            lineCtx.leadLabelsByCode &&
            String(lineCtx.leadLabelsByCode[code] || '').trim()
                ? String(lineCtx.leadLabelsByCode[code]).trim()
                : displayCustomerLabelForLeadRow(g);
        const namePart =
            jsStripCustomerLeadSuffix(String(namePartRaw || '').trim()) || String(namePartRaw || '').trim();
        const pvOwnRaw = String(g.ListPendingOwnJobItem ?? g.listpendingownjobitem ?? '').trim();
        const pvOwn =
            pvOwnRaw ||
            String(g0.ListPendingOwnJobItem ?? g0.listpendingownjobitem ?? '').trim();
        const pvLead = String(g.ListPendingLeadJobName ?? g.listpendingleadjobname ?? '').trim();
        const pvCustForMatch =
            String(g.ListQuoteDetailToName || '').trim() ||
            String(g.ListPendingCustomerName ?? g.listpendingcustomername ?? '').trim() ||
            displayCustomerLabelForLeadRow(g);
        const splitCustomers = [
            ...new Set(
                String(namePartRaw || '')
                    .split(',')
                    .map((x) => jsStripCustomerLeadSuffix(x.trim()))
                    .filter(Boolean)
            ),
        ];
        const custLineNames =
            splitCustomers.length > 0
                ? splitCustomers
                : namePart && namePart !== '—'
                  ? [namePart]
                  : [displayCustomerLabelForLeadRow(g)];

        const subSet =
            lineCtx &&
            lineCtx.subtreeJobIdsByLeadCode &&
            lineCtx.subtreeJobIdsByLeadCode[code] instanceof Set
                ? lineCtx.subtreeJobIdsByLeadCode[code]
                : null;

        for (const custName of custLineNames) {
            const label = `${custName} - ${code}`;
            /**
             * When one L# lists several externals ("Nass, Alkomed"), each line must resolve quotes for that
             * customer only. Passing namePartRaw / full CustomerName into candidates puts every name in `uniq`,
             * so `matchesAnyCustomer` wrongly accepts Nass's quote for the Alkomed row.
             */
            const multiCustOnLead = custLineNames.length > 1;
            const customerCandidates = multiCustOnLead
                ? [custName]
                : [
                      custName,
                      pvCustForMatch,
                      namePart,
                      namePartRaw,
                      String(g.CustomerName || '')
                          .split(',')
                          .map((x) => x.trim())
                          .filter(Boolean)[0] || '',
                  ];

            let qt = pickQuoteRowFromMultiLeadRefs(mergedRollupRefs, code, quotesForReq, pvLead);
            if (
                qt &&
                String(qt.QuoteNumber || '').trim() &&
                !jsTupleCustomerMatch(quoteRowToName(qt), custName)
            ) {
                qt = null;
            }
            if (
                qt &&
                String(qt.QuoteNumber || '').trim() &&
                String(pvOwn || '').trim() &&
                !jsTupleOwnJobMatch(qt.OwnJob, pvOwn)
            ) {
                qt = null;
            }
            if (!qt || !String(qt.QuoteNumber || '').trim()) {
                qt = findQuoteRowForLeadLine(quotesForReq, pvOwn, pvLead, customerCandidates, code);
            }
            if ((!qt || !String(qt.QuoteNumber || '').trim()) && lineCtx && lineCtx.pvLeadByCode && lineCtx.pvLeadByCode[code]) {
                const altLead = String(lineCtx.pvLeadByCode[code]).trim();
                if (altLead && altLead !== pvLead) {
                    let altQt = pickQuoteRowFromMultiLeadRefs(mergedRollupRefs, code, quotesForReq, altLead);
                    if (
                        altQt &&
                        String(altQt.QuoteNumber || '').trim() &&
                        !jsTupleCustomerMatch(quoteRowToName(altQt), custName)
                    ) {
                        altQt = null;
                    }
                    if (
                        altQt &&
                        String(altQt.QuoteNumber || '').trim() &&
                        String(pvOwn || '').trim() &&
                        !jsTupleOwnJobMatch(altQt.OwnJob, pvOwn)
                    ) {
                        altQt = null;
                    }
                    qt =
                        altQt ||
                        findQuoteRowForLeadLine(quotesForReq, pvOwn, altLead, customerCandidates, code);
                }
            }
            let textLine;
            let bdTotal = null;
            let preparedBy = '';
            let declinedToQuote = false;
            let declineUpdatedAt = null;
            const declinedPr = findDeclinedPricingForLeadLine(
                pricesForReq,
                pvOwn,
                pvLead,
                customerCandidates,
                code,
                subSet
            );
            if (declinedPr) {
                declinedToQuote = true;
                declineUpdatedAt = declinedPr.UpdatedAt ?? declinedPr.updatedAt ?? null;
                textLine = `${label} (Decline to Quote)`;
            } else if (qt && String(qt.QuoteNumber || '').trim()) {
                textLine = `${label} (${String(qt.QuoteNumber).trim()} - ${fmtRowDetailDate(qt.QuoteDate)})`;
                const ta = parseFloat(qt.TotalAmount);
                if (!Number.isNaN(ta) && ta > 0) {
                    bdTotal = ta;
                }
                preparedBy =
                    String(qt.PreparedBy ?? qt.preparedBy ?? '').trim() ||
                    preparedByFromQuoteNumber(quotesForReq, req, qt.QuoteNumber);
            } else {
                textLine = `${label} (Not Quoted)`;
            }
            // Do not show a BD roll-up from pricing alone when this customer has no saved quote (avoids Nass-like amounts on Alkomed).
            if (subSet && subSet.size && qt && String(qt.QuoteNumber || '').trim()) {
                const rolled = sumCustomerBasePricingInLeadSubtree(pricesForReq, code, custName, subSet);
                if (rolled > 0) {
                    bdTotal = rolled;
                }
            }
            lines.push({
                textLine,
                declinedToQuote,
                bdTotal: bdTotal != null && bdTotal > 0 ? bdTotal : null,
                preparedBy,
                quoteDate:
                    qt && qt.QuoteDate != null && qt.QuoteDate !== ''
                        ? qt.QuoteDate
                        : declineUpdatedAt != null && declineUpdatedAt !== ''
                          ? declineUpdatedAt
                          : null,
            });
        }
    }
    return lines;
}

/** One compact display line per pending tuple (ToName (ref - date) + optional BD on same row). */
function buildQuoteDetailLineForRow(g) {
    const toName = String(g.ListQuoteDetailToName || '').trim() || '—';
    const parts = [];
    if (Array.isArray(g.ListMultiLeadQuoteRefs) && g.ListMultiLeadQuoteRefs.length > 0) {
        for (const line of g.ListMultiLeadQuoteRefs) {
            parts.push(`${toName} (${line.quoteNumber} - ${fmtRowDetailDate(line.quoteDate)})`);
        }
    } else if (g.ListQuoteRef) {
        parts.push(`${toName} (${g.ListQuoteRef} - ${fmtRowDetailDate(g.ListQuoteDate)})`);
    } else {
        parts.push(`${toName} (—)`);
    }
    const textLine = parts.join(' · ');
    const bd =
        g.ListQuoteUnderRefTotal != null && !Number.isNaN(parseFloat(g.ListQuoteUnderRefTotal))
            ? parseFloat(g.ListQuoteUnderRefTotal)
            : null;
    const bdOut = bd != null && bd > 0 ? bd : null;
    return { textLine, bdTotal: bdOut };
}

function mergePendingRowsByRequestNo(rows, allQuotes, allPrices) {
    const consumed = new Set();
    const out = [];
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!isPendingPvListRow(row)) {
            out.push(enrichRowPreparedBy(row, allQuotes));
            continue;
        }
        const req = String(row.RequestNo ?? '').trim();
        const ck = `pv:${req}`;
        if (consumed.has(ck)) continue;
        consumed.add(ck);
        const group = rows.filter((r) => isPendingPvListRow(r) && String(r.RequestNo ?? '').trim() === req);
        const pricesForEnq = (allPrices || []).filter((p) => String(p.RequestNo ?? '').trim() === req);
        if (group.length === 1) {
            const r0 = group[0];
            const lineCtx = r0.ListQuoteLeadContext ?? null;
            const leadLines = buildEnquiryLeadQuoteDetailLines(req, [r0], allQuotes, pricesForEnq, lineCtx);
            const rollLines = rollupStatusFromLeadDetailLines(leadLines);
            out.push(
                enrichRowPreparedBy(
                    {
                        ...r0,
                        ListQuoteDetailLines: leadLines,
                        ListQuoteRollupStatus: rollLines ?? r0.ListQuoteRollupStatus,
                    },
                    allQuotes
                )
            );
            continue;
        }
        const base = { ...group[0] };
        base.ListMergedPendingPvIds = group.map((g) => g.ListPendingPvId ?? g.listpendingpvid).filter((x) => x != null && x !== '');
        base.SubJobPrices = uniqueSubjobPriceSegments(group);
        base.CustomerName = [...new Set(group.map((g) => String(g.CustomerName || '').trim()).filter(Boolean))].join(', ') || base.CustomerName;
        base.ListMultiLeadQuoteRefs = mergeMultiLeadQuoteRefEntries(group);
        /** One `ListQuoteLeadContext` is built per pending tuple (own job). Merging HVAC + Electrical must not keep only row[0]'s branch — drop ctx so each tuple row drives its own lead lines. */
        const distinctPendingOwns = new Set(
            group
                .map((g) => String(g.ListPendingOwnJobItem ?? g.listpendingownjobitem ?? '').trim().toLowerCase())
                .filter(Boolean)
        );
        const mergeLineCtx =
            distinctPendingOwns.size <= 1 ? group[0].ListQuoteLeadContext ?? null : null;
        base.ListQuoteDetailLines = buildEnquiryLeadQuoteDetailLines(req, group, allQuotes, pricesForEnq, mergeLineCtx);
        base.ListQuoteRollupStatus =
            rollupStatusFromLeadDetailLines(base.ListQuoteDetailLines) ||
            mergeRollupStatuses(group.map((g) => g.ListQuoteRollupStatus));
        const allRefs = [];
        for (const g of group) {
            if (g.ListQuoteRef) allRefs.push(String(g.ListQuoteRef));
            if (Array.isArray(g.ListMultiLeadQuoteRefs)) {
                for (const e of g.ListMultiLeadQuoteRefs) {
                    if (e.quoteNumber) allRefs.push(String(e.quoteNumber));
                }
            }
        }
        base.ListQuoteRef = [...new Set(allRefs.map((s) => s.trim()).filter(Boolean))].join(' | ');
        base.ListWorkflowNo =
            group.map((g) => String(g.ListWorkflowNo || '').trim()).find(Boolean) ||
            String(base.ListWorkflowNo || '').trim();
        let maxT = 0;
        for (const g of group) {
            const t = g.ListQuoteDate ? new Date(g.ListQuoteDate).getTime() : 0;
            if (!Number.isNaN(t) && t > maxT) maxT = t;
        }
        base.ListQuoteDate = maxT > 0 ? new Date(maxT) : null;
        const rollNums = group
            .map((g) => parseFloat(g.ListQuoteUnderRefTotal))
            .filter((n) => !Number.isNaN(n) && n > 0);
        base.ListQuoteUnderRefTotal = rollNums.length ? Math.max(...rollNums) : null;
        base.ListQuoteDetailToName = '';
        const prepSet = new Set();
        for (const g of group) {
            String(g.ListPreparedBy ?? g.listpreparedby ?? '')
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean)
                .forEach((x) => prepSet.add(x));
        }
        base.ListPreparedBy = Array.from(prepSet).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).join(', ');
        out.push(enrichRowPreparedBy(base, allQuotes));
    }
    return out;
}

function buildMultiLeadQuoteRollup(enqRequestNo, pvOwn, pvCust, allPrices, allQuotes, enqJobs) {
    const reqStr = String(enqRequestNo ?? '').trim();
    const own = String(pvOwn || '').trim();
    const cust = String(pvCust || '').trim();
    if (!reqStr || !own || !cust) return null;

    let priceRows = (allPrices || []).filter(
        (p) =>
            String(p.RequestNo ?? '')
                .trim() === reqStr &&
            isBasePricePricingRow(p) &&
            (parseFloat(p.Price || 0) > 0 || isDeclineToQuotePricingRow(p)) &&
            jsTupleOwnJobMatch(own, p.EnquiryForItem) &&
            jsTupleCustomerMatch(cust, p.CustomerName)
    );
    if (enqJobs && enqJobs.length) {
        priceRows = filterPriceRowsToOwnJobLeadRoot(priceRows, enqJobs, reqStr, own);
    }
    const leadNames = [
        ...new Set(priceRows.map((p) => String(p.LeadJobName || '').trim()).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    if (leadNames.length <= 1) return null;

    const quotesForReq = (allQuotes || []).filter((q) => String(q.RequestNo ?? '').trim() === reqStr);
    const entries = [];
    const custCands = [cust]
        .concat(String(cust || '').split(',').map((x) => x.trim()).filter(Boolean))
        .map((c) => jsStripCustomerLeadSuffix(String(c || '').trim()))
        .filter(Boolean);
    let nResolved = 0;
    for (const leadName of leadNames) {
        const lc = extractLCodeFromLeadJobName(leadName);
        const best =
            findQuoteRowForLeadLine(quotesForReq, own, leadName, custCands, lc) ||
            pickLatestQuoteRow(quotesForReq.filter((q) => quoteRowMatchesTuple(q, own, leadName, cust)));
        const declined = priceRows.some(
            (p) =>
                isDeclineToQuotePricingRow(p) &&
                pricingRowMatchesLeadLine(p, lc, leadName) &&
                jsTupleCustomerMatch(cust, p.CustomerName)
        );
        if (best && String(best.QuoteNumber || '').trim()) {
            entries.push({
                leadName,
                quoteNumber: String(best.QuoteNumber).trim(),
                quoteDate: best.QuoteDate,
                preparedBy: String(best.PreparedBy ?? best.preparedBy ?? '').trim(),
            });
            nResolved += 1;
        } else if (declined) {
            nResolved += 1;
        }
    }
    const nTotal = leadNames.length;
    let status;
    if (nResolved === 0) status = 'None Quoted';
    else if (nResolved < nTotal) status = 'Partial Quoted';
    else status = 'All Quoted';

    const dates = entries
        .map((e) => (e.quoteDate ? new Date(e.quoteDate).getTime() : 0))
        .filter((t) => t > 0);
    const listQuoteDateForSort = dates.length ? new Date(Math.max(...dates)) : null;

    return { status, entries, listQuoteDateForSort, leadNames };
}

async function fetchWorkflowNoLookup(sql, requestNosCsv) {
    const byReqQuote = new Map();
    const byReq = new Map();
    if (!requestNosCsv) return { byReqQuote, byReq };
    try {
        const res = await sql.query(`
            SELECT RequestNo, QuoteNumber, QuoteRef, WorkflowNo
            FROM QuoteApprovalSteps
            WHERE RequestNo IN (${requestNosCsv})
              AND LTRIM(RTRIM(ISNULL(WorkflowNo, N''))) <> N''
            ORDER BY ID DESC
        `);
        for (const row of res.recordset || []) {
            const rn = String(row.RequestNo || '').trim();
            const wf = String(row.WorkflowNo || '').trim();
            if (!rn || !wf) continue;
            const qn = String(row.QuoteNumber || row.QuoteRef || '').trim().toLowerCase();
            if (qn && !byReqQuote.has(`${rn}\t${qn}`)) {
                byReqQuote.set(`${rn}\t${qn}`, wf);
            }
            if (!byReq.has(rn)) byReq.set(rn, wf);
        }
    } catch {
        /* QuoteApprovalSteps may be missing on older databases */
    }
    return { byReqQuote, byReq };
}

function resolveListWorkflowNo(lookup, requestNo, listQuoteRef) {
    const rn = String(requestNo || '').trim();
    if (!rn) return '';
    const refRaw = String(listQuoteRef || '').trim();
    const tryRef = (ref) => {
        const key = `${rn}\t${String(ref || '').trim().toLowerCase()}`;
        return lookup.byReqQuote.get(key) || '';
    };
    if (refRaw) {
        for (const part of refRaw.split('|')) {
            const hit = tryRef(part);
            if (hit) return hit;
        }
    }
    return lookup.byReq.get(rn) || '';
}

/**
 * Maps raw enquiry rows from list/pending / list/search SQL into the shape the Quote UI expects.
 */
async function mapQuoteListingRows(sql, enquiries, userEmail, accessCtx, sessionDivision = '') {
    if (!enquiries || enquiries.length === 0) return [];
    const sessionDivTrim = (sessionDivision || '').toString().trim();
    // One UI row per pending pricing value: prefer EnquiryPricingValues.ID (same PV row can join multiple EF rows).
    // Quoted list rows have no ListPendingPvId — fall back to tuple text; then only RequestNo for legacy rows.
    const pendingTupleKey = (e) => {
        const req = String(e.RequestNo ?? '').trim();
        const pvRaw = e.ListPendingPvId ?? e.listpendingpvid;
        const pvNum = pvRaw != null && pvRaw !== '' ? Number(pvRaw) : 0;
        if (!Number.isNaN(pvNum) && pvNum > 0) {
            return `${req}\tpv:${pvNum}`;
        }
        return [
            req,
            String(e.ListPendingOwnJobItem ?? e.listpendingownjobitem ?? '').trim().toLowerCase(),
            String(e.ListPendingLeadJobName ?? e.listpendingleadjobname ?? '').trim().toLowerCase(),
            String(e.ListPendingCustomerName ?? e.listpendingcustomername ?? '').trim().toLowerCase(),
        ].join('\t');
    };
    const seenTuple = new Set();
    const enquiriesToMap = [];
    for (const row of enquiries) {
        const k = pendingTupleKey(row);
        if (seenTuple.has(k)) continue;
        seenTuple.add(k);
        enquiriesToMap.push(row);
    }

    const userDepartment = accessCtx ? accessCtx.userDepartment : '';
    /** When the Quote UI sends a Division dropdown value, own-job rollups and customer-column scope use it — not profile Department. */
    const ownJobScopeDepartment = sessionDivTrim || userDepartment || '';
    const requestNos = enquiriesToMap.map(e => `'${e.RequestNo}'`).join(',');

    // Fetch Jobs (CCMailIds required for anchor scope — same as pricing)
        const jobsRes = await sql.query(`
            SELECT EF.RequestNo, EF.ID, EF.ParentID, EF.ItemName, EF.LeadJobCode,
                   MEF.CCMailIds AS CCMailIds, MEF.DepartmentName AS DepartmentName
            FROM EnquiryFor EF
            LEFT JOIN Master_EnquiryFor MEF ON (EF.ItemName = MEF.ItemName OR EF.ItemName LIKE '% - ' + MEF.ItemName)
            WHERE EF.RequestNo IN (${requestNos})
        `);
        const allJobsRaw = jobsRes.recordset || [];
        const seenJobKeys = new Set();
        const allJobs = [];
        for (const j of allJobsRaw) {
            const jid = j.ID ?? j.id;
            if (jid == null) continue;
            const k = `${j.RequestNo}:${jid}`;
            if (seenJobKeys.has(k)) continue;
            seenJobKeys.add(k);
            allJobs.push(j);
        }

        // Fetch Prices using the same matching rule as the validated SSMS query:
        // match current EnquiryFor row by (EnquiryForID) OR (trimmed EnquiryForItem = trimmed ItemName).
        const pricesRes = await sql.query(`
            SELECT
                v.RequestNo,
                v.OptionID,
                v.EnquiryForID,
                v.EnquiryForItem,
                v.Price,
                v.UpdatedAt,
                v.CustomerName,
                v.LeadJobName,
                v.PriceOption,
                v.Quotingornot,
                m.MatchedEnquiryForId,
                m.MatchedItemName,
                m.MatchedParentId
            FROM EnquiryPricingValues v
            OUTER APPLY (
                SELECT TOP 1
                    ef.ID AS MatchedEnquiryForId,
                    ef.ItemName AS MatchedItemName,
                    ef.ParentID AS MatchedParentId
                FROM EnquiryFor ef
                WHERE ef.RequestNo = v.RequestNo
                  AND (
                        (v.EnquiryForID IS NOT NULL AND v.EnquiryForID <> 0 AND v.EnquiryForID = ef.ID)
                     OR (
                            LTRIM(RTRIM(ISNULL(v.EnquiryForItem, N''))) <> N''
                        AND LTRIM(RTRIM(v.EnquiryForItem)) = LTRIM(RTRIM(ef.ItemName))
                        )
                    )
                ORDER BY
                    CASE WHEN v.EnquiryForID IS NOT NULL AND v.EnquiryForID <> 0 AND v.EnquiryForID = ef.ID THEN 0 ELSE 1 END,
                    ef.ID
            ) m
            WHERE v.RequestNo IN (${requestNos})
        `);
        const allPrices = pricesRes.recordset;

        // Fetch external customers from transactional table (authoritative source)
        const enquiryCustomersRes = await sql.query(`
            SELECT RequestNo, CustomerName
            FROM EnquiryCustomer
            WHERE RequestNo IN (${requestNos})
        `);
        const allEnquiryCustomers = enquiryCustomersRes.recordset;

        const quotesRes = await sql.query(`
            SELECT RequestNo, QuoteNumber, QuoteNo, RevisionNo, QuoteDate, OwnJob, LeadJob, ToName, PreparedBy, TotalAmount
            FROM EnquiryQuotes
            WHERE RequestNo IN (${requestNos})
        `);
        const allQuotes = quotesRes.recordset || [];

        const workflowLookup = await fetchWorkflowNoLookup(sql, requestNos);

        // Map subjob prices for each enquiry
        const mappedEnquiries = enquiriesToMap.map(enq => {
            const enqRequestNo = enq.RequestNo?.toString().trim();
            if (!enqRequestNo) return null;

            const enqJobs = allJobs.filter(j => j.RequestNo?.toString().trim() == enqRequestNo);
            const enqPrices = allPrices.filter(p => p.RequestNo?.toString().trim() == enqRequestNo);
            const pendingOwnFromTupleRaw = (enq.ListPendingOwnJobItem ?? enq.listpendingownjobitem ?? '').toString().trim();
            if (sessionDivTrim && pendingOwnFromTupleRaw) {
                const divNorm = normalizeDeptKey(sessionDivTrim);
                const ownMatchesDivision = enqJobs.some((j) => {
                    if (!jsTupleOwnJobMatch(pendingOwnFromTupleRaw, j.ItemName)) return false;
                    const depNorm = normalizeDeptKey(j.DepartmentName || '');
                    if (depNorm) return depNorm === divNorm;
                    // Fallback for rows with missing DepartmentName: match by item-name normalization.
                    return normalizeDeptKey(j.ItemName || '') === divNorm;
                });
                if (!ownMatchesDivision) return null;
            }

            // Build hierarchy
            const childrenMap = {};
            enqJobs.forEach(j => {
                if (j.ParentID && j.ParentID != '0') {
                    if (!childrenMap[j.ParentID]) childrenMap[j.ParentID] = [];
                    childrenMap[j.ParentID].push(j);
                }
            });

            const roots = enqJobs.filter(j => !j.ParentID || j.ParentID == '0' || j.ParentID == 0);
            roots.sort((a, b) => a.ID - b.ID);
            
            // Map each root to an L-code: DB LeadJobCode, else parse from ItemName ("L2 - …"), else L1… fallback.
            const rootLabelMap = {};
            const usedCodes = new Set();
            roots.forEach((r, idx) => {
                let code = (r.LeadJobCode || '').trim().toUpperCase();
                if (!code || !/^L\d+$/.test(code)) {
                    code = extractLCodeFromLeadJobName(r.ItemName || '') || '';
                }
                if (!code) {
                    let n = idx + 1;
                    code = `L${n}`;
                    while (usedCodes.has(code) && n < 99) {
                        n += 1;
                        code = `L${n}`;
                    }
                }
                if (usedCodes.has(code)) {
                    let n = 1;
                    let alt = `L${n}`;
                    while (usedCodes.has(alt) && n < 99) {
                        n += 1;
                        alt = `L${n}`;
                    }
                    code = alt;
                }
                usedCodes.add(code);
                rootLabelMap[r.ID] = code;
            });

            const flatList = [];
            const traverse = (job, level) => {
                flatList.push({ ...job, level });
                const children = childrenMap[job.ID] || [];
                children.sort((a, b) => a.ID - b.ID);
                children.forEach(child => traverse(child, level + 1));
            };
            roots.forEach(root => traverse(root, 0));

            // Filter flatList by ScopedJobIDs â€” prefer JS anchors (aligned with pricing) when user is non-admin
            let scopedJobIDsStr = (enq.ScopedJobIDs || '').toString().split(',').map(id => id.trim()).filter(Boolean);
            if (userEmail && accessCtx && accessCtx.user && !accessCtx.isAdmin) {
                const anchors = sessionDivTrim
                    ? getPricingAnchorJobsForDivision(enqJobs, accessCtx, userEmail, sessionDivTrim)
                    : getPricingAnchorJobs(enqJobs, accessCtx, userEmail);
                if (anchors.length > 0) {
                    const visibleIds = expandVisibleJobIdsFromAnchors(anchors, enqJobs);
                    scopedJobIDsStr = Array.from(visibleIds);
                }
                // If no JS anchors, keep SQL ScopedJobIDs â€” pending query already enforced ConcernedSE + division access
            }
            if (scopedJobIDsStr.length === 0 && roots.length > 0) {
                scopedJobIDsStr = roots.map((r) => String(r.ID));
            }
            const scopedJobIDsSet = new Set(scopedJobIDsStr);
            const scopedJobs = flatList.filter(j => scopedJobIDsSet.has(j.ID.toString()));

            // Fix childrenMap keys to be strings for consistent lookup
            const stringChildrenMap = {};
            Object.entries(childrenMap).forEach(([k, v]) => {
                stringChildrenMap[k.toString()] = v;
            });

            // Identify all IDs that are descendants of scoped IDs
            const validIDs = new Set();
            const collectDescendants = (id) => {
                const idStr = id.toString();
                if (validIDs.has(idStr)) return;
                validIDs.add(idStr);
                const children = stringChildrenMap[idStr] || [];
                children.forEach(c => collectDescendants(c.ID));
            };
            scopedJobIDsStr.forEach(id => collectDescendants(id));

            const filteredFlatList = flatList.filter(job => validIDs.has(job.ID.toString()));

            // Indentation adjustment: use the minimum level among visible jobs (to make first job L1)
            let minLevel = 0;
            if (filteredFlatList.length > 0) {
                minLevel = Math.min(...filteredFlatList.map(j => j.level || 0));
            }

            const normalize = str => str.toLowerCase().replace(/[^a-z0-9]/g, '');

            // Identify Root and Job Names for Aggregation
            const rootJob = enqJobs.find(j => !j.ParentID || j.ParentID == '0' || j.ParentID == 0);
            const internalCustomer = rootJob ? rootJob.ItemName.trim() : 'Internal';
            const internalCustomerNorm = normalize(internalCustomer);
            const jobNameSetNorm = new Set(enqJobs.map(j => normalize(j.ItemName)));
            const stripLeadPrefix = (s) => String(s || '').replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
            const withLeadCode = (name, code) => {
                const base = (name || '').replace(/,\s*$/, '').trim();
                const c = String(code || '').trim().toUpperCase();
                if (!base) return '';
                if (!c || !/^L\d+$/.test(c)) return base;
                return `${base} (${c})`;
            };

            // External customers from EnquiryCustomer table (authoritative)
            let externalCustomers = allEnquiryCustomers
                .filter(c => c.RequestNo?.toString().trim() == enqRequestNo)
                .map(c => (c.CustomerName || '').trim())
                .filter(Boolean);
            externalCustomers = [...new Set(externalCustomers.map(c => c.replace(/,\s*$/, '').trim()))];

            // Pre-calculate Individual (Self) Prices (Latest Only) - STRICTLY Internal
            const selfPrices = {};
            const selfPriceCustomers = {};
            const updateDates = {};
            flatList.forEach(job => {
                const normOpt = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
                const isBasePrice = (p) => {
                    const po = p.PriceOption ?? p.priceOption ?? p.priceoption;
                    return normOpt(po) === 'base price';
                };

                const idMatches = enqPrices.filter(p => {
                    if (!isBasePrice(p)) return false;
                    const matchedId = p.MatchedEnquiryForId ?? p.matchedEnquiryForId ?? p.matchedenquiryforid;
                    if (matchedId != null && matchedId !== '' && String(matchedId) !== '0') {
                        return String(matchedId) === String(job.ID);
                    }
                    return p.EnquiryForID && p.EnquiryForID != 0 && p.EnquiryForID != '0' && String(p.EnquiryForID) === String(job.ID);
                });

                // Fallback to ItemName only for legacy rows that have no usable IDs.
                // If a row has MatchedEnquiryForId/EnquiryForID, keep strict ID matching
                // to avoid same-name collisions across branches.
                let finalMatches = idMatches;
                if (finalMatches.length === 0) {
                    finalMatches = enqPrices.filter(p =>
                        isBasePrice(p) &&
                        !(p.MatchedEnquiryForId ?? p.matchedEnquiryForId ?? p.matchedenquiryforid) &&
                        !(p.EnquiryForID && p.EnquiryForID != 0 && p.EnquiryForID != '0') &&
                        p.EnquiryForItem &&
                        p.EnquiryForItem.toString().trim().toLowerCase() === job.ItemName.toString().trim().toLowerCase()
                    );
                }

                const sortedMatches = [...finalMatches].sort((a, b) => new Date(b.UpdatedAt || 0) - new Date(a.UpdatedAt || 0));

                // For Subjob Prices tree, strictly use the internal customer view or divisions
                let priceRow = sortedMatches.find(p => p.Price > 0 && p.CustomerName && (
                    normalize(p.CustomerName) === internalCustomerNorm ||
                    jobNameSetNorm.has(normalize(p.CustomerName))
                ));

                if (!priceRow) priceRow = sortedMatches.find(p => p.Price > 0);
                if (!priceRow && sortedMatches.length > 0) priceRow = sortedMatches[0];

                selfPrices[job.ID] = priceRow ? parseFloat(priceRow.Price || 0) : 0;
                updateDates[job.ID] = priceRow ? priceRow.UpdatedAt : null;
                selfPriceCustomers[job.ID] = priceRow ? String(priceRow.CustomerName ?? '').trim() : '';
            });

            // Aggregate PricingCustomerDetails (Hide Subjobs, Aggregate to Root)
            let aggregatedPricing = {};
            if (enq.PricingCustomerDetails) {
                enq.PricingCustomerDetails.split(';;').forEach(p => {
                    const parts = p.split('|');
                    const name = parts[0]?.trim();
                    const val = parseFloat(parts[1]) || 0;
                    if (!name) return;

                    const nameNorm = normalize(name);
                    if (jobNameSetNorm.has(nameNorm)) {
                        // It's a job name (Internal) -> keep as original name (Parent Job)
                        aggregatedPricing[name] = (aggregatedPricing[name] || 0) + val;
                    } else {
                        // It's an external customer
                        aggregatedPricing[name] = (aggregatedPricing[name] || 0) + val;
                    }
                });
            }

            const finalPricingStr = Object.entries(aggregatedPricing)
                .map(([name, val]) => `${name}|${val.toFixed(2)}`)
                .join(';;');

            // Customer column:
            // - If ownjob is subjob in a lead branch => include that branch parent job name.
            // - If ownjob is lead/root in a lead branch => include external customers.
            // - If both exist across branches => include both sets (deduped).
            const finalCustomerSet = new Set();
            const userDivisionKey = userEmail ? userEmail.split('@')[0].toLowerCase() : '';
            const anchorJobs = userEmail && accessCtx && accessCtx.user
                ? (sessionDivTrim
                    ? getPricingAnchorJobsForDivision(enqJobs, accessCtx, userEmail, sessionDivTrim)
                    : getPricingAnchorJobs(enqJobs, accessCtx, userEmail))
                : enqJobs.filter(j => !j.ParentID || j.ParentID == '0' || j.ParentID == 0);
            const ownDeptClean = stripLeadPrefix(ownJobScopeDepartment || '');
            const ownDeptNorm = normalize(ownDeptClean);
            let hasOwnAsLeadInAnyBranch = false;
            let hasOwnAsSubjobInAnyBranch = false;
            const ownLeadCodes = new Set();     // lead codes where ownjob is root
            const ownSubjobLeadCodes = new Set(); // lead codes where ownjob is subjob

            const childrenByParent = {};
            enqJobs.forEach((j) => {
                const pid = j.ParentID;
                if (pid == null || pid === '' || pid === '0' || pid === 0) return;
                const key = String(pid);
                if (!childrenByParent[key]) childrenByParent[key] = [];
                childrenByParent[key].push(j);
            });

            const rootsForBranchCheck = enqJobs.filter(j => !j.ParentID || j.ParentID == '0' || j.ParentID == 0);
            const collectBranchJobs = (root) => {
                const out = [];
                const stack = [root];
                const seen = new Set();
                while (stack.length > 0) {
                    const cur = stack.pop();
                    const cid = String(cur.ID);
                    if (seen.has(cid)) continue;
                    seen.add(cid);
                    out.push(cur);
                    const kids = childrenByParent[cid] || [];
                    kids.forEach(k => stack.push(k));
                }
                return out;
            };

            rootsForBranchCheck.forEach((root) => {
                const branchJobs = collectBranchJobs(root);
                const ownNodes = branchJobs.filter((j) => normalize(stripLeadPrefix(j.ItemName || '')) === ownDeptNorm);
                if (ownNodes.length === 0) return;
                ownNodes.forEach((ownNode) => {
                    const pid = ownNode.ParentID;
                    const rootLeadCode = String(root.LeadJobCode || '').trim().toUpperCase();
                    const isLead = (pid == null || pid === '' || pid === '0' || pid === 0);
                    if (isLead) {
                        hasOwnAsLeadInAnyBranch = true;
                        if (/^L\d+$/.test(rootLeadCode)) ownLeadCodes.add(rootLeadCode);
                        return;
                    }
                    hasOwnAsSubjobInAnyBranch = true;
                    if (/^L\d+$/.test(rootLeadCode)) ownSubjobLeadCodes.add(rootLeadCode);
                    const parent = enqJobs.find(pj => String(pj.ID) === String(pid));
                    if (!parent || !parent.ItemName) return;
                    const label = stripLeadPrefix(parent.ItemName) || String(parent.ItemName).trim();
                    const leadCode = (() => {
                        const raw = (root.LeadJobCode || ownNode.LeadJobCode || parent.LeadJobCode || '').toString().trim().toUpperCase();
                        return /^L\d+$/.test(raw) ? raw : '';
                    })();
                    const displayLabel = withLeadCode(label, leadCode);
                    if (displayLabel && (!userDivisionKey || !normalize(displayLabel).includes(userDivisionKey))) {
                        finalCustomerSet.add(displayLabel);
                    }
                });
            });

            if (hasOwnAsLeadInAnyBranch || (!hasOwnAsSubjobInAnyBranch && finalCustomerSet.size === 0)) {
                const leadCodes = Array.from(ownLeadCodes);
                externalCustomers.forEach((c) => {
                    if (!c) return;
                    if (leadCodes.length === 0) {
                        if (!userDivisionKey || !normalize(c).includes(userDivisionKey)) finalCustomerSet.add(c);
                        return;
                    }
                    leadCodes.forEach((lc) => {
                        const disp = withLeadCode(c, lc);
                        if (disp && (!userDivisionKey || !normalize(disp).includes(userDivisionKey))) {
                            finalCustomerSet.add(disp);
                        }
                    });
                });
            }

            // Fail-safe: always include parent names of visible subjob anchors (same rule as quote customer dropdown).
            // This avoids missing parent customers when department text does not exactly match EnquiryFor item labels.
            anchorJobs.forEach((job) => {
                if (!job.ParentID || job.ParentID == '0' || job.ParentID == 0) return;
                const parent = enqJobs.find((pj) => String(pj.ID) === String(job.ParentID));
                if (!parent || !parent.ItemName) return;
                const label = stripLeadPrefix(parent.ItemName) || String(parent.ItemName).trim();
                const leadCode = (() => {
                    const code = String(job.LeadJobCode || parent.LeadJobCode || '').trim().toUpperCase();
                    if (ownSubjobLeadCodes.size === 0) return code;
                    return ownSubjobLeadCodes.has(code) ? code : '';
                })();
                const displayLabel = withLeadCode(label, leadCode);
                if (displayLabel && (!userDivisionKey || !normalize(displayLabel).includes(userDivisionKey))) {
                    finalCustomerSet.add(displayLabel);
                }
            });

            const finalCustomersRaw = Array.from(finalCustomerSet);
            const finalCustomers = [];
            const seenBase = new Set();
            finalCustomersRaw.forEach((name) => {
                const base = String(name || '').replace(/\s*\(L\d+\)\s*$/i, '').trim().toLowerCase();
                if (!base || seenBase.has(base)) return;
                seenBase.add(base);
                finalCustomers.push(name);
            });

            const fullCustomerName = finalCustomers.join(', ');

            const isExternalPricingCustomerSub = (customerName) => {
                const cn = String(customerName || '').replace(/\s*\(L\d+\)\s*$/i, '').trim();
                const cnN = normalize(cn);
                return Boolean(cn && cnN !== internalCustomerNorm && !jobNameSetNorm.has(cnN));
            };
            const jobMapForSubjobLabels = {};
            enqJobs.forEach((j) => {
                jobMapForSubjobLabels[String(j.ID)] = j;
            });

            const subJobPrices = filteredFlatList
                .map((job) => {
                    const displayLevel = Math.max(0, (job.level || 0) - minLevel);
                    let root = job;
                    const visited = new Set();
                    while (root.ParentID && root.ParentID != 0 && root.ParentID != '0' && !visited.has(root.ID)) {
                        const p = enqJobs.find((j) => j.ID == root.ParentID);
                        if (!p) break;
                        visited.add(root.ID);
                        root = p;
                    }
                    const displayCode = rootLabelMap[root.ID] || 'L1';
                    const jid = job.ID;
                    const jobRec = jobMapForSubjobLabels[String(jid)];
                    const priceCust = selfPriceCustomers[jid] || '';

                    let displayName = '';
                    if (priceCust && isExternalPricingCustomerSub(priceCust)) {
                        const base = stripLeadPrefix(priceCust) || priceCust;
                        displayName = `${base} (${displayCode})`;
                    } else if (jobRec) {
                        const pid = jobRec.ParentID;
                        if (pid != null && pid !== '' && pid !== 0 && pid !== '0') {
                            const par = jobMapForSubjobLabels[String(pid)];
                            if (par?.ItemName) {
                                const base = stripLeadPrefix(par.ItemName) || String(par.ItemName).trim();
                                displayName = `${base} (${displayCode})`;
                            }
                        }
                    }
                    if (!displayName) {
                        const suffix = `(${displayCode})`;
                        const matchFinal = finalCustomers.find((c) => String(c).trim().endsWith(suffix));
                        displayName = matchFinal
                            ? String(matchFinal).trim()
                            : `${stripLeadPrefix(jobRec?.ItemName || job.ItemName) || String(jobRec?.ItemName || job.ItemName).trim()} (${displayCode})`;
                    }

                    const totalVal = selfPrices[job.ID] || 0;
                    const updatedAtTs =
                        (updateDates[job.ID] ? new Date(updateDates[job.ID]).getTime() : 0) || 0;

                    return `${displayName}|${totalVal > 0 ? totalVal.toFixed(2) : 'Not Updated'}|${updatedAtTs ? new Date(updatedAtTs).toISOString() : ''}|${displayLevel}`;
                })
                .join(';;');

            // Latest-quote own job: sum base prices for that EnquiryFor node + all descendants (same selfPrices rules as Subjob Prices column).
            // Prefer the pending-list tuple (PV) so ref/date/summary align with the row, not another branch on the enquiry.
            const pendingOwnFromTuple = pendingOwnFromTupleRaw;
            const listQuoteOwnFromRow = (enq.ListQuoteOwnJob ?? enq.listquoteownjob ?? '').toString().trim();

            // Use the tuple's own job label for quote-matching/status.
            // (If we force to sessionDivTrim here, it can break matching when quotes persist a slightly different representation.)
            let ownJobFromQuote = pendingOwnFromTuple;
            if (!ownJobFromQuote) {
                // Search/quoted rows often have no pending tuple; own-job must follow selected Division.
                if (sessionDivTrim) {
                    ownJobFromQuote = sessionDivTrim;
                } else if (accessCtx && !accessCtx.isAdmin && String(userDepartment || '').trim()) {
                    ownJobFromQuote = String(userDepartment).trim();
                } else {
                    // Admins / no department: use SQL column (latest quote on enquiry, any division).
                    ownJobFromQuote = listQuoteOwnFromRow;
                }
            }
            const savedTotalRaw = enq.ListQuoteTotalAmount ?? enq.listquotetotalamount;
            const savedQuoteTotal = savedTotalRaw != null && !Number.isNaN(parseFloat(savedTotalRaw))
                ? parseFloat(savedTotalRaw)
                : null;
            const ownJobNormFromQuote = normalize(stripLeadPrefix(ownJobFromQuote));
            let quoteOwnJobNode = null;
            if (ownJobNormFromQuote) {
                quoteOwnJobNode = enqJobs.find((j) => normalize(stripLeadPrefix(j.ItemName || '')) === ownJobNormFromQuote);
            }
            if (!quoteOwnJobNode && ownJobFromQuote) {
                const low = ownJobFromQuote.toLowerCase();
                quoteOwnJobNode = enqJobs.find((j) => String(j.ItemName || '').trim().toLowerCase() === low);
            }
            if (!quoteOwnJobNode && ownJobNormFromQuote && ownJobNormFromQuote.length >= 2) {
                quoteOwnJobNode = enqJobs.find((j) => {
                    const jn = normalize(String(j.ItemName || ''));
                    return jn.includes(ownJobNormFromQuote) || ownJobNormFromQuote.includes(jn);
                });
            }
            const quoteBranchJobIds = new Set();
            const collectQuoteBranch = (jid) => {
                const s = String(jid);
                if (quoteBranchJobIds.has(s)) return;
                quoteBranchJobIds.add(s);
                const kids = stringChildrenMap[s] || [];
                kids.forEach((c) => collectQuoteBranch(c.ID));
            };
            if (quoteOwnJobNode) collectQuoteBranch(quoteOwnJobNode.ID);
            let quoteBranchBaseSum = 0;
            quoteBranchJobIds.forEach((idStr) => {
                const nid = Number(idStr);
                const v = selfPrices[nid] !== undefined ? selfPrices[nid] : selfPrices[idStr];
                quoteBranchBaseSum += parseFloat(v || 0) || 0;
            });

            const listRefRaw = enq.ListQuoteRef ?? enq.listquoteref;
            let listRef = listRefRaw != null && String(listRefRaw).trim() !== '' ? String(listRefRaw).trim() : '';

            /** Quoted / search-list rows omit pending tuple fields; use saved quote + enquiry customer for multi-lead rollup. */
            const pvOwnT = ownJobFromQuote;
            const pvCustT =
                (enq.ListPendingCustomerName ?? enq.listpendingcustomername ?? '').toString().trim() ||
                String(fullCustomerName || '').split(',')[0].trim() ||
                String(enq.CustomerName ?? enq.customername ?? '')
                    .split(',')
                    .map((x) => x.trim())
                    .filter(Boolean)[0] ||
                '';
            const multiRoll = buildMultiLeadQuoteRollup(enq.RequestNo, pvOwnT, pvCustT, allPrices, allQuotes, enqJobs);

            let listQuoteRollupStatus = null;
            let listMultiLeadQuoteRefs = null;
            let listDtRaw = enq.ListQuoteDate ?? enq.listquotedate;

            if (multiRoll) {
                listQuoteRollupStatus = multiRoll.status;
                listMultiLeadQuoteRefs = multiRoll.entries;
                if (multiRoll.listQuoteDateForSort) {
                    listDtRaw = multiRoll.listQuoteDateForSort;
                } else if (multiRoll.entries.length === 0) {
                    listDtRaw = null;
                }
                if (multiRoll.entries.length > 0) {
                    listRef = multiRoll.entries.map((e) => e.quoteNumber).join(' | ');
                } else {
                    listRef = '';
                }
            }

            let listQuoteUnderRefTotal = null;
            if (quoteOwnJobNode) {
                // Always use pricing roll-up for this job + subjobs when the node is known (avoids wrong single-line SQL totals).
                listQuoteUnderRefTotal = quoteBranchBaseSum > 0 ? quoteBranchBaseSum : null;
            } else if (savedQuoteTotal != null && savedQuoteTotal > 0) {
                listQuoteUnderRefTotal = savedQuoteTotal;
            }
            // Do not show a roll-up amount when no quote ref is shown (single-lead pending, or multi-lead with none quoted yet).
            const hasDisplayedQuoteRef =
                (listRef && String(listRef).trim() !== '') ||
                (multiRoll && multiRoll.entries && multiRoll.entries.length > 0);
            if (!hasDisplayedQuoteRef) {
                listQuoteUnderRefTotal = null;
            }

            const listPbRaw = enq.ListPreparedBy ?? enq.listpreparedby;
            let listPreparedBy = listPbRaw != null && String(listPbRaw).trim() !== '' ? String(listPbRaw).trim() : '';

            /** ToName for quote-detail line: pending tuple customer, else first name in Customer column. */
            const listQuoteDetailToName =
                (enq.ListPendingCustomerName ?? enq.listpendingcustomername ?? '').toString().trim() ||
                (String(fullCustomerName || '').split(',')[0].trim()) ||
                '';

            const rowDraft = {
                ListPreparedBy: listPreparedBy,
                ListMultiLeadQuoteRefs: listMultiLeadQuoteRefs,
                ListQuoteRef: listRef,
            };
            listPreparedBy =
                collectPreparedByForMappedRow(enq.RequestNo, rowDraft, allQuotes) || listPreparedBy;

            const pendingLeadName = (enq.ListPendingLeadJobName ?? enq.listpendingleadjobname ?? '').toString().trim();
            const pendingCustomerName = (enq.ListPendingCustomerName ?? enq.listpendingcustomername ?? '').toString().trim();
            const listQuoteLeadContext = buildListQuoteLeadContext({
                enqJobs,
                roots,
                rootLabelMap,
                stringChildrenMap,
                enqPrices,
                pendingOwnItem: ownJobFromQuote,
                stripLeadPrefix,
                normalize,
                internalCustomerNorm,
                jobNameSetNorm,
                externalCustomers,
                quoteListShowAllLeadsForAdmin: !!(accessCtx && accessCtx.isAdmin),
            });
            const leadQuoteLines = buildEnquiryLeadQuoteDetailLines(
                enqRequestNo,
                [
                    {
                        ListPendingLeadJobName: pendingLeadName,
                        ListPendingOwnJobItem: ownJobFromQuote,
                        ListPendingCustomerName: pendingCustomerName,
                        ListQuoteDetailToName: listQuoteDetailToName,
                        CustomerName: fullCustomerName,
                        ListQuoteUnderRefTotal: listQuoteUnderRefTotal,
                        ListMultiLeadQuoteRefs: listMultiLeadQuoteRefs,
                        ListQuoteRef: listRef,
                        ListQuoteDate: listDtRaw != null && listDtRaw !== '' ? listDtRaw : null,
                    },
                ],
                allQuotes,
                enqPrices,
                listQuoteLeadContext
            );
            const rollupFromDetailLines = rollupStatusFromLeadDetailLines(leadQuoteLines);

            return {
                RequestNo: enq.RequestNo,
                ListPendingPvId: enq.ListPendingPvId ?? enq.listpendingpvid ?? null,
                ListPendingLeadJobName: pendingLeadName,
                ListPendingOwnJobItem: ownJobFromQuote,
                ListPendingCustomerName: pendingCustomerName,
                ListQuoteLeadContext: listQuoteLeadContext,
                ProjectName: enq.ProjectName,
                ListQuoteRef: listRef,
                ListWorkflowNo: resolveListWorkflowNo(workflowLookup, enq.RequestNo, listRef),
                ListQuoteDetailToName: listQuoteDetailToName,
                ListQuoteRollupStatus: rollupFromDetailLines ?? listQuoteRollupStatus,
                ListMultiLeadQuoteRefs: listMultiLeadQuoteRefs,
                ListQuoteDate: listDtRaw != null && listDtRaw !== '' ? listDtRaw : null,
                ListQuoteUnderRefTotal: listQuoteUnderRefTotal,
                ListPreparedBy: listPreparedBy,
                ListQuoteDetailLines: leadQuoteLines,
                CustomerName: fullCustomerName,
                PricingCustomerDetails: finalPricingStr,
                ClientName: enq.ClientName || enq.clientname || '-',
                ConsultantName: enq.ConsultantName || enq.consultantname || '-',
                EnquiryDate: enq.EnquiryDate,
                DueDate: enq.DueDate,
                Status: enq.Status,
                Divisions: enq.Divisions,
                QuotedCustomers: enq.QuotedCustomers,
                SubJobPrices: subJobPrices
            };
        }).filter(Boolean);

        // Second pass: collapse rows that present identically (join fan-out, subtle string drift on tuple fields).
        const normKey = (s) =>
            String(s ?? '')
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase();
        const dueIso = (d) => {
            if (d == null || d === '') return '';
            const t = new Date(d).getTime();
            return Number.isNaN(t) ? normKey(String(d)) : new Date(t).toISOString().slice(0, 10);
        };
        const presentationKey = (row) =>
            [
                normKey(row.RequestNo),
                dueIso(row.DueDate),
                normKey(row.ProjectName),
                normKey(row.ListQuoteRef),
                normKey(row.ListQuoteRollupStatus),
                normKey(JSON.stringify(row.ListMultiLeadQuoteRefs || [])),
                normKey(row.CustomerName),
                String(row.SubJobPrices ?? ''),
            ].join('\u0001');
        const seenPres = new Set();
        const mappedDeduped = [];
        for (const row of mappedEnquiries) {
            const pk = presentationKey(row);
            if (seenPres.has(pk)) continue;
            seenPres.add(pk);
            mappedDeduped.push(row);
        }

        let finalMapped = mergePendingRowsByRequestNo(mappedDeduped, allQuotes, allPrices);
        if (userEmail && accessCtx && !accessCtx.isAdmin) {
            finalMapped = finalMapped.map(enq => {
                const accessRule = accessCtx.isCcUser ? 'cc_coordinator' : 'concerned_se';
                return { ...enq, AccessRule: accessRule };
            });
        }

        return finalMapped;
}

module.exports = mapQuoteListingRows;
module.exports.quoteDetailLineResolved = quoteDetailLineResolved;
