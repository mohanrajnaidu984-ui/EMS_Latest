/**
 * Activity-based enquiry workflow (per EnquiryFor branch: pricing + quotes).
 * Follow-up / Won still use EnquiryMaster.Status (probability is enquiry-level in current schema);
 * partial vs all for those stages uses branch count heuristics when status is set.
 */

function stripJobPrefix(name) {
    return String(name || '')
        .replace(/^(L\d+|Sub Job)\s*-\s*/i, '')
        .trim();
}

function normJobKey(s) {
    return stripJobPrefix(s)
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function isOptionalOptionName(name) {
    const u = String(name || '').toUpperCase();
    return u.includes('OPTION') || u.includes('OPTIONAL');
}

function hasPositivePriceForBranch(branch, valueRows) {
    const idStr = branch.id != null ? String(branch.id).trim() : '';
    const itemNorm = normJobKey(branch.itemName || '');
    return (valueRows || []).some((r) => {
        if (isOptionalOptionName(r.OptionName)) return false;
        const p = parseFloat(r.Price);
        if (!Number.isFinite(p) || p === 0) return false;
        const vid = r.EnquiryForID != null ? String(r.EnquiryForID).trim() : '';
        if (idStr && vid && idStr === vid) return true;
        const rowItem = normJobKey(r.EnquiryForItem || '');
        if (itemNorm && rowItem && (rowItem === itemNorm || rowItem.includes(itemNorm) || itemNorm.includes(rowItem))) {
            return true;
        }
        return false;
    });
}

function isQuoteRowSaved(row) {
    const st = String(row.Status || '').trim().toLowerCase();
    if (!st || st === 'draft') return false;
    return true;
}

function hasSavedQuoteForBranch(branch, quoteRows) {
    const itemNorm = normJobKey(branch.itemName || '');
    return (quoteRows || []).some((q) => {
        if (!isQuoteRowSaved(q)) return false;
        const own = normJobKey(q.OwnJob || '');
        if (itemNorm && own && (own === itemNorm || own.includes(itemNorm) || itemNorm.includes(own))) return true;
        return false;
    });
}

function branchOwnJobMatchesQuote(branch, quoteRow) {
    const itemNorm = normJobKey(branch.itemName || '');
    const own = normJobKey(quoteRow.OwnJob || '');
    return !!(itemNorm && own && (own === itemNorm || own.includes(itemNorm) || itemNorm.includes(own)));
}

function quoteNumberMatchesWonRef(wonRef, quoteNumber) {
    const qn = String(quoteNumber || '').trim();
    const r = String(wonRef || '').trim();
    if (!qn || !r) return false;
    if (qn === r) return true;
    const rBase = r.split(/-R\d+/i)[0];
    const qBase = qn.split(/-R\d+/i)[0];
    return !!(rBase && qBase && rBase === qBase);
}

/** Branches whose saved quote matches WonQuoteRef (exact or same base before -R#). */
function countWonBranchesFromRef(branches, quoteRows, wonQuoteRef, masterIsWon) {
    const list = (branches || []).filter((b) => b.itemName !== '__whole_enquiry__');
    const total = list.length;
    if (!masterIsWon) return 0;
    const ref = String(wonQuoteRef || '').trim();
    if (!ref) return total > 0 ? total : 1;
    if (total === 0) return 1;
    let n = 0;
    for (const b of list) {
        const hit = (quoteRows || []).some((q) => {
            const qn = String(q.QuoteNumber || '').trim();
            if (!qn) return false;
            if (!quoteNumberMatchesWonRef(ref, qn)) return false;
            return branchOwnJobMatchesQuote(b, q);
        });
        if (hit) n += 1;
    }
    return n;
}

/**
 * @param {object} params
 * @param {Array<{ id: any, itemName: string, parentId?: any }>} params.branches
 * @param {Array<{ EnquiryForID?: any, EnquiryForItem?: string, Price?: any, OptionName?: string }>} params.valueRows
 * @param {Array<{ OwnJob?: string, LeadJob?: string, Status?: string, QuoteNumber?: string }>} params.quoteRows
 * @param {string} [params.masterStatus] EnquiryMaster.Status (or pass masterRow only)
 * @param {{ Status?: string, WonQuoteRef?: string }} [params.masterRow] EnquiryMaster row (Status, WonQuoteRef)
 */
function computeEnquiryWorkflowStatus({ branches, valueRows, quoteRows, masterStatus, masterRow }) {
    const master = String((masterRow && masterRow.Status) || masterStatus || '').trim();
    const wonQuoteRef = String((masterRow && masterRow.WonQuoteRef) || '').trim();
    const masterLower = master.toLowerCase();

    const list = Array.isArray(branches) && branches.length > 0 ? branches : [{ id: null, itemName: '__whole_enquiry__' }];
    const total = list.length;
    let priced = 0;
    let quoted = 0;
    for (const b of list) {
        if (b.itemName === '__whole_enquiry__') {
            const anyPrice = (valueRows || []).some((r) => {
                if (isOptionalOptionName(r.OptionName)) return false;
                const p = parseFloat(r.Price);
                return Number.isFinite(p) && p !== 0;
            });
            if (anyPrice) priced = 1;
            const anyQ = (quoteRows || []).some((q) => isQuoteRowSaved(q));
            if (anyQ) quoted = 1;
            break;
        }
        if (hasPositivePriceForBranch(b, valueRows)) priced += 1;
        if (hasSavedQuoteForBranch(b, quoteRows)) quoted += 1;
    }

    const pricingPartial = priced > 0 && priced < total;
    const pricingAll = total > 0 && priced === total;
    const quotePartial = quoted > 0 && quoted < total;
    const quoteAll = total > 0 && quoted === total;

    const multi = total > 1;

    let step = 1;
    let stepKey = 'enquiry';
    let displayLabel = 'Enquiry';
    let detail = '';

    if (masterLower === 'lost') {
        step = 5;
        stepKey = 'lost';
        displayLabel = 'Lost';
        detail = 'Closed (lost)';
    } else if (masterLower === 'won') {
        step = 5;
        stepKey = 'won';
        displayLabel = multi ? 'Won — partial (multi-branch)' : 'Won — all';
        detail = multi
            ? 'Enquiry marked Won; track per-branch wins in probability when available.'
            : 'Enquiry marked Won.';
    } else if (masterLower === 'follow-up' || masterLower === 'followup') {
        step = 4;
        stepKey = 'followup';
        displayLabel = multi ? 'Follow-up — partial' : 'Follow-up — all';
        detail = multi
            ? 'Follow-up set on enquiry; multiple branches — confirm each branch in probability when per-branch tracking is enabled.'
            : 'Follow-up set on enquiry (single branch).';
    } else if (quoteAll) {
        step = 3;
        stepKey = 'quote_all';
        displayLabel = 'Quote — all';
        detail = `${quoted}/${total} branches have a saved quote`;
    } else if (quotePartial) {
        step = 3;
        stepKey = 'quote_partial';
        displayLabel = 'Quote — partial';
        detail = `${quoted}/${total} branches have a saved quote`;
    } else if (pricingAll) {
        step = 2;
        stepKey = 'pricing_all';
        displayLabel = 'Pricing — all';
        detail = `${priced}/${total} branches have base pricing`;
    } else if (pricingPartial) {
        step = 2;
        stepKey = 'pricing_partial';
        displayLabel = 'Pricing — partial';
        detail = `${priced}/${total} branches have base pricing`;
    } else {
        step = 1;
        stepKey = 'enquiry';
        displayLabel = 'Enquiry';
        detail = 'No branch has base-price entries yet';
    }

    const masterIsWon = masterLower === 'won';
    const masterIsLost = masterLower === 'lost';
    const masterIsFollowUp = masterLower === 'follow-up' || masterLower === 'followup';

    const wonBranchCount = countWonBranchesFromRef(list, quoteRows, wonQuoteRef, masterIsWon);
    const lostBranchCount = masterIsLost ? total : 0;
    /** Until per-branch probability exists, treat branches with a saved quote as in follow-up scope when enquiry is in follow-up. */
    const followUpBranchCount = masterIsFollowUp ? quoted : 0;

    const stepSubLabels = {
        enquiry: total > 0 ? `${total} ${total === 1 ? 'job' : 'jobs'}` : '—',
        pricing: `${priced}/${total} priced`,
        quote: `${quoted}/${total} quoted`,
        followUp: `${followUpBranchCount}/${total} under follow-up`,
        won: `${wonBranchCount}/${total} won`,
        lost: `${lostBranchCount}/${total} lost`,
    };

    return {
        displayLabel,
        detail,
        step,
        stepKey,
        pricedCount: priced,
        quotedCount: quoted,
        branchCount: total,
        wonBranchCount,
        lostBranchCount,
        followUpBranchCount,
        stepSubLabels,
        pricingPartial,
        pricingAll,
        quotePartial,
        quoteAll,
        masterStatus: master,
    };
}

module.exports = {
    computeEnquiryWorkflowStatus,
    stripJobPrefix,
    normJobKey,
};
