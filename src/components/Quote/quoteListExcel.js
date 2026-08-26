import {
    ExcelJS,
    CELL_FONT,
    THIN_BORDER,
    setupEmsExcelReportHeader,
    downloadExcelBlob,
    safeExcelFilePart,
} from '../../utils/emsExcelWorkbook';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function normalizeListQuoteRollupKey(raw) {
    let s = String(raw || '').trim();
    if (s === 'All Quoted' || s === 'Partial Quoted' || s === 'None Quoted') return s;
    const base = s.replace(/\s*\([^)]*\)\s*$/g, '').trim();
    if (base === 'All Quoted' || base === 'Partial Quoted' || base === 'None Quoted') return base;
    return 'None Quoted';
}

function formatListQuoteRollupStatusTwoLines(raw) {
    const key = normalizeListQuoteRollupKey(raw);
    const tail = 'for this Ownjob';
    if (key === 'None Quoted') return { line1: 'None Quoted', line2: tail };
    if (key === 'Partial Quoted') return { line1: 'Partial Quoted', line2: tail };
    if (key === 'All Quoted') return { line1: 'All Quoted', line2: tail };
    return { line1: 'None Quoted', line2: tail };
}

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

function formatQuoteDateShort(v) {
    const d = toExcelDate(v);
    if (!d) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const mon = MONTHS[d.getMonth()];
    const yyyy = d.getFullYear();
    return `${day}-${mon}-${yyyy}`;
}

function formatBd(n) {
    const num = Number(n);
    if (!Number.isFinite(num) || num <= 0) return '';
    return `BD ${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function enquiryNoText(row) {
    const no = dash(row.RequestNo);
    const st = formatListQuoteRollupStatusTwoLines(row.ListQuoteRollupStatus);
    if (!st) return no;
    return `${no}\n${st.line1}${st.line2 ? `\n${st.line2}` : ''}`;
}

function quoteDetailsText(row) {
    if (Array.isArray(row.ListQuoteDetailLines) && row.ListQuoteDetailLines.length > 0) {
        return row.ListQuoteDetailLines.map((ln) => {
            const parts = [String(ln.textLine || '').trim()].filter(Boolean);
            const bd = formatBd(ln.bdTotal);
            if (bd) parts.push(bd);
            const prep = String(ln.preparedBy ?? ln.PreparedBy ?? '').trim();
            if (prep) parts.push(prep);
            return parts.join('  ');
        }).join('\n');
    }

    const toName = String(row.ListQuoteDetailToName ?? '').trim() || '—';
    if (Array.isArray(row.ListMultiLeadQuoteRefs) && row.ListMultiLeadQuoteRefs.length > 0) {
        const joined = row.ListMultiLeadQuoteRefs.map(
            (line) => `${toName} (${line.quoteNumber} - ${formatQuoteDateShort(line.quoteDate)})`
        ).join('\n');
        const parts = [joined];
        const bd = formatBd(row.ListQuoteUnderRefTotal);
        if (bd) parts.push(bd);
        const prep = String(
            row.ListPreparedBy ||
                row.ListMultiLeadQuoteRefs.map((r) => r.preparedBy).filter(Boolean).join(', ') ||
                ''
        ).trim();
        if (prep) parts.push(prep);
        return parts.join('\n');
    }

    const ref = String(row.ListQuoteRef || '').trim();
    const dt = formatQuoteDateShort(row.ListQuoteDate);
    let line = toName;
    if (ref || dt) line += ` (${[ref, dt].filter(Boolean).join(' - ')})`;
    const parts = [line];
    const bd = formatBd(row.ListQuoteUnderRefTotal);
    if (bd) parts.push(bd);
    const prep = String(row.ListPreparedBy || '').trim();
    if (prep) parts.push(prep);
    return parts.join('\n');
}

const COLUMNS = [
    { key: 'requestNo', header: 'Enquiry No.', width: 18, type: 'text' },
    { key: 'projectName', header: 'Project Name', width: 40, type: 'text' },
    { key: 'quoteDetails', header: 'To Customer and Quote details', width: 52, type: 'text' },
    { key: 'dueDate', header: 'Due Date', width: 13, type: 'date' },
    { key: 'consultantName', header: 'Consultant Name', width: 28, type: 'text' }
];

function cellValue(col, row) {
    switch (col.key) {
        case 'requestNo':
            return enquiryNoText(row);
        case 'projectName':
            return dash(row.ProjectName);
        case 'quoteDetails':
            return quoteDetailsText(row) || '—';
        case 'dueDate':
            return toExcelDate(row.DueDate);
        case 'consultantName':
            return dash(row.ConsultantName || row.consultantName);
        default:
            return '';
    }
}

function safeFilePart(s) {
    return safeExcelFilePart(s || 'Quote_Export');
}

/**
 * Download Quote list (Pending Updates / Search Quote) as formatted .xlsx.
 */
export async function downloadQuoteListXlsx({ rows, mode = 'pending', meta = {} }) {
    const list = Array.isArray(rows) ? rows : [];
    if (list.length === 0) {
        throw new Error('No data to export');
    }

    const isSearch = mode === 'search';
    const sectionLabel = isSearch ? 'Search Quote' : 'Pending Updates';
    const title = `Quote Module | ${sectionLabel}`;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'EMS Quote';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(safeFilePart(sectionLabel).slice(0, 31) || 'Quotes');

    const lastCol = COLUMNS.length;
    const metaParts = [
        meta.division ? `Division: ${meta.division}` : null,
        meta.category ? `Category: ${meta.category}` : null,
        meta.searchQuery ? `Criteria: ${meta.searchQuery}` : null,
        meta.dateFrom && meta.dateTo ? `From: ${meta.dateFrom}  To: ${meta.dateTo}` : null,
        `Rows: ${list.length}`,
        `Exported: ${new Date().toLocaleString('en-GB')}`
    ].filter(Boolean);
    const { dataStartRow } = await setupEmsExcelReportHeader(workbook, sheet, {
        lastCol,
        title,
        metaText: metaParts.join('  |  '),
        columns: COLUMNS,
        getHeaderAlignment: () => ({ vertical: 'middle', horizontal: 'left', wrapText: true })
    });

    list.forEach((row, idx) => {
        const excelRow = sheet.getRow(dataStartRow + idx);
        COLUMNS.forEach((col, i) => {
            const cell = excelRow.getCell(i + 1);
            const raw = cellValue(col, row);
            cell.font = CELL_FONT;
            cell.border = THIN_BORDER;
            cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
            if (col.type === 'date') {
                if (raw instanceof Date) {
                    cell.value = raw;
                    cell.numFmt = 'dd-mmm-yy';
                } else {
                    cell.value = '—';
                }
            } else {
                cell.value = raw;
            }
        });
        const detailLines = String(cellValue(COLUMNS[2], row) || '').split('\n').length;
        excelRow.height = Math.min(100, Math.max(18, 14 + detailLines * 12));
    });

    COLUMNS.forEach((col, i) => {
        sheet.getColumn(i + 1).width = col.width;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `${safeFilePart(isSearch ? 'Quote_Search' : 'Quote_Pending')}_${stamp}.xlsx`;
    downloadExcelBlob(buffer, fileName);
    return fileName;
}
