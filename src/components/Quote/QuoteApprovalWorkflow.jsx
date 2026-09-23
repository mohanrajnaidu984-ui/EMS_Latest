import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Select from 'react-select';
import { UserCheck, Trash2, CheckCircle2, Send, Check, X, Settings2, AlertTriangle } from 'lucide-react';
import { formatSignaturePlacedDateTime } from '../../utils/enquiryResultsHelpers';
import QuoteApprovalHierarchyModal from './QuoteApprovalHierarchyModal';
import { EMS_PENDING_APPROVALS_CHANGED } from '../../constants/approvalEvents';
import {
    getCurrentPendingApprovalStep,
    getUserPendingApprovalStep,
    normalizeApprovalEmail,
    normalizeApprovalStep,
    resequenceApprovalSteps,
    assertFinalApproverRules,
    isFinalApproverApproved,
    orderApprovalStepsFinalLast,
    sortApprovalStepsFinalLast,
    formatApprovalActionAt,
} from '../../utils/quoteApprovalWorkflow';

const selectStyles = {
    control: (base) => ({
        ...base,
        minHeight: '30px',
        fontSize: '12px',
        borderColor: '#cbd5e1',
        boxShadow: 'none',
    }),
    valueContainer: (base) => ({ ...base, padding: '0 6px' }),
    input: (base) => ({ ...base, margin: 0, padding: 0 }),
    indicatorsContainer: (base) => ({ ...base, height: '28px' }),
    menu: (base) => ({ ...base, fontSize: '12px', zIndex: 20 }),
    option: (base, state) => ({
        ...base,
        fontSize: '12px',
        backgroundColor: state.isFocused ? '#e2e8f0' : 'white',
        color: '#1f2937',
    }),
    singleValue: (base) => ({ ...base, color: '#1f2937' }),
    placeholder: (base) => ({ ...base, color: '#94a3b8' }),
};

export default function QuoteApprovalWorkflow({
    steps,
    stepsLoading = false,
    onChange,
    approverOptions = [],
    canEditHierarchy = true,
    approvalPathLocked = false,
    viewOnly = false,
    approvalReviewMode = false,
    quoteId,
    draftQuoteId = null,
    currentUserEmail,
    currentUserName = '',
    apiBase,
    onStepsUpdated,
    enquiryNo = '',
    projectName = '',
    customerName = '',
    quoteSubject = '',
    leadJobName = '',
    ownJob = '',
    quoteNumber = '',
    onApprovalSent = null,
    beforeSendApproval = null,
    disabledHint = null,
}) {
    const workflowDisabled = Boolean(disabledHint);
    const showHierarchyControls =
        canEditHierarchy && !viewOnly && !workflowDisabled && !approvalPathLocked;
    const canEditApproverList = showHierarchyControls && !approvalPathLocked;

    const [hierarchyPicker, setHierarchyPicker] = useState(null);
    const [hierarchies, setHierarchies] = useState([]);
    const [hierarchiesLoading, setHierarchiesLoading] = useState(false);
    const [hierarchyModalOpen, setHierarchyModalOpen] = useState(false);
    const [acting, setActing] = useState(false);
    const [sending, setSending] = useState(false);
    const [comments, setComments] = useState('');
    const [corrections, setCorrections] = useState([]);
    const [correctionReason, setCorrectionReason] = useState('');
    const [showCorrectionForm, setShowCorrectionForm] = useState(false);
    /** Popup: correction history for one approver on this draft/revision. */
    const [correctionHistoryPopup, setCorrectionHistoryPopup] = useState(null);

    const loadCorrections = useCallback(async () => {
        if (!quoteId && !draftQuoteId) {
            setCorrections([]);
            return;
        }
        try {
            const params = new URLSearchParams();
            if (quoteId) params.set('quoteId', String(quoteId));
            if (draftQuoteId) params.set('draftQuoteId', String(draftQuoteId));
            const res = await fetch(`${apiBase}/api/quotes/approval-corrections?${params.toString()}`, {
                cache: 'no-store',
            });
            if (!res.ok) return;
            const data = await res.json();
            setCorrections(Array.isArray(data.corrections) ? data.corrections : []);
        } catch (e) {
            console.warn('[QuoteApprovalWorkflow] load corrections', e);
        }
    }, [apiBase, quoteId, draftQuoteId]);

    useEffect(() => {
        void loadCorrections();
    }, [loadCorrections]);

    const hasCorrectionRequired = corrections.length > 0;

    const correctionsByRequesterEmail = useMemo(() => {
        const map = new Map();
        for (const c of corrections) {
            const key = normalizeApprovalEmail(c.requestedByEmail);
            if (!key) continue;
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(c);
        }
        return map;
    }, [corrections]);

    const unmatchedCorrections = useMemo(() => {
        const stepEmails = new Set(
            (steps || []).map((s) => normalizeApprovalEmail(s.approverEmail)).filter(Boolean)
        );
        return corrections.filter((c) => {
            const key = normalizeApprovalEmail(c.requestedByEmail);
            return key && !stepEmails.has(key);
        });
    }, [corrections, steps]);

    const openCorrectionHistoryPopup = (step, stepCorrections) => {
        setCorrectionHistoryPopup({
            mode: 'approver',
            name: String(step?.approverName || step?.approverEmail || 'Approver').trim(),
            email: normalizeApprovalEmail(step?.approverEmail),
            items: Array.isArray(stepCorrections) ? stepCorrections : [],
        });
    };

    const openAllCorrectionHistoryPopup = () => {
        const sorted = [...(corrections || [])].sort((a, b) => {
            const ta = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
            const tb = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
            return tb - ta;
        });
        setCorrectionHistoryPopup({
            mode: 'all',
            name: 'All approvers',
            email: '',
            items: sorted,
        });
    };

    const loadHierarchies = useCallback(async () => {
        const email = normalizeApprovalEmail(currentUserEmail);
        if (!email) {
            setHierarchies([]);
            return;
        }
        setHierarchiesLoading(true);
        try {
            const res = await fetch(
                `${apiBase}/api/quotes/approval-hierarchies?userEmail=${encodeURIComponent(email)}`,
                { cache: 'no-store' }
            );
            if (!res.ok) {
                console.warn('[QuoteApprovalWorkflow] load hierarchies HTTP', res.status);
                setHierarchies([]);
                return;
            }
            const data = await res.json();
            setHierarchies(Array.isArray(data) ? data : []);
        } catch (e) {
            console.warn('[QuoteApprovalWorkflow] load hierarchies', e);
            setHierarchies([]);
        } finally {
            setHierarchiesLoading(false);
        }
    }, [apiBase, currentUserEmail]);

    useEffect(() => {
        if (viewOnly) return;
        void loadHierarchies();
    }, [viewOnly, loadHierarchies]);

    useEffect(() => {
        if (approvalPathLocked) setHierarchyModalOpen(false);
    }, [approvalPathLocked]);

    const hierarchyOptions = useMemo(
        () =>
            (hierarchies || []).map((h) => ({
                value: h.id,
                label: h.name,
                steps: h.steps || [],
            })),
        [hierarchies]
    );

    const orderedSteps = useMemo(
        () => sortApprovalStepsFinalLast(steps),
        [steps]
    );
    const pendingStep = useMemo(
        () =>
            approvalReviewMode
                ? getUserPendingApprovalStep(orderedSteps, currentUserEmail, currentUserName)
                : getCurrentPendingApprovalStep(orderedSteps),
        [approvalReviewMode, orderedSteps, currentUserEmail, currentUserName]
    );

    const pendingWithEmail = useMemo(
        () =>
            orderedSteps.filter(
                (s) =>
                    String(s.status || 'pending').toLowerCase() === 'pending' &&
                    normalizeApprovalEmail(s.approverEmail)
            ),
        [orderedSteps]
    );

    const canSendApproval =
        !viewOnly &&
        !approvalPathLocked &&
        pendingWithEmail.length > 0 &&
        (!showHierarchyControls || Boolean(hierarchyPicker?.value));

    const userMatchesPendingApprover = useMemo(() => {
        if (!pendingStep) return false;
        const userEmail = normalizeApprovalEmail(currentUserEmail);
        const stepEmail = normalizeApprovalEmail(pendingStep.approverEmail);
        if (userEmail && stepEmail && userEmail === stepEmail) return true;
        const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
        const userName = norm(currentUserName);
        const stepName = norm(pendingStep.approverName);
        return userName.length > 0 && userName === stepName;
    }, [pendingStep, currentUserEmail, currentUserName]);

    const userCanAct = useMemo(() => {
        if (!approvalReviewMode) return false;
        if (!pendingStep) return false;
        if (!quoteId && !draftQuoteId) return false;
        return userMatchesPendingApprover;
    }, [
        approvalReviewMode,
        pendingStep,
        quoteId,
        draftQuoteId,
        userMatchesPendingApprover,
    ]);

    const workflowFinalized = useMemo(
        () => isFinalApproverApproved(orderedSteps),
        [orderedSteps]
    );

    const userIsAssignedApprover = useMemo(() => {
        return orderedSteps.some((s) => {
            const userEmail = normalizeApprovalEmail(currentUserEmail);
            const stepEmail = normalizeApprovalEmail(s.approverEmail);
            if (userEmail && stepEmail && userEmail === stepEmail) return true;
            const norm = (v) => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
            const userName = norm(currentUserName);
            const stepName = norm(s.approverName);
            return userName.length > 0 && userName === stepName;
        });
    }, [orderedSteps, currentUserEmail, currentUserName]);

    /**
     * Assigned approver may request correction until the final approver commits the quote.
     * After final approval, Approve remains for other pending steps, but Correction does not.
     */
    const userCanRequestCorrection = useMemo(() => {
        if (!approvalReviewMode) return false;
        if (!quoteId && !draftQuoteId) return false;
        if (workflowFinalized) return false;
        return userIsAssignedApprover;
    }, [approvalReviewMode, quoteId, draftQuoteId, workflowFinalized, userIsAssignedApprover]);

    const updateSteps = (next) => {
        onChange(resequenceApprovalSteps(next));
    };

    const applyHierarchySteps = (steps) => {
        const next = orderApprovalStepsFinalLast(
            (steps || []).map((s, i) => ({
                sequence: i + 1,
                approverEmail: s.approverEmail || s.email,
                approverName: s.approverName || s.name,
                approverDesignation: s.approverDesignation || s.designation || '',
                status: 'pending',
                actionAt: null,
                comments: '',
                isFinalApprover: !!s.isFinalApprover,
            }))
        );
        updateSteps(next);
    };

    const removeStep = (index) => {
        if (!canEditApproverList) return;
        const next = orderedSteps.filter((_, i) => i !== index);
        updateSteps(orderApprovalStepsFinalLast(next));
    };

    const handleSelectHierarchy = (opt) => {
        setHierarchyPicker(opt);
        if (!opt) {
            // Cleared — empty the list so only a selected hierarchy supplies approvers.
            updateSteps([]);
            return;
        }
        if (!opt?.steps?.length) {
            updateSteps([]);
            return;
        }
        applyHierarchySteps(opt.steps);
    };

    const handleHierarchySaved = (saved) => {
        if (saved?.id) {
            setHierarchies((prev) => {
                const rest = prev.filter((h) => h.id !== saved.id && h.name !== saved.name);
                return [...rest, saved].sort((a, b) => String(a.name).localeCompare(String(b.name)));
            });
            const opt = {
                value: saved.id,
                label: saved.name,
                steps: saved.steps || [],
            };
            setHierarchyPicker(opt);
            applyHierarchySteps(saved.steps);
        }
        void loadHierarchies();
    };

    const handleHierarchyDeleted = (deletedId) => {
        setHierarchies((prev) => prev.filter((h) => h.id !== deletedId));
        setHierarchyPicker((prev) => (prev?.value === deletedId ? null : prev));
        void loadHierarchies();
    };

    const handleOpenHierarchyModal = () => {
        setHierarchyModalOpen(true);
        void loadHierarchies();
    };

    const handleSendApprovalRequest = async () => {
        if (!canSendApproval || sending) return;
        const email = normalizeApprovalEmail(currentUserEmail);
        if (!email) {
            alert('Sign in to send approval requests.');
            return;
        }
        if (!String(enquiryNo || '').trim()) {
            alert('Enquiry number is required before sending approval request.');
            return;
        }

        setSending(true);
        try {
            let effectiveQuoteId = quoteId || null;
            let effectiveDraftId = draftQuoteId || null;
            let stepsForSend = orderedSteps;

            if (typeof beforeSendApproval === 'function') {
                const prep = await beforeSendApproval();
                if (!prep || prep.ok === false) {
                    return;
                }
                if (prep.quoteId !== undefined) effectiveQuoteId = prep.quoteId || null;
                if (prep.draftQuoteId !== undefined) effectiveDraftId = prep.draftQuoteId || null;
                if (Array.isArray(prep.approvalSteps) && prep.approvalSteps.length > 0) {
                    stepsForSend = prep.approvalSteps;
                    onChange(prep.approvalSteps);
                }
            }

            if (!effectiveQuoteId && !effectiveDraftId) {
                alert('Save the quote as a draft before sending for approval.');
                return;
            }
            try {
                assertFinalApproverRules(stepsForSend);
            } catch (e) {
                alert(e.message || 'Select a final approver before sending.');
                return;
            }

            const res = await fetch(`${apiBase}/api/quotes/send-approval-request`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    quoteId: effectiveQuoteId || null,
                    draftQuoteId: effectiveDraftId || null,
                    userEmail: email,
                    requestNo: String(enquiryNo).trim(),
                    projectName: String(projectName || '').trim(),
                    customerName: String(customerName || '').trim(),
                    subject: String(quoteSubject || '').trim(),
                    leadJobName: String(leadJobName || '').trim(),
                    ownJob: String(ownJob || '').trim(),
                    quoteNumber: String(quoteNumber || '').trim(),
                    steps: stepsForSend,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                alert(data.details || data.error || 'Could not send approval request email.');
                return;
            }
            if (Array.isArray(data.steps)) {
                onChange(data.steps);
            }
            window.dispatchEvent(new CustomEvent(EMS_PENDING_APPROVALS_CHANGED));
            onApprovalSent?.(data);
            const names = Array.isArray(data.approverNames)
                ? data.approverNames.filter(Boolean)
                : [];
            const emails = Array.isArray(data.sentTo)
                ? data.sentTo.filter(Boolean)
                : data.sentTo
                  ? [data.sentTo]
                  : [];
            const recipientLabel = names.length
                ? names.join(', ')
                : emails.length
                  ? emails.join(', ')
                  : 'all approvers';
            alert(`Approval request sent to ${recipientLabel}.`);
        } catch (e) {
            console.warn('[QuoteApprovalWorkflow] send approval', e);
            alert('Could not send approval request email.');
        } finally {
            setSending(false);
        }
    };

    const handleApprovalAction = async (action) => {
        if ((!quoteId && !draftQuoteId) || acting || !pendingStep || !userCanAct) return;
        const email = normalizeApprovalEmail(currentUserEmail);

        const trimmedComments = String(comments || '').trim();
        const actionNorm = String(action || '').trim().toLowerCase();
        const actedSequence = Number(pendingStep.sequence);
        const previousSteps = Array.isArray(steps) ? steps.map((s) => ({ ...s })) : [];

        /* Optimistic UI — show Approved/Rejected immediately; do not wait on SMTP/promote. */
        const optimisticSteps = (previousSteps.length ? previousSteps : orderedSteps).map((s) => {
            const seq = Number(s.sequence);
            if (seq !== actedSequence) return s;
            return {
                ...s,
                status: actionNorm === 'rejected' ? 'rejected' : 'approved',
                actionAt: new Date().toISOString(),
                comments: trimmedComments || s.comments || '',
            };
        });
        onChange(optimisticSteps);
        onStepsUpdated?.(optimisticSteps, {
            action: actionNorm,
            quoteId: quoteId || null,
            draftQuoteId: draftQuoteId || null,
            optimistic: true,
        });

        setActing(true);
        try {
            const url = quoteId
                ? `${apiBase}/api/quotes/${encodeURIComponent(quoteId)}/approval-action`
                : `${apiBase}/api/quotes/draft-approval-action`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...(quoteId ? {} : { draftQuoteId }),
                    stepSequence: pendingStep.sequence,
                    action,
                    userEmail: email,
                    comments: trimmedComments,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                onChange(previousSteps);
                onStepsUpdated?.(previousSteps, { action: 'rollback', optimistic: false });
                alert(data.error || data.details || 'Could not record approval action.');
                return;
            }
            if (Array.isArray(data.steps)) {
                onChange(data.steps);
                onStepsUpdated?.(data.steps, {
                    action: actionNorm,
                    quoteId: data.quoteId || quoteId || null,
                    draftQuoteId: draftQuoteId || null,
                    quoteFinalized: !!data.quoteFinalized,
                    optimistic: false,
                });
            }
            if (data.quoteFinalized || data.quoteId) {
                onApprovalSent?.({
                    ...data,
                    approvalRequestSent: true,
                    quoteFinalized: true,
                    editLocked: true,
                });
                if (data.quoteNumber) {
                    alert(`Quote finalized: ${data.quoteNumber}`);
                }
            }
            window.dispatchEvent(new CustomEvent(EMS_PENDING_APPROVALS_CHANGED));
            setComments('');
        } catch (e) {
            onChange(previousSteps);
            onStepsUpdated?.(previousSteps, { action: 'rollback', optimistic: false });
            console.warn('[QuoteApprovalWorkflow] action failed', e);
            alert('Could not record approval action.');
        } finally {
            setActing(false);
        }
    };

    const handleCorrectionRequired = async () => {
        if (!userCanRequestCorrection || acting) return;
        const reason = String(correctionReason || '').trim();
        if (!reason) {
            alert('Enter the reason for correction.');
            return;
        }
        const email = normalizeApprovalEmail(currentUserEmail);
        if (!email) {
            alert('Sign in to request a correction.');
            return;
        }

        setActing(true);
        try {
            const res = await fetch(`${apiBase}/api/quotes/correction-required`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    quoteId: quoteId || null,
                    draftQuoteId: draftQuoteId || null,
                    userEmail: email,
                    reason,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                alert(data.error || data.details || 'Could not submit correction request.');
                return;
            }
            if (Array.isArray(data.steps)) {
                onChange(data.steps);
                onStepsUpdated?.(data.steps);
            }
            if (Array.isArray(data.corrections)) {
                setCorrections(data.corrections);
            } else {
                void loadCorrections();
            }
            setShowCorrectionForm(false);
            setCorrectionReason('');
            onApprovalSent?.({
                ...data,
                approvalRequestSent: false,
                approvalUnlocked: true,
                correctionRequired: true,
            });
            window.dispatchEvent(new CustomEvent(EMS_PENDING_APPROVALS_CHANGED));
            alert('Correction required has been recorded. Approvers and the initiator have been notified.');
        } catch (e) {
            console.warn('[QuoteApprovalWorkflow] correction failed', e);
            alert('Could not submit correction request.');
        } finally {
            setActing(false);
        }
    };

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                flex: approvalReviewMode ? '1 1 60%' : '1 1 50%',
                minHeight: 0,
                overflowY: approvalReviewMode ? 'hidden' : 'auto',
                paddingBottom: '4px',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#475569', fontSize: '13px', fontWeight: 600 }}>
                <UserCheck size={18} className="text-blue-500" />
                <span>Approval Workflow</span>
                {hasCorrectionRequired ? (
                    <button
                        type="button"
                        onClick={openAllCorrectionHistoryPopup}
                        style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            color: '#c2410c',
                            background: '#ffedd5',
                            border: '1px solid #fdba74',
                            borderRadius: '4px',
                            padding: '2px 6px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.02em',
                            cursor: 'pointer',
                            textDecoration: 'underline',
                            textUnderlineOffset: '2px',
                        }}
                        title="View all approvers' correction history"
                    >
                        Correction history ({corrections.length})
                    </button>
                ) : null}
                {stepsLoading ? (
                    <span style={{ fontSize: '11px', fontWeight: 500, color: '#94a3b8', fontStyle: 'italic' }}>
                        Updating…
                    </span>
                ) : null}
            </div>

            {workflowDisabled ? (
                <div
                    style={{
                        border: '1px dashed #cbd5e1',
                        borderRadius: '6px',
                        padding: '10px',
                        fontSize: '11px',
                        color: '#64748b',
                        background: '#ffffff',
                        lineHeight: 1.45,
                        flexShrink: 0,
                    }}
                >
                    {disabledHint}
                </div>
            ) : (
                <>
            {showHierarchyControls ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <Select
                        options={hierarchyOptions}
                        value={hierarchyPicker}
                        onChange={handleSelectHierarchy}
                        onMenuOpen={() => void loadHierarchies()}
                        placeholder={hierarchiesLoading ? 'Loading hierarchies…' : 'Select hierarchy…'}
                        isClearable
                        isLoading={hierarchiesLoading}
                        styles={selectStyles}
                        filterOption={(option, input) => {
                            const q = String(input || '').toLowerCase();
                            if (!q) return true;
                            return String(option.label || '').toLowerCase().includes(q);
                        }}
                    />
                    <button
                        type="button"
                        onClick={handleOpenHierarchyModal}
                        style={{
                            fontSize: '11px',
                            color: '#475569',
                            background: 'white',
                            border: '1px solid #cbd5e1',
                            padding: '4px 10px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px',
                        }}
                    >
                        <Settings2 size={14} /> Set hierarchy
                    </button>
                </div>
            ) : null}

            {(() => {
                const requireHierarchySelection = showHierarchyControls;
                const hierarchySelected = Boolean(hierarchyPicker?.value);
                const showApproverList =
                    orderedSteps.length > 0 &&
                    (!requireHierarchySelection || hierarchySelected);

                if (!showApproverList) {
                    return (
                        <div
                            style={{
                                border: '1px dashed #cbd5e1',
                                borderRadius: '6px',
                                padding: '10px',
                                textAlign: 'center',
                                fontSize: '11px',
                                color: '#94a3b8',
                                background: '#ffffff',
                                flexShrink: 0,
                            }}
                        >
                            {stepsLoading
                                ? 'Loading workflow…'
                                : requireHierarchySelection
                                  ? 'Select a hierarchy to load approvers.'
                                  : 'No approvers yet.'}
                        </div>
                    );
                }

                return (
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        flex: approvalReviewMode ? '1 1 auto' : undefined,
                        minHeight: approvalReviewMode ? 0 : undefined,
                        overflowY: approvalReviewMode ? 'auto' : undefined,
                    }}
                >
                    {orderedSteps.map((rawStep, index) => {
                        const step = normalizeApprovalStep(rawStep, index) || rawStep;
                        const isPending = pendingStep?.sequence === step.sequence;
                        const isApproved = step.status === 'approved';
                        const isRejected = step.status === 'rejected';
                        const stepEmailKey = normalizeApprovalEmail(step.approverEmail);
                        const stepCorrections = stepEmailKey
                            ? correctionsByRequesterEmail.get(stepEmailKey) || []
                            : [];
                        const isCorrectionRequester = stepCorrections.length > 0;
                        const isFinal = !!step.isFinalApprover;
                        return (
                            <div
                                key={`${step.sequence}-${step.approverEmail}`}
                                style={{
                                    border: `1px solid ${
                                        isApproved
                                            ? '#6ee7b7'
                                            : isRejected
                                              ? '#fca5a5'
                                              : isFinal
                                                ? '#800000'
                                                : isCorrectionRequester
                                                  ? '#fdba74'
                                                  : isPending
                                                    ? '#93c5fd'
                                                    : '#e2e8f0'
                                    }`,
                                    borderRadius: '5px',
                                    padding: '3px 8px',
                                    background: isApproved
                                        ? '#f0fdf4'
                                        : isRejected
                                          ? '#fef2f2'
                                          : isFinal
                                            ? '#f5d0d6'
                                            : isCorrectionRequester
                                              ? '#fff7ed'
                                              : isPending
                                                ? '#eff6ff'
                                                : '#ffffff',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <div
                                        style={{
                                            minWidth: '20px',
                                            width: '20px',
                                            height: '20px',
                                            borderRadius: '999px',
                                            background: isApproved
                                                ? '#16a34a'
                                                : isRejected
                                                  ? '#dc2626'
                                                  : isFinal
                                                    ? '#800000'
                                                    : isCorrectionRequester
                                                      ? '#fb923c'
                                                      : '#e2e8f0',
                                            color:
                                                isFinal ||
                                                isApproved ||
                                                isRejected ||
                                                isCorrectionRequester
                                                    ? '#ffffff'
                                                    : '#334155',
                                            fontSize: '10px',
                                            fontWeight: 700,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flexShrink: 0,
                                            boxShadow: isApproved
                                                ? '0 0 0 1px #15803d'
                                                : isRejected
                                                  ? '0 0 0 1px #b91c1c'
                                                  : isFinal
                                                    ? '0 0 0 1px #5c0000'
                                                    : isCorrectionRequester
                                                      ? '0 0 0 1px #ea580c'
                                                      : 'none',
                                        }}
                                            title={
                                            isApproved
                                                ? 'Approved'
                                                : isRejected
                                                  ? 'Rejected'
                                                  : isFinal
                                                ? 'Final Approver'
                                                : isCorrectionRequester
                                                    ? 'Correction Required'
                                                    : `Step ${index + 1}`
                                        }
                                    >
                                        {isApproved ? (
                                            <Check size={12} strokeWidth={3} aria-hidden />
                                        ) : isRejected ? (
                                            <X size={12} strokeWidth={3} aria-hidden />
                                        ) : isCorrectionRequester ? (
                                            <AlertTriangle size={11} strokeWidth={2.5} aria-hidden />
                                        ) : (
                                            index + 1
                                        )}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div
                                            style={{
                                                fontSize: '11.5px',
                                                fontWeight: 600,
                                                color: '#1e293b',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                lineHeight: 1.2,
                                            }}
                                            title={step.approverName}
                                        >
                                            {step.approverName || step.approverEmail}
                                        </div>
                                        {isApproved ? (
                                            <>
                                                <div
                                                    style={{
                                                        fontSize: '9.5px',
                                                        color: '#64748b',
                                                        marginTop: '1px',
                                                        lineHeight: 1.15,
                                                    }}
                                                >
                                                    {step.actionAt
                                                        ? formatSignaturePlacedDateTime(step.actionAt)
                                                        : 'Approved'}
                                                </div>
                                                {step.isFinalApprover ? (
                                                    <div
                                                        style={{
                                                            fontSize: '9.5px',
                                                            fontWeight: 700,
                                                            color: '#475569',
                                                            marginTop: '1px',
                                                            lineHeight: 1.15,
                                                        }}
                                                    >
                                                        Final Approver
                                                    </div>
                                                ) : null}
                                                {isCorrectionRequester ? (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            openCorrectionHistoryPopup(step, stepCorrections);
                                                        }}
                                                        style={{
                                                            display: 'inline-block',
                                                            marginTop: '2px',
                                                            padding: 0,
                                                            border: 'none',
                                                            background: 'transparent',
                                                            cursor: 'pointer',
                                                            fontSize: '9.5px',
                                                            color: '#c2410c',
                                                            fontWeight: 700,
                                                            lineHeight: 1.15,
                                                            textAlign: 'left',
                                                            textDecoration: 'underline',
                                                            textUnderlineOffset: '2px',
                                                        }}
                                                        title="View correction history for this revision"
                                                    >
                                                        Correction History
                                                        {stepCorrections.length > 1
                                                            ? ` (${stepCorrections.length})`
                                                            : ''}
                                                    </button>
                                                ) : null}
                                            </>
                                        ) : isRejected ? (
                                            <>
                                                <div
                                                    style={{
                                                        fontSize: '9.5px',
                                                        color: '#dc2626',
                                                        marginTop: '1px',
                                                        lineHeight: 1.15,
                                                    }}
                                                >
                                                    {step.actionAt
                                                        ? formatSignaturePlacedDateTime(step.actionAt)
                                                        : 'Rejected'}
                                                </div>
                                                {step.isFinalApprover ? (
                                                    <div
                                                        style={{
                                                            fontSize: '9.5px',
                                                            fontWeight: 700,
                                                            color: '#475569',
                                                            marginTop: '1px',
                                                            lineHeight: 1.15,
                                                        }}
                                                    >
                                                        Final Approver
                                                    </div>
                                                ) : null}
                                            </>
                                        ) : isCorrectionRequester ? (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openCorrectionHistoryPopup(step, stepCorrections);
                                                    }}
                                                    style={{
                                                        display: 'inline-block',
                                                        marginTop: '1px',
                                                        padding: 0,
                                                        border: 'none',
                                                        background: 'transparent',
                                                        cursor: 'pointer',
                                                        fontSize: '9.5px',
                                                        color: '#c2410c',
                                                        fontWeight: 700,
                                                        lineHeight: 1.15,
                                                        textAlign: 'left',
                                                        textDecoration: 'underline',
                                                        textUnderlineOffset: '2px',
                                                    }}
                                                    title="View correction history"
                                                >
                                                    Correction Required
                                                </button>
                                                <div
                                                    style={{
                                                        fontSize: '9.5px',
                                                        color: isPending ? '#2563eb' : '#64748b',
                                                        marginTop: '1px',
                                                        lineHeight: 1.15,
                                                        fontStyle: 'italic',
                                                    }}
                                                >
                                                    Pending for Approval
                                                </div>
                                                {step.isFinalApprover ? (
                                                    <div
                                                        style={{
                                                            fontSize: '9.5px',
                                                            fontWeight: 700,
                                                            color: '#475569',
                                                            marginTop: '1px',
                                                            lineHeight: 1.15,
                                                        }}
                                                    >
                                                        Final Approver
                                                    </div>
                                                ) : null}
                                            </>
                                        ) : (
                                            <>
                                                <div
                                                    style={{
                                                        fontSize: '9.5px',
                                                        color: isPending ? '#2563eb' : '#64748b',
                                                        marginTop: '1px',
                                                        lineHeight: 1.15,
                                                        fontStyle: 'italic',
                                                    }}
                                                >
                                                    Pending for Approval
                                                </div>
                                                {step.isFinalApprover ? (
                                                    <div
                                                        style={{
                                                            fontSize: '9.5px',
                                                            fontWeight: 700,
                                                            color: '#475569',
                                                            marginTop: '1px',
                                                            lineHeight: 1.15,
                                                        }}
                                                    >
                                                        Final Approver
                                                    </div>
                                                ) : null}
                                            </>
                                        )}
                                        {step.comments ? (
                                            <div
                                                style={{
                                                    fontSize: '9.5px',
                                                    color: '#475569',
                                                    marginTop: '2px',
                                                    lineHeight: 1.25,
                                                    fontStyle: 'italic',
                                                    whiteSpace: 'pre-wrap',
                                                    wordBreak: 'break-word',
                                                }}
                                            >
                                                Comments: {step.comments}
                                            </div>
                                        ) : null}
                                    </div>
                                    {canEditApproverList ? (
                                        <button
                                            type="button"
                                            onClick={() => removeStep(index)}
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                color: '#94a3b8',
                                                cursor: 'pointer',
                                                padding: 0,
                                                flexShrink: 0,
                                            }}
                                            title="Remove"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    ) : null}
                                </div>
                            </div>
                        );
                    })}
                </div>
                );
            })()}

            {userCanAct || userCanRequestCorrection ? (
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        marginTop: '4px',
                        padding: '8px',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        background: '#ffffff',
                        flexShrink: 0,
                    }}
                >
                    {userCanAct && !showCorrectionForm ? (
                        <textarea
                            value={comments}
                            onChange={(e) => setComments(e.target.value)}
                            rows={1}
                            placeholder="Enter approval comments…"
                            style={{
                                width: '100%',
                                boxSizing: 'border-box',
                                fontSize: '11px',
                                padding: '6px 8px',
                                border: '1px solid #cbd5e1',
                                borderRadius: '4px',
                                resize: 'vertical',
                                fontFamily: 'inherit',
                            }}
                        />
                    ) : null}
                    {showCorrectionForm ? (
                        <textarea
                            value={correctionReason}
                            onChange={(e) => setCorrectionReason(e.target.value)}
                            rows={3}
                            placeholder="Enter reason for correction (required)…"
                            style={{
                                width: '100%',
                                boxSizing: 'border-box',
                                fontSize: '11px',
                                padding: '6px 8px',
                                border: '1px solid #fdba74',
                                borderRadius: '4px',
                                resize: 'vertical',
                                fontFamily: 'inherit',
                                background: '#fff7ed',
                            }}
                        />
                    ) : null}
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {userCanAct && !showCorrectionForm ? (
                            <button
                                type="button"
                                disabled={acting}
                                onClick={() => handleApprovalAction('approved')}
                                style={{
                                    flex: 1,
                                    minWidth: '110px',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    padding: '6px 8px',
                                    borderRadius: '4px',
                                    border: '1px solid #059669',
                                    background: '#ecfdf5',
                                    color: '#059669',
                                    cursor: acting ? 'wait' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '4px',
                                }}
                            >
                                <CheckCircle2 size={13} /> Approve
                            </button>
                        ) : null}
                        {userCanRequestCorrection && !showCorrectionForm ? (
                            <button
                                type="button"
                                disabled={acting}
                                onClick={() => {
                                    setShowCorrectionForm(true);
                                    setCorrectionReason('');
                                }}
                                style={{
                                    flex: 1,
                                    minWidth: '130px',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    padding: '6px 8px',
                                    borderRadius: '4px',
                                    border: '1px solid #ea580c',
                                    background: '#fff7ed',
                                    color: '#c2410c',
                                    cursor: acting ? 'wait' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '4px',
                                }}
                            >
                                <AlertTriangle size={13} /> Correction Required
                            </button>
                        ) : null}
                        {showCorrectionForm ? (
                            <>
                                <button
                                    type="button"
                                    disabled={acting}
                                    onClick={() => void handleCorrectionRequired()}
                                    style={{
                                        flex: 1,
                                        minWidth: '130px',
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        padding: '6px 8px',
                                        borderRadius: '4px',
                                        border: '1px solid #ea580c',
                                        background: '#ea580c',
                                        color: '#fff',
                                        cursor: acting ? 'wait' : 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '4px',
                                    }}
                                >
                                    <AlertTriangle size={13} />{' '}
                                    {acting ? 'Submitting…' : 'Correction Required'}
                                </button>
                                <button
                                    type="button"
                                    disabled={acting}
                                    onClick={() => {
                                        setShowCorrectionForm(false);
                                        setCorrectionReason('');
                                    }}
                                    style={{
                                        fontSize: '11px',
                                        padding: '6px 10px',
                                        borderRadius: '4px',
                                        border: '1px solid #cbd5e1',
                                        background: '#fff',
                                        color: '#475569',
                                        cursor: 'pointer',
                                    }}
                                >
                                    Cancel
                                </button>
                            </>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {unmatchedCorrections.length > 0 ? (
                <div
                    style={{
                        marginTop: '4px',
                        border: '1px solid #fed7aa',
                        borderRadius: '6px',
                        background: '#fffbeb',
                        flexShrink: 0,
                        padding: '6px 8px',
                    }}
                >
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#9a3412', marginBottom: '4px' }}>
                        Other correction history ({unmatchedCorrections.length})
                    </div>
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px',
                            maxHeight: '120px',
                            overflowY: 'auto',
                        }}
                    >
                        {unmatchedCorrections.map((c) => (
                            <div
                                key={c.id || `${c.createdAt}-${c.requestedByEmail}`}
                                style={{
                                    padding: '6px 8px',
                                    borderRadius: '4px',
                                    border: '1px solid #fdba74',
                                    background: '#fff',
                                    fontSize: '10.5px',
                                    color: '#334155',
                                }}
                            >
                                <div style={{ fontWeight: 600, color: '#9a3412' }}>
                                    {c.requestedByName || c.requestedByEmail || 'Approver'}
                                    {c.createdAt ? (
                                        <span
                                            style={{
                                                marginLeft: '6px',
                                                fontWeight: 500,
                                                color: '#64748b',
                                                fontSize: '9.5px',
                                            }}
                                        >
                                            {formatApprovalActionAt(c.createdAt) ||
                                                formatSignaturePlacedDateTime(c.createdAt)}
                                        </span>
                                    ) : null}
                                </div>
                                <div
                                    style={{
                                        marginTop: '3px',
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word',
                                        lineHeight: 1.35,
                                    }}
                                >
                                    {c.reason}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}

            {canSendApproval ? (
                <button
                    type="button"
                    disabled={sending}
                    onClick={handleSendApprovalRequest}
                    style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '6px 10px',
                        borderRadius: '4px',
                        border: '1px solid #2563eb',
                        background: '#2563eb',
                        color: '#ffffff',
                        cursor: sending ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        marginTop: '2px',
                    }}
                >
                    <Send size={14} />
                    {sending ? 'Sending…' : 'Send for Approval'}
                </button>
            ) : null}

            {correctionHistoryPopup ? (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Correction history"
                    onClick={() => setCorrectionHistoryPopup(null)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 10050,
                        background: 'rgba(15, 23, 42, 0.45)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '16px',
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: '100%',
                            maxWidth: correctionHistoryPopup.mode === 'all' ? '480px' : '420px',
                            maxHeight: '70vh',
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                            background: '#fff',
                            borderRadius: '10px',
                            border: '1px solid #fdba74',
                            boxShadow: '0 20px 40px rgba(15, 23, 42, 0.25)',
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                justifyContent: 'space-between',
                                gap: '12px',
                                padding: '12px 14px',
                                borderBottom: '1px solid #fed7aa',
                                background: '#fff7ed',
                            }}
                        >
                            <div style={{ minWidth: 0 }}>
                                <div
                                    style={{
                                        fontSize: '13px',
                                        fontWeight: 700,
                                        color: '#9a3412',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                    }}
                                >
                                    <AlertTriangle size={16} />
                                    Correction History
                                </div>
                                <div
                                    style={{
                                        marginTop: '2px',
                                        fontSize: '11px',
                                        color: '#7c2d12',
                                        fontWeight: 600,
                                    }}
                                >
                                    {correctionHistoryPopup.mode === 'all'
                                        ? 'All approvers on this revision'
                                        : correctionHistoryPopup.name}
                                </div>
                                <div style={{ marginTop: '2px', fontSize: '10px', color: '#c2410c' }}>
                                    {correctionHistoryPopup.items.length} remark
                                    {correctionHistoryPopup.items.length === 1 ? '' : 's'}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setCorrectionHistoryPopup(null)}
                                style={{
                                    border: '1px solid #fdba74',
                                    background: '#fff',
                                    borderRadius: '6px',
                                    padding: '4px 8px',
                                    cursor: 'pointer',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    color: '#9a3412',
                                    flexShrink: 0,
                                }}
                            >
                                Close
                            </button>
                        </div>
                        <div
                            style={{
                                padding: '12px 14px',
                                overflowY: 'auto',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px',
                            }}
                        >
                            {correctionHistoryPopup.items.length === 0 ? (
                                <div style={{ fontSize: '12px', color: '#64748b' }}>No correction remarks.</div>
                            ) : (
                                correctionHistoryPopup.items.map((c) => {
                                    const approverLabel = String(
                                        c.requestedByName || c.requestedByEmail || 'Approver'
                                    ).trim();
                                    const whenLabel = c.createdAt
                                        ? formatApprovalActionAt(c.createdAt) ||
                                          formatSignaturePlacedDateTime(c.createdAt)
                                        : '';
                                    return (
                                        <div
                                            key={c.id || `${c.createdAt}-${c.requestedByEmail}`}
                                            style={{
                                                padding: '8px 10px',
                                                borderRadius: '6px',
                                                border: '1px solid #fdba74',
                                                background: '#fffbeb',
                                            }}
                                        >
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'baseline',
                                                    justifyContent: 'space-between',
                                                    gap: '8px',
                                                    marginBottom: '4px',
                                                    flexWrap: 'wrap',
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        fontSize: '12px',
                                                        fontWeight: 700,
                                                        color: '#9a3412',
                                                    }}
                                                >
                                                    {approverLabel}
                                                </div>
                                                {whenLabel ? (
                                                    <div
                                                        style={{
                                                            fontSize: '10px',
                                                            fontWeight: 600,
                                                            color: '#c2410c',
                                                            whiteSpace: 'nowrap',
                                                        }}
                                                    >
                                                        {whenLabel}
                                                    </div>
                                                ) : null}
                                            </div>
                                            {c.requestedByDesignation ? (
                                                <div
                                                    style={{
                                                        fontSize: '10px',
                                                        color: '#a16207',
                                                        marginBottom: '4px',
                                                    }}
                                                >
                                                    {c.requestedByDesignation}
                                                </div>
                                            ) : null}
                                            <div
                                                style={{
                                                    fontSize: '12px',
                                                    color: '#334155',
                                                    whiteSpace: 'pre-wrap',
                                                    wordBreak: 'break-word',
                                                    lineHeight: 1.4,
                                                }}
                                            >
                                                {c.reason}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            ) : null}

            <QuoteApprovalHierarchyModal
                open={hierarchyModalOpen}
                onClose={() => setHierarchyModalOpen(false)}
                approverOptions={approverOptions}
                savedHierarchies={hierarchies}
                apiBase={apiBase}
                userEmail={currentUserEmail}
                onSaved={handleHierarchySaved}
                onDeleted={handleHierarchyDeleted}
                onRefresh={loadHierarchies}
            />
                </>
            )}
        </div>
    );
}
