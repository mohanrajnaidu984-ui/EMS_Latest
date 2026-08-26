import {
    ExcelJS,
    CELL_FONT,
    THIN_BORDER,
    setupEmsExcelReportHeader,
    downloadExcelBlob,
    safeExcelFilePart,
} from '../../utils/emsExcelWorkbook';

const STATUS_LABELS = {
    Pending: 'Pending',
    FollowUp: 'Follow Up',
    Won: 'Won',
    Lost: 'Lost',
    OnHold: 'On Hold',
    Cancelled: 'Cancelled',
    Retendered: 'Retendered'
};

const COLUMNS = [
    { key: 'sl', header: 'SL', width: 6, type: 'number' },
    { key: 'updatedAt', header: 'Last Updated', width: 16, type: 'datetime' },
    { key: 'enquiry', header: 'Enquiry', width: 12, type: 'text' },
    { key: 'projectName', header: 'Project Name', width: 36, type: 'text' },
    { key: 'customerName', header: 'Customer Name', width: 28, type: 'text' },
    { key: 'netQuoted', header: 'Net Quoted', width: 14, type: 'number' },
    { key: 'status', header: 'Status', width: 12, type: 'text' },
    { key: 'quoteType', header: 'Quote Type', width: 18, type: 'text' },
    { key: 'quoteRef', header: 'Quote Reference', width: 28, type: 'text' },
    { key: 'probability', header: 'Probability', width: 22, type: 'text' },
    { key: 'expectedDate', header: 'Expected Date', width: 13, type: 'date' },
    { key: 'grossMargin', header: 'Gross Margin %', width: 14, type: 'number' },
    { key: 'remarks', header: 'Remarks', width: 28, type: 'text' },
    { key: 'details', header: 'Details', width: 40, type: 'text' }
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

function statusLabel(raw) {
    const key = String(raw || '').trim();
    return STATUS_LABELS[key] || key || '—';
}

function flattenDetails(item) {
    const st = String(item?.Status || '').trim();
    const lines = [];
    if (st === 'Won') {
        if (item.WonJobNo) lines.push(`Job No: ${item.WonJobNo}`);
        if (item.WonOrderValue) lines.push(`Order Value: ${item.WonOrderValue}`);
        if (item.WonGrossProfit != null && item.WonGrossProfit !== '') lines.push(`GP %: ${item.WonGrossProfit}`);
        if (item.WonOption) lines.push(`Option: ${item.WonOption}`);
        if (item.LeadJobName) lines.push(`Lead Job: ${item.LeadJobName}`);
    } else if (st === 'Lost') {
        if (item.LostCompetitor) lines.push(`Lost To: ${item.LostCompetitor}`);
        if (item.LostReason) lines.push(`Reason: ${item.LostReason}`);
        if (item.LostCompetitorPrice) lines.push(`Competitor Price: ${item.LostCompetitorPrice}`);
        if (item.LostDate) {
            const d = toExcelDate(item.LostDate);
            lines.push(`Lost Date: ${d ? d.toLocaleDateString('en-GB') : item.LostDate}`);
        }
    } else if (st === 'OnHold' || st === 'Cancelled' || st === 'Retendered') {
        if (item.ProbabilityRemarks) lines.push(String(item.ProbabilityRemarks).trim());
    }
    return lines.length ? lines.join('\n') : '—';
}

function safeFilePart(s) {
    return safeExcelFilePart(s || 'Probability_Export');
}

/**
 * Download Probability list as formatted .xlsx (Sales Report style).
 * `enrichRow(item)` should return { customerName, quoteType, netQuoted, quoteRef, netRestricted }.
 */
export async function downloadProbabilityListXlsx({
    rows,
    viewModeLabel = 'Follow Up',
    meta = {},
    enrichRow
}) {
    const list = Array.isArray(rows) ? rows : [];
    if (list.length === 0) {
        throw new Error('No data to export');
    }

    const title = `Probability Module | ${viewModeLabel}`;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'EMS Probability';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(safeFilePart(viewModeLabel).slice(0, 31) || 'Probability');

    const lastCol = COLUMNS.length;
    const metaParts = [
        meta.division ? `Division: ${meta.division}` : null,
        meta.viewMode ? `View Mode: ${meta.viewMode}` : null,
        meta.searchQuery ? `Search: ${meta.searchQuery}` : null,
        meta.dateFrom && meta.dateTo ? `From: ${meta.dateFrom}  To: ${meta.dateTo}` : null,
        meta.probabilityFilter ? `Probability: ${meta.probabilityFilter}` : null,
        `Rows: ${list.length}`,
        `Exported: ${new Date().toLocaleString('en-GB')}`
    ].filter(Boolean);
    const { dataStartRow } = await setupEmsExcelReportHeader(workbook, sheet, {
        lastCol,
        title,
        metaText: metaParts.join('  |  '),
        columns: COLUMNS
    });

    list.forEach((item, idx) => {
        const enriched = typeof enrichRow === 'function' ? enrichRow(item) || {} : {};
        const values = {
            sl: idx + 1,
            updatedAt: toExcelDate(item.UpdatedDateTime),
            enquiry: dash(item.RequestNo),
            projectName: dash(item.ProjectName),
            customerName: dash(enriched.customerName),
            netQuoted: enriched.netRestricted
                ? 'Restricted'
                : enriched.netQuoted == null || Number.isNaN(Number(enriched.netQuoted))
                  ? null
                  : Number(enriched.netQuoted),
            status: statusLabel(item.Status),
            quoteType: dash(enriched.quoteType),
            quoteRef: dash(enriched.quoteRef),
            probability: dash(item.ProbabilityOption || item.ProbabilityChance),
            expectedDate: toExcelDate(item.ExpectedOrderDate),
            grossMargin: (() => {
                const v = item.GrossMargin ?? item.WonGrossProfit;
                if (v == null || v === '') return null;
                const n = Number(v);
                return Number.isNaN(n) ? null : n;
            })(),
            remarks: dash(item.ProbabilityRemarks),
            details: flattenDetails(item)
        };

        const excelRow = sheet.getRow(dataStartRow + idx);
        COLUMNS.forEach((col, i) => {
            const cell = excelRow.getCell(i + 1);
            const raw = values[col.key];
            cell.font = CELL_FONT;
            cell.border = THIN_BORDER;
            cell.alignment = {
                vertical: 'top',
                horizontal: col.type === 'number' && typeof raw === 'number' ? 'right' : 'left',
                wrapText: true
            };

            if (col.type === 'date' || col.type === 'datetime') {
                if (raw instanceof Date) {
                    cell.value = raw;
                    cell.numFmt = col.type === 'datetime' ? 'dd-mmm-yy hh:mm AM/PM' : 'dd-mmm-yy';
                } else {
                    cell.value = '—';
                }
            } else if (col.key === 'netQuoted') {
                if (raw === 'Restricted') {
                    cell.value = 'Restricted';
                } else if (typeof raw === 'number') {
                    cell.value = raw;
                    cell.numFmt = '#,##0.000';
                } else {
                    cell.value = '—';
                }
            } else if (col.key === 'grossMargin') {
                if (typeof raw === 'number') {
                    cell.value = raw;
                    cell.numFmt = '0.00';
                } else {
                    cell.value = '—';
                }
            } else if (col.type === 'number') {
                cell.value = typeof raw === 'number' ? raw : Number(raw) || 0;
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
    const fileName = `${safeFilePart(`Probability_${viewModeLabel}`)}_${stamp}.xlsx`;
    downloadExcelBlob(buffer, fileName);
    return fileName;
}

export const PROBABILITY_VIEW_MODE_LABELS = {
    All: 'ALL',
    Pending: 'Pending Update',
    Won: 'Won',
    Lost: 'Lost',
    FollowUp: 'Follow Up',
    OnHold: 'On Hold',
    Cancelled: 'Cancelled',
    Retendered: 'Retendered'
};
