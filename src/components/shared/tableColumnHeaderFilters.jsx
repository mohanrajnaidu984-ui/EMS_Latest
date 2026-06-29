import React, { useMemo, useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import '../../styles/emsTableColumnFilters.css';

export const EMS_TABLE_DATE_FILTER_KEYS = new Set([
    'enquiryDate',
    'dueOn',
    'siteVisitDate',
    'enquiryDateCol',
    'dueDateCol',
    'dueDate',
]);

function renderDateFilterOptions(visible, headerFilterDraft, setHeaderFilterDraft) {
    const monthOrder = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const parseShortDate = (s) => {
        const m = String(s || '').trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/i);
        if (!m) return null;
        const mIdx = monthShort.findIndex((x) => x.toLowerCase() === m[2].toLowerCase());
        if (mIdx < 0) return null;
        const yy = Number(m[3].length === 4 ? m[3].slice(-2) : m[3]);
        const year = yy >= 70 && m[3].length === 2 ? 1900 + yy : m[3].length === 4 ? Number(m[3]) : 2000 + yy;
        return { year, monthName: monthOrder[mIdx], raw: String(s) };
    };
    const dateGroups = visible
        .map(parseShortDate)
        .filter(Boolean)
        .reduce((acc, d) => {
            if (!acc[d.year]) acc[d.year] = {};
            if (!acc[d.year][d.monthName]) acc[d.year][d.monthName] = [];
            acc[d.year][d.monthName].push(d.raw);
            return acc;
        }, {});

    return (
        <>
            {Object.keys(dateGroups)
                .sort((a, b) => Number(b) - Number(a))
                .map((y) => {
                    const yearValues = Object.values(dateGroups[y]).flat();
                    const yearChecked = yearValues.length > 0 && yearValues.every((v) => headerFilterDraft.includes(v));
                    return (
                        <div key={y}>
                            <label className="ert-th-filter-option">
                                <input
                                    type="checkbox"
                                    checked={yearChecked}
                                    onChange={(e) =>
                                        setHeaderFilterDraft((prev) => {
                                            const set = new Set(prev);
                                            if (e.target.checked) yearValues.forEach((v) => set.add(v));
                                            else yearValues.forEach((v) => set.delete(v));
                                            return [...set];
                                        })
                                    }
                                />
                                <span>{y}</span>
                            </label>
                            {Object.keys(dateGroups[y])
                                .sort((a, b) => monthOrder.indexOf(a) - monthOrder.indexOf(b))
                                .map((mn) => {
                                    const monthValues = dateGroups[y][mn];
                                    const monthChecked =
                                        monthValues.length > 0 && monthValues.every((v) => headerFilterDraft.includes(v));
                                    return (
                                        <label key={`${y}-${mn}`} className="ert-th-filter-option ert-th-filter-option--month">
                                            <input
                                                type="checkbox"
                                                checked={monthChecked}
                                                onChange={(e) =>
                                                    setHeaderFilterDraft((prev) => {
                                                        const set = new Set(prev);
                                                        if (e.target.checked) monthValues.forEach((v) => set.add(v));
                                                        else monthValues.forEach((v) => set.delete(v));
                                                        return [...set];
                                                    })
                                                }
                                            />
                                            <span>{mn}</span>
                                        </label>
                                    );
                                })}
                        </div>
                    );
                })}
            {visible
                .filter((v) => !parseShortDate(v))
                .map((opt) => (
                    <label key={opt} className="ert-th-filter-option">
                        <input
                            type="checkbox"
                            checked={headerFilterDraft.includes(opt)}
                            onChange={(e) =>
                                setHeaderFilterDraft((prev) =>
                                    e.target.checked ? [...new Set([...prev, opt])] : prev.filter((v) => v !== opt)
                                )
                            }
                        />
                        <span>{opt || '—'}</span>
                    </label>
                ))}
        </>
    );
}

/**
 * @param {Array} rows
 * @param {(row: object, key: string) => string} getFilterValue
 * @param {string[]} filterColumnKeys
 * @param {Set<string>} [dateFilterKeys]
 */
export function useTableColumnHeaderFilters(rows, getFilterValue, filterColumnKeys, dateFilterKeys = EMS_TABLE_DATE_FILTER_KEYS) {
    const [columnFilters, setColumnFilters] = useState({});
    const [activeHeaderFilter, setActiveHeaderFilter] = useState(null);
    const [headerFilterSearch, setHeaderFilterSearch] = useState('');
    const [headerFilterDraft, setHeaderFilterDraft] = useState([]);
    const headerFilterRef = useRef(null);

    const filterOptions = useMemo(() => {
        const out = {};
        (filterColumnKeys || []).forEach((key) => {
            out[key] = Array.from(new Set((rows || []).map((r) => getFilterValue(r, key)))).sort((a, b) =>
                String(a).localeCompare(String(b), undefined, { sensitivity: 'base' })
            );
        });
        return out;
    }, [rows, getFilterValue, filterColumnKeys]);

    const filteredRows = useMemo(() => {
        return (rows || []).filter((row) =>
            (filterColumnKeys || []).every((key) => {
                const selected = columnFilters[key];
                if (!Array.isArray(selected)) return true;
                return selected.includes(getFilterValue(row, key));
            })
        );
    }, [rows, columnFilters, getFilterValue, filterColumnKeys]);

    const hasColumnFilters = Object.keys(columnFilters).length > 0;

    const clearAllColumnFilters = () => {
        setColumnFilters({});
        setActiveHeaderFilter(null);
        setHeaderFilterSearch('');
        setHeaderFilterDraft([]);
    };

    useEffect(() => {
        const onDocDown = (e) => {
            if (headerFilterRef.current?.contains(e.target)) return;
            if (e.target.closest?.('.ert-th-filter-btn')) return;
            setActiveHeaderFilter(null);
        };
        document.addEventListener('mousedown', onDocDown);
        return () => document.removeEventListener('mousedown', onDocDown);
    }, []);

    const openHeaderFilter = (key) => {
        const options = filterOptions[key] || [];
        const applied = columnFilters[key];
        setHeaderFilterDraft(Array.isArray(applied) ? [...applied] : [...options]);
        setHeaderFilterSearch('');
        setActiveHeaderFilter((prev) => (prev === key ? null : key));
    };

    return {
        filteredRows,
        columnFilters,
        hasColumnFilters,
        clearAllColumnFilters,
        filterOptions,
        activeHeaderFilter,
        headerFilterSearch,
        headerFilterDraft,
        setHeaderFilterSearch,
        setHeaderFilterDraft,
        setColumnFilters,
        setActiveHeaderFilter,
        headerFilterRef,
        openHeaderFilter,
        dateFilterKeys,
    };
}

export function TableColumnFilterHeader({
    colKey,
    label,
    labelNode = null,
    sortField,
    sortConfig,
    onSort,
    initialDirection = 'asc',
    thStyle = {},
    filterCtx,
}) {
    const {
        columnFilters,
        filterOptions,
        activeHeaderFilter,
        headerFilterSearch,
        headerFilterDraft,
        setHeaderFilterSearch,
        setHeaderFilterDraft,
        setColumnFilters,
        setActiveHeaderFilter,
        headerFilterRef,
        openHeaderFilter,
        dateFilterKeys,
    } = filterCtx;

    const options = filterOptions[colKey] || [];
    const applied = columnFilters[colKey];
    const isFiltered = Array.isArray(applied);
    const searchQ = String(headerFilterSearch || '').trim().toLowerCase();
    const visible = options.filter((o) => String(o).toLowerCase().includes(searchQ));
    const isDateColumn = dateFilterKeys.has(colKey);

    const isActive = sortConfig?.field === sortField;
    const isAsc = sortConfig?.direction === 'asc';
    const thRef = useRef(null);
    const [popoverStyle, setPopoverStyle] = useState(null);
    const isPopoverOpen = activeHeaderFilter === colKey;

    const updatePopoverPosition = () => {
        const el = thRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const minWidth = 220;
        const maxWidth = 280;
        const width = Math.min(maxWidth, Math.max(minWidth, rect.width));
        let left = rect.left;
        if (left + width > window.innerWidth - 8) {
            left = Math.max(8, window.innerWidth - width - 8);
        }
        setPopoverStyle({
            position: 'fixed',
            top: rect.bottom + 2,
            left,
            width,
            minWidth,
            maxWidth,
            zIndex: 10050,
        });
    };

    useLayoutEffect(() => {
        if (!isPopoverOpen) {
            setPopoverStyle(null);
            return undefined;
        }
        updatePopoverPosition();
        const onRelayout = () => updatePopoverPosition();
        window.addEventListener('resize', onRelayout);
        window.addEventListener('scroll', onRelayout, true);
        return () => {
            window.removeEventListener('resize', onRelayout);
            window.removeEventListener('scroll', onRelayout, true);
        };
    }, [isPopoverOpen, colKey]);

    const popoverNode = isPopoverOpen ? (
        <div className="ems-cf-scope" style={{ position: 'fixed', inset: 0, zIndex: 10050, pointerEvents: 'none' }}>
            <div
                className="ert-th-filter-popover ert-th-filter-popover--portal"
                ref={headerFilterRef}
                style={{ ...(popoverStyle || {}), pointerEvents: 'auto' }}
            >
            <input
                className="ert-th-filter-search"
                value={headerFilterSearch}
                onChange={(e) => {
                    const q = String(e.target.value || '');
                    setHeaderFilterSearch(q);
                    const nq = q.trim().toLowerCase();
                    const matched = options.filter((o) => String(o).toLowerCase().includes(nq));
                    setHeaderFilterDraft(matched);
                }}
                placeholder="Search..."
            />
            <div className="ert-th-filter-actions">
                <button type="button" onClick={() => setHeaderFilterDraft(visible)}>
                    Select All
                </button>
                <button type="button" onClick={() => setHeaderFilterDraft([])}>
                    Unselect All
                </button>
            </div>
            <div className="ert-th-filter-options">
                {isDateColumn
                    ? renderDateFilterOptions(visible, headerFilterDraft, setHeaderFilterDraft)
                    : visible.map((opt) => (
                          <label key={opt} className="ert-th-filter-option">
                              <input
                                  type="checkbox"
                                  checked={headerFilterDraft.includes(opt)}
                                  onChange={(e) =>
                                      setHeaderFilterDraft((prev) =>
                                          e.target.checked ? [...prev, opt] : prev.filter((v) => v !== opt)
                                      )
                                  }
                              />
                              <span>{opt || '—'}</span>
                          </label>
                      ))}
            </div>
            <div className="ert-th-filter-footer">
                <button
                    type="button"
                    onClick={() => {
                        setColumnFilters((prev) => {
                            const next = { ...prev };
                            delete next[colKey];
                            return next;
                        });
                        setActiveHeaderFilter(null);
                    }}
                >
                    Clear
                </button>
                <button
                    type="button"
                    className="ert-th-filter-apply"
                    onClick={() => {
                        setColumnFilters((prev) => {
                            const next = { ...prev };
                            if (headerFilterDraft.length === options.length) {
                                delete next[colKey];
                            } else {
                                next[colKey] = [...headerFilterDraft];
                            }
                            return next;
                        });
                        setActiveHeaderFilter(null);
                    }}
                >
                    Apply
                </button>
            </div>
            </div>
        </div>
    ) : null;

    return (
        <th ref={thRef} className="ert-filterable-th" style={{ ...thStyle, overflow: 'visible' }}>
            <div className="ert-th-header-inner">
                <button type="button" className="ert-th-filter-btn" onClick={() => openHeaderFilter(colKey)}>
                    {labelNode || <span>{label}</span>}
                    <span className={`ert-th-filter-caret${isFiltered ? ' ert-th-filter-caret--active' : ''}`}>▼</span>
                </button>
                <button
                    type="button"
                    className="ert-th-sort-btn"
                    onClick={(e) => {
                        e.stopPropagation();
                        onSort(sortField, initialDirection);
                    }}
                    title={`Sort by ${label}`}
                >
                    {isActive ? (isAsc ? ' ▲' : ' ▼') : <span style={{ color: '#e6efff', fontSize: '10px' }}> ⇅</span>}
                </button>
            </div>
            {popoverNode && typeof document !== 'undefined'
                ? createPortal(popoverNode, document.body)
                : null}
        </th>
    );
}
