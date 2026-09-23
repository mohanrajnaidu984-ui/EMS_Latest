function normalizeApprovalEmail(raw) {
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

/**
 * Ensure exactly one final approver when multiple steps; single step is always final.
 * Does not throw — callers that need strict validation use assertFinalApproverRules.
 */
function coerceFinalApproverFlags(steps) {
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
        // Legacy paths: last step is final.
        return list.map((s, i) => ({
            ...s,
            isFinalApprover: i === list.length - 1,
        }));
    }
    // More than one marked — keep the last marked as sole final.
    let lastIdx = -1;
    list.forEach((s, i) => {
        if (s.isFinalApprover) lastIdx = i;
    });
    return list.map((s, i) => ({
        ...s,
        isFinalApprover: i === lastIdx,
    }));
}

function assertFinalApproverRules(steps) {
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
        isFinalApprover: truthyFinalFlag(
            raw.isFinalApprover ?? raw.IsFinalApprover ?? raw.isFinal ?? raw.IsFinal
        ),
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
    const normalized = stepsRaw
        .map((s, i) => normalizeStep(s, i))
        .filter(Boolean)
        .sort((a, b) => a.sequence - b.sequence)
        .map((s, i) => ({ ...s, sequence: i + 1 }));
    return coerceFinalApproverFlags(normalized);
}

function serializeApprovalWorkflowJson(steps) {
    const normalized = coerceFinalApproverFlags(
        (Array.isArray(steps) ? steps : [])
            .map((s, i) => normalizeStep(s, i))
            .filter(Boolean)
            .sort((a, b) => a.sequence - b.sequence)
            .map((s, i) => ({ ...s, sequence: i + 1 }))
    );
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

function getFinalApproverStep(steps) {
    const sorted = [...(steps || [])].sort((a, b) => a.sequence - b.sequence);
    const coerced = coerceFinalApproverFlags(sorted);
    return coerced.find((s) => s.isFinalApprover) || null;
}

function isFinalApproverApproved(steps) {
    const final = getFinalApproverStep(steps);
    return !!final && String(final.status || '').toLowerCase() === 'approved';
}

/** Roll-up: final approver approval commits the workflow (parallel non-final steps are informational). */
function deriveWorkflowRollupStatusLabel(steps) {
    const sorted = coerceFinalApproverFlags([...(steps || [])].sort((a, b) => a.sequence - b.sequence));
    if (!sorted.length) return '';
    if (isFinalApproverApproved(sorted)) return 'Approved';
    if (sorted.some((s) => s.status === 'rejected')) return 'Rejected';
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
    const sorted = coerceFinalApproverFlags([...(steps || [])].sort((a, b) => a.sequence - b.sequence));
    const target = sorted.find((s) => Number(s.sequence) === seq);
    if (!target || target.status !== 'pending') {
        throw new Error('This step is not awaiting approval');
    }

    // After final approval, non-final reject is not allowed; non-final approve may still record.
    if (isFinalApproverApproved(sorted) && !target.isFinalApprover && actionNorm === 'rejected') {
        throw new Error('Quote is already finalized; rejection is no longer allowed');
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
    return coerceFinalApproverFlags(next);
}

module.exports = {
    normalizeApprovalEmail,
    parseApprovalWorkflowJson,
    serializeApprovalWorkflowJson,
    getCurrentPendingStep,
    getFinalApproverStep,
    isFinalApproverApproved,
    deriveWorkflowRollupStatusLabel,
    applyApprovalAction,
    coerceFinalApproverFlags,
    assertFinalApproverRules,
    truthyFinalFlag,
};
