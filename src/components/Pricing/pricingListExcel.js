import {
    ExcelJS,
    CELL_FONT,
    THIN_BORDER,
    setupEmsExcelReportHeader,
    downloadExcelBlob,
    safeExcelFilePart,
} from '../../utils/emsExcelWorkbook';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

function formatDisplayDateTime(v) {
    const d = toExcelDate(v);
    if (!d) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const mon = MONTHS[d.getMonth()];
    const yy = String(d.getFullYear()).slice(-2);
    let h = d.getHours();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    const hh = String(h).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${day}-${mon}-${yy} ${hh}:${mm} ${ampm}`;
}

function formatAmt(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return '';
    return num.toLocaleString(undefined, { minimumFractionDigits: 2 });
}

function tryParsePricingListDisplay(enq) {
    const raw = enq?.PricingListDisplayJson ?? enq?.pricingListDisplayJson;
    if (!raw || typeof raw !== 'string') return null;
    try {
        const o = JSON.parse(raw);
        if (!o || !Array.isArray(o.customerTotals) || !Array.isArray(o.jobForest)) return null;
        return o;
    } catch {
        return null;
    }
}

function parseSubJobPriceRow(s, index) {
    const parts = String(s).split('|');
    return {
        key: `p-${index}`,
        name: parts[0] ?? '',
        rawPrice: parts[1] ?? '',
        rawDate: parts[2] ?? '',
        level: parseInt(parts[3], 10) || 0
    };
}

function splitSubJobPricesForListColumns(subJobPricesStr) {
    const rows = (subJobPricesStr || '')
        .split(';;')
        .filter(Boolean)
        .map(parseSubJobPriceRow);
    const hasIndented = rows.some((r) => r.level > 0);
    return {
        customerAndTotalRows: hasIndented ? rows.filter((r) => r.level === 0) : rows,
        individualRows: hasIndented ? rows.filter((r) => r.level > 0) : []
    };
}

function formatSpecStatusText(enq) {
    const raw = enq?.UserSpecPricingSummaryStatus ?? enq?.userSpecPricingSummaryStatus;
    if (!raw) return '';
    if (raw === 'None Priced') return 'None Priced for Ownjob';
    if (raw === 'Partial Priced') return 'Partial Priced for Ownjob';
    if (raw === 'All Quoted') return 'All Quoted for this Ownjob';
    if (raw === 'All Priced') return 'All Priced for Ownjob';
    return String(raw);
}

function flattenCustomerTotals(items) {
    if (!items || !items.length) return '—';
    return items
        .map((it) => {
            const declined = !!it.declinedToQuote;
            const total = Number(it.total);
            const has = !declined && Number.isFinite(total) && total > 0;
            const badge = declined ? 'Decline to Quote' : has ? `BD ${formatAmt(total)}` : 'Not Updated';
            const when = (has || declined) && it.updatedAt ? ` (${formatDisplayDateTime(it.updatedAt)})` : '';
            return `${String(it.label || '').trim()}: ${badge}${when}`;
        })
        .join('\n');
}

function flattenLegacyPriceRows(rows) {
    if (!rows || !rows.length) return '—';
    return rows
        .map((row) => {
            const isUpdated =
                row.rawPrice && row.rawPrice !== 'Not Updated' && parseFloat(row.rawPrice) > 0;
            let displayPrice = row.rawPrice;
            if (isUpdated) {
                const num = parseFloat(row.rawPrice);
                if (!Number.isNaN(num)) displayPrice = formatAmt(num);
            }
            const indent = row.level > 0 ? `${'  '.repeat(row.level)}→ ` : '';
            const badge = isUpdated ? `BD ${displayPrice}` : 'Not Updated';
            const when = isUpdated && row.rawDate ? ` (${formatDisplayDateTime(row.rawDate)})` : '';
            return `${indent}${row.name}: ${badge}${when}`;
        })
        .join('\n');
}

function flattenJobForest(nodes, depth = 0) {
    if (!Array.isArray(nodes) || nodes.length === 0) return [];
    const lines = [];
    for (const node of nodes) {
        if (!node) continue;
        const declined = !!node.declinedToQuote;
        const has = !declined && node.hasPrice && Number(node.price) > 0;
        const badge = declined ? 'Decline to Quote' : has ? `BD ${formatAmt(node.price)}` : 'Not Updated';
        const by = String(node.pricedBy ?? node.updatedBy ?? '').trim();
        const when =
            (has || declined) && node.updatedAt
                ? ` (${formatDisplayDateTime(node.updatedAt)}${by ? ` ${by}` : ''})`
                : '';
        const indent = depth > 0 ? `${'  '.repeat(depth)}→ ` : '';
        lines.push(`${indent}${String(node.label || '').trim()}: ${badge}${when}`);
        const kids = Array.isArray(node.children) ? node.children : [];
        if (kids.length) lines.push(...flattenJobForest(kids, depth + 1));
    }
    return lines;
}

function customerTotalColumnText(enq) {
    const structured = tryParsePricingListDisplay(enq);
    if (structured?.customerTotals?.length) {
        return flattenCustomerTotals(structured.customerTotals);
    }
    if (enq.SubJobPrices) {
        const split = splitSubJobPricesForListColumns(enq.SubJobPrices);
        return flattenLegacyPriceRows(split.customerAndTotalRows);
    }
    return 'No assigned jobs';
}

function individualSubjobColumnText(enq) {
    const structured = tryParsePricingListDisplay(enq);
    if (structured?.jobForest?.length) {
        const lines = flattenJobForest(structured.jobForest);
        return lines.length ? lines.join('\n') : '—';
    }
    if (enq.SubJobPrices) {
        const split = splitSubJobPricesForListColumns(enq.SubJobPrices);
        if (split.individualRows.length) return flattenLegacyPriceRows(split.individualRows);
    }
    return '—';
}

function enquiryNoColumnText(enq) {
    const no = dash(enq.RequestNo);
    const status = formatSpecStatusText(enq);
    return status ? `${no}\n${status}` : no;
}

function getColumns(mode) {
    const isSearch = mode === 'search';
    return [
        { key: 'requestNo', header: 'Enquiry No.', width: 18, type: 'text' },
        { key: 'projectName', header: 'Project Name', width: 40, type: 'text' },
        { key: 'customerTotals', header: 'Customer Name & Total Price', width: 42, type: 'text' },
        { key: 'subjobPrices', header: 'Individual & Subjob Base prices', width: 48, type: 'text' },
        { key: 'clientName', header: 'Client Name', width: 24, type: 'text' },
        { key: 'consultantName', header: 'Consultant Name', width: 28, type: 'text' },
        {
            key: isSearch ? 'enquiryDate' : 'dueDate',
            header: isSearch ? 'Enquiry Date' : 'Due Date',
            width: 13,
            type: 'date'
        }
    ];
}

function cellValue(col, row) {
    switch (col.key) {
        case 'requestNo':
            return enquiryNoColumnText(row);
        case 'projectName':
            return dash(row.ProjectName);
        case 'customerTotals':
            return customerTotalColumnText(row);
        case 'subjobPrices':
            return individualSubjobColumnText(row);
        case 'clientName':
            return dash(row.ClientName);
        case 'consultantName':
            return dash(row.ConsultantName);
        case 'enquiryDate':
            return toExcelDate(row.EnquiryDate);
        case 'dueDate':
            return toExcelDate(row.DueDate);
        default:
            return '';
    }
}

function safeFilePart(s) {
    return safeExcelFilePart(s || 'Pricing_Export');
}

/**
 * Download Pricing list (Pending or Search) as formatted .xlsx
 * — same workbook styling as Sales Report / Search Enquiry.
 */
export async function downloadPricingListXlsx({
    rows,
    mode = 'pending',
    meta = {}
}) {
    const list = Array.isArray(rows) ? rows : [];
    if (list.length === 0) {
        throw new Error('No data to export');
    }

    const isSearch = mode === 'search';
    const sectionLabel = isSearch ? 'Search Price' : 'Pending Updates';
    const title = `Pricing Module | ${sectionLabel}`;
    const columns = getColumns(mode);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'EMS Pricing';
    workbook.created = new Date();

    const sheetName = safeFilePart(sectionLabel).slice(0, 31) || 'Pricing';
    const sheet = workbook.addWorksheet(sheetName);

    const lastCol = columns.length;
    const metaParts = [
        meta.division ? `Division: ${meta.division}` : null,
        meta.category ? `Category: ${meta.category}` : null,
        meta.searchQuery ? `Search: ${meta.searchQuery}` : null,
        meta.dateFrom && meta.dateTo ? `From: ${meta.dateFrom}  To: ${meta.dateTo}` : null,
        `Rows: ${list.length}`,
        `Exported: ${new Date().toLocaleString('en-GB')}`
    ].filter(Boolean);
    const { dataStartRow } = await setupEmsExcelReportHeader(workbook, sheet, {
        lastCol,
        title,
        metaText: metaParts.join('  |  '),
        columns,
        getHeaderAlignment: () => ({ vertical: 'middle', horizontal: 'left', wrapText: true })
    });

    list.forEach((row, idx) => {
        const excelRow = sheet.getRow(dataStartRow + idx);
        columns.forEach((col, i) => {
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
        // Tall enough for multi-line price cells
        excelRow.height = Math.min(90, Math.max(18, 14 + String(cellValue(columns[2], row) || '').split('\n').length * 12));
    });

    columns.forEach((col, i) => {
        sheet.getColumn(i + 1).width = col.width;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `${safeFilePart(isSearch ? 'Pricing_Search' : 'Pricing_Pending')}_${stamp}.xlsx`;
    downloadExcelBlob(buffer, fileName);
    return fileName;
}
