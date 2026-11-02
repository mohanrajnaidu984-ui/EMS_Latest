// Runs in the signed-in Windows user's session, never under IIS or a service.
// Node built-ins only. No database, SMTP configuration or backend dependencies.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {randomUUID} = require('node:crypto');
const {execFile} = require('node:child_process');
const VERSION = '2026-10-31.1';
const PORT = 39281;
const MAX_BODY = 55 * 1024 * 1024;
const safeName = value => path.basename(String(value || 'attachment').replace(/[/\\?%*:|"<>\x00-\x1f]/g, '_'));

function validatePayload(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid draft payload');
    if (typeof body.pdfBase64 !== 'string' || !body.pdfBase64 || !/^[A-Za-z0-9+/\r\n]*={0,2}$/.test(body.pdfBase64)) throw new Error('A PDF attachment is required');
    if (Buffer.from(body.pdfBase64, 'base64').subarray(0,5).toString() !== '%PDF-') throw new Error('Attachment is not a PDF');
    for (const key of ['to','cc','bcc','subject','body']) {
        if (body[key] != null && typeof body[key] !== 'string') throw new Error(`Invalid ${key}`);
    }
    if (body.extraAttachments != null && !Array.isArray(body.extraAttachments)) throw new Error('Invalid extra attachments');
    if ((body.extraAttachments || []).length > 50) throw new Error('Too many extra attachments');
    for (const item of body.extraAttachments || []) {
        if (!item || typeof item.base64 !== 'string' || !/^[A-Za-z0-9+/\r\n]*={0,2}$/.test(item.base64)) throw new Error('Invalid extra attachment');
    }
}

async function openDraft(body) {
    if (process.platform !== 'win32') throw new Error('Classic Outlook on Windows is required');
    const {buildOutlookDraftVbs} = require('./lib/outlookDraftVbs.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-outlook-client-'));
    try {
        const pdfPath = path.join(dir, safeName(body.attachmentName || 'EMS_QuoteDraft.pdf'));
        fs.writeFileSync(pdfPath, Buffer.from(body.pdfBase64, 'base64'));
        const extraAttachmentPaths = (body.extraAttachments || []).map((item, index) => {
            const subdir = path.join(dir, `extra-${index}`);fs.mkdirSync(subdir);
            const target = path.join(subdir, safeName(item.filename));
            fs.writeFileSync(target, Buffer.from(item.base64, 'base64'));return target;
        });
        const script = buildOutlookDraftVbs({...body, pdfPath, extraAttachmentPaths});
        const scriptPath = path.join(dir, 'draft.vbs');
        fs.writeFileSync(scriptPath, '\ufeff' + script, 'utf16le');
        await new Promise((resolve,reject) => execFile('wscript.exe', ['//B', '//T:60', scriptPath], {windowsHide:true,timeout:65000}, error => error ? reject(new Error('Outlook could not create the draft. Open Classic Outlook and check its profile, then retry.')) : resolve()));
    } finally {
        const timer = setTimeout(() => fs.rmSync(dir, {recursive:true,force:true}), 120000);
        timer.unref();
    }
}

function createHelper({allowedOrigins = ['http://151.50.1.38'], draftOpener = openDraft} = {}) {
    const origins = new Set(allowedOrigins);
    let busy = false;
    return http.createServer(async (req,res) => {
        const origin = req.headers.origin;
        const trusted = origins.has(origin);
        const reply = (status,data) => {res.writeHead(status, {'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
        if (!['127.0.0.1:39281','localhost:39281'].includes(req.headers.host)) return reply(403,{error:'Invalid helper host'});
        if (origin && !trusted) return reply(403,{error:'This EMS origin is not allowed'});
        if (trusted) {
            res.setHeader('Access-Control-Allow-Origin',origin);
            res.setHeader('Vary','Origin');
            res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers','Content-Type');
            res.setHeader('Access-Control-Allow-Private-Network','true');
        }
        if (req.method === 'OPTIONS' && trusted) {res.writeHead(204);return res.end();}
        if (req.method === 'GET' && req.url === '/health') return reply(200,{ok:true,service:'ems-outlook-local-helper',version:VERSION,scope:'quote-drafts',busy});
        if (req.method !== 'POST' || req.url !== '/outlook-draft') return reply(404,{error:'Not found'});
        if (!trusted) return reply(403,{error:'An allowed EMS Origin header is required'});
        if (!String(req.headers['content-type'] || '').startsWith('application/json')) return reply(415,{error:'JSON required'});
        if (busy) return reply(409,{error:'A draft is already being opened. Wait for Outlook before retrying.'});
        busy = true;
        const requestId = randomUUID();
        try {
            let size = 0; const chunks = [];
            for await (const chunk of req) {
                size += chunk.length;
                if (size > MAX_BODY) {reply(413,{error:'Draft attachments exceed 55 MB'});return;}
                chunks.push(chunk);
            }
            let body;
            try {body=JSON.parse(Buffer.concat(chunks).toString('utf8'));validatePayload(body);}
            catch(error){return reply(400,{error:error.message});}
            await draftOpener(body);
            reply(200,{success:true,via:'local-helper',requestId});
        } catch(error) {reply(500,{error:error.message,requestId});}
        finally {busy=false;}
    });
}

if (require.main === module) {
    const configPath = path.join(__dirname, 'config.json');
    const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath,'utf8')) : {};
    const server = createHelper(config);
    server.requestTimeout=90000;
    server.on('error', error => {console.error(`EMS helper: ${error.message}`);process.exitCode=1;});
    server.listen(PORT,'127.0.0.1',()=>console.log(`EMS quote Outlook helper ${VERSION}: http://127.0.0.1:${PORT}`));
}
module.exports={createHelper,validatePayload,VERSION};
