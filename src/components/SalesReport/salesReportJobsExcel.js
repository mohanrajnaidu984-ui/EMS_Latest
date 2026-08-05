import ExcelJSModule from 'exceljs';

const ExcelJS = ExcelJSModule?.Workbook ? ExcelJSModule : ExcelJSModule?.default || ExcelJSModule;

const TOP_JOB_QUOTE_TYPE_STATUSES = new Set(['Quoted', 'Won', 'Lost', 'Follow Up']);
const TOP_JOB_PROB_QUOTE_REF_DATE_STATUSES = new Set(['Won', 'Lost', 'Follow Up']);

const HEADER_FILL = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF20396D' }
};
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10, name: 'Calibri' };
const TITLE_FONT = { bold: true, size: 13, name: 'Calibri', color: { argb: 'FF20396D' } };
const META_FONT = { size: 9, name: 'Calibri', color: { argb: 'FF4B5563' } };
const CELL_FONT = { size: 10, name: 'Calibri' };
const THIN_BORDER = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
};

function dash(v) {
    if (v == null) return '—';
    const s = String(v).trim();
    return s === '' ? '—' : s;
}

function toExcelDate(v) {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    return d;
}

function formatExactAmount(num) {
    const n = Number(num);
    if (Number.isNaN(n)) return 0;
    return n;
}

function formatWonGrossProfitText(row) {
    const jv = Number(row.JobValue) || 0;
    const gpPctRaw = row.WonGrossProfit;
    if (gpPctRaw === null || gpPctRaw === undefined || gpPctRaw === '') return '—';
    const gpPct = Number(gpPctRaw);
    if (Number.isNaN(gpPct)) return '—';
    const gpVal = jv * (gpPct / 100);
    return `${gpVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${Math.round(gpPct)}%)`;
}

function pendingStatusLabel(row, headingLabel) {
    const st = String(row.Status || '').trim().toLowerCase();
    if (st === 'pending') return 'Pending to update Probability';
    return dash(row.Status || headingLabel);
}

/**
 * Column defs matching Jobs table headers (chart column omitted).
 * Each: { key, header, width, type: 'text'|'number'|'date' }
 */
export function getJobsExportColumns(topJobStatus, tableConfig) {
    const cfg = tableConfig || {};
    const cols = [
        { key: 'slNo', header: 'Sl.No.', width: 8, type: 'number' },
        { key: 'requestNo', header: 'Enquiry No.', width: 12, type: 'text' },
        { key: 'projectName', header: 'Project Name', width: 36, type: 'text' },
        { key: 'customerName', header: 'Customer Name', width: 32, type: 'text' },
        { key: 'jobValue', header: cfg.valueHeader || 'Value', width: 16, type: 'number' }
    ];

    if (topJobStatus === 'Quoted') {
        cols.push(
            { key: 'quoteRef', header: cfg.metricHeader || 'Quote Ref', width: 28, type: 'text' },
            { key: 'quoteDate', header: 'Quote Date', width: 12, type: 'date' },
            { key: 'leadJob', header: 'Lead Job Name', width: 22, type: 'text' }
        );
    } else if (topJobStatus === 'Won') {
        cols.push(
            { key: 'metric', header: cfg.metricHeader || 'Gross Profit (%)', width: 20, type: 'text' },
            { key: 'bookedDate', header: 'Booked Date', width: 12, type: 'date' }
        );
    } else if (topJobStatus === 'Lost') {
        cols.push(
            { key: 'metric', header: cfg.metricHeader || 'Lost To Whom', width: 24, type: 'text' },
            { key: 'lostDate', header: 'Lost Date', width: 12, type: 'date' }
        );
    } else if (topJobStatus === 'Follow Up') {
        cols.push(
            { key: 'metric', header: cfg.metricHeader || 'Chance %', width: 12, type: 'text' },
            { key: 'expectedDate', header: 'Expected Date', width: 12, type: 'date' }
        );
    } else if (topJobStatus === 'Pending') {
        cols.push(
            { key: 'quoteRef', header: 'Quote Ref', width: 28, type: 'text' },
            { key: 'quoteDate', header: 'Quote Date', width: 12, type: 'date' },
            { key: 'metric', header: cfg.metricHeader || 'Status', width: 28, type: 'text' }
        );
    } else {
        cols.push({ key: 'metric', header: cfg.metricHeader || 'Status', width: 20, type: 'text' });
    }

    if (TOP_JOB_PROB_QUOTE_REF_DATE_STATUSES.has(topJobStatus)) {
        cols.push(
            { key: 'quoteRef', header: 'Quote Ref', width: 28, type: 'text' },
            { key: 'quoteDate', header: 'Quote Date', width: 12, type: 'date' }
        );
    }

    cols.push(
        { key: 'clientName', header: 'Client Name', width: 28, type: 'text' },
        { key: 'consultantName', header: 'Consultant Name', width: 28, type: 'text' }
    );

    if (TOP_JOB_QUOTE_TYPE_STATUSES.has(topJobStatus)) {
        cols.push({ key: 'quoteType', header: 'Quote Type', width: 14, type: 'text' });
    }

    cols.push({ key: 'concernSe', header: 'Concern SE/EE/TE/QS', width: 28, type: 'text' });

    if (cfg.extraHeader) {
        cols.push({ key: 'extra', header: cfg.extraHeader, width: 32, type: 'text' });
    }

    return cols;
}

function cellValueForRow(col, row, idx, topJobStatus, headingLabel) {
    switch (col.key) {
        case 'slNo':
            return idx + 1;
        case 'requestNo':
            return dash(row.RequestNo || row.EnquiryNo);
        case 'projectName':
            return dash(row.ProjectName);
        case 'customerName':
            return dash(row.CustomerName);
        case 'jobValue': {
            const n = Number(row.JobValue);
            return Number.isNaN(n) ? 0 : n;
        }
        case 'quoteRef':
            return dash(row.QuoteRef);
        case 'quoteDate':
            return toExcelDate(row.QuoteDate);
        case 'leadJob':
            return dash(row.LeadJob);
        case 'bookedDate':
            return toExcelDate(row.BookedDate);
        case 'lostDate':
            return toExcelDate(row.LostDate);
        case 'expectedDate':
            return toExcelDate(row.ExpectedDate);
        case 'clientName':
            return dash(row.ClientName);
        case 'consultantName':
            return dash(row.ConsultantName);
        case 'quoteType':
            return dash(row.QuoteType);
        case 'concernSe':
            return dash(row.ConcernSEEEQS);
        case 'extra':
            return dash(row.ReasonForLost || row.FollowUpRemarks);
        case 'metric':
            if (topJobStatus === 'Won') return formatWonGrossProfitText(row);
            if (topJobStatus === 'Lost') return dash(row.LostToWhom || row.CustomerName);
            if (topJobStatus === 'Follow Up') return dash(row.ProbabilityChance);
            if (topJobStatus === 'Pending') return pendingStatusLabel(row, headingLabel);
            if (topJobStatus === 'Quoted') return dash(row.QuoteRef);
            return dash(row.Status || headingLabel);
        default:
            return '';
    }
}

function safeFilePart(s) {
    return String(s || 'Jobs')
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 80);
}

/**
 * Build and download a formatted .xlsx of the Jobs table (filtered rows).
 */
export async function downloadJobsTableXlsx({
    rows,
    topJobStatus,
    tableConfig,
    headingLabel,
    meta = {}
}) {
    const list = Array.isArray(rows) ? rows : [];
    if (list.length === 0) {
        throw new Error('No data to export');
    }

    const columns = getJobsExportColumns(topJobStatus, tableConfig);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'EMS Sales Report';
    workbook.created = new Date();

    const sheetName = safeFilePart(`Jobs_${headingLabel || topJobStatus}`).slice(0, 31) || 'Jobs';
    const sheet = workbook.addWorksheet(sheetName, {
        views: [{ state: 'frozen', ySplit: 3 }]
    });

    const lastCol = columns.length;
    const title = `Jobs (${headingLabel || topJobStatus})`;
    sheet.mergeCells(1, 1, 1, lastCol);
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = title;
    titleCell.font = TITLE_FONT;
    titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
    sheet.getRow(1).height = 22;

    const metaParts = [
        meta.year ? `Year: ${meta.year}` : null,
        meta.company ? `Company: ${meta.company}` : null,
        meta.division ? `Division: ${meta.division}` : null,
        meta.role ? `Role: ${meta.role}` : null,
        `Rows: ${list.length}`,
        `Exported: ${new Date().toLocaleString('en-GB')}`
    ].filter(Boolean);
    sheet.mergeCells(2, 1, 2, lastCol);
    const metaCell = sheet.getCell(2, 1);
    metaCell.value = metaParts.join('  |  ');
    metaCell.font = META_FONT;
    metaCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    sheet.getRow(2).height = 18;

    const headerRow = sheet.getRow(3);
    columns.forEach((col, i) => {
        const cell = headerRow.getCell(i + 1);
        cell.value = col.header;
        cell.fill = HEADER_FILL;
        cell.font = HEADER_FONT;
        cell.border = THIN_BORDER;
        cell.alignment = {
            vertical: 'middle',
            horizontal: col.type === 'number' ? 'right' : 'left',
            wrapText: true
        };
    });
    headerRow.height = 20;

    list.forEach((row, idx) => {
        const excelRow = sheet.getRow(4 + idx);
        columns.forEach((col, i) => {
            const cell = excelRow.getCell(i + 1);
            const raw = cellValueForRow(col, row, idx, topJobStatus, headingLabel);
            cell.font = CELL_FONT;
            cell.border = THIN_BORDER;
            cell.alignment = {
                vertical: 'middle',
                horizontal: col.type === 'number' ? 'right' : 'left',
                wrapText: true
            };

            if (col.type === 'date') {
                if (raw instanceof Date) {
                    cell.value = raw;
                    cell.numFmt = 'dd-mmm-yy';
                } else {
                    cell.value = '—';
                }
            } else if (col.type === 'number' && col.key === 'jobValue') {
                cell.value = formatExactAmount(raw);
                cell.numFmt = '#,##0.00';
            } else if (col.type === 'number') {
                cell.value = typeof raw === 'number' ? raw : Number(raw) || 0;
            } else {
                cell.value = raw;
            }
        });
    });

    // Totals row
    const totalRowIdx = 4 + list.length;
    const totalRow = sheet.getRow(totalRowIdx);
    const valueColIdx = columns.findIndex((c) => c.key === 'jobValue') + 1;
    columns.forEach((col, i) => {
        const cell = totalRow.getCell(i + 1);
        cell.font = { ...CELL_FONT, bold: true };
        cell.border = THIN_BORDER;
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE8EEF7' }
        };
        if (col.key === 'projectName') {
            const distinct = new Set(
                list.map((r) => String(r.RequestNo || r.EnquiryNo || '').trim()).filter(Boolean)
            );
            cell.value = `${distinct.size || list.length} project${(distinct.size || list.length) === 1 ? '' : 's'}`;
        } else if (col.key === 'customerName') {
            cell.value = 'Total';
        } else if (col.key === 'jobValue' && valueColIdx > 0) {
            cell.value = { formula: `SUM(${sheet.getColumn(valueColIdx).letter}4:${sheet.getColumn(valueColIdx).letter}${totalRowIdx - 1})` };
            cell.numFmt = '#,##0.00';
            cell.alignment = { horizontal: 'right', vertical: 'middle' };
        } else {
            cell.value = '';
        }
    });

    columns.forEach((col, i) => {
        sheet.getColumn(i + 1).width = col.width;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `${safeFilePart(`Jobs_${headingLabel || topJobStatus}`)}_${stamp}.xlsx`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    return fileName;
}
