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
