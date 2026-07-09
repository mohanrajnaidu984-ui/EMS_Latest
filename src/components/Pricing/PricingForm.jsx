import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Plus, Trash2, Save, FileText, ChevronDown, ChevronUp, ChevronLeft, FileSpreadsheet, X, FilterX } from 'lucide-react';
import {
    useTableColumnHeaderFilters,
    TableColumnFilterHeader,
} from '../shared/tableColumnHeaderFilters';
import '../../styles/emsTableColumnFilters.css';
import { format } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import DateInput from '../Enquiry/DateInput';
import {
    EMS_LIST_SEARCH_ENABLED_STYLE,
    EMS_LIST_SEARCH_DISABLED_STYLE,
    EMS_LIST_CLEAR_STYLE,
} from '../../constants/emsSearchButtons';
import { EMS_TABLE_HEADER_GRADIENT } from '../../constants/emsTheme';
import { quoteBlocksDeclineToQuote } from '../../utils/pricingQuoteTupleMatch';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

/** Parent layout already offsets content below fixed header; keep sticky bar flush. */
const PRICING_STICKY_TOP = '0px';

/** Price entry grid: quarter view width, capped to parent on small screens. */
const PRICING_INPUT_SECTION_STYLE = {
    width: 'min(25vw, 100%)',
    maxWidth: '100%',
    boxSizing: 'border-box',
};

/** List mode: pending pricing work vs search (same UX pattern as Quote list) */
const PRICING_LIST_CATEGORY = {
    PENDING: 'pending',
    SEARCH: 'search',
};

/** Normalize EnquiryFor IDs from API (number vs string) for Set/hierarchy lookups */
const nid = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

/** All job IDs under a lead root (inclusive), for the selected lead branch. */
function getPricingLeadSubtreeIds(rootId, allJobs) {
    const rootN = nid(rootId);
    if (rootN == null || !Array.isArray(allJobs)) return new Set();
    const set = new Set([rootN]);
    let changed = true;
    while (changed) {
        changed = false;
        allJobs.forEach((j) => {
            const pid = nid(j.parentId);
            const jid = nid(j.id);
            if (pid != null && jid != null && set.has(pid) && !set.has(jid)) {
                set.add(jid);
                changed = true;
            }
        });
    }
    return set;
}

/**
 * `EnquiryPricingValues.EnquiryForID` must belong to the current “Select Lead Job” tree (not another top-level lead).
 * e.g. a BMS row only under the HVAC lead root is excluded when viewing the Civil lead.
 */
function enquiryForIdInSelectedLeadSubtree(leadRootId, enquiryForId, allJobs) {
    if (leadRootId == null || enquiryForId == null || !allJobs || allJobs.length === 0) return true;
    const n = nid(enquiryForId);
    if (n == null) return true;
    return getPricingLeadSubtreeIds(leadRootId, allJobs).has(n);
}

/**
 * Root **display** label for matching `EnquiryPricingOptions/Values.LeadJobName` (e.g. "HVAC Project").
 * Uses full `ItemName` text as returned by the API (no prefix stripping).
 */
function findLeadRootLabelForPricingMatch(jobOrItem, jobs) {
    if (!jobs?.length) return null;
    const job =
        typeof jobOrItem === 'object' && jobOrItem
            ? jobOrItem
            : jobs.find((j) => (j.itemName || '').trim() === (jobOrItem || '').trim());
    if (!job) return null;
    let current = job;
    const visited = new Set();
    while (
        current?.parentId &&
        String(current.parentId) !== '0' &&
        current.parentId !== 0 &&
        !visited.has(current.id)
    ) {
        visited.add(current.id);
        const parent = jobs.find((j) => j.id === current.parentId);
        if (!parent) break;
        current = parent;
    }
    const rawName = (current.itemName || '').trim();
    if (rawName) {
        return rawName;
    }
    return String(current.leadJobCode || current.LeadJobCode || '').trim() || null;
}

/**
 * When Option + Value have no customer, bucket the row to the internal parent tab (e.g. HVAC for a BMS subjob).
 */
/** Walk EnquiryFor parent chain to the top-level row for this job (pricing “lead root” identity). */
function enquiryForRootJob(job, allJobs) {
    if (!job || !Array.isArray(allJobs) || !allJobs.length) return null;
    let current = job;
    const visited = new Set();
    while (current && !visited.has(String(current.id ?? current.ID))) {
        visited.add(String(current.id ?? current.ID));
        const pid = current.parentId ?? current.ParentID;
        if (pid == null || pid === '' || pid === 0 || pid === '0') return current;
        const p = allJobs.find((x) => String(x.id ?? x.ID) === String(pid));
        if (!p) return current;
        current = p;
    }
    return current;
}

function inferInternalCustomerTabForValueRow(v, jobs) {
    const eid = v.EnquiryForID ?? v.enquiryForId;
    if (eid == null || !Array.isArray(jobs) || !jobs.length) return null;
    const job = jobs.find((j) => String(j.id) === String(eid));
    if (!job) return null;
    const p = job.parentId;
    if (p == null || p === '' || p === 0 || p === '0') return null;
    const parent = jobs.find((x) => String(x.id) === String(p));
    if (!parent) return null;
    return String(parent.itemName || '').trim() || null;
}

/**
 * Save All: reverse-aggregation subtracts “hidden” child amounts from what you typed on a parent row.
 * Must align with backend `job.visible` (ID-based).
 *
 * Rule: **only treat as hidden when explicitly `visible === false`.** Unknown / unmatched → visible (safe).
 */
function isJobRowVisibleForSaveHiddenChildCheck(jobRec, accessVisibleJobNames) {
    if (!jobRec) return true;
    if (jobRec.visible === false) return false;
    if (jobRec.visible === true) return true;
    const names = accessVisibleJobNames || [];
    const raw = (jobRec.itemName || '').trim();
    if (!raw) return true;
    if (names.includes(raw)) return true;
    const rl = raw.toLowerCase();
    return names.some((n) => String(n || '').trim().toLowerCase() === rl);
}

function isPricingSubjobRow(job) {
    if (!job) return false;
    const pid = job.parentId;
    return pid != null && pid !== 0 && String(pid) !== '0';
}

/** Subjob price hidden from lead/parent viewers until that subjob creates a quote. */
function isSubjobPriceMaskedByQuote(job) {
    return isPricingSubjobRow(job) && job.priceUnlockedByQuote === false;
}

/**
 * `EnquiryPricingValues.LeadJobName` is the lead under which the price was saved.
 * e.g. BMS=2 with LeadJobName=HVAC must not show on the Civil lead tree; Civil's own rows use LeadJobName=Civil.
 */
function valueRowLeadJobMatchesView(valueLeadName, selectedLeadRootItemName, valueScopeLeadId, allJobs) {
    if (!selectedLeadRootItemName || !String(selectedLeadRootItemName).trim()) return true;
    if (!valueLeadName || !String(valueLeadName).trim()) return true;

    // Always accept exact / prefix-insensitive matches (L1 - Civil Project vs Civil Project).
    if (sameEnquiryItemName(valueLeadName, selectedLeadRootItemName)) return true;

    // EPV may store the *immediate* lead (e.g. HVAC/BMS) while UI lead root is Civil (same branch).
    // When subtree traversal fails due to id/parent drift, allow any lead name that exists under this selected lead subtree.
    if (valueScopeLeadId != null && Array.isArray(allJobs) && allJobs.length) {
        const subtree = getPricingLeadSubtreeIds(valueScopeLeadId, allJobs);
        for (const j of allJobs) {
            const jid = nid(j.id);
            if (jid == null || !subtree.has(jid)) continue;
            if (sameEnquiryItemName(valueLeadName, j.itemName)) return true;
        }
    }

    return false;
}

/** EPV row counts for this lead if the job sits under the selected root OR `LeadJobName` matches (handles hierarchy drift). */
function epvRowPassesLeadSubtreeOrLabel(valueScopeLeadId, allJobs, valueRow, leadDisplayName) {
    if (valueScopeLeadId == null || !allJobs?.length) return true;
    const eid = valueRow.EnquiryForID ?? valueRow.enquiryForId;
    if (enquiryForIdInSelectedLeadSubtree(valueScopeLeadId, eid, allJobs)) return true;
    return valueRowLeadJobMatchesView(
        valueRow.LeadJobName ?? valueRow.leadJobName,
        leadDisplayName,
        valueScopeLeadId,
        allJobs
    );
}

/** Tab / EPV customer label (NBSP, multiple spaces, trim) — must match UI tabs vs DB text. */
function normalizePricingCustomerKey(s) {
    return String(s || '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

/**
 * Per-cell read: (EnquiryForID, OptionID) + customer + `LeadJobName` + full job-tree scope under the selected lead.
 */
function parsePriceFromRawValueRowsForCell(
    raw,
    jobId,
    optionId,
    selectedCustomer,
    selectedLeadRootItemName,
    valueScopeLeadId,
    allJobs,
    cellOpts = null
) {
    if (!raw || !raw.length) return null;
    let cands = raw.filter(
        (v) =>
            String(v.EnquiryForID ?? v.enquiryForId ?? '') === String(jobId) &&
            String(v.OptionID ?? v.optionID ?? '') === String(optionId)
    );
    cands = cands.filter((v) =>
        epvRowPassesLeadSubtreeOrLabel(valueScopeLeadId, allJobs, v, selectedLeadRootItemName)
    );
    if (cands.length === 0) return null;
    const sc = normalizePricingCustomerKey(selectedCustomer);
    const withCust = cands.find(
        (v) => normalizePricingCustomerKey(v.CustomerName ?? v.customerName ?? '') === sc
    );
    let inferredMatch = null;
    if (!withCust && sc) {
        inferredMatch = cands.find((v) => {
            const inf = inferInternalCustomerTabForValueRow(v, allJobs);
            return inf && normalizePricingCustomerKey(inf) === sc;
        });
    }
    const allowBlank = cellOpts && cellOpts.allowBlankCustomerName;
    const blankOnly = cands.find((v) => !String(v.CustomerName ?? v.customerName ?? '').trim());
    // When a tab/customer is selected, NEVER fall back to a mismatched customer row.
    // This prevents BEMCO values from showing under TEMCO (and vice versa).
    if (sc && !withCust && !inferredMatch && !(allowBlank && blankOnly)) return null;

    let row =
        withCust ||
        inferredMatch ||
        (allowBlank ? blankOnly : null) ||
        (!sc && cands.length === 1 ? cands[0] : null);
    if (!row) return null;
    const p = parseFloat(row.Price);
    return Number.isFinite(p) ? p : null;
}

const normPriceOption = (s) => String(s || 'Base Price').trim().toLowerCase();
const normLeadNameForEpv = (s) => String(s || '').trim().toLowerCase();

/**
 * Read price directly from `EnquiryPricingValues` rows using the same business keys the DB stores
 * (no EPO/OptionID join): Lead job ↔ LeadJobName, own/division line ↔ EnquiryForItem, tab ↔ CustomerName,
 * row type ↔ PriceOption (e.g. Base Price). Prefer exact EnquiryForID when multiple rows match; then latest UpdatedAt.
 */
/** Resolve `allValues` / flat `values` bucket for the active tab (case-insensitive key match). */
function customerValuesBucket(allValues, flatValues, customerTab) {
    if (!customerTab || !String(customerTab).trim()) return flatValues || {};
    const t = String(customerTab).trim();
    if (allValues && allValues[t]) return allValues[t];
    const tl = t.toLowerCase();
    const key = allValues ? Object.keys(allValues).find((k) => k.toLowerCase() === tl) : null;
    if (key && allValues[key]) return allValues[key];
    return flatValues || {};
}

function findEpvRowsFromRawByEpvDimensions(
    raw,
    {
        leadDisplayName,
        ownJobItemName,
        customerTab,
        priceOptionName,
        valueScopeLeadId,
        jobId,
        allJobs,
        optionId,
    }
) {
    if (!raw || !raw.length) return [];
    const nLead = normLeadNameForEpv(leadDisplayName);
    const nTab = normalizePricingCustomerKey(customerTab);
    const wantPo = normPriceOption(priceOptionName);

    const cands = raw.filter((v) => {
        if (!epvRowPassesLeadSubtreeOrLabel(valueScopeLeadId, allJobs, v, leadDisplayName)) {
            return false;
        }
        const eidRow = v.EnquiryForID ?? v.enquiryForId;
        const rowInLeadSubtree =
            valueScopeLeadId != null &&
            eidRow != null &&
            enquiryForIdInSelectedLeadSubtree(valueScopeLeadId, eidRow, allJobs);

        const vLead = v.LeadJobName ?? v.leadJobName;
        if (
            nLead &&
            vLead &&
            !valueRowLeadJobMatchesView(vLead, leadDisplayName, valueScopeLeadId, allJobs) &&
            !rowInLeadSubtree
        ) {
            return false;
        }

        const vIt = v.EnquiryForItem ?? v.enquiryForItem ?? '';
        if (!ownJobItemName || !sameEnquiryItemName(vIt, ownJobItemName)) return false;

        if (optionId != null && String(optionId).trim() !== '') {
            const oid = String(v.OptionID ?? v.optionID ?? '').trim();
            if (oid !== String(optionId).trim()) return false;
        }

        const vC = normalizePricingCustomerKey(v.CustomerName ?? v.customerName ?? '');
        const inferredK = inferInternalCustomerTabForValueRow(v, allJobs);
        const inferredNorm = inferredK ? normalizePricingCustomerKey(inferredK) : '';

        if (nTab) {
            const tabOk = vC === nTab || inferredNorm === nTab;
            if (!tabOk) return false;
        }

        const vPo = normPriceOption(v.PriceOption ?? v.priceOption);
        if (wantPo && vPo && vPo !== wantPo) return false;

        return true;
    });

    if (cands.length === 0) return [];
    let pool = cands;
    if (jobId != null && jobId !== '') {
        const exact = cands.filter((v) => String(v.EnquiryForID ?? v.enquiryForId) === String(jobId));
        if (!exact.length) {
            if (optionId == null || String(optionId).trim() === '') {
                const inTree = cands.filter((v) =>
                    enquiryForIdInSelectedLeadSubtree(
                        valueScopeLeadId,
                        v.EnquiryForID ?? v.enquiryForId,
                        allJobs
                    )
                );
                if (!inTree.length) return [];
                pool = inTree;
            } else {
                return [];
            }
        } else {
            pool = exact;
        }
        if (pool.length > 1 && nTab) {
            const byTab = pool.filter(
                (v) => normalizePricingCustomerKey(v.CustomerName ?? v.customerName ?? '') === nTab
            );
            const byInfer = pool.filter((v) => {
                const inf = inferInternalCustomerTabForValueRow(v, allJobs);
                return inf && normalizePricingCustomerKey(inf) === nTab;
            });
            if (byTab.length === 1) pool = byTab;
            else if (byTab.length > 1) pool = byTab;
            else if (byInfer.length === 1) pool = byInfer;
        }
    }
    const leadRootNorm = normLeadNameForEpv(leadDisplayName);
    pool.sort((a, b) => {
        const al = normLeadNameForEpv(a.LeadJobName ?? a.leadJobName);
        const bl = normLeadNameForEpv(b.LeadJobName ?? b.leadJobName);
        const aLeadScore = leadRootNorm && al === leadRootNorm ? 0 : 1;
        const bLeadScore = leadRootNorm && bl === leadRootNorm ? 0 : 1;
        if (aLeadScore !== bLeadScore) return aLeadScore - bLeadScore;

        const ta = new Date(a.UpdatedAt ?? a.updatedAt ?? 0).getTime();
        const tb = new Date(b.UpdatedAt ?? b.updatedAt ?? 0).getTime();
        return tb - ta;
    });
    return pool;
}

function isDeclineToQuoteEpvValue(raw) {
    const v = String(raw ?? 'No').trim().toLowerCase();
    return v === 'yes' || v === 'y' || v === '1' || v === 'true';
}

function findPriceFromRawByEpvDimensions(
    raw,
    dims
) {
    const pool = findEpvRowsFromRawByEpvDimensions(raw, dims);
    if (!pool.length) return null;
    const p = parseFloat(pool[0].Price);
    return Number.isFinite(p) ? p : null;
}

function findDeclineToQuoteFromRawByEpvDimensions(raw, dims) {
    const pool = findEpvRowsFromRawByEpvDimensions(raw, dims);
    if (!pool.length) return false;
    return isDeclineToQuoteEpvValue(pool[0].Quotingornot ?? pool[0].quotingornot);
}

/**
 * Reject a grouped/legacy row whose `EnquiryForID` does not match this cell’s job (same option name, different lead branch).
 */
function pricingValueRowEnquiryForMatchesJob(row, jobId) {
    if (!row) return false;
    const e = row.EnquiryForID ?? row.enquiryForId;
    if (e == null || e === '' || e === '0' || e === 0) return true;
    return String(e) === String(jobId);
}

/**
 * Every `EnquiryFor` id the user may persist pricing for (assigned jobs on **all** lead branches).
 * Used by Save All so e.g. both `L1 - BMS Project` and `L2 - BMS Project` save in one click.
 */
function resolveAllEditableJobIds({ jobs, myJobs, canEditAll }) {
    if (canEditAll || !Array.isArray(jobs) || !jobs.length) return new Set();
    const myJobsArr = Array.isArray(myJobs) ? myJobs : [];
    const out = new Set();
    for (const j of jobs) {
        if (!myJobsArr.some((n) => sameEnquiryItemName(n, j.itemName))) continue;
        const id = nid(j.id);
        if (id != null) out.add(id);
    }
    return out;
}

/**
 * Single job row the user may edit (own department under this lead).
 * Lead owner → selected lead id; subjob user → shallowest assigned job under that lead.
 */
function resolveOwnJobAnchorId({ jobs, selectedLeadId, myJobs, canEditAll }) {
    if (canEditAll || !Array.isArray(jobs) || !jobs.length || !selectedLeadId) return null;
    const validIds = getPricingLeadSubtreeIds(selectedLeadId, jobs);
    if (!validIds.size) return null;
    const myJobsArr = Array.isArray(myJobs) ? myJobs : [];
    const editableInLeadTree = jobs.filter((j) => {
        const jid = nid(j.id);
        return (
            jid != null &&
            validIds.has(jid) &&
            myJobsArr.some((n) => sameEnquiryItemName(n, j.itemName))
        );
    });
    if (!editableInLeadTree.length) return null;
    if (editableInLeadTree.some((j) => String(j.id) === String(selectedLeadId))) {
        return selectedLeadId;
    }
    const depthFromSelectedRoot = (job) => {
        let d = 0;
        let cur = job;
        const rootN = nid(selectedLeadId);
        while (cur && nid(cur.id) !== rootN) {
            d += 1;
            const pid = nid(cur.parentId);
            cur = pid != null ? jobs.find((p) => nid(p.id) === pid) : null;
        }
        return d;
    };
    editableInLeadTree.sort((a, b) => depthFromSelectedRoot(a) - depthFromSelectedRoot(b));
    return editableInLeadTree[0].id;
}

/** Root passes UI "lead" naming when any sibling uses L-prefixed display names — backend may use leadJobCode only */
const rootPassesLeadNaming = (j, anyRootHasLPrefixInName) => {
    if (!anyRootHasLPrefixInName) return true;
    const name = j.itemName || '';
    if (/^L\d+\s-\s/.test(name)) return true;
    const code = String(j.leadJobCode || j.LeadJobCode || '').trim();
    if (/^L\d+$/i.test(code)) return true;
    return false;
};

const isRootJob = (j) => {
    if (!j) return false;
    const p = j.parentId;
    return p == null || p === '' || p === 0 || p === '0';
};

/** Option IDs from SQL/JSON are often strings — needed for maxId / "newest row" logic */
const optIdNum = (id) => {
    if (id == null || id === '') return NaN;
    const n = Number(id);
    return Number.isFinite(n) ? n : NaN;
};

/**
 * For legacy dedupe: max OptionID per (name, itemName, leadJobName) for rows named Price/Optional only.
 * Do not use a single max across *all* option types — a high-ID custom option was hiding empty Optional/Price rows.
 */
function buildDefaultOptionNameGroupMaxIds(filteredOptions) {
    const m = new Map();
    for (const o of filteredOptions || []) {
        const nameL = (o.name || '').trim().toLowerCase();
        if (nameL !== 'price' && nameL !== 'optional') continue;
        const n = optIdNum(o.id);
        if (!Number.isFinite(n)) continue;
        const k = `${nameL}|${(o.itemName || '').trim()}|${(o.leadJobName || '').trim()}`;
        m.set(k, Math.max(n, m.get(k) || 0));
    }
    return m;
}

/** Trim-only alias (legacy name kept for call sites). */
const stripJobItemPrefix = (n) => String(n || '').trim();

/**
 * Compare option/job labels for grouping (not mutating stored values).
 * Exact trim + case-insensitive first; then treat `L3 - BMS Project` vs `BMS Project` as the same row when prefixes align.
 */
const sameEnquiryItemName = (optItem, jobItem) => {
    const o = String(optItem || '').trim();
    const j = String(jobItem || '').trim();
    if (!o || !j) return false;
    if (o.toLowerCase() === j.toLowerCase()) return true;
    const stripPrefix = (s) =>
        String(s || '')
            .trim()
            .replace(/^(L\d+|Sub Job)\s*-\s*/i, '')
            .trim()
            .toLowerCase();
    const a = stripPrefix(o);
    const b = stripPrefix(j);
    return a.length > 0 && a === b;
};

/**
 * List "Division" filter = effective own job: match EnquiryFor `itemName` to that label so the
 * price screen matches what that division's user would see (e.g. BMS subjob under Civil→HVAC).
 */
function resolveEffectiveMyJobItemNames(jobs, serverEditableJobs, pricingListDivision) {
    const base = (serverEditableJobs || []).map((s) => (s || '').trim()).filter(Boolean);
    const div = (pricingListDivision || '').trim();
    if (!div || !Array.isArray(jobs) || !jobs.length) return base;
    const matches = [];
    for (const j of jobs) {
        const n = (j.itemName || '').trim();
        if (n && sameEnquiryItemName(n, div)) {
            matches.push(n);
        }
    }
    return matches.length > 0 ? [...new Set(matches)] : base;
}

/** Stable map key for job id (number vs string) */
const jobKey = (id) => {
    const n = nid(id);
    return n != null ? String(n) : `k:${String(id)}`;
};

/** One row from getEnquiryPricingList `SubJobPrices` (`label|price|isoDate|level` joined by `;;`). */
function parseSubJobPriceRow(s, index) {
    const parts = String(s).split('|');
    return {
        key: `p-${index}`,
        name: parts[0] ?? '',
        rawPrice: parts[1] ?? '',
        rawDate: parts[2] ?? '',
        level: parseInt(parts[3], 10) || 0,
    };
}

/**
 * Pending / search list: "Customer Name & Total Price" vs "Individual & Subjob Base prices".
 * When any row is indented (level > 0), level-0 lines are treated as customer/total headers and deeper lines as subjob detail.
 * When all rows are level 0 (legacy flat list), show everything in the first column only.
 */
function splitSubJobPricesForListColumns(subJobPricesStr) {
    const rows = (subJobPricesStr || '')
        .split(';;')
        .filter(Boolean)
        .map(parseSubJobPriceRow);
    const hasIndented = rows.some((r) => r.level > 0);
    return {
        customerAndTotalRows: hasIndented ? rows.filter((r) => r.level === 0) : rows,
        individualRows: hasIndented ? rows.filter((r) => r.level > 0) : [],
    };
}

/** Department spec status from `getEnquiryPricingList` (Partial / None / All Priced). */
function pricingListSpecStatusMeta(enq) {
    const rawSpecStatus = enq?.UserSpecPricingSummaryStatus ?? enq?.userSpecPricingSummaryStatus;
    if (!rawSpecStatus) return null;
    const specStatusDisplay =
        rawSpecStatus === 'None Priced'
            ? 'None Priced for Ownjob'
            : rawSpecStatus === 'Partial Priced'
              ? 'Partial Priced for Ownjob'
              : rawSpecStatus === 'All Quoted'
                ? 'All Quoted for this Ownjob'
                : rawSpecStatus === 'All Priced'
                  ? 'All Priced for Ownjob'
                  : rawSpecStatus;
    const specStatusColor =
        rawSpecStatus === 'All Quoted' || rawSpecStatus === 'All Priced'
            ? '#16a34a'
            : rawSpecStatus === 'None Priced'
              ? '#dc2626'
              : rawSpecStatus === 'Partial Priced'
                ? '#ca8a04'
                : '#64748b';
    return { rawSpecStatus, specStatusDisplay, specStatusColor };
}

/** "{None|Partial|All} Priced" + "for Ownjob" on two lines (matches Quote list pattern). */
function pricingListSpecStatusTwoLines(specMeta) {
    if (!specMeta) return null;
    const raw = specMeta.rawSpecStatus;
    const tail = 'for Ownjob';
    if (raw === 'None Priced') return { line1: 'None Priced', line2: tail };
    if (raw === 'Partial Priced') return { line1: 'Partial Priced', line2: tail };
    if (raw === 'All Quoted') return { line1: 'All Quoted', line2: 'for this Ownjob' };
    if (raw === 'All Priced') return { line1: 'All Priced', line2: tail };
    const display = String(specMeta.specStatusDisplay || '').trim();
    return display ? { line1: display, line2: '' } : null;
}

function tryParsePricingListDisplay(enq) {
    const raw = enq?.PricingListDisplayJson ?? enq?.pricingListDisplayJson;
    if (!raw || typeof raw !== 'string') return null;
    try {
        const o = JSON.parse(raw);
        if (!o || !Array.isArray(o.customerTotals) || !Array.isArray(o.jobForest)) return null;
        return o;
    } catch {
        return null;
    }
}

/** Latest `updatedAt` among priced nodes in list JSON `jobForest` (matches Individual & Subjob column). */
function maxUpdatedMsInJobForest(nodes) {
    if (!Array.isArray(nodes) || nodes.length === 0) return NaN;
    let max = NaN;
    const walk = (node) => {
        if (!node) return;
        if (node.hasPrice && Number(node.price) > 0 && node.updatedAt) {
            const t = new Date(node.updatedAt).getTime();
            if (Number.isFinite(t)) max = Number.isFinite(max) ? Math.max(max, t) : t;
        }
        const kids = Array.isArray(node.children) ? node.children : [];
        for (const ch of kids) walk(ch);
    };
    for (const n of nodes) walk(n);
    return max;
}

/**
 * Max timestamp (ms) shown in "Individual & Subjob Base prices": JSON `jobForest` priced lines,
 * or legacy `SubJobPrices` indented rows (level > 0 with a positive price).
 */
function getLatestIndividualSubjobBasePriceUpdatedMs(enq) {
    const structured = tryParsePricingListDisplay(enq);
    let max = NaN;
    if (structured?.customerTotals?.length) {
        for (const c of structured.customerTotals) {
            if (!c?.updatedAt) continue;
            const t = new Date(c.updatedAt).getTime();
            if (Number.isFinite(t)) max = Number.isFinite(max) ? Math.max(max, t) : t;
        }
    }
    if (structured?.jobForest?.length) {
        const forestMs = maxUpdatedMsInJobForest(structured.jobForest);
        if (Number.isFinite(forestMs)) max = Number.isFinite(max) ? Math.max(max, forestMs) : forestMs;
    }
    if (Number.isFinite(max)) return max;
    const split = splitSubJobPricesForListColumns(enq?.SubJobPrices);
    max = NaN;
    for (const row of split.individualRows) {
        const isUpdated =
            row.rawPrice && row.rawPrice !== 'Not Updated' && parseFloat(row.rawPrice) > 0;
        if (!isUpdated || !row.rawDate) continue;
        const t = new Date(row.rawDate).getTime();
        if (Number.isFinite(t)) max = Number.isFinite(max) ? Math.max(max, t) : t;
    }
    return max;
}

const PRICING_LIST_FILTER_KEYS_SEARCH = [
    'requestNo',
    'projectName',
    'customerName',
    'latestPriceUpdated',
    'clientName',
    'consultantName',
    'enquiryDateCol',
];

const PRICING_LIST_FILTER_KEYS_PENDING = [
    'requestNo',
    'projectName',
    'customerName',
    'latestPriceUpdated',
    'clientName',
    'consultantName',
    'dueDateCol',
];

function formatPricingListFilterDate(v) {
    if (!v) return '—';
    try {
        const d = new Date(v);
        if (Number.isNaN(d.getTime())) return '—';
        return format(d, 'dd-MMM-yyyy');
    } catch {
        return '—';
    }
}

function getPricingListFilterValue(row, key) {
    if (!row) return '—';
    switch (key) {
        case 'requestNo':
            return String(row.RequestNo || '—').trim() || '—';
        case 'projectName':
            return String(row.ProjectName || '—').trim() || '—';
        case 'customerName': {
            const structured = tryParsePricingListDisplay(row);
            if (structured?.customerTotals?.length) {
                const names = structured.customerTotals
                    .map((c) => String(c.name || c.customerName || c.label || '').trim())
                    .filter(Boolean);
                if (names.length) return names.join(', ');
            }
            return String(row.CustomerName || '—').trim() || '—';
        }
        case 'latestPriceUpdated': {
            const ms = getLatestIndividualSubjobBasePriceUpdatedMs(row);
            if (!Number.isFinite(ms)) return '—';
            return formatPricingListFilterDate(new Date(ms));
        }
        case 'clientName':
            return String(row.ClientName || '—').trim() || '—';
        case 'consultantName':
            return String(row.ConsultantName || '—').trim() || '—';
        case 'enquiryDateCol':
            return formatPricingListFilterDate(row.EnquiryDate);
        case 'dueDateCol':
            return formatPricingListFilterDate(row.DueDate);
        default:
            return '—';
    }
}

function sortPricingEnquiryListRows(rows, { field, direction }) {
    return [...(rows || [])].sort((a, b) => {
        if (field === 'LatestPriceUpdated') {
            const aMs = getLatestIndividualSubjobBasePriceUpdatedMs(a);
            const bMs = getLatestIndividualSubjobBasePriceUpdatedMs(b);
            const aOk = Number.isFinite(aMs);
            const bOk = Number.isFinite(bMs);
            if (!aOk && !bOk) return 0;
            if (!aOk) return 1;
            if (!bOk) return -1;
            if (aMs < bMs) return direction === 'asc' ? -1 : 1;
            if (aMs > bMs) return direction === 'asc' ? 1 : -1;
            return 0;
        }
        if (field === 'RequestNo') {
            const ra = a?.RequestNo ?? a?.requestNo;
            const rb = b?.RequestNo ?? b?.requestNo;
            const sa = String(ra ?? '').trim();
            const sb = String(rb ?? '').trim();
            const na = Number(sa);
            const nb = Number(sb);
            const aOk = sa !== '' && Number.isFinite(na);
            const bOk = sb !== '' && Number.isFinite(nb);
            if (!aOk && !bOk) {
                const as = sa.toLowerCase();
                const bs = sb.toLowerCase();
                if (as < bs) return direction === 'asc' ? -1 : 1;
                if (as > bs) return direction === 'asc' ? 1 : -1;
                return 0;
            }
            if (!aOk) return 1;
            if (!bOk) return -1;
            if (na < nb) return direction === 'asc' ? -1 : 1;
            if (na > nb) return direction === 'asc' ? 1 : -1;
            return 0;
        }
        let aVal = a[field];
        let bVal = b[field];
        if (field === 'DueDate' || field === 'EnquiryDate') {
            aVal = aVal ? new Date(aVal).getTime() : Infinity;
            bVal = bVal ? new Date(bVal).getTime() : Infinity;
        } else {
            aVal = (aVal || '').toString().toLowerCase();
            bVal = (bVal || '').toString().toLowerCase();
        }
        if (aVal < bVal) return direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return direction === 'asc' ? 1 : -1;
        return 0;
    });
}

/** Align with server `normPricingCustomerKey` on root labels — one block per customer + L# in column 4. */
function normPricingJobForestRootKey(label) {
    return String(label || '')
        .replace(/\s*\(L\d+\)\s*$/i, '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

function scorePricedJobNode(node) {
    if (!node) return 0;
    const p = Number(node.price);
    let s = node.hasPrice && Number.isFinite(p) && p > 0 ? 1 + p : 0;
    const kids = Array.isArray(node.children) ? node.children : [];
    for (const ch of kids) {
        s += scorePricedJobNode(ch);
    }
    return s;
}

function dedupePricingJobForestRoots(nodes) {
    if (!Array.isArray(nodes) || nodes.length < 2) return nodes;
    const rootKey = (n) => {
        const jid = String(n?.jobId ?? '').trim();
        const raw = String(n?.label || '').trim();
        const labelKey = raw ? normPricingJobForestRootKey(raw) : '';
        if (jid && jid !== 'undefined') return `${labelKey || 'job'}\t${jid}`;
        if (!raw) return `id:${String(n?.jobId ?? '')}`;
        return labelKey || `id:${String(n?.jobId ?? '')}`;
    };
    const best = new Map();
    for (const n of nodes) {
        const k = rootKey(n);
        const sc = scorePricedJobNode(n);
        const prev = best.get(k);
        if (!prev || sc > prev.sc) best.set(k, { node: n, sc });
    }
    const order = [];
    const seen = new Set();
    for (const n of nodes) {
        const k = rootKey(n);
        if (seen.has(k)) continue;
        seen.add(k);
        order.push(k);
    }
    return order.map((k) => best.get(k).node);
}

function PricingListCustomerTotalsFromJson({ items, priceFixedDecimals }) {
    if (!items || items.length === 0) {
        return <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>—</span>;
    }
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                minWidth: 'max-content',
            }}
        >
            {items.map((it, i) => {
                const declined = !!it.declinedToQuote;
                const total = Number(it.total);
                const has = !declined && Number.isFinite(total) && total > 0;
                let displayPrice = '';
                if (has) {
                    displayPrice =
                        priceFixedDecimals != null
                            ? total.toLocaleString('en-US', {
                                  minimumFractionDigits: priceFixedDecimals,
                                  maximumFractionDigits: priceFixedDecimals,
                              })
                            : total.toLocaleString(undefined, { minimumFractionDigits: 2 });
                }
                let displayDate = '';
                if (it.updatedAt) {
                    try {
                        displayDate = format(new Date(it.updatedAt), 'dd-MMM-yy hh:mm a');
                    } catch (e) {
                        console.error('Date parse error:', e);
                    }
                }
                const badgeLabel = declined ? 'Decline to Quote' : has ? `BD ${displayPrice}` : 'Not Updated';
                const badgeStyle = declined
                    ? { color: '#9a3412', fontStyle: 'normal', background: '#ffedd5' }
                    : has
                      ? { color: '#166534', fontStyle: 'normal', background: '#dcfce7' }
                      : { color: '#94a3b8', fontStyle: 'italic', background: '#f1f5f9' };
                return (
                    <div
                        key={`ct-${i}`}
                        style={{
                            fontSize: '11px',
                            display: 'flex',
                            flexDirection: 'row',
                            alignItems: 'center',
                            flexWrap: 'nowrap',
                            gap: '4px',
                            lineHeight: 1.1,
                            whiteSpace: 'nowrap',
                        }}
                    >
                        <span style={{ fontWeight: '600', color: '#475569' }}>{String(it.label || '').trim()}:</span>
                        <span
                            style={{
                                ...badgeStyle,
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '10px',
                            }}
                        >
                            {badgeLabel}
                        </span>
                        {(has || declined) && displayDate && (
                            <span style={{ color: '#94a3b8', fontSize: '10px', lineHeight: 1.05 }}>({displayDate})</span>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function PricingListJobForestFromJson({ nodes, priceFixedDecimals }) {
    const forestRoots = dedupePricingJobForestRoots(nodes);
    if (!forestRoots || forestRoots.length === 0) {
        return <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>—</span>;
    }

    const formatAmt = (n) => {
        const num = Number(n);
        if (!Number.isFinite(num)) return '';
        return priceFixedDecimals != null
            ? num.toLocaleString('en-US', {
                  minimumFractionDigits: priceFixedDecimals,
                  maximumFractionDigits: priceFixedDecimals,
              })
            : num.toLocaleString(undefined, { minimumFractionDigits: 2 });
    };

    const renderNode = (node, depth) => {
        const declined = !!node.declinedToQuote;
        const has = !declined && node.hasPrice && Number(node.price) > 0;
        let displayDate = '';
        if (node.updatedAt) {
            try {
                displayDate = format(new Date(node.updatedAt), 'dd-MMM-yy hh:mm a');
            } catch (e) {
                console.error('Date parse error:', e);
            }
        }
        const by = String(node.pricedBy ?? node.updatedBy ?? '').trim();
        const kids = Array.isArray(node.children) ? node.children : [];
        const badgeLabel = declined ? 'Decline to Quote' : has ? `BD ${formatAmt(node.price)}` : 'Not Updated';
        const badgeStyle = declined
            ? { color: '#9a3412', fontStyle: 'normal', background: '#ffedd5' }
            : has
              ? { color: '#166534', fontStyle: 'normal', background: '#dcfce7' }
              : { color: '#94a3b8', fontStyle: 'italic', background: '#f1f5f9' };
        return (
            <div key={String(node.jobId)} style={{ marginBottom: '1px' }}>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px',
                        flexWrap: 'nowrap',
                        marginLeft: depth * 12,
                        fontSize: '11px',
                        lineHeight: 1.08,
                        whiteSpace: 'nowrap',
                        minWidth: 'max-content',
                    }}
                >
                    {depth > 0 && (
                        <span style={{ color: '#94a3b8', marginRight: '2px', fontSize: '10px', flexShrink: 0 }}>→</span>
                    )}
                    <span style={{ fontWeight: depth === 0 ? '600' : '500', color: '#475569', flexShrink: 0 }}>
                        {String(node.label || '').trim()}:
                    </span>
                    <span
                        style={{
                            ...badgeStyle,
                            marginLeft: '2px',
                            padding: '1px 4px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            flexShrink: 0,
                        }}
                    >
                        {badgeLabel}
                    </span>
                    {(has || declined) && displayDate && (
                        <span
                            style={{
                                marginLeft: '3px',
                                color: '#94a3b8',
                                fontSize: '10px',
                                lineHeight: 1.05,
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                            }}
                        >
                            ({displayDate})
                            {by ? (
                                <span style={{ color: '#800000', marginLeft: '4px', fontWeight: '500' }}>{by}</span>
                            ) : null}
                        </span>
                    )}
                </div>
                {kids.length > 0 ? <div style={{ marginTop: '0px' }}>{kids.map((ch) => renderNode(ch, depth + 1))}</div> : null}
            </div>
        );
    };

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: forestRoots.length > 1 ? '4px' : '0',
                minWidth: 'max-content',
            }}
        >
            {forestRoots.map((n, idx) => (
                <div key={`${String(n.jobId)}-${idx}`}>{renderNode(n, 0)}</div>
            ))}
        </div>
    );
}

function PricingListSubJobPriceLines({ rows, priceFixedDecimals }) {
    if (!rows || rows.length === 0) {
        return <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>—</span>;
    }
    const lines = rows.map((row, i) => {
        const { name, rawPrice, rawDate, level } = row;
        const isUpdated = rawPrice && rawPrice !== 'Not Updated' && parseFloat(rawPrice) > 0;

        let displayPrice = rawPrice;
        if (isUpdated) {
            const num = parseFloat(rawPrice);
            if (!isNaN(num)) {
                displayPrice =
                    priceFixedDecimals != null
                        ? num.toLocaleString('en-US', {
                              minimumFractionDigits: priceFixedDecimals,
                              maximumFractionDigits: priceFixedDecimals,
                          })
                        : num.toLocaleString(undefined, { minimumFractionDigits: 2 });
            }
        }

        let displayDate = '';
        if (rawDate) {
            try {
                displayDate = format(new Date(rawDate), 'dd-MMM-yy hh:mm a');
            } catch (e) {
                console.error('Date parse error:', e);
            }
        }

        return (
            <div
                key={row.key || `p-${i}`}
                style={{
                    fontSize: '11px',
                    marginBottom: '1px',
                    whiteSpace: 'nowrap',
                    marginLeft: `${level * 12}px`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px',
                    lineHeight: 1.08,
                    flexWrap: 'nowrap',
                    minWidth: 'max-content',
                }}
            >
                {level > 0 && <span style={{ color: '#94a3b8', marginRight: '2px', flexShrink: 0 }}>↳</span>}
                <span style={{ fontWeight: '600', color: '#475569', flexShrink: 0 }}>{name}:</span>
                <span
                    style={{
                        color: isUpdated ? '#166534' : '#94a3b8',
                        marginLeft: '2px',
                        fontStyle: isUpdated ? 'normal' : 'italic',
                        background: isUpdated ? '#dcfce7' : '#f1f5f9',
                        padding: '1px 4px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        flexShrink: 0,
                    }}
                >
                    {isUpdated ? `BD ${displayPrice}` : 'Not Updated'}
                </span>
                {isUpdated && displayDate && (
                    <span style={{ marginLeft: '3px', color: '#94a3b8', fontSize: '10px', lineHeight: 1.05, flexShrink: 0 }}>({displayDate})</span>
                )}
            </div>
        );
    });
    return <>{lines}</>;
}

const PricingForm = ({ openContext = null }) => {
    const { currentUser } = useAuth();

    /**
     * Email sent as `userEmail` on /api/pricing/* — same source as the header (session `currentUser`),
     * not `localStorage` `currentUserEmail`, so pending list matches what the user sees top-right.
     */
    const resolvePricingUserEmail = useCallback(() => {
        return (currentUser?.EmailId || currentUser?.email || currentUser?.MailId || '').trim();
    }, [currentUser?.EmailId, currentUser?.email, currentUser?.MailId]);


    // Search / list state (aligned with Quote list: category, criteria, price-update date range)
    const [pricingListCategory, setPricingListCategory] = useState(PRICING_LIST_CATEGORY.PENDING);
    /** Do not hydrate from localStorage while default category is Pending — stale text looked like an active filter. */
    const [pricingListSearchCriteria, setPricingListSearchCriteria] = useState('');
    const [pricingListDateFrom, setPricingListDateFrom] = useState('');
    const [pricingListDateTo, setPricingListDateTo] = useState('');
    const [pricingSearchAttempted, setPricingSearchAttempted] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [pendingRequests, setPendingRequests] = useState([]); // Pending List State
    /** Start true so first paint does not flash "No pending items" before the initial fetch runs. */
    const [pendingListLoading, setPendingListLoading] = useState(true);
    const [pendingListError, setPendingListError] = useState(null);
    /** Shown when GET /api/pricing/:id fails (e.g. 500) — replaces broken `setError` reference. */
    const [pricingLoadError, setPricingLoadError] = useState(null);
    const [pendingSortConfig, setPendingSortConfig] = useState({
        field: 'LatestPriceUpdated',
        direction: 'desc',
    });
    const [searchSortConfig, setSearchSortConfig] = useState({
        field: 'LatestPriceUpdated',
        direction: 'desc',
    });
    /** List filter: Master_EnquiryFor.DepartmentName; empty = all (unchanged). Options from /api/pricing/list/divisions */
    const [pricingListDivisions, setPricingListDivisions] = useState([]);
    const [pricingListDivisionsLoading, setPricingListDivisionsLoading] = useState(false);
    const [pricingListDivision, setPricingListDivision] = useState(
        () => localStorage.getItem('pricing_listDivision') || ''
    );
    /** Pending list waits for this so the first fetch uses the resolved Division (avoids flicker + empty after refetch). */
    const [pricingDivisionBootstrapDone, setPricingDivisionBootstrapDone] = useState(false);
    const searchRef = useRef(null);
    const pricingListDivisionRef = useRef(pricingListDivision);
    const pricingListSearchCriteriaRef = useRef(pricingListSearchCriteria);
    const pricingSearchColFiltersClearRef = useRef(() => {});
    const pricingPendingColFiltersClearRef = useRef(() => {});
    useEffect(() => {
        pricingListDivisionRef.current = pricingListDivision;
    }, [pricingListDivision]);
    useEffect(() => {
        pricingListSearchCriteriaRef.current = pricingListSearchCriteria;
    }, [pricingListSearchCriteria]);

    // Pricing state
    const [selectedEnquiry, setSelectedEnquiry] = useState(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [pricingData, setPricingData] = useState(null);
    const [values, setValues] = useState({});
    const valuesRef = useRef(values);
    const [declineToQuote, setDeclineToQuote] = useState({});
    const declineToQuoteRef = useRef(declineToQuote);
    const draftValuesByCustomerRef = useRef({}); // { [normalizedCustomer]: { [cellKey]: value } }
    const draftDeclineByCustomerRef = useRef({}); // { [normalizedCustomer]: { [cellKey]: boolean } }
    useEffect(() => {
        valuesRef.current = values;
    }, [values]);
    useEffect(() => {
        declineToQuoteRef.current = declineToQuote;
    }, [declineToQuote]);
    const [newOptionNames, setNewOptionNames] = useState({});
    const [newOptionPrices, setNewOptionPrices] = useState({});
    const [showNewOptionInputs, setShowNewOptionInputs] = useState({});
    // Tracks the EnquiryFor jobId for each open "+ Add" draft so Save All can auto-commit drafts
    // even when the section `groupName` includes an `Lx - ` prefix (addOption's name lookup misses those).
    const [pendingAddJobIds, setPendingAddJobIds] = useState({});
    const [focusedCell, setFocusedCell] = useState(null); // tracks which price input is focused

    // Customer state
    const [selectedCustomer, setSelectedCustomer] = useState(() => localStorage.getItem('pricing_selectedCustomer') || '');
    const [addingCustomer, setAddingCustomer] = useState(false);
    const [newCustomerName, setNewCustomerName] = useState('');
    const [customerSuggestions, setCustomerSuggestions] = useState([]);
    const [selectedLeadId, setSelectedLeadId] = useState(() => {
        const saved = localStorage.getItem('pricing_selectedLeadId');
        return saved ? parseInt(saved) : null;
    });
    /** True after opening an enquiry from Pending / Search — list UI is hidden so the grid is its own screen. */
    const [pricingEditorStandalone, setPricingEditorStandalone] = useState(false);

    /** When list Division is set (e.g. BMS Project), own-job scope matches that EnquiryFor line — same UX as that division's user. */
    const effectiveMyJobItemNames = React.useMemo(
        () =>
            resolveEffectiveMyJobItemNames(
                pricingData?.jobs,
                pricingData?.access?.editableJobs,
                pricingListDivision
            ),
        [pricingData?.jobs, pricingData?.access?.editableJobs, pricingListDivision]
    );

    // --- SHARED HELPERS (Step 4522) ---
    const findLeadJobName = (jobOrItemName) =>
        pricingData?.jobs?.length ? findLeadRootLabelForPricingMatch(jobOrItemName, pricingData.jobs) : null;

    // -- Persistence --
    useEffect(() => {
        localStorage.setItem('pricing_listSearchCriteria', pricingListSearchCriteria);
    }, [pricingListSearchCriteria]);

    useEffect(() => {
        if (pricingListDivision && pricingListDivision.trim()) {
            localStorage.setItem('pricing_listDivision', pricingListDivision.trim());
        } else {
            localStorage.removeItem('pricing_listDivision');
        }
    }, [pricingListDivision]);

    useEffect(() => {
        localStorage.setItem('pricing_selectedCustomer', selectedCustomer);
    }, [selectedCustomer]);

    useEffect(() => {
        if (selectedLeadId) localStorage.setItem('pricing_selectedLeadId', selectedLeadId);
        else localStorage.removeItem('pricing_selectedLeadId');
    }, [selectedLeadId]);


    // Debounce timer
    const debounceRef = useRef(null);
    /** After lead dropdown changes: one combined reload (tab + values). Avoids double fetch + double flicker. */
    const leadChangeReloadPendingRef = useRef(false);

    const refreshPendingRequests = useCallback(async () => {
        const userEmail = resolvePricingUserEmail();
        setPendingListError(null);
        if (!userEmail) {
            console.warn('[Pricing] No session email for pending list — currentUser.EmailId/email is empty; sign in again.');
            setPendingRequests([]);
            setPendingListError('No email on your session profile. Sign in again so pending pricing can load.');
            setPendingListLoading(false);
            return;
        }
        setPendingListLoading(true);
        try {
            const divQ = pricingListDivision.trim()
                ? `&division=${encodeURIComponent(pricingListDivision.trim())}`
                : '';
            const res = await fetch(
                `${API_BASE}/api/pricing/list/pending?userEmail=${encodeURIComponent(userEmail)}${divQ}`
            );
            let data = null;
            try {
                data = await res.json();
            } catch {
                data = null;
            }
            if (!res.ok) {
                setPendingRequests([]);
                const msg =
                    data && typeof data.error === 'string'
                        ? data.error
                        : `Could not load pending pricing (${res.status}).`;
                setPendingListError(msg);
                return;
            }
            setPendingRequests(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Error fetching pending requests:', err);
            setPendingRequests([]);
            setPendingListError('Network error while loading pending pricing.');
        } finally {
            setPendingListLoading(false);
        }
    }, [resolvePricingUserEmail, pricingListDivision]);

    const closePricingEditor = useCallback(() => {
        setPricingEditorStandalone(false);
        setPricingData(null);
        setPricingLoadError(null);
        setSelectedEnquiry(null);
        setSelectedLeadId(null);
        try {
            localStorage.removeItem('pricing_selectedLeadId');
        } catch {
            /* ignore */
        }
        refreshPendingRequests();
    }, [refreshPendingRequests]);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (searchRef.current && !searchRef.current.contains(e.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);

        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Division dropdown options (CC: distinct Master_EnquiryFor.DepartmentName for CC mail rows; else: Master_ConcernedSE.Department for the user)
    useEffect(() => {
        const email = resolvePricingUserEmail();
        if (!email) {
            setPricingListDivisions([]);
            setPricingListDivision('');
            setPricingDivisionBootstrapDone(true);
            return;
        }
        let cancelled = false;
        setPricingDivisionBootstrapDone(false);
        (async () => {
            setPricingListDivisionsLoading(true);
            try {
                const res = await fetch(
                    `${API_BASE}/api/pricing/list/divisions?userEmail=${encodeURIComponent(email)}`
                );
                const data = res.ok ? await res.json() : { divisions: [], isCcUser: false };
                if (cancelled) return;
                const list = Array.isArray(data.divisions) ? data.divisions : [];
                setPricingListDivisions(list);
                setPricingListDivision((prev) => {
                    if (!list.length) return '';
                    const saved = localStorage.getItem('pricing_listDivision') || '';
                    if (saved && list.includes(saved)) return saved;
                    if (prev && list.includes(prev)) return prev;
                    return list[0];
                });
            } catch {
                if (!cancelled) {
                    setPricingListDivisions([]);
                    setPricingListDivision('');
                }
            } finally {
                if (!cancelled) {
                    setPricingListDivisionsLoading(false);
                    setPricingDivisionBootstrapDone(true);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [currentUser, resolvePricingUserEmail]);

    useEffect(() => {
        if (!pricingDivisionBootstrapDone) return;
        refreshPendingRequests();
    }, [currentUser, refreshPendingRequests, pricingDivisionBootstrapDone]);

    // Re-fetch suggestions when division changes (Search mode) with non-empty criteria — criteria typing uses handlePricingListCriteriaInput debounce
    useEffect(() => {
        if (pricingListCategory !== PRICING_LIST_CATEGORY.SEARCH) return;
        const v0 = pricingListSearchCriteriaRef.current;
        if (!(v0 && String(v0).trim().length)) return;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        const t = setTimeout(async () => {
            try {
                const userEmail = resolvePricingUserEmail();
                if (!userEmail) return;
                const v = String(pricingListSearchCriteriaRef.current || '').trim();
                if (v.length < 1) return;
                const div = pricingListDivisionRef.current
                    ? String(pricingListDivisionRef.current).trim()
                    : '';
                const divQ = div ? `&division=${encodeURIComponent(div)}` : '';
                const res = await fetch(
                    `${API_BASE}/api/pricing/list?search=${encodeURIComponent(v)}&userEmail=${encodeURIComponent(userEmail)}&pendingOnly=false${divQ}`
                );
                if (res.ok) {
                    const data = await res.json();
                    setSuggestions(data.slice(0, 10));
                    setShowSuggestions(Array.isArray(data) && data.length > 0);
                }
            } catch (err) {
                console.error('Suggestion error (division):', err);
            }
        }, 300);
        return () => clearTimeout(t);
    }, [pricingListDivision, pricingListCategory, resolvePricingUserEmail]);



    // Suggestions while typing (Search Pricing mode only)
    const handlePricingListCriteriaInput = (value) => {
        setPricingListSearchCriteria(value);
        setSuggestions([]);
        if (!value.trim()) {
            setSearchResults([]);
            setPricingData(null);
        }

        if (pricingListCategory !== PRICING_LIST_CATEGORY.SEARCH) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }

        if (debounceRef.current) clearTimeout(debounceRef.current);

        const shouldSuggest = value.trim().length >= 1;

        if (shouldSuggest) {
            debounceRef.current = setTimeout(async () => {
                try {
                    const userEmail = resolvePricingUserEmail();
                    const div = (pricingListDivisionRef.current || '').trim();
                    const divQ = div ? `&division=${encodeURIComponent(div)}` : '';
                    const res = await fetch(
                        `${API_BASE}/api/pricing/list?search=${encodeURIComponent(value.trim())}&userEmail=${encodeURIComponent(userEmail)}&pendingOnly=false${divQ}`
                    );
                    if (res.ok) {
                        const data = await res.json();
                        setSuggestions(data.slice(0, 10));
                        setShowSuggestions(data.length > 0);
                    }
                } catch (err) {
                    console.error('Suggestion error:', err);
                }
            }, 300);
        } else {
            setSuggestions([]);
            setShowSuggestions(false);
        }
    };

    const handleSelectSuggestion = (enq) => {
        setPricingListSearchCriteria(String(enq.RequestNo || ''));
        setSuggestions([]);
        setShowSuggestions(false);
        setSearchResults([enq]);
    };

    const handlePricingListSearch = async () => {
        if (pricingListCategory !== PRICING_LIST_CATEGORY.SEARCH) return;
        setPricingEditorStandalone(false);
        const q = pricingListSearchCriteria.trim();
        const df = (pricingListDateFrom || '').trim();
        const dt = (pricingListDateTo || '').trim();
        if (!q && !(df && dt)) {
            setSearchResults([]);
            setPricingSearchAttempted(false);
            return;
        }
        setPricingSearchAttempted(true);
        setShowSuggestions(false);
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
            debounceRef.current = null;
        }
        if (searching) return;
        setSearching(true);
        setPricingData(null);

        try {
            const userEmail = resolvePricingUserEmail();
            const params = new URLSearchParams();
            params.set('userEmail', userEmail);
            params.set('pendingOnly', 'false');
            if (q) params.set('search', q);
            if (df) params.set('dateFrom', df);
            if (dt) params.set('dateTo', dt);
            if (pricingListDivision.trim()) params.set('division', pricingListDivision.trim());
            const res = await fetch(`${API_BASE}/api/pricing/list?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setSearchSortConfig({ field: 'LatestPriceUpdated', direction: 'desc' });
                setSearchResults(Array.isArray(data) ? data : []);
                setSuggestions([]);
            } else {
                setSearchResults([]);
            }
        } catch (err) {
            console.error('Pricing list search error:', err);
            alert('Search failed. Please try again.');
            setSearchResults([]);
        } finally {
            setSearching(false);
        }
    };

    const handlePricingListClear = () => {
        setPricingEditorStandalone(false);
        setPricingListSearchCriteria('');
        setPricingListDateFrom('');
        setPricingListDateTo('');
        setSearchResults([]);
        setPricingListCategory(PRICING_LIST_CATEGORY.PENDING);
        setPricingSearchAttempted(false);
        setSuggestions([]);
        setShowSuggestions(false);
        setPricingData(null);
        setPricingLoadError(null);
        setSelectedEnquiry(null);
        setValues({});
        setDeclineToQuote({});
        draftValuesByCustomerRef.current = {};
        draftDeclineByCustomerRef.current = {};
        setSelectedCustomer('');
        setAddingCustomer(false);
        setNewCustomerName('');
        pricingSearchColFiltersClearRef.current?.();
        pricingPendingColFiltersClearRef.current?.();
        refreshPendingRequests();
    };

    // Load pricing for selected enquiry
    const loadPricing = async (requestNo, customerName = null, preserveValues = null, loadOptions = null) => {
        const ignoreExistingLeadSelection = loadOptions?.ignoreExistingLeadSelection === true;
        const forcePreserveZeroKeys = new Set(loadOptions?.forcePreserveZeroKeys || []);
        const preserveSourceCustomerKey = normalizePricingCustomerKey(loadOptions?.preserveSourceCustomerKey || '');
        const silentRefresh = loadOptions?.silentRefresh === true;
        if (!silentRefresh) {
            setLoading(true);
            setPricingLoadError(null);
        }
        setSelectedEnquiry(requestNo);

        try {
            const userEmail = resolvePricingUserEmail();
            const divQ =
                pricingListDivision.trim() !== ''
                    ? `&division=${encodeURIComponent(pricingListDivision.trim())}`
                    : '';
            const url = `${API_BASE}/api/pricing/${encodeURIComponent(requestNo)}?userEmail=${encodeURIComponent(userEmail)}${divQ}${customerName ? `&customerName=${encodeURIComponent(customerName)}` : ''}`;
            // Always bypass HTTP cache — stale 304 bodies omit freshly POSTed EPO rows so Save All cannot resolve OptionID.
            const res = await fetch(url, { cache: 'no-store' });

            if (!res.ok) {
                let errMessage = `Failed to load pricing (${res.status})`;
                let errPayload = null;
                try {
                    errPayload = await res.json();
                    console.error('Failed to load pricing:', errPayload);
                    if (errPayload && (errPayload.error || errPayload.message)) {
                        errMessage = String(errPayload.error || errPayload.message);
                    }
                } catch {
                    /* non-JSON error body */
                }
                if (res.status === 404) {
                    setPricingLoadError(null);
                    setPricingData({
                        enquiry: (errPayload && errPayload.enquiry) || { RequestNo: requestNo },
                        jobs: [],
                        options: [],
                        values: [],
                        customers: [],
                        access: { canEditAll: false, visibleJobs: [], editableJobs: [], hasLeadAccess: false }
                    });
                } else {
                    setPricingData(null);
                    if (!silentRefresh) setPricingLoadError(errMessage);
                }
            } else {
                setPricingLoadError(null);
                const data = await res.json();

                // SANITIZATION: Globally Trim Customer Names to prevent mismatch (Step 944)
                if (data.jobs) data.jobs.forEach(j => { if (j.itemName) j.itemName = j.itemName.trim(); });
                // Note: data.enquiry.customerName might be CSV, don't trim internal commas here, handled by split logic
                if (data.extraCustomers) data.extraCustomers = data.extraCustomers.map(c => c ? c.trim() : c);
                if (data.options) data.options.forEach(o => {
                    if (o.customerName) o.customerName = o.customerName.trim();
                    if (o.itemName) o.itemName = o.itemName.trim();
                    if (o.leadJobName) o.leadJobName = o.leadJobName.trim();
                });
                if (data.access && data.access.editableJobs) data.access.editableJobs = data.access.editableJobs.map(j => j ? j.trim() : j);
                if (data.access && data.access.visibleJobs) data.access.visibleJobs = data.access.visibleJobs.map(j => j ? j.trim() : j);

                if (import.meta.env.DEV) {
                    console.log('[Pricing loadPricing] requestNo', requestNo, 'jobs:', data.jobs?.length, data.jobs?.map((j) => ({
                        id: j.id,
                        itemName: j.itemName,
                        parentId: j.parentId,
                        visible: j.visible,
                        leadJobCode: j.leadJobCode || j.LeadJobCode,
                    })));
                    console.log('[Pricing loadPricing] access.visibleJobs', data.access?.visibleJobs?.length, data.access?.visibleJobs);
                    console.log('[Pricing loadPricing] options:', data.options?.length, 'activeCustomer values keys:', data.values && Object.keys(data.values).length, 'sample', data.values && Object.keys(data.values).slice(0, 8), 'allValues buckets:', data.allValues && Object.keys(data.allValues).length);
                }
                // NOTE: data.values Sanitization (Trim Customer/Lead)
                if (Array.isArray(data.values)) data.values.forEach(v => {
                    if (v.CustomerName) v.CustomerName = v.CustomerName.trim();
                    if (v.LeadJobName) v.LeadJobName = v.LeadJobName.trim();
                });

                // ---------------------------------------------------------
                // HIERARCHY LOGIC: Treat Parent Jobs as Customers
                // ---------------------------------------------------------
                const internalParentCustomers = [];
                if (data.jobs && data.access && data.access.editableJobs) {
                    data.access.editableJobs.forEach(jobName => {
                        const job = data.jobs.find(j => j.itemName === jobName);
                        if (job && job.parentId) {
                            const parent = data.jobs.find(p => p.id === job.parentId);
                            if (parent) {
                                // Clean the parent name (remove L1/L2 prefixes) to use as Customer Name
                                const cleanParent = parent.leadJobCode || parent.LeadJobCode || parent.itemName;
                                if (!internalParentCustomers.includes(cleanParent)) {
                                    internalParentCustomers.push(cleanParent);
                                }
                            }
                        }
                    });
                }

                // Add these internal customers to the main list immediately for display
                if (data.customers) {
                    internalParentCustomers.forEach(pc => {
                        if (!data.customers.includes(pc)) data.customers.push(pc);
                    });
                }
                // ---------------------------------------------------------

                // AUTO-PROVISION TABS (Pricing Sheets)
                // Ensure ALL linked customers (Main + Extra + Internal Parents) have pricing tabs.
                // Only default rows (Base Price / Price / Optional) are replicated per customer — user-named options
                // must come from a single POST (Add / Save), never bulk-synced here (prevents duplicate EPO rows).
                const linkedCustomers = [
                    ...(data.enquiry?.customerName || '').split(','),
                    ...(data.extraCustomers || []).flatMap(c => (c || '').split(',')),
                    ...internalParentCustomers // Include internal parents
                ].map(s => s.trim())
                    .filter(s => s && s.length > 0 && s !== '(Not Assigned)')
                    .filter(s => {
                        // STRICT FILTER: Only include if explicitly in Master/Extra OR is an Internal Parent
                        const masterList = (data.enquiry.customerName || '').split(',').map(c => c.trim());
                        const isMaster = masterList.includes(s);
                        const isExtra = (data.extraCustomers || []).some(ec => (ec || '').split(',').map(c => c.trim()).includes(s));
                        const isInternal = internalParentCustomers.includes(s);
                        return isMaster || isExtra || isInternal;
                    });

                // Build a helper to find the lead job for a given job object or itemName context
                // A job is a lead job if it has no parentId (root job)
                const findLeadJobName = (jobOrItemName) => findLeadRootLabelForPricingMatch(jobOrItemName, data.jobs);

                const isAutoProvisionOptionName = (name) => {
                    const n = String(name || '').trim().toLowerCase();
                    return n === 'base price' || n === 'price' || n === 'optional';
                };

                // Build expected (ItemName, OptionName) pairs per job for **default** option rows only (+ Base Price).
                // Custom option names are excluded so loadPricing does not POST duplicate EnquiryPricingOptions per lead/customer.
                const uniqueOptions = [];
                const seenUo = new Set();

                if (data.jobs) {
                    data.jobs.forEach(j => {
                        const ljName = findLeadJobName(j);
                        const names = new Set(['Base Price']);
                        if (data.options) {
                            data.options.forEach((o) => {
                                if (!o || !o.name) return;
                                if (o.itemName && sameEnquiryItemName(o.itemName, j.itemName) && isAutoProvisionOptionName(o.name)) {
                                    names.add(o.name);
                                }
                            });
                        }

                        names.forEach(name => {
                            const key = `${j.itemName}|${name}|${ljName}`;
                            if (!seenUo.has(key)) {
                                seenUo.add(key);
                                uniqueOptions.push({
                                    itemName: j.itemName,
                                    name: name,
                                    leadJobName: ljName,
                                    enquiryForId: j.id // Added ID to disambiguate
                                });
                            }
                        });
                    });
                }

                // 2. Identify missing options for each Job/Option pair based on their NATURAL customer
                const optionsToCreate = [];
                uniqueOptions.forEach(uo => {
                    const job = data.jobs.find(j => j.id === uo.enquiryForId);
                    if (!job) return;

                    let targetCustomers = [];
                    if (job.parentId && job.parentId !== '0' && job.parentId !== 0) {
                        // Internal Sub-job: Only quote to parent
                        const parent = data.jobs.find(p => p.id === job.parentId);
                        if (parent) {
                            // Clean the parent name (remove L1/L2 prefixes) to use as Customer Name
                            const cleanParent = String(parent.itemName || '').trim();
                            targetCustomers = [cleanParent];
                        }
                    } else {
                        // Root Lead Job: Quote to external clients
                        targetCustomers = linkedCustomers.filter(c => {
                            // Only include external clients (Master/Extra), not internal parents
                            const masterList = (data.enquiry.customerName || '').split(',').map(s => s.trim());
                            const isMaster = masterList.includes(c);
                            const isExtra = (data.extraCustomers || []).some(ec => (ec || '').split(',').map(s => s.trim()).includes(c));
                            return isMaster || isExtra;
                        });
                    }

                    targetCustomers.forEach(custName => {
                        const exists = data.options && data.options.some(o =>
                            o.customerName === custName &&
                            o.itemName === uo.itemName &&
                            o.name === uo.name &&
                            o.leadJobName === uo.leadJobName
                        );

                        if (!exists) {
                            optionsToCreate.push({
                                customerName: custName,
                                itemName: uo.itemName,
                                optionName: uo.name,
                                leadJobName: uo.leadJobName,
                                enquiryForId: uo.enquiryForId // Pass through to provisioning
                            });
                        }
                    });
                });

                // De-dupe payloads to reduce parallel race inserts
                const dedupeKey = (opt) => `${requestNo}__${opt.optionName}__${opt.itemName}__${opt.customerName || ''}__${opt.leadJobName || ''}`;
                const optionsToCreateDeduped = Array.from(
                    new Map(optionsToCreate.map(o => [dedupeKey(o), o])).values()
                );

                if (optionsToCreateDeduped.length > 0) {
                    // Start Provisioning
                    try {
                        // Track originating optionsToCreate entry so we can backfill from it
                        const promises = optionsToCreateDeduped.map((opt) => {
                            const payload = {
                                requestNo: requestNo,
                                optionName: opt.optionName,
                                itemName: opt.itemName,
                                enquiryForId: opt.enquiryForId,         // Pass ID to resolve correctly
                                customerName: opt.customerName,
                                leadJobName: opt.leadJobName || null   // ← include derived leadJobName
                            };
                            return fetch(`${API_BASE}/api/pricing/option`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload)
                            }).then(r => r.ok ? r.json().then(json => ({ json, srcOpt: opt })) : null);
                        });

                        const results = await Promise.all(promises);

                        // Update local data
                        if (!data.options) data.options = [];
                        if (!data.customers) data.customers = []; // Ensure initialized

                        results.forEach(item => {
                            if (!item || !item.json) return;
                            const res = item.json;   // { success, option: { ID, OptionName, ItemName, CustomerName, LeadJobName } }
                            const srcOpt = item.srcOpt;
                            // API returns the DB row nested under res.option
                            const optRow = res.option || res;
                            const realId = optRow.ID || optRow.id;
                            const realName = optRow.OptionName || optRow.optionName || srcOpt.optionName;
                            const realItem = optRow.ItemName || optRow.itemName || srcOpt.itemName;
                            const realCustomer = optRow.CustomerName || optRow.customerName || srcOpt.customerName;
                            const realLeadJob = optRow.LeadJobName || optRow.leadJobName || srcOpt.leadJobName;

                            if (realId) {
                                data.options.push({
                                    id: realId,
                                    name: realName,
                                    itemName: realItem,
                                    customerName: realCustomer,
                                    leadJobName: realLeadJob
                                });
                            }
                            // Add to active customers list if not already there
                            if (realCustomer && !data.customers.includes(realCustomer)) {
                                data.customers.push(realCustomer);
                            }
                        });

                        // If no customer is currently active (e.g. fresh load), select the Main one or first new one
                        if (!data.activeCustomer && data.customers.length > 0) {
                            data.activeCustomer = data.enquiry.customerName || data.customers[0];
                        }

                    } catch (autoErr) {
                        console.error('Auto-provision failed:', autoErr);
                    }
                }

                // --- KEY MIGRATION & CUSTOMER GROUPING ---
                // Process Raw Array into Nested Map: [CustomerName][Key] = Value
                const groupedValues = {}; // { 'Nass': { '204_280': ... }, 'Ahmed': { ... } }

                const rawEpvRows = Array.isArray(data.values) ? data.values : [];

                // OptionID → fallback customer — built only from `EnquiryPricingValues` rows (latest UpdatedAt wins).
                const optionCustomerMap = {};
                const epvCustByOpt = new Map();
                for (const v of rawEpvRows) {
                    const oid = String(v.OptionID ?? v.optionID ?? '');
                    if (!oid) continue;
                    const cn = String(v.CustomerName ?? v.customerName ?? '').trim();
                    if (!cn) continue;
                    const at = new Date(v.UpdatedAt ?? v.updatedAt ?? 0).getTime();
                    const prev = epvCustByOpt.get(oid);
                    if (!prev || at >= prev.at) epvCustByOpt.set(oid, { cust: cn, at });
                }
                epvCustByOpt.forEach((meta, oid) => {
                    optionCustomerMap[String(oid)] = meta.cust;
                });

                /** Unchanged server rows: strict (OptionID, EnquiryForID) is the only reliable key when
                 *  the same `itemName` appears in multiple lead branches. */
                const serverValuesSnapshot = rawEpvRows.map((r) => (r && typeof r === 'object' ? { ...r } : r));

                if (rawEpvRows.length && data.jobs) {
                    rawEpvRows.forEach((v) => {
                        // Resolve customer bucket: **EPV row is authoritative** when CustomerName is set — it reflects what was
                        // saved. Using EPO-only mapping first wrongly buckets rows (e.g. AWAL’s price under Ramada’s tab).
                        const oid = String(v.OptionID ?? v.optionID ?? '');
                        const mapped = optionCustomerMap[oid];
                        const epvCust = String(v.CustomerName ?? v.customerName ?? '').trim();
                        let rawCust;
                        if (epvCust) {
                            rawCust = epvCust;
                        } else if (mapped != null && String(mapped).trim() !== '') {
                            rawCust = String(mapped).trim();
                        } else {
                            const inferred = inferInternalCustomerTabForValueRow(v, data.jobs);
                            const firstEnq = (data.enquiry?.customerName || '').split(',')[0].trim();
                            rawCust = inferred || firstEnq || 'Main';
                        }

                        const cust = rawCust.trim(); // Ensure clean customer name match (Step 937)

                        if (!groupedValues[cust]) groupedValues[cust] = {};

                        // Derive Keys
                        // 1. Strict ID Key
                        if (v.EnquiryForID) {
                            const idKey = `${v.OptionID}_${v.EnquiryForID}`;
                            // Partition by `cust` from EPV customer (see forEach above); rare key collisions per bucket.

                            // Standard Assignment
                            groupedValues[cust][idKey] = v;
                        }

                        // 2. Name / Legacy Keys (Backfill) — only when EnquiryForID is missing. If we have a job ID,
                        // OptionID_EnquiryForID is already set; name-only keys collide when the same ItemName exists
                        // under different lead jobs (e.g. two "BMS Project" rows).
                        if (v.EnquiryForItem) {
                            const jobId = v.EnquiryForID;
                            const job = jobId ? data.jobs.find((j) => j.id == jobId) : null;

                            if (!jobId || !job) {
                                const nameKey = `${v.OptionID}_${v.EnquiryForItem}`;
                                groupedValues[cust][nameKey] = v;
                            }
                        }
                    });
                }

                // Store global map
                data.allValues = groupedValues;
                data.rawEnquiryPricingValues = serverValuesSnapshot;

                // Set active values for the tab being loaded — must match `customerName` request, not only server activeCustomer,
                // else grouped keys (e.g. AWAL CONSTRUCTION) miss while selectedCustomer is correct → lookups seed 0 / empty.
                const fallbackCust = ((data.activeCustomer || (data.customers && data.customers[0])) || '').trim();
                const reqCust = (customerName || '').trim();
                let activeCust = fallbackCust;
                if (reqCust && groupedValues[reqCust]) {
                    activeCust = reqCust;
                } else if (reqCust) {
                    const ci = Object.keys(groupedValues).find((k) => k.toLowerCase() === reqCust.toLowerCase());
                    if (ci) activeCust = ci;
                }
                if (!groupedValues[activeCust] && fallbackCust) {
                    const fb = Object.keys(groupedValues).find((k) => k.toLowerCase() === fallbackCust.toLowerCase());
                    if (fb) activeCust = fb;
                }
                data.values = groupedValues[activeCust] || {};



                // Deduplicate Options (Backend sometimes sends duplicates due to joins).
                // Must include option id — same name/item/customer/lead can legitimately be different EPO rows;
                // dropping the new id leaves `values` keys pointing at a missing option → Save All finds nothing.
                if (data.options) {
                    const seen = new Set();
                    data.options = data.options.filter((o) => {
                        const key = `${String(o.id)}|${o.name}|${o.itemName}|${o.customerName}|${o.leadJobName}`;
                        if (seen.has(key)) return false;
                        seen.add(key);
                        return true;
                    });
                }

                // Cleanup: Filter out malformed customer names (containing commas) from display
                if (data.customers) {
                    data.customers = data.customers.filter(c => c && typeof c === 'string' && !c.includes(','));

                    // STRICT DISPLAY FILTER: 
                    // Ensure displayed customers are ONLY those currently valid in Enquiry or Internal Parents
                    // This hides stale customers that might still exist in the options table
                    data.customers = data.customers.filter(s => {
                        const masterList = (data.enquiry?.customerName || '').split(',').map(c => c.trim());
                        const isMaster = masterList.includes(s);
                        const isExtra = (data.extraCustomers || []).some(ec => {
                            if (!ec || typeof ec !== 'string') return false;
                            return ec.split(',').map(c => c.trim()).includes(s);
                        });
                        const isInternal = (internalParentCustomers || []).includes(s);
                        return isMaster || isExtra || isInternal;
                    });
                }

                // ---------------------------------------------------------
                // VISIBILITY FILTER: Restrict Tabs based on User Scope
                // ---------------------------------------------------------
                // Rule: Users see a Customer Tab ONLY if:
                // 1. It is the Main Enquiry Customer.
                // 2. The Tab Name matches their own Job Name (Internal Customer).
                // 3. They have a Pricing Option (Row) explicitly assigned to their Job in that Tab.
                // 4. They are an Admin/Manager (canEditAll).

                // ---------------------------------------------------------
                // VISIBILITY FILTER: Strict Role-Based View
                // ---------------------------------------------------------
                // ---------------------------------------------------------
                // VISIBILITY FILTER: Dynamic filtering moved to useMemo (Step 1727)
                // ---------------------------------------------------------

                // ---------------------------------------------------------
                // ---------------------------------------------------------

                setPricingData(data);

                // Set selected customer (Ensure it's valid after filtering)
                let validCustomer = customerName;
                if (!validCustomer || validCustomer.includes(',') || !data.customers.includes(validCustomer)) {
                    validCustomer = data.activeCustomer;
                    if (!data.customers.includes(validCustomer)) {
                        validCustomer = data.customers[0] || '';
                    }
                }
                setSelectedCustomer(validCustomer);

                // Initialize state values using ID-based keys with Legacy Fallback
                const initialValues = {};
                const initialDecline = {};
                // Pre-calculate Visible Set for Hybrid Aggregation
                // Logic MUST Match 'visibleJobs' calculation below:
                // Lead Job + Direct Children.
                const visibleIds = new Set();

                if (data.jobs && data.access && data.access.visibleJobs) {
                    data.access.visibleJobs.forEach(vName => {
                        const matches = data.jobs.filter((j) => (j.itemName || '').trim() === (vName || '').trim());
                        matches.forEach((vJob) => {
                            const idn = nid(vJob.id);
                            if (idn != null) visibleIds.add(idn);
                        });
                    });
                }

                if (data.options && data.jobs) {
                    /** Like `findLeadJobName` but use `data.jobs` from this response (not React state). */
                    const findLeadRootNameForData = (jobOrItem) => findLeadRootLabelForPricingMatch(jobOrItem, data.jobs);
                    const itemNameOcc = new Map();
                    data.jobs.forEach((j) => {
                        const n = (j.itemName || '').trim();
                        if (!n) return;
                        itemNameOcc.set(n, (itemNameOcc.get(n) || 0) + 1);
                    });
                    const isAmbiguousItemName = (n) => (itemNameOcc.get((n || '').trim()) || 0) > 1;

                    /** Same lead root the auto-select block will use, so load-time prices match the visible tree. */
                    let leadRootNameForValueFilter = null;
                    let valueScopeLeadId = null;
                    if (data.jobs) {
                        const isTreeVisibleByIdForInit = (jobId) => {
                            const j = data.jobs.find((x) => x.id == jobId);
                            if (!j) return false;
                            if (j.visible === true) return true;
                            const jn = nid(jobId);
                            const children = data.jobs.filter((c) => nid(c.parentId) === jn);
                            return children.some((c) => isTreeVisibleByIdForInit(c.id));
                        };
                        const anyRootHasLPrefixInName = data.jobs.some(
                            (j) => isRootJob(j) && /^L\d+\s-\s/.test(j.itemName || '')
                        );
                        const roots = data.jobs.filter(
                            (j) =>
                                isRootJob(j) &&
                                isTreeVisibleByIdForInit(j.id) &&
                                rootPassesLeadNaming(j, anyRootHasLPrefixInName)
                        );
                        if (roots.length > 0) {
                            const myJobs = resolveEffectiveMyJobItemNames(
                                data.jobs,
                                (data.access && data.access.editableJobs) || [],
                                pricingListDivision
                            );
                            const findRootJob = (job) => {
                                if (!job || !data.jobs) return null;
                                let cur = job;
                                const vis = new Set();
                                for (let s = 0; s < 50 && cur; s++) {
                                    if (vis.has(String(cur.id))) break;
                                    vis.add(String(cur.id));
                                    const p = cur.parentId;
                                    if (p == null || p === '' || p === 0 || p === '0') return cur;
                                    const parent = data.jobs.find((x) => String(x.id) === String(p));
                                    if (!parent) return cur;
                                    cur = parent;
                                }
                                return cur;
                            };
                            const myJobObjs = (data.jobs || []).filter((j) => myJobs.includes((j.itemName || '').trim()));
                            const divHint = (pricingListDivision || '').trim().toLowerCase();
                            let targetRoot = roots[0];
                            const pickRootFromEditable = () => {
                                const myRoot = roots.find((r) => myJobs.includes(r.itemName));
                                if (myRoot) {
                                    targetRoot = myRoot;
                                } else if (myJobObjs.length) {
                                    const r0 = findRootJob(myJobObjs[0]);
                                    if (r0 && roots.some((x) => String(x.id) === String(r0.id))) {
                                        targetRoot = r0;
                                    }
                                }
                            };
                            if (divHint) {
                                const byDiv = roots.find((root) => {
                                    const sub = getPricingLeadSubtreeIds(root.id, data.jobs);
                                    return (data.jobs || []).some((j) => {
                                        const jid = nid(j.id);
                                        if (jid == null || !sub.has(jid)) return false;
                                        const jn = (j.itemName || '').toLowerCase();
                                        const clean = jn.replace(/^l\d+\s*-\s*/i, '').trim();
                                        return (
                                            jn === divHint ||
                                            (divHint.length >= 3 &&
                                                (jn.includes(divHint) || clean.includes(divHint) || divHint.includes(clean)))
                                        );
                                    });
                                });
                                if (byDiv) {
                                    targetRoot = byDiv;
                                } else {
                                    pickRootFromEditable();
                                }
                            } else {
                                pickRootFromEditable();
                            }
                            let leadIdForInit;
                            if (loadOptions && loadOptions.useLeadIdForValueInit !== undefined) {
                                leadIdForInit = loadOptions.useLeadIdForValueInit;
                            } else if (ignoreExistingLeadSelection) {
                                leadIdForInit = null;
                            } else {
                                leadIdForInit = selectedLeadId;
                            }
                            const currentLeadValid =
                                leadIdForInit && roots.some((r) => Number(r.id) === Number(leadIdForInit));
                            const leadId = currentLeadValid ? leadIdForInit : targetRoot.id;
                            valueScopeLeadId = leadId;
                            const rj = data.jobs.find((j) => Number(j.id) === Number(leadId));
                            if (rj) leadRootNameForValueFilter = rj.itemName;
                        }
                    }

                    // Recursive Aggregation Logic
                    const getRecursivePrice = (rootOptionId, jobId, visited = new Set()) => {
                        if (visited.has(jobId)) return { price: 0, hasFoundPrice: false };
                        visited.add(jobId);

                        // Do not re-map OptionID using synthetic `options` metadata (it can be from a different
                        // lead branch for the same OptionID). The (opt, job) loop already selected this opt.id;
                        // EnquiryForID in EnquiryPricingValues is authoritative for the row.
                        const activeOptionId = rootOptionId;

                        const idKey = `${activeOptionId}_${jobId}`;
                        const rootOpt = data.options.find((o) => String(o.id) === String(rootOptionId));
                        let selfPrice = 0;
                        let hasFoundPrice = false;

                        const job = data.jobs.find((j) => j.id === jobId);
                        const nameAmbiguous = job && isAmbiguousItemName(job.itemName);

                        const fromRawN = parsePriceFromRawValueRowsForCell(
                            data.rawEnquiryPricingValues,
                            jobId,
                            activeOptionId,
                            activeCust,
                            leadRootNameForValueFilter,
                            valueScopeLeadId,
                            data.jobs,
                            {
                                allowBlankCustomerName: !String(rootOpt?.customerName ?? '').trim(),
                            }
                        );
                        if (fromRawN != null) {
                            selfPrice = fromRawN;
                            hasFoundPrice = true;
                        }

                        // 2. Grouped bucket (Allow 0 to be displayed)
                        if (!hasFoundPrice && data.values && data.values[idKey] && parseFloat(data.values[idKey].Price) >= 0) {
                            const gr = data.values[idKey];
                            const eidG = gr.EnquiryForID ?? gr.enquiryForId;
                            if (
                                eidG != null &&
                                String(eidG) !== '' &&
                                String(eidG) !== '0' &&
                                String(eidG) !== String(jobId)
                            ) {
                                /* id-keyed bucket row points at a different EnquiryFor — ignore */
                            } else if (
                                enquiryForIdInSelectedLeadSubtree(valueScopeLeadId, gr.EnquiryForID ?? jobId, data.jobs) &&
                                valueRowLeadJobMatchesView(gr.LeadJobName, leadRootNameForValueFilter, valueScopeLeadId, data.jobs)
                            ) {
                                selfPrice = parseFloat(gr.Price);
                                hasFoundPrice = true;
                            }
                        }
                        if (
                            !hasFoundPrice &&
                            job &&
                            !nameAmbiguous &&
                            enquiryForIdInSelectedLeadSubtree(valueScopeLeadId, jobId, data.jobs)
                        ) {
                            // Legacy name/clean — only if this ItemName is unique on the enquiry (else wrong branch)
                            const nameKey = `${activeOptionId}_${job.itemName}`;
                            if (data.values && data.values[nameKey] && parseFloat(data.values[nameKey].Price) >= 0) {
                                const nr = data.values[nameKey];
                                const ne = nr.EnquiryForID ?? nr.enquiryForId;
                                if (
                                    ne == null ||
                                    String(ne) === '' ||
                                    String(ne) === '0' ||
                                    String(ne) === String(jobId)
                                ) {
                                    selfPrice = parseFloat(nr.Price);
                                    hasFoundPrice = true;
                                }
                            } else {
                                const cleanName = String(job.itemName || '').trim();
                                const cleanKey = `${activeOptionId}_${cleanName}`;
                                if (data.values && data.values[cleanKey] && parseFloat(data.values[cleanKey].Price) >= 0) {
                                    const cr = data.values[cleanKey];
                                    const ce = cr.EnquiryForID ?? cr.enquiryForId;
                                    if (
                                        ce == null ||
                                        String(ce) === '' ||
                                        String(ce) === '0' ||
                                        String(ce) === String(jobId)
                                    ) {
                                        selfPrice = parseFloat(cr.Price);
                                        hasFoundPrice = true;
                                    }
                                }
                            }

                            if ((!hasFoundPrice || selfPrice <= 0) && !nameAmbiguous && data.allValues) {
                                for (const custKey in data.allValues) {
                                    const custBucket = data.allValues[custKey];
                                    const peerOpt = data.options.find((o) => {
                                        if (!o || o.name !== rootOpt?.name || o.itemName !== job.itemName) return false;
                                        const oc = String(o.customerName || '').trim();
                                        if (oc && oc === custKey) return true;
                                        if (!oc && String(activeCust || '').trim() === String(custKey).trim()) {
                                            return true;
                                        }
                                        return false;
                                    });
                                    if (peerOpt) {
                                        const peerKey = `${peerOpt.id}_${jobId}`;
                                        // Never fall back to `${opt}_${itemName}` — two branches can share the same name (e.g. BMS under Civil vs BMS under HVAC).
                                        const peerVal = custBucket[peerKey];
                                        const peerP = peerVal && parseFloat(peerVal.Price);
                                        if (Number.isFinite(peerP) && peerP >= 0) {
                                            selfPrice = parseFloat(peerVal.Price);
                                            hasFoundPrice = true;
                                            console.log(
                                                `[Pricing Persistence] PROMOTING price ${selfPrice} for job ${job.itemName} from bucket ${custKey} to current view`
                                            );
                                            break;
                                        }
                                    }
                                }
                            }
                        }

                        // 3. Sum Children (Pass the ORIGINAL Root Option Name logic down)
                        // DISABLED: User explicitly requested that parent jobs should ONLY show their net value 
                        // and NOT accumulate subjob values to prevent duplicated pricing (Step 1531).
                        /*
                        const children = data.jobs.filter(j => j.parentId === jobId);
                        let childrenSum = 0;
                        children.forEach(c => {
                            // Hybrid Aggregation: Only sum HIDDEN children. 
                            // If a child is part of the "Visible Jobs" list, it has its own input row, so we exclude it (Component Pricing model).
                            // But we need to know if it's visible. 
                            // data.jobs doesn't have 'visible' prop yet.
                            // We can use the 'targetJobs' logic or pass visible IDs.

                            // For Initial Load, we assume the standard visibility logic: 
                            // Lead Job + Direct Children (Level 1/2) are Visible.
                            // Since we don't have the View State calculated yet, we approximate:
                            // If Child is likely to be displayed (L2), skip it.

                            // Better: Calculate 'visibleIds' set first in loadPricing.
                            const cid = nid(c.id);
                            if (cid != null && visibleIds.has(cid)) {
                                return; // Skip Visible Child
                            }

                            // We pass rootOptionId again, let the next recursion resolve its own best ID
                            childrenSum += getRecursivePrice(rootOptionId, c.id, new Set(visited));
                        });
                        */

                        if (!hasFoundPrice && job) {
                            const byEpv = findPriceFromRawByEpvDimensions(data.rawEnquiryPricingValues, {
                                leadDisplayName: leadRootNameForValueFilter,
                                ownJobItemName: job.itemName,
                                customerTab: activeCust,
                                priceOptionName: (rootOpt && rootOpt.name) || 'Base Price',
                                valueScopeLeadId,
                                jobId,
                                allJobs: data.jobs,
                                optionId: rootOptionId,
                            });
                            if (byEpv != null) {
                                selfPrice = byEpv;
                                hasFoundPrice = true;
                            }
                        }

                        return { price: selfPrice, hasFoundPrice };
                    };


                    data.options.forEach(opt => {
                        data.jobs.forEach(job => {
                            // -------------------------------------------------------------
                            // STRICT MATCHING: Only process Job/Option pairs that belong together
                            // -------------------------------------------------------------
                            const jobLeadName = findLeadRootNameForData(job);
                            const optLeadName = opt.leadJobName;

                            // FIX (Step 1231): ONLY initialize values for the current customer tab.
                            // Broadly initializing all matching options caused saveAll to try and
                            // update/duplicate records for external customers (like Ithbat)
                            // while viewing internal tabs (like Civil Project).
                            // If option has no customer in EPO, treat it as global for this request — still seed
                            // current tab (skip only when a *different* customer is explicitly set on the option).
                            const act = (activeCust || '').toString().trim();
                            const oc = (opt.customerName != null && opt.customerName !== '')
                                ? String(opt.customerName).trim()
                                : '';
                            if (oc && oc !== act) return;

                            const leadContextOk = (a, b) => {
                                const A = (a || '').toString().trim();
                                const B = (b || '').toString().trim();
                                return !A || !B || A === B || A.toLowerCase() === B.toLowerCase() || sameEnquiryItemName(A, B);
                            };
                            let isMatch = false;
                            if (sameEnquiryItemName(opt.itemName, job.itemName)) {
                                if (leadContextOk(optLeadName, jobLeadName)) {
                                    const rRoot = enquiryForRootJob(job, data.jobs);
                                    if (
                                        valueScopeLeadId != null &&
                                        rRoot &&
                                        String(rRoot.id) !== String(valueScopeLeadId)
                                    ) {
                                        /* option/job pair belongs to another lead root */
                                    } else {
                                        isMatch = true;
                                    }
                                }
                            } else if (opt.itemName === 'Lead Job' && !job.parentId) {
                                if (
                                    leadContextOk(optLeadName, jobLeadName) &&
                                    (valueScopeLeadId == null || String(job.id) === String(valueScopeLeadId))
                                ) {
                                    isMatch = true;
                                }
                            }
                            if (
                                !isMatch &&
                                isAmbiguousItemName(job.itemName) &&
                                (data.rawEnquiryPricingValues || []).some(
                                    (v) =>
                                        String(v.EnquiryForID ?? v.enquiryForId ?? '') === String(job.id) &&
                                        String(v.OptionID ?? v.optionID ?? '') === String(opt.id)
                                )
                            ) {
                                isMatch = true;
                            }

                            if (!isMatch) return;
                            // -------------------------------------------------------------

                            // Calculate Aggregated Price
                            const { price: aggregatedPrice, hasFoundPrice: foundPriceInLookup } =
                                getRecursivePrice(opt.id, job.id);

                            const exactKey = `${opt.id}_${job.id}`;
                            const hasNameLegacy =
                                !isAmbiguousItemName(job.itemName) && data.values && data.values[`${opt.id}_${job.itemName}`];
                            const hasExplicitRow =
                                data.values && (data.values[exactKey] || hasNameLegacy);
                            // Seed for any loaded price, explicit stored row, or 0 that was actually read from DB/raw lookup.
                            const shouldSeed =
                                aggregatedPrice > 0 ||
                                (aggregatedPrice === 0 && hasExplicitRow) ||
                                (aggregatedPrice === 0 && foundPriceInLookup);
                            if (shouldSeed) {
                                initialValues[exactKey] = aggregatedPrice;
                            } else {
                                // Empty string: clear number in `prev` without showing a literal 0 for “never set”
                                initialValues[exactKey] = '';
                            }
                            if (
                                findDeclineToQuoteFromRawByEpvDimensions(data.rawEnquiryPricingValues, {
                                    leadDisplayName: leadRootNameForValueFilter,
                                    ownJobItemName: job.itemName,
                                    customerTab: activeCust,
                                    priceOptionName: opt.name || 'Base Price',
                                    valueScopeLeadId,
                                    jobId: job.id,
                                    allJobs: data.jobs,
                                    optionId: opt.isSimulated ? null : opt.id,
                                })
                            ) {
                                initialDecline[exactKey] = true;
                            }
                        });
                    });
                }

                // Drop value keys whose OptionID no longer exists (e.g. after DELETE); else `...prev` keeps stale cells.
                const validPricingOptionIds = new Set(
                    (data.options || []).map((o) => String(o.id)).filter((id) => id && id !== 'undefined')
                );
                const stripStaleValueKeys = (src = {}) =>
                    Object.fromEntries(
                        Object.entries(src).filter(([key]) => {
                            if (String(key).startsWith('simulated')) return true;
                            const optPart = String(key).split('_')[0];
                            if (!optPart) return true;
                            return validPricingOptionIds.has(optPart);
                        })
                    );

                /**
                 * Merge server-seeded cells with preserved edits across tab/lead reloads.
                 * Never let a stale `0` / `'0'` from preserveValues wipe a positive `initialValues` price (AWAL showed 0 while EPV had 3).
                 * Real user-entered 0 is rare; they can re-enter if needed.
                 */
                const mergePreserveWithoutStaleZero = (init, preserved) => {
                    const out = { ...(init || {}) };
                    if (!preserved || typeof preserved !== 'object') return out;
                    // If preserved values come from the SAME tab we are loading, keep user-entered 0 as a draft.
                    // The stale-zero rule is only needed to prevent cross-tab 0 leaking into another tab and wiping a real price.
                    const activeKey = normalizePricingCustomerKey(activeCust);
                    const allowZeroDraft = !!preserveSourceCustomerKey && preserveSourceCustomerKey === activeKey;
                    Object.entries(preserved).forEach(([k, pv]) => {
                        const iv = init && init[k];
                        const staleZero =
                            (pv === 0 || pv === '0') &&
                            !forcePreserveZeroKeys.has(k) &&
                            !allowZeroDraft &&
                            iv !== undefined &&
                            iv !== '' &&
                            Number(iv) > 0;
                        if (!staleZero) out[k] = pv;
                    });
                    return out;
                };

                if (preserveValues) {
                    setValues((prev) => ({
                        ...stripStaleValueKeys(prev),
                        ...mergePreserveWithoutStaleZero(initialValues, preserveValues),
                    }));
                } else {
                    setValues((prev) => ({
                        ...stripStaleValueKeys(prev),
                        ...initialValues,
                    }));
                }

                const preserveDeclineKey = preserveSourceCustomerKey
                    ? normalizePricingCustomerKey(preserveSourceCustomerKey)
                    : normalizePricingCustomerKey(activeCust);
                const preservedDecline =
                    (preserveDeclineKey && draftDeclineByCustomerRef.current[preserveDeclineKey]) || {};
                setDeclineToQuote((prev) => ({
                    ...stripStaleValueKeys(prev),
                    ...initialDecline,
                    ...preservedDecline,
                }));

                // Auto-Select First VISIBLE Lead Job
                if (data.jobs) {
                    const anyRootHasLPrefixInName = data.jobs.some(j => isRootJob(j) && /^L\d+\s-\s/.test(j.itemName || ''));

                    // FIX: Use ID-based visible flag set by backend to avoid name-collision
                    // (e.g. root BMS and child BMS share the same itemName)
                    const isTreeVisibleById = (jobId) => {
                        const job = data.jobs.find(j => j.id == jobId);
                        if (!job) return false;
                        if (job.visible === true) return true;
                        const jn = nid(jobId);
                        const children = data.jobs.filter(j => nid(j.parentId) === jn);
                        return children.some(c => isTreeVisibleById(c.id));
                    };

                    const roots = data.jobs.filter(j =>
                        isRootJob(j) &&
                        isTreeVisibleById(j.id) &&
                        rootPassesLeadNaming(j, anyRootHasLPrefixInName)
                    );

                    if (roots.length > 0) {
                        // Priority: Auto-select a root the user is explicitly assigned to
                        const myJobs = resolveEffectiveMyJobItemNames(
                            data.jobs,
                            (data.access && data.access.editableJobs) || [],
                            pricingListDivision
                        );
                        const myRoot = roots.find(r => myJobs.includes(r.itemName));
                        const targetRoot = myRoot || roots[0];

                        if (loadOptions && loadOptions.useLeadIdForValueInit !== undefined) {
                            const forced = loadOptions.useLeadIdForValueInit;
                            if (forced != null && roots.some((r) => Number(r.id) === Number(forced))) {
                                setSelectedLeadId(forced);
                            } else if (forced == null) {
                                setSelectedLeadId(null);
                            } else {
                                setSelectedLeadId(targetRoot.id);
                            }
                        } else {
                            // Opening a new enquiry: setSelectedLeadId(null) then loadPricing in the same
                            // tick; the closure can still see the *previous* enquiry's lead id.
                            const leadIdForAuto = ignoreExistingLeadSelection ? null : selectedLeadId;
                            const currentLeadValid = leadIdForAuto && roots.some(r => Number(r.id) === Number(leadIdForAuto));

                            if (!leadIdForAuto || !currentLeadValid) {
                                console.log('Lead Job Auto-selection:', targetRoot.itemName, targetRoot.id);
                                setSelectedLeadId(targetRoot.id);
                            } else {
                                console.log('Maintaining current Lead Job selection:', leadIdForAuto);
                            }
                        }
                    }
                }
            }
        } catch (err) {
            console.error('Error loading pricing:', err);
            if (!silentRefresh) {
                setPricingData(null);
                setPricingLoadError(err?.message || 'Network error while loading pricing.');
            }
        } finally {
            if (!silentRefresh) setLoading(false);
        }
    };

    /** Open enquiry grid on its own screen (hide pending/search lists until Back / Close). */
    const openPricingEditorForEnquiry = (requestNo) => {
        setPricingEditorStandalone(true);
        setPricingData(null);
        setSelectedEnquiry(null);
        setSelectedLeadId(null);
        draftValuesByCustomerRef.current = {};
        draftDeclineByCustomerRef.current = {};
        try {
            localStorage.removeItem('pricing_selectedLeadId');
        } catch {
            /* ignore */
        }
        void loadPricing(requestNo, null, null, { ignoreExistingLeadSelection: true });
    };
    const handledOpenContextKeyRef = useRef('');
    useEffect(() => {
        if (!openContext || openContext.tab !== 'Pricing') return;
        const requestNo = String(openContext.requestNo || '').trim();
        if (!requestNo) return;
        const key = `${requestNo}::${String(openContext.enquiryForId || '')}::${String(openContext.subJob || '')}`;
        if (handledOpenContextKeyRef.current === key) return;
        handledOpenContextKeyRef.current = key;
        openPricingEditorForEnquiry(requestNo);
    }, [openContext]);

    // Add new option row
    /** `scopeJobId`: EnquiryFor row for this section — required when UI `targetScope` is a display key (e.g. `L1 - Name`) that does not equal `ItemName`. */
    const addOption = async (targetScope, explicitName = null, explicitCustomer = null, scopeJobId = null, explicitPrice = null) => {
        const currentValues = { ...values }; // Capture current state
        const typedName = String(newOptionNames[targetScope] || '').trim();
        const optionName = String(explicitName || typedName || '').trim();
        const typedPriceRaw = String(newOptionPrices[targetScope] ?? '');
        const rawPriceToUse = explicitPrice != null ? String(explicitPrice) : typedPriceRaw;
        const priceText = rawPriceToUse.replace(/,/g, '').trim();
        if (!pricingData) return false;
        if (!optionName || !priceText) return false;
        if (!/^-?\d*\.?\d+$/.test(priceText)) {
            alert('Enter a valid price for the new option.');
            return false;
        }

        let targetItemName = targetScope ? targetScope.trim() : '';
        const currentActiveLeadJob = (pricingData.jobs || []).find(j => j.id == selectedLeadId);

        let targetJob = null;
        if (scopeJobId != null && pricingData.jobs?.length) {
            const jById = pricingData.jobs.find((j) => String(j.id) === String(scopeJobId));
            if (jById) {
                targetJob = jById;
                targetItemName = String(jById.itemName || '').trim();
            }
        }

        if (!targetJob) {
            if (
                targetItemName.includes(' / Lead Job') ||
                targetItemName === 'Lead Job' ||
                (currentActiveLeadJob && targetItemName === `${currentActiveLeadJob.itemName} / Lead Job`) ||
                (currentActiveLeadJob && targetItemName === `${currentActiveLeadJob.itemName} (Lead Job)`) ||
                targetItemName.endsWith(' (Lead Job)')
            ) {
                targetItemName = currentActiveLeadJob ? currentActiveLeadJob.itemName.trim() : null;
            }

            const subtreeSet =
                selectedLeadId && pricingData.jobs?.length
                    ? getPricingLeadSubtreeIds(selectedLeadId, pricingData.jobs)
                    : null;
            const currentLjName = currentActiveLeadJob ? currentActiveLeadJob.itemName : null;

            const nameMatches = (pricingData.jobs || []).filter((j) =>
                targetItemName ? sameEnquiryItemName(j.itemName, targetItemName) : false
            );

            const inLeadAndName = nameMatches.filter(
                (j) =>
                    !currentLjName ||
                    !findLeadJobName(j) ||
                    sameEnquiryItemName(findLeadJobName(j), currentLjName)
            );
            const scoped =
                subtreeSet && inLeadAndName.length
                    ? inLeadAndName.filter((j) => subtreeSet.has(nid(j.id)))
                    : inLeadAndName;

            if (scoped.length >= 1) {
                targetJob = scoped[0];
            } else if (nameMatches.length >= 1) {
                targetJob =
                    subtreeSet && nameMatches.length > 1
                        ? nameMatches.find((j) => subtreeSet.has(nid(j.id))) || nameMatches[0]
                        : nameMatches[0];
            }
        }

        // Determine customer name for payload
        let custName = explicitCustomer || selectedCustomer;
        // HIERARCHICAL OVERRIDE: If the target item is a sub-job, it MUST quote to its parent

        if (!pricingData.access?.canEditAll) {
            const anchorId = resolveOwnJobAnchorId({
                jobs: pricingData.jobs,
                selectedLeadId,
                myJobs: effectiveMyJobItemNames,
                canEditAll: false,
            });
            if (anchorId != null && targetJob && nid(targetJob.id) !== nid(anchorId)) {
                alert('You can only add pricing options on your assigned job row for this lead.');
                return;
            }
        }

        if (targetJob && targetJob.parentId && targetJob.parentId !== '0' && targetJob.parentId !== 0) {
            const parent = (pricingData.jobs || []).find(p => p.id === targetJob.parentId);
            if (parent) {
                custName = String(parent.itemName || '').trim();
            }
        }

        // Final fallback for lead-jobs: if still blank, use main enquiry customer
        if (!custName || !custName.trim()) {
            const masterList = (pricingData.enquiry.customerName || '')
                .split(',')
                .map(s => s.trim())
                .filter(Boolean);
            if (masterList.length > 0) {
                custName = masterList[0];
            }
        }

        const leadJobName = currentActiveLeadJob ? currentActiveLeadJob.itemName : null;

        if (!targetJob || !String(targetJob.itemName || '').trim()) {
            alert('Could not resolve this job row for adding an option. Refresh the page or check EnquiryFor ItemName matches the grid.');
            return;
        }

        const payload = {
            requestNo: pricingData.enquiry.requestNo,
            optionName: optionName.trim(),
            itemName: targetJob.itemName,
            enquiryForId: targetJob.id,
            customerName: custName, // Use resolved customer (parent for sub-jobs, external for lead-jobs)
            leadJobName: leadJobName // Bind Option to current Lead Job Scope
        };

        try {
            const res = await fetch(`${API_BASE}/api/pricing/option`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const created = await res.json();
                const createdOption = created?.option || created || {};
                const newOptionId = createdOption?.ID ?? createdOption?.id ?? null;
                const scopedKey =
                    newOptionId != null && targetJob?.id != null
                        ? `${newOptionId}_${targetJob.id}`
                        : null;
                const nextPreserve = { ...currentValues };
                if (scopedKey) nextPreserve[scopedKey] = priceText;

                // Optimistic local insert so first click shows the row immediately.
                if (newOptionId != null) {
                    const optName = String(
                        createdOption?.OptionName ??
                        createdOption?.optionName ??
                        optionName
                    ).trim();
                    const optItemName = String(
                        createdOption?.ItemName ??
                        createdOption?.itemName ??
                        targetJob?.itemName ??
                        targetItemName
                    ).trim();
                    const optCustomer = String(
                        createdOption?.CustomerName ??
                        createdOption?.customerName ??
                        custName
                    ).trim();
                    const optLeadJobName = String(
                        createdOption?.LeadJobName ??
                        createdOption?.leadJobName ??
                        leadJobName ??
                        ''
                    ).trim();

                    setPricingData((prev) => {
                        if (!prev) return prev;
                        const prevOptions = Array.isArray(prev.options) ? prev.options : [];
                        const exists = prevOptions.some((o) => String(o?.id) === String(newOptionId));
                        if (exists) return prev;
                        return {
                            ...prev,
                            options: [
                                ...prevOptions,
                                {
                                    id: newOptionId,
                                    name: optName,
                                    itemName: optItemName,
                                    customerName: optCustomer,
                                    leadJobName: optLeadJobName || null,
                                },
                            ],
                        };
                    });
                }

                setNewOptionNames(prev => ({ ...prev, [targetScope]: '' }));
                setNewOptionPrices(prev => ({ ...prev, [targetScope]: '' }));
                // Reload with the newly active customer
                const activeCust = explicitCustomer || selectedCustomer;
                setValues(nextPreserve);
                loadPricing(pricingData.enquiry.requestNo, activeCust, nextPreserve, {
                    preserveSourceCustomerKey: activeCust,
                    silentRefresh: true,
                });
                return true;
            } else {
                let detail = '';
                try {
                    const body = await res.json();
                    detail = body?.error ? String(body.error) : JSON.stringify(body);
                } catch {
                    /* ignore */
                }
                console.error('Add Option: Failed', res.status, res.statusText, detail);
                alert(`Could not add option (${res.status}). ${detail || res.statusText}`);
                return false;
            }
        } catch (err) {
            console.error('Error adding option:', err);
            alert('Could not add option: ' + (err?.message || err));
            return false;
        }
    };

    // Delete option row
    const deleteOption = async (optionId, rowJobId = null) => {
        if (!window.confirm('Delete this option row?')) return;

        // API / React may use string vs number IDs — strict === misses the row and delete silently no-ops.
        const optToDelete = (pricingData.options || []).find((o) => String(o.id) === String(optionId));
        if (!optToDelete) {
            console.warn('[Pricing deleteOption] No option row for id', optionId);
            return;
        }

        const nameNorm = (optToDelete.name || '').trim().toLowerCase();
        if (nameNorm === 'base price') {
            alert('Use the trash icon on the Base Price row to delete Base Price values.');
            return;
        }

        if (!pricingData.access?.canEditAll) {
            const anchorId = resolveOwnJobAnchorId({
                jobs: pricingData.jobs,
                selectedLeadId,
                myJobs: effectiveMyJobItemNames,
                canEditAll: false,
            });
            if (anchorId != null) {
                const rowId = rowJobId != null ? nid(rowJobId) : null;
                if (rowId != null && rowId !== nid(anchorId)) {
                    alert('You can only delete pricing options on your assigned job row for this lead.');
                    return;
                }
                if (rowId == null) {
                    const jobMatch = (pricingData.jobs || []).find((j) =>
                        sameEnquiryItemName(optToDelete.itemName, j.itemName)
                    );
                    if (jobMatch && nid(jobMatch.id) !== nid(anchorId)) {
                        return;
                    }
                }
            }
        }

        // Special Rule: Default options like 'Base Price' or 'Price' are usually kept,
        // but user-added named options should be removed globally to prevent auto-sync from bringing them back.
        const isDefault = ['price', 'optional', 'base price'].includes(nameNorm);

        let idsToDelete = [optToDelete.id];
        if (!isDefault) {
            // Find all matching options (Same Name Case-Insensitive & Trimmed, same ItemName context)
            const matches = (pricingData.options || []).filter(
                (o) =>
                    o.name &&
                    o.name.trim().toLowerCase() === nameNorm &&
                    o.itemName &&
                    o.itemName.trim().toLowerCase() === (optToDelete.itemName || '').trim().toLowerCase()
            );
            // Ensure unique IDs to avoid multiple DELETE requests for same record (Step 932)
            idsToDelete = Array.from(new Set(matches.map((m) => m.id)));
            console.log(
                `Bulk Delete: Found ${idsToDelete.length} unique matching rows for "${optToDelete.name}" (trimmed) across all branches/tabs for ${optToDelete.itemName}`
            );
        }

        const idsToDeleteSet = new Set(idsToDelete.map((id) => String(id)));

        try {
            const currentValues = { ...values }; // Capture current state
            console.log(`Bulk Delete: Initiating delete for IDs: [${[...idsToDeleteSet].join(', ')}]`);
            // Deleted all linked IDs in parallel with verification
            const results = await Promise.all(
                [...idsToDeleteSet].map((id) =>
                    fetch(`${API_BASE}/api/pricing/option/${encodeURIComponent(id)}`, { method: 'DELETE' }).then((r) => ({
                        id,
                        ok: r.ok,
                        status: r.status,
                    }))
                )
            );

            console.log('Delete Results:', results);

            const allOk = results.every((res) => res.ok);
            if (allOk) {
                // Remove the deleted option's values from currentValues to prevent stale keys
                const cleanedValues = Object.keys(currentValues).reduce((acc, key) => {
                    const kOptId = String(key).split('_')[0];
                    if (String(key).startsWith('simulated') || !idsToDeleteSet.has(kOptId)) {
                        acc[key] = currentValues[key];
                    }
                    return acc;
                }, {});

                setValues(cleanedValues);
                loadPricing(pricingData.enquiry.requestNo, selectedCustomer, cleanedValues, {
                    preserveSourceCustomerKey: selectedCustomer,
                    silentRefresh: true,
                });
            } else {
                alert('Failed to delete some option rows. They may be in use.');
                loadPricing(pricingData.enquiry.requestNo, selectedCustomer, null, {
                    silentRefresh: true,
                });
            }
        } catch (err) {
            console.error('Error deleting option:', err);
        }
    };

    // Delete Base Price value(s) for a single cell (job + active tab).
    const deleteBasePriceForCell = async ({ enquiryForId }) => {
        if (!pricingData?.enquiry?.requestNo) return;
        if (enquiryForId == null) return;
        if (!window.confirm('Delete Base Price for this job on the current tab?')) return;
        try {
            const jobRow = (pricingData.jobs || []).find((j) => String(j.id) === String(enquiryForId));
            const jobItemName = String(jobRow?.itemName || '').trim();

            const res = await fetch(`${API_BASE}/api/pricing/value/base-price`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    requestNo: pricingData.enquiry.requestNo,
                    enquiryForId,
                    customerName: selectedCustomer,
                }),
            });
            if (!res.ok) {
                const body = await res.text().catch(() => '');
                throw new Error(`HTTP ${res.status} ${res.statusText}. ${body}`);
            }

            // Clear any cached/in-memory Base Price values for this job so UI immediately reflects deletion.
            const keySuffix = `_${String(enquiryForId)}`;
            const baseOptIds = new Set(
                (pricingData.options || [])
                    .filter((o) => String(o?.name || '').trim().toLowerCase() === 'base price')
                    .filter((o) => !jobItemName || sameEnquiryItemName(o.itemName, jobItemName))
                    .map((o) => String(o.id))
            );

            const zeroBaseKeys = (prev) => {
                const next = { ...(prev || {}) };
                // Force Base Price keys for this job to "0" so the textbox clears immediately and can't snap back.
                Object.keys(next).forEach((k) => {
                    if (!String(k).endsWith(keySuffix)) return;
                    const optId = String(k).split('_')[0];
                    if (baseOptIds.has(optId) || String(optId).startsWith('simulated_base_')) {
                        next[k] = '0';
                    }
                });
                // Also ensure keys exist for base price option ids (even if user never typed in this cell).
                baseOptIds.forEach((oid) => {
                    next[`${oid}_${String(enquiryForId)}`] = '0';
                });
                return next;
            };

            setValues((prev) => zeroBaseKeys(prev));
            valuesRef.current = zeroBaseKeys(valuesRef.current || {});

            // Reload, preserving the forced-zero keys so the UI reflects deletion immediately.
            const forcedKeys = Array.from(baseOptIds).map((oid) => `${String(oid)}_${String(enquiryForId)}`);
            loadPricing(pricingData.enquiry.requestNo, selectedCustomer, valuesRef.current, {
                forcePreserveZeroKeys: forcedKeys,
                preserveSourceCustomerKey: selectedCustomer,
                silentRefresh: true,
            });
            refreshPendingRequests();
        } catch (err) {
            console.error('Error deleting base price:', err);
            alert('Failed to delete Base Price: ' + (err?.message || err));
        }
    };

    // Preserve only values that belong to a specific customer tab (prevents BEMCO edits showing on TEMCO before save).
    const filterPreserveValuesForCustomer = React.useCallback((preserved, targetCustomer) => {
        const src = preserved && typeof preserved === 'object' ? preserved : {};
        const out = {};
        const tc = normalizePricingCustomerKey(targetCustomer);
        const optById = new Map((pricingData?.options || []).map((o) => [String(o.id), o]));
        const jobs = pricingData?.jobs || [];
        for (const [k, v] of Object.entries(src)) {
            if (String(k).startsWith('simulated')) {
                // Simulated ids now include customer key; safe to preserve.
                out[k] = v;
                continue;
            }
            const optId = String(k).split('_')[0];
            const opt = optById.get(optId);
            if (!opt) continue;
            const oc = normalizePricingCustomerKey(opt.customerName || '');
            if (tc && oc && oc === tc) {
                out[k] = v;
                continue;
            }
            if (tc && !oc) {
                const jobIdPart = k.split('_')[1];
                const jobRow = jobs.find((j) => String(j.id) === String(jobIdPart));
                if (jobRow) {
                    const pid = jobRow.parentId;
                    const hasParent =
                        pid != null && pid !== '' && pid !== 0 && pid !== '0';
                    if (hasParent) {
                        const par = jobs.find((p) => String(p.id) === String(pid));
                        const pn = par ? normalizePricingCustomerKey(par.itemName || '') : '';
                        if (pn && pn === tc) {
                            out[k] = v;
                        }
                    }
                }
            }
        }
        return out;
    }, [pricingData?.options, pricingData?.jobs]);

    /** Persist the active customer tab's unsaved prices + decline flags into draft refs (merge, never wipe other lead jobs). */
    const flushPricingDraftsForCurrentView = React.useCallback(() => {
        const ck = normalizePricingCustomerKey(selectedCustomer);
        if (!ck) return;
        const valuesSnapshot = filterPreserveValuesForCustomer(
            { ...(valuesRef.current || {}), ...(values || {}) },
            selectedCustomer
        );
        const declineSnapshot = {
            ...(declineToQuoteRef.current || {}),
            ...(declineToQuote || {}),
        };
        draftValuesByCustomerRef.current[ck] = {
            ...(draftValuesByCustomerRef.current[ck] || {}),
            ...valuesSnapshot,
        };
        draftDeclineByCustomerRef.current[ck] = {
            ...(draftDeclineByCustomerRef.current[ck] || {}),
            ...declineSnapshot,
        };
    }, [selectedCustomer, values, declineToQuote, filterPreserveValuesForCustomer]);

    // When values change, snapshot the current tab's draft values so switching tabs keeps unsaved edits per-customer.
    useEffect(() => {
        const ck = normalizePricingCustomerKey(selectedCustomer);
        if (!ck) return;
        draftValuesByCustomerRef.current[ck] = {
            ...(draftValuesByCustomerRef.current[ck] || {}),
            ...filterPreserveValuesForCustomer(values, selectedCustomer),
        };
        draftDeclineByCustomerRef.current[ck] = {
            ...(draftDeclineByCustomerRef.current[ck] || {}),
            ...declineToQuote,
        };
    }, [values, declineToQuote, selectedCustomer, filterPreserveValuesForCustomer]);

    // Format a numeric value as ###,###,###.### (up to 3 decimal places, no trailing zeros)
    const formatPrice = (val) => {
        if (val === '' || val === undefined || val === null) return '';
        const num = parseFloat(String(val).replace(/,/g, ''));
        if (isNaN(num)) return '';
        return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
    };

    // Update cell value — always strip commas and store as plain float
    const handleValueChange = (optionId, jobId, value) => {
        const key = `${optionId}_${jobId}`;
        const stripped = String(value).replace(/,/g, ''); // remove commas the user may paste

        // Validation: allow only numbers and a single decimal point (Step 4488)
        if (stripped !== '' && !/^-?\d*\.?\d*$/.test(stripped)) return;

        setValues(prev => ({
            ...prev,
            [key]: stripped
        }));
    };

    const handleDeclineToQuoteChange = (jobId, checked, jobOptions) => {
        const rows = Array.isArray(jobOptions) ? jobOptions : [];
        if (!rows.length) return;

        if (checked && pricingData?.existingQuotes?.length) {
            const leadJob = (pricingData.jobs || []).find((j) => String(j.id) === String(selectedLeadId))
                ?.itemName;
            if (quoteBlocksDeclineToQuote(pricingData.existingQuotes, leadJob, selectedCustomer)) {
                alert(
                    'Cannot decline to quote: a quote has already been created for this enquiry, lead job, and customer.'
                );
                return;
            }
        }

        setDeclineToQuote((prev) => {
            const next = { ...prev };
            rows.forEach((opt) => {
                next[`${opt.id}_${jobId}`] = !!checked;
            });
            return next;
        });

        if (checked) {
            setValues((prev) => {
                const next = { ...prev };
                rows.forEach((opt) => {
                    next[`${opt.id}_${jobId}`] = '0';
                });
                return next;
            });
        }
    };

    // Save all prices
    const saveAll = async () => {
        if (!pricingData) return;
        const hasInvalidDraftAddRow = Object.keys(showNewOptionInputs || {}).some((groupKey) => {
            if (!showNewOptionInputs[groupKey]) return false;
            const n = String(newOptionNames[groupKey] || '').trim();
            const p = String(newOptionPrices[groupKey] || '').replace(/,/g, '').trim();
            return Boolean(n) !== Boolean(p);
        });
        if (hasInvalidDraftAddRow) {
            alert('Complete both Option Name and Price in Add row, or clear both before Save All.');
            return;
        }

        // Ref is synced after paint; merge so Save All never reads stale `values` (would skip every PUT).
        // Declared up here because the draft-auto-commit block below seeds `valuesLive[newKey]`.
        const valuesLive = { ...(valuesRef.current || {}), ...(values || {}) };
        const declineLive = { ...(declineToQuoteRef.current || {}), ...(declineToQuote || {}) };

        // Merge every customer tab's unsaved drafts — Save All must persist Decline to Quote (and prices)
        // across all tabs and lead jobs, not only the active view when the button is clicked.
        flushPricingDraftsForCurrentView();
        for (const custDraft of Object.values(draftValuesByCustomerRef.current || {})) {
            if (custDraft && typeof custDraft === 'object') {
                Object.assign(valuesLive, custDraft);
            }
        }
        for (const declineDraft of Object.values(draftDeclineByCustomerRef.current || {})) {
            if (declineDraft && typeof declineDraft === 'object') {
                Object.assign(declineLive, declineDraft);
            }
        }

        // Auto-commit any open "+ Add" drafts where the user has typed both Name and Price.
        // Without this the user had to click "Add" a second time (to POST the option) BEFORE clicking
        // Save All — easy to forget; the symptom was "No changes to save."
        // We POST the option here and push the typed price straight into `valuesLive` so the
        // main save loop below issues the PUT in the same click.
        const openDrafts = Object.keys(showNewOptionInputs || {})
            .filter((groupKey) => showNewOptionInputs[groupKey])
            .map((groupKey) => ({
                groupKey,
                name: String(newOptionNames[groupKey] || '').trim(),
                price: String(newOptionPrices[groupKey] || '').replace(/,/g, '').trim(),
                jobId: pendingAddJobIds[groupKey] ?? null,
            }))
            .filter((d) => d.name && d.price);

        // Track new options created here so the save loop knows they exist even though
        // `pricingData.options` may not be re-rendered yet (loadPricing runs after this Save All).
        const draftCreatedOptions = [];
        if (openDrafts.length > 0) {
            const currentActiveLeadJob = (pricingData.jobs || []).find((j) => j.id == selectedLeadId);
            const leadJobNameForDraft = currentActiveLeadJob ? currentActiveLeadJob.itemName : null;

            for (const d of openDrafts) {
                // Resolve the target EnquiryFor row for this draft.
                let targetJob = null;
                if (d.jobId != null) {
                    targetJob = (pricingData.jobs || []).find((j) => String(j.id) === String(d.jobId));
                }
                if (!targetJob) {
                    // Fallback to name match — strips Lx- prefix for lead rows.
                    const stripped = d.groupKey.replace(/^L\d+\s*-\s*/, '').trim();
                    targetJob =
                        (pricingData.jobs || []).find((j) => sameEnquiryItemName(j.itemName, stripped)) ||
                        (pricingData.jobs || []).find((j) => sameEnquiryItemName(j.itemName, d.groupKey));
                }
                if (!targetJob) {
                    console.warn('Save All: could not resolve job for draft option', d);
                    continue;
                }

                // Permission gate — same rule as addOption().
                if (!pricingData.access?.canEditAll) {
                    const anchorId = resolveOwnJobAnchorId({
                        jobs: pricingData.jobs,
                        selectedLeadId,
                        myJobs: effectiveMyJobItemNames,
                        canEditAll: false,
                    });
                    if (anchorId != null && nid(targetJob.id) !== nid(anchorId)) {
                        alert('You can only add pricing options on your assigned job row for this lead.');
                        return;
                    }
                }

                // Customer name: sub-jobs quote to parent, lead jobs quote to selected customer / first master.
                let custName = selectedCustomer;
                if (targetJob.parentId && targetJob.parentId !== '0' && targetJob.parentId !== 0) {
                    const parent = (pricingData.jobs || []).find((p) => p.id === targetJob.parentId);
                    if (parent) custName = String(parent.itemName || '').trim();
                }
                if (!custName || !String(custName).trim()) {
                    const masterList = (pricingData.enquiry.customerName || '')
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean);
                    if (masterList.length > 0) custName = masterList[0];
                }

                try {
                    const res = await fetch(`${API_BASE}/api/pricing/option`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            requestNo: pricingData.enquiry.requestNo,
                            optionName: d.name,
                            itemName: targetJob.itemName,
                            enquiryForId: targetJob.id,
                            customerName: custName,
                            leadJobName: leadJobNameForDraft,
                        }),
                    });
                    if (!res.ok) {
                        const txt = await res.text().catch(() => '');
                        console.error('Auto-commit draft option POST failed', d, res.status, txt);
                        alert(`Could not add option "${d.name}" (${res.status}). ${txt || ''}`);
                        return;
                    }
                    const created = await res.json();
                    const optRow = created?.option || created || {};
                    const newOptionId = optRow.ID ?? optRow.id ?? null;
                    if (newOptionId == null) {
                        console.warn('Auto-commit: POST succeeded but no option ID returned', created);
                        continue;
                    }

                    const newKey = `${newOptionId}_${targetJob.id}`;
                    valuesLive[newKey] = d.price; // Save loop will PUT this.
                    draftCreatedOptions.push({
                        id: newOptionId,
                        name: optRow.OptionName || optRow.optionName || d.name,
                        itemName: optRow.ItemName || optRow.itemName || targetJob.itemName,
                        customerName: optRow.CustomerName || optRow.customerName || custName,
                        leadJobName: optRow.LeadJobName || optRow.leadJobName || leadJobNameForDraft || null,
                    });

                    // Clear draft UI state so it doesn't reappear.
                    setShowNewOptionInputs((prev) => ({ ...prev, [d.groupKey]: false }));
                    setNewOptionNames((prev) => ({ ...prev, [d.groupKey]: '' }));
                    setNewOptionPrices((prev) => ({ ...prev, [d.groupKey]: '' }));
                    setPendingAddJobIds((prev) => {
                        const next = { ...prev };
                        delete next[d.groupKey];
                        return next;
                    });
                } catch (err) {
                    console.error('Auto-commit draft option threw', d, err);
                    alert(`Could not add option "${d.name}": ${err?.message || err}`);
                    return;
                }
            }
        }

        // Splice draft options into the in-memory options list so the save loop can resolve `opt`
        // by id (otherwise `pricingData.options.find(...)` returns undefined for the brand-new ID).
        // We mutate the live array directly because `pricingData` is a useState const inside this
        // single Save All execution; the post-save loadPricing will replace it with the server copy.
        if (draftCreatedOptions.length > 0) {
            if (!Array.isArray(pricingData.options)) pricingData.options = [];
            const existingIds = new Set(pricingData.options.map((o) => String(o.id)));
            for (const no of draftCreatedOptions) {
                if (!existingIds.has(String(no.id))) {
                    pricingData.options.push(no);
                    existingIds.add(String(no.id));
                }
            }
            // Also schedule a UI refresh so the new row is visible if save fails partway.
            const snapshot = pricingData.options.slice();
            setPricingData((prev) => (prev ? { ...prev, options: snapshot } : prev));
        }

        const requestNo = pricingData.enquiry.requestNo;
        const userName = currentUser?.name || currentUser?.FullName || 'Unknown';
        /** Parse grid / state values that may include thousands separators (same as formatPrice). */
        const parseCellNum = (v) => {
            if (v === '' || v === undefined || v === null) return 0;
            const n = parseFloat(String(v).replace(/,/g, ''));
            return Number.isFinite(n) ? n : 0;
        };
        const editableJobs = effectiveMyJobItemNames;
        const ownEditableJobIds = resolveAllEditableJobIds({
            jobs: pricingData.jobs,
            myJobs: editableJobs,
            canEditAll: !!pricingData.access?.canEditAll,
        });

        let skippedCount = 0;
        const valuesToSave = [];

        // Step 1: Realize any simulated keys that have values (Step 3401)
        const simKeysInitial = Object.keys(valuesLive).filter(
            (k) => k.startsWith('simulated') && valuesLive[k] !== undefined && valuesLive[k] !== ''
        );
        for (const simKey of simKeysInitial) {
            try {
                const parts = simKey.split('_');
                const jobId = parseInt(parts[parts.length - 1], 10);
                const job = pricingData.jobs.find((j) => String(j.id) === String(jobId)) || pricingData.jobs.find((j) => nid(j.id) === nid(jobId));
                if (!job) continue;
                if (!pricingData.access.canEditAll && ownEditableJobIds.size > 0 && !ownEditableJobIds.has(nid(job.id))) {
                    continue;
                }

                const currentActiveLeadJob = pricingData.jobs.find(j => j.id == selectedLeadId);
                const leadJobName = currentActiveLeadJob ? currentActiveLeadJob.itemName : null;
                let custName = selectedCustomer;
                if (job.parentId && job.parentId !== '0' && job.parentId !== 0) {
                    const parent = pricingData.jobs.find(p => p.id === job.parentId);
                    if (parent) custName = String(parent.itemName || '').trim();
                }

                const res = await fetch(`${API_BASE}/api/pricing/option`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        requestNo: requestNo,
                        optionName: 'Base Price',
                        itemName: job.itemName,
                        customerName: custName,
                        leadJobName: leadJobName
                    })
                });

                if (res.ok) {
                    const d = await res.json();
                    const newKey = `${d.option.ID ?? d.option?.id}_${jobId}`;
                    valuesLive[newKey] = valuesLive[simKey];
                    delete valuesLive[simKey];
                }
            } catch (err) { console.error('Sim realization error:', err); }
        }

        const allKeys = new Set([
            ...Object.keys(valuesLive),
            ...Object.keys(pricingData.values || {}),
            ...Object.keys(declineLive),
        ]);
        // Include stored rows for every customer bucket (active tab's `pricingData.values` is only one customer).
        for (const bucket of Object.values(pricingData.allValues || {})) {
            if (bucket && typeof bucket === 'object') {
                Object.keys(bucket).forEach((k) => allKeys.add(k));
            }
        }

        // Step 2: Save Loop
        // Always-on per-key tracer — we cannot debug "No changes to save" without per-row reasons.
        const debugSaveAll = {
            totals: 0,
            skipped: {
                simulated: 0,
                parts: 0,
                noJobOrOpt: 0,
                notEditable: 0,
                noMatch: 0,
                noChange: 0,
                zero: 0,
            },
            rows: [],
        };
        const traceRow = (key, status, extra) => {
            if (debugSaveAll.rows.length < 50) {
                debugSaveAll.rows.push({ key, status, ...(extra || {}) });
            }
        };
        for (const key of allKeys) {
            debugSaveAll.totals++;
            if (key.startsWith('simulated')) {
                debugSaveAll.skipped.simulated++;
                traceRow(key, 'simulated');
                continue;
            }

            const parts = key.split('_');
            if (parts.length < 2) {
                debugSaveAll.skipped.parts++;
                traceRow(key, 'badParts');
                continue;
            }

            // API / JSON may use string or number IDs — strict `===` misses rows and yields "No changes to save."
            const optionIdStr = String(parts[0] ?? '').trim();
            const jobPart = parts[1];
            const opt = pricingData.options.find((o) => String(o.id) === optionIdStr);
            let job = pricingData.jobs.find((j) => String(j.id) === String(jobPart));

            if (!job && jobPart != null && opt) {
                const itemName = jobPart;
                job = pricingData.jobs.find(
                    (j) =>
                        j.itemName === itemName &&
                        (findLeadJobName(j) === opt.leadJobName || (!findLeadJobName(j) && !opt.leadJobName))
                );
            }

            if (!job || !opt) {
                debugSaveAll.skipped.noJobOrOpt++;
                traceRow(key, 'noJobOrOpt', { optFound: !!opt, jobFound: !!job, optionIdStr, jobPart });
                continue;
            }

            const optionId = nid(opt.id);
            let jobId = nid(job.id);
            if (optionId == null || jobId == null) {
                debugSaveAll.skipped.parts++;
                traceRow(key, 'badNid', { optionId, jobId });
                continue;
            }

            // HIERARCHICAL RESOLUTION: Ensure we are saving to the INTERNAL Option ID for sub-jobs
            let effectiveOptionId = optionId;
            let effectiveCustomerName = opt.customerName;

            if (job.parentId && job.parentId !== '0' && job.parentId !== 0) {
                const parent = pricingData.jobs.find(p => p.id === job.parentId);
                if (parent) {
                    const targetCust = String(parent.itemName || '').trim();
                    const internalOpt = pricingData.options.find((o) =>
                        String(o.name || '').trim().toLowerCase() === String(opt.name || '').trim().toLowerCase() &&
                        normalizePricingCustomerKey(o.customerName) === normalizePricingCustomerKey(targetCust) &&
                        sameEnquiryItemName(o.itemName, job.itemName) &&
                        (o.leadJobName === opt.leadJobName || (!o.leadJobName && !opt.leadJobName))
                    );
                    if (internalOpt) {
                        effectiveOptionId = internalOpt.id;
                        effectiveCustomerName = targetCust;
                    }
                }
            }

            // Permission: align with UI anchor — L-prefixed job rows vs plain division names must still match.
            if (
                !pricingData.access.canEditAll &&
                !editableJobs.some((jn) => sameEnquiryItemName(jn, job.itemName))
            ) {
                debugSaveAll.skipped.notEditable++;
                traceRow(key, 'notEditable_nameMatch', {
                    jobItemName: job.itemName,
                    editableJobs,
                    canEditAll: !!pricingData.access.canEditAll,
                });
                continue;
            }
            // Non-admins: any assigned own-job row across all lead branches (not only the selected lead).
            if (!pricingData.access.canEditAll && ownEditableJobIds.size > 0 && !ownEditableJobIds.has(nid(job.id))) {
                debugSaveAll.skipped.notEditable++;
                traceRow(key, 'notEditable_ownIds', {
                    jobId: job.id,
                    ownEditableJobIds: Array.from(ownEditableJobIds),
                });
                continue;
            }

            const clean = (s) =>
                String(s || '')
                    .replace(/[\u200B-\u200D\uFEFF]/g, '')
                    .trim();
            const norm = (s) => clean(s)
                .toLowerCase()
                .replace(/[^a-z0-9 ]+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            const jobLeadName = findLeadJobName(job);
            const optLeadName = opt.leadJobName;

            const optItem = norm(opt.itemName);
            const jobItem = norm(job.itemName);
            const optLead = norm(optLeadName);
            const jobLead = norm(jobLeadName);

            const jobPartStr = String(jobPart ?? '').trim();
            const keyIsCanonicalIdPair =
                /^\d+$/.test(optionIdStr) &&
                /^\d+$/.test(jobPartStr) &&
                opt &&
                job &&
                String(opt.id) === optionIdStr &&
                String(job.id) === jobPartStr;

            let isMatch = false;
            if (keyIsCanonicalIdPair) {
                // Cell key `${OptionID}_${EnquiryForID}` is authoritative; EPO ItemName can differ from EnquiryFor display name.
                isMatch = true;
            } else if (sameEnquiryItemName(opt.itemName, job.itemName)) {
                // Same pairing rules as loadPricing initialValues (L2 label vs EPO ItemName without prefix).
                isMatch = true;
            } else if (clean(opt.itemName) === 'Lead Job' && (!job.parentId || job.parentId === 0 || job.parentId === '0')) {
                isMatch = true;
            } else if (
                Array.isArray(pricingData.rawEnquiryPricingValues) &&
                pricingData.rawEnquiryPricingValues.some(
                    (v) =>
                        String(v.EnquiryForID ?? v.enquiryForId ?? '') === String(job.id) &&
                        String(v.OptionID ?? v.optionID ?? '') === String(opt.id)
                )
            ) {
                isMatch = true;
            }

            if (!isMatch) {
                debugSaveAll.skipped.noMatch++;
                debugSaveAll.failures = debugSaveAll.failures || [];
                debugSaveAll.failures.push({
                    key,
                    optionId,
                    jobId,
                    opt: { itemName: opt.itemName, leadJobName: optLeadName },
                    job: { itemName: job.itemName, parentId: job.parentId },
                    computed: { optItem, jobItem, optLead, jobLead }
                });
                traceRow(key, 'noMatch', {
                    optItemName: opt.itemName,
                    jobItemName: job.itemName,
                    optLeadName,
                    jobLeadName,
                });
                continue;
            }
            // -------------------------------------------------------------

            const rowCustomerForDb =
                effectiveCustomerName ||
                opt.customerName ||
                selectedCustomer;
            const custDbValues = customerValuesBucket(
                pricingData.allValues,
                pricingData.values,
                rowCustomerForDb
            );

            // Determine Price
            let displayPrice = 0;
            if (Object.prototype.hasOwnProperty.call(valuesLive, key)) {
                const userValue = valuesLive[key];
                if (userValue !== '' && userValue !== undefined && userValue !== null) {
                    displayPrice = parseCellNum(userValue);
                }
            } else if (custDbValues[key] && custDbValues[key].Price) {
                // If using DB value, check if it was aggregated?? No, DB stores Self.
                // Wait, if we never touched 'values[key]', then we display DB value?
                // But DB value is Self.
                // If we don't have it in state, it means user didn't edit it.
                // But render is showing Aggregated. initialValues puts Aggregated into State.
                // So state ALWAYS has Aggregated.
                if (valuesLive[key] === undefined) {
                    // This case happens if initialValues didn't populate for some reason, or key missing.
                    // Fallback to DB self price.
                    displayPrice = parseCellNum(custDbValues[key].Price);
                }
            }

            // --- REVERSE AGGREGATION LOGIC (Subtract Hidden Children) ---
            // Re-calculate the sum of *Hidden* children for this specific Option & Job
            // We reuse the recursive logic but EXCLUDE self.

            const getHiddenChildrenSum = (rootOptionId, rootJobId) => {
                // Clone of logic in loadPricing, but focusing on Children only

                // 1. Identify Root Option "Instance"
                let activeOptionId = rootOptionId;
                const rootOpt = pricingData.options.find((o) => String(o.id) === String(rootOptionId));
                const rootJob = pricingData.jobs.find((j) => String(j.id) === String(rootJobId));

                if (rootOpt && rootJob) {
                    let specificOpt = pricingData.options.find(
                        (o) =>
                            o.name === rootOpt.name &&
                            o.customerName === rootOpt.customerName &&
                            o.leadJobName === rootOpt.leadJobName &&
                            sameEnquiryItemName(o.itemName, rootJob.itemName)
                    );
                    if (!specificOpt) {
                        const cleanJobName = String(rootJob.itemName || '').trim();
                        specificOpt = pricingData.options.find(
                            (o) =>
                                o.name === rootOpt.name &&
                                o.customerName === rootOpt.customerName &&
                                (o.itemName === cleanJobName || sameEnquiryItemName(o.itemName, rootJob.itemName))
                        );
                    }
                    if (specificOpt) activeOptionId = specificOpt.id;
                }

                // Recursive Sum
                let sum = 0;
                const children = pricingData.jobs.filter(j => j.parentId === rootJobId);

                children.forEach(child => {
                    // VISIBILITY CHECK:
                    // If Child is VISIBLE in current view, it is NOT hidden. Do not subtract it.
                    // (Because render didn't add it in the first place).
                    // However, 'visibleJobs' variable is local to render. 
                    // We need to reconstruct the visibility scope here or access it.
                    // Fortunatley, 'targetJobs' logic in Render relies on selectedLeadId + strict Scope.

                    // We can approxVisibility check:
                    // If child is a Direct Child of Root (L2), it is likely Visible if Root is L1.
                    // Logic: L1 is Lead. L2 are Visible inputs. L3 are Hidden inputs.
                    // So:
                    // If RootJob == LeadJob -> Children (L2) are VISIBLE. Sum = 0 (Don't subtract).
                    // If RootJob != LeadJob (it's L2) -> Children (L3) are HIDDEN. Sum = L3 Aggregates.

                    // FIX: Hybrid Aggregation - Subtract ONLY Hidden Children.
                    // If Child is Visible, the User Input (DisplayPrice) does NOT include it (Component Pricing).
                    // So we do NOT subtract it.

                    const isVisible = isJobRowVisibleForSaveHiddenChildCheck(
                        child,
                        pricingData.access.visibleJobs
                    );

                    if (isVisible) {
                        // Children are visible L2 rows. Do NOT subtract them.
                        return;
                    } else {
                        // Children are hidden L3 rows. Subtract them!
                        // We need the AGGREGATED price of the Child (Self + Its Children).
                        // Because the User Input (DisplayPrice) includes Child (Aggregate).
                        // We need to call getRecursivePrice view-emulator?

                        // Wait, we need the EXACT Same logic as Render.
                        // Let's copy-paste a helper or use recursion here.

                        // Helper to get total price of a child node (Aggregated)
                        const getChildAggregate = (optId, chId) => {
                            let childActiveOptId = optId;
                            // Re-resolve Option ID properly (Inheritance Logic)
                            const pOpt = pricingData.options.find(o => o.id === optId);
                            const pJob = pricingData.jobs.find(j => j.id === chId);
                            if (pOpt && pJob) {
                                // HIERARCHICAL CUSTOMER RESOLUTION for Child Lookup
                                let targetCust = pOpt.customerName;
                                if (pJob.parentId) {
                                    const parent = pricingData.jobs.find(pj => pj.id === pJob.parentId);
                                    if (parent) targetCust = String(parent.itemName || '').trim();
                                }

                                // Try Match
                                let sOpt = pricingData.options.find(o =>
                                    o.name === pOpt.name && o.customerName === targetCust && o.itemName === pJob.itemName
                                );
                                // Try Clean Match
                                if (!sOpt) {
                                    const cleanPJobName = String(pJob.itemName || '').trim();
                                    sOpt = pricingData.options.find(o =>
                                        o.name === pOpt.name && o.customerName === targetCust && o.itemName === cleanPJobName
                                    );
                                }
                                if (sOpt) childActiveOptId = sOpt.id;
                            }

                            const key = `${childActiveOptId}_${chId}`;
                            let val = 0;
                            // Priority 1: Check Current State (User Edits)
                            if (valuesLive[key] !== undefined && valuesLive[key] !== '') {
                                val = parseCellNum(valuesLive[key]);
                            }
                            // Priority 2: Check Database Values (Pre-loaded)
                            else if (pricingData.values[key]) {
                                val = parseCellNum(pricingData.values[key].Price);
                            }

                            // Fallbacks (Name based keys)
                            if (val === 0 && pJob) {
                                const nKey = `${childActiveOptId}_${pJob.itemName}`;
                                if (valuesLive[nKey] !== undefined && valuesLive[nKey] !== '') val = parseCellNum(valuesLive[nKey]);
                                else if (pricingData.values[nKey]) val = parseCellNum(pricingData.values[nKey].Price);
                            }

                            let gcSum = 0;
                            const gKids = pricingData.jobs.filter(x => x.parentId === chId);
                            gKids.forEach(mk => gcSum += getChildAggregate(optId, mk.id));
                            return val + gcSum;
                        };

                        sum += getChildAggregate(rootOptionId, child.id);
                    }
                });
                return sum;
            };

            /**
             * Only run reverse-aggregation when this job actually has a **hidden** direct child.
             * If there are no children, or every child is visible, `hiddenSum` must be 0 — subjob lines then
             * save the typed figure even when L1/L2 codes or `visible` metadata are incomplete.
             */
            const directChildrenForSave = (pricingData.jobs || []).filter(
                (j) => nid(j.parentId) === nid(jobId)
            );
            const hasHiddenDirectChild =
                directChildrenForSave.length > 0 &&
                directChildrenForSave.some(
                    (ch) =>
                        !isJobRowVisibleForSaveHiddenChildCheck(
                            ch,
                            pricingData.access.visibleJobs
                        )
                );
            const hiddenSum = hasHiddenDirectChild
                ? getHiddenChildrenSum(effectiveOptionId, jobId)
                : 0;

            // CASCADING ZERO LOGIC:
            // If User Explicitly set 0, and HiddenChildren have value, we must CLEAR them.
            const userInitiatedZero =
                Object.prototype.hasOwnProperty.call(valuesLive, key) && parseCellNum(valuesLive[key]) === 0;

            if (userInitiatedZero && hiddenSum > 0) {
                // Automatically clear hidden children (No Confirm - assume intent)

                // Collect all hidden descendants recursively
                const collectWipableNodes = (optId, chId) => {
                    const chJob = pricingData.jobs.find((j) => String(j.id) === String(chId));
                    if (!chJob) return;
                    const isVisible = isJobRowVisibleForSaveHiddenChildCheck(
                        chJob,
                        pricingData.access.visibleJobs
                    );
                    if (isVisible) return;

                    let childActiveOptId = optId;
                    const pOpt = pricingData.options.find((o) => String(o.id) === String(optId));
                    const pJob = pricingData.jobs.find((j) => String(j.id) === String(chId));
                    if (pOpt && pJob) {
                        // HIERARCHICAL CUSTOMER RESOLUTION
                        let targetCust = pOpt.customerName;
                        if (pJob.parentId) {
                            const parent = pricingData.jobs.find(pj => pj.id === pJob.parentId);
                            if (parent) targetCust = String(parent.itemName || '').trim();
                        }

                        let sOpt = pricingData.options.find(o =>
                            o.name === pOpt.name && o.customerName === targetCust && o.itemName === pJob.itemName
                        );
                        if (!sOpt) {
                            const cleanPJobName = String(pJob.itemName || '').trim();
                            sOpt = pricingData.options.find(o =>
                                o.name === pOpt.name && o.customerName === targetCust && o.itemName === cleanPJobName
                            );
                        }
                        if (sOpt) childActiveOptId = sOpt.id;

                            valuesToSave.push({
                                optionId: childActiveOptId,
                                optionName: pOpt.name,
                                enquiryForItem: pJob.itemName,
                                enquiryForId: chId,
                                price: 0,
                                customerName: targetCust,
                                leadJobName: pOpt.leadJobName,
                                priceOption: pOpt.name === 'Base Price' ? 'Base Price' : pOpt.name,
                                allowOptionalZero: true,
                            });
                    }

                    const gKids = pricingData.jobs.filter(x => x.parentId === chId);
                    gKids.forEach(mk => collectWipableNodes(optId, mk.id));
                };

                const children = pricingData.jobs.filter(j => j.parentId === jobId);
                children.forEach(c => collectWipableNodes(effectiveOptionId, c.id));

                // Force Self Price to 0 (override hiddenSum subtraction)
                // Because if we wipe hiddenSum, it becomes 0.
                // So SelfPrice = Display(0) - NewHiddenSum(0) = 0.
            }

            // If we wiped children, treat hiddenSum as 0.
            const effectiveHiddenSum = (userInitiatedZero && hiddenSum > 0) ? 0 : hiddenSum;

            const finalSelfPrice = displayPrice - effectiveHiddenSum;

            // Actually, if finalSelfPrice is effectively the Component Cost.

            let priceToSave = finalSelfPrice;
            if (priceToSave < 0 && displayPrice > 0) {
                // Edge case: User entered 10, but Hidden Children sum is 20.
                // This implies they want to reduce the package cost.
                // We can't reduce Hidden Children automatically.
                // We have to set Self to 0? Or negative?
                // Let's set to 0.
                priceToSave = 0;
            } else if (priceToSave < 0) {
                // if display was 0, save 0.
                priceToSave = 0;
            }
            if (
                displayPrice > 0 &&
                Math.abs(priceToSave) < 0.01 &&
                !hasHiddenDirectChild
            ) {
                priceToSave = displayPrice;
            }

            // NEW SKIP LOGIC (Robust Dirty Check):
            const dbValRow = custDbValues[key];
            const currentDbPrice = dbValRow ? parseCellNum(dbValRow.Price) : 0;
            const hasExplicitDbRow = !!dbValRow;
            const currentDbDecline = dbValRow
                ? isDeclineToQuoteEpvValue(dbValRow.Quotingornot ?? dbValRow.quotingornot)
                : false;
            const userDecline = Object.prototype.hasOwnProperty.call(declineLive, key)
                ? !!declineLive[key]
                : currentDbDecline;
            const quotingChanged = userDecline !== currentDbDecline;
            if (userDecline && quotingChanged) {
                const leadForDeclineCheck = opt.leadJobName || jobLeadName || '';
                const custForDeclineCheck = effectiveCustomerName || opt.customerName || '';
                if (
                    quoteBlocksDeclineToQuote(pricingData.existingQuotes || [], leadForDeclineCheck, custForDeclineCheck)
                ) {
                    skippedCount++;
                    debugSaveAll.skipped.declineBlockedByQuote = (debugSaveAll.skipped.declineBlockedByQuote || 0) + 1;
                    traceRow(key, 'declineBlockedByQuote', { leadForDeclineCheck, custForDeclineCheck });
                    continue;
                }
            }
            const isNoChange = Math.abs(priceToSave - currentDbPrice) < 0.01;

            if (isNoChange && !quotingChanged) {
                // Skip if already explicit in DB, or if implicit (0) and untouched by user
                if (hasExplicitDbRow || !Object.prototype.hasOwnProperty.call(valuesLive, key)) {
                    skippedCount++;
                    debugSaveAll.skipped.noChange++;
                    traceRow(key, 'noChange', { displayPrice, priceToSave, currentDbPrice, hasExplicitDbRow });
                    continue;
                }
                // If implicit 0 but User explicitly touched/typed 0, we PROCEED to save (Create Explicit 0 Row)
            }

            const wantsZeroSave = priceToSave <= 0;
            const allowCascadeZero =
                userInitiatedZero && hiddenSum > 0 && wantsZeroSave;
            if (wantsZeroSave && !allowCascadeZero && !hasExplicitDbRow && !quotingChanged) {
                skippedCount++;
                debugSaveAll.skipped.zero++;
                traceRow(key, 'zero', { displayPrice, priceToSave, currentDbPrice });
                continue;
            }
            traceRow(key, 'queued', { displayPrice, priceToSave, currentDbPrice });

            valuesToSave.push({
                optionId: effectiveOptionId, // Use Hierarchical Resolved ID
                optionName: opt.name,
                enquiryForItem: job.itemName, // Send Name for legacy compat/logging
                enquiryForId: job.id,         // Send ID for strict linking
                price: priceToSave,           // SAVE NET SELF PRICE
                customerName: effectiveCustomerName, // Use Hierarchical Resolved Customer
                leadJobName: opt.leadJobName,    // Include Lead Job Name (Step 1078 - from Option)
                priceOption: opt.name === 'Base Price' ? 'Base Price' : opt.name,
                allowOptionalZero: allowCascadeZero,
                quotingOrNot: userDecline ? 'Yes' : 'No',
            });
        }

        if (valuesToSave.length === 0) {
            const debugRequestNo = requestNo;
            const debugSimKeys = Array.from(allKeys).filter(k => k.startsWith('simulated'));
            const debugParsedKeys = Array.from(allKeys).map((k) => {
                const parts = k.split('_');
                const oStr = String(parts[0] ?? '').trim();
                const jStr = String(parts[1] ?? '').trim();
                const opt = (pricingData.options || []).find((o) => String(o.id) === oStr);
                const job = (pricingData.jobs || []).find((j) => String(j.id) === jStr);
                return { key: k, parts, optFound: !!opt, jobFound: !!job, optId: opt ? opt.id : null };
            });
            console.log('Pricing saveAll DEBUG (valuesToSave empty)', {
                requestNo: debugRequestNo,
                totalKeysInSet: allKeys.size,
                skippedCount,
                exampleKeys: Array.from(allKeys).slice(0, 30),
                parsedKeys: debugParsedKeys,
                simulatedKeys: debugSimKeys,
                valuesStateKeys: Object.keys(valuesLive || {}).slice(0, 50),
                valuesStateSample: Object.fromEntries(
                    Object.entries(valuesLive || {}).slice(0, 30)
                ),
                pricingValuesKeys: Object.keys(pricingData.values || {}).slice(0, 50),
                optionsCount: (pricingData.options || []).length,
                optionsSample: (pricingData.options || []).slice(0, 30).map((o) => ({
                    id: o.id,
                    name: o.name,
                    itemName: o.itemName,
                    customerName: o.customerName,
                    leadJobName: o.leadJobName,
                })),
                jobsSample: (pricingData.jobs || []).slice(0, 30).map((j) => ({
                    id: j.id,
                    itemName: j.itemName,
                    parentId: j.parentId,
                })),
                access: {
                    canEditAll: !!pricingData.access?.canEditAll,
                    editableJobs: pricingData.access?.editableJobs || [],
                },
                ownEditableJobIds: Array.from(ownEditableJobIds || []),
                debugSaveAll,
            });

            // Distinguish permission failures from "everything already up-to-date" — the previous generic
            // "No changes to save." hid the real cause when the cell the user typed into was on a row
            // outside their `access.editableJobs` scope (the cell silently accepted input but the server
            // would reject it, so the save loop skipped it).
            const blockedByPermission = (debugSaveAll?.rows || []).filter(
                (r) =>
                    r &&
                    (r.status === 'notEditable_nameMatch' || r.status === 'notEditable_ownIds') &&
                    valuesLive &&
                    Object.prototype.hasOwnProperty.call(valuesLive, r.key) &&
                    String(valuesLive[r.key] ?? '').trim() !== '' &&
                    parseCellNum(valuesLive[r.key]) !==
                        parseCellNum(
                            (pricingData.values || {})[r.key]
                                ? (pricingData.values || {})[r.key].Price
                                : 0
                        )
            );

            if ((debugSaveAll.skipped.declineBlockedByQuote || 0) > 0) {
                alert(
                    'Cannot save Decline to Quote: a quote has already been created for this enquiry, lead job, and customer.'
                );
                return;
            }

            if (blockedByPermission.length > 0) {
                const rows = Array.from(
                    new Set(blockedByPermission.map((r) => r.jobItemName).filter(Boolean))
                );
                const editable = (pricingData.access?.editableJobs || []).join(', ') || '(none)';
                alert(
                    `You don't have permission to edit price for: ${rows.join(
                        ', '
                    )}.\nYour editable row(s) on this enquiry: ${editable}.`
                );
                return;
            }

            alert('No changes to save.');
            loadPricing(pricingData.enquiry.requestNo, selectedCustomer);
            return;
        }



        setSaving(true);

        try {
            // Sequential saves: parallel PUTs raced the same EnquiryForID + OptionID rows and left stale 0 rows
            // next to the updated row; order is deterministic and matches one DB row per request.
            for (const item of valuesToSave) {
                const r = await fetch(`${API_BASE}/api/pricing/value`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        requestNo: requestNo,
                        optionId: item.optionId,
                        enquiryForItem: item.enquiryForItem,
                        enquiryForId: item.enquiryForId,
                        price: item.price,
                        updatedBy: userName,
                        customerName: item.customerName,
                        leadJobName: item.leadJobName,
                        priceOption: item.priceOption,
                        allowOptionalZero: item.allowOptionalZero === true,
                        quotingOrNot: item.quotingOrNot || 'No',
                    }),
                });
                if (!r.ok) {
                    const body = await r.text().catch(() => '');
                    throw new Error(
                        `Save failed: HTTP ${r.status} ${r.statusText}. Payload=${JSON.stringify(item)}. Body=${body}`
                    );
                }
                await r.json().catch(() => null);
            }
            alert('✓ Pricing saved successfully!');
            loadPricing(pricingData.enquiry.requestNo, selectedCustomer);
            refreshPendingRequests();
        } catch (err) {
            console.error('Error saving:', err);
            alert('Failed to save pricing: ' + (err?.message || err));
        } finally {
            setSaving(false);
        }
    };

    // Delete customer pricing
    const deleteCustomer = async (custName) => {
        if (!window.confirm(`Are you sure you want to delete all pricing for "${custName}"?`)) return;

        try {
            const res = await fetch(`${API_BASE}/api/pricing/customer`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }, // Fetch keeps body on DELETE
                body: JSON.stringify({
                    requestNo: pricingData.enquiry.requestNo,
                    customerName: custName
                })
            });

            if (res.ok) {
                const newActive = pricingData.enquiry.customerName || '';
                loadPricing(pricingData.enquiry.requestNo, newActive);
            } else {
                alert('Failed to delete customer pricing');
            }
        } catch (err) {
            console.error('Error deleting customer:', err);
            alert('Error deleting customer');
        }
    };

    // Dynamic Customer Tabs Filter (Step 1727)
    const displayedCustomers = React.useMemo(() => {
        if (!pricingData || !selectedLeadId) return [];
        // Admins/Managers early out removed - properly evaluated below

        const myJobs = effectiveMyJobItemNames;
        const selectedJob = pricingData.jobs?.find(j => j.id == selectedLeadId);
        if (!selectedJob) return [];

        // 1. Identify External Customers (Main + Extra)
        const masterList = (pricingData.enquiry?.customerName || '').split(',').map(c => c.trim()).filter(Boolean);
        const extraList = (pricingData.extraCustomers || []).flatMap(c => (c || '').split(',')).map(c => c.trim()).filter(Boolean);
        const externalCustomers = [...masterList, ...extraList];

        // 2. Identify jobs in the current Lead Job's tree
        const treeJobs = new Set([Number(selectedLeadId)]);
        let changed = true;
        while (changed) {
            changed = false;
            pricingData.jobs.forEach(j => {
                if (j.parentId !== null && j.parentId !== undefined) {
                    const pId = Number(j.parentId || j.ParentID);
                    const id = Number(j.id || j.ID);
                    if (treeJobs.has(pId) && !treeJobs.has(id)) {
                        treeJobs.add(id);
                        changed = true;
                    }
                }
            });
        }

        // 3. Parent Jobs (Internal Customers) and Root Status in THIS Tree
        const parentCustomers = new Set();
        let amIRootInTree = false;

        if (pricingData?.jobs) {
            pricingData.jobs.forEach(jobObj => {
                if (!treeJobs.has(Number(jobObj.id || jobObj.ID))) return;

                myJobs.forEach(assignedName => {
                    const cleanAssigned = String(assignedName || '').trim().toLowerCase();
                    const cleanJob = String(jobObj.itemName || '').trim().toLowerCase();

                    if (cleanJob === cleanAssigned) {
                        if (Number(jobObj.id || jobObj.ID) === Number(selectedLeadId)) {
                            amIRootInTree = true;
                        }

                        const pId = jobObj.parentId || jobObj.ParentID;
                        if (pId && pId !== '0' && pId !== 0) {
                            const parentObj = pricingData.jobs.find(p => Number(p.id || p.ID) === Number(pId));
                            if (parentObj) {
                                const cleanP = String(parentObj.itemName || '').trim();
                                parentCustomers.add(cleanP);
                            }
                        }
                    }
                });
            });
        }

        const allPossibleCustomers = [...new Set([
            ...externalCustomers,
            ...Array.from(parentCustomers)
        ])];

        return allPossibleCustomers.filter(cName => {
            const cleanC = cName.trim();

            if (pricingData.access?.canEditAll) {
                const isExternal = externalCustomers.includes(cleanC);
                const isInternalParent = pricingData.jobs.some(j => {
                    if (!treeJobs.has(Number(j.id || j.ID))) return false;
                    const pId = j.parentId || j.ParentID;
                    if (!pId || pId === '0' || pId === 0) return false;
                    const parent = pricingData.jobs.find(p => Number(p.id || p.ID) === Number(pId));
                    return parent && String(parent.itemName || '').trim() === cleanC;
                });
                return isExternal || isInternalParent;
            }

            // ENHANCED LOGIC (customer tab labels)
            // 1) Own job is the selected lead job → tabs are external enquiry customers only (main + extra), not internal job/parent names.
            // 2) Own job is a subjob under that lead → tabs are parent job name(s) only (parentCustomers); see else branch.
            if (amIRootInTree) {
                return externalCustomers.includes(cleanC);
            }
            // Sub-job user in this lead’s tree: parent job tab(s) only (already tracked in parentCustomers).
            if (parentCustomers.has(cleanC)) return true;
            return false;
        });
    }, [pricingData, selectedLeadId, effectiveMyJobItemNames, pricingListDivision]);

    /**
     * Lead job change: dropdown only updates `selectedLeadId` + sets `leadChangeReloadPendingRef`.
     * This effect runs once after `displayedCustomers` matches the new lead (same tick as next paint),
     * picks a valid customer tab, and calls `loadPricing` **once** (previously: dropdown + tab-sync = 2× fetch).
     */
    useEffect(() => {
        if (!leadChangeReloadPendingRef.current) return;
        if (!pricingData?.enquiry?.requestNo || selectedLeadId == null || loading) return;
        const tabs = displayedCustomers;
        if (!tabs.length) {
            leadChangeReloadPendingRef.current = false;
            return;
        }

        leadChangeReloadPendingRef.current = false;

        const nextCust = tabs.includes(selectedCustomer) ? selectedCustomer : tabs[0];
        const nextKey = normalizePricingCustomerKey(nextCust);
        const nextDraft = (nextKey && draftValuesByCustomerRef.current[nextKey]) || {};
        const nextDeclineDraft = (nextKey && draftDeclineByCustomerRef.current[nextKey]) || {};
        if (nextCust !== selectedCustomer) {
            setSelectedCustomer(nextCust);
        }
        // Restore full customer draft (all lead jobs) after flush captured the previous lead view.
        setValues(nextDraft);
        setDeclineToQuote(nextDeclineDraft);
        void loadPricing(pricingData.enquiry.requestNo, nextCust, nextDraft, {
            useLeadIdForValueInit: selectedLeadId,
            preserveSourceCustomerKey: nextCust,
            silentRefresh: true,
        });
    }, [selectedLeadId, displayedCustomers, pricingData?.enquiry?.requestNo, loading, selectedCustomer]);

    /** If current tab is invalid for the rebuilt tab list (e.g. data refresh) without a lead change — fix tab only. */
    useEffect(() => {
        if (leadChangeReloadPendingRef.current) return;
        if (!displayedCustomers.length || !pricingData || loading) return;
        if (!selectedCustomer || displayedCustomers.includes(selectedCustomer)) return;
        setSelectedCustomer(displayedCustomers[0]);
    }, [displayedCustomers, pricingData, loading, selectedCustomer]);

    // Get visible jobs
    const visibleJobs = pricingData ? pricingData.jobs.filter(j => j.visible !== false) : [];

    // Filter Options based on Custom Scope Logic
    // Filter Options based on Custom Scope Logic
    const filteredOptions = React.useMemo(() => {
        if (!pricingData || !pricingData.options) return [];

        const seenKeys = new Set();
        const editable = effectiveMyJobItemNames;

        // Calculate Scope of Active Lead Job (for Filtering)
        let leadScope = new Set();
        let activeLeadName = null;

        let activeLeadCode = '';
        if (selectedLeadId && pricingData.jobs) {
            const leadJob = pricingData.jobs.find(j => j.id == selectedLeadId);
            if (leadJob) {
                activeLeadName = leadJob.itemName;
                activeLeadCode = String(leadJob.leadJobCode || leadJob.LeadJobCode || '').trim();

                // Same subtree as getPricingLeadSubtreeIds / table filter (avoids empty leadScope when parent/child id types differ from recursive getChildren).
                const subtreeIds = getPricingLeadSubtreeIds(leadJob.id, pricingData.jobs);
                pricingData.jobs.forEach((j) => {
                    const jid = nid(j.id);
                    if (jid != null && subtreeIds.has(jid)) leadScope.add(j.itemName);
                });
                if (activeLeadCode) leadScope.add(activeLeadCode);
            }
        }

        /** Matches header badge: division-scoped own job is this lead root → show Base Price for whole subtree (server hasLeadAccess can be false when access is division-only). */
        let clientOwnJobCoversLeadSubtree = false;
        if (selectedLeadId && pricingData.jobs) {
            const leadJobRow = pricingData.jobs.find((j) => j.id == selectedLeadId);
            const isLeadRoot =
                leadJobRow &&
                (leadJobRow.parentId == null ||
                    leadJobRow.parentId === '' ||
                    leadJobRow.parentId === 0 ||
                    leadJobRow.parentId === '0');
            if (isLeadRoot) {
                const editableObjs = (pricingData.jobs || []).filter((j) =>
                    editable.some((en) => sameEnquiryItemName(en, j.itemName))
                );
                clientOwnJobCoversLeadSubtree = editableObjs.some(
                    (ej) => String(ej.id) === String(leadJobRow.id)
                );
            }
        }

        const optItemInLeadTree = (itemName) => {
            if (!itemName || !activeLeadName) return false;
            const t = itemName.trim();
            if (leadScope.has(t)) return true;
            for (const n of leadScope) {
                if (sameEnquiryItemName(t, n)) return true;
            }
            return false;
        };

        // Helper to check if option belongs to a child of an editable job
        const isRelatedToEditable = (optItemName) => {
            if (!optItemName) return false;
            if (editable.some((e) => sameEnquiryItemName(e, optItemName))) return true;
            const optJob = pricingData.jobs.find((j) => sameEnquiryItemName(j.itemName, optItemName));
            if (!optJob) return false;
            if (optJob.parentId != null && optJob.parentId !== '' && optJob.parentId !== 0 && optJob.parentId !== '0') {
                const parentJob = pricingData.jobs.find(p => p.id == optJob.parentId);
                if (parentJob && editable.some((e) => sameEnquiryItemName(e, parentJob.itemName))) return true;
            }
            if (optItemName.includes('BMS') && editable.some(e => e.includes('Electrical'))) return true;
            return false;
        };

        // Step 1: Broad Filter (Context + Scope Match)
        // Options may only set leadJobName (no itemName) — they must still pass isScopeMatch.
        const candidates = pricingData.options.filter(o => {
            let matchesActiveLeadTag = false;
            if (activeLeadName) {
                if (o.leadJobName) {
                    const ln = (o.leadJobName || '').trim();
                    const aln = (activeLeadName || '').trim();
                    matchesActiveLeadTag =
                        ln === aln ||
                        (!!activeLeadCode && ln === activeLeadCode) ||
                        sameEnquiryItemName(ln, aln);
                    // Options are saved against a specific lead selection — do not show them under a different lead root
                    // just because ItemName still sits in that subtree (e.g. Civil-scoped BMS row must not appear when "HVAC" is the selected lead).
                    if (!matchesActiveLeadTag) {
                        if (clientOwnJobCoversLeadSubtree && o.itemName && optItemInLeadTree(o.itemName)) {
                            matchesActiveLeadTag = true;
                        } else {
                            return false;
                        }
                    }
                } else if (o.itemName) {
                    if (!optItemInLeadTree(o.itemName)) return false;
                    const jobRow = pricingData.jobs.find((j) => sameEnquiryItemName(j.itemName, o.itemName));
                    if (jobRow && selectedLeadId != null) {
                        const root = enquiryForRootJob(jobRow, pricingData.jobs);
                        if (root && String(root.id) !== String(selectedLeadId)) return false;
                    }
                }
            }

            const isScopeMatch =
                pricingData.access.canEditAll ||
                pricingData.access.hasLeadAccess ||
                clientOwnJobCoversLeadSubtree ||
                isRelatedToEditable(o.itemName) ||
                (activeLeadName && o.itemName && optItemInLeadTree(o.itemName)) ||
                matchesActiveLeadTag;

            if (!isScopeMatch) return false;

            return true;
        });

        // Scope options to the active customer tab so each tab resolves its own EnquiryPricingOptions IDs.
        // Without this, dedupe kept the first row seen for Base Price + item + lead across AWAL vs Ramada and showed wrong prices / zeros.
        const selCust = (selectedCustomer || '').trim();
        const selCustLower = selCust.toLowerCase();
        const tabScopedCandidates = candidates.filter((o) => {
            const oc = (o.customerName || '').trim();
            if (oc.toLowerCase() === selCustLower) return true;

            // Blank CustomerName must not mean "every tab" — pin subjobs to their parent internal tab; root-only rows to enquiry externals.
            if (!oc) {
                const jobRow = pricingData.jobs?.find((j) => sameEnquiryItemName(j.itemName, o.itemName || ''));
                if (!jobRow) return false;
                const pid = jobRow.parentId;
                const hasParent =
                    pid != null && pid !== '' && pid !== 0 && pid !== '0';
                if (hasParent) {
                    const par = pricingData.jobs.find((p) => String(p.id) === String(pid));
                    const pn = par ? String(par.itemName || '').trim() : '';
                    return (
                        !!pn &&
                        normalizePricingCustomerKey(pn) === normalizePricingCustomerKey(selCust)
                    );
                }
                // Root job with blank CustomerName: DO NOT show on external tabs (BEMCO/TEMCO),
                // otherwise both tabs edit the same OptionID and values mirror.
                // External pricing must be keyed to customer-specific option rows.
                return false;
            }

            // Subjob rows may store parent / grandparent internal name — show on a tab if it matches any ancestor of the option's job.
            const jobForOpt = pricingData.jobs?.find((j) => sameEnquiryItemName(j.itemName, o.itemName || ''));
            if (!jobForOpt) return false;
            let walk = jobForOpt;
            const visited = new Set();
            while (walk && !visited.has(String(walk.id))) {
                visited.add(String(walk.id));
                const pid = walk.parentId;
                if (pid == null || pid === '' || pid === 0 || pid === '0') break;
                const par = pricingData.jobs.find((p) => String(p.id) === String(pid));
                if (!par) break;
                if (String(par.itemName || '').trim().toLowerCase() === selCustLower) return true;
                walk = par;
            }
            return false;
        });

        // Step 2: Prioritize exact customer match (legacy) and dedupe within this tab only
        tabScopedCandidates.sort((a, b) => {
            const aMatch = a.customerName === selectedCustomer ? 0 : 1;
            const bMatch = b.customerName === selectedCustomer ? 0 : 1;
            return aMatch - bMatch;
        });

        const results = [];
        tabScopedCandidates.forEach((o) => {
            const cleanName = (o.name || '').trim();
            const cleanItem = (o.itemName || '').trim();
            const cleanLead = (o.leadJobName || '').trim();
            const dedupKey = `${String(o.id)}-${cleanName}-${cleanItem}-${cleanLead || 'Legacy'}`;
            if (!seenKeys.has(dedupKey)) {
                seenKeys.add(dedupKey);
                results.push(o);
            }
        });

        // Step 3: Ensure "Base Price" row is ALWAYS present for relevant jobs
        const custKeyForSim = normalizePricingCustomerKey(selectedCustomer);
        const leadJob = pricingData.jobs?.find(j => j.id == selectedLeadId);
        if (leadJob && selectedCustomer && !results.some(
            (o) => o.name === 'Base Price' && sameEnquiryItemName(o.itemName, leadJob.itemName)
        )) {
            results.push({
                // Include customer key so simulated rows don't leak values across BEMCO/TEMCO tabs.
                id: `simulated_base_lead_${leadJob.id}_${custKeyForSim || 'tab'}`,
                name: 'Base Price',
                itemName: leadJob.itemName,
                customerName: selectedCustomer,
                isSimulated: true
            });
        }

        pricingData.jobs.forEach(sj => {
            if (!optItemInLeadTree(sj.itemName || '')) return;
            const canSeeOrEdit =
                pricingData.access.canEditAll ||
                pricingData.access.hasLeadAccess ||
                clientOwnJobCoversLeadSubtree ||
                editable.some((en) => sameEnquiryItemName(en, sj.itemName));
            if (canSeeOrEdit && !results.some(
                (o) => o.name === 'Base Price' && sameEnquiryItemName(o.itemName, sj.itemName)
            )) {
                results.push({
                    // Include customer key so simulated rows don't leak values across tabs.
                    id: `simulated_base_sj_${sj.id}_${custKeyForSim || 'tab'}`,
                    name: 'Base Price',
                    itemName: sj.itemName,
                    customerName: selectedCustomer,
                    isSimulated: true
                });
            }
        });

        if (import.meta.env.DEV) {
            const byLead = {};
            const byItem = {};
            results.forEach((o) => {
                const k = (o.leadJobName || '(no leadJobName)').trim();
                byLead[k] = (byLead[k] || 0) + 1;
                const ik = (o.itemName || '(no itemName)').trim();
                byItem[ik] = (byItem[ik] || 0) + 1;
            });
            console.log('[Pricing filteredOptions] selectedLeadId', selectedLeadId, 'jobs', pricingData.jobs?.length, 'raw options', pricingData.options?.length, 'filtered', results.length, 'by leadJobName', byLead, 'by itemName', byItem);
        }

        return results;
    }, [pricingData, selectedCustomer, selectedLeadId, effectiveMyJobItemNames, pricingListDivision]);

    /** Full-height list shell so wide tables scroll horizontally at the bottom of the viewport, not under a short tbody. */
    const listFillsViewport =
        !pricingEditorStandalone &&
        !pricingData &&
        ((pricingListCategory === PRICING_LIST_CATEGORY.SEARCH && searchResults.length > 0) ||
            (pricingListCategory === PRICING_LIST_CATEGORY.PENDING && pendingRequests.length > 0));

    const pricingListSortedSearch = React.useMemo(
        () => sortPricingEnquiryListRows(searchResults, searchSortConfig),
        [searchResults, searchSortConfig]
    );

    const pricingListSortedPending = React.useMemo(
        () => sortPricingEnquiryListRows(pendingRequests, pendingSortConfig),
        [pendingRequests, pendingSortConfig]
    );

    const pricingSearchColFilters = useTableColumnHeaderFilters(
        pricingListSortedSearch,
        getPricingListFilterValue,
        PRICING_LIST_FILTER_KEYS_SEARCH
    );
    const pricingPendingColFilters = useTableColumnHeaderFilters(
        pricingListSortedPending,
        getPricingListFilterValue,
        PRICING_LIST_FILTER_KEYS_PENDING
    );
    pricingSearchColFiltersClearRef.current = pricingSearchColFilters.clearAllColumnFilters;
    pricingPendingColFiltersClearRef.current = pricingPendingColFilters.clearAllColumnFilters;

    const activePricingColFilters =
        pricingListCategory === PRICING_LIST_CATEGORY.SEARCH
            ? pricingSearchColFilters
            : pricingPendingColFilters;

    const sortedSearchResultsForTable = pricingSearchColFilters.filteredRows;
    const sortedPendingForTable = pricingPendingColFilters.filteredRows;

    const handlePricingSearchListSort = (field, initialDirection = 'asc') => {
        setSearchSortConfig((prev) =>
            prev.field === field
                ? { field, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
                : { field, direction: initialDirection }
        );
    };

    const handlePricingPendingListSort = (field, initialDirection = 'asc') => {
        setPendingSortConfig((prev) =>
            prev.field === field
                ? { field, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
                : { field, direction: initialDirection }
        );
    };

    const pricingListThBase = {
        padding: '6px 10px',
        textAlign: 'left',
        fontSize: '11.7px',
        fontWeight: '400',
        color: '#ffffff',
        borderBottom: '1px solid rgba(210, 222, 255, 0.25)',
        whiteSpace: 'nowrap',
        background: EMS_TABLE_HEADER_GRADIENT,
        top: 0,
        zIndex: 2,
    };

    return (
        <div
            style={{
                padding: '4px 5px 10px',
                background: '#f5f7fa',
                minHeight: 'calc(100vh - 80px)',
                ...(listFillsViewport
                    ? {
                          height: 'calc(100vh - 80px)',
                          boxSizing: 'border-box',
                          display: 'flex',
                          flexDirection: 'column',
                      }
                    : {}),
                ...(pricingEditorStandalone
                    ? {
                          boxSizing: 'border-box',
                          display: 'flex',
                          flexDirection: 'column',
                      }
                    : {}),
            }}
        >
            {/* Sticky: list filters (always) + when editing prices: Back, project, Lead Job, customers */}
            <div
                style={{
                    position: pricingData && !loading ? 'relative' : 'sticky',
                    top: pricingData && !loading ? undefined : PRICING_STICKY_TOP,
                    zIndex: 100,
                    background: '#f5f7fa',
                    ...(listFillsViewport ? { flexShrink: 0 } : {}),
                }}
            >
            {/* List filters (same pattern as Quote: category, criteria, price-update dates, Search / Clear) */}
            <div
                style={{
                    background: 'linear-gradient(180deg, #dce5f2 0%, #cfdced 55%, #c2d2e6 100%)',
                    padding: '5px 10px',
                    borderRadius: '6px',
                    marginBottom:
                        (pricingData && !loading) || (pricingEditorStandalone && loading && !pricingData)
                            ? '2px'
                            : '4px',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7), 0 2px 8px rgba(71, 85, 105, 0.12)',
                }}
            >
                <div
                    ref={searchRef}
                    style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'flex-end',
                        justifyContent: 'flex-start',
                        gap: '6px 10px',
                        rowGap: '4px',
                        width: '100%',
                    }}
                >
                    <label
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                            gap: '2px',
                            margin: 0,
                        }}
                    >
                        <span
                            style={{
                                fontSize: '10.5px',
                                fontWeight: '600',
                                color: '#475569',
                                lineHeight: 1.15,
                            }}
                        >
                            Division
                        </span>
                        <select
                            value={pricingListDivision}
                            onChange={(e) => setPricingListDivision(e.target.value)}
                            disabled={pricingListDivisionsLoading || !pricingListDivisions.length}
                            style={{
                                minWidth: '168px',
                                maxWidth: '220px',
                                padding: '3px 6px',
                                fontSize: '10.5px',
                                minHeight: '26px',
                                borderRadius: '6px',
                                border: '1px solid #cbd5e1',
                                background: pricingListDivisionsLoading ? '#f1f5f9' : '#fff',
                                color: '#334155',
                                cursor:
                                    pricingListDivisionsLoading
                                    || pricingListDivisions.length === 0
                                        ? 'not-allowed'
                                        : 'pointer',
                            }}
                        >
                            {pricingListDivisionsLoading && pricingListDivisions.length === 0 && (
                                <option value="" disabled>
                                    Loading…
                                </option>
                            )}
                            {!pricingListDivisionsLoading && pricingListDivisions.length === 0 && (
                                <option value="" disabled>
                                    No divisions
                                </option>
                            )}
                            {pricingListDivisions.map((d) => (
                                <option key={d} value={d}>
                                    {d}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                            gap: '2px',
                            margin: 0,
                        }}
                    >
                        <span
                            style={{
                                fontSize: '10.5px',
                                fontWeight: '600',
                                color: '#475569',
                                lineHeight: 1.15,
                            }}
                        >
                            Category
                        </span>
                        <select
                            value={pricingListCategory}
                            onChange={(e) => {
                                const v = e.target.value;
                                setPricingEditorStandalone(false);
                                setPricingListCategory(v);
                                if (v === PRICING_LIST_CATEGORY.PENDING) {
                                    setSearchResults([]);
                                    setPricingSearchAttempted(false);
                                    setPricingListSearchCriteria('');
                                    // Otherwise the list stays hidden behind `!pricingData` and the main area looks blank.
                                    setPricingData(null);
                                    setSelectedEnquiry(null);
                                    refreshPendingRequests();
                                }
                            }}
                            style={{
                                minWidth: '148px',
                                padding: '3px 6px',
                                fontSize: '10.5px',
                                minHeight: '26px',
                                borderRadius: '6px',
                                border: '1px solid #cbd5e1',
                                background: '#fff',
                                color: '#334155',
                                cursor: 'pointer',
                            }}
                        >
                            <option value={PRICING_LIST_CATEGORY.PENDING}>Pending Pricing</option>
                            <option value={PRICING_LIST_CATEGORY.SEARCH}>Search Price</option>
                        </select>
                    </label>
                    <label
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                            gap: '2px',
                            margin: 0,
                            flex: '2 1 196px',
                            minWidth: '154px',
                            maxWidth: '448px',
                        }}
                    >
                        <span
                            style={{
                                fontSize: '10.5px',
                                fontWeight: '600',
                                color: '#475569',
                                lineHeight: 1.15,
                            }}
                        >
                            Search criteria
                        </span>
                        <div style={{ position: 'relative', width: '100%', minWidth: '140px' }}>
                            <input
                                type="text"
                                autoComplete="off"
                                value={pricingListSearchCriteria}
                                onChange={(e) => handlePricingListCriteriaInput(e.target.value)}
                                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                                onKeyDown={(e) => {
                                    if (e.key !== 'Enter') return;
                                    e.preventDefault();
                                    if (pricingListCategory !== PRICING_LIST_CATEGORY.SEARCH || searching) return;
                                    handlePricingListSearch();
                                }}
                                disabled={pricingListCategory !== PRICING_LIST_CATEGORY.SEARCH}
                                placeholder={
                                    pricingListCategory === PRICING_LIST_CATEGORY.SEARCH
                                        ? 'Enquiry no., project, customer, client, consultant, updated by… (use From/To for latest price update date)'
                                        : 'Select "Search Price" to enable'
                                }
                                style={{
                                    width: '100%',
                                    padding: '3px 6px',
                                    fontSize: '10.5px',
                                    minHeight: '26px',
                                    boxSizing: 'border-box',
                                    borderRadius: '6px',
                                    border: '1px solid #cbd5e1',
                                    background: pricingListCategory === PRICING_LIST_CATEGORY.SEARCH ? '#fff' : '#f1f5f9',
                                    color: '#334155',
                                    opacity: pricingListCategory === PRICING_LIST_CATEGORY.SEARCH ? 1 : 0.65,
                                    cursor: pricingListCategory === PRICING_LIST_CATEGORY.SEARCH ? 'text' : 'not-allowed',
                                }}
                            />
                            {showSuggestions && suggestions.length > 0 && (
                                <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    right: 0,
                                    background: 'white',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '6px',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                    zIndex: 1000,
                                    maxHeight: '300px',
                                    overflowY: 'auto',
                                    marginTop: '4px'
                                }}>
                                    {suggestions.map((enq, idx) => (
                                        <div
                                            key={enq.RequestNo || idx}
                                            onClick={() => handleSelectSuggestion(enq)}
                                            style={{
                                                padding: '10px 14px',
                                                cursor: 'pointer',
                                                borderBottom: idx < suggestions.length - 1 ? '1px solid #f1f5f9' : 'none',
                                                transition: 'background 0.15s'
                                            }}
                                            onMouseOver={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
                                            onMouseOut={(e) => { e.currentTarget.style.background = 'white'; }}
                                        >
                                            <div style={{ fontWeight: '600', fontSize: '13px', color: '#1e293b' }}>
                                                {enq.RequestNo}
                                            </div>
                                            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                                                {enq.ProjectName || 'No project'} • {enq.CustomerName || 'No customer'}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </label>
                    <div
                        style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            alignItems: 'flex-end',
                            gap: '6px',
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'flex-start',
                                gap: '2px',
                                fontSize: '10.5px',
                                fontWeight: '600',
                                color: '#475569',
                                opacity: pricingListCategory === PRICING_LIST_CATEGORY.SEARCH ? 1 : 0.65,
                            }}
                        >
                            <span style={{ whiteSpace: 'nowrap' }}>From</span>
                            <div
                                style={{
                                    width: '128px',
                                    pointerEvents: pricingListCategory === PRICING_LIST_CATEGORY.SEARCH ? 'auto' : 'none',
                                }}
                            >
                                <DateInput
                                    value={pricingListDateFrom}
                                    onChange={(e) => {
                                        const nextFrom = e.target.value;
                                        setPricingListDateFrom(nextFrom);
                                        if (nextFrom && !pricingListDateTo) {
                                            const today = new Date();
                                            const yyyy = today.getFullYear();
                                            const mm = String(today.getMonth() + 1).padStart(2, '0');
                                            const dd = String(today.getDate()).padStart(2, '0');
                                            setPricingListDateTo(`${yyyy}-${mm}-${dd}`);
                                        }
                                    }}
                                    disabled={pricingListCategory !== PRICING_LIST_CATEGORY.SEARCH}
                                    placeholder="DD-MMM-YYYY"
                                    style={{
                                        fontSize: '10.5px',
                                        padding: '3px 6px',
                                        minHeight: '26px',
                                        height: '26px',
                                        cursor: pricingListCategory === PRICING_LIST_CATEGORY.SEARCH ? 'pointer' : 'not-allowed',
                                    }}
                                />
                            </div>
                        </div>
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'flex-start',
                                gap: '2px',
                                fontSize: '10.5px',
                                fontWeight: '600',
                                color: '#475569',
                                opacity: pricingListCategory === PRICING_LIST_CATEGORY.SEARCH ? 1 : 0.65,
                            }}
                        >
                            <span style={{ whiteSpace: 'nowrap' }}>To</span>
                            <div
                                style={{
                                    width: '128px',
                                    pointerEvents: pricingListCategory === PRICING_LIST_CATEGORY.SEARCH ? 'auto' : 'none',
                                }}
                            >
                                <DateInput
                                    value={pricingListDateTo}
                                    onChange={(e) => setPricingListDateTo(e.target.value)}
                                    disabled={pricingListCategory !== PRICING_LIST_CATEGORY.SEARCH}
                                    placeholder="DD-MMM-YYYY"
                                    style={{
                                        fontSize: '10.5px',
                                        padding: '3px 6px',
                                        minHeight: '26px',
                                        height: '26px',
                                        cursor: pricingListCategory === PRICING_LIST_CATEGORY.SEARCH ? 'pointer' : 'not-allowed',
                                    }}
                                />
                            </div>
                        </div>
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'flex-start',
                                gap: '2px',
                            }}
                        >
                            <span
                                aria-hidden
                                style={{ display: 'block', minHeight: '11px' }}
                            />
                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
                                <button
                                    type="button"
                                    onClick={handlePricingListSearch}
                                    disabled={pricingListCategory !== PRICING_LIST_CATEGORY.SEARCH || searching}
                                    style={{
                                        ...(pricingListCategory === PRICING_LIST_CATEGORY.SEARCH && !searching
                                            ? EMS_LIST_SEARCH_ENABLED_STYLE
                                            : EMS_LIST_SEARCH_DISABLED_STYLE),
                                        padding: '3px 10px',
                                        fontSize: '10.5px',
                                        fontWeight: '600',
                                        minHeight: '26px',
                                        borderRadius: '6px',
                                        cursor: pricingListCategory === PRICING_LIST_CATEGORY.SEARCH && !searching ? 'pointer' : 'not-allowed',
                                    }}
                                >
                                    {searching ? 'Searching…' : 'Search'}
                                </button>
                                <button
                                    type="button"
                                    onClick={handlePricingListClear}
                                    style={{
                                        ...EMS_LIST_CLEAR_STYLE,
                                        padding: '3px 10px',
                                        fontSize: '10.5px',
                                        fontWeight: '600',
                                        minHeight: '26px',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                    }}
                                >
                                    Clear
                                </button>
                                <button
                                    type="button"
                                    className="ems-cf-clear-filters-btn"
                                    onClick={() => activePricingColFilters.clearAllColumnFilters()}
                                    disabled={!activePricingColFilters.hasColumnFilters}
                                    title="Clear all column filters"
                                    aria-label="Clear all column filters"
                                >
                                    <FilterX size={13} strokeWidth={2} aria-hidden="true" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {pricingEditorStandalone && loading && !pricingData && (
                <div style={{ marginBottom: '6px', display: 'flex', alignItems: 'center' }}>
                    <button
                        type="button"
                        onClick={closePricingEditor}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '5px 10px',
                            fontSize: '11.5px',
                            fontWeight: '600',
                            color: '#1e40af',
                            background: '#fff',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                        }}
                    >
                        <ChevronLeft size={14} aria-hidden />
                        Back to pricing list
                    </button>
                </div>
            )}

            {pricingEditorStandalone && !loading && !pricingData && pricingLoadError && (
                <div
                    style={{
                        marginBottom: '16px',
                        padding: '16px 18px',
                        borderRadius: '8px',
                        border: '1px solid #fecaca',
                        background: '#fef2f2',
                        color: '#991b1b',
                        fontSize: '13px',
                        lineHeight: 1.45,
                    }}
                >
                    <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
                        <button
                            type="button"
                            onClick={closePricingEditor}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '5px 10px',
                                fontSize: '11.5px',
                                fontWeight: '600',
                                color: '#1e40af',
                                background: '#fff',
                                border: '1px solid #e2e8f0',
                                borderRadius: '6px',
                                cursor: 'pointer',
                            }}
                        >
                            <ChevronLeft size={14} aria-hidden />
                            Back to pricing list
                        </button>
                    </div>
                    <strong>Could not load pricing.</strong> {pricingLoadError}
                </div>
            )}

            {pricingData && !loading && (
                <>
                    {pricingEditorStandalone && (
                        <div
                            style={{
                                marginBottom: '6px',
                                display: 'flex',
                                alignItems: 'center',
                                flexShrink: 0,
                            }}
                        >
                            <button
                                type="button"
                                onClick={closePricingEditor}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '5px 10px',
                                    fontSize: '11.5px',
                                    fontWeight: '600',
                                    color: '#1e40af',
                                    background: '#fff',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                                }}
                            >
                                <ChevronLeft size={14} aria-hidden />
                                Back to pricing list
                            </button>
                        </div>
                    )}
                    <div
                        style={{
                            background: 'white',
                            borderRadius: selectedLeadId ? '8px 8px 0 0' : '8px',
                            overflow: 'hidden',
                            boxShadow: pricingEditorStandalone ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                        }}
                    >
                        {/* Enquiry Info Header */}
                        <div
                            style={{
                                padding: '10px 14px',
                                borderBottom: '1px solid #e2e8f0',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                background: 'linear-gradient(180deg, #dce5f2 0%, #cfdced 55%, #c2d2e6 100%)',
                                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7), 0 2px 8px rgba(71, 85, 105, 0.12)',
                            }}
                        >
                            <div>
                                <h3 style={{ margin: 0, fontSize: '13px', color: '#374151', fontWeight: '600' }}>
                                    <span style={{ fontWeight: '600', color: '#64748b' }}>Project Name: </span>
                                    {pricingData.enquiry.projectName || '—'}
                                    <span style={{ fontWeight: '400', color: '#64748b', marginLeft: '4px', fontSize: '12px' }}>
                                        (Enquiry {pricingData.enquiry.requestNo ?? '—'})
                                    </span>
                                </h3>
                            </div>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                {(() => {
                                    // Access type should depend on whether the user's "own job" is the selected Lead Job.
                                    // - If selected lead job is the same as user's assigned editable job => "Lead Job Access"
                                    // - Otherwise (user is editing a subjob under this selected lead job scope) => "Subjob Access"
                                    const selectedJob = (pricingData.jobs || []).find(j => String(j.id) === String(selectedLeadId));

                                    const editableJobNames = effectiveMyJobItemNames;
                                    const editableJobs = (pricingData.jobs || []).filter(j => editableJobNames.includes(j.itemName));

                                    const ownJobMatchesSelected =
                                        !!selectedJob &&
                                        editableJobs.some(ej => String(ej.id) === String(selectedJob.id));

                                    const isSelectedLeadRoot =
                                        !!selectedJob &&
                                        (!selectedJob.parentId || selectedJob.parentId === 0 || selectedJob.parentId === '0');

                                    const isLeadAccess = ownJobMatchesSelected && isSelectedLeadRoot;

                                    const label = isLeadAccess ? 'Lead Job Access' : 'Subjob Access';
                                    const bg = isLeadAccess ? '#dcfce7' : '#fef3c7';
                                    const fg = isLeadAccess ? '#166534' : '#92400e';

                                    return (
                                        <span style={{
                                            padding: '3px 8px',
                                            borderRadius: '12px',
                                            fontSize: '10px',
                                            fontWeight: '600',
                                            background: bg,
                                            color: fg
                                        }}>
                                            {label}
                                        </span>
                                    );
                                })()}
                                <button
                                    type="button"
                                    onClick={closePricingEditor}
                                    style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
                                    aria-label="Close pricing editor"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Lead Job Selector (Filter by User Access) */}
                        {(() => {
                            if (!pricingData) return null;

                            // Filter roots based on visible assignments (e.g., Department Scope)
                            const visibleScope = pricingData.access?.visibleJobs || [];
                            const anyRootHasLPrefixInName = pricingData.jobs.some(j => isRootJob(j) && /^L\d+\s-\s/.test(j.itemName || ''));

                            // FIX: Use ID-based visibility flag (set by backend per job) to avoid
                            // confusing same-named jobs at different levels (e.g. root BMS vs child BMS)
                            // Name-based visibleScope matching caused root BMS to appear for Electrical
                            // users because child BMS shared the same itemName as root BMS.
                            const isTreeVisibleById = (jobId) => {
                                const job = pricingData.jobs.find(j => j.id == jobId);
                                if (!job) return false;
                                // Use the `visible` flag directly (set by backend's ID-based traversal)
                                if (job.visible === true) return true;
                                // Recurse into children
                                const jn = nid(jobId);
                                const children = pricingData.jobs.filter(j => nid(j.parentId) === jn);
                                return children.some(c => isTreeVisibleById(c.id));
                            };

                            const roots = pricingData.jobs.filter(j => {
                                if (!isRootJob(j)) return false;
                                if (!rootPassesLeadNaming(j, anyRootHasLPrefixInName)) return false;
                                if (!isTreeVisibleById(j.id)) return false;
                                return true;
                            });

                            if (import.meta.env.DEV) {
                                console.log('[Pricing render roots]', roots.length, roots.map((r) => ({ id: r.id, itemName: r.itemName, leadJobCode: r.leadJobCode || r.LeadJobCode })));
                            }
                            console.log(`Pricing Render: ${roots.length} Lead Jobs identified.`);

                            if (roots.length === 0) return null;

                            const selectedRoot = roots.find(r => String(r.id) === String(selectedLeadId || ''));
                            const selectedLeadCode = ((selectedRoot?.leadJobCode || selectedRoot?.LeadJobCode || '') + '').trim();
                            return (
                                <div style={{ padding: '8px 14px', background: '#f1f5f9', borderBottom: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '11.5px', fontWeight: '600', color: '#475569' }}>Select Lead Job:</span>
                                    <select
                                        disabled={false}
                                        value={selectedLeadId != null && selectedLeadId !== '' ? String(selectedLeadId) : ''}
                                        onChange={(e) => {
                                            flushPricingDraftsForCurrentView();
                                            const val = e.target.value;
                                            const newId = val === '' ? null : (Number.isFinite(Number(val)) ? Number(val) : val);
                                            console.log('Lead Job Selected (Change):', newId);
                                            setSelectedLeadId(newId);
                                            if (pricingData?.enquiry?.requestNo && newId != null) {
                                                leadChangeReloadPendingRef.current = true;
                                            }
                                        }}
                                        style={{
                                            padding: '4px 8px',
                                            borderRadius: '4px',
                                            border: '1px solid #cbd5e1',
                                            fontSize: '11.5px',
                                            minWidth: '170px',
                                            backgroundColor: 'white',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <option value="">Select Lead Job...</option>
                                         {roots.map(r => {
                                             const name = r.itemName || '';
                                             return <option key={r.id} value={String(r.id)}>{name}</option>;
                                         })}
                                    </select>
                                    {selectedLeadCode ? (
                                        <span style={{
                                            padding: '2px 6px',
                                            borderRadius: '999px',
                                            border: '1px solid #cbd5e1',
                                            background: '#ffffff',
                                            color: '#334155',
                                            fontSize: '10.5px',
                                            fontWeight: '600'
                                        }}>
                                            {selectedLeadCode}
                                        </span>
                                    ) : null}
                                </div>
                            );
                        })()}

                        {/* Customer Selection Tabs */}
                        {selectedLeadId && (
                            <div style={{ padding: '4px 0 4px', background: '#ffffff', borderBottom: 'none', overflow: addingCustomer ? 'visible' : 'auto' }}>
                                <div
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'flex-start',
                                        minWidth: 'min-content',
                                        width: 'fit-content',
                                        maxWidth: '100%',
                                        background: EMS_TABLE_HEADER_GRADIENT,
                                        borderRadius: '12px',
                                        padding: '2px',
                                        boxShadow: '0 2px 8px rgba(23, 47, 99, 0.35), inset 0 1px 0 rgba(255,255,255,0.2)',
                                    }}
                                >
                                    {displayedCustomers && displayedCustomers.map((cust, idx) => (
                                        <div
                                            key={`${cust}-${idx}`}
                                            onClick={() => {
                                                if (cust === selectedCustomer) return;
                                                flushPricingDraftsForCurrentView();
                                                // Restore target tab draft
                                                const nextKey = normalizePricingCustomerKey(cust);
                                                const nextDraft =
                                                    (nextKey && draftValuesByCustomerRef.current[nextKey]) || {};
                                                const nextDeclineDraft =
                                                    (nextKey && draftDeclineByCustomerRef.current[nextKey]) || {};
                                                // Fast local tab switch using already-loaded pricing data/drafts.
                                                // Fall back to API reload only when no data is present for this tab.
                                                const hasTabData =
                                                    !!pricingData?.allValues
                                                    || !!(pricingData?.values && Object.keys(pricingData.values).length > 0)
                                                    || (nextKey && !!draftValuesByCustomerRef.current[nextKey]);
                                                if (hasTabData) {
                                                    setSelectedCustomer(cust);
                                                    setValues(nextDraft);
                                                    setDeclineToQuote(nextDeclineDraft);
                                                } else {
                                                    loadPricing(pricingData.enquiry.requestNo, cust, nextDraft, {
                                                        preserveSourceCustomerKey: cust,
                                                    });
                                                }
                                            }}
                                            style={{
                                                padding: displayedCustomers.length > 1 && selectedCustomer === cust ? '0.08rem 0.54rem' : '0.28rem 0.52rem',
                                                background: displayedCustomers.length > 1 && selectedCustomer === cust ? '#f5f5f5' : 'transparent',
                                                color: displayedCustomers.length > 1 && selectedCustomer === cust ? '#203f75' : '#f5f5f5',
                                                borderTop: 'none',
                                                borderLeft: 'none',
                                                borderRight: 'none',
                                                borderBottom: 'none',
                                                borderRadius: displayedCustomers.length > 1 && selectedCustomer === cust ? '9999px' : '5px',
                                                fontWeight: displayedCustomers.length > 1 && selectedCustomer === cust ? '600' : '500',
                                                cursor: displayedCustomers.length > 1 ? 'pointer' : 'default',
                                                fontSize: '9.7px',
                                                marginTop: '0',
                                                whiteSpace: 'nowrap',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                boxShadow: displayedCustomers.length > 1 && selectedCustomer === cust
                                                    ? 'inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 2px 5px rgba(10, 24, 54, 0.32)'
                                                    : 'none'
                                            }}
                                        >
                                            <span>{cust || 'Default Customer'}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                    </div>
                </>
            )}

            </div>

            {!pricingEditorStandalone && (
            <>
            {/* Searching Indicator */}
            {searching && (
                <div
                    style={{
                        background: 'white',
                        padding: '20px',
                        borderRadius: '8px',
                        textAlign: 'center',
                        color: '#64748b',
                        marginBottom: '20px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                        ...(listFillsViewport ? { flexShrink: 0 } : {}),
                    }}
                >
                    Searching for enquiries...
                </div>
            )}

            {/* Search Results Table */}
            {
                pricingListCategory === PRICING_LIST_CATEGORY.SEARCH && searchResults.length > 0 && !pricingData && (
                    <div
                        style={{
                            background: 'white',
                            borderRadius: '8px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                            overflow: 'hidden',
                            marginBottom: listFillsViewport ? 0 : '20px',
                            ...(listFillsViewport
                                ? {
                                      flex: 1,
                                      minHeight: 0,
                                      display: 'flex',
                                      flexDirection: 'column',
                                  }
                                : {}),
                        }}
                    >
                        <div
                            className="ems-cf-scope"
                            style={{
                                flex: listFillsViewport ? 1 : undefined,
                                minHeight: listFillsViewport ? 0 : undefined,
                                maxHeight: listFillsViewport ? undefined : 'calc(100vh - 218px)',
                                overflowY: 'auto',
                                overflowX: 'auto',
                                WebkitOverflowScrolling: 'touch',
                                borderRadius: '8px',
                            }}
                        >
                            <table
                                style={{
                                    width: 'max-content',
                                    minWidth: '100%',
                                    borderCollapse: 'collapse',
                                    tableLayout: 'auto',
                                }}
                            >
                                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                                    <tr>
                                        <TableColumnFilterHeader
                                            colKey="requestNo"
                                            label="Enquiry No."
                                            sortField="RequestNo"
                                            sortConfig={searchSortConfig}
                                            onSort={handlePricingSearchListSort}
                                            filterCtx={pricingSearchColFilters}
                                            thStyle={{ ...pricingListThBase, borderTopLeftRadius: '8px' }}
                                        />
                                        <TableColumnFilterHeader
                                            colKey="projectName"
                                            label="Project Name"
                                            sortField="ProjectName"
                                            sortConfig={searchSortConfig}
                                            onSort={handlePricingSearchListSort}
                                            filterCtx={pricingSearchColFilters}
                                            thStyle={pricingListThBase}
                                        />
                                        <TableColumnFilterHeader
                                            colKey="customerName"
                                            label="Customer Name & Total Price"
                                            sortField="CustomerName"
                                            sortConfig={searchSortConfig}
                                            onSort={handlePricingSearchListSort}
                                            filterCtx={pricingSearchColFilters}
                                            thStyle={{
                                                ...pricingListThBase,
                                                minWidth: 'min(560px, 92vw)',
                                                width: 'auto',
                                            }}
                                        />
                                        <TableColumnFilterHeader
                                            colKey="latestPriceUpdated"
                                            label="Individual & Subjob Base prices"
                                            sortField="LatestPriceUpdated"
                                            sortConfig={searchSortConfig}
                                            onSort={handlePricingSearchListSort}
                                            initialDirection="desc"
                                            filterCtx={pricingSearchColFilters}
                                            thStyle={pricingListThBase}
                                        />
                                        <TableColumnFilterHeader
                                            colKey="clientName"
                                            label="Client Name"
                                            sortField="ClientName"
                                            sortConfig={searchSortConfig}
                                            onSort={handlePricingSearchListSort}
                                            filterCtx={pricingSearchColFilters}
                                            thStyle={pricingListThBase}
                                        />
                                        <TableColumnFilterHeader
                                            colKey="consultantName"
                                            label="Consultant Name"
                                            sortField="ConsultantName"
                                            sortConfig={searchSortConfig}
                                            onSort={handlePricingSearchListSort}
                                            filterCtx={pricingSearchColFilters}
                                            thStyle={pricingListThBase}
                                        />
                                        <TableColumnFilterHeader
                                            colKey="enquiryDateCol"
                                            label="Enquiry Date"
                                            sortField="EnquiryDate"
                                            sortConfig={searchSortConfig}
                                            onSort={handlePricingSearchListSort}
                                            filterCtx={pricingSearchColFilters}
                                            thStyle={{ ...pricingListThBase, borderTopRightRadius: '8px' }}
                                        />
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedSearchResultsForTable.map((enq, idx) => {
                                        const structured = tryParsePricingListDisplay(enq);
                                        const priceSplit = structured ? null : splitSubJobPricesForListColumns(enq.SubJobPrices);
                                        const specMeta = pricingListSpecStatusMeta(enq);
                                        const statusLines = pricingListSpecStatusTwoLines(specMeta);
                                        const zebraBg = idx % 2 === 0 ? '#ffffff' : '#f1f5f9';
                                        const tdPad = '10px 12px';
                                        const tdBg = { backgroundColor: 'transparent' };
                                        const hoverGrey = '#cbd5e1';
                                        return (
                                        <tr
                                            key={enq.RequestNo || idx}
                                            style={{
                                                borderBottom: '1px solid #e2e8f0',
                                                cursor: 'pointer',
                                                transition: 'background-color 0.12s ease',
                                                backgroundColor: zebraBg,
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.backgroundColor = hoverGrey;
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.backgroundColor = zebraBg;
                                            }}
                                            onClick={() => openPricingEditorForEnquiry(enq.RequestNo)}
                                        >
                                            <td
                                                style={{
                                                    ...tdBg,
                                                    padding: tdPad,
                                                    fontSize: '11px',
                                                    color: '#1e293b',
                                                    fontWeight: '500',
                                                    verticalAlign: 'top',
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                <div>{enq.RequestNo}</div>
                                                {statusLines && (
                                                    <div
                                                        style={{
                                                            marginTop: '6px',
                                                            fontSize: '8.8px',
                                                            color: specMeta.specStatusColor,
                                                            fontWeight: 600,
                                                            lineHeight: 1.25,
                                                            whiteSpace: 'normal',
                                                        }}
                                                    >
                                                        <div>{statusLines.line1}</div>
                                                        {statusLines.line2 ? <div>{statusLines.line2}</div> : null}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ ...tdBg, padding: tdPad, fontSize: '11px', color: '#64748b', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{enq.ProjectName || '-'}</td>
                                            <td
                                                style={{
                                                    ...tdBg,
                                                    padding: tdPad,
                                                    fontSize: '11px',
                                                    color: '#64748b',
                                                    verticalAlign: 'top',
                                                    whiteSpace: 'normal',
                                                    minWidth: 'max-content',
                                                    width: 'auto',
                                                }}
                                            >
                                                {structured ? (
                                                    <PricingListCustomerTotalsFromJson
                                                        items={structured.customerTotals}
                                                        priceFixedDecimals={null}
                                                    />
                                                ) : enq.SubJobPrices ? (
                                                    <PricingListSubJobPriceLines
                                                        rows={priceSplit.customerAndTotalRows}
                                                        priceFixedDecimals={null}
                                                    />
                                                ) : (
                                                    <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>No assigned jobs</span>
                                                )}
                                            </td>
                                            <td
                                                style={{
                                                    ...tdBg,
                                                    padding: tdPad,
                                                    fontSize: '11px',
                                                    color: '#64748b',
                                                    verticalAlign: 'top',
                                                    whiteSpace: 'normal',
                                                    width: '1%',
                                                    minWidth: 'max-content',
                                                }}
                                            >
                                                {structured ? (
                                                    <PricingListJobForestFromJson
                                                        nodes={structured.jobForest}
                                                        priceFixedDecimals={null}
                                                    />
                                                ) : enq.SubJobPrices ? (
                                                    <PricingListSubJobPriceLines
                                                        rows={priceSplit.individualRows}
                                                        priceFixedDecimals={null}
                                                    />
                                                ) : (
                                                    <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>—</span>
                                                )}
                                            </td>
                                            <td style={{ ...tdBg, padding: tdPad, fontSize: '11px', color: '#64748b', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{enq.ClientName || '-'}</td>
                                            <td style={{ ...tdBg, padding: tdPad, fontSize: '11px', color: '#64748b', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{enq.ConsultantName || '-'}</td>
                                            <td style={{ ...tdBg, padding: tdPad, fontSize: '11px', color: '#64748b', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{enq.EnquiryDate ? format(new Date(enq.EnquiryDate), 'dd-MMM-yyyy') : '-'}</td>
                                        </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            }

            {/* Pending list status (always visible in Pending Pricing — avoids blank screen on API errors / zero rows) */}
            {pricingListCategory === PRICING_LIST_CATEGORY.PENDING && pendingListLoading && (
                <div style={{ background: 'white', padding: '24px', borderRadius: '8px', textAlign: 'center', color: '#64748b', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    Loading pending pricing…
                </div>
            )}
            {pricingListCategory === PRICING_LIST_CATEGORY.PENDING && !pendingListLoading && pendingListError && (
                <div style={{ background: '#fef2f2', padding: '20px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #fecaca', color: '#991b1b', fontSize: '13px' }}>
                    {pendingListError}
                </div>
            )}
            {pricingListCategory === PRICING_LIST_CATEGORY.PENDING && !pendingListLoading && !pendingListError && pendingRequests.length === 0 && (
                <div style={{ background: 'white', padding: '32px', borderRadius: '8px', textAlign: 'center', color: '#64748b', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', fontSize: '13px' }}>
                    No pending pricing items for your account. Enquiries appear here when at least one visible base price line is still <strong>Not Updated</strong>.
                </div>
            )}

            {/* Pending Requests List */}
            {
                pricingListCategory === PRICING_LIST_CATEGORY.PENDING && pendingRequests.length > 0 && (() => {
                    const sortedPending = sortedPendingForTable;
                    const sortFieldLabel =
                        pendingSortConfig.field === 'DueDate'
                            ? 'Due Date'
                            : pendingSortConfig.field === 'RequestNo'
                              ? 'Enquiry No.'
                              : pendingSortConfig.field === 'ProjectName'
                                ? 'Project Name'
                                : pendingSortConfig.field === 'CustomerName'
                                  ? 'Customer & Total Price'
                                  : pendingSortConfig.field === 'LatestPriceUpdated'
                                    ? 'Individual & Subjob Base prices'
                                    : pendingSortConfig.field === 'ClientName'
                                      ? 'Client Name'
                                      : pendingSortConfig.field === 'ConsultantName'
                                        ? 'Consultant Name'
                                        : pendingSortConfig.field;
                    const sortDirectionHint =
                        pendingSortConfig.field === 'DueDate'
                            ? pendingSortConfig.direction === 'asc'
                                ? '(Soonest first)'
                                : '(Latest first)'
                            : pendingSortConfig.field === 'LatestPriceUpdated'
                              ? pendingSortConfig.direction === 'desc'
                                ? '(Latest price first)'
                                : '(Oldest price first)'
                              : pendingSortConfig.field === 'EnquiryDate'
                                ? pendingSortConfig.direction === 'asc'
                                  ? '(Oldest first)'
                                  : '(Newest first)'
                                : pendingSortConfig.direction === 'asc'
                                  ? '(Ascending)'
                                  : '(Descending)';

                    return (
                        <div
                            style={{
                                background: 'white',
                                borderRadius: '8px',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                                overflow: 'hidden',
                                marginBottom: listFillsViewport ? 0 : '20px',
                                ...(listFillsViewport
                                    ? {
                                          flex: 1,
                                          minHeight: 0,
                                          display: 'flex',
                                          flexDirection: 'column',
                                      }
                                    : {}),
                            }}
                        >
                            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                                <h3 style={{ margin: 0, fontSize: '15px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <FileText size={16} /> Pending Updates ({pendingRequests.length})
                                </h3>
                                <span style={{ fontSize: '12px', color: '#64748b' }}>
                                    Sorted by <strong>{sortFieldLabel}</strong> {sortDirectionHint}
                                </span>
                            </div>
                            {/* Make the pending list fill the viewport height (instead of a fixed 400px). */}
                            <div
                                className="ems-cf-scope"
                                style={{
                                    flex: listFillsViewport ? 1 : undefined,
                                    minHeight: listFillsViewport ? 0 : undefined,
                                    maxHeight: listFillsViewport ? undefined : 'calc(100vh - 218px)',
                                    overflowY: 'auto',
                                    overflowX: 'auto',
                                    WebkitOverflowScrolling: 'touch',
                                }}
                            >
                                <table
                                    style={{
                                        width: 'max-content',
                                        minWidth: '100%',
                                        borderCollapse: 'collapse',
                                        tableLayout: 'auto',
                                    }}
                                >
                                    <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                                        <tr>
                                            <TableColumnFilterHeader
                                                colKey="requestNo"
                                                label="Enquiry No."
                                                sortField="RequestNo"
                                                sortConfig={pendingSortConfig}
                                                onSort={handlePricingPendingListSort}
                                                filterCtx={pricingPendingColFilters}
                                                thStyle={pricingListThBase}
                                            />
                                            <TableColumnFilterHeader
                                                colKey="projectName"
                                                label="Project Name"
                                                sortField="ProjectName"
                                                sortConfig={pendingSortConfig}
                                                onSort={handlePricingPendingListSort}
                                                filterCtx={pricingPendingColFilters}
                                                thStyle={pricingListThBase}
                                            />
                                            <TableColumnFilterHeader
                                                colKey="customerName"
                                                label="Customer Name & Total Price"
                                                sortField="CustomerName"
                                                sortConfig={pendingSortConfig}
                                                onSort={handlePricingPendingListSort}
                                                filterCtx={pricingPendingColFilters}
                                                thStyle={{ ...pricingListThBase, minWidth: 'min(560px, 92vw)', width: 'auto' }}
                                            />
                                            <TableColumnFilterHeader
                                                colKey="latestPriceUpdated"
                                                label="Individual & Subjob Base prices"
                                                sortField="LatestPriceUpdated"
                                                sortConfig={pendingSortConfig}
                                                onSort={handlePricingPendingListSort}
                                                initialDirection="desc"
                                                filterCtx={pricingPendingColFilters}
                                                thStyle={pricingListThBase}
                                            />
                                            <TableColumnFilterHeader
                                                colKey="clientName"
                                                label="Client Name"
                                                sortField="ClientName"
                                                sortConfig={pendingSortConfig}
                                                onSort={handlePricingPendingListSort}
                                                filterCtx={pricingPendingColFilters}
                                                thStyle={pricingListThBase}
                                            />
                                            <TableColumnFilterHeader
                                                colKey="consultantName"
                                                label="Consultant Name"
                                                sortField="ConsultantName"
                                                sortConfig={pendingSortConfig}
                                                onSort={handlePricingPendingListSort}
                                                filterCtx={pricingPendingColFilters}
                                                thStyle={pricingListThBase}
                                            />
                                            <TableColumnFilterHeader
                                                colKey="dueDateCol"
                                                label="Due Date"
                                                sortField="DueDate"
                                                sortConfig={pendingSortConfig}
                                                onSort={handlePricingPendingListSort}
                                                filterCtx={pricingPendingColFilters}
                                                thStyle={pricingListThBase}
                                            />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sortedPending.map((enq, idx) => {
                                            const structured = tryParsePricingListDisplay(enq);
                                            const priceSplit = structured ? null : splitSubJobPricesForListColumns(enq.SubJobPrices);
                                            const specMeta = pricingListSpecStatusMeta(enq);
                                            const statusLines = pricingListSpecStatusTwoLines(specMeta);
                                            const zebraBg = idx % 2 === 0 ? '#ffffff' : '#f1f5f9';
                                            const tdPad = '10px 12px';
                                            const tdBg = { backgroundColor: 'transparent' };
                                            const hoverGrey = '#cbd5e1';
                                            return (
                                            <tr
                                                key={enq.RequestNo || idx}
                                                style={{
                                                    borderBottom: '1px solid #e2e8f0',
                                                    cursor: 'pointer',
                                                    transition: 'background-color 0.12s ease',
                                                    backgroundColor: zebraBg,
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.backgroundColor = hoverGrey;
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.backgroundColor = zebraBg;
                                                }}
                                                onClick={() => openPricingEditorForEnquiry(enq.RequestNo)}
                                            >
                                                <td
                                                    style={{
                                                        ...tdBg,
                                                        padding: tdPad,
                                                        fontSize: '11.7px',
                                                        color: '#1e293b',
                                                        fontWeight: '500',
                                                        verticalAlign: 'top',
                                                        whiteSpace: 'nowrap',
                                                    }}
                                                >
                                                    <div>{enq.RequestNo}</div>
                                                    {statusLines && (
                                                        <div
                                                            style={{
                                                                marginTop: '6px',
                                                                fontSize: '8.8px',
                                                                color: specMeta.specStatusColor,
                                                                fontWeight: 600,
                                                                lineHeight: 1.25,
                                                                whiteSpace: 'normal',
                                                            }}
                                                        >
                                                            <div>{statusLines.line1}</div>
                                                            {statusLines.line2 ? <div>{statusLines.line2}</div> : null}
                                                        </div>
                                                    )}
                                                </td>
                                                <td style={{ ...tdBg, padding: tdPad, fontSize: '11.2px', color: '#64748b', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{enq.ProjectName || '-'}</td>
                                                <td
                                                    style={{
                                                        ...tdBg,
                                                        padding: tdPad,
                                                        fontSize: '11.7px',
                                                        color: '#64748b',
                                                        verticalAlign: 'top',
                                                        whiteSpace: 'normal',
                                                        minWidth: 'max-content',
                                                        width: 'auto',
                                                    }}
                                                >
                                                    {structured ? (
                                                        <PricingListCustomerTotalsFromJson
                                                            items={structured.customerTotals}
                                                            priceFixedDecimals={3}
                                                        />
                                                    ) : enq.SubJobPrices ? (
                                                        <PricingListSubJobPriceLines
                                                            rows={priceSplit.customerAndTotalRows}
                                                            priceFixedDecimals={3}
                                                        />
                                                    ) : (
                                                        <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>No assigned jobs</span>
                                                    )}
                                                </td>
                                                <td
                                                    style={{
                                                        ...tdBg,
                                                        padding: tdPad,
                                                        fontSize: '11.7px',
                                                        color: '#64748b',
                                                        verticalAlign: 'top',
                                                        whiteSpace: 'normal',
                                                        width: '1%',
                                                        minWidth: 'max-content',
                                                    }}
                                                >
                                                    {structured ? (
                                                        <PricingListJobForestFromJson
                                                            nodes={structured.jobForest}
                                                            priceFixedDecimals={3}
                                                        />
                                                    ) : enq.SubJobPrices ? (
                                                        <PricingListSubJobPriceLines
                                                            rows={priceSplit.individualRows}
                                                            priceFixedDecimals={3}
                                                        />
                                                    ) : (
                                                        <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>—</span>
                                                    )}
                                                </td>
                                                <td style={{ ...tdBg, padding: tdPad, fontSize: '11.2px', color: '#64748b', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{enq.ClientName || '-'}</td>
                                                <td style={{ ...tdBg, padding: tdPad, fontSize: '11.2px', color: '#64748b', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{enq.ConsultantName || '-'}</td>
                                                <td style={{ ...tdBg, padding: tdPad, fontSize: '11.2px', color: '#dc2626', fontWeight: '500', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{enq.DueDate ? format(new Date(enq.DueDate), 'dd-MMM-yyyy') : '-'}</td>
                                            </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    );
                })()
            }

            {/* No results (Search Price mode, after running Search) */}
            {
                pricingListCategory === PRICING_LIST_CATEGORY.SEARCH
                && !searching
                && !pricingData
                && searchResults.length === 0
                && pricingSearchAttempted
                && !showSuggestions
                && (
                    <div style={{ background: 'white', padding: '40px', borderRadius: '8px', textAlign: 'center', color: '#64748b' }}>
                        No results. Enter search text and/or choose From and To price update dates, then click Search.
                    </div>
                )
            }
            </>
            )}

            {/* Loading (Back is in the unified sticky strip when standalone) */}
            {
                loading && (
                    <div style={{ background: 'white', padding: '40px', borderRadius: '8px', textAlign: 'center', color: '#64748b' }}>
                        Loading pricing data...
                    </div>
                )
            }

            {/* Pricing Grid */}
            {
                pricingData && !loading && (
                    <div
                        style={{
                            borderRadius: '8px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                            background: 'white',
                            overflow: 'visible',
                            ...(pricingEditorStandalone
                                ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }
                                : {}),
                        }}
                    >
                        {/* Pricing Table Content (narrow column: 25% of viewport) */}
                        {selectedLeadId && (
                            <div style={PRICING_INPUT_SECTION_STYLE}>
                            {visibleJobs.length === 0 ? (
                                <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                                    No EnquiryFor items found for this enquiry.
                                </div>
                            ) : (
                                <>
                                    <table style={{ width: '100%', minWidth: 0, maxWidth: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                                        <tbody>
                                            {(() => {
                                                // Grouping Logic: Keyed by Job ID
                                                const groupMap = {}; // { jobId: { job, options: [] } }

                                                const itemNameOccRender = new Map();
                                                (pricingData.jobs || []).forEach((j) => {
                                                    const n = (j.itemName || '').trim();
                                                    if (!n) return;
                                                    itemNameOccRender.set(n, (itemNameOccRender.get(n) || 0) + 1);
                                                });
                                                const isAmbigItemName = (n) => (itemNameOccRender.get((n || '').trim()) || 0) > 1;

                const selectedLeadRootName = (pricingData.jobs || []).find(
                                                    (j) => String(j.id) === String(selectedLeadId)
                                                )?.itemName;
                                                const declineBlockedByQuote = quoteBlocksDeclineToQuote(
                                                    pricingData.existingQuotes,
                                                    selectedLeadRootName,
                                                    selectedCustomer
                                                );

                                                // LEAD JOB FILTERING LOGIC (subtree ids: module helper getPricingLeadSubtreeIds)

                                                let targetJobs = visibleJobs;
                                                /** Jobs under the selected lead root (used for scope + anchor). */
                                                let validIds = null;
                                                if (selectedLeadId && pricingData && pricingData.jobs) {
                                                    // EXPANDED: Include ALL descendants (L1, L2, L3...)
                                                    validIds = getPricingLeadSubtreeIds(selectedLeadId, pricingData.jobs);
                                                    targetJobs = visibleJobs.filter(j => {
                                                        const jid = nid(j.id);
                                                        return jid != null && validIds.has(jid);
                                                    });
                                                }

                                                // Initialize Groups for Target Jobs
                                                // LOGIC UPDATE: Context-Aware Visibility
                                                // If User is viewing an External Tab (Not their own Internal Tab), hide Descendants.
                                                // Only show Editable Jobs in External/Parent Tabs.
                                                // Admin/Manager (hasLeadAccess) sees all.

                                                // Step 1: Resolve Tab Context (Which Job is this tab about?)
                                                const cleanTabNameSearch = (name) => String(name || '').trim();

                                                // IMPROVED (Step 2026-03-10): Prioritize jobs within the selected branch scope to handle duplicate names
                                                let contextJob = null;
                                                if (selectedLeadId && pricingData && pricingData.jobs && validIds) {
                                                    contextJob = pricingData.jobs.find(j => {
                                                        const jid = nid(j.id);
                                                        return jid != null && validIds.has(jid) &&
                                                        (cleanTabNameSearch(j.itemName) === selectedCustomer || j.itemName === selectedCustomer);
                                                    });
                                                }

                                                if (!contextJob && pricingData && pricingData.jobs) {
                                                    contextJob = pricingData.jobs.find(j =>
                                                        cleanTabNameSearch(j.itemName) === selectedCustomer || j.itemName === selectedCustomer
                                                    );
                                                }

                                                // Step 2: Identify Allowed IDs in this Tab (Tree Match)
                                                let tabAllowedIds = null;
                                                if (contextJob) {
                                                    const ctxN = nid(contextJob.id);
                                                    tabAllowedIds = ctxN != null ? new Set([ctxN]) : new Set();
                                                    let changed = true;
                                                    while (changed) {
                                                        changed = false;
                                                        pricingData.jobs.forEach(j => {
                                                            const jid = nid(j.id);
                                                            const pid = nid(j.parentId);
                                                            if (jid != null && pid != null && !tabAllowedIds.has(jid) && tabAllowedIds.has(pid)) {
                                                                tabAllowedIds.add(jid);
                                                                changed = true;
                                                            }
                                                        });
                                                    }
                                                }

                                                // Step 3: Identify User Scope (What can this user see in general?)
                                                // Provision (Step 1857): Even if user has hasLeadAccess, if they are NOT the lead for this specific selection,
                                                // we restrict them to their assigned scope.
                                                const myJobs = effectiveMyJobItemNames;

                                                // Always include descendants of editable jobs for "Subjob View"
                                                const getMyTotalScope = (names) => {
                                                    const ids = new Set();
                                                    const startJobs = pricingData.jobs.filter((j) =>
                                                        names.some((n) => sameEnquiryItemName(n, j.itemName))
                                                    );
                                                    startJobs.forEach(sj => {
                                                        const sjid = nid(sj.id);
                                                        if (sjid != null) ids.add(sjid);
                                                        let changedInner = true;
                                                        while (changedInner) {
                                                            changedInner = false;
                                                            pricingData.jobs.forEach(child => {
                                                                const cid = nid(child.id);
                                                                const cpid = nid(child.parentId);
                                                                if (cid != null && cpid != null && !ids.has(cid) && ids.has(cpid)) {
                                                                    ids.add(cid);
                                                                    changedInner = true;
                                                                }
                                                            });
                                                        }
                                                    });
                                                    return ids;
                                                };

                                                // Must match the header badge ("Lead Job Access" vs "Subjob Access"):
                                                // only the user whose editable job *is* the selected lead root gets full branch scope.
                                                // Using hasLeadAccess here wrongly cleared myScopeIds for subjob users who matched another
                                                // root on the enquiry — they then saw the parent lead pricing row (read-only), violating 1c/2c.
                                                const selectedJobForScope = pricingData.jobs?.find((j) => String(j.id) === String(selectedLeadId));
                                                const editableObjsForScope = (pricingData.jobs || []).filter((j) =>
                                                    myJobs.some((n) => sameEnquiryItemName(n, j.itemName))
                                                );
                                                const ownJobIsSelectedLeadRoot =
                                                    !!selectedJobForScope &&
                                                    editableObjsForScope.some((ej) => String(ej.id) === String(selectedJobForScope.id)) &&
                                                    (!selectedJobForScope.parentId ||
                                                        selectedJobForScope.parentId === 0 ||
                                                        selectedJobForScope.parentId === '0');

                                                // Sub-user scope must stay inside this lead’s tree (same itemName can exist on another branch).
                                                const rawMyScope = getMyTotalScope(myJobs);
                                                const myScopeInLeadTree = new Set();
                                                if (validIds && validIds.size) {
                                                    rawMyScope.forEach((id) => {
                                                        if (validIds.has(id)) myScopeInLeadTree.add(id);
                                                    });
                                                } else {
                                                    rawMyScope.forEach((id) => myScopeInLeadTree.add(id));
                                                }

                                                const myScopeIds = (pricingData.access.canEditAll || ownJobIsSelectedLeadRoot)
                                                    ? null // Admins, or lead owner: full branch under selected lead (2b)
                                                    : myScopeInLeadTree; // Subjob under this lead: own job + descendants only; ancestors hidden (1b–1c)

                                                // Single “own” row for edit/add/delete; descendants are view-only (1b, 2b).
                                                const ownJobAnchorId = resolveOwnJobAnchorId({
                                                    jobs: pricingData.jobs,
                                                    selectedLeadId,
                                                    myJobs,
                                                    canEditAll: !!pricingData.access.canEditAll,
                                                });

                                                // Step 4: Final Filter: Intersection of LeadJobScope, TabScope, and UserScope
                                                let contextFilteredJobs = targetJobs.filter(j => {
                                                    const jid = nid(j.id);
                                                    // A. Tab Filter: If we are in an internal/parent tab, only show that job and its children
                                                    if (tabAllowedIds && jid != null && !tabAllowedIds.has(jid)) return false;

                                                    // B. Scope Filter: Non-admins only see their assigned tree
                                                    if (myScopeIds && jid != null && !myScopeIds.has(jid)) return false;

                                                    return true;
                                                });

                                                contextFilteredJobs.forEach(job => {
                                                    groupMap[job.id] = { job: job, options: [], seenNames: new Set() };
                                                });

                                                // Determine Lead Job for sorting
                                                const activeLeadJob = pricingData.jobs.find(j => j.id == selectedLeadId) || targetJobs.find(j => j.isLead);

                                                // Assign Options to Groups
                                                // "Newest row" for Price/Optional dedupe: same name + item + lead only (not global max across all options).
                                                const defaultNameGroupMaxIds = buildDefaultOptionNameGroupMaxIds(filteredOptions);

                                                filteredOptions.forEach(opt => {
                                                    contextFilteredJobs.forEach(job => {
                                                        let match = false;
                                                        const activeLeadJobName = activeLeadJob ? activeLeadJob.itemName : null;
                                                        const activeLeadJobCode = activeLeadJob ? String(activeLeadJob.leadJobCode || activeLeadJob.LeadJobCode || '').trim() : '';
                                                        const optItemTrim = String(opt.itemName || '').trim();
                                                        /** Lead-only option rows must never attach to every section — only the selected root job row. */
                                                        const matchSelectedLeadRowOnly = String(job.id) === String(selectedLeadId);

                                                        if (!optItemTrim) {
                                                            match = matchSelectedLeadRowOnly;
                                                        } else if (optItemTrim === 'Lead Job') {
                                                            match = matchSelectedLeadRowOnly;
                                                        } else if (
                                                            activeLeadJobName &&
                                                            optItemTrim === `${String(activeLeadJobName).trim()} / Lead Job`
                                                        ) {
                                                            match = matchSelectedLeadRowOnly;
                                                        } else if (
                                                            activeLeadJobCode &&
                                                            optItemTrim === `${activeLeadJobCode} / Lead Job`
                                                        ) {
                                                            match = matchSelectedLeadRowOnly;
                                                        } else if (sameEnquiryItemName(opt.itemName, job.itemName)) {
                                                            // Simulated Base Price uses selectedCustomer (e.g. BEMCO tab) — not parent itemName; parent/oc check would wrongly clear subjob rows.
                                                            if (opt.isSimulated) {
                                                                match = true;
                                                            } else {
                                                                const oc = String(opt.customerName || '').trim();
                                                                const sel = String(selectedCustomer || '').trim();
                                                                // Options stored against the active tab (e.g. BEMCO) are not parent itemName — skip legacy parent/oc gate (Electrical often has blank oc and passed; HVAC/BMS with oc=BEMCO failed vs Civil/HVAC pn).
                                                                const isTabBucketCustomer =
                                                                    !!oc &&
                                                                    !!sel &&
                                                                    normalizePricingCustomerKey(oc) === normalizePricingCustomerKey(sel);
                                                                const pid = job.parentId;
                                                                const hasParent =
                                                                    pid != null && pid !== '' && pid !== 0 && pid !== '0';
                                                                if (hasParent && oc && !isTabBucketCustomer) {
                                                                    const parentJob = pricingData.jobs.find((p) => String(p.id) === String(pid));
                                                                    const pn = parentJob ? String(parentJob.itemName || '').trim() : '';
                                                                    if (
                                                                        pn &&
                                                                        !sameEnquiryItemName(oc, pn) &&
                                                                        normalizePricingCustomerKey(oc) !== normalizePricingCustomerKey(pn)
                                                                    ) {
                                                                        match = false;
                                                                    } else {
                                                                        match = true;
                                                                    }
                                                                } else {
                                                                    match = true;
                                                                }
                                                            }
                                                        }
                                                        if (match && !groupMap[job.id].seenNames.has(opt.name)) {
                                                            groupMap[job.id].seenNames.add(opt.name); // DEDUPE PROTECTION (Step 932)
                                                            const key = `${opt.id}_${job.id}`;
                                                            let price = null; // Default to NULL (Missing) to differentiate from 0
                                                            let hasExplicitValue = false;

                                                            // Prefer server/raw lookup (scoped to selected lead subtree) so we never show another top-level lead’s price; then in-memory edits.
                                                            const lookupValue = (dataSet) => {
                                                                // Do not bail out when EnquiryFor hierarchy disagrees with saved LeadJobName — EPV-first read below scopes by dimensions.
                                                                // EnquiryPricingValues-first: never depend on grid OptionID / keyed bucket order (fixes wrong 0 when metadata drifts).
                                                                // NOTE: Simulated option rows do not have a real numeric OptionID, but EPV rows do.
                                                                // For simulated Base Price, we must NOT filter by OptionID or the UI will never find backend prices.
                                                                const fromEpvFirst = findPriceFromRawByEpvDimensions(
                                                                    pricingData.rawEnquiryPricingValues,
                                                                    {
                                                                        leadDisplayName: selectedLeadRootName,
                                                                        ownJobItemName: job.itemName,
                                                                        customerTab: selectedCustomer,
                                                                        priceOptionName: opt.name || 'Base Price',
                                                                        valueScopeLeadId: selectedLeadId,
                                                                        jobId: job.id,
                                                                        allJobs: pricingData.jobs,
                                                                        optionId: opt.isSimulated ? null : opt.id,
                                                                    }
                                                                );
                                                                if (fromEpvFirst !== null) return fromEpvFirst;

                                                                if (!dataSet) return null;
                                                                if (dataSet[key] && dataSet[key].Price !== undefined) {
                                                                    const row = dataSet[key];
                                                                    if (!pricingValueRowEnquiryForMatchesJob(row, job.id)) return null;
                                                                    if (
                                                                        !epvRowPassesLeadSubtreeOrLabel(selectedLeadId, pricingData.jobs, row, selectedLeadRootName)
                                                                    ) {
                                                                        return null;
                                                                    }
                                                                    if (
                                                                        valueRowLeadJobMatchesView(
                                                                            row.LeadJobName,
                                                                            selectedLeadRootName,
                                                                            selectedLeadId,
                                                                            pricingData.jobs
                                                                        )
                                                                    ) {
                                                                        return parseFloat(dataSet[key].Price);
                                                                    }
                                                                }
                                                                // `parsePriceFromRawValueRowsForCell` requires OptionID; simulated options must use EPV-dimensions path above.
                                                                if (!opt.isSimulated) {
                                                                    const fromRaw = parsePriceFromRawValueRowsForCell(
                                                                        pricingData.rawEnquiryPricingValues,
                                                                        job.id,
                                                                        opt.id,
                                                                        selectedCustomer,
                                                                        selectedLeadRootName,
                                                                        selectedLeadId,
                                                                        pricingData.jobs,
                                                                        {
                                                                        // Only allow blank-customer fallback on INTERNAL tabs (tabs that correspond to an EnquiryFor job itemName).
                                                                        // Never allow it on external customer tabs like BEMCO/TEMCO, else a blank EPV row will appear on every tab.
                                                                        allowBlankCustomerName:
                                                                            !String(opt.customerName || '').trim() &&
                                                                            Array.isArray(pricingData.jobs) &&
                                                                            pricingData.jobs.some(
                                                                                (j) =>
                                                                                    normalizePricingCustomerKey(j.itemName) ===
                                                                                    normalizePricingCustomerKey(selectedCustomer)
                                                                            ),
                                                                        }
                                                                    );
                                                                    if (fromRaw !== null) return fromRaw;
                                                                }
                                                                if (isAmbigItemName(job.itemName)) {
                                                                    return null;
                                                                }
                                                                const nameKey = `${opt.id}_${job.itemName}`;
                                                                if (dataSet[nameKey] && dataSet[nameKey].Price !== undefined) {
                                                                    if (!pricingValueRowEnquiryForMatchesJob(dataSet[nameKey], job.id)) {
                                                                        return null;
                                                                    }
                                                                    return parseFloat(dataSet[nameKey].Price);
                                                                }
                                                                const cleanName = String(job.itemName || '').trim();
                                                                const cleanKey = `${opt.id}_${cleanName}`;
                                                                if (dataSet[cleanKey] && dataSet[cleanKey].Price !== undefined) {
                                                                    if (!pricingValueRowEnquiryForMatchesJob(dataSet[cleanKey], job.id)) {
                                                                        return null;
                                                                    }
                                                                    return parseFloat(dataSet[cleanKey].Price);
                                                                }
                                                                return null;
                                                            };

                                                            const tabValues = customerValuesBucket(
                                                                pricingData.allValues,
                                                                pricingData.values,
                                                                selectedCustomer
                                                            );
                                                            const fromLookup = lookupValue(tabValues);
                                                            if (fromLookup != null) {
                                                                price = fromLookup;
                                                                hasExplicitValue = true;
                                                            } else if (values[key] !== undefined && values[key] !== '') {
                                                                price = parseFloat(values[key]) || 0;
                                                                hasExplicitValue = true;
                                                            }

                                                            // Default to 0 for math if still null, but keep flag
                                                            const effectivePriceForCalc = (price === null) ? 0 : price;

                                                            // FALLBACK: Cross-Tab Lookup when price is missing in current customer tab.
                                                            const contextJob = pricingData.jobs.find((j) =>
                                                                String(j.itemName || '').trim() === String(selectedCustomer || '').trim()
                                                            );
                                                            const isExternalContext = !contextJob;

                                                            const isMyScope = pricingData.access && effectiveMyJobItemNames.includes(job.itemName);
                                                            const isMyInternalTab = contextJob && effectiveMyJobItemNames.includes(contextJob.itemName);
                                                            const shouldForceInternal = isExternalContext && !job.isLead && !isMyScope;

                                                            const isMissing = (price === null);

                                                            const leadTagMatches = (optLN) => {
                                                                if (!optLN) return false;
                                                                const t = optLN.trim();
                                                                if (activeLeadJobName && t === activeLeadJobName.trim()) return true;
                                                                if (activeLeadJobCode && t === activeLeadJobCode) return true;
                                                                return false;
                                                            };

                                                            // FIX: Trigger fallback whenever price is MISSING (not just shouldForceInternal).
                                                            if ((isMissing || shouldForceInternal) && pricingData.allValues) {
                                                                const lookupInternal = (dataSet, optionId) => {
                                                                    if (!dataSet) return null;
                                                                    if (!enquiryForIdInSelectedLeadSubtree(selectedLeadId, job.id, pricingData.jobs)) {
                                                                        return null;
                                                                    }
                                                                    const iKey = `${optionId}_${job.id}`;
                                                                    if (dataSet[iKey] && dataSet[iKey].Price !== undefined) {
                                                                        const irow = dataSet[iKey];
                                                                        if (!pricingValueRowEnquiryForMatchesJob(irow, job.id)) return null;
                                                                        if (!enquiryForIdInSelectedLeadSubtree(selectedLeadId, irow.EnquiryForID ?? job.id, pricingData.jobs)) {
                                                                            return null;
                                                                        }
                                                                        if (
                                                                            valueRowLeadJobMatchesView(
                                                                                irow.LeadJobName,
                                                                                selectedLeadRootName,
                                                                                selectedLeadId,
                                                                                pricingData.jobs
                                                                            )
                                                                        ) {
                                                                            return parseFloat(irow.Price);
                                                                        }
                                                                    }
                                                                    const fromR = parsePriceFromRawValueRowsForCell(
                                                                        pricingData.rawEnquiryPricingValues,
                                                                        job.id,
                                                                        optionId,
                                                                        selectedCustomer,
                                                                        selectedLeadRootName,
                                                                        selectedLeadId,
                                                                        pricingData.jobs,
                                                                        { allowBlankCustomerName: true }
                                                                    );
                                                                    if (fromR !== null) return fromR;
                                                                    if (isAmbigItemName(job.itemName)) {
                                                                        return null;
                                                                    }
                                                                    const iNameKey = `${optionId}_${job.itemName}`;
                                                                    if (dataSet[iNameKey] && dataSet[iNameKey].Price !== undefined) {
                                                                        if (!pricingValueRowEnquiryForMatchesJob(dataSet[iNameKey], job.id)) return null;
                                                                        return parseFloat(dataSet[iNameKey].Price);
                                                                    }
                                                                    const iCleanKey = `${optionId}_${String(job.itemName || '').trim()}`;
                                                                    if (dataSet[iCleanKey] && dataSet[iCleanKey].Price !== undefined) {
                                                                        if (!pricingValueRowEnquiryForMatchesJob(dataSet[iCleanKey], job.id)) return null;
                                                                        return parseFloat(dataSet[iCleanKey].Price);
                                                                    }
                                                                    return null;
                                                                };

                                                                // Strategy 1: Find internal option in parent's customer bucket
                                                                const parentJob = pricingData.jobs.find(j => j.id == job.parentId);
                                                                if (parentJob) {
                                                                    const parentName = String(parentJob.itemName || '').trim();
                                                                    const rawParentName = parentJob.itemName.trim();

                                                                    // IMPROVED: Prioritize internal option matching the active Lead Job (Step 1912)
                                                                    const internalOption = pricingData.options
                                                                        .filter(o => o.name === opt.name && sameEnquiryItemName(o.itemName, job.itemName) && (o.customerName === parentName || o.customerName === rawParentName))
                                                                        .sort((a, b) => {
                                                                            const aLeadMatch = leadTagMatches(a.leadJobName);
                                                                            const bLeadMatch = leadTagMatches(b.leadJobName);
                                                                            if (aLeadMatch && !bLeadMatch) return -1;
                                                                            if (!aLeadMatch && bLeadMatch) return 1;
                                                                            return 0;
                                                                        })[0];

                                                                    if (internalOption) {
                                                                        let internalValues = pricingData.allValues[parentName];
                                                                        if (!internalValues) internalValues = pricingData.allValues[rawParentName];
                                                                        const internalPrice = lookupInternal(internalValues, internalOption.id);
                                                                        if (internalPrice !== null && internalPrice > 0) {
                                                                            price = internalPrice;
                                                                            hasExplicitValue = true;
                                                                        }
                                                                    }
                                                                }

                                                                // Strategy 2: Scan ALL customer buckets for a matching option+job price
                                                                if (price === null && pricingData.allValues) {
                                                                    const myEditableJobs = effectiveMyJobItemNames;
                                                                    for (const [bucketCustomer, bucketValues] of Object.entries(pricingData.allValues)) {
                                                                        if (bucketCustomer === selectedCustomer) continue; // Skip current tab
                                                                        const bucketJob = pricingData.jobs.find((j) =>
                                                                            String(j.itemName || '').trim() === String(bucketCustomer || '').trim()
                                                                        );
                                                                        const isScopeBucket = bucketJob && myEditableJobs.includes(bucketJob.itemName);
                                                                        if (!isScopeBucket) continue;

                                                                        // Find ALL matching options in this bucket (same name + same job context)
                                                                        // IMPROVED: Prioritize options matching active lead branch
                                                                        const matchingOptions = pricingData.options
                                                                            .filter(o => o.name === opt.name && sameEnquiryItemName(o.itemName, job.itemName) && o.customerName === bucketCustomer)
                                                                            .sort((a, b) => {
                                                                                const aLeadMatch = leadTagMatches(a.leadJobName);
                                                                                const bLeadMatch = leadTagMatches(b.leadJobName);
                                                                                if (aLeadMatch && !bLeadMatch) return -1;
                                                                                if (!aLeadMatch && bLeadMatch) return 1;
                                                                                return 0;
                                                                            });

                                                                        for (const mOpt of matchingOptions) {
                                                                            const found = lookupInternal(bucketValues, mOpt.id);
                                                                            if (found !== null && found > 0) {
                                                                                price = found;
                                                                                hasExplicitValue = true;
                                                                                break;
                                                                            }
                                                                        }
                                                                        if (price !== null && price > 0) break;
                                                                    }
                                                                }
                                                            }

                                                            // Finalize Price for Display Logic
                                                            if (price === null) price = 0;

                                                            const maskedByQuote = isSubjobPriceMaskedByQuote(job);
                                                            const displayPriceForRow = maskedByQuote ? 0 : price;

                                                            // Hide if Empty, Not Newest, Not Base Price (dedupe only within same name + job + lead)
                                                            const nameL = (opt.name || '').trim().toLowerCase();
                                                            const isDefault = nameL === 'price' || nameL === 'optional';
                                                            const isEmpty = (displayPriceForRow <= 0.01 && !hasExplicitValue && !maskedByQuote); // Treat 0 as empty ONLY if implicit
                                                            const optN = optIdNum(opt.id);
                                                            const gk = `${nameL}|${(opt.itemName || '').trim()}|${(opt.leadJobName || '').trim()}`;
                                                            const nameGroupMax = defaultNameGroupMaxIds.get(gk) || 0;
                                                            const isNotNewest =
                                                                isDefault &&
                                                                Number.isFinite(optN) &&
                                                                nameGroupMax > 0 &&
                                                                optN !== nameGroupMax;

                                                            if (isDefault && isEmpty && isNotNewest) return;

                                                            // Push cloned option with effective Price for display
                                                            groupMap[job.id].options.push({
                                                                ...opt,
                                                                effectivePrice: displayPriceForRow,
                                                                priceMaskedByQuote: maskedByQuote,
                                                            });
                                                        }
                                                    });
                                                });

                                                // HIERARCHICAL SORTING LOGIC
                                                const hierarchyResults = [];
                                                const processedIds = new Set();
                                                const groupList = Object.values(groupMap);

                                                const idMap = new Map();
                                                contextFilteredJobs.forEach(j => idMap.set(jobKey(j.id), j));

                                                const childrenMap = new Map();
                                                contextFilteredJobs.forEach(j => {
                                                    const pk = jobKey(j.parentId);
                                                    if (!isRootJob(j) && idMap.has(pk)) {
                                                        if (!childrenMap.has(pk)) childrenMap.set(pk, []);
                                                        childrenMap.get(pk).push(j);
                                                    }
                                                });

                                                const buildList = (job, level) => {
                                                    const k = jobKey(job.id);
                                                    if (processedIds.has(k)) return;
                                                    processedIds.add(k);

                                                    const group = groupMap[job.id];
                                                    if (group) {
                                                        group.level = level;
                                                        hierarchyResults.push(group);
                                                    }

                                                    const children = childrenMap.get(k) || [];
                                                    children.sort((a, b) => (nid(a.id) || 0) - (nid(b.id) || 0));
                                                    children.forEach(c => buildList(c, level + 1));
                                                };

                                                contextFilteredJobs.forEach(j => {
                                                    if (isRootJob(j) || !idMap.has(jobKey(j.parentId))) {
                                                        buildList(j, 0);
                                                    }
                                                });

                                                if (hierarchyResults.length < groupList.length) {
                                                    groupList.forEach(g => {
                                                        if (!processedIds.has(jobKey(g.job.id))) {
                                                            g.level = 0;
                                                            hierarchyResults.push(g);
                                                        }
                                                    });
                                                }

                                                if (import.meta.env.DEV) {
                                                    const totalRows = hierarchyResults.reduce((s, g) => s + (g.options?.length || 0), 0);
                                                    console.log('[Pricing table render]', {
                                                        contextFilteredJobs: contextFilteredJobs.length,
                                                        filteredOptions: filteredOptions.length,
                                                        hierarchyJobSections: hierarchyResults.length,
                                                        renderedOptionRows: totalRows,
                                                        perJobRows: hierarchyResults.map((g) => ({ id: g.job.id, name: g.job.itemName, rows: g.options?.length || 0 })),
                                                    });
                                                }

                                                return hierarchyResults.map(group => {
                                                    const job = group.job;
                                                    let groupName = job.itemName;
                                                    if (job.isLead) {
                                                        const code = (job.leadJobCode || job.LeadJobCode || '').trim();
                                                        groupName = code ? `${code} - ${job.itemName}` : job.itemName;
                                                    }
                                                    const sectionTitle = String(job.itemName || '').trim();

                                                    // Non-admins: only the resolved own-job anchor is editable; same-branch subjobs are view-only (1b, 2b).
                                                    const canEditSection =
                                                        pricingData.access.canEditAll ||
                                                        (ownJobAnchorId != null && String(job.id) === String(ownJobAnchorId));

                                                    return (
                                                        <React.Fragment key={job.id}>
                                                            <tr style={{ background: '#e2e8f0' }}>
                                                                <td colSpan={2} style={{
                                                                    padding: '4px 10px',
                                                                    fontWeight: '600',
                                                                    fontSize: '12px',
                                                                    color: '#334155',
                                                                    paddingLeft: `${(group.level || 0) * 20 + 12}px`
                                                                }}>
                                                                    {group.level > 0 && <span style={{ marginRight: '6px', color: '#dc2626', fontWeight: 'bold', fontSize: '16px' }}>↳</span>}
                                                                    {sectionTitle}
                                                                </td>
                                                            </tr>
                                                            {group.options.map(option => {
                                                                const key = `${option.id}_${job.id}`;
                                                                const canEditRow = canEditSection;
                                                                const priceMaskedByQuote =
                                                                    option.priceMaskedByQuote || isSubjobPriceMaskedByQuote(job);

                                                                let displayValue = '';
                                                                const vk = values[key];
                                                                const ep = option.effectivePrice;
                                                                const userHasLocalValue =
                                                                    Object.prototype.hasOwnProperty.call(values, key);
                                                                // If this key exists in `values`, always reflect it — including '' when the user
                                                                // cleared the field. Previously '' was treated as "no edit" and fell through to
                                                                // `effectivePrice`, so the box snapped back and could not be emptied.
                                                                if (priceMaskedByQuote) {
                                                                    displayValue = '0';
                                                                } else if (userHasLocalValue) {
                                                                    displayValue =
                                                                        vk === '' || vk === null || vk === undefined ? '' : vk;
                                                                } else if (ep !== undefined && ep !== null && String(ep) !== '') {
                                                                    displayValue = ep;
                                                                } else {
                                                                    displayValue = '';
                                                                }

                                                                const jobHasLocalDecline = group.options.some((opt) =>
                                                                    Object.prototype.hasOwnProperty.call(
                                                                        declineToQuote,
                                                                        `${opt.id}_${job.id}`
                                                                    )
                                                                );
                                                                const declineChecked = jobHasLocalDecline
                                                                    ? group.options.some(
                                                                          (opt) => !!declineToQuote[`${opt.id}_${job.id}`]
                                                                      )
                                                                    : group.options.some((opt) =>
                                                                          findDeclineToQuoteFromRawByEpvDimensions(
                                                                              pricingData.rawEnquiryPricingValues,
                                                                              {
                                                                                  leadDisplayName: selectedLeadRootName,
                                                                                  ownJobItemName: job.itemName,
                                                                                  customerTab: selectedCustomer,
                                                                                  priceOptionName: opt.name || 'Base Price',
                                                                                  valueScopeLeadId: selectedLeadId,
                                                                                  jobId: job.id,
                                                                                  allJobs: pricingData.jobs,
                                                                                  optionId: opt.isSimulated ? null : opt.id,
                                                                              }
                                                                          )
                                                                      );

                                                                return (
                                                                    <React.Fragment key={`${option.id}_${job.id}`}>
                                                                    <tr style={{ borderBottom: priceMaskedByQuote ? 'none' : '1px solid #e2e8f0' }}>
                                                                        <td style={{ padding: '4px 10px', fontWeight: '500', color: '#1e293b', fontSize: '12px' }}>{option.name}</td>
                                                                        <td style={{ padding: '2px 6px', textAlign: 'right', verticalAlign: 'middle' }}>
                                                                            <div
                                                                                style={{
                                                                                    display: 'flex',
                                                                                    alignItems: 'center',
                                                                                    justifyContent: 'flex-end',
                                                                                    gap: '6px',
                                                                                    width: '100%',
                                                                                    flexWrap: 'nowrap',
                                                                                }}
                                                                            >
                                                                                <input
                                                                                    type="text"
                                                                                    inputMode="decimal"
                                                                                    value={
                                                                                        priceMaskedByQuote
                                                                                            ? formatPrice(0)
                                                                                            : focusedCell === `${option.id}_${job.id}`
                                                                                            ? (displayValue === '' ? '' : String(displayValue))
                                                                                            : formatPrice(displayValue)
                                                                                    }
                                                                                    onFocus={() => !priceMaskedByQuote && setFocusedCell(`${option.id}_${job.id}`)}
                                                                                    onBlur={() => setFocusedCell(null)}
                                                                                    onChange={(e) => handleValueChange(option.id, job.id, e.target.value)}
                                                                                    disabled={!canEditRow || priceMaskedByQuote}
                                                                                    placeholder="0"
                                                                                    title={priceMaskedByQuote ? 'Quote to be generated to see the price' : undefined}
                                                                                    style={{
                                                                                        width: '116px',
                                                                                        maxWidth: '116px',
                                                                                        flexShrink: 0,
                                                                                        boxSizing: 'border-box',
                                                                                        padding: '2px 6px',
                                                                                        border: '1px solid #e2e8f0',
                                                                                        borderRadius: '4px',
                                                                                        fontSize: '12px',
                                                                                        minHeight: '24px',
                                                                                        height: '24px',
                                                                                        textAlign: 'right',
                                                                                        backgroundColor: canEditRow && !priceMaskedByQuote ? '#fff' : '#f1f5f9',
                                                                                        color: '#1e293b',
                                                                                        opacity: 1,
                                                                                        cursor: canEditRow && !priceMaskedByQuote ? 'text' : 'not-allowed',
                                                                                    }}
                                                                                />
                                                                                <label
                                                                                    title={
                                                                                        declineBlockedByQuote
                                                                                            ? 'A quote already exists for this enquiry, lead job, and customer — decline is not allowed.'
                                                                                            : 'Decline to Quote'
                                                                                    }
                                                                                    style={{
                                                                                        display: 'inline-flex',
                                                                                        alignItems: 'center',
                                                                                        gap: '4px',
                                                                                        fontSize: '10px',
                                                                                        color: declineBlockedByQuote ? '#94a3b8' : '#64748b',
                                                                                        whiteSpace: 'nowrap',
                                                                                        margin: 0,
                                                                                        cursor:
                                                                                            canEditRow && !declineBlockedByQuote
                                                                                                ? 'pointer'
                                                                                                : 'not-allowed',
                                                                                        userSelect: 'none',
                                                                                        flexShrink: 0,
                                                                                    }}
                                                                                >
                                                                                    <input
                                                                                        type="checkbox"
                                                                                        checked={declineChecked}
                                                                                        disabled={!canEditRow || declineBlockedByQuote}
                                                                                        onChange={(e) =>
                                                                                            handleDeclineToQuoteChange(
                                                                                                job.id,
                                                                                                e.target.checked,
                                                                                                group.options
                                                                                            )
                                                                                        }
                                                                                        style={{
                                                                                            margin: 0,
                                                                                            cursor:
                                                                                                canEditRow && !declineBlockedByQuote
                                                                                                    ? 'pointer'
                                                                                                    : 'not-allowed',
                                                                                        }}
                                                                                    />
                                                                                    Decline to Quote
                                                                                </label>
                                                                                <span
                                                                                    style={{
                                                                                        width: '22px',
                                                                                        flexShrink: 0,
                                                                                        display: 'flex',
                                                                                        alignItems: 'center',
                                                                                        justifyContent: 'center',
                                                                                    }}
                                                                                >
                                                                                    {canEditRow ? (
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => {
                                                                                                const n = String(option.name || '').trim().toLowerCase();
                                                                                                if (n === 'base price') {
                                                                                                    deleteBasePriceForCell({ enquiryForId: job.id });
                                                                                                } else {
                                                                                                    deleteOption(option.id, job.id);
                                                                                                }
                                                                                            }}
                                                                                            title={
                                                                                                String(option.name || '').trim().toLowerCase() === 'base price'
                                                                                                    ? 'Delete Base Price'
                                                                                                    : 'Delete this option'
                                                                                            }
                                                                                            style={{
                                                                                                background: 'none',
                                                                                                border: 'none',
                                                                                                color: '#ef4444',
                                                                                                cursor: 'pointer',
                                                                                                padding: '2px',
                                                                                                display: 'flex',
                                                                                                alignItems: 'center',
                                                                                                justifyContent: 'center',
                                                                                            }}
                                                                                        >
                                                                                            <Trash2 size={13} />
                                                                                        </button>
                                                                                    ) : (
                                                                                        <span aria-hidden style={{ width: 28, height: 1 }} />
                                                                                    )}
                                                                                </span>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                    {priceMaskedByQuote && (
                                                                        <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                                            <td colSpan={2} style={{ padding: '0 10px 6px', textAlign: 'right' }}>
                                                                                <span
                                                                                    style={{
                                                                                        fontSize: '10px',
                                                                                        color: '#b45309',
                                                                                        fontStyle: 'italic',
                                                                                        whiteSpace: 'nowrap',
                                                                                        display: 'inline-block',
                                                                                    }}
                                                                                >
                                                                                    Quote to be generated to see the price
                                                                                </span>
                                                                            </td>
                                                                        </tr>
                                                                    )}
                                                                    </React.Fragment>
                                                                );
                                                            })}
                                                            {canEditSection && (
                                                                <>
                                                                    <tr style={{ background: '#f8fafc' }}>
                                                                        <td style={{ padding: '4px 10px', verticalAlign: 'middle' }}>
                                                                            {showNewOptionInputs[groupName] ? (
                                                                                <input
                                                                                    type="text"
                                                                                    placeholder={`Add ${groupName.replace(/\/ Lead Job|Lead Job \//, '').trim()} option...`}
                                                                                    value={newOptionNames[groupName] || ''}
                                                                                    onChange={(e) => setNewOptionNames(prev => ({ ...prev, [groupName]: e.target.value }))}
                                                                                    onKeyDown={async (e) => {
                                                                                        if (e.key === 'Enter') {
                                                                                            const nameNow = String(newOptionNames[groupName] || '').trim();
                                                                                            const priceNow = String(newOptionPrices[groupName] || '').replace(/,/g, '').trim();
                                                                                            const ok = await addOption(groupName, nameNow, null, job.id, priceNow);
                                                                                            if (ok) {
                                                                                                setShowNewOptionInputs((prev) => ({ ...prev, [groupName]: false }));
                                                                                            }
                                                                                        }
                                                                                    }}
                                                                                    style={{
                                                                                        width: '100%',
                                                                                        padding: '2px 6px',
                                                                                        border: '1px solid #cbd5e1',
                                                                                        borderRadius: '4px',
                                                                                        fontSize: '12px',
                                                                                        minHeight: '24px',
                                                                                        height: '24px'
                                                                                    }}
                                                                                />
                                                                            ) : null}
                                                                        </td>
                                                                        <td style={{ padding: '2px 6px', textAlign: 'right', width: '150px', verticalAlign: 'middle' }}>
                                                                            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '4px', width: '100%' }}>
                                                                                {showNewOptionInputs[groupName] ? (
                                                                                    <>
                                                                                        <input
                                                                                            type="text"
                                                                                            inputMode="decimal"
                                                                                            placeholder="Price"
                                                                                            value={
                                                                                                focusedCell === `newopt:${job.id}`
                                                                                                    ? (newOptionPrices[groupName] || '')
                                                                                                    : formatPrice(newOptionPrices[groupName] || '')
                                                                                            }
                                                                                            onFocus={() => setFocusedCell(`newopt:${job.id}`)}
                                                                                            onBlur={() =>
                                                                                                setFocusedCell((prev) =>
                                                                                                    prev === `newopt:${job.id}` ? null : prev
                                                                                                )
                                                                                            }
                                                                                            onChange={(e) => {
                                                                                                const raw = String(e.target.value || '').replace(/,/g, '');
                                                                                                if (raw !== '' && !/^-?\d*\.?\d*$/.test(raw)) return;
                                                                                                setNewOptionPrices((prev) => ({ ...prev, [groupName]: raw }));
                                                                                            }}
                                                                                            onKeyDown={async (e) => {
                                                                                                if (e.key === 'Enter') {
                                                                                                    const nameNow = String(newOptionNames[groupName] || '').trim();
                                                                                                    const priceNow = String(newOptionPrices[groupName] || '').replace(/,/g, '').trim();
                                                                                                    const ok = await addOption(groupName, nameNow, null, job.id, priceNow);
                                                                                                    if (ok) {
                                                                                                        setShowNewOptionInputs((prev) => ({ ...prev, [groupName]: false }));
                                                                                                        setFocusedCell((prev) =>
                                                                                                            prev === `newopt:${job.id}` ? null : prev
                                                                                                        );
                                                                                                    }
                                                                                                }
                                                                                            }}
                                                                                            style={{
                                                                                                width: '116px',
                                                                                                maxWidth: '116px',
                                                                                                flexShrink: 0,
                                                                                                boxSizing: 'border-box',
                                                                                                padding: '2px 6px',
                                                                                                border: '1px solid #cbd5e1',
                                                                                                borderRadius: '4px',
                                                                                                fontSize: '12px',
                                                                                                minHeight: '24px',
                                                                                                height: '24px',
                                                                                                textAlign: 'right'
                                                                                            }}
                                                                                        />
                                                                                        <span
                                                                                            style={{
                                                                                                width: '22px',
                                                                                                flexShrink: 0,
                                                                                                display: 'flex',
                                                                                                alignItems: 'center',
                                                                                                justifyContent: 'center',
                                                                                            }}
                                                                                        >
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => {
                                                                                                    setNewOptionNames((prev) => ({ ...prev, [groupName]: '' }));
                                                                                                    setNewOptionPrices((prev) => ({ ...prev, [groupName]: '' }));
                                                                                                    setShowNewOptionInputs((prev) => ({ ...prev, [groupName]: false }));
                                                                                                }}
                                                                                                title="Remove draft option row"
                                                                                                style={{
                                                                                                    background: 'none',
                                                                                                    border: 'none',
                                                                                                    color: '#ef4444',
                                                                                                    cursor: 'pointer',
                                                                                                    padding: '2px',
                                                                                                    display: 'flex',
                                                                                                    alignItems: 'center',
                                                                                                    justifyContent: 'center',
                                                                                                }}
                                                                                            >
                                                                                                <Trash2 size={13} />
                                                                                            </button>
                                                                                        </span>
                                                                                    </>
                                                                                ) : (
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => {
                                                                                            setShowNewOptionInputs((prev) => ({ ...prev, [groupName]: true }));
                                                                                            setPendingAddJobIds((prev) => ({ ...prev, [groupName]: job.id }));
                                                                                        }}
                                                                                        style={{
                                                                                            padding: '3px 8px',
                                                                                            background: 'white',
                                                                                            color: '#0284c7',
                                                                                            border: '1px solid #cbd5e1',
                                                                                            borderRadius: '4px',
                                                                                            cursor: 'pointer',
                                                                                            display: 'inline-flex',
                                                                                            alignItems: 'center',
                                                                                            gap: '4px',
                                                                                            fontSize: '11px',
                                                                                            minHeight: '24px',
                                                                                            height: '24px'
                                                                                        }}
                                                                                    >
                                                                                        <Plus size={12} /> Add
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                    {showNewOptionInputs[groupName]
                                                                        && String(newOptionNames[groupName] || '').trim()
                                                                        && String(newOptionPrices[groupName] || '').replace(/,/g, '').trim() && (
                                                                        <tr style={{ background: '#f8fafc' }}>
                                                                            <td style={{ padding: '2px 10px' }} />
                                                                            <td style={{ padding: '2px 6px', textAlign: 'right', width: '150px', verticalAlign: 'middle' }}>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={async () => {
                                                                                        const nameNow = String(newOptionNames[groupName] || '').trim();
                                                                                        const priceNow = String(newOptionPrices[groupName] || '').replace(/,/g, '').trim();
                                                                                        const ok = await addOption(groupName, nameNow, null, job.id, priceNow);
                                                                                        if (ok) {
                                                                                            setShowNewOptionInputs((prev) => ({ ...prev, [groupName]: false }));
                                                                                        }
                                                                                    }}
                                                                                    style={{
                                                                                        padding: '3px 8px',
                                                                                        background: 'white',
                                                                                        color: '#0284c7',
                                                                                        border: '1px solid #cbd5e1',
                                                                                        borderRadius: '4px',
                                                                                        cursor: 'pointer',
                                                                                        display: 'inline-flex',
                                                                                        alignItems: 'center',
                                                                                        gap: '4px',
                                                                                        fontSize: '11px',
                                                                                        minHeight: '24px',
                                                                                        height: '24px'
                                                                                    }}
                                                                                >
                                                                                    <Plus size={12} /> Add
                                                                                </button>
                                                                            </td>
                                                                        </tr>
                                                                    )}
                                                                </>
                                                            )}
                                                            <tr><td colSpan={2} style={{ height: '3px' }}></td></tr>
                                                        </React.Fragment>
                                                    );
                                                });
                                            })()}
                                        </tbody>
                                    </table>
                                    {/* Actions Footer */}
                                    <div style={{ padding: '8px 12px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-start', alignItems: 'center', background: '#f8fafc' }}>
                                        <button
                                            onClick={saveAll}
                                            disabled={saving}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                padding: '5px 10px',
                                                background: 'white',
                                                color: '#1e293b',
                                                border: '1px solid #cbd5e1',
                                                borderRadius: '4px',
                                                cursor: 'pointer',
                                                fontWeight: '600',
                                                fontSize: '11.5px'
                                            }}
                                        >
                                            <Save size={14} /> {saving ? 'Saving...' : 'Save All Prices'}
                                        </button>
                                    </div>
                                </>
                            )}
                            </div>
                        )}
                    </div>
                )
            }
        </div>
    );
};

export default PricingForm;
