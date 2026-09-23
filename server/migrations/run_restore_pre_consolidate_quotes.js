/**
 * Reverse the consolidate_quote_no_by_tuple run from this session.
 * Restores QuoteNo / RevisionNo / QuoteNumber on EnquiryQuotes + QuoteApprovalSteps
 * to the pre-consolidate values logged during that migration.
 *
 * Run: node server/migrations/run_restore_pre_consolidate_quotes.js
 */
const { connectDB, sql } = require('../dbConfig');

/** id → pre-consolidate QuoteNumber (from consolidate script log) */
const RESTORE = [
    { id: 774, quoteNumber: 'IFM/IFE/72-L1/66-R0' },
    { id: 1010, quoteNumber: 'AAC/PLP/20-L3/255-R0' },
    { id: 1147, quoteNumber: 'AAC/BMP/20-L3/364-R0' },
    { id: 937, quoteNumber: 'AAC/PLP/158-L1/191-R0' },
    { id: 1565, quoteNumber: 'AAC/BMP/159-L1/696-R0' },
    { id: 971, quoteNumber: 'AAC/ELP/240-L1/221-R0' },
    { id: 1216, quoteNumber: 'AAC/ELP/18-L2/422-R0' },
    { id: 1218, quoteNumber: 'AAC/ELP/18-L2/422-R1' },
    { id: 967, quoteNumber: 'AAC/PLP/244-L1/218-R0' },
    { id: 1212, quoteNumber: 'AAC/HVP/18-L1/419-R0' },
    { id: 1108, quoteNumber: 'AAC/PLP/441-L1/330-R0' },
    { id: 1471, quoteNumber: 'AAC/PLP/134-L2/624-R0' },
    { id: 1853, quoteNumber: 'AAC/ELP/134-L2/888-R0' },
    { id: 1381, quoteNumber: 'AAC/BMP/260-L1/551-R0' },
    { id: 1258, quoteNumber: 'AAC/HVP/20-L1/456-R0' },
    { id: 1270, quoteNumber: 'AAC/ELP/35-L1/466-R0' },
    { id: 1343, quoteNumber: 'AAC/PLP/35-L1/519-R0' },
    { id: 1503, quoteNumber: 'AAC/BMP/35-L1/321-R3' },
    { id: 1555, quoteNumber: 'AAC/BMP/35-L1/321-R4' },
    { id: 1852, quoteNumber: 'AAC/ELP/35-L1/466-R1' },
    { id: 1232, quoteNumber: 'AAC/ELP/134-L1/434-R0' },
    { id: 1568, quoteNumber: 'AAC/PLP/16-L1/698-R0' },
    { id: 2921, quoteNumber: 'AAC/HVP/16-L1/1729-R0' },
    { id: 2924, quoteNumber: 'ACA/AFP/134-L1/1732-R0' },
    { id: 1379, quoteNumber: 'AAC/ELP/620-L1/549-R0' },
    { id: 2160, quoteNumber: 'AAC/ELP/762-L1/1124-R0' },
    { id: 1851, quoteNumber: 'AAC/ELP/692-L1/887-R0' },
    { id: 1691, quoteNumber: 'AAC/PLP/34-L2/778-R0' },
    { id: 1693, quoteNumber: 'AAC/ELP/34-L2/779-R0' },
    { id: 2201, quoteNumber: 'ACM/CLM/371-L1/1160-R0' },
    { id: 2203, quoteNumber: 'ACM/CLM/376-L1/1162-R0' },
    { id: 2215, quoteNumber: 'ACM/CLM/398-L1/1173-R0' },
    { id: 2220, quoteNumber: 'ACM/CLM/418-L1/1177-R0' },
    { id: 2223, quoteNumber: 'ACM/CLM/437-L1/1180-R0' },
    { id: 2226, quoteNumber: 'ACM/CLM/384-L1/1183-R0' },
    { id: 2696, quoteNumber: 'AAC/ELP/1047-L1/1548-R0' },
    { id: 2257, quoteNumber: 'ADF/DFP/1330-L1/1208-R0' },
    { id: 2276, quoteNumber: 'ADF/DFP/1330-L1/1207-R1' },
    { id: 2259, quoteNumber: 'ADF/DFP/1331-L1/1210-R0' },
    { id: 2277, quoteNumber: 'ADF/DFP/1331-L1/1209-R1' },
    { id: 2278, quoteNumber: 'ADF/DFP/1331-L1/1209-R2' },
    { id: 2261, quoteNumber: 'ADF/DFP/1333-L1/1212-R0' },
    { id: 2262, quoteNumber: 'ADF/DFP/1333-L1/1213-R0' },
    { id: 2279, quoteNumber: 'ADF/DFP/1333-L1/1211-R1' },
    { id: 2300, quoteNumber: 'ADF/DFP/1333-L1/1211-R2' },
    { id: 2264, quoteNumber: 'ADF/DFP/1334-L1/1215-R0' },
    { id: 2280, quoteNumber: 'ADF/DFP/1334-L1/1214-R1' },
    { id: 2266, quoteNumber: 'ADF/DFP/1335-L1/1217-R0' },
    { id: 2267, quoteNumber: 'ADF/DFP/1335-L1/1218-R0' },
    { id: 2281, quoteNumber: 'ADF/DFP/1335-L1/1216-R1' },
    { id: 2271, quoteNumber: 'ADF/DFP/1337-L1/1222-R0' },
    { id: 2272, quoteNumber: 'ADF/DFP/1337-L1/1223-R0' },
    { id: 2286, quoteNumber: 'ADF/DFP/1339-L1/1227-R0' },
    { id: 2288, quoteNumber: 'ADF/DFP/1341-L1/1229-R0' },
    { id: 2291, quoteNumber: 'ADF/DFP/1342-L1/1232-R0' },
    { id: 2294, quoteNumber: 'ADF/DFP/1344-L1/1235-R0' },
    { id: 2939, quoteNumber: 'AAC/BMP/1525-L1/1745-R0' },
];

function parseQuoteParts(quoteNumber) {
    const m = String(quoteNumber || '').trim().match(/\/(\d+)-R(\d+)\s*$/i);
    if (!m) return null;
    return { quoteNo: Number(m[1]), revisionNo: Number(m[2]) };
}

async function run() {
    await connectDB();
    let ok = 0;
    let skipped = 0;

    for (const row of RESTORE) {
        const parts = parseQuoteParts(row.quoteNumber);
        if (!parts) {
            console.warn(`Skip id=${row.id}: cannot parse ${row.quoteNumber}`);
            skipped += 1;
            continue;
        }

        const cur = await sql.query`
            SELECT QuoteNumber, QuoteNo, RevisionNo FROM EnquiryQuotes WHERE ID = ${row.id}
        `;
        if (!cur.recordset?.[0]) {
            console.warn(`Skip id=${row.id}: row not found`);
            skipped += 1;
            continue;
        }

        await sql.query`
            UPDATE EnquiryQuotes
            SET QuoteNo = ${parts.quoteNo},
                RevisionNo = ${parts.revisionNo},
                QuoteNumber = ${row.quoteNumber},
                UpdatedAt = GETDATE()
            WHERE ID = ${row.id}
        `;

        await sql.query`
            UPDATE QuoteApprovalSteps
            SET QuoteNo = ${parts.quoteNo},
                RevisionNo = ${parts.revisionNo},
                QuoteNumber = ${row.quoteNumber}
            WHERE QuoteId = ${row.id}
        `;

        console.log(
            `Restored id=${row.id}: ${cur.recordset[0].QuoteNumber} → ${row.quoteNumber}`
        );
        ok += 1;
    }

    // Restore promoted draft for 1745 if present
    await sql.query`
        UPDATE EnquiryQuotesDraft
        SET QuoteNo = 1745,
            RevisionNo = 0,
            QuoteNumber = N'AAC/BMP/1525-L1/1745-R0'
        WHERE ID = 1201 AND RequestNo = N'1525'
    `;

    const sample = await sql.query`
        SELECT ID, QuoteNo, RevisionNo, QuoteNumber, Status
        FROM EnquiryQuotes
        WHERE QuoteNo IN (1396, 1745) OR ID = 2939
        ORDER BY QuoteNo, RevisionNo
    `;
    console.log('\nSample 1396/1745 after restore:', sample.recordset);
    console.log(`[Restore] Updated ${ok} quote row(s), skipped ${skipped}`);
    process.exit(0);
}

run().catch((e) => {
    console.error('[Restore] Failed:', e.message);
    process.exit(1);
});
