import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import excelIcon from '../../assets/excel_icon.png';
import DateInput from './DateInput';
import { EMS_LIST_SEARCH_ENABLED_STYLE, EMS_LIST_CLEAR_STYLE } from '../../constants/emsSearchButtons';
import { getLeadJobDisplayLines, formatLeadJobLinesPlain } from '../../utils/leadJobDisplayLines';
import { sortEnquiryRows } from '../../utils/enquiryResultsSort';
import {
    formatEnquiryResultDate,
    formatEnquiryCreatedDateTime,
    getCustomerDisplayLines,
    getConsultantDisplayLines,
    getEnquiryTypeDisplay,
    getEnquiryDetailsDisplay,
    getCreatedByDivision,
} from '../../utils/enquiryResultsHelpers';
import EnquiryResultsTable from './EnquiryResultsTable';

const SearchEnquiry = ({ onOpen }) => {
    const { enquiries, masters, refreshEnquiries, enquiriesRefreshing } = useData();
    const { currentUser } = useAuth();

    // Search filters
    const [searchQuery, setSearchQuery] = useState(() => localStorage.getItem('enquiry_searchQuery') || '');
    const [dateFrom, setDateFrom] = useState(() => localStorage.getItem('enquiry_searchDateFrom') || '');
    const [dateTo, setDateTo] = useState(() => localStorage.getItem('enquiry_searchDateTo') || '');

    // -- Persistence --
    useEffect(() => {
        localStorage.setItem('enquiry_searchQuery', searchQuery);
    }, [searchQuery]);
    useEffect(() => {
        if (dateFrom) localStorage.setItem('enquiry_searchDateFrom', dateFrom);
        else localStorage.removeItem('enquiry_searchDateFrom');
    }, [dateFrom]);
    useEffect(() => {
        if (dateTo) localStorage.setItem('enquiry_searchDateTo', dateTo);
        else localStorage.removeItem('enquiry_searchDateTo');
    }, [dateTo]);

    const [resetKey, setResetKey] = useState(0);

    const [results, setResults] = useState([]);
    const [displayRows, setDisplayRows] = useState([]);
    const [filteredEnquiries, setFilteredEnquiries] = useState([]);
    const searchInputRef = useRef(null);
    /** After Clear, keep the table empty until the user runs a search again (text and/or both dates). */
    const resultsLockedEmptyRef = useRef(false);

    const currentUserName = (currentUser?.name || '').trim().toLowerCase();

    // Sort helper
    const sortEnquiries = (list) => {
        return [...list].sort((a, b) => {
            const dateA = new Date(a.CreatedAt || a.EnquiryDate);
            const dateB = new Date(b.CreatedAt || b.EnquiryDate);
            if (dateB - dateA !== 0) return dateB - dateA;
            return (b.RequestNo || '').localeCompare(a.RequestNo || '');
        });
    };

    // Custom sorting for Due Date (Default): Today/Future (Asc) then Past (Desc)
    const getPrioritySortedList = (list) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const currentFuture = [];
        const past = [];

        list.forEach(item => {
            if (!item.DueOn) {
                past.push(item);
                return;
            }
            const due = new Date(item.DueOn);
            due.setHours(0, 0, 0, 0);
            if (due >= today) {
                currentFuture.push(item);
            } else {
                past.push(item);
            }
        });

        // Today/Future: Ascending
        currentFuture.sort((a, b) => new Date(a.DueOn) - new Date(b.DueOn));
        // Past: Descending
        past.sort((a, b) => {
            if (!a.DueOn && !b.DueOn) return 0;
            if (!a.DueOn) return 1;
            if (!b.DueOn) return -1;
            return new Date(b.DueOn) - new Date(a.DueOn);
        });

        return [...currentFuture, ...past];
    };

    const buildAllowedEnquiries = useCallback(
        (sourceMap) => {
            const isCreator = (enq) =>
                !!(enq.CreatedBy && enq.CreatedBy.trim().toLowerCase() === currentUserName);

            return Object.values(sourceMap || {}).map((enq) => ({
                ...enq,
                _canEdit: isCreator(enq),
            }));
        },
        [currentUserName]
    );

    // Search lists all enquiries; blue "Edit" icon only for the enquiry creator (others use view + limited edit in form).
    useEffect(() => {
        if (!currentUser) return;
        setFilteredEnquiries(buildAllowedEnquiries(enquiries));
    }, [enquiries, currentUser, buildAllowedEnquiries]);

    const [sortConfig, setSortConfig] = useState({ key: 'EnquiryDate', direction: 'desc' });

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedResults = React.useMemo(() => {
        if (sortConfig.key === 'Default') {
            return getPrioritySortedList(results);
        }
        return sortEnquiryRows(results, sortConfig, { users: masters?.users });
    }, [results, sortConfig, masters?.users]);

    const handleSearch = useCallback(
        (sourceList = filteredEnquiries) => {
        const q = String(searchQuery || '').trim();
        const hasDateRange = Boolean(dateFrom && dateTo);
        if (!q && !hasDateRange) {
            setResults([]);
            return;
        }

        let filtered = [...sourceList];

        // Enquiry date range — only when both From and To are set (inclusive, by calendar day)
        if (dateFrom && dateTo) {
            let from = new Date(dateFrom);
            let to = new Date(dateTo);
            if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
                /* ignore invalid */
            } else {
                if (from > to) {
                    const swap = from;
                    from = to;
                    to = swap;
                }
                from.setHours(0, 0, 0, 0);
                to.setHours(23, 59, 59, 999);
                filtered = filtered.filter((e) => {
                    const raw = e.EnquiryDate || e.CreatedAt;
                    if (!raw) return false;
                    const d = new Date(raw);
                    if (Number.isNaN(d.getTime())) return false;
                    return d >= from && d <= to;
                });
            }
        }

        // Search text filter
        if (q) {
            const lowerText = q.toLowerCase();
            filtered = filtered.filter(e =>
                e.RequestNo?.toLowerCase().includes(lowerText) ||
                e.CustomerName?.toLowerCase().includes(lowerText) ||
                (e.SelectedCustomers && e.SelectedCustomers.join(',').toLowerCase().includes(lowerText)) ||
                e.ClientName?.toLowerCase().includes(lowerText) ||
                (e.SelectedConsultants && e.SelectedConsultants.join(',').toLowerCase().includes(lowerText)) ||
                e.ConsultantName?.toLowerCase().includes(lowerText) ||
                e.ProjectName?.toLowerCase().includes(lowerText) ||
                (e.SelectedConcernedSEs && e.SelectedConcernedSEs.join(',').toLowerCase().includes(lowerText)) ||
                String(e.EnquiryDetails || e.DetailsOfEnquiry || '').toLowerCase().includes(lowerText) ||
                e.CreatedBy?.toLowerCase().includes(lowerText) ||
                getCreatedByDivision(e, masters?.users).toLowerCase().includes(lowerText)
            );
        }

        setResults(filtered);
    },
        [filteredEnquiries, searchQuery, dateFrom, dateTo, masters?.users]
    );

    const runSearch = useCallback(async () => {
        resultsLockedEmptyRef.current = false;
        try {
            const freshMap = await refreshEnquiries({ listScope: 'all' });
            const allowed = buildAllowedEnquiries(freshMap);
            setFilteredEnquiries(allowed);
            handleSearch(allowed);
        } catch (e) {
            console.warn('[SearchEnquiry] refresh enquiries', e);
            handleSearch();
        }
    }, [refreshEnquiries, buildAllowedEnquiries, handleSearch]);

    // Live search when text or date range changes (skipped while table is cleared until user filters again)
    useEffect(() => {
        if (resultsLockedEmptyRef.current) {
            const hasFilter = Boolean(String(searchQuery || '').trim()) || Boolean(dateFrom && dateTo);
            if (hasFilter) {
                resultsLockedEmptyRef.current = false;
                handleSearch();
            }
            return;
        }
        handleSearch();
    }, [handleSearch, searchQuery, dateFrom, dateTo]);

    const handleClear = () => {
        resultsLockedEmptyRef.current = true;
        setSearchQuery('');
        setDateFrom('');
        setDateTo('');
        setSortConfig({ key: 'EnquiryDate', direction: 'desc' });
        setResetKey((prev) => prev + 1);
        if (searchInputRef.current) {
            searchInputRef.current.value = '';
        }
        setResults([]);
    };

    const rowsForExport = displayRows.length > 0 ? displayRows : sortedResults;

    const handleExport = () => {
        const exportList = rowsForExport;
        if (exportList.length === 0) {
            alert("No data to export");
            return;
        }

        const headers = ["Enquiry No.", "Enquiry Date", "Project", "Divisions & SE/EE/TE/QS Involved", "Enquiry Details", "Customer Name / Contractor Name", "Due Date", "Site Visit Date", "Client", "Consultant Name", "Enquiry Type", "Source", "Status", "Created By", "Created division", "Created Datetime"];

        const csvContent = [
            headers.join(","),
            ...exportList.map(r => {
                const row = [
                    r.RequestNo,
                    formatEnquiryResultDate(r.EnquiryDate),
                    (r.ProjectName || ''),
                    formatLeadJobLinesPlain(getLeadJobDisplayLines(r, { users: masters.users })),
                    getEnquiryDetailsDisplay(r),
                    getCustomerDisplayLines(r).join('\n'),
                    formatEnquiryResultDate(r.DueOn ?? r.DueDate),
                    formatEnquiryResultDate(r.SiteVisitDate),
                    (r.ClientName || ''),
                    getConsultantDisplayLines(r).join('\n'),
                    getEnquiryTypeDisplay(r),
                    (r.SourceOfInfo || ''),
                    r.Status || 'Enquiry',
                    r.CreatedBy || '-',
                    getCreatedByDivision(r, masters?.users),
                    formatEnquiryCreatedDateTime(r.CreatedAt)
                ];
                return row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(",");
            })
        ].join("\n");

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", `Enquiry_Export_${new Date().toISOString().slice(0, 10)}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    return (
        <div
            style={{
                position: 'relative',
                zIndex: 100,
                boxSizing: 'border-box',
                height: 'calc(100vh - 132px)',
                maxHeight: 'calc(100vh - 132px)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                paddingLeft: 0,
                paddingRight: 0,
                marginLeft: 0,
                marginRight: 0,
                width: '100%'
            }}
        >
            {/* Sticky under compact app header (72px) so this bar stays visible while scrolling results */}
            <div
                style={{
                    position: 'relative',
                    top: 0,
                    zIndex: 10,
                    background: 'linear-gradient(180deg, #dce5f2 0%, #cfdced 55%, #c2d2e6 100%)',
                    borderTopLeftRadius: '18px',
                    borderTopRightRadius: '18px',
                    borderBottomLeftRadius: '10px',
                    borderBottomRightRadius: '10px',
                    overflow: 'hidden',
                    paddingTop: '6px',
                    paddingBottom: '6px',
                    paddingLeft: '8px',
                    paddingRight: '8px',
                    marginBottom: '6px',
                    marginLeft: 0,
                    marginRight: 0,
                    width: '100%',
                    border: 'none',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7), 0 2px 8px rgba(71, 85, 105, 0.12)',
                }}
            >
            <div
                className="d-flex align-items-center flex-wrap gap-2"
                style={{
                    position: 'relative',
                    zIndex: 1000,
                    pointerEvents: 'auto',
                    rowGap: '8px',
                }}
            >
                <div className="d-flex align-items-center flex-wrap gap-2" style={{ fontSize: '12px', color: '#374151' }}>
                    <span className="text-nowrap fw-semibold">From</span>
                    <div style={{ width: '132px' }}>
                        <DateInput
                            value={dateFrom}
                            onChange={(e) => {
                                const nextFrom = e.target.value;
                                setDateFrom(nextFrom);
                                if (nextFrom && !dateTo) {
                                    const today = new Date();
                                    const yyyy = today.getFullYear();
                                    const mm = String(today.getMonth() + 1).padStart(2, '0');
                                    const dd = String(today.getDate()).padStart(2, '0');
                                    setDateTo(`${yyyy}-${mm}-${dd}`);
                                }
                            }}
                            placeholder="DD-MMM-YYYY"
                            style={{ fontSize: '11.5px', padding: '4px 7px', height: '30px' }}
                        />
                    </div>
                    <span className="text-nowrap fw-semibold">To</span>
                    <div style={{ width: '132px' }}>
                        <DateInput
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            placeholder="DD-MMM-YYYY"
                            style={{ fontSize: '11.5px', padding: '4px 7px', height: '30px' }}
                        />
                    </div>
                </div>

                {/* Search Text */}
                <div style={{ flex: '1 1 220px', minWidth: '180px', maxWidth: '480px' }} key={`search-${resetKey}`}>
                    <input
                        id="globalSearchInput"
                        ref={searchInputRef}
                        name={`search_field_${resetKey}`}
                        type="text"
                        className="form-control"
                        autoComplete="off"
                        placeholder="Search anything..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                void runSearch();
                            }
                        }}
                        style={{ fontSize: '11.5px', borderRadius: '8px', border: '1px solid #9ec7da', height: '30px' }}
                    />
                </div>

                {/* Buttons Group */}
                <button
                    type="button"
                    className="search-btn-hover"
                    onClick={() => void runSearch()}
                    disabled={enquiriesRefreshing}
                    style={{
                        ...EMS_LIST_SEARCH_ENABLED_STYLE,
                        fontSize: '12px',
                        borderRadius: '8px',
                        fontWeight: '600',
                        height: '30px',
                        minWidth: '64px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1001,
                        pointerEvents: 'auto',
                        cursor: enquiriesRefreshing ? 'not-allowed' : 'pointer',
                        opacity: enquiriesRefreshing ? 0.7 : 1,
                    }}
                >
                    {enquiriesRefreshing ? 'Searching…' : 'Search'}
                </button>
                <button
                    type="button"
                    className="clear-btn-hover"
                    onClick={handleClear}
                    style={{
                        ...EMS_LIST_CLEAR_STYLE,
                        fontSize: '12px',
                        borderRadius: '8px',
                        fontWeight: '600',
                        height: '30px',
                        minWidth: '64px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1001,
                        pointerEvents: 'auto',
                        cursor: 'pointer',
                    }}
                >
                    Clear
                </button>
                <button
                    type="button"
                    className="btn p-0 ms-2"
                    onClick={handleExport}
                    title="Export to Excel"
                    style={{
                        border: 'none',
                        background: 'transparent',
                        color: '#198754', // Bootstrap success color
                        zIndex: 1001,
                        pointerEvents: 'auto',
                        transition: 'transform 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                    <img src={excelIcon} alt="Export to Excel" style={{ height: '20px', width: 'auto' }} />
                </button>
            </div>
            </div>

            <style>
                {`
                .search-btn-hover:hover {
                    filter: brightness(1.06);
                    box-shadow: 0 4px 14px rgba(32, 63, 117, 0.38), inset 0 1px 0 rgba(255,255,255,0.18);
                    transform: translateY(-1px);
                }
                .clear-btn-hover:hover {
                    background-color: #8899aa !important;
                    color: #111827 !important;
                    border-color: #7c8694 !important;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
                }
                .search-btn-hover:active, .clear-btn-hover:active {
                    transform: scale(0.98);
                }
                `}
            </style>

            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <EnquiryResultsTable
                    key={`enquiry-results-${resetKey}`}
                    sortedRows={sortedResults}
                    sortConfig={sortConfig}
                    onSort={handleSort}
                    masters={masters}
                    onRowOpen={onOpen}
                    enableHeaderFilters
                    onDisplayRowsChange={setDisplayRows}
                />
            </div>
        </div>
    );
};

export default SearchEnquiry;
