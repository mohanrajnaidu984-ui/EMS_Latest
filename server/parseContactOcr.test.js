/**
 * Quick parser checks — run: node server/parseContactOcr.test.js
 */
const { parseContactCardFromOcrText } = require('./parseContactOcr');

const ASK_SIGNATURE = `
Best Regards,

ask
REAL ESTATE
Monaliza Rollan | FM Procurement officer
M. +973 36111924 | P. +973 17211180 | E. FM.admin@askre.com
Bahrain Harbour, GFH Tower, Floor 8, Suite 2 Manama, Kingdom Of Bahrain.
follow us:
`;

const ALMOAYYED = `
Regards,

Mohanraj Naidu.G

Asst. General Manager — Control Business
Almoayyed Air Conditioning

P.O. Box 32232, Manama, Kingdom of Bahrain

Email: mohan.naidu@almoayyedcg.com | Tel: +973 17400407 |
Ext: 280 | Mob: +973 39770106
`;

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

function testAskSignature() {
    const r = parseContactCardFromOcrText(ASK_SIGNATURE);
    assert(r.EmailId.toLowerCase() === 'fm.admin@askre.com', `email: ${r.EmailId}`);
    assert(/ask/i.test(r.CompanyName), `company: ${r.CompanyName}`);
    assert(r.Address1 && /harbour|gfh/i.test(r.Address1), `address1: ${r.Address1}`);
    assert(r.Address2 && /manama/i.test(r.Address2) && /kingdom|bahrain/i.test(r.Address2), `address2: ${r.Address2}`);
    assert(!/manama/i.test(r.Address1), `address1 should not include city: ${r.Address1}`);
    assert(r.Address1.length <= 55, `address1 should be shorter: ${r.Address1}`);
    assert(r.Phone && r.Phone.replace(/\D/g, '').includes('17211180'), `phone P: ${r.Phone}`);
    assert(r.Mobile1 && r.Mobile1.replace(/\D/g, '').includes('36111924'), `mobile M: ${r.Mobile1}`);
    assert(r.ContactName.toLowerCase().includes('monaliza'), `name: ${r.ContactName}`);
    console.log('ASK signature:', JSON.stringify(r, null, 2));
}

function testAlmoayyed() {
    const r = parseContactCardFromOcrText(ALMOAYYED);
    assert(r.EmailId.includes('mohan.naidu'), `email: ${r.EmailId}`);
    assert(/almoayyed/i.test(r.CompanyName), `company: ${r.CompanyName}`);
    console.log('Almoayyed card:', JSON.stringify(r, null, 2));
}

const SMART_CARD = `
Karthikeyan
Sales Manager
SMART
SECURITY AND SAFETY
Mobile +973 36333527
Landline +97317555024
Address: PO Box 21945, Flat/Shop No. 0, Bldg 392, Road 333, Block 308, Alqudaybiyah, Bahrain
Website www.smart.bh
Email karthikeyan.thulasi@smart.bh
`;

const SMART_OCR_NOISY = `
Karthikeyan
Sales Manager
SMART
SECURITY AND SAFETY
Mobile +973 36333527
Landline +97317555024
Address PO Box 21945, Flat/Shop No. 0, Bldg 392, Road 333, Block 308, Alqudaybiyah, Bahrain
E mail
karthikeyan. thulasi @ smart bh
Website
www. smart . bh
`;

function testSmartCardNoisyOcr() {
    const r = parseContactCardFromOcrText(SMART_OCR_NOISY);
    assert(r.EmailId.toLowerCase().includes('karthikeyan') && r.EmailId.includes('smart'), `email: ${r.EmailId}`);
    assert(/smart\.bh/i.test(r.Website), `website: ${r.Website}`);
    console.log('SMART noisy OCR:', JSON.stringify(r, null, 2));
}

function testSmartCard() {
    const r = parseContactCardFromOcrText(SMART_CARD);
    assert(r.ContactName.toLowerCase().includes('karthikeyan'), `name: ${r.ContactName}`);
    assert(!companyMatchesPerson(r.CompanyName, r.ContactName), `company must not be person: ${r.CompanyName}`);
    assert(/smart/i.test(r.CompanyName) && /security/i.test(r.CompanyName), `company: ${r.CompanyName}`);
    assert(r.EmailId.toLowerCase() === 'karthikeyan.thulasi@smart.bh', `email: ${r.EmailId}`);
    assert(/smart\.bh/i.test(r.Website), `website: ${r.Website}`);
    assert(r.Mobile1.replace(/\D/g, '').includes('36333527'), `mobile: ${r.Mobile1}`);
    assert(r.Phone.replace(/\D/g, '').includes('17555024'), `landline: ${r.Phone}`);
    assert(r.Address1 && !/^address:/i.test(r.Address1), `address1: ${r.Address1}`);
    assert(/block\s*308|alqudaybiyah/i.test(`${r.Address1} ${r.Address2}`), `full address: ${r.Address1} | ${r.Address2}`);
    console.log('SMART card:', JSON.stringify(r, null, 2));
}

const SMART_ADDRESS_SPLIT = `
Karthikeyan
Sales Manager
Address PO Box 21945, Flat/Shop No. 0, Bldg 392, Road 333, Block 308, Alqudaybiyah, Bahrain
Mobile +973 36333527
Email karthikeyan.thulasi@smart.bh
Website www.smart.bh
`;

const EFS_SIGNATURE = `
Shikhin
Assistant Procurement
EFS Facilities Services Bahrain W. L. L.
A Level 7, Harbour Tower - West, Bahrain Financial Harbour, 60360, Manama, Kingdom of Bahrain
P +97317102961 F +973 17102954 M +973 36897639
E shikhin@bfharbour.comW www.efsme.com
`;

const EFS_SIGNATURE_SPACED = `
Shikhin
Assistant Procurement
EFS Facilities Services Bahrain W. L. L.
A Level 7, Harbour Tower - West, Bahrain Financial Harbour, 60360, Manama, Kingdom of Bahrain
P +97317102961 F +973 17102954 M +973 36897639
E shikhin@bfharbour.com W www.efsme.com
`;

function testEfsSignature() {
    for (const label of ['glued', 'spaced']) {
        const r = parseContactCardFromOcrText(label === 'glued' ? EFS_SIGNATURE : EFS_SIGNATURE_SPACED);
        assert(r.EmailId.toLowerCase() === 'shikhin@bfharbour.com', `${label} email: ${r.EmailId}`);
        assert(/efsme\.com/i.test(r.Website), `${label} website: ${r.Website}`);
        assert(/efs/i.test(r.CompanyName), `${label} company: ${r.CompanyName}`);
        assert(!/^A\s+level/i.test(r.Address1), `${label} address A prefix: ${r.Address1}`);
        assert(r.FaxNo.replace(/\D/g, '').includes('17102954'), `${label} fax: ${r.FaxNo}`);
        console.log(`EFS ${label}:`, JSON.stringify({ EmailId: r.EmailId, Website: r.Website, FaxNo: r.FaxNo }, null, 2));
    }
}

function testSmartFullAddress() {
    const r = parseContactCardFromOcrText(SMART_ADDRESS_SPLIT);
    const full = `${r.Address1} ${r.Address2}`.toLowerCase();
    assert(/block\s*308/.test(full), `missing block: ${r.Address1} | ${r.Address2}`);
    assert(/alqudaybiyah/.test(full), `missing area: ${r.Address1} | ${r.Address2}`);
    assert(/bahrain/.test(full), `missing country: ${r.Address1} | ${r.Address2}`);
    assert(r.Address2.length > 0, `address2 should have overflow: ${r.Address2}`);
    console.log('SMART full address:', JSON.stringify({ Address1: r.Address1, Address2: r.Address2 }, null, 2));
}

function companyMatchesPerson(company, contactName) {
    if (!company || !contactName) return false;
    const c = String(company).toLowerCase();
    const n = String(contactName).toLowerCase();
    return c === n || c.startsWith(`${n} `);
}

try {
    testAskSignature();
    testAlmoayyed();
    testSmartCard();
    testSmartCardNoisyOcr();
    testSmartFullAddress();
    testEfsSignature();
    console.log('All parseContactOcr tests passed.');
} catch (e) {
    console.error('FAILED:', e.message);
    process.exit(1);
}
