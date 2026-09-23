const fs = require('fs');
const path = require('path');

const log = fs.readFileSync(path.join(__dirname, '..', 'quote_creation_error.log'), 'utf8');
const idx = log.lastIndexOf('Body: {');
if (idx < 0) {
  console.error('No Body found in log');
  process.exit(1);
}

const bodyStr = log.slice(idx + 6).trim();
const body = JSON.parse(bodyStr);

const limits = {
  requestNo: 50,
  preparedBy: 100,
  preparedByEmail: 100,
  customerReference: 100,
  subject: 255,
  signatory: 100,
  signatoryDesignation: 100,
  toName: 100,
  toPhone: 50,
  toEmail: 100,
  leadJob: 255,
  ownJob: 255,
  toFax: 255,
  toAttention: 255,
  quoteType: 255,
  yourRef: 255,
  reasonForRevision: 1000,
};

const str = (v) => (v == null ? '' : String(v));
for (const [key, max] of Object.entries(limits)) {
  const val = str(body[key]);
  if (val.length > max) {
    console.log(`OVER: ${key} len=${val.length} max=${max}`);
    console.log(`  value: ${val}`);
  }
}
