import { format, parseISO, isValid } from 'date-fns';

export function normalizeApprovalEmail(raw) {
    return String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/@almcg\.com/g, '@almoayyedcg.com');
}

function truthyFinalFlag(raw) {
    if (raw === true || raw === 1 || raw === '1') return true;
    if (typeof raw === 'string') {
        const v = raw.trim().toLowerCase();
        return v === 'true' || v === 'yes' || v === 'y';
    }
    return false;
}

export function coerceFinalApproverFlags(steps) {
    const list = Array.isArray(steps) ? steps.map((s) => ({ ...s })) : [];
    if (!list.length) return list;
    if (list.length === 1) {
        list[0].isFinalApprover = true;
        return list;
    }
    const marked = list.filter((s) => s.isFinalApprover);
    if (marked.length === 1) {
        return list.map((s) => ({
            ...s,
            isFinalApprover: !!s.isFinalApprover,
        }));
    }
    if (marked.length === 0) {
        return list.map((s, i) => ({
            ...s,
            isFinalApprover: i === list.length - 1,
        }));
    }
    let lastIdx = -1;
    list.forEach((s, i) => {
        if (s.isFinalApprover) lastIdx = i;
    });
    return list.map((s, i) => ({
        ...s,
        isFinalApprover: i === lastIdx,
    }));
}

/**
 * Display order only: non-final first, final approver last.
 * Keeps original `sequence` values so approval actions still match DB rows.
 */
export function sortApprovalStepsFinalLast(steps) {
    const sorted = [...(Array.isArray(steps) ? steps : [])].sort(
        (a, b) => (Number(a.sequence) || 0) - (Number(b.sequence) || 0)
    );
    const coerced = coerceFinalApproverFlags(sorted);
    if (coerced.length <= 1) return coerced;
    const nonFinal = coerced.filter((s) => !s.isFinalApprover);
    const finals = coerced.filter((s) => s.isFinalApprover);
    return [...nonFinal, ...finals];
}

/**
 * Persist order: all non-final steps first (by sequence), final approver last.
 * Resequences 1..n so the final approver is always at the bottom.
 */
export function orderApprovalStepsFinalLast(steps) {
    const displayOrdered = sortApprovalStepsFinalLast(steps);
    if (displayOrdered.length <= 1) {
        return displayOrdered.map((s, i) => ({
            ...s,
            sequence: i + 1,
            isFinalApprover: true,
        }));
    }
    return displayOrdered.map((s, i) => ({
        ...s,
        sequence: i + 1,
        isFinalApprover: i === displayOrdered.length - 1,
    }));
}

export function assertFinalApproverRules(steps) {
    const list = Array.isArray(steps) ? steps : [];
    if (!list.length) {
        throw new Error('Add at least one approver');
    }
    if (list.length === 1) return;
    const finals = list.filter((s) => s.isFinalApprover);
    if (finals.length !== 1) {
        throw new Error('Select exactly one final approver when there is more than one approver');
    }
}

export function parseApprovalWorkflowJson(raw) {
    if (raw == null || raw === '') return [];
    let parsed = raw;
    if (typeof raw === 'string') {
        try {
            parsed = JSON.parse(raw);
        } catch {
            return [];
        }
    }
    const stepsRaw = Array.isArray(parsed) ? parsed : parsed?.steps;
    if (!Array.isArray(stepsRaw)) return [];
    return coerceFinalApproverFlags(
        stepsRaw
            .map((s, i) => normalizeApprovalStep(s, i))
            .filter(Boolean)
            .sort((a, b) => a.sequence - b.sequence)
            .map((s, i) => ({ ...s, sequence: i + 1 }))
    );
}

export function normalizeApprovalStep(raw, idx = 0) {
    if (!raw || typeof raw !== 'object') return null;
    const sequence = Number(raw.sequence ?? raw.Sequence ?? idx + 1);
    if (!Number.isFinite(sequence) || sequence < 1) return null;
    const statusRaw = String(raw.status ?? raw.Status ?? 'pending').trim().toLowerCase();
    const status = ['approved', 'rejected', 'pending'].includes(statusRaw) ? statusRaw : 'pending';
    const digitalSignatureJson =
        raw.digitalSignatureJson ??
        raw.ApproverDigitalSignatureJson ??
        raw.digital_signature_json ??
        null;
    return {
        sequence: Math.floor(sequence),
        approverEmail: String(raw.approverEmail ?? raw.ApproverEmail ?? '').trim(),
        approverName: String(raw.approverName ?? raw.ApproverName ?? '').trim(),
        approverDesignation: String(raw.approverDesignation ?? raw.ApproverDesignation ?? '').trim(),
        status,
        actionAt: raw.actionAt ?? raw.ActionAt ?? null,
        comments: String(raw.comments ?? raw.Comments ?? '').trim(),
        digitalSignatureJson,
        isFinalApprover: truthyFinalFlag(
            raw.isFinalApprover ?? raw.IsFinalApprover ?? raw.isFinal ?? raw.IsFinal
        ),
    };
}

/** Extract image data URL from ApproverDigitalSignatureJson / vault payload. */
export function extractApprovalSignatureImageUrl(raw) {
    if (raw == null || raw === '') return '';
    let obj = raw;
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (trimmed.startsWith('data:image')) return trimmed;
        try {
            obj = JSON.parse(trimmed);
        } catch {
            return '';
        }
    }
    if (!obj || typeof obj !== 'object') return '';
    if (obj.imageDataUrl) return String(obj.imageDataUrl);
    if (Array.isArray(obj.signatures) && obj.signatures.length) {
        const defId = obj.defaultSignatureId;
        const hit =
            (defId && obj.signatures.find((s) => s && s.id === defId)) || obj.signatures[0];
        return hit?.imageDataUrl ? String(hit.imageDataUrl) : '';
    }
    return '';
}

function normalizePersonKey(nameOrEmail) {
    return String(nameOrEmail || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

/**
 * Find approved-step signature image for a cover signatory / co-signatory name (or email).
 * Only exact name/email match — never borrow another approver's signature onto this line.
 */
export function findApprovedSignatureImageForPerson(steps, personName, personEmail = '') {
    const nameKey = normalizePersonKey(personName);
    const emailKey = normalizeApprovalEmail(personEmail);
    if (!nameKey && !emailKey) return '';
    const list = Array.isArray(steps) ? steps : [];
    for (const step of list) {
        if (String(step?.status || '').toLowerCase() !== 'approved') continue;
        const stepName = normalizePersonKey(step.approverName);
        const stepEmail = normalizeApprovalEmail(step.approverEmail);
        const nameOk = nameKey && stepName && stepName === nameKey;
        const emailOk = emailKey && stepEmail && emailKey === stepEmail;
        if (!nameOk && !emailOk) continue;
        const url = extractApprovalSignatureImageUrl(step.digitalSignatureJson);
        if (url) return url;
    }
    return '';
}

/**
 * Signatory / Co-Signatory cover images from approved workflow steps.
 * Shows an image only when that exact person has Approved and has a stored
 * ApproverDigitalSignatureJson — no sequence fallback (avoids placing
 * Lakshmanan's signature on Mohanraj's signatory line).
 */
export function resolveApprovalCoverSignatureImages(steps, signatoryName, coSignatoryName) {
    const list = Array.isArray(steps) ? steps : [];
    return {
        signatory: findApprovedSignatureImageForPerson(list, signatoryName) || '',
        coSignatory: findApprovedSignatureImageForPerson(list, coSignatoryName) || '',
    };
}

export function serializeApprovalWorkflowJson(steps) {
    const normalized = resequenceApprovalSteps(steps);
    return JSON.stringify({ steps: normalized });
}

/** Keep approvers / final flags; clear statuses for a new approval round (e.g. revision draft). */
export function resetApprovalStepsForNewRound(steps) {
    return orderApprovalStepsFinalLast(
        (Array.isArray(steps) ? steps : []).map((s, i) => ({
            sequence: Number(s.sequence) || i + 1,
            approverEmail: String(s.approverEmail || '').trim(),
            approverName: String(s.approverName || '').trim(),
            approverDesignation: String(s.approverDesignation || '').trim(),
            status: 'pending',
            actionAt: null,
            comments: '',
            digitalSignatureJson: null,
            isFinalApprover: !!s.isFinalApprover,
        }))
    );
}

export function resequenceApprovalSteps(steps) {
    return orderApprovalStepsFinalLast(
        (Array.isArray(steps) ? steps : [])
            .map((s, i) => normalizeApprovalStep(s, i))
            .filter(Boolean)
    );
}

export function getCurrentPendingApprovalStep(steps) {
    const sorted = [...(steps || [])].sort((a, b) => a.sequence - b.sequence);
    for (const step of sorted) {
        if (step.status === 'rejected') return null;
        if (step.status === 'pending') return step;
    }
    return null;
}

export function getFinalApproverStep(steps) {
    const sorted = coerceFinalApproverFlags([...(steps || [])].sort((a, b) => a.sequence - b.sequence));
    return sorted.find((s) => s.isFinalApprover) || null;
}

export function isFinalApproverApproved(steps) {
    const final = getFinalApproverStep(steps);
    return !!final && String(final.status || '').toLowerCase() === 'approved';
}

function approverMatchesUser(step, userEmail, userName = '') {
    const userNormEmail = normalizeApprovalEmail(userEmail);
    const stepEmail = normalizeApprovalEmail(step?.approverEmail);
    if (userNormEmail && stepEmail && userNormEmail === stepEmail) return true;
    const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const userNormName = norm(userName);
    const stepNormName = norm(step?.approverName);
    return userNormName.length > 0 && userNormName === stepNormName;
}

/** 'parallel' | 'sequential' | null. */
export function normalizeApprovalMode(raw) {
    const v = String(raw || '').trim().toLowerCase();
    if (v === 'sequential') return 'sequential';
    if (v === 'parallel') return 'parallel';
    return null;
}

export const APPROVAL_MODE_LABELS = {
    parallel: 'Parallel',
    sequential: 'One after another',
};

/** Divisions (quote OwnJob) whose approvers act one after another; keep in sync with server/lib/sequentialApproval.js. */
export const SEQUENTIAL_APPROVAL_DIVISIONS = ['ac maint-elec', 'ac maint-hvac'];

export function isSequentialApprovalDivision(ownJob, leadJobName = '') {
    const raw = String(String(ownJob || '').trim() || leadJobName || '').trim().toLowerCase();
    if (!raw) return false;
    const dash = raw.lastIndexOf(' - ');
    const key = dash >= 0 ? raw.slice(dash + 3).trim() : raw;
    return SEQUENTIAL_APPROVAL_DIVISIONS.includes(key);
}

/** Sequential mode: step whose turn it is (non-final by sequence, final last); null when rejected or complete. */
export function getSequentialActiveApprovalStep(steps) {
    const ordered = sortApprovalStepsFinalLast(steps);
    if (ordered.some((s) => String(s.status || '').toLowerCase() === 'rejected')) return null;
    return ordered.find((s) => String(s.status || '').toLowerCase() !== 'approved') || null;
}

/** Sequential mode: true once this approver's turn has come (already approved or currently active). */
export function hasSequentialApprovalTurnReached(steps, userEmail, userName = '') {
    for (const step of sortApprovalStepsFinalLast(steps)) {
        if (approverMatchesUser(step, userEmail, userName)) return true;
        if (String(step.status || '').toLowerCase() !== 'approved') return false;
    }
    return false;
}

/**
 * Pending step assigned to the signed-in user. Parallel by default; with `sequential`
 * only the step whose turn it is can be returned.
 */
export function getUserPendingApprovalStep(steps, userEmail, userName = '', { sequential = false } = {}) {
    if (sequential) {
        const active = getSequentialActiveApprovalStep(steps);
        return active && active.status === 'pending' && approverMatchesUser(active, userEmail, userName)
            ? active
            : null;
    }
    const sorted = coerceFinalApproverFlags([...(steps || [])].sort((a, b) => a.sequence - b.sequence));
    if (isFinalApproverApproved(sorted)) {
        // Final already approved: remaining non-final pending steps may still Approve (no Correction).
        return (
            sorted.find(
                (s) =>
                    s.status === 'pending' &&
                    !s.isFinalApprover &&
                    approverMatchesUser(s, userEmail, userName)
            ) || null
        );
    }
    if (sorted.some((s) => s.status === 'rejected')) return null;
    return (
        sorted.find((s) => s.status === 'pending' && approverMatchesUser(s, userEmail, userName)) ||
        null
    );
}

export function canUserActOnApprovalStep(steps, step, userEmail, userName = '') {
    const pending = getUserPendingApprovalStep(steps, userEmail, userName);
    if (!pending || pending.sequence !== step.sequence) return false;
    return approverMatchesUser(step, userEmail, userName);
}

export function formatApprovalActionAt(value) {
    if (!value) return '';
    try {
        const d = typeof value === 'string' ? parseISO(value) : new Date(value);
        if (!isValid(d)) return '';
        return format(d, 'dd-MMM-yyyy HH:mm');
    } catch {
        return '';
    }
}

export function buildCompanyApproverOptions(usersList) {
    if (!Array.isArray(usersList)) return [];
    const seen = new Set();
    const out = [];
    for (const u of usersList) {
        const email = normalizeApprovalEmail(u.EmailId || u.email);
        const name = String(u.FullName || u.fullName || u.name || '').trim();
        if (!email || !name || seen.has(email)) continue;
        seen.add(email);
        out.push({
            value: email,
            label: name,
            name,
            email,
            designation: String(u.Designation || u.designation || '').trim(),
            department: String(u.Department || u.department || '').trim(),
        });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
}

/** Map CC-mail-filtered signatory options to approver picker options (email + name). */
export function buildApproverOptionsFromCcUsers(signatoryOptions, usersList) {
    if (!Array.isArray(signatoryOptions) || !Array.isArray(usersList)) return [];
    const seen = new Set();
    const out = [];
    for (const opt of signatoryOptions) {
        const name = String(opt.value || opt.label || '').trim();
        if (!name) continue;
        const user = usersList.find((u) => String(u.FullName || '').trim() === name);
        const email = normalizeApprovalEmail(user?.EmailId || user?.email);
        if (!email || seen.has(email)) continue;
        seen.add(email);
        out.push({
            value: email,
            label: name,
            name,
            email,
            designation: String(user?.Designation || opt.designation || '').trim(),
        });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
}

export function normalizeApprovalStepsFromApi(rows) {
    if (!Array.isArray(rows)) return [];
    return coerceFinalApproverFlags(
        rows
            .map((r, i) =>
                normalizeApprovalStep(
                    {
                        sequence: r.sequence ?? r.ApproverSequence ?? i + 1,
                        approverEmail: r.approverEmail ?? r.ApproverEmail,
                        approverName: r.approverName ?? r.ApproverName,
                        approverDesignation: r.approverDesignation ?? r.ApproverDesignation,
                        status: r.status ?? r.Status,
                        actionAt: r.actionAt ?? r.ApprovedAt,
                        comments: r.comments ?? r.Comments,
                        digitalSignatureJson:
                            r.digitalSignatureJson ?? r.ApproverDigitalSignatureJson ?? null,
                        isFinalApprover: r.isFinalApprover ?? r.IsFinalApprover,
                    },
                    i
                )
            )
            .filter(Boolean)
            .sort((a, b) => a.sequence - b.sequence)
            .map((s, i) => ({ ...s, sequence: i + 1 }))
    );
}
