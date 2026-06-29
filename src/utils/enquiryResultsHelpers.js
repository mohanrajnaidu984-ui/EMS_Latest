const MONTHS_UPPER = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** DD-MMM-YY for enquiry list tables */
export function formatEnquiryResultDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return String(dateStr);

    const day = String(date.getDate()).padStart(2, '0');
    const month = MONTHS_UPPER[date.getMonth()];
    const year = String(date.getFullYear()).slice(-2);

    return `${day}-${month}-${year}`;
}

/** DD-MMM-YY HH:MM:SS AM/PM for quote digital signature stamps */
export function formatSignaturePlacedDateTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return String(dateStr);

    const day = String(date.getDate()).padStart(2, '0');
    const month = MONTHS_UPPER[date.getMonth()];
    const year = String(date.getFullYear()).slice(-2);

    const h24 = date.getHours();
    const ampm = h24 >= 12 ? 'PM' : 'AM';
    let h12 = h24 % 12;
    if (h12 === 0) h12 = 12;
    const hours = String(h12).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${day}-${month}-${year} ${hours}:${minutes}:${seconds} ${ampm}`;
}

/** One line per consultant when multiple are linked to an enquiry */
export function getConsultantDisplayLines(row) {
    if (Array.isArray(row.SelectedConsultants) && row.SelectedConsultants.length > 0) {
        return row.SelectedConsultants.map((x) => String(x || '').trim()).filter(Boolean);
    }
    const legacy = String(row.ConsultantName || '').trim();
    if (legacy) {
        return legacy.split(',').map((x) => x.trim()).filter(Boolean);
    }
    return ['-'];
}

/** One line per customer when multiple are linked to an enquiry */
export function getCustomerDisplayLines(row) {
    if (Array.isArray(row.SelectedCustomers) && row.SelectedCustomers.length > 0) {
        return row.SelectedCustomers.map((x) => String(x || '').trim()).filter(Boolean);
    }
    const c = String(row.CustomerName || '').trim();
    return c ? [c] : ['-'];
}

export function getEnquiryTypeDisplay(row) {
    if (Array.isArray(row.SelectedEnquiryTypes) && row.SelectedEnquiryTypes.length > 0) {
        return row.SelectedEnquiryTypes.map((x) => String(x || '').trim()).filter(Boolean).join(', ');
    }
    const t = String(row.EnquiryType || '').trim();
    return t || '-';
}

export function getEnquiryDetailsDisplay(row) {
    const t = String(row.EnquiryDetails ?? row.DetailsOfEnquiry ?? '').trim();
    return t || '-';
}

/** Source column — dashboard API uses SourceOfInfo alias; legacy rows may only have SourceOfEnquiry or ReceivedFrom */
export function getSourceOfInfoDisplay(row) {
    const s = String(row.SourceOfInfo ?? row.SourceOfEnquiry ?? row.ReceivedFrom ?? '').trim();
    return s || '-';
}

/** Division (Department) of the user who created the enquiry (EnquiryMaster.CreatedBy → Master_ConcernedSE). */
export function getCreatedByDivision(row, users) {
    const createdBy = String(row?.CreatedBy || '').trim();
    if (!createdBy) return '-';
    const norm = (s) => String(s || '').trim().toLowerCase();
    const user = (users || []).find((u) => norm(u.FullName) === norm(createdBy));
    const dept = String(user?.Department || '').trim();
    return dept || '-';
}

/** EnquiryMaster.CreatedAt for list tables (date + time). */
export function formatEnquiryCreatedDateTime(dateStr) {
    return formatSignaturePlacedDateTime(dateStr) || '-';
}

/** Edit icon only for enquiry creator */
export function attachCanEditFlag(rows, currentUser) {
    const name = (currentUser?.name || '').trim().toLowerCase();
    return (rows || []).map((r) => ({
        ...r,
        _canEdit: !!(r.CreatedBy && name && r.CreatedBy.trim().toLowerCase() === name),
    }));
}
