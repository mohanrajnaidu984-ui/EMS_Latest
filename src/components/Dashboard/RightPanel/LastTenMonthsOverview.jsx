import React, { useMemo } from 'react';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Labels/colors aligned with LeftPanel/CalendarBarChart Monthly Overview. */
export const DASHBOARD_HISTORY_KPI_DEFS = [
    { type: 'enquiry', label: 'Enquiry Received', color: '#3b82f6', bgColor: '#dbeafe' },
    { type: 'due', label: 'Due', color: '#f59e0b', bgColor: '#fef3c7' },
    { type: 'lapsed', label: 'Lapsed', color: '#ef4444', bgColor: '#fee2e2' },
    { type: 'newQuote', label: 'New Quote', color: '#10b981', bgColor: '#d1fae5' },
    { type: 'revQuote', label: 'Rev Quote', color: '#0d9488', bgColor: '#ccfbf1' },
];

const GRID_COLS = 'minmax(92px, 1.15fr) repeat(5, minmax(0, 1fr))';

function sumDaily(daily, key) {
    return (Array.isArray(daily) ? daily : []).reduce((acc, row) => acc + (Number(row[key]) || 0), 0);
}

function monthTotalsFromPayload(monthRow) {
    const daily = monthRow?.daily || [];
    const t = monthRow?.totals;
    if (t && typeof t === 'object') {
        return {
            enquiries: Number(t.enquiries) || 0,
            due: Number(t.due) || 0,
            lapsed: Number(t.lapsed) || 0,
            newQuote: Number(t.newQuote) || 0,
            revQuote: Number(t.revQuote) || 0,
        };
    }
    return {
        enquiries: sumDaily(daily, 'Enquiries'),
        due: sumDaily(daily, 'Due'),
        lapsed: sumDaily(daily, 'Lapsed'),
        newQuote: sumDaily(daily, 'NewQuote'),
        revQuote: sumDaily(daily, 'RevQuote'),
    };
}

function kpiValueKey(type) {
    if (type === 'enquiry') return 'enquiries';
    if (type === 'newQuote') return 'newQuote';
    if (type === 'revQuote') return 'revQuote';
    return type;
}

function isFutureMonth(month, year, anchorMonth, anchorYear) {
    if (!anchorMonth || !anchorYear) return false;
    if (year > anchorYear) return true;
    if (year === anchorYear && month > anchorMonth) return true;
    return false;
}

/** Past months: soft neutral zebra — readable without heavy blue wash. */
function getPastMonthRowStyle(pastIndex) {
    const isEvenStripe = pastIndex % 2 === 0;
    return {
        background: isEvenStripe
            ? 'linear-gradient(90deg, #f8fafc 0%, #ffffff 72%)'
            : '#ffffff',
        border: '1px solid #e8edf3',
        monthColor: '#475569',
    };
}

/** Selected / future row accents — muted, aligned with dashboard chrome. */
const HISTORY_ROW_ANCHOR_STYLE = {
    background: 'linear-gradient(90deg, #eff6ff 0%, #ffffff 75%)',
    border: '1px solid #bfdbfe',
    monthColor: '#1e40af',
};

const HISTORY_ROW_FUTURE_STYLE = {
    background: 'linear-gradient(90deg, #f0fdf4 0%, #ffffff 75%)',
    border: '1px solid #bbf7d0',
    monthColor: '#047857',
};

const LastTenMonthsOverview = ({
    months,
    yearTotals,
    anchorMonth,
    anchorYear,
    onBarClick,
    onYearBarClick,
    loading,
}) => {
    const rows = useMemo(() => {
        const list = Array.isArray(months) ? months : [];
        return [...list].reverse();
    }, [months]);

    const anchorLabel = useMemo(() => {
        if (!anchorMonth || !anchorYear) return '';
        return `${MONTH_NAMES[anchorMonth - 1]} ${anchorYear}`;
    }, [anchorMonth, anchorYear]);

    const selectedYearTotals = useMemo(() => {
        if (yearTotals && typeof yearTotals === 'object') {
            return {
                enquiries: Number(yearTotals.enquiries) || 0,
                due: Number(yearTotals.due) || 0,
                lapsed: Number(yearTotals.lapsed) || 0,
                newQuote: Number(yearTotals.newQuote) || 0,
                revQuote: Number(yearTotals.revQuote) || 0,
            };
        }
        const y = anchorYear;
        if (!y) return null;
        const acc = { enquiries: 0, due: 0, lapsed: 0, newQuote: 0, revQuote: 0 };
        let found = false;
        (Array.isArray(months) ? months : []).forEach((row) => {
            if (row.year !== y) return;
            found = true;
            const t = monthTotalsFromPayload(row);
            acc.enquiries += t.enquiries;
            acc.due += t.due;
            acc.lapsed += t.lapsed;
            acc.newQuote += t.newQuote;
            acc.revQuote += t.revQuote;
        });
        return found ? acc : null;
    }, [yearTotals, months, anchorYear]);

    return (
        <div
            className="dashboard-history-overview flex-grow-1 d-flex flex-column"
            style={{ minHeight: 0, overflow: 'hidden' }}
        >
            <div
                className="flex-shrink-0 border-bottom bg-white"
                style={{
                    borderColor: '#e5e7eb',
                    padding: '8px 12px 10px',
                    background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
                }}
            >
                <h6
                    className="text-secondary mb-0"
                    style={{ fontSize: '0.78rem', fontWeight: 600, lineHeight: 1.2, letterSpacing: '0.02em' }}
                >
                    Monthly History Overview
                </h6>
                {anchorLabel ? (
                    <div className="text-muted" style={{ fontSize: '0.68rem', marginTop: '2px' }}>
                        Last 12 months + next 2 from {anchorLabel} · click a value to open details
                    </div>
                ) : null}
            </div>

            {/* Fixed metric headings — shared across all month rows */}
            <div
                className="dashboard-history-grid-header flex-shrink-0"
                style={{
                    display: 'grid',
                    gridTemplateColumns: GRID_COLS,
                    gap: '6px',
                    padding: '6px 10px 6px',
                    borderBottom: '1px solid #e5e7eb',
                    background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
                    position: 'sticky',
                    top: 0,
                    zIndex: 2,
                }}
            >
                <div
                    className="text-secondary fw-semibold text-truncate"
                    style={{ fontSize: '0.68rem', alignSelf: 'end', paddingBottom: '2px' }}
                >
                    Month
                </div>
                {DASHBOARD_HISTORY_KPI_DEFS.map((kpi) => (
                    <div
                        key={kpi.type}
                        className="text-secondary fw-semibold text-truncate text-center"
                        style={{
                            fontSize: '0.68rem',
                            lineHeight: 1.15,
                            alignSelf: 'end',
                            paddingBottom: '2px',
                        }}
                        title={kpi.label}
                    >
                        {kpi.label}
                    </div>
                ))}
            </div>

            <div
                className="dashboard-history-scroll flex-grow-1"
                style={{ overflowY: 'auto', minHeight: 0, padding: '4px 8px 8px' }}
            >
                {loading && rows.length === 0 ? (
                    <div className="text-center text-muted small py-4">Loading monthly history…</div>
                ) : null}

                {!loading && rows.length === 0 ? (
                    <div className="text-center text-muted small py-4">No monthly data for this selection.</div>
                ) : null}

                {(() => {
                    let pastMonthRowIndex = 0;
                    return rows.map((monthRow) => {
                    const totals = monthTotalsFromPayload(monthRow);
                    const isAnchor =
                        monthRow.month === anchorMonth && monthRow.year === anchorYear;
                    const isFuture = isFutureMonth(
                        monthRow.month,
                        monthRow.year,
                        anchorMonth,
                        anchorYear,
                    );
                    const isPast = !isAnchor && !isFuture;
                    const pastBlueIndex = isPast ? pastMonthRowIndex++ : -1;
                    const monthLabel = `${MONTH_NAMES[(monthRow.month || 1) - 1]} ${monthRow.year}`;
                    const pastStyle = isPast ? getPastMonthRowStyle(pastBlueIndex) : null;
                    const rowChrome = isAnchor
                        ? HISTORY_ROW_ANCHOR_STYLE
                        : isFuture
                          ? HISTORY_ROW_FUTURE_STYLE
                          : pastStyle;

                    return (
                        <div
                            key={`${monthRow.year}-${monthRow.month}`}
                            className={`dashboard-history-grid-row rounded-2 mb-1 ${isAnchor ? 'dashboard-history-month-row--anchor' : ''} ${isFuture ? 'dashboard-history-month-row--future' : ''} ${isPast ? 'dashboard-history-month-row--past' : ''}`}
                            style={{
                                display: 'grid',
                                gridTemplateColumns: GRID_COLS,
                                gap: '6px',
                                padding: '5px 2px',
                                border: rowChrome?.border ?? '1px solid transparent',
                                background: rowChrome?.background ?? '#ffffff',
                            }}
                        >
                            <div
                                className="d-flex align-items-center text-truncate"
                                style={{ minWidth: 0, gap: '4px' }}
                            >
                                <span
                                    className="fw-semibold text-truncate"
                                    style={{
                                        fontSize: '0.74rem',
                                        color: rowChrome?.monthColor ?? '#334155',
                                    }}
                                >
                                    {monthLabel}
                                </span>
                                {isAnchor ? (
                                    <span
                                        className="badge rounded-pill flex-shrink-0"
                                        style={{
                                            fontSize: '0.55rem',
                                            fontWeight: 600,
                                            background: '#dbeafe',
                                            color: '#1d4ed8',
                                        }}
                                    >
                                        Selected
                                    </span>
                                ) : null}
                                {isFuture ? (
                                    <span
                                        className="badge rounded-pill flex-shrink-0"
                                        style={{
                                            fontSize: '0.55rem',
                                            fontWeight: 600,
                                            background: '#d1fae5',
                                            color: '#047857',
                                        }}
                                    >
                                        Next
                                    </span>
                                ) : null}
                            </div>

                            {DASHBOARD_HISTORY_KPI_DEFS.map((kpi) => {
                                const value = totals[kpiValueKey(kpi.type)] || 0;
                                return (
                                    <button
                                        key={kpi.type}
                                        type="button"
                                        className="dashboard-history-kpi-chip btn btn-sm p-0 border-0"
                                        style={{
                                            minWidth: 0,
                                            cursor: onBarClick ? 'pointer' : 'default',
                                            opacity: value > 0 ? 1 : 0.5,
                                        }}
                                        onClick={() =>
                                            onBarClick &&
                                            onBarClick(kpi.type, monthRow.month, monthRow.year)
                                        }
                                        title={`${kpi.label}: ${value} (${monthLabel})`}
                                    >
                                        <div
                                            className="rounded-2 h-100 text-center"
                                            style={{
                                                padding: '3px 4px 4px',
                                                border: 'none',
                                                background: 'transparent',
                                            }}
                                        >
                                            <div
                                                className="fw-bold tabular-nums"
                                                style={{
                                                    fontSize: '1rem',
                                                    color: kpi.color,
                                                    lineHeight: 1.1,
                                                }}
                                            >
                                                {value}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    );
                });
                })()}

                {selectedYearTotals && anchorYear ? (
                    <div style={{ marginTop: '20px', paddingTop: '4px' }}>
                        <div
                            className="dashboard-history-year-total-row rounded-2"
                            style={{
                                display: 'grid',
                                gridTemplateColumns: GRID_COLS,
                                gap: '6px',
                                padding: '8px 2px 6px',
                                background: 'linear-gradient(180deg, #f1f5f9 0%, #e8edf3 100%)',
                                border: '1px solid #cbd5e1',
                            }}
                        >
                            <div
                                className="fw-bold text-truncate d-flex align-items-center"
                                style={{ fontSize: '0.76rem', color: '#0f172a', minWidth: 0 }}
                            >
                                {anchorYear} Total
                            </div>
                            {DASHBOARD_HISTORY_KPI_DEFS.map((kpi) => {
                                const value = selectedYearTotals[kpiValueKey(kpi.type)] || 0;
                                const clickHandler = onYearBarClick || onBarClick;
                                return (
                                    <button
                                        key={kpi.type}
                                        type="button"
                                        className="dashboard-history-kpi-chip btn btn-sm p-0 border-0"
                                        style={{
                                            minWidth: 0,
                                            cursor: clickHandler ? 'pointer' : 'default',
                                        }}
                                        onClick={() =>
                                            onYearBarClick
                                                ? onYearBarClick(kpi.type)
                                                : onBarClick &&
                                                  onBarClick(kpi.type, anchorMonth, anchorYear)
                                        }
                                        title={`${kpi.label} ${anchorYear} total: ${value}`}
                                    >
                                        <div
                                            className="rounded-2 h-100 text-center"
                                            style={{
                                                padding: '4px 4px 5px',
                                                border: 'none',
                                                background: 'transparent',
                                            }}
                                        >
                                            <div
                                                className="fw-bold tabular-nums"
                                                style={{
                                                    fontSize: '1.05rem',
                                                    color: kpi.color,
                                                    lineHeight: 1.1,
                                                }}
                                            >
                                                {value}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
};

export default LastTenMonthsOverview;
