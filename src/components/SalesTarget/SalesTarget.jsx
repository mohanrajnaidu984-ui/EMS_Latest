import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { EMS_TABLE_HEADER_GRADIENT } from '../../constants/emsTheme';
import ExcelDownloadButton from '../shared/ExcelDownloadButton';
import { downloadSalesTargetXlsx } from './salesTargetExcel';
import './SalesTarget.css';

// ── Formatted Revenue Input (shows ###,###,### when not focused) ──
const RevenueInput = ({ value, onChange, placeholder = '0', style = {}, disabled = false }) => {
    const [isFocused, setIsFocused] = useState(false);
    const [localRaw, setLocalRaw] = useState('');
    const inputRef = useRef();

    // Format number with commas: 1000000 → '1,000,000'
    const formatWithCommas = (val) => {
        const num = parseFloat(String(val).replace(/,/g, ''));
        if (isNaN(num) || val === '' || val === null || val === undefined) return '';
        return Math.round(num).toLocaleString('en-US');
    };

    const handleFocus = () => {
        // Show raw numeric when editing
        setLocalRaw(value !== '' && value !== null && value !== undefined ? String(value) : '');
        setIsFocused(true);
    };

    const handleBlur = () => {
        setIsFocused(false);
        // Strip commas and parse, then propagate
        const stripped = String(localRaw).replace(/,/g, '');
        const num = parseFloat(stripped);
        onChange(isNaN(num) ? '' : num);
    };

    const handleChange = (e) => {
        // Allow digits, commas, decimals while typing
        const raw = e.target.value.replace(/[^0-9.,]/g, '');
        setLocalRaw(raw);
    };

    const displayValue = isFocused ? localRaw : formatWithCommas(value);

    return (
        <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            disabled={disabled}
            className="form-control form-control-sm bg-white text-dark border-secondary text-center"
            style={{ fontSize: '12px', letterSpacing: '0.2px', paddingTop: '0.2rem', paddingBottom: '0.2rem', ...style }}
            value={displayValue}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onChange={handleChange}
            placeholder={placeholder}
        />
    );
};

/** BD amounts in history/summary: below 1M as #.##k, from 1M upward as #.##M (always 2 decimals). */
function formatBdCompactKm(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '0.00k';
    const neg = num < 0;
    const abs = Math.abs(num);
    let body;
    if (abs < 1_000_000) {
        body = `${(abs / 1000).toFixed(2)}k`;
    } else {
        body = `${(abs / 1_000_000).toFixed(2)}M`;
    }
    return neg ? `-${body}` : body;
}

const SalesTarget = () => {
    const { currentUser } = useAuth();
    const [loading, setLoading] = useState(true);
    const [isManager, setIsManager] = useState(false);
    const [managedDivisions, setManagedDivisions] = useState([]);

    // Filters
    const [selectedYear, setSelectedYear] = useState(() => localStorage.getItem('target_year') || '2026');
    const [selectedDivision, setSelectedDivision] = useState(() => localStorage.getItem('target_division') || '');
    const [selectedEngineer, setSelectedEngineer] = useState(() => localStorage.getItem('target_engineer') || '');

    // -- Persistence --
    useEffect(() => {
        localStorage.setItem('target_year', selectedYear);
        localStorage.setItem('target_division', selectedDivision);
        localStorage.setItem('target_engineer', selectedEngineer);
    }, [selectedYear, selectedDivision, selectedEngineer]);

    // Lists
    const [engineers, setEngineers] = useState([]);
    const [items, setItems] = useState([]); // List of item names

    // Data Grid:
    // { [itemName]: { Q1: 0, Q2: 0, Q3: 0, Q4: 0, Q1_GP: 0, Q2_GP: 0, Q3_GP: 0, Q4_GP: 0 } }
    // Q*_GP stores the GP% (0-100); the BD amount is calculated as Revenue × (GP%/100)
    const [targetData, setTargetData] = useState({});

    /** Last 3 financial years (anchor = selected year + two prior), division totals */
    const [yearHistory, setYearHistory] = useState([]);
    const [yearHistoryLoading, setYearHistoryLoading] = useState(false);
    const [yearHistoryError, setYearHistoryError] = useState(null);

    // 1. Check Access
    useEffect(() => {
        const email = currentUser?.EmailId || currentUser?.email;

        if (email) {
            setLoading(true);
            fetch(`/api/sales-targets/manager-access?email=${encodeURIComponent(email)}`)
                .then(res => res.json())
                .then(data => {
                    setIsManager(data.isManager);
                    const divs = data.divisions || [];
                    setManagedDivisions(divs);
                    const norm = (s) => String(s ?? '').trim();
                    const divList = divs.map(norm);
                    const savedDiv = norm(localStorage.getItem('target_division'));
                    const preferred =
                        savedDiv && divList.includes(savedDiv)
                            ? savedDiv
                            : divList.length > 0
                              ? divList[0]
                              : '';
                    setSelectedDivision(preferred);
                    setLoading(false);
                })
                .catch(err => {
                    setLoading(false);
                });
        } else {
            if (currentUser) setLoading(false);
        }
    }, [currentUser]);

    // 2. Load Engineers & Items when Division Changes
    useEffect(() => {
        if (selectedDivision) {
            setEngineers([]);
            // Load Engineers
            fetch(`/api/sales-targets/engineers?division=${encodeURIComponent(selectedDivision)}`)
                .then(res => res.json())
                .then(data => {
                    const list = Array.isArray(data) ? data : [];
                    setEngineers(list);
                    setSelectedEngineer((prev) => {
                        if (!prev || prev === 'ALL') return prev;
                        const names = list.map((e) => e.FullName);
                        return names.includes(prev) ? prev : '';
                    });
                })
                .catch(err => console.error(err));

            // Load Items
            fetch(`/api/sales-targets/items?division=${encodeURIComponent(selectedDivision)}`)
                .then(res => res.json())
                .then(data => {
                    const itemList = data.map(i => i.ItemName);
                    setItems(itemList);
                })
                .catch(err => console.error(err));
        }
    }, [selectedDivision]);

    // 3. Load Existing Targets when Filters Ready
    useEffect(() => {
        if (selectedYear && selectedDivision && selectedEngineer) {
            fetch(`/api/sales-targets/targets?year=${selectedYear}&division=${encodeURIComponent(selectedDivision)}&engineer=${encodeURIComponent(selectedEngineer)}`)
                .then(res => res.json())
                .then(data => {
                    const newMap = {};
                    const isAll = selectedEngineer === 'ALL';
                    data.forEach(row => {
                        const rowKey = isAll
                            ? String(row.SalesEngineer || row.salesEngineer || '').trim()
                            : String(row.ItemName || '').trim();
                        if (!rowKey) return;
                        if (!newMap[rowKey]) {
                            newMap[rowKey] = { Q1: '', Q2: '', Q3: '', Q4: '', Q1_GP: '', Q2_GP: '', Q3_GP: '', Q4_GP: '' };
                        }
                        newMap[rowKey][row.Quarter] = row.TargetValue;
                        newMap[rowKey][`${row.Quarter}_GP`] = row.GrossProfitTarget ?? '';
                    });
                    setTargetData(newMap);
                })
                .catch(err => console.error(err));
        } else {
            setTargetData({});
        }
    }, [selectedYear, selectedDivision, selectedEngineer]);

    // 4. Division-level totals for last 3 financial years (all SEs) — below main grid
    useEffect(() => {
        if (!selectedDivision || !selectedYear) {
            setYearHistory([]);
            setYearHistoryError(null);
            return;
        }
        let cancelled = false;
        setYearHistoryLoading(true);
        setYearHistoryError(null);
        const qs = new URLSearchParams({
            division: selectedDivision.trim(),
            anchorYear: String(selectedYear).trim(),
        });
        fetch(`/api/sales-targets/year-history?${qs.toString()}`)
            .then(async (r) => {
                const text = await r.text();
                let data;
                try {
                    data = text ? JSON.parse(text) : null;
                } catch {
                    if (!cancelled) {
                        setYearHistoryError(`Invalid response (${r.status})`);
                        setYearHistory([]);
                    }
                    return;
                }
                if (!r.ok) {
                    if (!cancelled) {
                        const msg = (data && (data.error || data.message)) || `Request failed (${r.status})`;
                        setYearHistoryError(String(msg));
                        setYearHistory([]);
                    }
                    return;
                }
                if (!cancelled) {
                    if (Array.isArray(data)) {
                        setYearHistory(data);
                        setYearHistoryError(null);
                    } else {
                        setYearHistory([]);
                        setYearHistoryError('Unexpected response shape');
                    }
                }
            })
            .catch((e) => {
                if (!cancelled) {
                    setYearHistoryError(e?.message || 'Network error');
                    setYearHistory([]);
                }
            })
            .finally(() => {
                if (!cancelled) setYearHistoryLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [selectedDivision, selectedYear]);

    const handleInputChange = (item, field, value) => {
        setTargetData(prev => ({
            ...prev,
            [item]: {
                ...prev[item],
                [field]: value
            }
        }));
    };

    /** Parse BD revenue / GP field to a finite number, or NaN if unset or invalid */
    const parseTargetNumber = (raw) => {
        if (raw === '' || raw === null || raw === undefined) return NaN;
        const n = parseFloat(String(raw).replace(/,/g, ''));
        return Number.isFinite(n) ? n : NaN;
    };

    const isAllEngineersView = selectedEngineer === 'ALL';

    /** Item rows for one SE; engineer rows when ALL is selected. */
    const displayRowKeys = isAllEngineersView
        ? engineers.map((e) => String(e.FullName || '').trim()).filter(Boolean)
        : items;

    const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];

    /** Split one engineer's quarterly totals across division items (sums match the grid). */
    const buildTargetsPayloadForRow = (row) => {
        const itemNames = items.length > 0 ? items : ['General'];
        const n = itemNames.length;
        return itemNames.map((itemName) => {
            const out = { itemName };
            quarters.forEach((q) => {
                const rev = parseTargetNumber(row[q]);
                out[q] = Number.isFinite(rev) ? rev / n : 0;
                out[`${q}_GP`] = parseTargetNumber(row[`${q}_GP`]);
            });
            return out;
        });
    };

    const buildItemTargetsPayload = (itemName) => {
        const row = targetData[itemName] || {};
        return {
            itemName,
            Q1: parseTargetNumber(row.Q1),
            Q2: parseTargetNumber(row.Q2),
            Q3: parseTargetNumber(row.Q3),
            Q4: parseTargetNumber(row.Q4),
            Q1_GP: parseTargetNumber(row.Q1_GP),
            Q2_GP: parseTargetNumber(row.Q2_GP),
            Q3_GP: parseTargetNumber(row.Q3_GP),
            Q4_GP: parseTargetNumber(row.Q4_GP),
        };
    };

    const rowHasAnyTarget = (row) =>
        quarters.some((q) => {
            const rev = parseTargetNumber(row[q]);
            return Number.isFinite(rev) && rev > 0;
        });

    const validateRowTargets = (label, row) => {
        const problems = [];
        for (const q of quarters) {
            const rev = parseTargetNumber(row[q]);
            const gp = parseTargetNumber(row[`${q}_GP`]);
            if (!Number.isFinite(rev) || rev <= 0) {
                problems.push(`${label} · ${q}: Job Value must be greater than zero`);
            }
            if (!Number.isFinite(gp) || gp <= 0) {
                problems.push(`${label} · ${q}: GP % must be greater than zero`);
            }
        }
        return problems;
    };

    const reloadTargets = () => {
        if (!selectedYear || !selectedDivision || !selectedEngineer) return;
        fetch(
            `/api/sales-targets/targets?year=${selectedYear}&division=${encodeURIComponent(selectedDivision)}&engineer=${encodeURIComponent(selectedEngineer)}`
        )
            .then((res) => res.json())
            .then((data) => {
                const newMap = {};
                const isAll = selectedEngineer === 'ALL';
                data.forEach((row) => {
                    const rowKey = isAll
                        ? String(row.SalesEngineer || row.salesEngineer || '').trim()
                        : String(row.ItemName || '').trim();
                    if (!rowKey) return;
                    if (!newMap[rowKey]) {
                        newMap[rowKey] = { Q1: '', Q2: '', Q3: '', Q4: '', Q1_GP: '', Q2_GP: '', Q3_GP: '', Q4_GP: '' };
                    }
                    newMap[rowKey][row.Quarter] = row.TargetValue;
                    newMap[rowKey][`${row.Quarter}_GP`] = row.GrossProfitTarget ?? '';
                });
                setTargetData(newMap);
            })
            .catch((err) => console.error(err));

        const qs = new URLSearchParams({
            division: selectedDivision.trim(),
            anchorYear: String(selectedYear).trim(),
        });
        fetch(`/api/sales-targets/year-history?${qs.toString()}`)
            .then((r) => (r.ok ? r.json() : []))
            .then((data) => {
                if (Array.isArray(data)) setYearHistory(data);
            })
            .catch(() => {});
    };

    const handleSave = async () => {
        if (!selectedEngineer) return alert('Please select a Sales Engineer');

        const problems = [];
        const userEmail = currentUser?.EmailId || currentUser?.email;

        if (isAllEngineersView) {
            const validationOnly = [];
            for (const engineerName of displayRowKeys) {
                const row = targetData[engineerName] || {};
                if (!rowHasAnyTarget(row)) continue;
                validationOnly.push(...validateRowTargets(engineerName, row));
            }
            if (validationOnly.length > 0) {
                const maxLines = 14;
                const head = validationOnly.slice(0, maxLines).join('\n');
                const extra =
                    validationOnly.length > maxLines ? `\n… and ${validationOnly.length - maxLines} more` : '';
                alert(
                    `Cannot save:\n\nFor each engineer with targets, every quarter needs Booking Job Value > 0 and GP % > 0.\n\n${head}${extra}`
                );
                return;
            }

            const engineersToSaveFixed = displayRowKeys
                .filter((engineerName) => rowHasAnyTarget(targetData[engineerName] || {}))
                .map((engineerName) => ({
                    engineer: engineerName,
                    targets: buildTargetsPayloadForRow(targetData[engineerName] || {}),
                }));

            if (engineersToSaveFixed.length === 0) {
                alert('Enter targets for at least one engineer (all four quarters: job value > 0 and GP % > 0).');
                return;
            }

            try {
                const res = await fetch('/api/sales-targets/save-all', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        year: selectedYear,
                        division: selectedDivision,
                        userEmail,
                        engineers: engineersToSaveFixed,
                    }),
                });
                if (res.ok) {
                    alert('Targets saved successfully for all updated engineers!');
                    reloadTargets();
                } else {
                    const errBody = await res.json().catch(() => ({}));
                    alert(errBody.error || 'Failed to save targets.');
                }
            } catch (err) {
                console.error(err);
                alert('Error saving targets.');
            }
            return;
        }

        for (const itemName of items) {
            problems.push(...validateRowTargets(itemName, targetData[itemName] || {}));
        }

        if (problems.length > 0) {
            const maxLines = 14;
            const head = problems.slice(0, maxLines).join('\n');
            const extra =
                problems.length > maxLines ? `\n… and ${problems.length - maxLines} more` : '';
            alert(`Cannot save:\n\nTargets cannot be zero or blank.\nEvery quarter needs Booking Job Value > 0 and GP % > 0.\n\n${head}${extra}`);
            return;
        }

        const finalPayload = items.map((itemName) => buildItemTargetsPayload(itemName));

        try {
            const res = await fetch('/api/sales-targets/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    year: selectedYear,
                    division: selectedDivision,
                    engineer: selectedEngineer,
                    userEmail,
                    targets: finalPayload,
                }),
            });
            if (res.ok) {
                alert('Targets saved successfully!');
                reloadTargets();
            } else {
                alert('Failed to save targets.');
            }
        } catch (err) {
            console.error(err);
            alert('Error saving targets.');
        }
    };

    if (loading) return <div className="p-4 text-dark">Loading...</div>;

    if (!isManager) {
        return (
            <div className="d-flex justify-content-center align-items-center h-100 text-dark">
                <div className="text-center">
                    <i className="bi bi-lock-fill fs-1 text-secondary mb-3"></i>
                    <h3>Access Restricted</h3>
                    <p className="text-muted">You do not have permission to access Sales Target Settings.</p>
                </div>
            </div>
        );
    }

    // Helper to format number with commas (inline BD badges)
    const fmt = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

    // Quarter-wise and grand totals for footer + row summaries
    const quarterTotalRevenue = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
    const quarterTotalGPAmount = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
    let grandTotalRevenue = 0;
    let grandTotalGPAmount = 0;

    displayRowKeys.forEach((rowKey) => {
        const row = targetData[rowKey] || {};
        quarters.forEach((q) => {
            const rev = parseFloat(row[q]) || 0;
            const gpPct = parseFloat(row[`${q}_GP`]) || 0;
            const gpAmt = rev * (gpPct / 100);
            quarterTotalRevenue[q] += rev;
            quarterTotalGPAmount[q] += gpAmt;
        });
        const rowRev = quarters.reduce((sum, q) => sum + (parseFloat(row[q]) || 0), 0);
        const rowGP = quarters.reduce((sum, q) => {
            const rev = parseFloat(row[q]) || 0;
            const gpPct = parseFloat(row[`${q}_GP`]) || 0;
            return sum + rev * (gpPct / 100);
        }, 0);
        grandTotalRevenue += rowRev;
        grandTotalGPAmount += rowGP;
    });

    // Inline styles for the two sub-rows (backgrounds applied via CSS on entire row)
    const revenueRowStyle = {
        borderBottom: '1px dashed #ced4da',
    };
    const gpRowStyle = {
        borderBottom: '1px solid #dee2e6',
    };

    const labelCellStyle = {
        fontSize: '9px',
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: '0.35px',
        paddingTop: '1px',
        paddingBottom: '2px',
        paddingLeft: '4px',
        color: '#6c757d',
        whiteSpace: 'nowrap',
        lineHeight: 1.15,
    };

    const gpLabelStyle = {
        ...labelCellStyle,
        color: '#198754',
    };

    return (
        <div className="container-fluid p-4 sales-target-container" style={{ minHeight: 'calc(100vh - 72px)', color: '#212529' }}>
            <div style={{ width: '70%', margin: '0 auto' }}>
            <div className="d-flex justify-content-between align-items-center mb-4">
                <h4 className="fw-bold text-dark mb-0">
                    <i className="bi bi-bullseye me-2 text-primary"></i>
                    Sales Target Settings
                </h4>
                <div className="d-flex align-items-center gap-2">
                    <ExcelDownloadButton
                        onClick={async () => {
                            if (!selectedEngineer || displayRowKeys.length === 0) {
                                window.alert('No data to export');
                                return;
                            }
                            try {
                                await downloadSalesTargetXlsx({
                                    rowKeys: displayRowKeys,
                                    targetData,
                                    nameHeader: isAllEngineersView ? 'Sales Engineer' : 'Item Name',
                                    meta: {
                                        year: selectedYear,
                                        division: selectedDivision,
                                        engineer: isAllEngineersView
                                            ? 'ALL'
                                            : selectedEngineer
                                    }
                                });
                            } catch (err) {
                                console.error('Sales Target Excel export failed', err);
                                window.alert(err?.message || 'Failed to export Excel workbook');
                            }
                        }}
                        disabled={!selectedEngineer || displayRowKeys.length === 0}
                        title="Download Sales Target as Excel (.xlsx)"
                    />
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleSave}
                    >
                        <i className="bi bi-save me-2"></i> Save Changes
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="card border mb-4 shadow-sm sales-target-filter-panel">
                <div className="card-body d-flex gap-3 align-items-end">
                    <div className="form-group">
                        <label className="small text-muted mb-1">Financial Year</label>
                        <select className="form-select bg-white text-dark border-secondary" value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
                            {['2025', '2026', '2027'].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    <div className="form-group" style={{ minWidth: '200px' }}>
                        <label className="small text-muted mb-1">Division</label>
                        <select className="form-select bg-white text-dark border-secondary" value={selectedDivision} onChange={e => setSelectedDivision(e.target.value)}>
                            {managedDivisions.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                    </div>
                    <div className="form-group" style={{ minWidth: '250px' }}>
                        <label className="small text-muted mb-1">Sales Engineer</label>
                        <select className="form-select bg-white text-dark border-secondary" value={selectedEngineer} onChange={e => setSelectedEngineer(e.target.value)}>
                            <option value="">-- Select Engineer --</option>
                            <option value="ALL">ALL (sum job value · avg GP %)</option>
                            {engineers.map(e => <option key={e.EmailId} value={e.FullName}>{e.FullName}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* Legend */}
            {selectedEngineer && (
                <div className="d-flex flex-wrap gap-3 align-items-center mb-3" style={{ fontSize: '12px' }}>
                    {isAllEngineersView && (
                        <span className="text-secondary" style={{ fontSize: '11px' }}>
                            <i className="bi bi-info-circle me-1" aria-hidden />
                            Edit any engineer row, then Save Changes to update all at once. Engineers left blank are not changed. Job Value splits evenly across division items when saved.
                        </span>
                    )}
                    <span style={{ color: '#6c757d' }}>
                        <span style={{ display: 'inline-block', width: '10px', height: '10px', background: '#adb5bd', borderRadius: '2px', marginRight: '6px' }}></span>
                        Booking Job Value
                    </span>
                    <span style={{ color: '#198754' }}>
                        <span style={{ display: 'inline-block', width: '10px', height: '10px', background: 'rgba(25, 135, 84, 0.25)', borderRadius: '2px', marginRight: '6px' }}></span>
                        Gross Profit Target (% of Job Value)
                    </span>
                </div>
            )}

            {/* Grid */}
            {selectedEngineer ? (
                <div className="table-responsive sales-target-grid-wrap shadow-sm">
                    <table className="table table-bordered mb-0 align-middle bg-white sales-target-grid-table" style={{ borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'auto', width: '100%' }}>
                        <thead>
                            <tr style={{ background: EMS_TABLE_HEADER_GRADIENT }}>
                                <th
                                    colSpan={2}
                                    className="text-start ps-3 text-white sales-target-col-engineer"
                                    style={{ fontSize: '10px', letterSpacing: '0.55px', textTransform: 'uppercase', padding: '8px 10px', borderBottom: '1px solid rgba(255, 255, 255, 0.22)', lineHeight: 1.2 }}
                                >
                                    {isAllEngineersView ? 'Sales Engineer' : 'Item Name'}
                                </th>
                                {quarters.map(q => (
                                    <th key={q} className="text-center text-white" style={{ fontSize: '10px', letterSpacing: '0.55px', textTransform: 'uppercase', padding: '8px 10px', borderBottom: '1px solid rgba(255, 255, 255, 0.22)', lineHeight: 1.2 }}>
                                        {q} — Target
                                    </th>
                                ))}
                                <th className="text-center fw-bold text-white sales-target-col-total" style={{ fontSize: '10px', letterSpacing: '0.55px', textTransform: 'uppercase', padding: '8px 10px', borderBottom: '1px solid rgba(255, 255, 255, 0.22)', lineHeight: 1.2 }}>
                                    Total
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {displayRowKeys.length > 0 ? displayRowKeys.map((rowKey) => {
                                const row = targetData[rowKey] || {};
                                const q1 = parseFloat(row.Q1) || 0;
                                const q2 = parseFloat(row.Q2) || 0;
                                const q3 = parseFloat(row.Q3) || 0;
                                const q4 = parseFloat(row.Q4) || 0;
                                const totalRev = q1 + q2 + q3 + q4;

                                // GP% per quarter → calculate BD amount
                                const gp1pct = parseFloat(row.Q1_GP) || 0;
                                const gp2pct = parseFloat(row.Q2_GP) || 0;
                                const gp3pct = parseFloat(row.Q3_GP) || 0;
                                const gp4pct = parseFloat(row.Q4_GP) || 0;

                                const gp1amt = q1 * (gp1pct / 100);
                                const gp2amt = q2 * (gp2pct / 100);
                                const gp3amt = q3 * (gp3pct / 100);
                                const gp4amt = q4 * (gp4pct / 100);
                                const totalGPAmt = gp1amt + gp2amt + gp3amt + gp4amt;
                                const avgGPPct = totalRev > 0 ? (totalGPAmt / totalRev) * 100 : 0;

                                const qRevs = [q1, q2, q3, q4];
                                const qGPPcts = [gp1pct, gp2pct, gp3pct, gp4pct];
                                const qGPAmts = [gp1amt, gp2amt, gp3amt, gp4amt];

                                return (
                                    <React.Fragment key={rowKey}>
                                        {/* Row 1: label + Revenue inputs */}
                                        <tr className="sales-target-row-revenue" style={revenueRowStyle}>
                                            <td
                                                className="text-start ps-3 text-nowrap sales-target-col-engineer-name"
                                                rowSpan={2}
                                                style={{
                                                    fontWeight: '600',
                                                    fontSize: '12px',
                                                    color: '#212529',
                                                    verticalAlign: 'middle',
                                                    borderRight: '1px solid #dee2e6',
                                                    borderBottom: '1px solid #dee2e6',
                                                    paddingTop: '6px',
                                                    paddingBottom: '6px',
                                                }}
                                            >
                                                {rowKey}
                                            </td>
                                            <td
                                                className="sales-target-col-metric sales-target-metric-revenue"
                                                style={{
                                                    ...labelCellStyle,
                                                    verticalAlign: 'middle',
                                                    borderRight: '1px solid #dee2e6',
                                                    padding: '4px 8px',
                                                }}
                                            >
                                                Booking Job Value
                                            </td>
                                            {quarters.map((q, qi) => (
                                                <td key={q} style={{ padding: '4px 6px', verticalAlign: 'middle' }}>
                                                    <RevenueInput
                                                        value={row[q] ?? ''}
                                                        onChange={(val) => handleInputChange(rowKey, q, val)}
                                                        placeholder="0"
                                                    />
                                                </td>
                                            ))}
                                            <td
                                                className="text-center fw-bold sales-target-col-total"
                                                style={{ color: '#0d6efd', fontSize: '12px', borderLeft: '1px solid #dee2e6', padding: '4px 6px', verticalAlign: 'middle' }}
                                            >
                                                {formatBdCompactKm(totalRev)}
                                            </td>
                                        </tr>

                                        {/* Row 2: GP % inputs + calculated BD amounts */}
                                        <tr className="sales-target-row-gp" style={gpRowStyle}>
                                            <td
                                                className="sales-target-col-metric sales-target-metric-gp"
                                                style={{
                                                    ...gpLabelStyle,
                                                    verticalAlign: 'middle',
                                                    borderRight: '1px solid #dee2e6',
                                                    padding: '4px 8px',
                                                }}
                                            >
                                                GP %
                                            </td>
                                            {quarters.map((q, qi) => (
                                                <td key={q} style={{ padding: '4px 6px', verticalAlign: 'middle' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px', flexWrap: 'wrap' }}>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="100"
                                                            step="0.1"
                                                            className="form-control form-control-sm text-center py-0"
                                                            style={{
                                                                fontSize: '12px',
                                                                background: '#ffffff',
                                                                border: '1px solid #ced4da',
                                                                color: '#212529',
                                                                width: '58px',
                                                                flexShrink: 0,
                                                                paddingTop: '0.15rem',
                                                                paddingBottom: '0.15rem',
                                                            }}
                                                            value={row[`${q}_GP`] ?? ''}
                                                            onChange={(e) => handleInputChange(rowKey, `${q}_GP`, e.target.value)}
                                                            placeholder="%"
                                                        />
                                                        <span style={{ color: '#198754', fontWeight: '700', fontSize: '12px' }}>%</span>
                                                        {qGPAmts[qi] > 0 && (
                                                            <span style={{
                                                                fontSize: '10px',
                                                                color: '#198754',
                                                                background: 'rgba(25, 135, 84, 0.1)',
                                                                border: '1px solid rgba(25, 135, 84, 0.25)',
                                                                borderRadius: '3px',
                                                                padding: '0 4px',
                                                                whiteSpace: 'nowrap',
                                                            }}>
                                                                BD {fmt(qGPAmts[qi])}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                            ))}
                                            <td
                                                className="text-center fw-bold sales-target-col-total"
                                                style={{ color: '#198754', fontSize: '12px', borderLeft: '1px solid #dee2e6', padding: '4px 6px', verticalAlign: 'middle' }}
                                            >
                                                {formatBdCompactKm(totalGPAmt)} ({avgGPPct.toFixed(1)}%)
                                            </td>
                                        </tr>
                                    </React.Fragment>
                                );
                            }) : (
                                <tr>
                                    <td colSpan="7" className="text-muted py-5 text-center">
                                        {isAllEngineersView
                                            ? 'No sales engineers found for this division.'
                                            : 'No items found for this division.'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                        <tfoot style={{ borderTop: '1px solid #ced4da' }}>
                            <tr className="sales-target-row-revenue">
                                <th
                                    rowSpan={2}
                                    className="text-start ps-3 sales-target-col-engineer-name"
                                    style={{ color: '#212529', padding: '8px 10px', fontSize: '12px', verticalAlign: 'middle' }}
                                >
                                    {isAllEngineersView ? 'Total' : 'Grand Total'}
                                </th>
                                <th
                                    className="sales-target-col-metric sales-target-metric-revenue text-start"
                                    style={{ ...labelCellStyle, padding: '6px 8px', verticalAlign: 'middle' }}
                                >
                                    Booking Job Value
                                </th>
                                {quarters.map((q) => (
                                    <th
                                        key={q}
                                        className="text-center"
                                        style={{ color: '#0d6efd', fontSize: '12px', fontWeight: '700', padding: '8px 6px' }}
                                    >
                                        {formatBdCompactKm(quarterTotalRevenue[q])}
                                    </th>
                                ))}
                                <th
                                    className="text-center sales-target-col-total"
                                    style={{ color: '#0d6efd', fontSize: '12px', fontWeight: '700', padding: '8px 10px' }}
                                >
                                    {formatBdCompactKm(grandTotalRevenue)}
                                </th>
                            </tr>
                            <tr className="sales-target-row-gp">
                                <th
                                    className="sales-target-col-metric sales-target-metric-gp text-start"
                                    style={{ ...gpLabelStyle, padding: '6px 8px', verticalAlign: 'middle' }}
                                >
                                    GP %
                                </th>
                                {quarters.map((q) => {
                                    const qRev = quarterTotalRevenue[q];
                                    const qGP = quarterTotalGPAmount[q];
                                    const qPct = qRev > 0 ? (qGP / qRev) * 100 : 0;
                                    return (
                                        <th
                                            key={q}
                                            className="text-center"
                                            style={{ color: '#198754', fontSize: '12px', fontWeight: '700', padding: '8px 6px' }}
                                        >
                                            {formatBdCompactKm(qGP)} ({qPct.toFixed(1)}%)
                                        </th>
                                    );
                                })}
                                <th
                                    className="text-center sales-target-col-total"
                                    style={{ color: '#198754', fontSize: '12px', fontWeight: '700', padding: '8px 10px' }}
                                >
                                    {formatBdCompactKm(grandTotalGPAmount)} ({grandTotalRevenue > 0 ? ((grandTotalGPAmount / grandTotalRevenue) * 100).toFixed(1) : '0.0'}%)
                                </th>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            ) : (
                <div className="text-center text-muted py-5 border border-secondary border-dashed rounded bg-white">
                    <i className="bi bi-people fs-1 d-block mb-3 opacity-50"></i>
                    Please select a Sales Engineer to view and set targets.
                </div>
            )
            }

            {/* Historical: total committed targets for division (all engineers), selected FY + 2 prior */}
            {selectedDivision && selectedYear && (
                <div className="mt-4 mb-4">
                    <h5 className="fw-bold text-dark mb-3" style={{ fontSize: '15px' }}>
                        <i className="bi bi-clock-history me-2 text-primary" aria-hidden />
                        Total committed target for the year (Job Value &amp; GP%)
                    </h5>
                    {yearHistoryError && (
                        <div className="alert alert-warning py-2 px-3 small mb-2" role="alert">
                            {yearHistoryError}
                        </div>
                    )}
                    <div className="sales-target-history-wrap">
                        <table className="table mb-0 align-middle sales-target-history-table" style={{ tableLayout: 'fixed', width: '100%' }}>
                            <thead>
                                <tr style={{ background: EMS_TABLE_HEADER_GRADIENT }}>
                                    <th className="text-white ps-3" style={{ width: '10%', fontSize: '11px', padding: '8px 10px' }}>
                                        Year
                                    </th>
                                    <th className="text-white" style={{ width: '22%', fontSize: '11px', padding: '8px 10px' }}>
                                        Division
                                    </th>
                                    <th className="text-end text-white pe-2" style={{ width: '22%', fontSize: '11px', padding: '8px 10px' }}>
                                        Booking Job Value
                                    </th>
                                    <th className="text-end text-white pe-2" style={{ width: '23%', fontSize: '11px', padding: '8px 10px' }}>
                                        GP value (BD)
                                    </th>
                                    <th className="text-end text-white pe-3" style={{ width: '23%', fontSize: '11px', padding: '8px 10px' }}>
                                        GP %
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {yearHistoryLoading ? (
                                    <tr>
                                        <td colSpan={5} className="text-center text-muted py-4">
                                            Loading history…
                                        </td>
                                    </tr>
                                ) : yearHistory.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="text-center text-muted py-4">
                                            No saved targets for these years.
                                        </td>
                                    </tr>
                                ) : (
                                    yearHistory.map((row) => (
                                        <tr key={row.year}>
                                            <td className="ps-3 fw-semibold" style={{ fontSize: '12px' }}>
                                                {row.year}
                                            </td>
                                            <td style={{ fontSize: '12px' }}>{row.division}</td>
                                            <td className="text-end pe-2" style={{ fontSize: '12px', color: '#0d6efd' }}>
                                                {formatBdCompactKm(Number(row.revenue) || 0)}
                                            </td>
                                            <td className="text-end pe-2 fw-semibold" style={{ fontSize: '12px', color: '#0f766e' }}>
                                                {formatBdCompactKm(Number(row.gpValue) || 0)}
                                            </td>
                                            <td className="text-end pe-3 fw-semibold" style={{ fontSize: '12px', color: '#198754' }}>
                                                {(Number(row.gpPct) || 0).toLocaleString('en-US', {
                                                    minimumFractionDigits: 1,
                                                    maximumFractionDigits: 2,
                                                })}
                                                %
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            </div>
        </div >
    );
};

export default SalesTarget;

