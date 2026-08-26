import {
    ExcelJS,
    CELL_FONT,
    THIN_BORDER,
    TOTAL_FILL,
    setupEmsExcelReportHeader,
    downloadExcelBlob,
    safeExcelFilePart,
} from '../../utils/emsExcelWorkbook';

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];

function safeFilePart(s) {
    return safeExcelFilePart(s || 'Sales_Target');
}

function num(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
}

const salesTargetHeaderAlignment = (_col, i) => ({
    vertical: 'middle',
    horizontal: i < 2 ? 'left' : 'right',
    wrapText: true
});

/**
 * Download Sales Target grid as formatted .xlsx (Sales Report style).
 * title: "Sales Target Module | …"
 */
export async function downloadSalesTargetXlsx({
    rowKeys,
    targetData,
    nameHeader = 'Sales Engineer',
    meta = {},
    includeTotals = true
}) {
    const keys = Array.isArray(rowKeys) ? rowKeys : [];
    if (keys.length === 0) {
        throw new Error('No data to export');
    }

    const yearLabel = meta.year ? String(meta.year) : 'Targets';
    const title = `Sales Target Module | ${yearLabel}`;

    const columns = [
        { key: 'name', header: nameHeader, width: 28 },
        { key: 'metric', header: 'Metric', width: 20 },
        ...QUARTERS.map((q) => ({ key: q, header: `${q} — Target`, width: 14 })),
        { key: 'total', header: 'Total', width: 16 }
    ];

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'EMS Sales Target';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Sales Target');

    const lastCol = columns.length;
    const metaParts = [
        meta.year ? `Financial Year: ${meta.year}` : null,
        meta.division ? `Division: ${meta.division}` : null,
        meta.engineer ? `Sales Engineer: ${meta.engineer}` : null,
        `Rows: ${keys.length}`,
        `Exported: ${new Date().toLocaleString('en-GB')}`
    ].filter(Boolean);

    const { dataStartRow } = await setupEmsExcelReportHeader(workbook, sheet, {
        lastCol,
        title,
        metaText: metaParts.join('  |  '),
        columns,
        getHeaderAlignment: salesTargetHeaderAlignment
    });

    let excelRowIdx = dataStartRow;
    const quarterTotRev = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
    const quarterTotGp = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
    let grandRev = 0;
    let grandGp = 0;

    const writeDataRow = (values, { bold = false, fill = null } = {}) => {
        const excelRow = sheet.getRow(excelRowIdx++);
        columns.forEach((col, i) => {
            const cell = excelRow.getCell(i + 1);
            const raw = values[col.key];
            cell.font = bold ? { ...CELL_FONT, bold: true } : CELL_FONT;
            cell.border = THIN_BORDER;
            if (fill) cell.fill = fill;
            cell.alignment = salesTargetHeaderAlignment(col, i);
            if (i >= 2 && typeof raw === 'number') {
                cell.value = raw;
                if (col.key === 'total' && values._totalIsText) {
                    cell.value = values.total;
                    cell.numFmt = undefined;
                } else if (values._metric === 'gpPct') {
                    if (col.key !== 'total') cell.numFmt = '0.0';
                } else {
                    cell.numFmt = '#,##0.00';
                }
            } else {
                cell.value = raw;
            }
        });
    };

    keys.forEach((rowKey) => {
        const row = targetData?.[rowKey] || {};
        const qRevs = QUARTERS.map((q) => num(row[q]));
        const qGpPcts = QUARTERS.map((q) => num(row[`${q}_GP`]));
        const qGpAmts = qRevs.map((rev, i) => rev * (qGpPcts[i] / 100));
        const totalRev = qRevs.reduce((a, b) => a + b, 0);
        const totalGpAmt = qGpAmts.reduce((a, b) => a + b, 0);
        const avgGpPct = totalRev > 0 ? (totalGpAmt / totalRev) * 100 : 0;

        QUARTERS.forEach((q, i) => {
            quarterTotRev[q] += qRevs[i];
            quarterTotGp[q] += qGpAmts[i];
        });
        grandRev += totalRev;
        grandGp += totalGpAmt;

        writeDataRow({
            name: rowKey,
            metric: 'Booking Job Value',
            Q1: qRevs[0],
            Q2: qRevs[1],
            Q3: qRevs[2],
            Q4: qRevs[3],
            total: totalRev,
            _metric: 'revenue'
        });

        writeDataRow({
            name: '',
            metric: 'GP %',
            Q1: qGpPcts[0],
            Q2: qGpPcts[1],
            Q3: qGpPcts[2],
            Q4: qGpPcts[3],
            total: `${totalGpAmt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${avgGpPct.toFixed(1)}%)`,
            _metric: 'gpPct',
            _totalIsText: true
        });
    });

    if (includeTotals) {
        const totLabel = nameHeader === 'Item Name' ? 'Grand Total' : 'Total';
        writeDataRow(
            {
                name: totLabel,
                metric: 'Booking Job Value',
                Q1: quarterTotRev.Q1,
                Q2: quarterTotRev.Q2,
                Q3: quarterTotRev.Q3,
                Q4: quarterTotRev.Q4,
                total: grandRev,
                _metric: 'revenue'
            },
            { bold: true, fill: TOTAL_FILL }
        );
        const avgAll = grandRev > 0 ? (grandGp / grandRev) * 100 : 0;
        writeDataRow(
            {
                name: '',
                metric: 'GP Amount / Avg %',
                Q1: quarterTotGp.Q1,
                Q2: quarterTotGp.Q2,
                Q3: quarterTotGp.Q3,
                Q4: quarterTotGp.Q4,
                total: `${grandGp.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${avgAll.toFixed(1)}%)`,
                _metric: 'revenue',
                _totalIsText: true
            },
            { bold: true, fill: TOTAL_FILL }
        );
    }

    columns.forEach((col, i) => {
        sheet.getColumn(i + 1).width = col.width;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `${safeFilePart(`Sales_Target_${meta.year || ''}_${meta.division || ''}`)}_${stamp}.xlsx`;
    downloadExcelBlob(buffer, fileName);

    return fileName;
}
