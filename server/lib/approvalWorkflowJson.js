function normalizeApprovalEmail(raw) {
    return String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/@almcg\.com/g, '@almoayyedcg.com');
}

function normalizeStep(raw, idx = 0) {
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

function parseApprovalWorkflowJson(raw) {
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
        .map((s, i) => normalizeStep(s, i))
        .filter(Boolean)
        .sort((a, b) => a.sequence - b.sequence);
}

function serializeApprovalWorkflowJson(steps) {
    const normalized = (Array.isArray(steps) ? steps : [])
        .map((s, i) => normalizeStep(s, i))
        .filter(Boolean)
        .sort((a, b) => a.sequence - b.sequence)
        .map((s, i) => ({ ...s, sequence: i + 1 }));
    return JSON.stringify({ steps: normalized });
}

function getCurrentPendingStep(steps) {
    const sorted = [...(steps || [])].sort((a, b) => a.sequence - b.sequence);
    for (const step of sorted) {
        if (step.status === 'rejected') return null;
        if (step.status === 'pending') return step;
    }
    return null;
}

/** Roll-up label for quote approval workflow: Approved | Rejected | Pending for approval. */
function deriveWorkflowRollupStatusLabel(steps) {
    const sorted = [...(steps || [])].sort((a, b) => a.sequence - b.sequence);
    if (!sorted.length) return '';
    if (sorted.some((s) => s.status === 'rejected')) return 'Rejected';
    if (sorted.every((s) => s.status === 'approved')) return 'Approved';
    if (sorted.some((s) => s.status === 'pending')) return 'Pending for approval';
    return '';
}

function applyApprovalAction(steps, stepSequence, action, actor) {
    const seq = Number(stepSequence);
    if (!Number.isFinite(seq)) {
        throw new Error('Invalid step sequence');
    }
    const actionNorm = String(action || '').trim().toLowerCase();
    if (!['approved', 'rejected'].includes(actionNorm)) {
        throw new Error('Action must be approved or rejected');
    }
    const sorted = [...(steps || [])].sort((a, b) => a.sequence - b.sequence);
    const target = sorted.find((s) => Number(s.sequence) === seq);
    if (!target || target.status !== 'pending') {
        throw new Error('This step is not awaiting approval');
    }
    const actorEmail = normalizeApprovalEmail(actor?.email);
    const stepEmail = normalizeApprovalEmail(target.approverEmail);
    if (!actorEmail || actorEmail !== stepEmail) {
        throw new Error('Only the assigned approver can act on this step');
    }
    const now = new Date().toISOString();
    const next = sorted.map((s) => {
        if (s.sequence !== seq) return s;
        return {
            ...s,
            status: actionNorm,
            actionAt: now,
            approverName: String(actor?.name || s.approverName || '').trim(),
            approverDesignation: String(actor?.designation || s.approverDesignation || '').trim(),
            comments: String(actor?.comments || s.comments || '').trim(),
        };
    });
    return next;
}

module.exports = {
    normalizeApprovalEmail,
    parseApprovalWorkflowJson,
    serializeApprovalWorkflowJson,
    getCurrentPendingStep,
    deriveWorkflowRollupStatusLabel,
    applyApprovalAction,
};
