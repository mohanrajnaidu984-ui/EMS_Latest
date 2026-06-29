/**
 * Open an Outlook draft with the quote PDF attached (Windows + classic Outlook COM).
 * Tries: local helper → API on same PC → Downloads VBS fallback.
 */

import { quotePerfStart, isQuoteExportPerfEnabled } from '../components/Quote/quoteExportPerf.js';

const LOCAL_HELPER_URLS = [
    'http://127.0.0.1:39281/outlook-draft',
    'http://localhost:39281/outlook-draft',
];

const DRAFT_PDF_NAME = 'EMS_QuoteDraft.pdf';
const DRAFT_VBS_NAME = 'EMS_OpenQuoteDraft.vbs';

function escapeVbsString(value) {
    return String(value ?? '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .map((line) => line.replace(/"/g, '""'))
        .join('" & vbCrLf & "');
}

function plainTextToOutlookHtml(plain) {
    return String(plain ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/\r\n|\r|\n/g, '<br>');
}

function buildPrependHtmlBodyVbs(msgHtmlEscaped) {
    return `Dim htmlBody, msgHtml, insertAt, bodyEnd, sigAt, iWait
msgHtml = "<div style=""font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#000000;"">" & _
  "${msgHtmlEscaped}" & _
  "</div>"
Set insp = olMail.GetInspector
If Not insp Is Nothing Then insp.Activate
iWait = 0
Do While Len(olMail.HTMLBody) < 30 And iWait < 30
  WScript.Sleep 200
  iWait = iWait + 1
Loop
htmlBody = olMail.HTMLBody
sigAt = InStr(1, htmlBody, "id=""Signature""", vbTextCompare)
If sigAt = 0 Then sigAt = InStr(1, htmlBody, "id=Signature", vbTextCompare)
If sigAt = 0 Then sigAt = InStr(1, htmlBody, "<!-- Signature", vbTextCompare)
If sigAt > 0 Then
  olMail.HTMLBody = Left(htmlBody, sigAt - 1) & msgHtml & Mid(htmlBody, sigAt)
Else
  insertAt = InStr(1, LCase(htmlBody), "<body")
  If insertAt > 0 Then
    bodyEnd = InStr(insertAt, htmlBody, ">")
    If bodyEnd > 0 Then
      olMail.HTMLBody = Left(htmlBody, bodyEnd) & msgHtml & Mid(htmlBody, bodyEnd + 1)
    Else
      olMail.HTMLBody = msgHtml & htmlBody
    End If
  Else
    olMail.HTMLBody = msgHtml & htmlBody
  End If
End If`;
}

/**
 * VBS that reads PDF + optional extra files from the user's Downloads folder.
 */
export function buildOutlookDraftVbsForDownloads({
    pdfFileName = DRAFT_PDF_NAME,
    extraAttachmentFileNames = [],
    to = '',
    cc = '',
    bcc = '',
    subject = '',
    body = '',
}) {
    const pdfPathExpr = 'fso.BuildPath(downloads, "' + String(pdfFileName).replace(/"/g, '""') + '")';
    const toEsc = escapeVbsString(to);
    const ccEsc = escapeVbsString(cc);
    const bccEsc = escapeVbsString(bcc);
    const subjEsc = escapeVbsString(subject);
    const msgHtmlEscaped = escapeVbsString(plainTextToOutlookHtml(body));

    const extraAttachLines = (extraAttachmentFileNames || [])
        .map((name) => {
            const safe = String(name).replace(/"/g, '""');
            return `
extraPath = fso.BuildPath(downloads, "${safe}")
If fso.FileExists(extraPath) Then
  olMail.Attachments.Add extraPath
End If`;
        })
        .join('\n');

    return `Option Explicit
On Error Resume Next
Dim fso, shell, downloads, pdfPath, olApp, olMail, waited, extraPath, insp
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
downloads = shell.ExpandEnvironmentStrings("%USERPROFILE%\\Downloads")
pdfPath = ${pdfPathExpr}
waited = 0
Do While Not fso.FileExists(pdfPath) And waited < 45
  WScript.Sleep 1000
  waited = waited + 1
Loop
If Not fso.FileExists(pdfPath) Then
  MsgBox "Quote PDF not found in Downloads:" & vbCrLf & pdfPath & vbCrLf & vbCrLf & "Click Email in EMS again and wait for the PDF download.", vbExclamation, "EMS Quote"
  WScript.Quit 1
End If
Set olApp = CreateObject("Outlook.Application")
If Err.Number <> 0 Then
  MsgBox "Could not start Outlook (" & Err.Number & ")." & vbCrLf & vbCrLf & "Use Outlook desktop (classic). New Outlook may not support COM.", vbCritical, "EMS Quote"
  WScript.Quit Err.Number
End If
Err.Clear
Set olMail = olApp.CreateItem(0)
${to ? `olMail.To = "${toEsc}"` : ''}
${cc ? `olMail.CC = "${ccEsc}"` : ''}
${bcc ? `olMail.BCC = "${bccEsc}"` : ''}
${subject ? `olMail.Subject = "${subjEsc}"` : ''}
olMail.BodyFormat = 2
olMail.Attachments.Add pdfPath
${extraAttachLines}
olMail.Display
${
    body
        ? `If Err.Number = 0 Then
  ${buildPrependHtmlBodyVbs(msgHtmlEscaped)}
End If`
        : ''
}
If Err.Number <> 0 Then
  MsgBox "Outlook draft error: " & Err.Description, vbCritical, "EMS Quote"
  WScript.Quit Err.Number
End If
WScript.Quit 0
`;
}

async function postOutlookDraft(url, payload, timeoutMs = 120000) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'omit',
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            return { ok: false, error: data.error || res.statusText || String(res.status) };
        }
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e?.message || String(e) };
    } finally {
        window.clearTimeout(timer);
    }
}

function localHelperTimeoutMs(payload) {
    const base64Len = payload?.pdfBase64?.length || 0;
    /** Large PDF base64 POST needs well beyond 8s; cap at 3 min. */
    return Math.min(180000, Math.max(20000, 20000 + Math.floor(base64Len / 600)));
}

export async function tryOpenOutlookDraftViaLocalHelper(payload) {
    const timeoutMs = localHelperTimeoutMs(payload);
    for (const url of LOCAL_HELPER_URLS) {
        const result = await postOutlookDraft(url, payload, timeoutMs);
        if (result.ok) return { ok: true, via: 'local-helper', url, timeoutMs };
    }
    return { ok: false };
}

export async function fetchQuoteOutlookEmailFields(apiBase, { userEmail, toName, toAttention, requestNo, isInternal }) {
    try {
        const qs = new URLSearchParams({
            userEmail: userEmail || '',
            toName: toName || '',
            toAttention: toAttention || '',
            requestNo: requestNo || '',
            isInternal: isInternal ? '1' : '0',
        });
        const res = await fetch(`${apiBase}/api/quotes/outlook-email-fields?${qs}`, {
            credentials: 'include',
        });
        if (!res.ok) return { to: '', cc: '', ccList: [] };
        return await res.json();
    } catch {
        return { to: '', cc: '', ccList: [] };
    }
}

export async function tryOpenOutlookDraftViaServer(apiBase, payload) {
    try {
        const res = await fetch(`${apiBase}/api/quotes/outlook-draft`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload),
        });
        if (res.ok) return { ok: true, via: 'server' };
        const data = await res.json().catch(() => ({}));
        return { ok: false, error: data.error || data.details || res.statusText };
    } catch (e) {
        return { ok: false, error: e?.message || String(e) };
    }
}

/**
 * @param {object} params
 * @param {string} params.apiBase
 * @param {Blob} params.pdfBlob
 * @param {string} [params.displayFileName] - Original PDF filename for server temp
 * @param {object} params.emailFields - { to, cc, bcc, subject, body }
 * @param {string[]} [params.extraAttachmentFileNames] - Filenames saved to Downloads before VBS
 * @param {function} params.triggerBlobDownload
 * @param {function} params.sleep
 * @param {function} params.blobToBase64
 */
export async function openQuoteOutlookDraft({
    apiBase,
    pdfBlob,
    displayFileName,
    emailFields,
    extraAttachmentFileNames = [],
    triggerBlobDownload,
    sleep,
    blobToBase64,
}) {
    if (pdfBlob && (!(pdfBlob instanceof Blob) || pdfBlob.size < 200)) {
        throw new Error('Quote PDF attachment is empty or invalid.');
    }

    const stages = {};
    const tBase64 = quotePerfStart('Email — PDF base64 encode');
    const pdfBase64 = pdfBlob ? await blobToBase64(pdfBlob) : '';
    stages.base64Ms = tBase64.end({ bytes: pdfBlob?.size || 0 });

    if (pdfBlob && (!pdfBase64 || pdfBase64.length < 100)) {
        throw new Error('Quote PDF could not be encoded for Outlook.');
    }

    const payload = {
        to: emailFields.to || '',
        cc: emailFields.cc || '',
        bcc: emailFields.bcc || '',
        subject: emailFields.subject || '',
        body: emailFields.body || '',
        attachmentName: displayFileName || DRAFT_PDF_NAME,
        pdfBase64,
        extraAttachments: emailFields.extraAttachments || [],
    };

    const tLocal = quotePerfStart('Email — Outlook local helper');
    const localTry = await tryOpenOutlookDraftViaLocalHelper(payload);
    stages.localMs = tLocal.end();
    if (localTry.ok) {
        if (isQuoteExportPerfEnabled()) console.log('[QuotePerf] Email Outlook', stages);
        return { ok: true, method: 'local-helper' };
    }

    const tServer = quotePerfStart('Email — Outlook server COM');
    const serverTry = await tryOpenOutlookDraftViaServer(apiBase, payload);
    stages.serverMs = tServer.end();
    if (serverTry.ok) {
        if (isQuoteExportPerfEnabled()) console.log('[QuotePerf] Email Outlook', stages);
        return { ok: true, method: 'server' };
    }

    if (pdfBlob) {
        const attachName = String(displayFileName || DRAFT_PDF_NAME).replace(/[/\\?%*:|"<>]/g, '_');
        triggerBlobDownload(pdfBlob, attachName);
        await sleep(Math.min(3000, 900 + Math.floor((pdfBlob.size || 0) / 80000)));
    }

    const vbsAttachName = String(displayFileName || DRAFT_PDF_NAME).replace(/[/\\?%*:|"<>]/g, '_');
    const vbs = buildOutlookDraftVbsForDownloads({
        pdfFileName: vbsAttachName,
        extraAttachmentFileNames,
        to: emailFields.to,
        cc: emailFields.cc,
        bcc: emailFields.bcc,
        subject: emailFields.subject,
        body: emailFields.body,
    });
    const vbsBlob = new Blob([vbs], { type: 'text/plain;charset=utf-8' });
    triggerBlobDownload(vbsBlob, DRAFT_VBS_NAME);
    await sleep(250);

    if (typeof navigator !== 'undefined' && typeof navigator.msSaveOrOpenBlob === 'function') {
        try {
            navigator.msSaveOrOpenBlob(vbsBlob, DRAFT_VBS_NAME);
            return {
                ok: true,
                method: 'vbs-prompt',
                serverError: serverTry.error,
            };
        } catch {
            /* fall through */
        }
    }

    if (isQuoteExportPerfEnabled()) console.log('[QuotePerf] Email Outlook (VBS fallback)', stages);
    return {
        ok: true,
        method: 'vbs-manual',
        serverError: serverTry.error,
    };
}

export { DRAFT_PDF_NAME, DRAFT_VBS_NAME };
