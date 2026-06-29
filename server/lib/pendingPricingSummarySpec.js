'use strict';

/**
 * Pending Pricing summary per business spec (Concerned SE + Master_ConcernedSE.Department):
 * 1–3: caller supplies email-scoped enquiries.
 * 4a.i: internal checks — EnquiryFor rows whose ItemName matches department → parent job ItemName + LeadJobName.
 * 4a.ii: external names from EnquiryCustomer when department has a “lead job” row (ItemName = LeadJobName).
 * 4b.i / 4b.ii: Base Price rows on EnquiryPricingValues for those tuples / externals.
 * 4c: None Priced | Partial Priced | All Priced; pending list shows unless All Priced.
 *
 * Admin / CC coordinators use the wider logic in pricing.js — this module returns { enabled: false } when
 * `userDepartment` is blank so callers keep legacy behaviour.
 */

const { normalizePricingJobName, jobIdOfPricing } = require('./quotePricingAccess');

function jobIdOf(job) {
    return jobIdOfPricing(job);
}

function trimStr(s) {
    return String(s ?? '').trim();
}

function reqNoEq(a, b) {
    return String(a ?? '').trim() === String(b ?? '').trim();
}

/** Department ↔ EnquiryFor.ItemName (same idea as getDepartmentPricingAnchors). */
function departmentMatchesItemName(userDepartment, itemName) {
    const d = normalizePricingJobName(userDepartment);
    const j = normalizePricingJobName(itemName);
    if (!d || !j) return false;
    if (d === j) return true;
    if (d.length >= 3 && j.includes(d)) return true;
    if (j.length >= 3 && d.includes(j)) return true;
    return false;
}

function parsePriceNum(v) {
    if (v == null || v === '') return 0;
    let x = v;
    if (typeof x === 'object' && x !== null && typeof x.valueOf === 'function') {
        const vo = x.valueOf();
        if (typeof vo === 'number' || typeof vo === 'string') x = vo;
    }
    const n = parseFloat(String(x).replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
}

const normOptName = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

function matchesOptionTarget(nameStr, targetLower) {
    const n = normOptName(nameStr);
    if (n === targetLower) return true;
    if (n.startsWith(targetLower + '(') || n.startsWith(targetLower + ' ') || n.startsWith(targetLower + '-')) {
        return true;
    }
    return false;
}

function isBasePriceRow(pr, optionMap) {
    const po = pr.PriceOption ?? pr.priceOption;
    if (po != null && String(po).trim() !== '') {
        return matchesOptionTarget(po, 'base price');
    }
    const optIdRaw = pr.OptionID ?? pr.optionID ?? pr.OptionId;
    const opt = optIdRaw != null && optIdRaw !== '' && optionMap ? optionMap[String(optIdRaw)] : null;
    return !!(opt && matchesOptionTarget(opt.OptionName ?? opt.optionName, 'base price'));
}

const normPricingCustomerKey = (s) =>
    String(s || '')
        .replace(/\s*\(L\d+\)\s*$/i, '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

function pricingCustomerRowMatchesKey(cnRaw, wantKey) {
    if (!wantKey) return true;
    const n = normPricingCustomerKey(cnRaw);
    if (!n) return false;
    if (n === wantKey) return true;
    const shorter = n.length <= wantKey.length ? n : wantKey;
    const longer = n.length <= wantKey.length ? wantKey : n;
    if (shorter.length < 4) return false;
    return longer.startsWith(shorter);
}

function leadJobMatches(pvLead, wantLead) {
    const a = normPricingCustomerKey(pvLead);
    const b = normPricingCustomerKey(wantLead);
    if (!a || !b) return false;
    if (a === b) return true;
    return a.includes(b) || b.includes(a);
}

/**
 * All EnquiryFor row IDs in the same lead branch as the department “lead” rows (incl. descendants),
 * for 4.b.ii: external Base rows are tied to `EnquiryFor` in this set, not to Master.Department
 * matching `LeadJobName` / `EnquiryForItem` text.
 */
function collectDescendantEnquiryForIds(leadRootJobs, allJobs) {
    if (!allJobs || allJobs.length === 0) return new Set();
    const byParent = new Map();
    for (const j of allJobs) {
        const pid = j.ParentID ?? j.parentID;
        if (pid == null || String(pid) === '0' || pid === 0) continue;
        const k = String(pid);
        if (!byParent.has(k)) byParent.set(k, []);
        byParent.get(k).push(j);
    }
    const out = new Set();
    const visit = (jid) => {
        const s = String(jid);
        if (out.has(s)) return;
        out.add(s);
        for (const ch of byParent.get(s) || []) {
            const c = jobIdOf(ch);
            if (c != null && c !== '') visit(c);
        }
    };
    for (const r of leadRootJobs || []) {
        const id = jobIdOf(r);
        if (id != null && id !== '') visit(id);
    }
    return out;
}

function stringNormItem(s) {
    return normalizePricingJobName(s || '');
}

function enqForItemAlignsToJobItem(prItem, jobItem) {
    const a = String(prItem || '')
        .trim()
        .toLowerCase();
    const b = String(jobItem || '')
        .trim()
        .toLowerCase();
    if (!a || !b) return false;
    if (a === b) return true;
    if (stringNormItem(prItem) === stringNormItem(jobItem)) return true;
    if (a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a))) return true;
    return false;
}

/**
 * @param {object} params
 * @param {string|number} params.requestNo
 * @param {object[]} params.enqJobs
 * @param {object[]} params.enqPrices — normalized rows (RequestNo, CustomerName, LeadJobName, EnquiryForItem, Price, PriceOption, OptionID)
 * @param {object[]} params.enquiryCustomers — { RequestNo, CustomerName }
 * @param {string} params.userDepartment — Master_ConcernedSE.Department
 * @param {Record<string, object>} [params.optionMap] — synthetic options from values (same as pricing.js)
 * @returns {{ enabled: boolean, showInPending?: boolean, pricingSummaryStatus?: string, pricingSummaryOwnJobStatus?: string, internalRequired?: number, internalSatisfied?: number, externalRequired?: number, externalSatisfied?: number, internalOwnSatisfied?: number, externalOwnSatisfied?: number }}
 */
function evaluatePendingPricingSummarySpec(params) {
    const { requestNo, enqJobs, enqPrices, enquiryCustomers, userDepartment, optionMap = {} } = params;
    const dept = trimStr(userDepartment);
    if (!dept) {
        return { enabled: false };
    }

    const rn = String(requestNo ?? '').trim();
    const jobs = (enqJobs || []).filter((j) => reqNoEq(j.RequestNo ?? j.requestNo, rn));

    const jobMap = {};
    for (const job of jobs) {
        const id = jobIdOf(job);
        if (id != null && id !== '') jobMap[String(id)] = job;
    }

    /** 4a.i — department-scoped EnquiryFor rows → parent internal (parent ItemName + parent LeadJobName). */
    const internalTuples = new Map();
    for (const J of jobs) {
        if (!departmentMatchesItemName(dept, J.ItemName)) continue;
        const pid = J.ParentID ?? J.parentID;
        let P = J;
        if (pid != null && String(pid) !== '0' && pid !== 0 && pid !== '0') {
            const p = jobMap[String(pid)];
            if (p) P = p;
        }
        const parentCustomer = trimStr(P.ItemName ?? P.itemName);
        const leadJobName = trimStr(
            P.LeadJobName ?? P.leadJobName ?? J.LeadJobName ?? J.leadJobName ?? ''
        );
        if (!parentCustomer) continue;
        const key = `${normPricingCustomerKey(parentCustomer)}\t${normPricingCustomerKey(leadJobName)}`;
        const jId = jobIdOf(J);
        const pId = jobIdOf(P);
        const prev = internalTuples.get(key);
        const relatedJobIds = prev?.relatedJobIds ? new Set(prev.relatedJobIds) : new Set();
        if (jId != null && jId !== '') relatedJobIds.add(String(jId));
        if (pId != null && pId !== '') relatedJobIds.add(String(pId));
        for (const dj of collectDescendantEnquiryForIds([J], jobs)) {
            relatedJobIds.add(String(dj));
        }
        /** Base row must sit on this EnquiryFor row for list “own job” status (not satisfied by subjob EPV alone). */
        const ownAnchorJobIdNew = String(jobIdOf(P) ?? '').trim();
        internalTuples.set(key, {
            customerName: parentCustomer,
            leadJobName,
            relatedJobIds,
            ownAnchorJobId: trimStr(prev?.ownAnchorJobId) || ownAnchorJobIdNew,
        });
    }

    const isItemEqualLeadLine = (J) => {
        const item = trimStr(J.ItemName ?? J.itemName);
        const lj = trimStr(J.LeadJobName ?? J.leadJobName ?? '');
        if (!item || !lj) return false;
        const ni = normalizePricingJobName(item);
        const nl = normalizePricingJobName(lj);
        return ni === nl || item === lj;
    };

    /** 4a.ii.1 — department + Item=Lead: user’s department row that is a lead on that line. */
    const leadDeptJobs = jobs.filter((J) => {
        if (!departmentMatchesItemName(dept, J.ItemName)) return false;
        return isItemEqualLeadLine(J);
    });

    const hasEcf = (enquiryCustomers || []).some(
        (c) => reqNoEq(c.RequestNo ?? c.requestNo, rn) && trimStr(c.CustomerName ?? c.customerName) !== '',
    );
    const anyEnquiryLeadLine = jobs.filter((J) => isItemEqualLeadLine(J));

    /**
     * 4a.ii.2: If the department’s own “lead” row is not found, still evaluate EnquiryCustomer
     * when the enquiry has any line with Item=Lead and EnquiryCustomer exists (Civil L2, HVAC, …).
     */
    const leadForExternal =
        leadDeptJobs.length > 0
            ? leadDeptJobs
            : hasEcf && anyEnquiryLeadLine.length > 0
              ? anyEnquiryLeadLine
              : [];

    /** 4b.ii: externals tie to jobs under lead roots when hierarchy matches; fallback = any enquiry job id when scope is empty (EPV often valid while Item=Lead detection misses labels). */
    let leadExternalScopeJobIds = collectDescendantEnquiryForIds(leadForExternal, jobs);
    if (leadExternalScopeJobIds.size === 0 && jobs.length > 0) {
        for (const j of jobs) {
            const id = jobIdOf(j);
            if (id != null && id !== '') leadExternalScopeJobIds.add(String(id));
        }
    }

    /** Always honour EnquiryCustomer list for this request (was gated on leadForExternal — missed AWAL/Ramada vs EPV rows). */
    const externalNames = [];
    for (const row of enquiryCustomers || []) {
        if (!reqNoEq(row.RequestNo ?? row.requestNo, rn)) continue;
        const cn = trimStr(row.CustomerName ?? row.customerName);
        if (cn) externalNames.push(cn);
    }
    const extUnique = [...new Set(externalNames)];

    const prices = enqPrices || [];

    const hasInternalBase = (tuple) => {
        const wantCustKey = normPricingCustomerKey(tuple.customerName);
        const wantLead = tuple.leadJobName;
        const related = tuple.relatedJobIds;
        for (const pr of prices) {
            if (!reqNoEq(pr.RequestNo ?? pr.requestNo, rn)) continue;
            if (parsePriceNum(pr.Price) <= 0) continue;
            if (!isBasePriceRow(pr, optionMap)) continue;
            const mid = pr.MatchedEnquiryForId ?? pr.matchedEnquiryForId;
            const eid = pr.EnquiryForID ?? pr.enquiryForID;
            const midS = mid != null && String(mid).trim() !== '' && String(mid) !== '0' ? String(mid) : '';
            const eidS = eid != null && String(eid).trim() !== '' && String(eid) !== '0' ? String(eid) : '';
            const nameMatch = pricingCustomerRowMatchesKey(pr.CustomerName ?? pr.customerName, wantCustKey);
            const jobMatch =
                related &&
                related.size > 0 &&
                ((midS && related.has(midS)) || (eidS && related.has(eidS)));
            if (!nameMatch && !jobMatch) continue;
            /* EPV row keyed to this EnquiryFor satisfies the slot even if CustomerName/LeadJobName text
             * drifts (e.g. HVAC vs BMS label on the same L1/L2 branch). */
            if (!jobMatch && !leadJobMatches(pr.LeadJobName ?? pr.leadJobName, wantLead)) continue;
            return true;
        }
        return false;
    };

    const hasExternalBase = (extDisplayName) => {
        const wantKey = normPricingCustomerKey(extDisplayName);
        for (const pr of prices) {
            if (!reqNoEq(pr.RequestNo ?? pr.requestNo, rn)) continue;
            if (parsePriceNum(pr.Price) <= 0) continue;
            if (!isBasePriceRow(pr, optionMap)) continue;
            if (!pricingCustomerRowMatchesKey(pr.CustomerName ?? pr.customerName, wantKey)) continue;

            const mid = pr.MatchedEnquiryForId ?? pr.matchedEnquiryForId;
            const eid = pr.EnquiryForID ?? pr.enquiryForID;
            if (mid != null && String(mid) !== '' && String(mid) !== '0' && leadExternalScopeJobIds.has(String(mid))) {
                return true;
            }
            if (eid != null && String(eid) !== '' && String(eid) !== '0' && leadExternalScopeJobIds.has(String(eid))) {
                return true;
            }
            for (const jid of leadExternalScopeJobIds) {
                const j = jobMap[jid];
                if (!j) continue;
                if (!enqForItemAlignsToJobItem(pr.EnquiryForItem ?? pr.enquiryForItem, j.ItemName ?? j.itemName)) {
                    continue;
                }
                if (leadJobMatches(pr.LeadJobName ?? pr.leadJobName, j.LeadJobName ?? j.leadJobName)) {
                    return true;
                }
            }
        }
        return false;
    };

    /** Own-job only: positive Base EPV on the department lead row itself (not descendants). */
    const leadOwnJobIdSet = new Set(
        (leadForExternal || [])
            .map((j) => String(jobIdOf(j)))
            .filter((id) => id && id !== 'undefined')
    );

    const hasInternalBaseOwnJob = (tuple) => {
        const wantCustKey = normPricingCustomerKey(tuple.customerName);
        const wantLead = tuple.leadJobName;
        const anchor = trimStr(tuple.ownAnchorJobId || '');
        if (!anchor) return false;
        for (const pr of prices) {
            if (!reqNoEq(pr.RequestNo ?? pr.requestNo, rn)) continue;
            if (parsePriceNum(pr.Price) <= 0) continue;
            if (!isBasePriceRow(pr, optionMap)) continue;
            const mid = pr.MatchedEnquiryForId ?? pr.matchedEnquiryForId;
            const eid = pr.EnquiryForID ?? pr.enquiryForID;
            const midS = mid != null && String(mid).trim() !== '' && String(mid) !== '0' ? String(mid) : '';
            const eidS = eid != null && String(eid).trim() !== '' && String(eid) !== '0' ? String(eid) : '';
            const onOwn = (midS && midS === anchor) || (eidS && eidS === anchor);
            if (!onOwn) continue;
            const nameMatch = pricingCustomerRowMatchesKey(pr.CustomerName ?? pr.customerName, wantCustKey);
            const jobMatch = onOwn;
            if (!nameMatch && !jobMatch) continue;
            if (!jobMatch && !leadJobMatches(pr.LeadJobName ?? pr.leadJobName, wantLead)) continue;
            return true;
        }
        return false;
    };

    const hasExternalBaseOwnJob = (extDisplayName) => {
        const wantKey = normPricingCustomerKey(extDisplayName);
        if (!wantKey) return false;
        for (const pr of prices) {
            if (!reqNoEq(pr.RequestNo ?? pr.requestNo, rn)) continue;
            if (parsePriceNum(pr.Price) <= 0) continue;
            if (!isBasePriceRow(pr, optionMap)) continue;
            if (!pricingCustomerRowMatchesKey(pr.CustomerName ?? pr.customerName, wantKey)) continue;
            const mid = pr.MatchedEnquiryForId ?? pr.matchedEnquiryForId;
            const eid = pr.EnquiryForID ?? pr.enquiryForID;
            const midS = mid != null && String(mid).trim() !== '' && String(mid) !== '0' ? String(mid) : '';
            const eidS = eid != null && String(eid).trim() !== '' && String(eid) !== '0' ? String(eid) : '';
            if (midS && leadOwnJobIdSet.has(midS)) return true;
            if (eidS && leadOwnJobIdSet.has(eidS)) return true;
        }
        return false;
    };

    const internalList = Array.from(internalTuples.values());
    let internalSatisfied = 0;
    for (const t of internalList) {
        if (hasInternalBase(t)) internalSatisfied += 1;
    }
    const internalRequired = internalList.length;

    let externalSatisfied = 0;
    for (const e of extUnique) {
        if (hasExternalBase(e)) externalSatisfied += 1;
    }
    const externalRequired = extUnique.length;

    let internalOwnSatisfied = 0;
    for (const t of internalList) {
        if (hasInternalBaseOwnJob(t)) internalOwnSatisfied += 1;
    }
    let externalOwnSatisfied = 0;
    for (const e of extUnique) {
        if (hasExternalBaseOwnJob(e)) externalOwnSatisfied += 1;
    }

    const totalRequired = internalRequired + externalRequired;
    if (totalRequired === 0) {
        return {
            enabled: true,
            showInPending: false,
            pricingSummaryStatus: 'All Priced',
            pricingSummaryOwnJobStatus: 'All Priced',
            internalRequired: 0,
            internalSatisfied: 0,
            externalRequired: 0,
            externalSatisfied: 0,
            internalOwnSatisfied: 0,
            externalOwnSatisfied: 0,
        };
    }

    const allSatisfied = internalSatisfied === internalRequired && externalSatisfied === externalRequired;
    const noneSatisfied = internalSatisfied === 0 && externalSatisfied === 0;

    let pricingSummaryStatus = 'Partial Priced';
    if (allSatisfied) pricingSummaryStatus = 'All Priced';
    else if (noneSatisfied) pricingSummaryStatus = 'None Priced';

    const allOwnSatisfied =
        internalOwnSatisfied === internalRequired && externalOwnSatisfied === externalRequired;
    const noneOwnSatisfied = internalOwnSatisfied === 0 && externalOwnSatisfied === 0;
    let pricingSummaryOwnJobStatus = 'Partial Priced';
    if (allOwnSatisfied) pricingSummaryOwnJobStatus = 'All Priced';
    else if (noneOwnSatisfied) pricingSummaryOwnJobStatus = 'None Priced';

    return {
        enabled: true,
        showInPending: !allSatisfied,
        pricingSummaryStatus,
        pricingSummaryOwnJobStatus,
        internalRequired,
        internalSatisfied,
        externalRequired,
        externalSatisfied,
        internalOwnSatisfied,
        externalOwnSatisfied,
    };
}

module.exports = { evaluatePendingPricingSummarySpec, departmentMatchesItemName };
