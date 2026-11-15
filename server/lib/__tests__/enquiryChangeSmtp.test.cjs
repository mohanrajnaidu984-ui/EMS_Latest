const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../../routes/enquiryOutlook'), 'utf8');
const handlerSource = source.slice(source.indexOf("router.post('/outlook-draft'"), source.indexOf('/** POST /api/enquiries/outlook-customer-ack-draft'));
async function notify(body, { fail = false, platform = 'win32' } = {}) {
    let handler, sent;
    const calls = { outlook: 0 };
    vm.runInNewContext(handlerSource, {
        router: { post: (_path, _middleware, fn) => { handler = fn; } },
        express: { json: () => () => {} },
        process: { platform, env: { SMTP_FROM: 'ems@almoayyedcg.com' } },
        useSmtpForEnquiryNotify: () => true,
        enquiryChangeFromEmail: () => 'ems@almoayyedcg.com',
        smtpFallbackEnabled: () => true,
        loadEnquiryEmailRow: async () => ({ RequestNo: '3423', EnquiryStatus: 'Active' }),
        isInactiveEnquiryStatus: () => false,
        getApiPublicBase: () => '',
        loadPublicAttachments: async () => [],
        resolveEnquiryOutlookEmailFields: async () => ({ to: 'se@example.com', cc: 'cc@example.com' }),
        loadChangeEmail: async () => ({ html: '<p>Details</p>', subject: 'Change received' }),
        buildEnquiryNotifyEmailHtml: () => '<p>New</p>',
        buildEnquiryOutlookSubject: () => 'New Enquiry',
        sendEnquiryNotificationViaSmtp: async mail => { sent = mail; if (fail) throw new Error('SMTP unavailable'); },
        path: require('path'),
        os: { tmpdir: () => require('os').tmpdir() },
        fs: { mkdirSync() {}, writeFileSync() {} },
        runOutlookInternalSend: async () => { calls.outlook += 1; throw new Error('Outlook unavailable on test host'); },
        console: { error() {}, warn() {}, log() {} },
    });
    const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ body: { requestNo: '3423', userEmail: 'creator@example.com', ...body } }, res);
    return { sent, res, calls };
}
test('enquiry-field update email is disabled', async () => {
    const { res, calls } = await notify({ enquiryUpdate: true });
    assert.equal(res.code, 400);
    assert.equal(res.body.error, 'enquiry_update_email_disabled');
    assert.equal(calls.outlook, 0);
});
test('new enquiry SMTP fallback uses the creator as From', async () => {
    const { sent, res, calls } = await notify({});
    assert.equal(calls.outlook, 1);
    assert.equal(res.code, 200);
    assert.equal(res.body.via, 'smtp-fallback');
    assert.equal(sent.fromEmail, 'creator@example.com');
    assert.equal(res.body.from, 'creator@example.com');
});
test('addendum SMTP fallback uses the adder as From', async () => {
    const { sent, res, calls } = await notify({ addendumNo: 1 });
    assert.equal(calls.outlook, 1);
    assert.equal(res.code, 200);
    assert.equal(res.body.via, 'smtp-fallback');
    assert.equal(sent.fromEmail, 'creator@example.com');
});
