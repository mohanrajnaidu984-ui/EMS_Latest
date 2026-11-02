/**
 * Build VBScript that opens a classic Outlook mail draft with attachments (Windows COM).
 */

function escapeVbsString(value) {
    return String(value ?? '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .map((line) => line.replace(/"/g, '""'))
        .join('" & vbCrLf & "');
}

/** Plain message → HTML fragment (keeps Outlook signature HTML intact when prepended). */
function plainTextToOutlookHtml(plain) {
    return String(plain ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/\r\n|\r|\n/g, '<br>');
}

/** VBScript block: prepend HTML message after <body> so default signature images/links stay formatted. */
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
 * @param {object} opts
 * @param {string} opts.pdfPath - Absolute path to quote PDF
 * @param {string[]} [opts.extraAttachmentPaths] - Additional absolute paths
 * @param {string} [opts.to]
 * @param {string} [opts.cc]
 * @param {string} [opts.bcc]
 * @param {string} [opts.subject]
 * @param {string} [opts.body]
 * @param {string} [opts.fromEmail] - Logged-in user (SendUsingAccount when found)
 * @param {string} [opts.fromDisplayName]
 */
function buildOutlookDraftVbs(opts) {
    const pdfPath = String(opts.pdfPath || '').replace(/"/g, '""');
    const extraPaths = (opts.extraAttachmentPaths || []).map((p) =>
        String(p || '').replace(/"/g, '""')
    );
    const to = escapeVbsString(opts.to);
    const cc = escapeVbsString(opts.cc);
    const bcc = escapeVbsString(opts.bcc);
    const subject = escapeVbsString(opts.subject);
    const msgHtmlEscaped = escapeVbsString(plainTextToOutlookHtml(opts.body));
    const fromAccountVbs = ''; // No need to define from email ID as current user email ID; instead take the default user outlook account email id

    const extraAttachLines = extraPaths
        .map(
            (p, i) => `
If fso.FileExists("${p}") Then
  olMail.Attachments.Add "${p}"
End If`
        )
        .join('\n');

    const pdfCheckLines = pdfPath
        ? `pdfPath = "${pdfPath}"
waited = 0
Do While Not fso.FileExists(pdfPath) And waited < 45
  WScript.Sleep 1000
  waited = waited + 1
Loop
If Not fso.FileExists(pdfPath) Then
  MsgBox "Quote PDF not found:" & vbCrLf & pdfPath & vbCrLf & vbCrLf & "Click Email in EMS again and wait for the download to finish.", vbExclamation, "EMS Quote"
  WScript.Quit 1
End If`
        : '';

    return `Option Explicit
On Error Resume Next
Dim fso, olApp, olMail, pdfPath, waited, insp, acc, fromAddr, fromName
Set fso = CreateObject("Scripting.FileSystemObject")
${pdfCheckLines}
Set olApp = CreateObject("Outlook.Application")
If Err.Number <> 0 Then
  MsgBox "Could not start Outlook (" & Err.Number & ")." & vbCrLf & vbCrLf & "Use Outlook desktop (classic) with COM add-in support. New Outlook may not support this.", vbCritical, "EMS Quote"
  WScript.Quit Err.Number
End If
Err.Clear
Set olMail = olApp.CreateItem(0)
${fromAccountVbs}
${opts.to ? `olMail.To = "${to}"` : ''}
${opts.cc ? `olMail.CC = "${cc}"` : ''}
${opts.bcc ? `olMail.BCC = "${bcc}"` : ''}
${opts.subject ? `olMail.Subject = "${subject}"` : ''}
olMail.BodyFormat = 2
${pdfPath ? `olMail.Attachments.Add "${pdfPath}"` : ''}
${extraAttachLines}
olMail.Display
${
    opts.body
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

/**
 * Outlook draft with HTML body (no PDF). Writes HTML to a temp file for reliable UTF-8.
 * @param {object} opts
 * @param {string} opts.htmlPath - Absolute path to .html file
 * @param {string[]} [opts.attachmentPaths]
 * @param {string} [opts.to]
 * @param {string} [opts.cc]
 * @param {string} [opts.bcc]
 * @param {string} [opts.subject]
 * @param {string} [opts.replyTo] - Reply-To address (customer replies route here)
 * @param {string} [opts.replyToName]
 * @param {boolean} [opts.send] - If true, send immediately (no draft window). Default false (Display).
 */
function buildOutlookHtmlDraftVbs(opts) {
    const htmlPath = String(opts.htmlPath || '').replace(/"/g, '""');
    const extraPaths = (opts.attachmentPaths || []).map((p) => String(p || '').replace(/"/g, '""'));
    const to = escapeVbsString(opts.to);
    const cc = escapeVbsString(opts.cc);
    const bcc = escapeVbsString(opts.bcc);
    const subject = escapeVbsString(opts.subject);
    const replyTo = escapeVbsString(opts.replyTo);
    const replyToName = escapeVbsString(opts.replyToName || opts.replyTo);

    const extraAttachLines = extraPaths
        .map(
            (p) => `
If fso.FileExists("${p}") Then
  olMail.Attachments.Add "${p}"
End If`
        )
        .join('\n');

    return `Option Explicit
On Error Resume Next
Dim fso, olApp, olMail, htmlPath, insp
Set fso = CreateObject("Scripting.FileSystemObject")
htmlPath = "${htmlPath}"
If Not fso.FileExists(htmlPath) Then
  MsgBox "Email HTML file not found:" & vbCrLf & htmlPath, vbExclamation, "EMS Enquiry"
  WScript.Quit 1
End If
Set olApp = CreateObject("Outlook.Application")
If Err.Number <> 0 Then
  MsgBox "Could not start Outlook (" & Err.Number & "). Use classic Outlook desktop.", vbCritical, "EMS Enquiry"
  WScript.Quit Err.Number
End If
Err.Clear
Set olMail = olApp.CreateItem(0)
${opts.to ? `olMail.To = "${to}"` : ''}
${opts.cc ? `olMail.CC = "${cc}"` : ''}
${opts.bcc ? `olMail.BCC = "${bcc}"` : ''}
${opts.subject ? `olMail.Subject = "${subject}"` : ''}
${
    opts.replyTo
        ? `Dim replyRec
Set replyRec = olMail.ReplyRecipients.Add("${replyTo}")
If Len("${replyToName}") > 0 Then replyRec.Name = "${replyToName}"`
        : ''
}
olMail.BodyFormat = 2
Dim htmlStream
Set htmlStream = CreateObject("ADODB.Stream")
htmlStream.Type = 2
htmlStream.Charset = "utf-8"
htmlStream.Open
htmlStream.LoadFromFile htmlPath
olMail.HTMLBody = htmlStream.ReadText
htmlStream.Close
Set htmlStream = Nothing
${extraAttachLines}
${
    opts.send
        ? `olMail.Send`
        : `olMail.Display
Set insp = olMail.GetInspector
If Not insp Is Nothing Then insp.Activate`
}
If Err.Number <> 0 Then
  MsgBox "Outlook ${opts.send ? 'send' : 'draft'} error: " & Err.Description, vbCritical, "EMS Enquiry"
  WScript.Quit Err.Number
End If
WScript.Quit 0
`;
}

/**
 * Customer acknowledgement draft: Display first so Outlook adds default signature,
 * then insert body HTML immediately before the signature block.
 */
function buildOutlookCustomerAckDraftVbs(opts) {
    const htmlPath = String(opts.htmlPath || '').replace(/"/g, '""');
    const to = escapeVbsString(opts.to);
    const cc = escapeVbsString(opts.cc);
    const bcc = escapeVbsString(opts.bcc);
    const subject = escapeVbsString(opts.subject);
    const replyTo = escapeVbsString(opts.replyTo);
    const replyToName = escapeVbsString(opts.replyToName || opts.replyTo);

    const extraPaths = (opts.attachmentPaths || []).map((p) => String(p || '').replace(/"/g, '""'));
    const extraAttachLines = extraPaths
        .map(
            (p) => `
If fso.FileExists("${p}") Then
  olMail.Attachments.Add "${p}"
End If`
        )
        .join('\n');

    return `Option Explicit
On Error Resume Next
Dim fso, olApp, olMail, htmlPath, insp, htmlStream, msgHtml, htmlBody, sigAt, insertAt, bodyEnd, iWait
Set fso = CreateObject("Scripting.FileSystemObject")
htmlPath = "${htmlPath}"
If Not fso.FileExists(htmlPath) Then
  MsgBox "Email HTML file not found:" & vbCrLf & htmlPath, vbExclamation, "EMS Enquiry"
  WScript.Quit 1
End If
Set olApp = CreateObject("Outlook.Application")
If Err.Number <> 0 Then
  MsgBox "Could not start Outlook (" & Err.Number & "). Use classic Outlook desktop.", vbCritical, "EMS Enquiry"
  WScript.Quit Err.Number
End If
Err.Clear
Set olMail = olApp.CreateItem(0)
${opts.to ? `olMail.To = "${to}"` : ''}
${opts.cc ? `olMail.CC = "${cc}"` : ''}
${opts.bcc ? `olMail.BCC = "${bcc}"` : ''}
${opts.subject ? `olMail.Subject = "${subject}"` : ''}
${
    opts.replyTo
        ? `Dim replyRec
Set replyRec = olMail.ReplyRecipients.Add("${replyTo}")
If Len("${replyToName}") > 0 Then replyRec.Name = "${replyToName}"`
        : ''
}
olMail.BodyFormat = 2
${extraAttachLines}
olMail.Display
Set insp = olMail.GetInspector
If Not insp Is Nothing Then insp.Activate
iWait = 0
Do While Len(olMail.HTMLBody) < 30 And iWait < 40
  WScript.Sleep 200
  iWait = iWait + 1
Loop
Set htmlStream = CreateObject("ADODB.Stream")
htmlStream.Type = 2
htmlStream.Charset = "utf-8"
htmlStream.Open
htmlStream.LoadFromFile htmlPath
msgHtml = htmlStream.ReadText
htmlStream.Close
Set htmlStream = Nothing
If Left(msgHtml, 1) = ChrW(65279) Then msgHtml = Mid(msgHtml, 2)
msgHtml = "<div style=""font-family:Segoe UI, Tahoma, Arial, sans-serif;font-size:11pt;color:#1e293b;"">" & msgHtml & "</div>"
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
End If
If Err.Number <> 0 Then
  MsgBox "Outlook draft error: " & Err.Description, vbCritical, "EMS Enquiry"
  WScript.Quit Err.Number
End If
WScript.Quit 0
`;
}

module.exports = {
    buildOutlookDraftVbs,
    buildOutlookHtmlDraftVbs,
    buildOutlookCustomerAckDraftVbs,
    escapeVbsString,
    plainTextToOutlookHtml,
    buildPrependHtmlBodyVbs,
};
