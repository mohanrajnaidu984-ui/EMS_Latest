'use strict';

const { normalizePricingJobName } = require('./quotePricingAccess');

function normalizePricingCustomerKey(name) {
    let s = String(name || '').trim();
    const m = s.match(/^(.+?)\s*\(L\d+\)$/i);
    if (m) s = m[1].trim();
    s = s.replace(/\.+$/g, '').trim();
    return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function collapseKey(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Match EnquiryQuotes.LeadJob to pricing lead job label (selected lead root itemName). */
function pricingLeadJobMatches(quoteLeadJob, pricingLeadJob) {
    const eqL = collapseKey(quoteLeadJob);
    const pvL = collapseKey(pricingLeadJob);
    if (!eqL || !pvL) return false;
    if (eqL === pvL) return true;
    if (pvL.startsWith(`${eqL}-`) || pvL.startsWith(`${eqL} `)) return true;
    if (eqL.startsWith(`${pvL}-`) || eqL.startsWith(`${pvL} `)) return true;
    if (/^l\d+/.test(eqL) && pvL.includes(`${eqL})`)) return true;
    const eqNorm = normalizePricingJobName(quoteLeadJob);
    const pvNorm = normalizePricingJobName(pricingLeadJob);
    if (eqNorm && pvNorm && (eqNorm === pvNorm || pvNorm.includes(eqNorm) || eqNorm.includes(pvNorm))) {
        return true;
    }
    return false;
}

function pricingCustomerMatches(quoteToName, pricingCustomer) {
    const a = normalizePricingCustomerKey(quoteToName);
    const b = normalizePricingCustomerKey(pricingCustomer);
    return Boolean(a && b && a === b);
}

/** Block decline when any saved quote exists for enquiry lead job + customer. */
function quoteBlocksDeclineToQuote(existingQuotes, leadJobName, customerName) {
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

function mapEnquiryQuoteRowsForDeclineGuard(rows) {
    return (rows || []).map((r) => ({
        leadJob: String(r.LeadJob ?? r.leadJob ?? '').trim(),
        ownJob: String(r.OwnJob ?? r.ownJob ?? '').trim(),
        toName: String(r.ToName ?? r.toName ?? '').trim(),
        quoteNumber: String(r.QuoteNumber ?? r.quoteNumber ?? '').trim(),
    }));
}

module.exports = {
    normalizePricingCustomerKey,
    pricingLeadJobMatches,
    pricingCustomerMatches,
    quoteBlocksDeclineToQuote,
    mapEnquiryQuoteRowsForDeclineGuard,
};
