import React, { useState, useEffect, useMemo } from 'react';
import { X, Pencil, Plus } from 'lucide-react';
import { getEnquiryStructureAssigneeUsersForDivision } from '../../utils/dashboardCcAccess';

const HierarchyBuilder = ({
    options,
    value = [],
    onChange,
    label,
    error,
    /** Item ids (strings) whose SE dropdown should show validation error styling */
    assigneeErrorIds = [],
    /** Item ids missing accountable selection when multiple SEs are assigned */
    accountableErrorIds = [],
    showNew = false,
    onNew,
    showEdit = false,
    onEditItem,
    canRemove = true,
    canRemoveItem = null, // Callback: (item) => boolean, determines if specific item can be removed
    onRemoveBlocked = null, // Callback: (item) => void, invoked when user tries to remove a blocked item
    assigneeUsers = [],
    enqItems = [],
    canEditAssignee = true
}) => {
    // Value expected to be array of { id, itemName, parentId, parentName }
    // Legacy support: array of strings OR array of objects with parentName only.

    const [localItems, setLocalItems] = useState([]);
    const errorIdSet = useMemo(
        () => new Set((assigneeErrorIds || []).map((id) => String(id))),
        [assigneeErrorIds]
    );
    const accountableErrorIdSet = useMemo(
        () => new Set((accountableErrorIds || []).map((id) => String(id))),
        [accountableErrorIds]
    );

    useEffect(() => {
        if (Array.isArray(value)) {
            // 1. First pass: Ensure all items have IDs
            let items = value.map(v => {
                let item = typeof v === 'string' ? { itemName: v, parentName: null } : { ...v };

                // Extract legacy string format if leadJobCode is missing
                if (!item.leadJobCode && item.itemName) {
                    const match = item.itemName.match(/^(L\d+)\s+-\s+(.*)$/);
                    if (match) {
                        item.leadJobCode = match[1];
                        item.itemName = match[2];
                    }
                }

                // Use backend ID if available, else generate temp id
                if (!item.id) item.id = Math.random().toString(36).substr(2, 9);
                // Ensure parentId field exists (might be null)
                if (item.parentId === undefined) item.parentId = null;
                // Normalize per-item assignees to array
                if (!Array.isArray(item.assignedSEs)) {
                    if (item.assignedSE) item.assignedSEs = [String(item.assignedSE).trim()].filter(Boolean);
                    else item.assignedSEs = [];
                }
                if (item.accountableSE === undefined) item.accountableSE = '';
                if (!item.accountableSE && item.assignedSEs.length === 1) {
                    item.accountableSE = item.assignedSEs[0];
                }
                return item;
            });

            // 2. Resolve legacy parentName linkage if parentId is missing
            const nameToIdMap = new Map();
            // Assuming legacy data doesn't have duplicate names in a way that matters, or we take first match
            items.forEach(i => {
                if (!nameToIdMap.has(i.itemName)) {
                    nameToIdMap.set(i.itemName, i.id);
                }
            });

            items = items.map(item => {
                // If it has a parentName but NO parentId, try to link it
                if (!item.parentId && item.parentName) {
                    const linkedId = nameToIdMap.get(item.parentName);
                    if (linkedId) {
                        return { ...item, parentId: linkedId };
                    }
                }
                return item;
            });

            setLocalItems(items);
        }
    }, [value]);

    const updateItems = (newItems) => {
        setLocalItems(newItems);
        onChange(newItems);
    };

    const handleAddRoot = (name) => {
        if (!name) return;

        // Calculate Next Prefix (L1, L2...) for Lead Jobs
        const rootItems = localItems.filter(i => !i.parentId);
        const usedCodes = rootItems
            .map(i => {
                if (i.leadJobCode) {
                    const match = i.leadJobCode.match(/^L(\d+)$/);
                    return match ? parseInt(match[1]) : 0;
                }
                const match = i.itemName.match(/^L(\d+)\s-\s/);
                return match ? parseInt(match[1]) : 0;
            });

        const nextCode = usedCodes.length > 0 ? Math.max(...usedCodes) + 1 : 1;
        const leadCode = `L${nextCode}`;

        // Check duplicate name
        if (localItems.some(i => !i.parentId && i.itemName === name)) {
            alert('This Job is already added.');
            return;
        }

        const newItem = {
            itemName: name,
            leadJobCode: leadCode,
            parentId: null,
            parentName: null,
            id: Math.random().toString(36).substr(2, 9)
        };
        updateItems([...localItems, newItem]);
    };

    const handleAddSubJob = (parentItem, childName) => {
        if (!childName) return;

        const getRootId = (item) => {
            if (!item) return null;
            const byId = new Map(localItems.map(i => [i.id, i]));
            let cur = item;
            let safety = 0;
            while (cur && cur.parentId && safety < 40) {
                const p = byId.get(cur.parentId);
                if (!p) break;
                cur = p;
                safety++;
            }
            return cur?.id || null;
        };

        const rootId = getRootId(parentItem);
        const branchItems = rootId
            ? localItems.filter(i => getRootId(i) === rootId)
            : [];

        // Prevent duplicate job names anywhere under the same lead branch
        if (branchItems.some(i => i.itemName === childName)) {
            alert('This Job is already included under this Lead Job.');
            return;
        }

        const newItem = {
            itemName: childName,
            parentId: parentItem.id,
            parentName: parentItem.itemName, // Maintain legacy field
            id: Math.random().toString(36).substr(2, 9)
        };
        updateItems([...localItems, newItem]);
    };

    const handleRemoveItem = (itemToRemove) => {
        // 1. Remove the specific item by ID
        let currentItems = localItems.filter(i => i.id !== itemToRemove.id);

        // 2. Recursively remove orphans (items whose parentId no longer exists in the list)
        let changed = true;
        while (changed) {
            changed = false;
            const existingIds = new Set(currentItems.map(i => i.id));

            // Allow roots (parentId is null)
            const remaining = currentItems.filter(i => {
                if (!i.parentId) return true; // Keep roots
                if (existingIds.has(i.parentId)) return true; // Keep if parent ID exists

                // If parent ID does NOT exist, remove this item
                changed = true;
                return false;
            });
            currentItems = remaining;
        }

        updateItems(currentItems);
    };

    const handleAssigneeChange = (itemId, assignees, accountableSE) => {
        const updated = localItems.map((i) => {
            if (i.id !== itemId) return i;
            const nextAssignees = Array.isArray(assignees) ? assignees : [];
            let nextAccountable = accountableSE !== undefined ? accountableSE : i.accountableSE;
            if (nextAssignees.length === 1) {
                nextAccountable = nextAssignees[0];
            } else if (nextAccountable && !nextAssignees.includes(nextAccountable)) {
                nextAccountable = '';
            }
            return { ...i, assignedSEs: nextAssignees, accountableSE: nextAccountable || '' };
        });
        updateItems(updated);
    };

    const handleAddAssignee = (itemId, name) => {
        const picked = String(name || '').trim();
        if (!picked) return;
        const item = localItems.find(i => i.id === itemId);
        const current = Array.isArray(item?.assignedSEs) ? item.assignedSEs : [];
        if (current.includes(picked)) return;
        const next = [...current, picked];
        const accountable = current.length === 0 ? picked : (item?.accountableSE || '');
        handleAssigneeChange(itemId, next, accountable);
    };

    const handleRemoveAssignee = (itemId, name) => {
        const item = localItems.find(i => i.id === itemId);
        const current = Array.isArray(item?.assignedSEs) ? item.assignedSEs : [];
        const next = current.filter(n => n !== name);
        const accountable =
            item?.accountableSE === name ? (next.length === 1 ? next[0] : '') : (item?.accountableSE || '');
        handleAssigneeChange(itemId, next, accountable);
    };

    const handleSetAccountable = (itemId, name) => {
        const item = localItems.find(i => i.id === itemId);
        const current = Array.isArray(item?.assignedSEs) ? item.assignedSEs : [];
        if (!current.includes(name)) return;
        handleAssigneeChange(itemId, current, name);
    };

    const getAssigneeOptionsForItem = (item) => {
        const divisionLabel = String(item?.itemName || '').trim();
        const usersForDivision = getEnquiryStructureAssigneeUsersForDivision(
            divisionLabel,
            enqItems,
            assigneeUsers
        );
        const names = (usersForDivision || [])
            .map((u) => String(u?.FullName || u?.fullName || '').trim())
            .filter(Boolean);
        return [...new Set(names)].sort((a, b) => a.localeCompare(b));
    };

    // Helper to get available options
    // Filter out items that are already children of this parentID
    const getAvailableOptions = (parentId) => {
        const getRootIdById = (id) => {
            const byId = new Map(localItems.map(i => [i.id, i]));
            let cur = byId.get(id);
            let safety = 0;
            while (cur && cur.parentId && safety < 40) {
                const p = byId.get(cur.parentId);
                if (!p) break;
                cur = p;
                safety++;
            }
            return cur?.id || null;
        };

        let blockedNames = [];
        if (parentId) {
            const rootId = getRootIdById(parentId);
            // For subjobs: block names already used anywhere in the same lead branch
            blockedNames = localItems
                .filter(i => {
                    const rid = getRootIdById(i.id);
                    return rid && rootId && rid === rootId;
                })
                .map(i => i.itemName);
        } else {
            // For roots: block names already used as roots (existing behavior)
            blockedNames = localItems.filter(i => !i.parentId).map(i => i.itemName);
        }

        const available = options.filter((opt) => opt && !blockedNames.includes(opt));
        const unique = [...new Set(available)];
        unique.sort((a, b) =>
            String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
        );
        return unique;
    };

    // Helper: find root Lead prefix (L1, L2...) for any item based on root index
    const getRootLeadPrefix = (item) => {
        if (!item) return null;

        const byId = new Map(localItems.map(i => [i.id, i]));
        let current = item;

        // Walk up to the root (no parentId)
        while (current && current.parentId) {
            const next = byId.get(current.parentId);
            if (!next) break;
            current = next;
        }

        // Determine this root's index among all roots
        const roots = localItems.filter(i => !i.parentId);
        const rootIndex = roots.findIndex(r => r.id === current.id);
        if (rootIndex === -1) return null;

        return `L${rootIndex + 1}`;
    };

    // Render Tree Node
    const renderNode = (item, level = 0) => {
        // Find children: Items whose parentId matches this item's id
        const children = localItems.filter(i => i.parentId === item.id);

        const leadPrefix = getRootLeadPrefix(item);

        // Derive clean base name:
        // - For Lead jobs (level 0): take the part BEFORE " - "
        // - For Sub jobs: take the part AFTER " - "
        let baseName = (item.itemName || '').trim();
        const parts = baseName.split(' - ');
        if (parts.length > 1) {
            if (level === 0) {
                baseName = parts[0].trim();
            } else {
                baseName = parts[1].trim();
            }
        }

        const displayText = `${leadPrefix ? `${leadPrefix} - ` : ''}${baseName}`;

        return (
            <div key={item.id} style={{ marginLeft: `${level * 20}px`, marginTop: '8px', position: 'relative' }}>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '6px 10px',
                    background: level === 0 ? '#f0fdf4' : '#fff',
                    border: level === 0 ? '1px solid #e2e8f0' : 'none',
                    borderRadius: '6px',
                    width: 'fit-content'
                }}>
                    <span style={{ fontWeight: level === 0 ? '700' : '500', color: level === 0 ? '#166534' : '#334155' }}>
                        {level > 0 && (
                            <span style={{ marginRight: '8px', color: '#dc2626', fontWeight: 900, fontSize: '16px' }}>↳</span>
                        )}
                        {displayText}
                        {level === 0 && <span style={{ fontSize: '10px', marginLeft: '6px', background: '#166534', color: 'white', padding: '1px 4px', borderRadius: '4px' }}>LEAD</span>}
                    </span>

                    <div style={{ marginLeft: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {showEdit && onEditItem && (
                            <button
                                type="button"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEditItem(item); }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', display: 'flex', padding: 0 }}
                                title="Edit Item"
                            >
                                <Pencil size={14} />
                            </button>
                        )}
                        {canRemove && (() => {
                            const removable = !canRemoveItem || canRemoveItem(item);
                            return (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (!removable) {
                                        if (typeof onRemoveBlocked === 'function') onRemoveBlocked(item);
                                        else alert('This job is already priced. Delete its prices first, then delete the job.');
                                        return;
                                    }
                                    handleRemoveItem(item);
                                }}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: removable ? 'pointer' : 'not-allowed',
                                    color: removable ? '#ef4444' : '#94a3b8',
                                    display: 'flex',
                                    padding: 0,
                                    opacity: removable ? 1 : 0.7
                                }}
                                title={removable ? 'Remove' : 'Cannot remove (priced)'}
                            >
                                <X size={14} />
                            </button>
                            );
                        })()}
                    </div>

                    {/* Add Child Button */}
                    <div style={{ position: 'relative', marginLeft: '8px' }}>
                        <select
                            style={{
                                padding: '2px 4px', fontSize: '11px', border: '1px solid #cbd5e1', borderRadius: '4px',
                                width: '100px', background: '#f8fafc'
                            }}
                            value=""
                            onChange={(e) => handleAddSubJob(item, e.target.value)}
                        >
                            <option value="">+ Add Sub</option>
                            {/* Pass *this* item's ID as parent context */}
                            {getAvailableOptions(item.id).map((opt, idx) => (
                                <option key={`${opt}-${idx}`} value={opt}>{opt}</option>
                            ))}
                        </select>
                    </div>

                </div>

                {/* Per-item Assignment BELOW each department row */}
                <div style={{
                    marginTop: '6px',
                    marginLeft: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    flexWrap: 'wrap'
                }}>
                    {(() => {
                        const itemAssignees = getAssigneeOptionsForItem(item);
                        const selected = Array.isArray(item.assignedSEs) ? item.assignedSEs : [];
                        const availableToPick = itemAssignees.filter(n => !selected.includes(n));
                        const missingSe = errorIdSet.has(String(item.id));
                        const missingAccountable =
                            accountableErrorIdSet.has(String(item.id)) ||
                            (selected.length > 1 && !String(item.accountableSE || '').trim());
                        const seSelectStyle = missingSe
                            ? {
                                padding: '2px 6px', fontSize: '11px', border: '2px solid #dc2626', borderRadius: '4px',
                                width: '210px', background: '#fef2f2', color: '#991b1b'
                            }
                            : {
                                padding: '2px 6px', fontSize: '11px', border: '1px solid #93c5fd', borderRadius: '4px',
                                width: '210px', background: '#dbeafe', color: '#1e3a8a'
                            };
                        return (
                            <>
                                <select
                                    key={`se-dd-${item.id}-${selected.join('|')}`}
                                    style={seSelectStyle}
                                    value=""
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        if (v) handleAddAssignee(item.id, v);
                                    }}
                                    disabled={!canEditAssignee || availableToPick.length === 0}
                                >
                                    <option value="">{availableToPick.length > 0 ? 'Select SE / EE / QS' : 'No engineers'}</option>
                                    {availableToPick.map((opt, idx) => (
                                        <option key={`${opt}-${idx}`} value={opt}>{opt}</option>
                                    ))}
                                </select>
                                {selected.map((name, idx) => {
                                    const isAccountable =
                                        selected.length === 1
                                            ? true
                                            : String(item.accountableSE || '').trim() === name;
                                    return (
                                    <span key={`${name}-${idx}`} style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        border: isAccountable && selected.length > 1 ? '1px solid #dc2626' : '1px solid #93c5fd',
                                        borderRadius: '999px',
                                        background: isAccountable && selected.length > 1 ? '#fee2e2' : '#dbeafe',
                                        padding: '2px 8px',
                                        fontSize: '11px',
                                        color: '#1e3a8a',
                                        fontWeight: 700
                                    }}>
                                        {selected.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => handleSetAccountable(item.id, name)}
                                                disabled={!canEditAssignee}
                                                style={{
                                                    border: 'none',
                                                    background: 'transparent',
                                                    color: isAccountable ? '#dc2626' : '#64748b',
                                                    fontSize: '13px',
                                                    fontWeight: isAccountable ? 900 : 400,
                                                    lineHeight: 1,
                                                    cursor: canEditAssignee ? 'pointer' : 'not-allowed',
                                                    padding: 0,
                                                    width: '14px',
                                                    textAlign: 'center',
                                                }}
                                                title={isAccountable ? 'Accountable member' : 'Mark as accountable member'}
                                                aria-label={isAccountable ? 'Accountable member' : 'Mark as accountable member'}
                                            >
                                                {isAccountable ? '✓' : '○'}
                                            </button>
                                        )}
                                        {name}
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveAssignee(item.id, name)}
                                            disabled={!canEditAssignee}
                                            style={{
                                                border: 'none',
                                                background: 'transparent',
                                                color: '#ef4444',
                                                fontSize: '12px',
                                                lineHeight: 1,
                                                cursor: canEditAssignee ? 'pointer' : 'not-allowed',
                                                padding: 0
                                            }}
                                            title="Remove"
                                        >
                                            ×
                                        </button>
                                    </span>
                                    );
                                })}
                                {selected.length > 1 && (
                                    <div
                                        style={{
                                            flexBasis: '100%',
                                            fontSize: '11px',
                                            lineHeight: 1.35,
                                            marginTop: '2px',
                                            color: missingAccountable ? '#dc2626' : '#92400e',
                                            fontWeight: missingAccountable ? 700 : 500,
                                        }}
                                    >
                                        {missingAccountable
                                            ? 'Required: click ○ on one member to mark accountable (bold red ✓).'
                                            : 'Multiple members — click ○ on one chip to mark the accountable member (bold red ✓).'}
                                    </div>
                                )}
                            </>
                        );
                    })()}
                </div>

                {/* Recursively render children */}
                {children.length > 0 && (
                    <div style={{ marginLeft: '14px', paddingLeft: '2px', marginTop: '4px' }}>
                        {children.map(child => renderNode(child, level + 1))}
                    </div>
                )}
            </div>
        );
    };

    const rootItems = localItems.filter(i => !i.parentId);

    return (
        <div style={{ marginBottom: '16px' }}>
            {label && <label className="form-label" style={{ display: 'block', marginBottom: '4px' }}>{label}</label>}

            <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '12px', background: '#fff' }}>

                {/* Existing Roots */}
                {rootItems.length > 0 && (
                    <div style={{ marginBottom: '16px' }}>
                        {rootItems.map(root => renderNode(root))}
                    </div>
                )}

                {/* Add Lead Job Selector */}
                <div style={rootItems.length > 0 ? { borderTop: '1px solid #eee', paddingTop: '12px' } : {}}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <select
                            className="form-select form-select-sm"
                            value=""
                            style={{ maxWidth: '300px' }}
                            onChange={(e) => handleAddRoot(e.target.value)}
                        >
                            <option value="">{rootItems.length > 0 ? "+ Add Another Lead Job" : "-- Select Lead Job --"}</option>
                            {/* Pass null for root options */}
                            {getAvailableOptions(null).map((opt, idx) => (
                                <option key={`${opt}-${idx}`} value={opt}>{opt}</option>
                            ))}
                        </select>
                        {showNew && onNew && (
                            <button
                                type="button"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onNew(e); }}
                                className="btn btn-sm btn-outline-success"
                                style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                title="Add New Scope"
                            >
                                <Plus size={16} /> New
                            </button>
                        )}
                    </div>
                    {localItems.length === 0 && (
                        <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '8px', fontStyle: 'italic' }}>
                            Select a Lead Job to start building the hierarchy.
                        </div>
                    )}
                </div>
            </div>
            {error && <div className="text-danger" style={{ fontSize: '12px', marginTop: '2px' }}>{error}</div>}
        </div>
    );
};

export default HierarchyBuilder;
