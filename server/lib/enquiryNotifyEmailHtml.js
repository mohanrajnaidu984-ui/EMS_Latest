/**
 * Internal enquiry notification email HTML (EMS template) for Outlook draft.
 */

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

function formatShortDate(date) {
    if (!date) return '';
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return String(date);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
}

const FONT_FAMILY = "'Segoe UI', SegoeUI, Tahoma, Arial, sans-serif";
const NAVY = '#2f5f8f';
/** Light pistachio green — site-visit reminder label column (matches legacy EMS notify tables). */
const PISTACHIO = '#d4edda';
const PISTACHIO_BORDER = '#b8dfc4';
const LIGHT_GREY = '#f8f9fb';
const LIGHT_GREY_ALT = '#eef1f6';
const BORDER = '#d8dee8';

/** Outlook mail subject (not shown in body). */
function buildEnquiryOutlookSubject(row) {
    const reqNo = String(row?.RequestNo || '').trim();
    const datePart = formatEnquiryDate(row?.EnquiryDate);
    const project = String(row?.ProjectName || '').trim();
    const parts = ['New Enquiry No.:', reqNo || '-', 'Dated', datePart || '-', 'for Project:', project || '-'];
    return parts.join(' ').replace(/\s+/g, ' ').trim();
}

const LABEL_STYLE = [
    `padding:5px 12px`,
    `mso-padding-alt:5px 12px`,
    `background-color:${NAVY}`,
    `color:#ffffff`,
    `font-family:${FONT_FAMILY}`,
    `font-size:10pt`,
    `font-weight:400`,
    `line-height:1.35`,
    `vertical-align:top`,
    `width:36%`,
    `border:0`,
    `border-width:0`,
    `mso-border-alt:none`,
    `mso-border-bottom-alt:none`,
    `mso-border-top-alt:none`,
    `mso-border-left-alt:none`,
    `mso-border-right-alt:none`,
].join(';');

function buildLabelStyle(labelBackground, labelColor) {
    return LABEL_STYLE.replace(`background-color:${NAVY}`, `background-color:${labelBackground}`).replace(
        'color:#ffffff',
        `color:${labelColor}`
    );
}

function valueStyle(isAlt, isLast) {
    const borderBottom = isLast ? 'border-bottom:none' : `border-bottom:1px solid ${BORDER}`;
    return [
        `padding:5px 12px`,
        `mso-padding-alt:5px 12px`,
        borderBottom,
        `background-color:${isAlt ? LIGHT_GREY_ALT : LIGHT_GREY}`,
        `color:#1e293b`,
        `font-family:${FONT_FAMILY}`,
        `font-size:10pt`,
        `font-weight:400`,
        `line-height:1.35`,
        `vertical-align:top`,
        `border-left:none`,
        `border-right:none`,
        `border-top:none`,
    ].join(';');
}

function parseListItems(raw) {
    if (Array.isArray(raw)) {
        return raw.map((v) => String(v || '').trim()).filter(Boolean);
    }
    const s = String(raw || '').trim();
    if (!s) return [];
    if (/\d{2}\.\s/.test(s)) {
        return s
            .split(/,\s*(?=\d{2}\.\s)/)
            .map((part) => part.replace(/^\d{2}\.\s*/, '').trim())
            .filter(Boolean);
    }
    return s
        .split(/,\s*/)
        .map((part) => part.trim())
        .filter(Boolean);
}

function isHttpUrl(url) {
    const u = String(url || '').trim().toLowerCase();
    return u.startsWith('http://') || u.startsWith('https://');
}

/** Vertical stack — one item per line (Outlook-friendly). */
function buildVerticalListHtml(raw, { numbered = false, twoDigit = false } = {}) {
    const items = parseListItems(raw);
    if (items.length === 0) return '';
    if (items.length === 1) return escapeHtml(items[0]);

    const blocks = items
        .map((item, idx) => {
            const prefix = numbered
                ? `${twoDigit ? String(idx + 1).padStart(2, '0') : idx + 1}. `
                : '';
            return `<div style="margin:0 0 3px 0;line-height:1.35;font-family:${FONT_FAMILY};">${prefix}${escapeHtml(item)}</div>`;
        })
        .join('');
    return `<div style="margin:0;font-family:${FONT_FAMILY};">${blocks}</div>`;
}

function isTruthyBit(val) {
    return val === true || val === 1 || val === '1' || val === 'true';
}

/** Checked document-received labels + Others Specify text from EnquiryMaster row. */
function buildDocumentsReceivedItems(row) {
    const items = [];
    if (isTruthyBit(row?.Doc_HardCopies)) items.push('Hard Copies');
    if (isTruthyBit(row?.Doc_Drawing)) items.push('Drawing');
    if (isTruthyBit(row?.Doc_CD_DVD)) items.push('CD/DVD');
    if (isTruthyBit(row?.Doc_Spec)) items.push('Spec');
    if (isTruthyBit(row?.Doc_EquipmentSchedule)) items.push('Equipment Schedule');
    const others = String(row?.OthersSpecify || row?.DocumentsReceived || '').trim();
    if (others) items.push(others);
    return items;
}

/**
 * @param {Array<{ ID: number, FileName: string, downloadUrl: string }>} attachments
 */
function buildSupplementaryHtml(attachments) {
    const list = Array.isArray(attachments) ? attachments.filter((a) => a?.FileName) : [];
    if (list.length === 0) return '';

    const renderItem = (att, idx) => {
        const label = escapeHtml(att.FileName);
        const num = idx + 1;
        const url = att.downloadUrl || '';
        if (isHttpUrl(url)) {
            const safeUrl = escapeHtml(url);
            return `<div style="margin:0 0 3px 0;line-height:1.35;font-family:${FONT_FAMILY};"><a href="${safeUrl}" style="color:#1d4ed8;text-decoration:underline;font-family:${FONT_FAMILY};"><strong>${num}.</strong> ${label}</a></div>`;
        }
        return `<div style="margin:0 0 3px 0;line-height:1.35;font-family:${FONT_FAMILY};"><strong>${num}.</strong> ${label}</div>`;
    };

    if (list.length === 1) {
        return renderItem(list[0], 0);
    }

    const blocks = list.map((att, idx) => renderItem(att, idx)).join('');
    return `<div style="margin:0;font-family:${FONT_FAMILY};">${blocks}</div>`;
}

/** Document received checkboxes/text plus uploaded public attachment links. */
function buildSupplementaryReceivedHtml(row, attachments) {
    const docHtml = buildVerticalListHtml(buildDocumentsReceivedItems(row));
    const attHtml = buildSupplementaryHtml(attachments);
    if (docHtml && attHtml) {
        return `${docHtml}<div style="margin-top:8px;">${attHtml}</div>`;
    }
    return docHtml || attHtml || '';
}

function formatCellValue(raw) {
    const isHtml =
        typeof raw === 'string' &&
        (raw.includes('<div') || raw.includes('<ol') || raw.includes('<ul') || raw.includes('<a href'));
    return isHtml ? raw : escapeHtml(raw ?? '').replace(/\n/g, '<br>');
}

/** Single table — one row per field so label and value stay aligned (Outlook-safe). */
function buildEnquiryTable(rowDefs, tableOptions = {}) {
    const labelBackground = tableOptions.labelBackground || NAVY;
    const labelColor = tableOptions.labelColor || '#ffffff';
    const labelBorderColor = tableOptions.labelBorderColor || labelBackground;
    const labelCellBaseStyle = buildLabelStyle(labelBackground, labelColor);

    const rows = rowDefs
        .map(([label, value], index) => {
            const isAlt = index % 2 === 1;
            const isLast = index === rowDefs.length - 1;
            const labelBorder = isLast
                ? 'border-bottom:none;mso-border-bottom-alt:none'
                : `border-bottom:1px solid ${labelBorderColor};mso-border-bottom-alt:1px solid ${labelBorderColor}`;
            const labelCellStyle = `${labelCellBaseStyle};${labelBorder}`;
            return `<tr>
  <td width="36%" bgcolor="${labelBackground}" valign="top" style="${labelCellStyle}"><span style="font-weight:400;font-family:${FONT_FAMILY};color:${labelColor};">${escapeHtml(label)}</span></td>
  <td width="64%" valign="top" style="${valueStyle(isAlt, isLast)}">${formatCellValue(value)}</td>
</tr>`;
        })
        .join('\n');

    return `<table cellpadding="0" cellspacing="0" border="0" role="presentation" width="100%" style="border-collapse:collapse;width:100%;max-width:740px;font-family:${FONT_FAMILY};mso-table-lspace:0pt;mso-table-rspace:0pt;">
${rows}
</table>`;
}

/**
 * @param {object} row - EnquiryMaster + display fields from loadEnquiryEmailRow
 * @param {Array<{ ID: number, FileName: string, downloadUrl: string }>} attachments
 * @param {string} [apiPublicBase]
 */
function buildEnquiryDetailsRowDefs(row, attachments = [], apiPublicBase = '') {
    const base = String(apiPublicBase || '').replace(/\/$/, '');
    const attWithUrls = (attachments || []).map((att) => ({
        ...att,
        downloadUrl:
            att.downloadUrl ||
            (base && att.ID ? `${base}/api/attachments/${att.ID}` : `/api/attachments/${att.ID}`),
    }));

    const supplementary = buildSupplementaryReceivedHtml(row, attWithUrls);
    const customerHtml = buildVerticalListHtml(row.CustomerNamesList || row.CustomerNameDisplay, {
        numbered: true,
        twoDigit: true,
    });
    const consultantHtml = buildVerticalListHtml(
        row.ConsultantNamesList?.length ? row.ConsultantNamesList : row.ConsultantName
    );
    const divisionsHtml = buildVerticalListHtml(
        row.DivisionsInvolvedList?.length ? row.DivisionsInvolvedList : row.DivisionsInvolvedDisplay
    );
    const enquiryTypeHtml = buildVerticalListHtml(row.EnquiryTypeDisplay || '');

    return [
        ['Enquiry ref No. :', row.RequestNo],
        ['Project Name:', row.ProjectName || ''],
        ['Customer Name:', customerHtml],
        ['Client Name:', row.ClientName || ''],
        ['Consultant Name:', consultantHtml],
        ['Enquiry Details :', row.EnquiryDetails || ''],
        ['Enquiry Date:', formatEnquiryDate(row.EnquiryDate)],
        ['Due Date:', formatEnquiryDate(row.DueDate)],
        ['Site Visit Date:', formatEnquiryDate(row.SiteVisitDate)],
        ['Enquiry Type:', enquiryTypeHtml || row.EnquiryTypeDisplay || ''],
        ['Source of Enquiry:', row.SourceOfEnquiry || ''],
        ['Divisions Involved:', divisionsHtml],
        ['Supplementary received with:', supplementary],
        ['Created By:', row.CreatedBy || ''],
        ['Remarks:', row.Remarks || ''],
    ];
}

/** Enquiry details table only (shared by notify + site-visit reminder emails). */
function buildEnquiryDetailsTableHtml(row, attachments = [], apiPublicBase = '', tableOptions = {}) {
    return buildEnquiryTable(buildEnquiryDetailsRowDefs(row, attachments, apiPublicBase), tableOptions);
}

/**
 * @param {object} row - EnquiryMaster + display fields from loadEnquiryEmailRow
 * @param {Array<{ ID: number, FileName: string, downloadUrl: string }>} attachments
 * @param {string} [apiPublicBase]
 */
function buildEnquiryNotifyEmailHtml(row, attachments = [], apiPublicBase = '') {
    const rowDefs = buildEnquiryDetailsRowDefs(row, attachments, apiPublicBase);
    const refNo = escapeHtml(row.RequestNo);
    const enqDate = formatEnquiryDate(row.EnquiryDate);

    return `<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
</head>
<body style="margin:0;padding:14px;font-family:${FONT_FAMILY};font-size:11pt;color:#1e293b;background:#ffffff;">
<p style="margin:0 0 6px 0;font-family:${FONT_FAMILY};">Dear Sir/Madam,</p>
<p style="margin:0 0 6px 0;font-family:${FONT_FAMILY};">Greetings !!!</p>
<p style="margin:0 0 6px 0;font-family:${FONT_FAMILY};font-size:11pt;line-height:1.4;">&nbsp;</p>
<p style="margin:0 0 14px 0;line-height:1.4;font-family:${FONT_FAMILY};">Please find given below, details pertaining to a customer Enquiry no. <b>${refNo}</b> on <b>${escapeHtml(enqDate)}</b>. Please report closure in Enquiry Management System.</p>
${buildEnquiryTable(rowDefs)}
<p style="margin:14px 0 6px 0;font-family:${FONT_FAMILY};font-size:11pt;line-height:1.4;">&nbsp;</p>
<p style="margin:0 0 10px 0;font-family:${FONT_FAMILY};">Best regards,</p>
<p style="margin:0;font-size:10pt;font-family:${FONT_FAMILY};color:#64748b;"><i>* This is an Auto Generated E-mail by Enquiry Management System *</i></p>
</body>
</html>`;
}

module.exports = {
    buildEnquiryNotifyEmailHtml,
    buildEnquiryDetailsTableHtml,
    buildEnquiryOutlookSubject,
    buildDocumentsReceivedItems,
    buildSupplementaryReceivedHtml,
    formatEnquiryDate,
    formatShortDate,
    FONT_FAMILY,
    PISTACHIO,
    PISTACHIO_BORDER,
};
