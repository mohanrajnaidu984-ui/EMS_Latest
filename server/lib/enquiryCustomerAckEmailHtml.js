/**
 * Customer acknowledgement email HTML for Outlook draft.
 */

const FONT_FAMILY = "'Segoe UI', SegoeUI, Tahoma, Arial, sans-serif";
const REP_LINE_BLUE = '#0563C1';

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatEnquiryDate(date) {
    if (!date) return '';
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return String(date);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
}

function buildCustomerAckSubject(row) {
    const reqNo = String(row?.RequestNo || '').trim();
    const datePart = formatEnquiryDate(row?.EnquiryDate);
    const project = String(row?.ProjectName || '').trim();
    return `Acknowledgment of Enquiry: ${reqNo || '-'} Dated: ${datePart || '-'} for Project: ${project || '-'}`
        .replace(/\s+/g, ' ')
        .trim();
}

/** Blue representative line — placed immediately before the Outlook default signature. */
function buildRepresentativeLineHtml(seContact) {
    const seName = escapeHtml(seContact?.fullName || '');
    const seMobile = String(seContact?.mobile || '').trim();
    const text = seMobile
        ? `Please get in touch with our representative <strong>${seName}</strong> on <strong>${escapeHtml(seMobile)}</strong> for any clarification and followup.`
        : `Please get in touch with our representative <strong>${seName}</strong> for any clarification and followup.`;

    return `<p style="margin:0 0 14px 0;font-family:${FONT_FAMILY};font-size:11pt;line-height:1.5;color:${REP_LINE_BLUE};">${text}</p>`;
}

/**
 * Body fragment only (no signature) — Outlook default signature is inserted by VBScript.
 * @param {object} row - EnquiryMaster row
 * @param {{ fullName: string, mobile: string }} seContact
 */
function buildCustomerAcknowledgementEmailHtml(row, seContact) {
    const refNo = escapeHtml(row.RequestNo);
    const enqDate = escapeHtml(formatEnquiryDate(row.EnquiryDate));
    const repLine = buildRepresentativeLineHtml(seContact);

    return `<p style="margin:0 0 12px 0;font-family:${FONT_FAMILY};font-size:11pt;color:#1e293b;line-height:1.5;">Dear Sir / Madam,</p>
<p style="margin:0 0 12px 0;font-family:${FONT_FAMILY};font-size:11pt;color:#1e293b;line-height:1.5;">Thank you for your enquiry. Your request has been logged into our system under reference number <strong>${refNo}</strong> dated <strong>${enqDate}</strong> and has been assigned to the appropriate technical department for assessment.</p>
<p style="margin:0 0 12px 0;font-family:${FONT_FAMILY};font-size:11pt;color:#1e293b;line-height:1.5;">Our team is currently evaluating the details provided to ensure we offer a comprehensive and precise response.</p>
<p style="margin:0 0 12px 0;font-family:${FONT_FAMILY};font-size:11pt;color:#1e293b;line-height:1.5;">If you have any supplementary documentation or additional specifications to add to your initial request, please reply directly to this communication, preserving the current subject line for accurate tracking.</p>
<p style="margin:0 0 12px 0;font-family:${FONT_FAMILY};font-size:11pt;color:#1e293b;line-height:1.5;">Thank you for your interest in our services. We look forward to the prospect of collaborating with you.</p>
${repLine}`;
}

module.exports = {
    buildCustomerAcknowledgementEmailHtml,
    buildRepresentativeLineHtml,
    buildCustomerAckSubject,
    formatEnquiryDate,
};
