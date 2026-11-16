const express = require('express');
const { sql } = require('../dbConfig');
const { ensureAddendumSchema } = require('../lib/enquiryAddendums');
const { getAttachmentAccessContext } = require('../lib/attachmentAccess');
const router = express.Router();

function normalizeReceivedDate(value) {
    if (value == null || value === '') return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
    }
    const s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
}

router.use('/:requestNo/addendums', async (req, res, next) => {
    try {
        await ensureAddendumSchema();
        const access = await getAttachmentAccessContext(req.params.requestNo, req.query.userEmail || '', req.query.userRole || '');
        if (!access.allowed) {
            const enquiry = await sql.query`SELECT CreatedBy FROM EnquiryMaster WHERE RequestNo=${req.params.requestNo}`;
            const creator = enquiry.recordset[0]?.CreatedBy;
            if (!creator || !access.user?.fullName || creator.trim().toLowerCase() !== access.user.fullName.trim().toLowerCase())
                return res.status(403).json({ error: 'Access denied' });
        }
        next();
    } catch (err) { res.status(500).json({ error: err.message }); }
});
router.get('/:requestNo/addendums', async (req, res) => {
    try {
        const result = await sql.query`
            SELECT AddendumNo, Details, CreatedByEmail, ReceivedDate
            FROM EnquiryAddendums
            WHERE RequestNo=${req.params.requestNo}
            ORDER BY AddendumNo`;
        res.json(result.recordset.map((row) => ({
            ...row,
            ReceivedDate: normalizeReceivedDate(row.ReceivedDate) || '',
        })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});
router.put('/:requestNo/addendums', async (req, res) => {
    let transaction;
    try {
        const requestNo = req.params.requestNo;
        const createdByEmail = String(req.query?.userEmail || '').trim().toLowerCase() || null;
        const rows = req.body.addendums;
        if (!Array.isArray(rows) || new Set(rows.map(a => a.AddendumNo)).size !== rows.length || rows.some(a => !Number.isInteger(a.AddendumNo) || a.AddendumNo < 1 || typeof a.Details !== 'string'))
            return res.status(400).json({ error: 'Invalid addendums' });
        const blank = rows.filter((a) => !String(a.Details || '').trim());
        if (blank.length) {
            const nos = blank.map((a) => a.AddendumNo).join(', ');
            return res.status(400).json({ error: `Addendum details are required (Addendum-${nos.replace(/, /g, ', Addendum-')})` });
        }
        const blankDates = rows.filter((a) => !normalizeReceivedDate(a.ReceivedDate));
        if (blankDates.length) {
            const nos = blankDates.map((a) => a.AddendumNo).join(', ');
            return res.status(400).json({
                error: `Addendum Received Date is required (Addendum-${nos.replace(/, /g, ', Addendum-')})`,
            });
        }
        transaction = new sql.Transaction();
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const existing = await new sql.Request(transaction).input('r', sql.NVarChar, requestNo)
            .query('SELECT AddendumNo, Details, ReceivedDate FROM EnquiryAddendums WITH (UPDLOCK,HOLDLOCK) WHERE RequestNo=@r');
        let max = Math.max(0, ...existing.recordset.map(a => a.AddendumNo));
        const saved = new Set(existing.recordset.map(a => a.AddendumNo));
        for (const a of [...rows].sort((a,b) => a.AddendumNo-b.AddendumNo)) {
            const old = existing.recordset.find(row => row.AddendumNo === a.AddendumNo);
            if (old && a.OriginalDetails !== old.Details && a.Details !== old.Details) throw new Error('This addendum was changed by another user. Reload the enquiry before saving.');
            if (old && a.OriginalDetails == null) throw new Error('Addendum number already used. Reload the enquiry.');
            if (!saved.has(a.AddendumNo) && a.AddendumNo !== ++max) throw new Error('Addendum numbering changed. Reload the enquiry before saving.');
            const receivedDate = normalizeReceivedDate(a.ReceivedDate);
            await new sql.Request(transaction)
                .input('r', sql.NVarChar, requestNo)
                .input('n', sql.Int, a.AddendumNo)
                .input('d', sql.NVarChar(sql.MAX), String(a.Details).trim())
                .input('e', sql.NVarChar(320), createdByEmail)
                .input('rd', sql.Date, receivedDate)
                .query(`IF EXISTS (SELECT 1 FROM EnquiryAddendums WHERE RequestNo=@r AND AddendumNo=@n)
                    UPDATE EnquiryAddendums SET Details=@d, ReceivedDate=@rd, ModifiedAt=SYSUTCDATETIME() WHERE RequestNo=@r AND AddendumNo=@n;
                    ELSE INSERT INTO EnquiryAddendums(RequestNo,AddendumNo,Details,CreatedByEmail,ReceivedDate) VALUES(@r,@n,@d,@e,@rd);`);
        }
        await transaction.commit(); transaction = null;
        res.json({ success: true });
    } catch (err) {
        if (transaction) await transaction.rollback().catch(() => {});
        res.status(409).json({ error: err.message });
    }
});
module.exports = router;
