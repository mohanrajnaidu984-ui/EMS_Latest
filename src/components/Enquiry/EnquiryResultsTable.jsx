import React, { useMemo, useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { FilterX } from 'lucide-react';
import { getLeadJobDisplayLines, formatLeadJobLinesPlain } from '../../utils/leadJobDisplayLines';
import {
    formatEnquiryResultDate,
    formatEnquiryCreatedDateTime,
    getCustomerDisplayLines,
    getConsultantDisplayLines,
    getEnquiryTypeDisplay,
    getEnquiryDetailsDisplay,
    getSourceOfInfoDisplay,
    getCreatedByDivision,
} from '../../utils/enquiryResultsHelpers';
import { EMS_TABLE_HEADER_GRADIENT } from '../../constants/emsTheme';
import './EnquiryResultsTable.css';

function renderLeadJobSePart(ln) {
    if (Array.isArray(ln.seMembers) && ln.seMembers.length > 0) {
        return (
            <span style={{ color: '#9f1239', fontSize: '81%' }}>
                {' ('}
                {ln.seMembers.map((m, mi) => (
                    <span key={`${m.name}-${mi}`}>
                        {mi > 0 ? ', ' : ''}
                        <span style={{ fontWeight: m.isAccountable ? 700 : 400 }}>{m.name}</span>
                    </span>
                ))}
                {')'}
            </span>
        );
    }
    if (ln.se) {
        return <span style={{ color: '#9f1239', fontWeight: 400, fontSize: '81%' }}>{` (${ln.se})`}</span>;
    }
    return null;
}
import '../../styles/emsTableColumnFilters.css';

/** Resolve enquiry id from list rows (API/client variants). */
export function getEnquiryRowRequestNo(row) {
    const v = row?.RequestNo ?? row?.requestNo;
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s === '' ? null : s;
}

const FILTERABLE_COLUMNS = [
    { key: 'requestNo', label: 'Enquiry No.', sortKey: 'RequestNo' },
    { key: 'enquiryDate', label: 'Enquiry Date', sortKey: 'EnquiryDate' },
    { key: 'projectName', label: 'Project', sortKey: 'ProjectName' },
    { key: 'se', label: 'Divisions / SE', sortKey: 'SE', labelLines: ['Divisions', 'SE/EE/TE/QS Involved'] },
    { key: 'enquiryDetails', label: 'Enquiry Details', sortKey: 'EnquiryDetails' },
    { key: 'customer', label: 'Customer Name / Contractor Name', sortKey: 'Customer' },
    { key: 'dueOn', label: 'Due', sortKey: 'DueOn' },
    { key: 'siteVisitDate', label: 'Site visit date', sortKey: 'SiteVisitDate' },
    { key: 'clientName', label: 'Client', sortKey: 'ClientName' },
    { key: 'consultantName', label: 'Consultant Name', sortKey: 'Consultant' },
    { key: 'enquiryType', label: 'Enquiry Type', sortKey: 'EnquiryType' },
    { key: 'sourceOfInfo', label: 'Source', sortKey: 'SourceOfInfo' },
    { key: 'status', label: 'Status', sortKey: 'Status' },
    { key: 'createdBy', label: 'Created By', sortKey: 'CreatedBy' },
    { key: 'createdDivision', label: 'Created division', sortKey: 'CreatedDivision' },
    { key: 'createdDatetime', label: 'Created Datetime', sortKey: 'CreatedAt' },
];

/** Enquiry Details column width (+30% vs former 260px). */
const ENQUIRY_DETAILS_COL_STYLE = { maxWidth: '338px', width: '338px' };

const DATE_FILTER_KEYS = new Set(['enquiryDate', 'dueOn', 'siteVisitDate', 'createdDatetime']);

function getEnquiryFilterValue(row, key, masters) {
    if (!row) return '—';
    switch (key) {
        case 'requestNo':
            return String(getEnquiryRowRequestNo(row) || '—');
        case 'enquiryDate':
            return formatEnquiryResultDate(row.EnquiryDate);
        case 'projectName':
            return String(row.ProjectName || '—').trim() || '—';
        case 'se':
            return formatLeadJobLinesPlain(getLeadJobDisplayLines(row, { users: masters?.users })) || '—';
        case 'enquiryDetails':
            return getEnquiryDetailsDisplay(row);
        case 'customer':
            return getCustomerDisplayLines(row).join(', ') || '—';
        case 'dueOn':
            return formatEnquiryResultDate(row.DueOn ?? row.DueDate);
        case 'siteVisitDate':
            return formatEnquiryResultDate(row.SiteVisitDate);
        case 'clientName':
            return String(row.ClientName || '—').trim() || '—';
        case 'consultantName':
            return getConsultantDisplayLines(row).join(', ') || '—';
        case 'enquiryType':
            return getEnquiryTypeDisplay(row);
        case 'sourceOfInfo':
            return getSourceOfInfoDisplay(row);
        case 'status':
            return String(row.Status || 'Enquiry').trim() || 'Enquiry';
        case 'createdBy':
            return String(row.CreatedBy || '—').trim() || '—';
        case 'createdDivision':
            return getCreatedByDivision(row, masters?.users);
        case 'createdDatetime':
            return formatEnquiryCreatedDateTime(row.CreatedAt);
        default:
            return '—';
    }
}

/**
 * Search Enquiry–style results grid (shared with Search Enquiry page and Dashboard popup).
 */
const EnquiryResultsTable = ({
    sortedRows,
    sortConfig,
    onSort,
    masters,
    onRowOpen,
    emptyLabel = 'No results.',
    /** When set (e.g. dashboard Quote Date modal), show total quote lines next to project count. */
    headerQuotedTotal = null,
    /** Search Enquiry: Excel-style column filters on headers (like Sales Report Jobs table). */
    enableHeaderFilters = false,
    /** Called when displayed rows change (after column filters). Used for export. */
    onDisplayRowsChange,
}) => {
    const [columnFilters, setColumnFilters] = useState({});
    const [activeHeaderFilter, setActiveHeaderFilter] = useState(null);
    const [headerFilterSearch, setHeaderFilterSearch] = useState('');
    const [headerFilterDraft, setHeaderFilterDraft] = useState([]);
    const headerFilterRef = useRef(null);
    const headerFilterAnchorRef = useRef(null);
    const [headerFilterPopoverStyle, setHeaderFilterPopoverStyle] = useState(null);

    const SortIcon = ({ column }) => {
        if (sortConfig?.key !== column) return <i className="bi bi-arrow-down-up ms-1 text-muted" style={{ fontSize: '10px' }}></i>;
        return sortConfig.direction === 'asc'
            ? <i className="bi bi-arrow-up ms-1 text-primary"></i>
            : <i className="bi bi-arrow-down ms-1 text-primary"></i>;
    };

    const filterOptions = useMemo(() => {
        if (!enableHeaderFilters) return {};
        const out = {};
        FILTERABLE_COLUMNS.forEach((col) => {
            out[col.key] = Array.from(
                new Set((sortedRows || []).map((r) => getEnquiryFilterValue(r, col.key, masters)))
            ).sort((a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: 'base' }));
        });
        return out;
    }, [sortedRows, masters, enableHeaderFilters]);

    const rowsToDisplay = useMemo(() => {
        if (!enableHeaderFilters) return sortedRows || [];
        return (sortedRows || []).filter((row) =>
            FILTERABLE_COLUMNS.every((col) => {
                const selected = columnFilters[col.key];
                if (!Array.isArray(selected)) return true;
                const value = getEnquiryFilterValue(row, col.key, masters);
                return selected.includes(value);
            })
        );
    }, [sortedRows, columnFilters, masters, enableHeaderFilters]);

    useEffect(() => {
        if (typeof onDisplayRowsChange === 'function') {
            onDisplayRowsChange(rowsToDisplay);
        }
    }, [rowsToDisplay, onDisplayRowsChange]);

    useEffect(() => {
        if (!enableHeaderFilters) return undefined;
        const onDocDown = (e) => {
            if (headerFilterRef.current?.contains(e.target)) return;
            if (e.target.closest?.('.ert-th-filter-btn')) return;
            setActiveHeaderFilter(null);
        };
        document.addEventListener('mousedown', onDocDown);
        return () => document.removeEventListener('mousedown', onDocDown);
    }, [enableHeaderFilters]);

    const openHeaderFilter = (key, anchorEl) => {
        const options = filterOptions[key] || [];
        const applied = columnFilters[key];
        headerFilterAnchorRef.current = anchorEl || null;
        setHeaderFilterDraft(Array.isArray(applied) ? [...applied] : [...options]);
        setHeaderFilterSearch('');
        setActiveHeaderFilter((prev) => (prev === key ? null : key));
    };

    // Position the filter popover with fixed coords (portal) so the table's
    // scroll container / scrollbar never clips it.
    useLayoutEffect(() => {
        if (!enableHeaderFilters || !activeHeaderFilter) {
            setHeaderFilterPopoverStyle(null);
            return undefined;
        }
        const update = () => {
            const el = headerFilterAnchorRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const minWidth = 220;
            const maxWidth = 280;
            const width = Math.min(maxWidth, Math.max(minWidth, rect.width));
            let left = rect.left;
            if (left + width > window.innerWidth - 8) {
                left = Math.max(8, window.innerWidth - width - 8);
            }
            setHeaderFilterPopoverStyle({
                position: 'fixed',
                top: rect.bottom + 2,
                left,
                width,
                minWidth,
                maxWidth,
                zIndex: 10050,
            });
        };
        update();
        window.addEventListener('resize', update);
        window.addEventListener('scroll', update, true);
        return () => {
            window.removeEventListener('resize', update);
            window.removeEventListener('scroll', update, true);
        };
    }, [activeHeaderFilter, enableHeaderFilters]);

    const distinctProjectCount = useMemo(() => {
        const keys = new Set();
        (rowsToDisplay || []).forEach((row, idx) => {
            const no = getEnquiryRowRequestNo(row);
            if (no) keys.add(`e:${no}`);
            else {
                const pn = String(row?.ProjectName ?? '').trim();
                keys.add(pn ? `p:${pn.toLowerCase()}` : `row:${idx}`);
            }
        });
        return keys.size;
    }, [rowsToDisplay]);

    const hasColumnFilters = Object.keys(columnFilters).length > 0;

    const clearAllColumnFilters = () => {
        setColumnFilters({});
        setActiveHeaderFilter(null);
        setHeaderFilterSearch('');
        setHeaderFilterDraft([]);
    };

    const showProjectSummaryBar =
        distinctProjectCount > 0 ||
        (enableHeaderFilters && hasColumnFilters) ||
        (headerQuotedTotal != null && Number.isFinite(Number(headerQuotedTotal)));

    const headerThStyle = {
        position: 'sticky',
        top: 0,
        zIndex: 2,
        background: EMS_TABLE_HEADER_GRADIENT,
        color: '#ffffff',
        textShadow: '0 1px 2px rgba(15, 23, 42, 0.38)',
        borderColor: 'rgba(210, 222, 255, 0.25)',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.22), inset 0 -1px 0 rgba(15, 23, 42, 0.14)',
        fontSize: '11px',
        fontWeight: 400,
        paddingTop: '0.28rem',
        paddingBottom: '0.28rem',
        verticalAlign: 'middle',
    };

    const renderDateFilterOptions = (visible, headerFilterDraft, setHeaderFilterDraft) => {
        const monthOrder = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December',
        ];
        const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        // Matches "01-Jul-26" and datetimes like "01-JUL-26 01:04:40 PM" (Created Datetime)
        const parseShortDate = (s) => {
            const m = String(s || '')
                .trim()
                .match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)?$/i);
            if (!m) return null;
            const mIdx = monthShort.findIndex((x) => x.toLowerCase() === m[2].toLowerCase());
            if (mIdx < 0) return null;
            const year = m[3].length === 4
                ? Number(m[3])
                : (Number(m[3]) >= 70 ? 1900 + Number(m[3]) : 2000 + Number(m[3]));
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
    };

    const renderFilterableHeader = (col, extraStyle = {}) => {
        const { key, label, sortKey, labelLines } = col;
        const options = filterOptions[key] || [];
        const applied = columnFilters[key];
        const isFiltered = Array.isArray(applied);
        const searchQ = String(headerFilterSearch || '').trim().toLowerCase();
        const visible = options.filter((o) => String(o).toLowerCase().includes(searchQ));
        const isDateColumn = DATE_FILTER_KEYS.has(key);

        const thClass = `ert-filterable-th${key === 'projectName' ? ' ert-col-project' : ''}`;

        return (
            <th key={key} className={thClass} style={{ ...headerThStyle, ...extraStyle }}>
                <div className="ert-th-header-inner">
                    <button
                        type="button"
                        className="ert-th-filter-btn"
                        onClick={(e) => openHeaderFilter(key, e.currentTarget.closest('th'))}
                    >
                        {labelLines ? (
                            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15, textAlign: 'left' }}>
                                <span>{labelLines[0]}</span>
                                <span style={{ fontSize: '10px', opacity: 0.88 }}>{labelLines[1]}</span>
                            </span>
                        ) : (
                            <span>{label}</span>
                        )}
                        <span className={`ert-th-filter-caret${isFiltered ? ' ert-th-filter-caret--active' : ''}`}>▼</span>
                    </button>
                    <button
                        type="button"
                        className="ert-th-sort-btn"
                        onClick={(e) => {
                            e.stopPropagation();
                            onSort(sortKey);
                        }}
                        title={`Sort by ${label}`}
                    >
                        <SortIcon column={sortKey} />
                    </button>
                </div>
                {activeHeaderFilter === key && typeof document !== 'undefined' && createPortal(
                    <div className="ems-cf-scope" style={{ position: 'fixed', inset: 0, zIndex: 10050, pointerEvents: 'none' }}>
                    <div
                        className="ert-th-filter-popover ert-th-filter-popover--portal"
                        ref={headerFilterRef}
                        style={{ ...(headerFilterPopoverStyle || {}), pointerEvents: 'auto' }}
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
                                        delete next[key];
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
                                            delete next[key];
                                        } else {
                                            next[key] = [...headerFilterDraft];
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
                    </div>,
                    document.body
                )}
            </th>
        );
    };

    const renderSortableHeader = (sortKey, label, extraStyle = {}, labelContent = null, extraClassName = '') => (
        <th
            key={sortKey}
            className={`sortable-header${extraClassName ? ` ${extraClassName}` : ''}`}
            style={{ ...headerThStyle, ...extraStyle }}
            onClick={() => onSort(sortKey)}
        >
            <div className="header-content">
                {labelContent || label}
                <SortIcon column={sortKey} />
            </div>
        </th>
    );

    return (
        <div className="enquiry-results-table-root ems-cf-scope w-100 d-flex flex-column flex-grow-1" style={{ minHeight: 0 }}>
            {showProjectSummaryBar ? (
                <div
                    className="enquiry-results-table-project-total flex-shrink-0 px-2 py-1 d-flex align-items-center justify-content-between gap-2 flex-wrap"
                    role="status"
                    aria-live="polite"
                >
                    <div className="d-flex align-items-center gap-2 flex-wrap">
                        <span className="small fw-semibold text-dark d-inline-flex align-items-center gap-1" style={{ letterSpacing: '0.02em' }}>
                            <span>
                                Total projects:{' '}
                                <span className="text-primary">{distinctProjectCount}</span>
                            </span>
                            {enableHeaderFilters && distinctProjectCount > 0 ? (
                                <button
                                    type="button"
                                    className="ems-cf-clear-filters-btn"
                                    onClick={clearAllColumnFilters}
                                    title="Clear all column filters"
                                    aria-label="Clear all column filters"
                                    disabled={!hasColumnFilters}
                                >
                                    <FilterX size={13} strokeWidth={2} aria-hidden="true" />
                                </button>
                            ) : null}
                        </span>
                        {headerQuotedTotal != null && Number.isFinite(Number(headerQuotedTotal)) ? (
                            <span className="small fw-semibold text-dark" style={{ letterSpacing: '0.02em' }}>
                                Total quotes:{' '}
                                <span className="text-success">{Number(headerQuotedTotal)}</span>
                            </span>
                        ) : null}
                    </div>
                    <span className="small text-muted" style={{ fontSize: '10px' }} title="Each enquiry number counts once, even if multiple lines appear.">
                        Unique enquiries
                    </span>
                </div>
            ) : null}
            <div className="enquiry-search-table-wrap">
                <table
                    className="table table-sm table-hover align-middle"
                    style={{ fontSize: '11px', tableLayout: 'auto' }}
                >
                    <thead>
                        <tr>
                            <th style={headerThStyle}>Action</th>
                            {enableHeaderFilters
                                ? FILTERABLE_COLUMNS.map((col) =>
                                      renderFilterableHeader(
                                          col,
                                          col.key === 'enquiryDetails'
                                              ? ENQUIRY_DETAILS_COL_STYLE
                                              : col.key === 'se'
                                                ? { minWidth: '200px' }
                                                : col.key === 'projectName'
                                                  ? { maxWidth: '220px', minWidth: '140px' }
                                                  : col.key === 'consultantName'
                                                    ? { minWidth: '160px' }
                                                    : {}
                                      )
                                  )
                                : (
                                    <>
                                        {renderSortableHeader('RequestNo', 'Enquiry No.')}
                                        {renderSortableHeader('EnquiryDate', 'Enquiry Date')}
                                        {renderSortableHeader('ProjectName', 'Project', { maxWidth: '220px', minWidth: '140px' }, null, 'ert-col-project')}
                                        {renderSortableHeader(
                                            'SE',
                                            null,
                                            { minWidth: '200px' },
                                            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
                                                <span>Divisions</span>
                                                <span style={{ fontSize: '10px', opacity: 0.88 }}>SE/EE/TE/QS Involved</span>
                                            </span>
                                        )}
                                        {renderSortableHeader('EnquiryDetails', 'Enquiry Details', ENQUIRY_DETAILS_COL_STYLE)}
                                        {renderSortableHeader('Customer', 'Customer Name / Contractor Name')}
                                        {renderSortableHeader('DueOn', 'Due')}
                                        {renderSortableHeader('SiteVisitDate', 'Site visit date', {}, null)}
                                        {renderSortableHeader('ClientName', 'Client')}
                                        {renderSortableHeader('Consultant', 'Consultant Name', { minWidth: '160px' })}
                                        {renderSortableHeader('EnquiryType', 'Enquiry Type')}
                                        {renderSortableHeader('SourceOfInfo', 'Source')}
                                        {renderSortableHeader('Status', 'Status')}
                                        {renderSortableHeader('CreatedBy', 'Created By')}
                                        {renderSortableHeader('CreatedDivision', 'Created division')}
                                        {renderSortableHeader('CreatedAt', 'Created Datetime')}
                                    </>
                                )}
                        </tr>
                    </thead>
                    <tbody>
                        {rowsToDisplay.length === 0 ? (
                            <tr>
                                <td colSpan="17" className="text-muted text-center">
                                    {emptyLabel}
                                </td>
                            </tr>
                        ) : (
                            rowsToDisplay.map((r, idx) => {
                                const jobLines = getLeadJobDisplayLines(r, { users: masters?.users });
                                const reqNo = getEnquiryRowRequestNo(r);
                                const canActivate = Boolean(reqNo && typeof onRowOpen === 'function');
                                const openThisRow = () => {
                                    if (canActivate) onRowOpen(reqNo);
                                };
                                const rowKey = reqNo || `row-${idx}`;
                                return (
                                    <tr
                                        key={`${rowKey}-${idx}`}
                                        className={canActivate ? 'enquiry-search-row-open' : ''}
                                        tabIndex={canActivate ? 0 : undefined}
                                        role={canActivate ? 'button' : undefined}
                                        title={canActivate ? (r._canEdit ? 'Open enquiry (edit)' : 'Open enquiry (view)') : undefined}
                                        onKeyDown={(e) => {
                                            if (!canActivate) return;
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                openThisRow();
                                            }
                                        }}
                                    >
                                        <td
                                            className="position-relative"
                                            onClick={openThisRow}
                                            style={{ cursor: canActivate ? 'pointer' : 'default' }}
                                        >
                                            <div
                                                aria-hidden
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    width: '24px',
                                                    height: '24px',
                                                    borderRadius: '5px',
                                                    transition: 'all 0.2s',
                                                    backgroundColor: r._canEdit ? 'rgba(13, 110, 253, 0.1)' : 'rgba(108, 117, 125, 0.1)',
                                                    color: r._canEdit ? '#0d6efd' : '#6c757d',
                                                }}
                                                className="action-icon-hover"
                                            >
                                                {r._canEdit ? (
                                                    <i className="bi bi-pencil-square" style={{ fontSize: '13px' }}></i>
                                                ) : (
                                                    <i className="bi bi-eye" style={{ fontSize: '13px' }}></i>
                                                )}
                                            </div>
                                        </td>
                                        <td onClick={openThisRow} style={{ cursor: canActivate ? 'pointer' : 'default' }}>{reqNo}</td>
                                        <td onClick={openThisRow} style={{ cursor: canActivate ? 'pointer' : 'default' }}>{formatEnquiryResultDate(r.EnquiryDate)}</td>
                                        <td
                                            className="ert-col-project"
                                            onClick={openThisRow}
                                            style={{ cursor: canActivate ? 'pointer' : 'default' }}
                                            title={r.ProjectName}
                                        >
                                            {r.ProjectName}
                                        </td>
                                        <td style={{ verticalAlign: 'top', minWidth: '200px', cursor: canActivate ? 'pointer' : 'default' }} onClick={openThisRow}>
                                            {jobLines.map((ln, li) => {
                                                const isSub = ln.depth > 0;
                                                return (
                                                    <div
                                                        key={`jd-${r.RequestNo}-${li}`}
                                                        style={{
                                                            paddingLeft: isSub ? `${6 + (ln.depth - 1) * 10}px` : 0,
                                                            fontSize: 'calc(11px * 0.9)',
                                                            color: '#1e293b',
                                                            marginBottom: li < jobLines.length - 1 ? 4 : 0,
                                                            whiteSpace: 'nowrap',
                                                        }}
                                                    >
                                                        {isSub ? (
                                                            <span className="text-muted me-1" style={{ fontSize: 'calc(10px * 0.9)' }}>
                                                                {'--> '}
                                                            </span>
                                                        ) : null}
                                                        <span style={{ fontWeight: ln.depth === 0 ? 600 : 400 }}>{ln.label}</span>
                                                        {renderLeadJobSePart(ln)}
                                                    </div>
                                                );
                                            })}
                                        </td>
                                        <td
                                            style={{ verticalAlign: 'top', ...ENQUIRY_DETAILS_COL_STYLE, fontSize: '11px', whiteSpace: 'normal', wordBreak: 'break-word', cursor: canActivate ? 'pointer' : 'default' }}
                                            title={getEnquiryDetailsDisplay(r)}
                                            onClick={openThisRow}
                                        >
                                            {getEnquiryDetailsDisplay(r)}
                                        </td>
                                        <td style={{ verticalAlign: 'top', cursor: canActivate ? 'pointer' : 'default' }} onClick={openThisRow}>
                                            {getCustomerDisplayLines(r).map((name, i, arr) => (
                                                <div
                                                    key={`${r.RequestNo}-cust-${i}`}
                                                    style={{
                                                        lineHeight: 1.25,
                                                        marginBottom: i < arr.length - 1 ? 4 : 0,
                                                    }}
                                                >
                                                    {name}
                                                </div>
                                            ))}
                                        </td>
                                        <td onClick={openThisRow} style={{ cursor: canActivate ? 'pointer' : 'default' }}>{formatEnquiryResultDate(r.DueOn ?? r.DueDate)}</td>
                                        <td onClick={openThisRow} style={{ cursor: canActivate ? 'pointer' : 'default' }}>{formatEnquiryResultDate(r.SiteVisitDate)}</td>
                                        <td onClick={openThisRow} style={{ cursor: canActivate ? 'pointer' : 'default' }}>{r.ClientName}</td>
                                        <td style={{ verticalAlign: 'top', cursor: canActivate ? 'pointer' : 'default' }} onClick={openThisRow}>
                                            {getConsultantDisplayLines(r).map((name, i, arr) => (
                                                <div
                                                    key={`${r.RequestNo}-consult-${i}`}
                                                    style={{
                                                        lineHeight: 1.25,
                                                        marginBottom: i < arr.length - 1 ? 4 : 0,
                                                    }}
                                                >
                                                    {name}
                                                </div>
                                            ))}
                                        </td>
                                        <td onClick={openThisRow} style={{ cursor: canActivate ? 'pointer' : 'default' }}>{getEnquiryTypeDisplay(r)}</td>
                                        <td onClick={openThisRow} style={{ cursor: canActivate ? 'pointer' : 'default' }}>{getSourceOfInfoDisplay(r)}</td>
                                        <td onClick={openThisRow} style={{ cursor: canActivate ? 'pointer' : 'default' }}>{r.Status || 'Enquiry'}</td>
                                        <td onClick={openThisRow} style={{ cursor: canActivate ? 'pointer' : 'default' }}>{r.CreatedBy || '-'}</td>
                                        <td onClick={openThisRow} style={{ cursor: canActivate ? 'pointer' : 'default' }}>{getCreatedByDivision(r, masters?.users)}</td>
                                        <td onClick={openThisRow} style={{ cursor: canActivate ? 'pointer' : 'default', whiteSpace: 'nowrap' }}>{formatEnquiryCreatedDateTime(r.CreatedAt)}</td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default EnquiryResultsTable;
