import {
    ExcelJS,
    CELL_FONT,
    THIN_BORDER,
    setupEmsExcelReportHeader,
    enableEmsExcelAutoFilter,
    downloadExcelBlob,
    safeExcelFilePart,
} from '../../utils/emsExcelWorkbook';
import {
    getCurrencyMeta,
    getRuntimeCurrency,
    getRuntimeCurrencyCode,
} from '../../utils/currency';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Excel number format like `"BHD "#,##0.000` so the cell stays numeric for sums/filters. */
function quotedValueExcelNumFmt(currencyCode) {
    const meta = getCurrencyMeta(currencyCode || getRuntimeCurrency());
    const decimals = Math.max(0, Math.min(6, Number(meta.decimals) || 3));
    const frac = decimals > 0 ? `.${'0'.repeat(decimals)}` : '';
    const code = String(meta.code || getRuntimeCurrencyCode() || 'BHD').replace(/"/g, '');
    return `"${code} "#,##0${frac}`;
}

/** Parse a quoted amount to a finite number, or null when empty/not quoted. */
function toQuotedAmount(n) {
    if (n == null || n === '') return null;
    if (typeof n === 'number') {
        return Number.isFinite(n) && n > 0 ? n : null;
    }
    const cleaned = String(n)
        .replace(/,/g, '')
        .replace(/[A-Za-z]+\s*/g, '')
        .trim();
    const num = Number(cleaned);
    if (!Number.isFinite(num) || num <= 0) return null;
    return num;
}

function normalizeListQuoteRollupKey(raw) {
    let s = String(raw || '').trim();
    if (s === 'Revision Required') return s;
    if (s === 'All Quoted' || s === 'Partial Quoted' || s === 'None Quoted') return s;
    const base = s.replace(/\s*\([^)]*\)\s*$/g, '').trim();
    if (base === 'Revision Required') return base;
    if (base === 'All Quoted' || base === 'Partial Quoted' || base === 'None Quoted') return base;
    return 'None Quoted';
}

function formatListQuoteRollupStatusTwoLines(raw) {
    const key = normalizeListQuoteRollupKey(raw);
    const tail = 'for this Ownjob';
    if (key === 'Revision Required') return { line1: 'Revision Required', line2: '' };
    if (key === 'None Quoted') return { line1: 'None Quoted', line2: tail };
    if (key === 'Partial Quoted') return { line1: 'Partial Quoted', line2: tail };
    if (key === 'All Quoted') return { line1: 'All Quoted', line2: tail };
    return { line1: 'None Quoted', line2: tail };
}

/** Empty cells stay blank (not "—") so Excel keeps number/date types usable. */
function textOrBlank(v) {
    if (v == null) return '';
    const s = String(v).trim();
    if (s === '' || s === '-' || s === '—') return '';
    return s;
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

function enquiryNoText(row) {
    const no = textOrBlank(row.RequestNo);
    const st = formatListQuoteRollupStatusTwoLines(row.ListQuoteRollupStatus);
    if (!no && !st) return '';
    if (!st) return no;
    return `${no}\n${st.line1}${st.line2 ? `\n${st.line2}` : ''}`.trim();
}

/**
 * Expand one list enquiry into one Excel row per customer/quote line.
 * Quoted Value and Concern SE are separate columns (not embedded in quote details).
 */
function expandEnquiryRowsForExcel(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const out = [];

    for (const row of list) {
        const base = {
            RequestNo: row.RequestNo,
            ListQuoteRollupStatus: row.ListQuoteRollupStatus,
            ProjectName: row.ProjectName,
            DueDate: row.DueDate,
            ConsultantName: row.ConsultantName || row.consultantName,
        };

        if (Array.isArray(row.ListQuoteDetailLines) && row.ListQuoteDetailLines.length > 0) {
            for (const ln of row.ListQuoteDetailLines) {
                out.push({
                    ...base,
                    excelQuoteDetails: textOrBlank(ln.textLine),
                    excelQuotedValue: toQuotedAmount(ln.bdTotal),
                    excelConcernSe: textOrBlank(ln.preparedBy ?? ln.PreparedBy),
                });
            }
            continue;
        }

        const toName = textOrBlank(row.ListQuoteDetailToName);

        if (Array.isArray(row.ListMultiLeadQuoteRefs) && row.ListMultiLeadQuoteRefs.length > 0) {
            const refs = row.ListMultiLeadQuoteRefs;
            refs.forEach((line, idx) => {
                const qn = String(line.quoteNumber || '').trim();
                const dt = formatQuoteDateShort(line.quoteDate);
                const paren = [qn, dt].filter(Boolean).join(' - ');
                const details = paren
                    ? `${toName || ''}${toName ? ' ' : ''}(${paren})`.trim()
                    : toName;
                const linePrep = textOrBlank(line.preparedBy ?? line.PreparedBy);
                const rowPrep = textOrBlank(row.ListPreparedBy);
                /* Quoted value lives once on the enquiry rollup — put it on the first expanded line only. */
                out.push({
                    ...base,
                    excelQuoteDetails: details,
                    excelQuotedValue:
                        idx === 0 ? toQuotedAmount(row.ListQuoteUnderRefTotal) : null,
                    excelConcernSe: linePrep || rowPrep,
                });
            });
            continue;
        }

        const ref = String(row.ListQuoteRef || '').trim();
        const dt = formatQuoteDateShort(row.ListQuoteDate);
        let details = toName;
        if (ref || dt) {
            const paren = [ref, dt].filter(Boolean).join(' - ');
            details = `${toName || ''}${toName ? ' ' : ''}(${paren})`.trim();
        }

        out.push({
            ...base,
            excelQuoteDetails: details,
            excelQuotedValue: toQuotedAmount(row.ListQuoteUnderRefTotal),
            excelConcernSe: textOrBlank(row.ListPreparedBy),
        });
    }

    return out;
}

const COLUMNS = [
    { key: 'requestNo', header: 'Enquiry No.', width: 18, type: 'text' },
    { key: 'projectName', header: 'Project Name', width: 40, type: 'text' },
    { key: 'quoteDetails', header: 'To Customer and Quote details', width: 48, type: 'text' },
    { key: 'quotedValue', header: 'Quoted Value', width: 18, type: 'number' },
    { key: 'concernSe', header: 'Concern SE', width: 22, type: 'text' },
    { key: 'dueDate', header: 'Due Date', width: 13, type: 'date' },
    { key: 'consultantName', header: 'Consultant Name', width: 28, type: 'text' },
];

function cellValue(col, row) {
    switch (col.key) {
        case 'requestNo':
            return enquiryNoText(row);
        case 'projectName':
            return textOrBlank(row.ProjectName);
        case 'quoteDetails':
            return textOrBlank(row.excelQuoteDetails);
        case 'quotedValue':
            return toQuotedAmount(row.excelQuotedValue);
        case 'concernSe':
            return textOrBlank(row.excelConcernSe);
        case 'dueDate':
            return toExcelDate(row.DueDate);
        case 'consultantName':
            return textOrBlank(row.ConsultantName || row.consultantName);
        default:
            return '';
    }
}

function safeFilePart(s) {
    return safeExcelFilePart(s || 'Quote_Export');
}

/**
 * Download Quote list (Pending Updates / Search Quote) as formatted .xlsx.
 * Multi-customer enquiries are expanded to one Excel row per customer/quote line.
 */
export async function downloadQuoteListXlsx({ rows, mode = 'pending', meta = {} }) {
    const source = Array.isArray(rows) ? rows : [];
    if (source.length === 0) {
        throw new Error('No data to export');
    }

    const list = expandEnquiryRowsForExcel(source);

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
        `Exported: ${new Date().toLocaleString('en-GB')}`,
    ].filter(Boolean);
    const { headerRowIndex, dataStartRow } = await setupEmsExcelReportHeader(workbook, sheet, {
        lastCol,
        title,
        metaText: metaParts.join('  |  '),
        columns: COLUMNS,
        getHeaderAlignment: () => ({ vertical: 'middle', horizontal: 'left', wrapText: true }),
    });

    const currencyCode = meta.currency || getRuntimeCurrency();
    const quotedValueFmt = quotedValueExcelNumFmt(currencyCode);

    list.forEach((row, idx) => {
        const excelRow = sheet.getRow(dataStartRow + idx);
        COLUMNS.forEach((col, i) => {
            const cell = excelRow.getCell(i + 1);
            const raw = cellValue(col, row);
            cell.font = CELL_FONT;
            cell.border = THIN_BORDER;
            cell.alignment = {
                vertical: 'top',
                horizontal: col.type === 'number' ? 'right' : 'left',
                wrapText: true,
            };
            if (col.type === 'date') {
                if (raw instanceof Date) {
                    cell.value = raw;
                    cell.numFmt = 'dd-mmm-yy';
                } else {
                    cell.value = null;
                }
            } else if (col.key === 'quotedValue') {
                if (typeof raw === 'number' && Number.isFinite(raw)) {
                    cell.value = raw;
                    cell.numFmt = quotedValueFmt;
                } else {
                    cell.value = null;
                }
            } else {
                cell.value = raw === '' || raw == null ? null : raw;
            }
        });
        const enquiryLines = String(cellValue(COLUMNS[0], row) || '').split('\n').length;
        excelRow.height = Math.min(60, Math.max(18, 14 + enquiryLines * 12));
    });

    COLUMNS.forEach((col, i) => {
        sheet.getColumn(i + 1).width = col.width;
    });

    enableEmsExcelAutoFilter(sheet, {
        headerRowIndex,
        lastCol,
        lastDataRow: dataStartRow + list.length - 1,
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `${safeFilePart(isSearch ? 'Quote_Search' : 'Quote_Pending')}_${stamp}.xlsx`;
    downloadExcelBlob(buffer, fileName);
    return fileName;
}
