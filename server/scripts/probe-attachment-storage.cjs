/**
 * Run on the EMS server (same folder as PM2 backend) to test UNC write as the current Windows user:
 *   cd C:\inetpub\wwwroot\EMS\backend
 *   node scripts\probe-attachment-storage.cjs 187 "BMS Project"
 *
 * Compare processUser with Task Manager → node.exe (EMS-API) user column.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
    resolveEnquiryAttachmentsBase,
    resolveEnquiryUploadDestinationByVisibility,
} = require('../lib/attachmentsRoot');

const requestNo = process.argv[2] || 'probe';
const division = process.argv[3] || 'General';
const visibility = process.argv[4] || 'Public';

const dest = resolveEnquiryUploadDestinationByVisibility(requestNo, visibility, division);
const probeFile = path.join(dest, `.ems-write-probe-${Date.now()}.tmp`);

let username = 'unknown';
try {
    username = os.userInfo().username;
} catch {
    username = process.env.USERNAME || process.env.USER || 'unknown';
}

console.log('--- EMS attachment storage probe ---');
console.log('processUser:', username);
console.log('enquiryAttachmentsRoot:', resolveEnquiryAttachmentsBase());
console.log('resolvedDestination:', dest);
console.log('probeFile:', probeFile);

try {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
        console.log('mkdir: OK');
    } else {
        console.log('mkdir: already exists');
    }
    fs.writeFileSync(probeFile, `ems probe ${new Date().toISOString()}`);
    console.log('write: OK');
    fs.unlinkSync(probeFile);
    console.log('delete: OK');
    console.log('RESULT: ok=true');
    process.exit(0);
} catch (err) {
    console.error('RESULT: ok=false');
    console.error('ERROR:', err.message);
    console.error('');
    console.error('If RDP file create works but this fails, grant Modify on the UNC share to the PM2/node.exe Windows account.');
    process.exit(1);
}
