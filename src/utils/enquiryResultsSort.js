import {
    getEnquiryTypeDisplay,
    getSourceOfInfoDisplay,
    getCreatedByDivision,
    getConsultantDisplayLines,
} from './enquiryResultsHelpers';

/**
 * Same column sort behaviour as Search Enquiry (excluding special "Default" due-date priority mode).
 */
export function sortEnquiryRows(rows, sortConfig, context = {}) {
    if (!sortConfig?.key) return [...rows];

    const users = context.users || [];

    const sortableItems = [...rows];
    sortableItems.sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];

        if (sortConfig.key === 'Customer') valA = a.SelectedCustomers?.join(', ') || a.CustomerName;
        if (sortConfig.key === 'Customer') valB = b.SelectedCustomers?.join(', ') || b.CustomerName;
        if (sortConfig.key === 'Consultant') valA = getConsultantDisplayLines(a).join(', ');
        if (sortConfig.key === 'Consultant') valB = getConsultantDisplayLines(b).join(', ');
        if (sortConfig.key === 'SE') valA = a.SelectedConcernedSEs?.join(', ') || a.ConcernedSE;
        if (sortConfig.key === 'SE') valB = b.SelectedConcernedSEs?.join(', ') || b.ConcernedSE;
        if (sortConfig.key === 'EnquiryType') valA = getEnquiryTypeDisplay(a);
        if (sortConfig.key === 'EnquiryType') valB = getEnquiryTypeDisplay(b);
        if (sortConfig.key === 'SourceOfInfo') valA = getSourceOfInfoDisplay(a);
        if (sortConfig.key === 'SourceOfInfo') valB = getSourceOfInfoDisplay(b);
        if (sortConfig.key === 'EnquiryDetails') valA = a.EnquiryDetails || a.DetailsOfEnquiry || '';
        if (sortConfig.key === 'EnquiryDetails') valB = b.EnquiryDetails || b.DetailsOfEnquiry || '';
        if (sortConfig.key === 'CreatedDivision') valA = getCreatedByDivision(a, users);
        if (sortConfig.key === 'CreatedDivision') valB = getCreatedByDivision(b, users);

        if (sortConfig.key === 'EnquiryDate' || sortConfig.key === 'DueOn' || sortConfig.key === 'SiteVisitDate' || sortConfig.key === 'CreatedAt') {
            if (sortConfig.key === 'DueOn') {
                valA = a.DueOn ?? a.DueDate;
                valB = b.DueOn ?? b.DueDate;
            }
            if (sortConfig.key === 'SiteVisitDate') {
                valA = a.SiteVisitDate;
                valB = b.SiteVisitDate;
            }
            if (sortConfig.key === 'CreatedAt') {
                valA = a.CreatedAt;
                valB = b.CreatedAt;
            }
            const d1 = valA ? new Date(valA).getTime() : 0;
            const d2 = valB ? new Date(valB).getTime() : 0;
            if (d1 !== d2) {
                return sortConfig.direction === 'asc' ? d1 - d2 : d2 - d1;
            }
            const n1 = parseInt(a.RequestNo, 10) || 0;
            const n2 = parseInt(b.RequestNo, 10) || 0;
            return sortConfig.direction === 'asc' ? n1 - n2 : n2 - n1;
        }

        if (sortConfig.key === 'RequestNo') {
            const n1 = parseInt(valA, 10) || 0;
            const n2 = parseInt(valB, 10) || 0;
            return sortConfig.direction === 'asc' ? n1 - n2 : n2 - n1;
        }

        valA = valA ? String(valA).toLowerCase() : '';
        valB = valB ? String(valB).toLowerCase() : '';

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;

        const nr1 = parseInt(a.RequestNo, 10) || 0;
        const nr2 = parseInt(b.RequestNo, 10) || 0;
        return nr2 - nr1;
    });

    return sortableItems;
}
