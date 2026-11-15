const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { resolveEnquiryUploadDestinationByVisibility } = require('../attachmentsRoot');

test('enquiry files and each addendum have separate public/private folders on the configured share', () => {
    const keys = ['ENQUIRY_ATTACHMENTS_ROOT', 'ENQUIRY_ATTACHMENTS_PUBLIC_ROOT', 'ENQUIRY_ATTACHMENTS_PRIVATE_ROOT'];
    const previous = keys.map(key => process.env[key]);
    try {
        process.env.ENQUIRY_ATTACHMENTS_ROOT = '\\\\fileserver\\ems';
        delete process.env.ENQUIRY_ATTACHMENTS_PUBLIC_ROOT;
        delete process.env.ENQUIRY_ATTACHMENTS_PRIVATE_ROOT;
        for (const visibility of ['Public', 'Private']) {
            const base = path.join(process.env.ENQUIRY_ATTACHMENTS_ROOT, 'Enquiries', visibility, '3423');
            assert.equal(resolveEnquiryUploadDestinationByVisibility('3423', visibility, 'IBMS'), path.join(base, 'Enquiry', 'IBMS'));
            assert.equal(resolveEnquiryUploadDestinationByVisibility('3423', visibility, 'IBMS', ''), path.join(base, 'Enquiry', 'IBMS'));
            for (const number of [1,2,3]) {
                assert.equal(resolveEnquiryUploadDestinationByVisibility('3423', visibility, 'IBMS', String(number)), path.join(base, `Addendum-${number}`, 'IBMS'));
            }
        }
        process.env.ENQUIRY_ATTACHMENTS_PRIVATE_ROOT = '\\\\private-server\\documents';
        assert.equal(resolveEnquiryUploadDestinationByVisibility('3423', 'Private', 'IBMS', 2), path.join(process.env.ENQUIRY_ATTACHMENTS_PRIVATE_ROOT, '3423', 'Addendum-2', 'IBMS'));
        for (const invalid of ['../other', -1, 0, 1.5, 'NaN']) {
            assert.throws(() => resolveEnquiryUploadDestinationByVisibility('3423', 'Public', 'IBMS', invalid), /Invalid addendum/);
        }
    } finally {
        keys.forEach((key, index) => { if (previous[index] == null) delete process.env[key]; else process.env[key] = previous[index]; });
    }
});
