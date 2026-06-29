import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Select from 'react-select';
import { X, Plus, Trash2, ChevronUp, ChevronDown, Save } from 'lucide-react';
import { normalizeApprovalEmail } from '../../utils/quoteApprovalWorkflow';

const selectStyles = {
    control: (base) => ({
        ...base,
        minHeight: '32px',
        fontSize: '12px',
        borderColor: '#cbd5e1',
        boxShadow: 'none',
    }),
    valueContainer: (base) => ({ ...base, padding: '0 6px' }),
    input: (base) => ({ ...base, margin: 0, padding: 0 }),
    indicatorsContainer: (base) => ({ ...base, height: '30px' }),
    menu: (base) => ({ ...base, fontSize: '12px', zIndex: 100600 }),
    option: (base, state) => ({
        ...base,
        fontSize: '12px',
        backgroundColor: state.isFocused ? '#e2e8f0' : 'white',
        color: '#1f2937',
    }),
    singleValue: (base) => ({ ...base, color: '#1f2937' }),
    placeholder: (base) => ({ ...base, color: '#94a3b8' }),
};

function cloneSteps(steps) {
    return (steps || []).map((s, i) => ({
        sequence: i + 1,
        approverEmail: s.approverEmail || s.email || '',
        approverName: s.approverName || s.name || '',
        approverDesignation: s.approverDesignation || s.designation || '',
    }));
}

export default function QuoteApprovalHierarchyModal({
    open,
    onClose,
    approverOptions = [],
    savedHierarchies = [],
    apiBase,
    userEmail,
    onSaved,
    onDeleted,
    onRefresh,
}) {
    const [editingId, setEditingId] = useState(null);
    const [loadPicker, setLoadPicker] = useState(null);
    const [hierarchyName, setHierarchyName] = useState('');
    const [draftSteps, setDraftSteps] = useState([]);
    const [pickerValue, setPickerValue] = useState(null);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const resetToNew = () => {
        setEditingId(null);
        setLoadPicker(null);
        setHierarchyName('');
        setDraftSteps([]);
        setPickerValue(null);
    };

    useEffect(() => {
        if (!open) return;
        resetToNew();
    }, [open]);

    const savedOptions = useMemo(
        () =>
            (savedHierarchies || []).map((h) => ({
                value: h.id,
                label: h.name,
                hierarchy: h,
            })),
        [savedHierarchies]
    );

    const usedEmails = useMemo(
        () => new Set(draftSteps.map((s) => normalizeApprovalEmail(s.approverEmail)).filter(Boolean)),
        [draftSteps]
    );

    const availableOptions = (approverOptions || []).filter((o) => !usedEmails.has(o.value));

    const handleLoadHierarchy = (opt) => {
        setLoadPicker(opt);
        if (!opt?.hierarchy) {
            resetToNew();
            return;
        }
        const h = opt.hierarchy;
        setEditingId(h.id);
        setHierarchyName(h.name || '');
        setDraftSteps(cloneSteps(h.steps));
        setPickerValue(null);
    };

    const handleAddDraftStep = () => {
        if (!pickerValue) return;
        setDraftSteps((prev) => [
            ...prev,
            {
                sequence: prev.length + 1,
                approverEmail: pickerValue.email || pickerValue.value,
                approverName: pickerValue.name || pickerValue.label,
                approverDesignation: pickerValue.designation || '',
            },
        ]);
        setPickerValue(null);
    };

    const removeDraftStep = (index) => {
        setDraftSteps((prev) =>
            prev
                .filter((_, i) => i !== index)
                .map((s, i) => ({ ...s, sequence: i + 1 }))
        );
    };

    const moveDraftStep = (index, dir) => {
        setDraftSteps((prev) => {
            const next = [...prev];
            const target = index + dir;
            if (target < 0 || target >= next.length) return prev;
            [next[index], next[target]] = [next[target], next[index]];
            return next.map((s, i) => ({ ...s, sequence: i + 1 }));
        });
    };

    const handleSave = async () => {
        const name = String(hierarchyName || '').trim();
        const email = String(userEmail || '').trim();
        if (!name) {
            alert('Enter a hierarchy name.');
            return;
        }
        if (!draftSteps.length) {
            alert('Add at least one approver to the hierarchy.');
            return;
        }
        if (!email) {
            alert('Sign in to save approval hierarchies.');
            return;
        }

        setSaving(true);
        try {
            const res = await fetch(`${apiBase}/api/quotes/approval-hierarchies`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userEmail: email,
                    id: editingId || null,
                    name,
                    steps: draftSteps,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                alert(data.error || 'Could not save hierarchy.');
                return;
            }
            onSaved?.(data.hierarchy);
            onRefresh?.();
            onClose?.();
        } catch (e) {
            console.warn('[QuoteApprovalHierarchyModal] save', e);
            alert('Could not save hierarchy.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!editingId) return;
        const email = String(userEmail || '').trim();
        if (!email) return;
        if (!window.confirm(`Delete hierarchy "${hierarchyName}"?`)) return;

        setDeleting(true);
        try {
            const res = await fetch(
                `${apiBase}/api/quotes/approval-hierarchies/${encodeURIComponent(editingId)}?userEmail=${encodeURIComponent(email)}`,
                { method: 'DELETE' }
            );
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                alert(data.error || 'Could not delete hierarchy.');
                return;
            }
            onDeleted?.(editingId);
            onRefresh?.();
            resetToNew();
        } catch (e) {
            console.warn('[QuoteApprovalHierarchyModal] delete', e);
            alert('Could not delete hierarchy.');
        } finally {
            setDeleting(false);
        }
    };

    if (!open) return null;
    const portalTarget = typeof document !== 'undefined' ? document.body : null;
    if (!portalTarget) return null;

    const isEditing = !!editingId;

    return createPortal(
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(15,23,42,0.45)',
                zIndex: 100500,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px',
                boxSizing: 'border-box',
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="approval-hierarchy-title"
        >
            <div
                style={{
                    background: '#fff',
                    borderRadius: '10px',
                    maxWidth: 'min(96vw, 480px)',
                    width: '100%',
                    maxHeight: '90vh',
                    overflow: 'auto',
                    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                    border: '1px solid #e2e8f0',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 14px',
                        borderBottom: '1px solid #e2e8f0',
                    }}
                >
                    <h2 id="approval-hierarchy-title" style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                        {isEditing ? 'Edit Approval Hierarchy' : 'Set Approval Hierarchy'}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{ border: 'none', background: '#f1f5f9', borderRadius: '8px', padding: '6px', cursor: 'pointer' }}
                        aria-label="Close"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>Load saved hierarchy</span>
                        <Select
                            options={savedOptions}
                            value={loadPicker}
                            onChange={handleLoadHierarchy}
                            placeholder={savedOptions.length ? 'Select to edit…' : 'No saved hierarchies yet'}
                            isClearable
                            isDisabled={!savedOptions.length}
                            styles={selectStyles}
                        />
                        {isEditing ? (
                            <button
                                type="button"
                                onClick={resetToNew}
                                style={{
                                    fontSize: '11px',
                                    color: '#3b82f6',
                                    background: 'white',
                                    border: '1px solid #cbd5e1',
                                    padding: '4px 10px',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    alignSelf: 'flex-start',
                                }}
                            >
                                + New hierarchy
                            </button>
                        ) : null}
                    </div>

                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', fontWeight: 600, color: '#475569' }}>
                        Hierarchy name
                        <input
                            type="text"
                            value={hierarchyName}
                            onChange={(e) => setHierarchyName(e.target.value)}
                            placeholder="e.g. Standard BMS approval"
                            style={{
                                fontSize: '12px',
                                padding: '6px 8px',
                                border: '1px solid #cbd5e1',
                                borderRadius: '6px',
                            }}
                        />
                    </label>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>Add approvers in sequence</span>
                        <Select
                            options={availableOptions}
                            value={pickerValue}
                            onChange={setPickerValue}
                            placeholder="Select approver…"
                            isClearable
                            styles={selectStyles}
                        />
                        <button
                            type="button"
                            onClick={handleAddDraftStep}
                            disabled={!pickerValue}
                            style={{
                                fontSize: '11px',
                                color: pickerValue ? '#3b82f6' : '#94a3b8',
                                background: 'white',
                                border: `1px solid ${pickerValue ? '#3b82f6' : '#cbd5e1'}`,
                                padding: '4px 10px',
                                borderRadius: '4px',
                                cursor: pickerValue ? 'pointer' : 'not-allowed',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px',
                            }}
                        >
                            <Plus size={14} /> Add to sequence
                        </button>
                    </div>

                    {draftSteps.length === 0 ? (
                        <div
                            style={{
                                border: '1px dashed #cbd5e1',
                                borderRadius: '6px',
                                padding: '10px',
                                textAlign: 'center',
                                fontSize: '11px',
                                color: '#94a3b8',
                            }}
                        >
                            No approvers in this hierarchy yet.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {draftSteps.map((step, index) => (
                                <div
                                    key={`${step.approverEmail}-${index}`}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '8px',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '6px',
                                        background: '#f8fafc',
                                    }}
                                >
                                    <span
                                        style={{
                                            minWidth: '22px',
                                            height: '22px',
                                            borderRadius: '999px',
                                            background: '#e2e8f0',
                                            fontSize: '11px',
                                            fontWeight: 700,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        {index + 1}
                                    </span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#1e293b' }}>{step.approverName}</div>
                                        {step.approverDesignation ? (
                                            <div style={{ fontSize: '10px', color: '#64748b' }}>{step.approverDesignation}</div>
                                        ) : null}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => moveDraftStep(index, -1)}
                                        disabled={index === 0}
                                        style={{ border: 'none', background: 'transparent', cursor: index === 0 ? 'not-allowed' : 'pointer', color: '#64748b', padding: 0 }}
                                        title="Move up"
                                    >
                                        <ChevronUp size={14} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => moveDraftStep(index, 1)}
                                        disabled={index === draftSteps.length - 1}
                                        style={{ border: 'none', background: 'transparent', cursor: index === draftSteps.length - 1 ? 'not-allowed' : 'pointer', color: '#64748b', padding: 0 }}
                                        title="Move down"
                                    >
                                        <ChevronDown size={14} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => removeDraftStep(index)}
                                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', padding: 0 }}
                                        title="Remove"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', marginTop: '4px', flexWrap: 'wrap' }}>
                        {isEditing ? (
                            <button
                                type="button"
                                disabled={deleting || saving}
                                onClick={handleDelete}
                                style={{
                                    fontSize: '11px',
                                    padding: '6px 12px',
                                    borderRadius: '4px',
                                    border: '1px solid #dc2626',
                                    background: '#fff',
                                    color: '#dc2626',
                                    cursor: deleting ? 'wait' : 'pointer',
                                    fontWeight: 600,
                                }}
                            >
                                {deleting ? 'Deleting…' : 'Delete'}
                            </button>
                        ) : (
                            <span />
                        )}
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                type="button"
                                onClick={onClose}
                                style={{
                                    fontSize: '11px',
                                    padding: '6px 12px',
                                    borderRadius: '4px',
                                    border: '1px solid #cbd5e1',
                                    background: '#fff',
                                    cursor: 'pointer',
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={saving || deleting}
                                onClick={handleSave}
                                style={{
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    padding: '6px 12px',
                                    borderRadius: '4px',
                                    border: '1px solid #2563eb',
                                    background: '#2563eb',
                                    color: '#fff',
                                    cursor: saving ? 'wait' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                }}
                            >
                                <Save size={14} />
                                {saving ? 'Saving…' : isEditing ? 'Update hierarchy' : 'Save hierarchy'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        portalTarget
    );
}
