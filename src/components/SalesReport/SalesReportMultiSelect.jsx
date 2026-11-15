import React from 'react';
import { createPortal } from 'react-dom';
import './SalesReportMultiSelect.css';

/**
 * @typedef {{ id: string, label: string, options: string[] }} SrMultiSelectGroup
 */

export default function SalesReportMultiSelect({
    label,
    ariaLabel,
    options = [],
    /** Optional currency (or other) groups — when set, options are rendered under group headers. */
    groups = null,
    value = [],
    onChange,
    disabled = false,
    minWidth = 180,
    allLabel = 'All',
    showSelectAll = true,
    /**
     * When true with groups: selecting a company in currency B clears any selection from currency A.
     * Select All is per-group only (never across currencies).
     */
    singleGroupSelection = false,
}) {
    const [open, setOpen] = React.useState(false);
    const [panelStyle, setPanelStyle] = React.useState(null);
    const wrapRef = React.useRef(null);
    const triggerRef = React.useRef(null);
    const panelRef = React.useRef(null);
    const selected = Array.isArray(value) ? value : [];
    const useGroups = Array.isArray(groups) && groups.length > 0;
    const flatOptions = useGroups
        ? groups.flatMap((g) => (Array.isArray(g.options) ? g.options : []))
        : Array.isArray(options)
          ? options
          : [];

    const optionGroupId = React.useMemo(() => {
        const map = new Map();
        if (!useGroups) return map;
        for (const g of groups) {
            const id = String(g?.id || '');
            for (const opt of g?.options || []) map.set(opt, id);
        }
        return map;
    }, [useGroups, groups]);

    const activeGroupId = React.useMemo(() => {
        if (!useGroups || !selected.length) return null;
        for (const name of selected) {
            const id = optionGroupId.get(name);
            if (id) return id;
        }
        return null;
    }, [useGroups, selected, optionGroupId]);

    const isAll = selected.length === 0;
    const displayLabel = isAll
        ? allLabel
        : selected.length === 1
          ? selected[0]
          : activeGroupId
            ? `${selected.length} selected (${activeGroupId})`
            : `${selected.length} selected`;

    const updatePanelPosition = React.useCallback(() => {
        const el = triggerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const width = Math.max(rect.width, useGroups ? 280 : 220);
        let left = rect.left;
        if (left + width > window.innerWidth - 8) {
            left = Math.max(8, window.innerWidth - width - 8);
        }
        setPanelStyle({
            position: 'fixed',
            top: rect.bottom + 2,
            left,
            minWidth: width,
            zIndex: 10050,
        });
    }, [useGroups]);

    React.useLayoutEffect(() => {
        if (!open) {
            setPanelStyle(null);
            return undefined;
        }
        updatePanelPosition();
        const onDoc = (e) => {
            const t = e.target;
            if (wrapRef.current?.contains(t)) return;
            if (panelRef.current?.contains(t)) return;
            setOpen(false);
        };
        const onReposition = () => updatePanelPosition();
        document.addEventListener('mousedown', onDoc);
        window.addEventListener('resize', onReposition);
        window.addEventListener('scroll', onReposition, true);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            window.removeEventListener('resize', onReposition);
            window.removeEventListener('scroll', onReposition, true);
        };
    }, [open, updatePanelPosition]);

    const toggleOption = (opt) => {
        if (selected.includes(opt)) {
            onChange(selected.filter((v) => v !== opt));
            return;
        }
        if (singleGroupSelection && useGroups) {
            const nextGroup = optionGroupId.get(opt);
            const kept = nextGroup
                ? selected.filter((v) => optionGroupId.get(v) === nextGroup)
                : selected;
            onChange([...kept, opt]);
            return;
        }
        onChange([...selected, opt]);
    };

    const selectGroupAll = (groupOptions) => {
        const list = Array.isArray(groupOptions) ? groupOptions : [];
        onChange([...list]);
    };

    const closeOnMouseLeave = () => {
        setOpen(false);
    };

    const renderOptionRow = (opt) => {
        const groupId = optionGroupId.get(opt);
        const otherCurrency =
            singleGroupSelection &&
            useGroups &&
            activeGroupId &&
            groupId &&
            groupId !== activeGroupId &&
            !selected.includes(opt);
        return (
            <label
                key={opt}
                className={`sr-multi-select__option${otherCurrency ? ' sr-multi-select__option--other-currency' : ''}`}
                title={
                    otherCurrency
                        ? `Selecting switches to ${groupId} (clears ${activeGroupId})`
                        : undefined
                }
            >
                <input
                    type="checkbox"
                    checked={selected.includes(opt)}
                    onChange={() => toggleOption(opt)}
                />
                <span>{opt}</span>
            </label>
        );
    };

    const panel =
        open && !disabled && panelStyle && typeof document !== 'undefined'
            ? createPortal(
                  <div
                      ref={panelRef}
                      className="sr-multi-select__panel sr-multi-select__panel--portal"
                      style={panelStyle}
                      onMouseLeave={closeOnMouseLeave}
                  >
                      {showSelectAll && !useGroups ? (
                          <div className="sr-multi-select__actions">
                              <button type="button" onClick={() => onChange([...flatOptions])}>
                                  Select All
                              </button>
                              <button type="button" onClick={() => onChange([])}>
                                  Clear All
                              </button>
                          </div>
                      ) : null}
                      {showSelectAll && useGroups ? (
                          <div className="sr-multi-select__actions">
                              <button type="button" onClick={() => onChange([])}>
                                  Clear All
                              </button>
                              <span className="sr-multi-select__hint">One currency at a time</span>
                          </div>
                      ) : null}
                      <div className="sr-multi-select__options">
                          {useGroups
                              ? groups.map((g) => {
                                    const opts = Array.isArray(g.options) ? g.options : [];
                                    if (!opts.length) return null;
                                    const gid = String(g.id || g.label || '');
                                    const groupActive = !activeGroupId || activeGroupId === gid;
                                    return (
                                        <div key={gid || g.label} className="sr-multi-select__group">
                                            <div className="sr-multi-select__group-header">
                                                <span className="sr-multi-select__group-label">
                                                    {g.label || gid}
                                                </span>
                                                {showSelectAll ? (
                                                    <button
                                                        type="button"
                                                        className="sr-multi-select__group-select"
                                                        title={
                                                            singleGroupSelection &&
                                                            activeGroupId &&
                                                            activeGroupId !== gid
                                                                ? `Select all ${g.label || gid} (clears ${activeGroupId})`
                                                                : `Select all ${g.label || gid} companies`
                                                        }
                                                        onClick={() => selectGroupAll(opts)}
                                                    >
                                                        Select all
                                                    </button>
                                                ) : null}
                                            </div>
                                            <div
                                                className={
                                                    groupActive
                                                        ? undefined
                                                        : 'sr-multi-select__group-body--dim'
                                                }
                                            >
                                                {opts.map((opt) => renderOptionRow(opt))}
                                            </div>
                                        </div>
                                    );
                                })
                              : flatOptions.map((opt) => renderOptionRow(opt))}
                      </div>
                  </div>,
                  document.body
              )
            : null;

    return (
        <div className="sr-filter-field sr-multi-select" ref={wrapRef} style={{ minWidth }}>
            <label className="sr-filter-label">{label}</label>
            <button
                ref={triggerRef}
                type="button"
                className="form-select form-select-sm sr-multi-select__trigger"
                aria-label={ariaLabel}
                aria-expanded={open}
                disabled={disabled || flatOptions.length === 0}
                onClick={() => setOpen((v) => !v)}
            >
                <span className="sr-multi-select__text">{displayLabel}</span>
            </button>
            {panel}
        </div>
    );
}
