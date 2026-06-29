import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Legend } from 'recharts';

const AnalyticsRow = ({ calendarData = {}, tableData = [], summaryData = {} }) => {

    // 1. Process Trend Data (from Calendar)
    const trendData = useMemo(() => {
        if (!calendarData) return [];
        return Object.keys(calendarData).sort().map(dateStr => {
            const day = dateStr.split('-')[2];
            const info = calendarData[dateStr];
            return {
                name: day,
                Enquiries: info.Enquiries || 0,
                Due: info.Due || 0
            };
        });
    }, [calendarData]);

    // 2. Process Source/Type Data (Top 4 mostly for clean look)
    const sourceData = useMemo(() => {
        if (!tableData || tableData.length === 0) return [];
        const counts = tableData.reduce((acc, curr) => {
            const type = curr.EnquiryFor || 'Unknown';
            acc[type] = (acc[type] || 0) + 1;
            return acc;
        }, {});
        return Object.keys(counts)
            .map(key => ({ name: key, value: counts[key] }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 4);
    }, [tableData]);

    // 3. Process Status Data - For Radial
    const scoreVal = useMemo(() => {
        const dueToday = summaryData?.DueToday || 0;
        const upcoming = summaryData?.UpcomingDues || 0;
        const completed = 25; // Dummy for visual health score as real "completed" isn't strictly tracked in summary yet
        const total = dueToday + upcoming + completed;
        // Calculation: simplistic health score
        return total > 0 ? Math.round((completed / total) * 100) : 85;
    }, [summaryData]);

    // 4. Calculate Top Performer
    const topPerformer = useMemo(() => {
        if (!tableData || tableData.length === 0) return { name: 'N/A', count: 0 };
        const seCounts = tableData.reduce((acc, curr) => {
            const se = curr.ConcernedSE || 'Unknown';
            acc[se] = (acc[se] || 0) + 1;
            return acc;
        }, {});
        const sorted = Object.entries(seCounts).sort((a, b) => b[1] - a[1]);
        return sorted.length > 0 ? { name: sorted[0][0], count: sorted[0][1] } : { name: 'N/A', count: 0 };
    }, [tableData]);

    return (
        <div className="row g-4 mb-4">
            {/* Chart 1: Workload Trend - Area (Sparkline Style) */}
            <div className="col-md-5">
                <div className="card border-0 shadow-sm h-100" style={{ borderRadius: '16px' }}>
                    <div className="card-body p-4">
                        <div className="d-flex justify-content-between align-items-center mb-4">
                            <h6 className="fw-bold text-dark m-0">Load Trend</h6>
                            <span className="badge bg-light text-secondary rounded-pill fw-normal px-3">This Month</span>
                        </div>
                        <div style={{ width: '100%', height: 180 }}>
                            <ResponsiveContainer>
                                <AreaChart data={trendData}>
                                    <defs>
                                        <linearGradient id="colorEnq" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <Tooltip
                                        contentStyle={{ fontSize: '12px', borderRadius: '12px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}
                                        cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '4 4' }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="Enquiries"
                                        stroke="#6366f1"
                                        strokeWidth={3}
                                        fillOpacity={1}
                                        fill="url(#colorEnq)"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>

            {/* Chart 2: Sources - Minimal Pill Bars */}
            <div className="col-md-4">
                <div className="card border-0 shadow-sm h-100" style={{ borderRadius: '16px' }}>
                    <div className="card-body p-4">
                        <div className="d-flex justify-content-between align-items-center mb-3">
                            <h6 className="fw-bold text-dark m-0">Top Categories</h6>
                            <span className="text-muted small">Distribution</span>
                        </div>
                        <div className="d-flex flex-column gap-3 mt-2">
                            {sourceData.map((item, idx) => {
                                const maxVal = Math.max(...sourceData.map(d => d.value));
                                const pct = (item.value / maxVal) * 100;
                                const colors = ['#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];
                                return (
                                    <div key={idx} className="w-100">
                                        <div className="d-flex justify-content-between small fw-bold mb-1">
                                            <span className="text-secondary">{item.name}</span>
                                            <span className="text-dark">{item.value}</span>
                                        </div>
                                        <div className="progress" style={{ height: '6px', backgroundColor: '#f1f5f9', borderRadius: '10px' }}>
                                            <div
                                                className="progress-bar"
                                                role="progressbar"
                                                style={{ width: `${pct}%`, backgroundColor: colors[idx % 4], borderRadius: '10px' }}
                                            ></div>
                                        </div>
                                    </div>
                                )
                            })}
                            {sourceData.length === 0 && <div className="text-center text-muted small py-4">No Data Available</div>}
                        </div>
                    </div>
                </div>
            </div>

            {/* Column 3: Health - Ring */}
            <div className="col-md-3">
                <div className="card border-0 shadow-sm h-100" style={{ borderRadius: '16px' }}>
                    <div className="card-body p-4 d-flex flex-column align-items-center justify-content-center text-center">
                        <h6 className="fw-bold text-dark mb-2 w-100 text-start">Health Score</h6>
                        <div style={{ position: 'relative', width: '160px', height: '160px' }}>
                            <ResponsiveContainer>
                                <PieChart>
                                    <Pie
                                        data={[{ value: scoreVal }, { value: 100 - scoreVal }]}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={55}
                                        outerRadius={70}
                                        startAngle={90}
                                        endAngle={-270}
                                        dataKey="value"
                                        stroke="none"
                                        cornerRadius={10}
                                    >
                                        <Cell fill="#6366f1" />
                                        <Cell fill="#f1f5f9" />
                                    </Pie>
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="position-absolute top-50 start-50 translate-middle text-center">
                                <h2 className="mb-0 fw-bold text-dark">{scoreVal}%</h2>
                                <span className="small text-muted fw-semibold">On Track</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AnalyticsRow;
