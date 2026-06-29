import React from 'react';

const CalendarBarChart = ({ data, monthlyTotals, onBarClick }) => {
    const sumDaily = (key) =>
        (Array.isArray(data) ? data : []).reduce((acc, item) => acc + (Number(item[key]) || 0), 0);

    // Monthly bar = sum of calendar day chips (monthlyTotals is reconciled the same way on the server).
    const totals = {
        enquiries: sumDaily('Enquiries'),
        due: sumDaily('Due'),
        newQuote: sumDaily('NewQuote'),
        revQuote: sumDaily('RevQuote'),
        lapsed: sumDaily('Lapsed'),
    };

    const bars = [
        { type: 'enquiry', label: 'Enquiry Received', value: totals.enquiries, color: '#3b82f6', bgColor: '#eff6ff', borderColor: '#bfdbfe' },
        { type: 'due', label: 'Due', value: totals.due, color: '#d97706', bgColor: '#fffbeb', borderColor: '#fde68a' },
        { type: 'lapsed', label: 'Lapsed', value: totals.lapsed, color: '#dc2626', bgColor: '#fef2f2', borderColor: '#fecaca' },
        { type: 'newQuote', label: 'New Quote', value: totals.newQuote, color: '#059669', bgColor: '#ecfdf5', borderColor: '#a7f3d0' },
        { type: 'revQuote', label: 'Rev Quote', value: totals.revQuote, color: '#0d9488', bgColor: '#f0fdfa', borderColor: '#99f6e4' },
    ];

    return (
        <div
            className="dashboard-monthly-overview-inner flex-shrink-0 border-bottom bg-white"
            style={{
                borderColor: '#e5e7eb',
                padding: '3px 10px 4px',
                background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
            }}
        >
            <div style={{ marginBottom: '3px' }}>
                <h6 className="text-secondary mb-0" style={{ fontSize: '0.7rem', fontWeight: 600, lineHeight: 1.1, letterSpacing: '0.02em' }}>
                    Monthly Overview
                </h6>
            </div>
            <div
                className="monthly-overview-kpi-row"
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
                    gap: '4px',
                }}
            >
                {bars.map((bar, index) => (
                    <div
                        key={index}
                        className="monthly-overview-kpi-tile"
                        style={{ cursor: 'pointer', minWidth: 0 }}
                        onClick={() => onBarClick && onBarClick(bar.type)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onBarClick && onBarClick(bar.type);
                            }
                        }}
                    >
                        <div
                            className="monthly-overview-kpi-tile-inner d-flex align-items-center justify-content-between gap-1 h-100"
                            style={{
                                padding: '2px 6px',
                                border: `1px solid ${bar.borderColor}`,
                                borderRadius: '6px',
                                background: `linear-gradient(165deg, ${bar.bgColor} 0%, #ffffff 88%)`,
                                boxShadow: '0 1px 2px rgba(15, 23, 42, 0.05)',
                                transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
                                minHeight: '26px',
                                boxSizing: 'border-box',
                            }}
                        >
                            <span
                                className="text-secondary text-truncate"
                                style={{
                                    fontSize: '0.58rem',
                                    lineHeight: 1.1,
                                    fontWeight: 600,
                                    color: '#64748b',
                                    minWidth: 0,
                                }}
                                title={bar.label}
                            >
                                {bar.label}
                            </span>
                            <span
                                className="fw-bold tabular-nums flex-shrink-0"
                                style={{
                                    fontSize: '0.9rem',
                                    lineHeight: 1,
                                    color: bar.color,
                                }}
                            >
                                {bar.value}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
            <style>{`
                .monthly-overview-kpi-tile:hover .monthly-overview-kpi-tile-inner,
                .monthly-overview-kpi-tile:focus-visible .monthly-overview-kpi-tile-inner {
                    transform: translateY(-1px);
                    box-shadow:
                        0 6px 14px rgba(15, 23, 42, 0.09),
                        0 2px 4px rgba(15, 23, 42, 0.05);
                }
                .monthly-overview-kpi-tile:focus-visible {
                    outline: none;
                }
                .monthly-overview-kpi-tile:focus-visible .monthly-overview-kpi-tile-inner {
                    outline: 2px solid #3b82f6;
                    outline-offset: 2px;
                }
                @media (max-width: 720px) {
                    .monthly-overview-kpi-row {
                        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
                    }
                }
            `}</style>
        </div>
    );
};

export default CalendarBarChart;
