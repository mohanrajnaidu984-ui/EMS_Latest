const http = require('http');

const payload = JSON.stringify({
    userEmail: "mohan.naidu@almoayyedcg.com",
    userDisplayName: "Mohanraj Naidu",
    to: "test@example.com",
    cc: "",
    bcc: "",
    subject: "Test Quotation",
    body: "This is a test body.",
    attachmentName: "Quote.pdf",
    pdfBase64: "JVBERi0xLjQKMSAwIG9iagogIDw8IC9UeXBlIC9DYXRhbG9nCiAgICAgL1BhZ2VzIDIgMCBSCiAgPj4KZW5kb2JqCjIgMCBvYmoKICA8PCAvVHlwZSAvUGFnZXMKICAgICAvS2lkcyBbIDMgMCBSIF0KICAgICAvQ291bnQgMQogID4+CmVuZG9iagozIDAgb2JqCiAgPDwgL1R5cGUgL1BhZ2UKICAgICAvUGFyZW50IDIgMCBSCiAgICAgL01lZGlhQm94IFsgMCAwIDU5NSA4NDIgXQogICAgIC9Db250ZW50cyA0IDAgUgogICAgIC9SZXNvdXJjZXMgPDw+PgogID4+CmVuZG9iago0IDAgb2JqCiAgPDwgL0xlbmd0aCA4ID4+CnN0cmVhbQpCVAovRjEgMjQgVGYKNzAgNzgwIFRkCihIZWxsbyBXb3JsZCkgVGoKRVQKZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgNQowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCjAwMDAwMDAyMjMgMDAwMDAgbiAKdHJhaWxlcgogIDw8IC9TaXplIDUKICAgICAvUm9vdCAxIDAgUgogID4+CnN0YXJ0eHJlZgoyODIKJSVFT0YK",
    openInOutlook: true
});

const req = http.request({
    hostname: 'localhost',
    port: 5002, // The server port is 5002 as seen in .env and quotes.js
    path: '/api/quotes/smtp-draft',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
    }
}, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    res.on('end', () => {
        console.log('RESPONSE:', data);
    });
});

req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
});

req.write(payload);
req.end();
