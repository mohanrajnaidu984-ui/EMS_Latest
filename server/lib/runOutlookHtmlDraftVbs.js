/**
 * Write HTML + VBScript and run wscript to open/send an Outlook mail item.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { buildOutlookHtmlDraftVbs, buildOutlookCustomerAckDraftVbs } = require('./outlookDraftVbs');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {object} opts
 * @param {string} opts.html
 * @param {string} [opts.to]
 * @param {string} [opts.cc]
 * @param {string} [opts.subject]
 * @param {boolean} [opts.send]
 * @param {boolean} [opts.windowsHide]
 * @param {string} [opts.tmpSubdir]
 * @param {boolean} [opts.useDefaultSignature] - Display first; prepend body before Outlook signature
 */
async function runOutlookHtmlDraftVbs(opts) {
    const dir = path.join(os.tmpdir(), opts.tmpSubdir || 'ems-outlook', String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8));
    fs.mkdirSync(dir, { recursive: true });
    const htmlPath = path.join(dir, 'email-body.html');
    fs.writeFileSync(htmlPath, '\uFEFF' + String(opts.html || ''), 'utf8');

    const vbsPath = path.join(dir, 'open-outlook.vbs');
    const vbsBuilder =
        opts.useDefaultSignature && !opts.send
            ? buildOutlookCustomerAckDraftVbs
            : buildOutlookHtmlDraftVbs;
    fs.writeFileSync(
        vbsPath,
        vbsBuilder({
            htmlPath,
            to: opts.to,
            cc: opts.cc,
            subject: opts.subject,
            replyTo: opts.replyTo,
            replyToName: opts.replyToName,
            attachmentPaths: opts.attachmentPaths || [],
            send: !!opts.send,
        }),
        'utf8'
    );

    await new Promise((resolve, reject) => {
        execFile(
            'wscript.exe',
            ['//B', vbsPath],
            { windowsHide: opts.windowsHide !== false },
            (err) => {
                setTimeout(() => {
                    try {
                        fs.rmSync(dir, { recursive: true, force: true });
                    } catch {
                        /* ignore */
                    }
                }, 120000);
                if (err) reject(err);
                else resolve();
            }
        );
    });

    if (!opts.send) {
        await sleep(600);
    }
}

module.exports = { runOutlookHtmlDraftVbs, sleep };
