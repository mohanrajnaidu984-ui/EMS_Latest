import { getLeadJobDisplayLines, formatLeadJobLinesPlain } from '../../utils/leadJobDisplayLines';
import {
    getCustomerDisplayLines,
    getConsultantDisplayLines,
    getEnquiryTypeDisplay,
    getEnquiryDetailsDisplay,
    getCreatedByDivision,
} from '../../utils/enquiryResultsHelpers';
import {
    ExcelJS,
    CELL_FONT,
    THIN_BORDER,
    setupEmsExcelReportHeader,
    downloadExcelBlob,
    safeExcelFilePart,
} from '../../utils/emsExcelWorkbook';

const COLUMNS = [
    { key: 'requestNo', header: 'Enquiry No.', width: 12, type: 'text' },
    { key: 'enquiryDate', header: 'Enquiry Date', width: 13, type: 'date' },
    { key: 'project', header: 'Project', width: 36, type: 'text' },
    { key: 'divisions', header: 'Divisions & SE/EE/TE/QS Involved', width: 32, type: 'text' },
    { key: 'details', header: 'Enquiry Details', width: 40, type: 'text' },
    { key: 'customer', header: 'Customer Name / Contractor Name', width: 32, type: 'text' },
    { key: 'dueDate', header: 'Due Date', width: 12, type: 'date' },
    { key: 'siteVisitDate', header: 'Site Visit Date', width: 14, type: 'date' },
    { key: 'client', header: 'Client', width: 24, type: 'text' },
    { key: 'consultant', header: 'Consultant Name', width: 28, type: 'text' },
    { key: 'enquiryType', header: 'Enquiry Type', width: 16, type: 'text' },
    { key: 'source', header: 'Source', width: 16, type: 'text' },
    { key: 'status', header: 'Status', width: 12, type: 'text' },
    { key: 'createdBy', header: 'Created By', width: 18, type: 'text' },
    { key: 'createdDivision', header: 'Created division', width: 16, type: 'text' },
    { key: 'createdAt', header: 'Created Datetime', width: 18, type: 'datetime' }
];

function dash(v) {
    if (v == null) return '—';
    const s = String(v).trim();
    return s === '' || s === '-' ? '—' : s;
}

function toExcelDate(v) {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    return d;
}

function joinLines(lines) {
    if (!Array.isArray(lines) || lines.length === 0) return '—';
    const cleaned = lines.map((x) => String(x || '').trim()).filter((x) => x && x !== '-');
    return cleaned.length ? cleaned.join('\n') : '—';
}

function cellValue(col, row, users) {
    switch (col.key) {
        case 'requestNo':
            return dash(row.RequestNo);
        case 'enquiryDate':
            return toExcelDate(row.EnquiryDate);
        case 'project':
            return dash(row.ProjectName);
        case 'divisions':
            return dash(formatLeadJobLinesPlain(getLeadJobDisplayLines(row, { users })));
        case 'details':
            return dash(getEnquiryDetailsDisplay(row));
        case 'customer':
            return joinLines(getCustomerDisplayLines(row));
        case 'dueDate':
            return toExcelDate(row.DueOn ?? row.DueDate);
        case 'siteVisitDate':
            return toExcelDate(row.SiteVisitDate);
        case 'client':
            return dash(row.ClientName);
        case 'consultant':
            return joinLines(getConsultantDisplayLines(row));
        case 'enquiryType':
            return dash(getEnquiryTypeDisplay(row));
        case 'source':
            return dash(row.SourceOfInfo || row.SourceOfEnquiry || row.ReceivedFrom);
        case 'status':
            return dash(row.Status || 'Enquiry');
        case 'createdBy':
            return dash(row.CreatedBy);
        case 'createdDivision':
            return dash(getCreatedByDivision(row, users));
        case 'createdAt':
            return toExcelDate(row.CreatedAt);
        default:
            return '';
    }
}

/**
 * Build and download a formatted .xlsx of Search Enquiry results
 * (same workbook styling as Sales Report Jobs export).
 */
export async function downloadSearchEnquiryXlsx({ rows, users, meta = {} }) {
    const list = Array.isArray(rows) ? rows : [];
    if (list.length === 0) {
        throw new Error('No data to export');
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'EMS Search Enquiry';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Search Enquiry');

    const lastCol = COLUMNS.length;
    const metaParts = [
        meta.dateFrom && meta.dateTo ? `From: ${meta.dateFrom}  To: ${meta.dateTo}` : null,
        meta.searchQuery ? `Search: ${meta.searchQuery}` : null,
        `Rows: ${list.length}`,
        `Exported: ${new Date().toLocaleString('en-GB')}`
    ].filter(Boolean);
    const { dataStartRow } = await setupEmsExcelReportHeader(workbook, sheet, {
        lastCol,
        title: 'Enquiry Module | Search Enquiry',
        metaText: metaParts.join('  |  '),
        columns: COLUMNS
    });

    list.forEach((row, idx) => {
        const excelRow = sheet.getRow(dataStartRow + idx);
        COLUMNS.forEach((col, i) => {
            const cell = excelRow.getCell(i + 1);
            const raw = cellValue(col, row, users);
            cell.font = CELL_FONT;
            cell.border = THIN_BORDER;
            cell.alignment = {
                vertical: 'top',
                horizontal: 'left',
                wrapText: true
            };

            if (col.type === 'date') {
                if (raw instanceof Date) {
                    cell.value = raw;
                    cell.numFmt = 'dd-mmm-yy';
                } else {
                    cell.value = '—';
                }
            } else if (col.type === 'datetime') {
                if (raw instanceof Date) {
                    cell.value = raw;
                    cell.numFmt = 'dd-mmm-yy hh:mm:ss AM/PM';
                } else {
                    cell.value = '—';
                }
            } else {
                cell.value = raw;
            }
        });
    });

    COLUMNS.forEach((col, i) => {
        sheet.getColumn(i + 1).width = col.width;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `${safeExcelFilePart('Enquiry_Export')}_${stamp}.xlsx`;
    downloadExcelBlob(buffer, fileName);
    return fileName;
}
