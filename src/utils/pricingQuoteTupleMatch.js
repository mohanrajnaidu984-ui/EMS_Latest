/** Client-side tuple match for pricing decline guard (mirrors server/lib/pricingQuoteTupleMatch.js). */

function stripPricingLeadPrefix(s) {
    return String(s || '')
        .replace(/^(L\d+|Sub Job)\s*-\s*/i, '')
        .trim()
        .toLowerCase();
}

export function normalizePricingCustomerKey(name) {
    let s = String(name || '').trim();
    const m = s.match(/^(.+?)\s*\(L\d+\)$/i);
    if (m) s = m[1].trim();
    s = s.replace(/\.+$/g, '').trim();
    return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function collapseKey(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function pricingLeadJobMatches(quoteLeadJob, pricingLeadJob) {
    const eqL = collapseKey(quoteLeadJob);
    const pvL = collapseKey(pricingLeadJob);
    if (!eqL || !pvL) return false;
    if (eqL === pvL) return true;
    if (pvL.startsWith(`${eqL}-`) || pvL.startsWith(`${eqL} `)) return true;
    if (eqL.startsWith(`${pvL}-`) || eqL.startsWith(`${pvL} `)) return true;
    if (/^l\d+/.test(eqL) && pvL.includes(`${eqL})`)) return true;
    const eqNorm = stripPricingLeadPrefix(quoteLeadJob);
    const pvNorm = stripPricingLeadPrefix(pricingLeadJob);
    if (eqNorm && pvNorm && (eqNorm === pvNorm || pvNorm.includes(eqNorm) || eqNorm.includes(pvNorm))) {
        return true;
    }
    return false;
}

export function pricingCustomerMatches(quoteToName, pricingCustomer) {
    const a = normalizePricingCustomerKey(quoteToName);
    const b = normalizePricingCustomerKey(pricingCustomer);
    return Boolean(a && b && a === b);
}

export function quoteBlocksDeclineToQuote(existingQuotes, leadJobName, customerName) {
    if (!Array.isArray(existingQuotes) || !existingQuotes.length) return false;
    const lead = String(leadJobName || '').trim();
    const cust = String(customerName || '').trim();
    if (!lead || !cust) return false;
    return existingQuotes.some((q) => {
        const qLead = q.leadJob ?? q.LeadJob ?? '';
        const qTo = q.toName ?? q.ToName ?? '';
        return pricingLeadJobMatches(qLead, lead) && pricingCustomerMatches(qTo, cust);
    });
}

export const SUBJOB_QUOTE_PENDING_MSG = 'Quote to be generated to see the price';

/** EnquiryFor row is a subjob (not a lead root / own-job root). */
export function isPricingSubjobRow(job) {
    const pid = job?.parentId ?? job?.ParentID ?? job?.parentID;
    return pid != null && pid !== 0 && String(pid) !== '0';
}

/** True when a saved EnquiryQuotes row was created from this subjob division. */
export function enquiryQuoteBelongsToSubjobJob(quote, job) {
    const itemName = String(job?.itemName ?? job?.ItemName ?? job?.DivisionName ?? '').trim();
    const deptName = String(job?.departmentName ?? job?.DepartmentName ?? '').trim();
    const divCode = String(
        job?.divisionCode ?? job?.DivisionCode ?? job?.departmentCode ?? job?.DepartmentCode ?? ''
    )
        .trim()
        .toUpperCase();

    const qOwn = String(quote?.ownJob ?? quote?.OwnJob ?? '').trim();
    const qNum = String(quote?.quoteNumber ?? quote?.QuoteNumber ?? '')
        .trim()
        .toUpperCase();

    if (itemName && stripPricingLeadPrefix(qOwn) === stripPricingLeadPrefix(itemName)) return true;
    if (deptName && stripPricingLeadPrefix(qOwn) === stripPricingLeadPrefix(deptName)) return true;

    if (divCode.length >= 2 && qNum) {
        if (qNum.includes(`/${divCode}/`) || qNum.includes(`-${divCode}-`)) return true;
        const divRe = new RegExp(`[/\\-]${divCode}[/\\-]`, 'i');
        if (divRe.test(qNum)) return true;
    }
    return false;
}

/** Subjob pricing unlocks after at least one quote exists for that subjob. */
export function subjobHasQuoteForPricing(job, existingQuotes) {
    if (!isPricingSubjobRow(job)) return true;
    if (!Array.isArray(existingQuotes) || !existingQuotes.length) return false;
    return existingQuotes.some((q) => enquiryQuoteBelongsToSubjobJob(q, job));
}

/**
 * Whether a subjob row may show its stored price in Quote pricing summary / clause table.
 * Lead roots always visible; subjob users on their own tab see their price before quoting.
 */
export function subjobPriceVisibleInQuoteSummary(job, existingQuotes, opts = {}) {
    if (!job || !isPricingSubjobRow(job)) return true;
    if (job.priceUnlockedByQuote === true) return true;

    const namesAlign = opts.namesAlign;
    const grpName = String(job.itemName || job.DivisionName || job.ItemName || '').trim();
    const activeTabLabel = String(opts.activeTabLabel || '').trim();
    const quoteListDivision = String(opts.quoteListDivision || '').trim();

    if (opts.isSubJobTab && activeTabLabel && namesAlign && namesAlign(activeTabLabel, grpName)) {
        return true;
    }
    if (quoteListDivision && namesAlign && namesAlign(quoteListDivision, grpName)) {
        return true;
    }
    return subjobHasQuoteForPricing(job, existingQuotes);
}

export function maskPricingSummaryGroup(grp, job, existingQuotes, opts = {}) {
    if (!grp) return grp;
    const visible = subjobPriceVisibleInQuoteSummary(job, existingQuotes, opts);
    if (visible) return { ...grp, priceMaskedByQuote: false };

    const items = Array.isArray(grp.items)
        ? grp.items.map((i) => ({ ...i, total: 0 }))
        : [{ name: 'Base Price', total: 0 }];
    return {
        ...grp,
        items,
        total: 0,
        priceMaskedByQuote: true,
    };
}

export function applyQuoteSubjobPriceMaskToSummary(summary, ctx = {}) {
    const list = Array.isArray(summary) ? summary : [];
    const resolveJob = ctx.resolveJobForGroup;
    return list.map((grp) => {
        const job = typeof resolveJob === 'function' ? resolveJob(grp?.name) : null;
        return maskPricingSummaryGroup(grp, job, ctx.existingQuotes, ctx);
    });
}

/** Unchecked by default when subjob has no quote yet (price masked / zero). */
export function isPricingSummaryGroupSelectable(grp) {
    if (!grp) return false;
    return grp.priceMaskedByQuote !== true;
}

export function selectablePricingSummaryGroupNames(summary) {
    return (Array.isArray(summary) ? summary : [])
        .filter(isPricingSummaryGroupSelectable)
        .map((g) => String(g?.name || '').trim())
        .filter(Boolean);
}

export function filterSelectableJobItemNames(jobNames, jobsPool, existingQuotes, opts = {}) {
    const names = Array.isArray(jobNames) ? jobNames : [];
    if (!names.length) return [];
    const resolveJob =
        typeof opts.resolveJobForGroup === 'function'
            ? opts.resolveJobForGroup
            : (name) => {
                  const n = String(name || '').trim().toLowerCase();
                  return (jobsPool || []).find((j) => {
                      const jn = String(j?.itemName ?? j?.ItemName ?? j?.DivisionName ?? '')
                          .trim()
                          .toLowerCase();
                      return jn === n;
                  });
              };
    return names.filter((name) => {
        const job = resolveJob(name);
        if (!job) return true;
        if (!isPricingSubjobRow(job)) return true;
        return subjobPriceVisibleInQuoteSummary(job, existingQuotes, opts);
    });
}
