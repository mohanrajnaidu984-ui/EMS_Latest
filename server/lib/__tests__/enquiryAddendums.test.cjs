const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { buildChangeEmail } = require('../enquiryChangeEmail');

test('addendum email follows the requested subject, details and numbered filenames', () => {
    const { html, subject } = buildChangeEmail({ RequestNo: '3423', ProjectName: 'Villa-B', EnquiryDate: '2026-11-10', EnquiryDetails: 'BMS' },
        { AddendumNo: 2, Details: 'Floor <3>\nNew drawings $1', CreatedByEmail: 'creator@example.com', ReceivedDate: '2026-11-14' },
        [{ FileName: 'drawing.pdf' }, { FileName: 'BOQ.xlsx' }, { FileName: '<script>.docx' }], new Date('2026-11-15T12:00:00Z'));
    assert.equal(subject, 'Addendum-2 Received for Enquiry 3423 on dated 15-Nov-26');
    assert.match(html, /Addendum No\.:/);
    assert.match(html, /Addendum Received Date:/);
    assert.match(html, /14-Nov-2026/);
    assert.match(html, /Addendum Details:/);
    assert.match(html, /Addendum Added By:/);
    assert.match(html, /creator@example.com/);
    const addendumRows = html.match(/<tr>[\s\S]*?<\/tr>/g).filter(row => /Addendum No\.:|Addendum Received Date:|Addendum Details:|Addendum Added By:/.test(row));
    assert.equal(addendumRows.length, 4);
    for (const row of addendumRows) {
        const cells = row.match(/<td\b[^>]*>/g);
        assert.equal(cells.length, 2);
        for (const cell of cells) assert.match(cell, /font-size:10pt/);
    }
    assert.ok(html.indexOf('Addendum No.:') < html.indexOf('Addendum Received Date:'));
    assert.ok(html.indexOf('Addendum Received Date:') < html.indexOf('Addendum Details:'));
    assert.match(html, /Floor &lt;3&gt;<br>New drawings \$1/);
    assert.match(html, /1\. drawing.pdf<br>2\. BOQ.xlsx<br>3\. &lt;script&gt;.docx/);
    assert.ok(html.indexOf('Project Name:') < html.indexOf('Addendum No.:'));
    assert.ok(html.indexOf('Addendum Details:') < html.indexOf('Customer Name:'));
    assert.doesNotMatch(html, /Please report closure|<script>/);
});

test('ordinary enquiry updates use an update subject and list all supplied attachments', () => {
    const result = buildChangeEmail({ RequestNo: '77' }, null, [{ FileName: 'details.zip' }], new Date('2026-11-15T12:00:00Z'));
    assert.equal(result.subject, 'Enquiry 77 Updated on dated 15-Nov-26');
    assert.match(result.html, /updated enquiry details/);
    assert.match(result.html, /1\. details.zip/);
    assert.doesNotMatch(result.html, /Addendum Details:/);
});

// Exercise the actual registered delete handler without starting EMS or connecting to its database.
const source = fs.readFileSync(require.resolve('../../index.js'), 'utf8');
const deleteSource = source.slice(source.indexOf("app.delete('/api/attachments/:id'"), source.indexOf('// Update Profile Image'));
async function deleteAttachment(addendumNo) {
    let handler, deleted = false, unlinked = false;
    const context = {
        app: { delete: (_path, fn) => { handler = fn; } },
        sql: { query: async (parts) => {
            if (parts.join('').startsWith('DELETE')) { deleted = true; return {}; }
            return { recordset: [{ RequestNo: '77', AddendumNo: addendumNo, FilePath: 'file.pdf' }] };
        } },
        fs: { existsSync: () => true, unlinkSync: () => { unlinked = true; } },
        getAttachmentAccessContext: async () => ({ allowed: true }),
        canReadAttachmentByVisibility: () => true,
        console,
    };
    vm.runInNewContext(deleteSource, context);
    const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ params: { id: '1' }, query: { userRole: 'Admin' } }, res);
    return { res, deleted, unlinked };
}
test('saved addendum attachment deletion is refused even for admins', async () => {
    const result = await deleteAttachment(1);
    assert.equal(result.res.code, 403);
    assert.equal(result.deleted, false);
    assert.equal(result.unlinked, false);
});
test('existing ordinary attachment deletion behavior is preserved', async () => {
    const result = await deleteAttachment(null);
    assert.equal(result.res.code, 200);
    assert.equal(result.deleted, true);
    assert.equal(result.unlinked, true);
});

async function saveAddendums(existing, addendums) {
    const writes = [];
    let committed = false, rolledBack = false;
    class Transaction {
        async begin() {}
        async commit() { committed = true; }
        async rollback() { rolledBack = true; }
    }
    class Request {
        constructor() { this.params = {}; }
        input(key, _type, value) { this.params[key] = value; return this; }
        async query(text) {
            if (text.startsWith('SELECT')) return { recordset: existing };
            writes.push({ ...this.params, text });
        }
    }
    const fakeSql = { Transaction, Request, ISOLATION_LEVEL: { SERIALIZABLE: 4 }, NVarChar: () => {}, Int: 1 };
    const router = { use() {}, get() {}, put(_path, fn) { this.save = fn; } };
    const context = { module: { exports: {} }, require(name) {
        if (name === 'express') return { Router: () => router };
        if (name === '../dbConfig') return { sql: fakeSql };
        if (name === '../lib/enquiryAddendums') return { ensureAddendumSchema: async () => {} };
        if (name === '../lib/attachmentAccess') return { getAttachmentAccessContext: async () => ({ allowed: true }) };
        throw new Error(name);
    } };
    vm.runInNewContext(fs.readFileSync(require.resolve('../../routes/enquiryAddendums'), 'utf8'), context);
    const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await router.save({ params: { requestNo: '77' }, query: { userEmail: 'Creator@Example.com' }, body: { addendums } }, res);
    return { writes, committed, rolledBack, res };
}
test('details persist as separate sequential addendums in one transaction', async () => {
    const result = await saveAddendums([], [
        { AddendumNo: 1, Details: 'First', ReceivedDate: '2026-11-14', OriginalDetails: null },
        { AddendumNo: 2, Details: 'Second', ReceivedDate: '2026-11-15', OriginalDetails: null },
    ]);
    assert.equal(result.res.code, 200);
    assert.equal(result.committed, true);
    assert.equal(result.writes.length, 2);
    assert.equal(result.writes[1].n, 2);
    assert.equal(result.writes[1].d, 'Second');
    assert.equal(result.writes[1].rd, '2026-11-15');
    assert.equal(result.writes[1].r, '77');
    assert.equal(result.writes[1].e, 'creator@example.com');
    assert.match(result.writes[0].text, /ReceivedDate=@rd/);
});
test('blank addendum details are rejected', async () => {
    const result = await saveAddendums([], [{ AddendumNo: 1, Details: '   ', ReceivedDate: '2026-11-14', OriginalDetails: null }]);
    assert.equal(result.res.code, 400);
    assert.match(result.res.body.error, /Addendum details are required/i);
    assert.equal(result.committed, false);
});
test('blank addendum received date is rejected', async () => {
    const result = await saveAddendums([], [{ AddendumNo: 1, Details: 'Has details', ReceivedDate: '', OriginalDetails: null }]);
    assert.equal(result.res.code, 400);
    assert.match(result.res.body.error, /Addendum Received Date is required/i);
    assert.equal(result.committed, false);
});
test('concurrent addendum numbering and stale detail updates roll back', async () => {
    for (const row of [
        { AddendumNo: 1, Details: 'New', ReceivedDate: '2026-11-14', OriginalDetails: null },
        { AddendumNo: 1, Details: 'New', ReceivedDate: '2026-11-14', OriginalDetails: 'Older' },
        { AddendumNo: 3, Details: 'Skipped number', ReceivedDate: '2026-11-14', OriginalDetails: null },
    ]) {
        const result = await saveAddendums([{ AddendumNo: 1, Details: 'Saved', ReceivedDate: '2026-11-14' }], [row]);
        assert.equal(result.res.code, 409);
        assert.equal(result.committed, false);
        assert.equal(result.rolledBack, true);
    }
});

test('editing an existing addendum preserves its original creator email', async () => {
    const result = await saveAddendums([{ AddendumNo: 1, Details: 'Saved', CreatedByEmail: 'original@example.com', ReceivedDate: '2026-11-14' }],
        [{ AddendumNo: 1, Details: 'Edited', ReceivedDate: '2026-11-15', OriginalDetails: 'Saved', CreatedByEmail: 'replacement@example.com' }]);
    assert.equal(result.res.code, 200);
    const update = result.writes[0].text.split('ELSE')[0];
    assert.match(update, /UPDATE EnquiryAddendums SET Details=@d/);
    assert.doesNotMatch(update, /CreatedByEmail\s*=/);
    assert.equal(result.writes[0].e, 'creator@example.com');
    assert.equal(result.writes[0].rd, '2026-11-15');
});
