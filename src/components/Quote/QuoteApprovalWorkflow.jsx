import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Select from 'react-select';
import { UserCheck, Trash2, CheckCircle2, Send, Check, X, Settings2 } from 'lucide-react';
import { formatSignaturePlacedDateTime } from '../../utils/enquiryResultsHelpers';
import QuoteApprovalHierarchyModal from './QuoteApprovalHierarchyModal';
import {
    getCurrentPendingApprovalStep,
    getUserPendingApprovalStep,
    normalizeApprovalEmail,
    normalizeApprovalStep,
    resequenceApprovalSteps,
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
        () => [...(steps || [])].sort((a, b) => a.sequence - b.sequence),
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
        pendingWithEmail.length > 0;

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

    const updateSteps = (next) => {
        onChange(resequenceApprovalSteps(next));
    };

    const applyHierarchySteps = (steps) => {
        const next = (steps || []).map((s, i) => ({
            sequence: i + 1,
            approverEmail: s.approverEmail || s.email,
            approverName: s.approverName || s.name,
            approverDesignation: s.approverDesignation || s.designation || '',
            status: 'pending',
            actionAt: null,
            comments: '',
        }));
        updateSteps(next);
    };

    const handleSelectHierarchy = (opt) => {
        setHierarchyPicker(opt);
        if (!opt?.steps?.length) return;
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

    const removeStep = (index) => {
        if (!canEditApproverList) return;
        updateSteps(orderedSteps.filter((_, i) => i !== index));
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
            const res = await fetch(`${apiBase}/api/quotes/send-approval-request`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    quoteId: quoteId || null,
                    draftQuoteId: draftQuoteId || null,
                    userEmail: email,
                    requestNo: String(enquiryNo).trim(),
                    projectName: String(projectName || '').trim(),
                    customerName: String(customerName || '').trim(),
                    subject: String(quoteSubject || '').trim(),
                    leadJobName: String(leadJobName || '').trim(),
                    ownJob: String(ownJob || '').trim(),
                    quoteNumber: String(quoteNumber || '').trim(),
                    steps: orderedSteps,
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
                alert(data.error || data.details || 'Could not record approval action.');
                return;
            }
            if (Array.isArray(data.steps)) {
                onChange(data.steps);
                onStepsUpdated?.(data.steps);
            }
            setComments('');
        } catch (e) {
            console.warn('[QuoteApprovalWorkflow] action failed', e);
            alert('Could not record approval action.');
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
                flex: '1 1 50%',
                minHeight: 0,
                overflowY: approvalReviewMode ? 'hidden' : 'auto',
                paddingBottom: '4px',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#475569', fontSize: '13px', fontWeight: 600 }}>
                <UserCheck size={18} className="text-blue-500" />
                <span>Approval Workflow</span>
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

            {orderedSteps.length === 0 ? (
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
                    {stepsLoading ? 'Loading workflow…' : 'No approvers yet.'}
                </div>
            ) : (
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
                        return (
                            <div
                                key={`${step.sequence}-${step.approverEmail}`}
                                style={{
                                    border: `1px solid ${isPending ? '#93c5fd' : isApproved ? '#6ee7b7' : isRejected ? '#fca5a5' : '#e2e8f0'}`,
                                    borderRadius: '5px',
                                    padding: '3px 8px',
                                    background: isPending ? '#eff6ff' : isApproved ? '#f0fdf4' : '#ffffff',
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
                                                  : '#e2e8f0',
                                            color: isApproved || isRejected ? '#ffffff' : '#334155',
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
                                                  : 'none',
                                        }}
                                        title={
                                            isApproved
                                                ? 'Approved'
                                                : isRejected
                                                  ? 'Rejected'
                                                  : `Step ${step.sequence}`
                                        }
                                    >
                                        {isApproved ? (
                                            <Check size={12} strokeWidth={3} aria-hidden />
                                        ) : isRejected ? (
                                            <X size={12} strokeWidth={3} aria-hidden />
                                        ) : (
                                            step.sequence
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
                                        ) : isRejected ? (
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
                                        ) : !isApproved && !isRejected ? (
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
                                        ) : null}
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
            )}

            {userCanAct ? (
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
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>
                        Comments
                    </label>
                    <textarea
                        value={comments}
                        onChange={(e) => setComments(e.target.value)}
                        rows={3}
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
                    <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                            type="button"
                            disabled={acting}
                            onClick={() => handleApprovalAction('approved')}
                            style={{
                                width: '100%',
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
