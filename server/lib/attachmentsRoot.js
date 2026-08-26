const fs = require('fs');
const path = require('path');

/**
 * Shared root for enquiry + quote file storage.
 * ENQUIRY_ATTACHMENTS_ROOT (or EMS_ATTACHMENTS_ROOT) — UNC path when set.
 */
function normalizeEnvRoot() {
    const fromEnv = process.env.ENQUIRY_ATTACHMENTS_ROOT || process.env.EMS_ATTACHMENTS_ROOT;
    if (fromEnv && String(fromEnv).trim()) {
        return path.normalize(String(fromEnv).trim());
    }
    return null;
}





/** Base dir used before per-request subfolders (for mkdir + logs). */
function resolveEnquiryAttachmentsBase() {
    const envRoot = normalizeEnvRoot();
    if (envRoot) return envRoot;
    return path.join(__dirname, '..', 'uploads', 'enquiries');
}

function resolveEnquiryUploadDestination(requestNo) {
    const rawNo = requestNo != null ? String(requestNo) : 'unknown';
    const safeRequestNo = rawNo.replace(/[^a-zA-Z0-9-_]/g, '_') || 'unknown';
    const envRoot = normalizeEnvRoot();
    if (envRoot) return path.join(envRoot, safeRequestNo);
    return path.join(__dirname, '..', 'uploads', 'enquiries', safeRequestNo);
}

function sanitizeFolderName(raw, fallback = 'General') {
    const s = String(raw || '').trim();
    const safe = s.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
    return safe || fallback;
}

function resolveEnquiryAttachmentVisibilityBase(visibility) {
    const v = String(visibility || 'Public').toLowerCase();
    const explicitPublic = process.env.ENQUIRY_ATTACHMENTS_PUBLIC_ROOT;
    const explicitPrivate = process.env.ENQUIRY_ATTACHMENTS_PRIVATE_ROOT;
    const envRoot = normalizeEnvRoot();
    if (v === 'private') {
        if (explicitPrivate && String(explicitPrivate).trim()) {
            return path.normalize(String(explicitPrivate).trim());
        }
        if (envRoot) return path.join(envRoot, 'Enquiries', 'Private');
        return path.join(__dirname, '..', 'uploads', 'enquiries', 'Private');
    }
    if (explicitPublic && String(explicitPublic).trim()) {
        return path.normalize(String(explicitPublic).trim());
    }
    if (envRoot) return path.join(envRoot, 'Enquiries', 'Public');
    return path.join(__dirname, '..', 'uploads', 'enquiries', 'Public');
}

function resolveLocalEnquiryAttachmentsRoot() {
    const explicit =
        process.env.EMS_ATTACHMENTS_LOCAL_ROOT || process.env.ENQUIRY_ATTACHMENTS_LOCAL_ROOT;
    if (explicit && String(explicit).trim()) {
        return path.normalize(String(explicit).trim());
    }
    return path.join(__dirname, '..', 'data', 'ems-attachments');
}

function resolveEnquiryUploadDestinationWithRoot(root, requestNo, visibility, division) {
    const rawNo = requestNo != null ? String(requestNo) : 'unknown';
    const safeRequestNo = sanitizeFolderName(rawNo, 'unknown');
    const safeDivision = sanitizeFolderName(division, 'General');
    const v = String(visibility || 'Public').toLowerCase();
    const visFolder = v === 'private'
        ? path.join('Enquiries', 'Private')
        : path.join('Enquiries', 'Public');
    return path.join(root, visFolder, safeRequestNo, safeDivision);
}

function canWriteToDirectory(dest) {
    if (!dest) return { ok: false, error: 'empty destination' };
    try {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        const probe = path.join(dest, `.ems-write-probe-${process.pid}-${Date.now()}`);
        fs.writeFileSync(probe, 'ok');
        fs.unlinkSync(probe);
        return { ok: true };
    } catch (err) {
        return {
            ok: false,
            error: `${err.code || 'ERR'}: ${err.message}`,
        };
    }
}

/**
 * Resolve upload destination under ENQUIRY_ATTACHMENTS_ROOT only.
 * Never writes to backend data/ems-attachments — if UNC is not writable, upload fails.
 *
 * On Windows, Node/PM2 running as SYSTEM accesses UNC as the machine account
 * (e.g. ACG-WEBSVR02$ on 151.50.1.38). That account must have Modify on the share + NTFS.
 */
function resolveWritableEnquiryUploadDestination(requestNo, visibility, division) {
    const primary = resolveEnquiryUploadDestinationByVisibility(requestNo, visibility, division);
    const writeCheck = canWriteToDirectory(primary);
    if (writeCheck.ok) {
        return { dest: primary, usedFallback: false };
    }

    const err = new Error(
        `Attachment folder is not writable: ${primary}. ` +
            `(${writeCheck.error || 'unknown'}). ` +
            'Files must be saved under ENQUIRY_ATTACHMENTS_ROOT only (backend local storage is disabled). ' +
            'Grant Modify on the UNC share + NTFS to the machine account of the EMS web server ' +
            '(PM2 as SYSTEM → ACG-WEBSVR02$ on 151.50.1.38).'
    );
    err.code = 'ATTACHMENT_STORAGE_EPERM';
    err.writeDetail = writeCheck.error;
    err.attemptedPath = primary;
    throw err;
}

function resolveEnquiryUploadDestinationByVisibility(requestNo, visibility, division) {
    const rawNo = requestNo != null ? String(requestNo) : 'unknown';
    const safeRequestNo = sanitizeFolderName(rawNo, 'unknown');
    const safeDivision = sanitizeFolderName(division, 'General');
    const base = resolveEnquiryAttachmentVisibilityBase(visibility);
    return path.join(base, safeRequestNo, safeDivision);
}

/**
 * Folder under ENQUIRY_ATTACHMENTS_ROOT for quote files (default `Quotes` to match \\share\ems app\Quotes\…).
 * Override with QUOTE_ATTACHMENTS_SUBFOLDER e.g. `quotes` if an older deploy used lowercase.
 */
function quoteAttachmentsSubfolder() {
    const s = process.env.QUOTE_ATTACHMENTS_SUBFOLDER;
    if (s != null && String(s).trim()) return String(s).trim();
    return 'Quotes';
}

/** Parent directory for all quote attachment folders (no per-quote id). For logs / ops. */
function resolveQuoteAttachmentsBase() {
    const explicit =
        process.env.QUOTE_ATTACHMENTS_ROOT || process.env.EMS_QUOTE_ATTACHMENTS_ROOT;
    if (explicit && String(explicit).trim()) {
        return path.normalize(String(explicit).trim());
    }
    const envRoot = normalizeEnvRoot();
    if (envRoot) {
        return path.join(envRoot, quoteAttachmentsSubfolder());
    }
    return path.join(__dirname, '..', 'uploads', 'quotes');
}

function resolveQuoteUploadDestination(quoteId) {
    const raw = quoteId != null ? String(quoteId) : 'unknown';
    const safeId = raw.replace(/[^a-zA-Z0-9-_]/g, '_') || 'unknown';

    /** Full UNC/base for quote files, e.g. \\151.50.20.129\ems app\Quotes — optional; overrides subfolder layout */
    const explicitRoot =
        process.env.QUOTE_ATTACHMENTS_ROOT || process.env.EMS_QUOTE_ATTACHMENTS_ROOT;
    if (explicitRoot && String(explicitRoot).trim()) {
        return path.join(path.normalize(String(explicitRoot).trim()), safeId);
    }

    const envRoot = normalizeEnvRoot();
    if (envRoot) {
        return path.join(envRoot, quoteAttachmentsSubfolder(), safeId);
    }
    return path.join(__dirname, '..', 'uploads', 'quotes', safeId);
}

module.exports = {
    normalizeEnvRoot,
    resolveEnquiryAttachmentsBase,
    resolveEnquiryUploadDestination,
    resolveEnquiryAttachmentVisibilityBase,
    resolveEnquiryUploadDestinationByVisibility,
    resolveLocalEnquiryAttachmentsRoot,
    resolveWritableEnquiryUploadDestination,
    resolveQuoteAttachmentsBase,
    resolveQuoteUploadDestination,
    sanitizeFolderName,
};
