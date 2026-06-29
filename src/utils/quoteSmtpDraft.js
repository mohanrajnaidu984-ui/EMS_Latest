/**
 * Quote email draft: opens Outlook popup when possible (local helper / server COM / .eml shell open).
 * From address = logged-in user; SMTP settings used to verify/build the message.
 */

const LOCAL_OUTLOOK_URLS = [
    'http://127.0.0.1:39281/outlook-draft',
    'http://localhost:39281/outlook-draft',
];
const LOCAL_EML_OPEN_URLS = [
    'http://127.0.0.1:39281/open-eml-draft',
    'http://localhost:39281/open-eml-draft',
];

export const QUOTE_EML_DRAFT_NAME = () => `EMS_QuoteDraft_${Date.now()}.eml`;

export async function fetchQuoteOutlookEmailFields(apiBase, params) {
    try {
        const qs = new URLSearchParams({
            userEmail: params.userEmail || '',
            toName: params.toName || '',
            toAttention: params.toAttention || '',
            requestNo: params.requestNo || '',
            isInternal: params.isInternal ? '1' : '0',
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

export async function openQuoteSmtpDraft({
    apiBase,
    pdfBlob,
    displayFileName,
    userEmail,
    userDisplayName,
    emailFields,
    triggerBlobDownload,
    blobToBase64,
}) {
    try {
        let pdfBase64 = '';
        if (pdfBlob) {
            const raw = await blobToBase64(pdfBlob);
            pdfBase64 = raw.includes(',') ? raw.split(',')[1] : raw;
        }
        
        const helperPayload = {
            pdfBase64,
            attachmentName: displayFileName || 'EMS_QuoteDraft.pdf',
            to: emailFields.to,
            cc: emailFields.cc,
            bcc: emailFields.bcc,
            subject: emailFields.subject,
            body: emailFields.body,
            fromEmail: userEmail,
            fromDisplayName: userDisplayName,
            extraAttachments: emailFields.extraAttachments || []
        };

        const helperRes = await fetch('http://127.0.0.1:39281/outlook-draft', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(helperPayload),
        });
        
        if (helperRes.ok) {
            return {
                ok: true,
                openedInOutlook: true,
                fileName: displayFileName || 'EMS_QuoteDraft.pdf',
            };
        }
    } catch (helperErr) {
        console.warn('[openQuoteSmtpDraft] Local helper not running or failed, falling back to server EML generation:', helperErr);
    }

    try {
        // Fallback: Generate EML on server and download it
        const res = await fetch(`${apiBase}/api/quotes/email-draft`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userEmail,
                userDisplayName,
                emailFields,
            }),
        });

        if (!res.ok) {
            let errorText = 'Draft creation failed';
            try {
                const errJson = await res.json();
                errorText = errJson.error || errorText;
            } catch {
                errorText = await res.text();
            }
            throw new Error(`Server returned ${res.status}: ${errorText}`);
        }

        const blob = await res.blob();
        const fileName = QUOTE_EML_DRAFT_NAME();
        triggerBlobDownload(blob, fileName);
        
        return {
            ok: true,
            openedInOutlook: false,
            fileName: fileName,
        };
    } catch (e) {
        return {
            ok: false,
            error: e.message || String(e),
        };
    }
}
