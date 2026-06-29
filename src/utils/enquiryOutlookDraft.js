/**
 * Enquiry emails via Outlook COM (Windows + VBScript).
 * 1) Internal notification — direct send to SEs + CC (local helper uses your Outlook profile)
 * 2) Customer acknowledgement — draft only; must use local helper so From = your mailbox + Reply-To = concerned SE
 */

const LOCAL_HELPER_HEALTH_URLS = [
    'http://127.0.0.1:39281/health',
    'http://localhost:39281/health',
];

const LOCAL_INTERNAL_URLS = [
    'http://127.0.0.1:39281/enquiry-outlook-draft',
    'http://localhost:39281/enquiry-outlook-draft',
];

const LOCAL_CUSTOMER_ACK_URLS = [
    'http://127.0.0.1:39281/enquiry-customer-ack-draft',
    'http://localhost:39281/enquiry-customer-ack-draft',
];

const DRAFT_VBS_NAME = 'EMS_OpenEnquiryDraft.vbs';

const HELPER_START_HINT =
    'Start the EMS Outlook helper on this PC (classic Outlook must be open):\n' +
    '  node scripts/quote-outlook-local-helper.js\n' +
    'Optional: add a Windows login shortcut so it runs automatically.';

async function postJson(url, payload, timeoutMs = 120000) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'omit',
            body: JSON.stringify(payload),
            signal: controller?.signal,
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            return { ok: false, error: data.message || data.error || res.statusText };
        }
        return { ok: true, data: await res.json().catch(() => ({})) };
    } catch (e) {
        return { ok: false, error: e?.message || String(e) };
    } finally {
        if (timer) clearTimeout(timer);
    }
}

async function tryUrls(urls, payload, timeoutMs) {
    let lastError = '';
    for (const url of urls) {
        const result = await postJson(url, payload, timeoutMs);
        if (result.ok) return { ok: true, via: 'local-helper', ...result.data };
        lastError = result.error || lastError;
    }
    return { ok: false, error: lastError };
}

/** True when quote-outlook-local-helper.js is listening on this machine. */
export async function isOutlookLocalHelperAvailable() {
    for (const url of LOCAL_HELPER_HEALTH_URLS) {
        try {
            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timer = controller ? setTimeout(() => controller.abort(), 2000) : null;
            const res = await fetch(url, { method: 'GET', credentials: 'omit', signal: controller?.signal });
            if (timer) clearTimeout(timer);
            if (res.ok) return true;
        } catch {
            /* try next */
        }
    }
    return false;
}

/** Internal enquiry notification — direct send (no draft window). */
export async function sendEnquiryInternalNotification({ apiBase, requestNo, concernedSEs, userEmail, userDisplayName }) {
    const payload = {
        requestNo: String(requestNo || '').trim(),
        concernedSEs: Array.isArray(concernedSEs) ? concernedSEs.filter(Boolean) : [],
        userEmail: userEmail || '',
        userDisplayName: userDisplayName || '',
    };

    const localTry = await tryUrls(LOCAL_INTERNAL_URLS, payload, 15000);
    if (localTry.ok) return { ok: true, method: 'local-helper', ...localTry };

    const serverTry = await postJson(`${apiBase}/api/enquiries/outlook-draft`, payload, 120000);
    if (serverTry.ok) return { ok: true, method: 'server', ...serverTry.data };

    return {
        ok: false,
        error:
            (serverTry.error || 'Could not send internal notification email') +
            '\n\n' +
            HELPER_START_HINT,
    };
}

/**
 * Customer acknowledgement — Outlook draft on this PC only (not via IIS/server).
 * From = your Outlook account; Reply-To = acknowledgement concerned SE.
 */
export async function openCustomerAcknowledgementDraft({
    apiBase,
    requestNo,
    acknowledgementSE,
    createdBy,
    createdByEmail,
    concernedSEs,
    customerAckTargets,
}) {
    const payload = {
        requestNo: String(requestNo || '').trim(),
        acknowledgementSE: String(acknowledgementSE || '').trim(),
        createdBy: String(createdBy || '').trim(),
        createdByEmail: String(createdByEmail || '').trim(),
        concernedSEs: Array.isArray(concernedSEs) ? concernedSEs.filter(Boolean) : [],
        customerAckTargets: Array.isArray(customerAckTargets) ? customerAckTargets : [],
    };

    const localTry = await tryUrls(LOCAL_CUSTOMER_ACK_URLS, payload, 120000);
    if (localTry.ok) return { ok: true, method: 'local-helper', ...localTry };

    const helperUp = await isOutlookLocalHelperAvailable();
    if (!helperUp) {
        return {
            ok: false,
            error:
                'Customer acknowledgement must open in your desktop Outlook (correct From address and Reply-To to the concerned engineer).\n\n' +
                HELPER_START_HINT,
        };
    }

    return {
        ok: false,
        error:
            (localTry.error || 'Could not open customer acknowledgement draft in Outlook') +
            '\n\nEnsure classic Outlook desktop is open, then try again.',
    };
}

/** @deprecated Use sendEnquiryInternalNotification */
export async function openEnquiryOutlookDraft(params) {
    return sendEnquiryInternalNotification(params);
}

export { DRAFT_VBS_NAME, HELPER_START_HINT };
