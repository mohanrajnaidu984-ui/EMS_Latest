import { format, parseISO, isValid } from 'date-fns';

export function normalizeApprovalEmail(raw) {
    return String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/@almcg\.com/g, '@almoayyedcg.com');
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
    return stepsRaw
        .map((s, i) => normalizeApprovalStep(s, i))
        .filter(Boolean)
        .sort((a, b) => a.sequence - b.sequence);
}

export function normalizeApprovalStep(raw, idx = 0) {
    if (!raw || typeof raw !== 'object') return null;
    const sequence = Number(raw.sequence ?? raw.Sequence ?? idx + 1);
    if (!Number.isFinite(sequence) || sequence < 1) return null;
    const statusRaw = String(raw.status ?? raw.Status ?? 'pending').trim().toLowerCase();
    const status = ['approved', 'rejected', 'pending'].includes(statusRaw) ? statusRaw : 'pending';
    return {
        sequence: Math.floor(sequence),
        approverEmail: String(raw.approverEmail ?? raw.ApproverEmail ?? '').trim(),
        approverName: String(raw.approverName ?? raw.ApproverName ?? '').trim(),
        approverDesignation: String(raw.approverDesignation ?? raw.ApproverDesignation ?? '').trim(),
        status,
        actionAt: raw.actionAt ?? raw.ActionAt ?? null,
        comments: String(raw.comments ?? raw.Comments ?? '').trim(),
    };
}

export function serializeApprovalWorkflowJson(steps) {
    const normalized = resequenceApprovalSteps(steps);
    return JSON.stringify({ steps: normalized });
}

export function resequenceApprovalSteps(steps) {
    return (Array.isArray(steps) ? steps : [])
        .map((s, i) => normalizeApprovalStep(s, i))
        .filter(Boolean)
        .sort((a, b) => a.sequence - b.sequence)
        .map((s, i) => ({ ...s, sequence: i + 1 }));
}

export function getCurrentPendingApprovalStep(steps) {
    const sorted = [...(steps || [])].sort((a, b) => a.sequence - b.sequence);
    for (const step of sorted) {
        if (step.status === 'rejected') return null;
        if (step.status === 'pending') return step;
    }
    return null;
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

/** Pending step assigned to the signed-in user (parallel approval — no sequence gate). */
export function getUserPendingApprovalStep(steps, userEmail, userName = '') {
    const sorted = [...(steps || [])].sort((a, b) => a.sequence - b.sequence);
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
    return rows
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
                },
                i
            )
        )
        .filter(Boolean)
        .sort((a, b) => a.sequence - b.sequence);
}
