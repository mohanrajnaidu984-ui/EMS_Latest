const { sql } = require('../dbConfig');
const { ensureAddendumSchema } = require('./enquiryAddendums');
const { buildEnquiryNotifyEmailHtml, formatEnquiryDate } = require('./enquiryNotifyEmailHtml');
const { escapeHtml } = require('./htmlEscape');

function buildChangeEmail(row, addendum, attachments, now = new Date()) {
    const date = formatEnquiryDate(now);
    const shortDate = date.replace(/\d{4}$/, s => s.slice(-2));
    const label = addendum ? `Addendum-${addendum.AddendumNo}` : 'Enquiry Update';
    const subject = addendum
        ? `${label} Received for Enquiry ${row.RequestNo} on dated ${shortDate}`
        : `Enquiry ${row.RequestNo} Updated on dated ${shortDate}`;
    const extraRows = addendum ? [
        ['Addendum No.:', String(addendum.AddendumNo).padStart(2, '0')],
        ['Addendum Received Date:', formatEnquiryDate(addendum.ReceivedDate)],
        ['Addendum Details:', `<div>${escapeHtml(addendum.Details).replace(/\n/g, '<br>')}</div>`],
        ['Addendum Added By:', `<div>${escapeHtml(addendum.CreatedByEmail || '')}</div>`],
    ] : [];
    let html = buildEnquiryNotifyEmailHtml(row, [], '', {
        extraRows,
        tableOptions: addendum ? { labelBackground: '#982b92' } : {},
    });
    // Reuse the existing enquiry fields, with the supplied addendum email wording.
    html = html.replace(/<p[^>]*>Greetings !!!<\/p>/, '');
    html = html.replace(/Please find given below,[\s\S]*?Please report closure in Enquiry Management System\./,
        `Please find <b>${addendum ? 'addendum details' : 'updated enquiry details'}</b> given below, pertaining to a customer Enquiry no. <b>${escapeHtml(row.RequestNo)}</b> on <b>${escapeHtml(date)}</b>. This is for your information and necessary action.`);
    const names = attachments.map((a,i) => `${i+1}. ${escapeHtml(a.FileName)}`).join('<br>');
    html = html.replace(/(Supplementary received with:[\s\S]*?<\/td>\s*<td[^>]*>)[\s\S]*?(<\/td>)/, (_, start, end) => start + names + end);
    return { html, subject };
}

async function loadChangeEmail(row, addendumNo) {
    await ensureAddendumSchema();
    let addendum = null;
    if (addendumNo != null) {
        const result = await sql.query`SELECT AddendumNo,Details,CreatedByEmail,ReceivedDate FROM EnquiryAddendums WHERE RequestNo=${row.RequestNo} AND AddendumNo=${Number(addendumNo)}`;
        addendum = result.recordset[0];
        if (!addendum) throw new Error('Addendum not found');
    }
    const result = addendum
        ? await sql.query`SELECT FileName FROM Attachments WHERE RequestNo=${row.RequestNo} AND AddendumNo=${addendum.AddendumNo} ORDER BY ID`
        : await sql.query`SELECT FileName FROM Attachments WHERE RequestNo=${row.RequestNo} ORDER BY ID`;
    return buildChangeEmail(row, addendum, result.recordset);
}
module.exports = { buildChangeEmail, loadChangeEmail };
