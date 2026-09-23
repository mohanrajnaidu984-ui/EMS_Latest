import React from 'react';
import { createPortal } from 'react-dom';
import './SalesReportMultiSelect.css';

export default function SalesReportMultiSelect({
    label,
    ariaLabel,
    options = [],
    value = [],
    onChange,
    disabled = false,
    minWidth = 180,
    allLabel = 'All',
    showSelectAll = true,
}) {
    const [open, setOpen] = React.useState(false);
    const [panelStyle, setPanelStyle] = React.useState(null);
    const wrapRef = React.useRef(null);
    const triggerRef = React.useRef(null);
    const panelRef = React.useRef(null);
    const selected = Array.isArray(value) ? value : [];
    const isAll = selected.length === 0;
    const displayLabel = isAll
        ? allLabel
        : selected.length === 1
          ? selected[0]
          : `${selected.length} selected`;

    const updatePanelPosition = React.useCallback(() => {
        const el = triggerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const width = Math.max(rect.width, 220);
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
    }, []);

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
        } else {
            onChange([...selected, opt]);
        }
    };

    const panel =
        open && !disabled && panelStyle && typeof document !== 'undefined'
            ? createPortal(
                  <div
                      ref={panelRef}
                      className="sr-multi-select__panel sr-multi-select__panel--portal"
                      style={panelStyle}
                  >
                      {showSelectAll ? (
                          <div className="sr-multi-select__actions">
                              <button type="button" onClick={() => onChange([...options])}>
                                  Select All
                              </button>
                              <button type="button" onClick={() => onChange([])}>
                                  Clear All
                              </button>
                          </div>
                      ) : null}
                      <div className="sr-multi-select__options">
                          {options.map((opt) => (
                              <label key={opt} className="sr-multi-select__option">
                                  <input
                                      type="checkbox"
                                      checked={selected.includes(opt)}
                                      onChange={() => toggleOption(opt)}
                                  />
                                  <span>{opt}</span>
                              </label>
                          ))}
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
                disabled={disabled || options.length === 0}
                onClick={() => setOpen((v) => !v)}
            >
                <span className="sr-multi-select__text">{displayLabel}</span>
            </button>
            {panel}
        </div>
    );
}
