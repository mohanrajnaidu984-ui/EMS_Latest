/**
 * Write HTML to a temp file and open/send via Outlook VBScript (Windows COM).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const {
    buildOutlookHtmlDraftVbs,
    buildOutlookCustomerAckDraftVbs,
} = require('./outlookDraftVbs');

/**
 * @param {object} opts
 * @param {string} opts.html - HTML body content
 * @param {string} [opts.to]
 * @param {string} [opts.cc]
 * @param {string} [opts.bcc]
 * @param {string} [opts.subject]
 * @param {string} [opts.replyTo]
 * @param {string} [opts.replyToName]
 * @param {boolean} [opts.send=false] - Send immediately instead of opening draft
 * @param {boolean} [opts.windowsHide=true]
 * @param {boolean} [opts.useDefaultSignature=false] - Insert body before Outlook signature
 * @param {string} [opts.tmpSubdir='ems-outlook-html']
 * @param {string[]} [opts.attachmentPaths]
 * @param {number} [opts.cleanupDelayMs=120000]
 */
async function runOutlookHtmlDraftVbs(opts = {}) {
    const html = String(opts.html ?? '');
    if (!html.trim()) {
        throw new Error('html is required');
    }

    const subdir = String(opts.tmpSubdir || 'ems-outlook-html');
    const dir = path.join(os.tmpdir(), subdir, String(Date.now()));
    fs.mkdirSync(dir, { recursive: true });

    const htmlPath = path.join(dir, 'email-body.html');
    const vbsPath = path.join(dir, 'open-outlook.vbs');

    try {
        fs.writeFileSync(htmlPath, '\uFEFF' + html, 'utf8');

        const vbsOpts = {
            htmlPath,
            to: opts.to || '',
            cc: opts.cc || '',
            bcc: opts.bcc || '',
            subject: opts.subject || '',
            replyTo: opts.replyTo || '',
            replyToName: opts.replyToName || '',
            attachmentPaths: opts.attachmentPaths || [],
            send: Boolean(opts.send),
        };

        const vbs = opts.useDefaultSignature
            ? buildOutlookCustomerAckDraftVbs(vbsOpts)
            : buildOutlookHtmlDraftVbs(vbsOpts);

        fs.writeFileSync(vbsPath, vbs, 'utf8');

        const windowsHide = opts.windowsHide !== false;
        const cleanupDelay = Number(opts.cleanupDelayMs) || 120000;

        await new Promise((resolve, reject) => {
            execFile('wscript.exe', ['//B', vbsPath], { windowsHide }, (err) => {
                setTimeout(() => {
                    try {
                        fs.rmSync(dir, { recursive: true, force: true });
                    } catch {
                        /* ignore */
                    }
                }, cleanupDelay);
                if (err) reject(err);
                else resolve();
            });
        });
    } catch (err) {
        try {
            fs.rmSync(dir, { recursive: true, force: true });
        } catch {
            /* ignore */
        }
        throw err;
    }
}

module.exports = { runOutlookHtmlDraftVbs };
