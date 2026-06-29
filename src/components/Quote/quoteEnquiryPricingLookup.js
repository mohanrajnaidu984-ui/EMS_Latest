/**
 * Quote left-panel pricing summary: resolve Base / Option amounts from EnquiryPricingValues
 * using LeadJobName, RequestNo, EnquiryForItem, CustomerName (stored grid dimensions).
 */

/** Fingerprint flat pricing values for cache keys / skip-detect (must match QuoteForm pricingStableSig). */
export function pricingValuesStableSig(pd) {
    if (!pd?.options || !pd.values || typeof pd.values !== 'object') return '';
    const vals = pd.values;
    const keys = Object.keys(vals).sort();
    let acc = 0;
    for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        const row = vals[k];
        const pr = row != null ? row.Price ?? row.price : '';
        const n = parseFloat(pr);
        const bucket = Number.isFinite(n) ? Math.round(n * 1000) : 0;
        acc = (((acc << 5) - acc + k.length * 131 + bucket) | 0) >>> 0;
    }
    return [
        pd.options.length,
        keys.length,
        String(pd.leadJob || ''),
        pd.access?.hasLeadAccess ? '1' : '0',
        acc,
    ].join('\x1e');
}

export function stripPricingName(s) {
    const t = String(s || '').trim();
    if (!t) return '';
    const sub = /^sub\s*job\s*-\s*/i;
    if (sub.test(t)) {
        const i = t.indexOf('-');
        return i >= 0 ? t.slice(i + 1).trim() : t;
    }
    const l = /^L\d+\s*-\s*/i;
    if (l.test(t)) {
        const i = t.indexOf('-');
        return i >= 0 ? t.slice(i + 1).trim() : t;
    }
    return t;
}

function normDim(s) {
    return stripPricingName(s)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

export function extractLCodeFromLabel(s) {
    const m = String(s || '').toUpperCase().match(/\bL(\d+)\b/);
    return m ? `L${m[1]}` : '';
}

/**
 * Branch key for EPV row matching — prefer Lead Job dropdown / active quote tab over stale enquiry header prefix
 * (e.g. enquiry still says Civil L1 while user selected BMS L3 for quoting).
 */
export function resolveQuoteBranchPrefixForPricing({
    selectedLeadId,
    jobsPool,
    enquiryLeadJobPrefix,
    pricingLeadJob,
    calculatedTabs,
    activeQuoteTab,
} = {}) {
    const pool = Array.isArray(jobsPool) ? jobsPool : [];

    const fromNode = (node) => {
        if (!node) return '';
        const code = String(node.leadJobCode || node.LeadJobCode || '').trim();
        const lFromCode = extractLCodeFromLabel(code);
        if (lFromCode) return lFromCode;
        const lj = stripPricingName(node.leadJobName || node.LeadJobName || '');
        if (lj) return lj;
        return stripPricingName(node.itemName || node.ItemName || node.DivisionName || '');
    };

    if (selectedLeadId != null && String(selectedLeadId).trim() !== '' && pool.length) {
        const node = pool.find(
            (j) => String(j.id || j.ItemID || j.ID) === String(selectedLeadId)
        );
        const p = fromNode(node);
        if (p) return p;
    }

    const tabs = Array.isArray(calculatedTabs) ? calculatedTabs : [];
    const tab = tabs.find((t) => String(t.id) === String(activeQuoteTab)) || tabs[0];
    if (tab?.realId != null && String(tab.realId).trim() !== '' && pool.length) {
        const node = pool.find(
            (j) => String(j.id || j.ItemID || j.ID) === String(tab.realId)
        );
        const p = fromNode(node);
        if (p) return p;
    }

    const pl = String(pricingLeadJob || '').trim();
    if (pl) return pl;

    return String(enquiryLeadJobPrefix || '').trim();
}

export function leadJobRowMatches(rowLead, branchPrefix, jobsPool) {
    const rl = stripPricingName(rowLead);
    const bp = String(branchPrefix || '').trim();
    if (!bp && !rl) return true;
    const rNorm = normDim(rl);
    const pNorm = normDim(bp);
    if (rNorm && pNorm && (rNorm === pNorm || rNorm.includes(pNorm) || pNorm.includes(rNorm))) return true;
    const rL = extractLCodeFromLabel(rl || rowLead);
    const pL = extractLCodeFromLabel(bp);
    if (rL && pL && rL === pL) return true;

    if (jobsPool && jobsPool.length) {
        const roots = jobsPool.filter(
            (j) => !j.parentId || j.parentId === '0' || j.parentId === 0
        );

        const rowMatchesRootNames = (root) => {
            if (!root) return false;
            const names = [
                stripPricingName(root.itemName || root.DivisionName || root.ItemName || ''),
                stripPricingName(root.leadJobName || root.LeadJobName || ''),
            ].filter(Boolean);
            if (!rNorm) return true;
            return names.some((nm) => {
                const nd = normDim(nm);
                return nd === rNorm || nd.includes(rNorm) || rNorm.includes(nd);
            });
        };

        // Prefix is L-code (e.g. L3): match EPV row lead to that lead root, not the first root in EnquiryFor (often L1 Civil).
        if (pL) {
            const rootByCode = roots.find(
                (j) => extractLCodeFromLabel(j.leadJobCode || j.LeadJobCode || '') === pL
            );
            if (!rootByCode) return false;
            return rowMatchesRootNames(rootByCode);
        }

        // Prefix is a job/lead name: resolve the matching lead root (there may be several "BMS Project" rows under different leads).
        if (pNorm) {
            const rootByPrefix = roots.find((j) => {
                const nm = normDim(stripPricingName(j.itemName || j.DivisionName || j.ItemName || ''));
                const lj = normDim(stripPricingName(j.leadJobName || j.LeadJobName || ''));
                return (
                    nm === pNorm ||
                    lj === pNorm ||
                    nm.includes(pNorm) ||
                    pNorm.includes(nm) ||
                    lj.includes(pNorm) ||
                    pNorm.includes(lj)
                );
            });
            if (rootByPrefix) {
                return !rl || rowMatchesRootNames(rootByPrefix);
            }
        }

        if (rNorm) {
            const rootByRow = roots.find((j) => rowMatchesRootNames(j));
            if (rootByRow) return true;
        }
    }
    return false;
}

export function pickEnquiryJobByItemLabel(jobsPool, label, { branchRootJob, selectedLeadId } = {}) {
    const divNorm = normDim(stripPricingName(label || ''));
    if (!divNorm || !jobsPool?.length) return null;
    const matches = jobsPool.filter((j) => {
        const nm = normDim(stripPricingName(j.itemName || j.ItemName || j.DivisionName || ''));
        return nm && (nm === divNorm || nm.includes(divNorm) || divNorm.includes(nm));
    });
    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0];

    const isUnderRoot = (job, root) => {
        if (!job || !root) return false;
        const rootId = String(root.id || root.ItemID || root.ID);
        const jId = String(job.id || job.ItemID || job.ID);
        if (jId === rootId) return true;
        return isStrictDescendantOf(jobsPool, jId, rootId);
    };

    if (selectedLeadId != null && String(selectedLeadId).trim() !== '') {
        const byId = matches.find((j) => String(j.id || j.ItemID || j.ID) === String(selectedLeadId));
        if (byId) return byId;
    }
    if (branchRootJob) {
        const inBranch = matches.find((j) => isUnderRoot(j, branchRootJob));
        if (inBranch) return inBranch;
    }
    const leadRoot = matches.find((j) => !j.parentId || j.parentId === '0' || j.parentId === 0);
    return leadRoot || matches[0];
}

export function findJobInPool(jobsPool, { realId, label, name } = {}) {
    if (!jobsPool || !jobsPool.length) return null;
    if (realId != null && String(realId).trim() !== '') {
        const byId = jobsPool.find((j) => String(j.id || j.ItemID || j.ID) === String(realId));
        if (byId) return byId;
    }
    const lab = stripPricingName(label || name || '');
    if (!lab) return null;
    return (
        jobsPool.find((j) => stripPricingName(j.itemName || j.DivisionName || j.ItemName) === lab) ||
        jobsPool.find((j) => normDim(j.itemName || j.DivisionName) === normDim(lab)) ||
        null
    );
}

/** Align option / job labels the same way as Pricing module (e.g. "BMS" vs "BMS Project"). */
export function quoteItemNamesAlign(optItem, jobItem) {
    const o = normDim(stripPricingName(optItem));
    const j = normDim(stripPricingName(jobItem));
    if (!o || !j) return false;
    if (o === j) return true;
    if (o.length >= 3 && j.length >= 3 && (o.includes(j) || j.includes(o))) return true;
    return false;
}

/** Resolve EnquiryFor row when exact ItemName text differs slightly from pricing option labels. */
export function findJobInPoolByItemLabel(jobsPool, label, opts = {}) {
    const { selectedLeadId, branchRootJob } = opts;
    const byExact = findJobInPool(jobsPool, { label, name: label });
    if (!jobsPool?.length || !label) return byExact;

    const matches = [];
    for (const j of jobsPool) {
        const nm = j.itemName || j.DivisionName || j.ItemName || '';
        if (quoteItemNamesAlign(nm, label)) matches.push(j);
    }
    if (matches.length === 0) return byExact;
    if (matches.length === 1) return matches[0];

    const isUnderRoot = (job, root) => {
        if (!job || !root) return false;
        const rootId = String(root.id || root.ItemID || root.ID);
        const jId = String(job.id || job.ItemID || job.ID);
        if (jId === rootId) return true;
        return isStrictDescendantOf(jobsPool, jId, rootId);
    };

    if (selectedLeadId != null && String(selectedLeadId).trim() !== '') {
        const sel = String(selectedLeadId);
        const onSel = matches.find((j) => String(j.id || j.ItemID || j.ID) === sel);
        if (onSel) return onSel;
        const underSel = matches.find((j) => isStrictDescendantOf(jobsPool, String(j.id || j.ItemID || j.ID), sel));
        if (underSel) return underSel;
    }
    if (branchRootJob) {
        const inBranch = matches.find((j) => isUnderRoot(j, branchRootJob));
        if (inBranch) return inBranch;
    }
    return byExact || matches[0];
}

function sameRequestNoForQuote(reqStr, rowReqNo) {
    const sa = String(rowReqNo ?? '').trim();
    const sb = String(reqStr ?? '').trim();
    if (!sb) return true;
    if (sa === sb) return true;
    const na = parseInt(sa, 10);
    const nb = parseInt(sb, 10);
    return Number.isFinite(na) && Number.isFinite(nb) && na === nb;
}

function isBasePriceEpvRow(r) {
    const po = String(r?.PriceOption ?? r?.priceOption ?? '').trim().toLowerCase();
    if (!po) return true;
    return po === 'base price' || po.startsWith('base price');
}

/** Shared own-job / subjob EPV dimension matching (Cases 1–4). */
function resolveQuoteSummaryPriceFromScoped(scoped, ctx) {
    const {
        job,
        jobsPool,
        customerDropdown,
        calculatedTabs,
        activeQuoteTab,
        hasLeadAccess,
        editableJobNames,
        userDepartment,
    } = ctx;

    if (!Array.isArray(scoped) || scoped.length === 0 || !job) {
        return { found: false, price: 0 };
    }

    const firstTab = calculatedTabs?.[0];
    const activeTab = calculatedTabs?.find((t) => String(t.id) === String(activeQuoteTab));
    const isFirstTab =
        firstTab && activeTab && String(firstTab.id) === String(activeTab.id);

    const firstLabel = (firstTab?.label || firstTab?.name || '').trim();
    const activeLabel = (activeTab?.label || activeTab?.name || '').trim();
    const custDrop = (customerDropdown || '').trim();

    const ownRootJob = findJobInPool(jobsPool, {
        realId: firstTab?.realId,
        label: firstLabel,
        name: firstLabel,
    });

    const pickedJob = findJobInPool(jobsPool, {
        realId: activeTab?.realId,
        label: activeLabel,
        name: activeLabel,
    });

    const jId = String(job.id || job.ItemID || job.ID || '');
    const jobItem = stripPricingName(job.itemName || job.DivisionName || job.ItemName || '');

    const tryPick = (enquiryForItem, customerName, strictSubjobDims = false) => {
        const matchFn = strictSubjobDims ? rowDimsMatchStrictSubjob : rowDimsMatch;
        const m = scoped.filter((r) => matchFn(r, enquiryForItem, customerName));
        const row = pickLatestRow(m);
        if (!row) return null;
        const price = parseFloat(row.Price ?? row.price ?? 0) || 0;
        return { row, price };
    };

    const leadUser = !!hasLeadAccess;
    const deptOwn = isJobUsersOwnDepartmentRow(job, editableJobNames, userDepartment);

    if (isFirstTab && firstLabel && custDrop && ownRootJob) {
        const ownId = String(ownRootJob.id || ownRootJob.ItemID || ownRootJob.ID);
        const isLeadRootRow = jId === ownId;
        const useOwnJobKeys =
            isLeadRootRow ||
            (!leadUser && deptOwn && jId === ownId);

        if (useOwnJobKeys) {
            const a = tryPick(firstLabel, custDrop);
            if (a) return { found: true, price: a.price };
            const ownName = stripPricingName(ownRootJob.itemName || ownRootJob.DivisionName || '');
            if (ownName) {
                const b = tryPick(ownName, custDrop);
                if (b) return { found: true, price: b.price };
            }
        }
    }

    if (isFirstTab && firstLabel && custDrop && !ownRootJob && deptOwn) {
        const a = tryPick(firstLabel, custDrop);
        if (a) return { found: true, price: a.price };
    }

    if (isFirstTab && ownRootJob) {
        const ownId = String(ownRootJob.id || ownRootJob.ItemID || ownRootJob.ID);
        if (jId !== ownId && isStrictDescendantOf(jobsPool, jId, ownId)) {
            const byEfId = scoped.filter((r) => {
                const rid = r.EnquiryForID ?? r.enquiryForID ?? r.MatchedEnquiryForId;
                return rid != null && String(rid).trim() !== '' && String(rid) === jId;
            });
            const rowById = pickLatestRow(byEfId);
            if (rowById) {
                const p = parseFloat(rowById.Price ?? rowById.price ?? 0) || 0;
                return { found: true, price: p };
            }
            const parent = getParentJob(jobsPool, job);
            const parentName = stripPricingName(parent?.itemName || parent?.DivisionName || '');
            if (jobItem && parentName) {
                const c = tryPick(jobItem, parentName, true);
                if (c) return { found: true, price: c.price };
            }
        }
    }

    if (!isFirstTab && pickedJob && firstLabel) {
        const pickedId = String(pickedJob.id || pickedJob.ItemID || pickedJob.ID);
        const pickedName = stripPricingName(
            pickedJob.itemName || pickedJob.DivisionName || pickedJob.ItemName || activeLabel
        );

        if (jId === pickedId && pickedName) {
            const d = tryPick(pickedName, firstLabel);
            if (d) return { found: true, price: d.price };

            const byEfId = scoped.filter((r) => {
                const rid = r.EnquiryForID ?? r.enquiryForID ?? r.MatchedEnquiryForId;
                return rid != null && String(rid).trim() !== '' && String(rid) === jId;
            });
            const rowById = pickLatestRow(byEfId);
            if (rowById) {
                const p = parseFloat(rowById.Price ?? rowById.price ?? 0) || 0;
                return { found: true, price: p };
            }

            const parent = getParentJob(jobsPool, job);
            const parentName = stripPricingName(parent?.itemName || parent?.DivisionName || '');
            if (parentName) {
                const e = tryPick(pickedName, parentName, true);
                if (e) return { found: true, price: e.price };
            }
        }

        if (isStrictDescendantOf(jobsPool, jId, pickedId)) {
            const parentOfJob = getParentJob(jobsPool, job);
            const parentName = stripPricingName(parentOfJob?.itemName || parentOfJob?.DivisionName || '');
            if (jobItem && parentName) {
                const e = tryPick(jobItem, parentName, true);
                if (e) return { found: true, price: e.price };
            }
        }
    }

    return { found: false, price: 0 };
}

/**
 * Base Price from EPV for one job — same own-job / subjob rules as resolveQuoteSummaryPriceFromRows
 * (subjob rows use parent job name as CustomerName, not the external To dropdown).
 */
export function resolveQuoteSummaryBasePriceFromRows(rows, params) {
    const {
        requestNo,
        job,
        jobLabel,
        branchPrefix,
        jobsPool,
        customerDropdown,
        calculatedTabs,
        activeQuoteTab,
        hasLeadAccess,
        editableJobNames,
        userDepartment,
        selectedLeadId,
    } = params || {};

    if (!Array.isArray(rows) || rows.length === 0 || requestNo == null) {
        return { found: false, price: 0 };
    }

    const reqStr = String(requestNo).trim();
    const pool = Array.isArray(jobsPool) ? jobsPool : [];
    let jobNode = job;
    if (!jobNode && jobLabel) {
        jobNode = findJobInPoolByItemLabel(pool, jobLabel, { selectedLeadId });
    }
    if (!jobNode) return { found: false, price: 0 };

    const scoped = rows.filter((r) => {
        const rno = r.RequestNo ?? r.requestNo;
        if (!sameRequestNoForQuote(reqStr, rno)) return false;
        if (!isBasePriceEpvRow(r)) return false;
        return leadJobRowMatches(r.LeadJobName ?? r.leadJobName, branchPrefix, pool);
    });

    if (scoped.length === 0) return { found: false, price: 0 };

    return resolveQuoteSummaryPriceFromScoped(scoped, {
        job: jobNode,
        jobsPool: pool,
        customerDropdown,
        calculatedTabs,
        activeQuoteTab,
        hasLeadAccess,
        editableJobNames,
        userDepartment,
    });
}

/**
 * Sum Base Price rows from EnquiryPricingValues for one job label (quote sidebar backfill).
 */
export function sumBasePriceFromEpvRowsForJob(rows, params) {
    const res = resolveQuoteSummaryBasePriceFromRows(rows, {
        ...params,
        customerDropdown: params?.customerDropdown ?? params?.customerName,
    });
    return res.found ? res.price : 0;
}

export function getParentJob(jobsPool, job) {
    if (!job || !jobsPool?.length) return null;
    const pid = job.parentId ?? job.ParentID;
    if (pid == null || pid === '' || pid === '0' || pid === 0) return null;
    return jobsPool.find((j) => String(j.id || j.ItemID || j.ID) === String(pid)) || null;
}

export function isStrictDescendantOf(jobsPool, jobId, ancestorId) {
    if (!jobId || !ancestorId || String(jobId) === String(ancestorId)) return false;
    let curr = jobsPool.find((j) => String(j.id || j.ItemID || j.ID) === String(jobId));
    let safety = 0;
    while (curr && safety < 40) {
        const pid = curr.parentId ?? curr.ParentID;
        if (pid == null || pid === '' || pid === '0' || pid === 0) return false;
        if (String(pid) === String(ancestorId)) return true;
        curr = jobsPool.find((j) => String(j.id || j.ItemID || j.ID) === String(pid));
        safety += 1;
    }
    return false;
}

/** Shared customer-name equivalence (dropdown truncation, substring, etc.). */
export function pricingCustomerDimMatch(rCustRaw, wantRaw) {
    return customerDimMatch(rCustRaw, wantRaw);
}

function customerDimMatch(rCustRaw, wantRaw) {
    const rCust = normDim(rCustRaw || '');
    const wCust = normDim(wantRaw || '');
    if (!wCust) return true;
    if (!rCust) return false;
    if (rCust === wCust) return true;
    if (rCust.includes(wCust) || wCust.includes(rCust)) return true;
    // Truncated dropdown (e.g. "AL HAMAD CONSTRUCTION & D…") vs full EnquiryCustomer name
    const minPrefix = 12;
    if (wCust.length >= minPrefix && rCust.startsWith(wCust)) return true;
    if (rCust.length >= minPrefix && wCust.startsWith(rCust)) return true;
    return false;
}

function rowDimsMatch(row, enquiryForItemWant, customerNameWant) {
    const rEpi = stripPricingName(row.EnquiryForItem || '');
    const rCust = stripPricingName(row.CustomerName || '');
    const wEpi = stripPricingName(enquiryForItemWant || '');
    const wCust = stripPricingName(customerNameWant || '');
    const okEpi = !wEpi || normDim(rEpi) === normDim(wEpi) || normDim(rEpi).includes(normDim(wEpi)) || normDim(wEpi).includes(normDim(rEpi));
    const okCust = !wCust || customerDimMatch(rCust, wCust);
    return okEpi && okCust;
}

/** Subjob rows: require exact EnquiryForItem / parent CustomerName match (no substring drift between siblings). */
function rowDimsMatchStrictSubjob(row, enquiryForItemWant, customerNameWant) {
    const rEpi = stripPricingName(row.EnquiryForItem || '');
    const rCust = stripPricingName(row.CustomerName || '');
    const wEpi = stripPricingName(enquiryForItemWant || '');
    const wCust = stripPricingName(customerNameWant || '');
    const okEpi = !wEpi || normDim(rEpi) === normDim(wEpi);
    const okCust = !wCust || normDim(rCust) === normDim(wCust) || customerDimMatch(rCust, wCust);
    return okEpi && okCust;
}

function pickLatestRow(matching) {
    if (!matching.length) return null;
    return [...matching].sort((a, b) => {
        const ta = new Date(a.UpdatedAt || 0).getTime();
        const tb = new Date(b.UpdatedAt || 0).getTime();
        if (tb !== ta) return tb - ta;
        return (parseInt(b.ID, 10) || 0) - (parseInt(a.ID, 10) || 0);
    })[0];
}

/**
 * Own-job pricing row for department users: job matches Master_ConcernedSE department or pricing editableJobs.
 * Not used for full lead users (they use first-tab root id only) to avoid every branch sharing one cell.
 */
export function isJobUsersOwnDepartmentRow(job, editableJobNames, userDepartment) {
    const jn = normDim(job?.itemName || job?.DivisionName || job?.ItemName || '');
    if (!jn) return false;
    const list = (editableJobNames || []).map((n) => normDim(String(n || '').trim())).filter(Boolean);
    if (list.some((n) => jn === n || jn.includes(n) || n.includes(jn))) return true;
    const ud = normDim(String(userDepartment || '').trim());
    if (ud && (jn.includes(ud) || ud.includes(jn))) return true;
    return false;
}

/**
 * @param {Array<object>} rows - EnquiryPricingValues-shaped rows
 * @param {object} p
 * @returns {{ found: boolean, price: number }}
 */
export function resolveQuoteSummaryPriceFromRows(rows, p) {
    const {
        requestNo,
        optionId,
        branchPrefix,
        jobsPool,
        job,
        customerDropdown,
        calculatedTabs,
        activeQuoteTab,
        hasLeadAccess,
        editableJobNames,
        userDepartment,
        alternateOptionIds,
    } = p;

    if (!Array.isArray(rows) || rows.length === 0 || !job || requestNo == null || optionId == null) {
        return { found: false, price: 0 };
    }

    const reqStr = String(requestNo).trim();
    const optStr = String(optionId).trim();
    const optIdSet = new Set(
        (Array.isArray(alternateOptionIds) && alternateOptionIds.length > 0
            ? alternateOptionIds
            : [optStr]
        ).map((x) => String(x ?? '').trim())
            .filter(Boolean)
    );

    const scoped = rows.filter((r) => {
        const rno = r.RequestNo ?? r.requestNo;
        if (!sameRequestNoForQuote(reqStr, rno)) return false;
        const oid = String(r.OptionID ?? r.optionID ?? r.optionId ?? '').trim();
        if (!optIdSet.has(oid)) return false;
        return leadJobRowMatches(r.LeadJobName ?? r.leadJobName, branchPrefix, jobsPool);
    });

    if (scoped.length === 0) return { found: false, price: 0 };

    return resolveQuoteSummaryPriceFromScoped(scoped, {
        job,
        jobsPool,
        customerDropdown,
        calculatedTabs,
        activeQuoteTab,
        hasLeadAccess,
        editableJobNames,
        userDepartment,
    });
}
