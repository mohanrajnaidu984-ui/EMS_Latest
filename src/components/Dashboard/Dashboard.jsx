import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Draggable from 'react-draggable';
import { useData } from '../../context/DataContext'; // Reuse for masters if needed
import { useAuth } from '../../context/AuthContext';
import DashboardFilters from './LeftPanel/DashboardFilters';
import CalendarView from './LeftPanel/CalendarView';
import CalendarBarChart from './LeftPanel/CalendarBarChart';
import LastTenMonthsOverview from './RightPanel/LastTenMonthsOverview';
import EnquiryResultsTable from '../Enquiry/EnquiryResultsTable';
import DashboardQuoteSummaryTable from './DashboardQuoteSummaryTable';
import { attachCanEditFlag } from '../../utils/enquiryResultsHelpers';
import { sortEnquiryRows } from '../../utils/enquiryResultsSort';
import {
    resolveEffectiveSalesEngineerFilter,
    isAdminRole,
    isManagementDepartmentUser,
    isCcMailUser,
    getCcDepartmentNamesForUser,
    getRegularUserDashboardFilterDefaults,
    isDashboardCoordinatorUser,
} from '../../utils/dashboardCcAccess';
import './DashboardLayout.css';

function sumCalendarDaily(daily, key) {
    return (Array.isArray(daily) ? daily : []).reduce((acc, row) => acc + (Number(row[key]) || 0), 0);
}

/** Monthly overview totals always match sum of calendar day chips. */
function normalizeDashboardCalendarPayload(raw) {
    if (raw == null) return { daily: [], totals: null };
    const daily = Array.isArray(raw) ? raw : raw?.daily || [];
    const totals = {
        enquiries: sumCalendarDaily(daily, 'Enquiries'),
        due: sumCalendarDaily(daily, 'Due'),
        lapsed: sumCalendarDaily(daily, 'Lapsed'),
        newQuote: sumCalendarDaily(daily, 'NewQuote'),
        revQuote: sumCalendarDaily(daily, 'RevQuote'),
        quoted: sumCalendarDaily(daily, 'NewQuote') + sumCalendarDaily(daily, 'RevQuote'),
    };
    return { daily, totals };
}

const Dashboard = ({ onNavigate, onOpenEnquiry }) => { // Assuming these props passed from Main
    const { masters, dashboardRefreshCounter } = useData();
    const { currentUser } = useAuth();
    const dashboardModalDragRef = useRef(null);
    // Use relative path to leverage Vite proxy (targets port 5000), avoids port mismatch
    const API_URL = '/api/dashboard';

    // State
    const [dateState, setDateState] = useState(() => {
        const saved = localStorage.getItem('dashboard_dateState');
        const now = new Date();
        const mo = now.getMonth() + 1;
        const yr = now.getFullYear();
        if (saved) {
            try {
                const p = JSON.parse(saved);
                const legacyM = p.month ?? mo;
                const legacyY = p.year ?? yr;
                return {
                    leftCalendar: p.leftCalendar || { month: legacyM, year: legacyY },
                    rightCalendar: p.rightCalendar || { month: legacyM, year: legacyY },
                    selectedDate: p.selectedDate ?? null,
                    selectedType: p.selectedType ?? 'all',
                };
            } catch (e) {
                console.error("Failed to parse dashboard_dateState", e);
            }
        }
        return {
            leftCalendar: { month: mo, year: yr },
            rightCalendar: { month: mo, year: yr },
            selectedDate: null,
            selectedType: 'all',
        };
    });

    /** True when filters were loaded from localStorage on first mount (don’t clobber with role defaults). */
    const filtersHydratedFromStorageRef = useRef(false);
    /** Apply CC / SE role defaults only once when no saved filters (masters may refresh). */
    const dashboardRoleDefaultsAppliedRef = useRef(false);
    /** Admin / Management: coordinator defaults (All divisions + All SEs) once per login session. */
    const coordinatorDefaultsAppliedRef = useRef(false);

    const [filters, setFilters] = useState(() => {
        const saved = localStorage.getItem('dashboard_filters');
        if (saved) {
            try {
                filtersHydratedFromStorageRef.current = true;
                return JSON.parse(saved);
            } catch (e) {
                console.error("Failed to parse dashboard_filters", e);
            }
        }
        return {
            division: 'All',
            salesEngineer: 'All',
            mode: 'future',
            dateType: 'Enquiry Date',
            status: 'All',
            search: ''
        };
    });

    // -- Persistence --
    useEffect(() => {
        localStorage.setItem('dashboard_dateState', JSON.stringify(dateState));
    }, [dateState]);

    useEffect(() => {
        localStorage.setItem('dashboard_filters', JSON.stringify(filters));
    }, [filters]);

    const [data, setData] = useState({
        calendarLeft: [],
        calendarTotalsLeft: null,
        historyMonths: [],
        historyYearTotals: null,
        summary: {},
        table: [],
    });

    const [filteredTableData, setFilteredTableData] = useState([]);

    const [loading, setLoading] = useState(false);
    /** Modal enquiry grid only — opening the modal no longer refetches calendars. */
    const [modalEnquiryListLoading, setModalEnquiryListLoading] = useState(false);

    const [resultsModalOpen, setResultsModalOpen] = useState(false);
    const [modalSortConfig, setModalSortConfig] = useState({ key: 'EnquiryDate', direction: 'desc' });
    const [quoteSummaryRows, setQuoteSummaryRows] = useState([]);
    /** Same as GET /calendar quoted total (EnquiryQuotes row count); not UI lead-line sum. */
    const [quoteSummaryCalendarQuotedCount, setQuoteSummaryCalendarQuotedCount] = useState(null);
    const [quoteSummaryLoading, setQuoteSummaryLoading] = useState(false);

    const showDashboardQuoteSummaryTable = useMemo(() => {
        if (!resultsModalOpen) return false;
        if (dateState.selectedType === 'quote' || dateState.selectedType === 'newQuote' || dateState.selectedType === 'revQuote') return true;
        if (filters.dateType === 'Quote Date' && !dateState.selectedDate) return true;
        return false;
    }, [resultsModalOpen, dateState.selectedType, dateState.selectedDate, filters.dateType]);

    /** Quote summary header totals: count only lines whose QuoteDate falls in this window (day chip or monthly Quote Date). */
    const quoteSummaryDateScope = useMemo(() => {
        if (!showDashboardQuoteSummaryTable) return null;
        const chip = String(dateState.selectedType || '').trim().toLowerCase();
        let revisionKind = null;
        if (chip === 'newquote') revisionKind = 'new';
        else if (chip === 'revquote') revisionKind = 'rev';

        const day = String(dateState.selectedDate || '').trim();
        if (day) return revisionKind ? { day, revisionKind } : { day };
        const dt = (filters.dateType || '').toString();
        if ((dt === 'Quote Date' || dt === 'Quote date') && filters.fromDate && filters.toDate) {
            const scope = {
                from: String(filters.fromDate).trim(),
                to: String(filters.toDate).trim(),
            };
            if (revisionKind) scope.revisionKind = revisionKind;
            return scope;
        }
        return null;
    }, [
        showDashboardQuoteSummaryTable,
        dateState.selectedDate,
        dateState.selectedType,
        filters.dateType,
        filters.fromDate,
        filters.toDate,
    ]);

    const modalTableRows = useMemo(() => {
        const normalized = (filteredTableData || []).map((r) => ({
            ...r,
            DueOn: r.DueOn ?? r.DueDate,
            EnquiryDetails: r.EnquiryDetails ?? r.DetailsOfEnquiry,
            SourceOfInfo: r.SourceOfInfo ?? r.SourceOfEnquiry ?? r.ReceivedFrom,
        }));
        return attachCanEditFlag(normalized, currentUser);
    }, [filteredTableData, currentUser]);

    const modalSortedRows = useMemo(
        () => sortEnquiryRows(modalTableRows, modalSortConfig, { users: masters?.users }),
        [modalTableRows, modalSortConfig, masters?.users]
    );

    /** Sum of scoped quote rows in the modal list when filtering by Quote Date — only after the Quoted calendar chip (not Enquiry/Due/Lapsed/Visit). */
    const dashboardModalHeaderQuotedTotal = useMemo(() => {
        if (!resultsModalOpen || showDashboardQuoteSummaryTable) return undefined;
        if (!['quote', 'newQuote', 'revQuote'].includes(dateState.selectedType)) return undefined;
        const dt = (filters.dateType || '').toString();
        if (dt !== 'Quote Date' && dt !== 'Quote date') return undefined;
        return modalSortedRows.reduce(
            (s, r) => s + (Number.isFinite(Number(r.ScopedQuotesCount)) ? Number(r.ScopedQuotesCount) : 0),
            0,
        );
    }, [resultsModalOpen, showDashboardQuoteSummaryTable, dateState.selectedType, filters.dateType, modalSortedRows]);

    const handleModalSort = (key) => {
        let direction = 'asc';
        if (modalSortConfig.key === key && modalSortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setModalSortConfig({ key, direction });
    };

    const handleModalRowOpen = (reqNo) => {
        setResultsModalOpen(false);
        if (onOpenEnquiry) onOpenEnquiry(reqNo);
    };

    useEffect(() => {
        if (!showDashboardQuoteSummaryTable || !currentUser) {
            setQuoteSummaryRows([]);
            setQuoteSummaryCalendarQuotedCount(null);
            setQuoteSummaryLoading(false);
            return undefined;
        }
        const ac = new AbortController();
        (async () => {
            setQuoteSummaryLoading(true);
            try {
                const salesEngineerForApi = resolveEffectiveSalesEngineerFilter({
                    salesEngineer: filters.salesEngineer,
                    division: filters.division,
                    enqItems: masters.enqItems,
                    users: masters.users,
                    currentUserEmail: currentUser?.email || currentUser?.EmailId || '',
                    currentUser,
                });
                const listParams = new URLSearchParams({
                    division: filters.division,
                    salesEngineer: salesEngineerForApi,
                    mode: filters.mode,
                    userEmail: currentUser.email || currentUser.EmailId || '',
                    userName: currentUser.name || '',
                    userRole: currentUser.role || currentUser.Roles || 'User',
                });
                if (dateState.selectedDate) {
                    listParams.set('date', dateState.selectedDate);
                } else {
                    if (filters.fromDate) listParams.set('fromDate', filters.fromDate);
                    if (filters.toDate) listParams.set('toDate', filters.toDate);
                    if (filters.dateType === 'Lapsed') {
                        listParams.set('dateType', 'Due Date');
                        listParams.set('status', 'Lapsed');
                    } else {
                        listParams.set('dateType', filters.dateType);
                        if (filters.status && filters.status !== 'All') listParams.set('status', filters.status);
                    }
                    if (filters.search) listParams.set('search', filters.search);
                }
                const chip = String(dateState.selectedType || '').trim().toLowerCase();
                if (['quote', 'newquote', 'revquote'].includes(chip)) {
                    listParams.set('calendarChip', chip);
                }
                const res = await fetch(`${API_URL}/quote-summary-rows?${listParams}`, {
                    signal: ac.signal,
                    cache: 'no-store',
                });
                const data = res.ok ? await res.json() : null;
                if (!ac.signal.aborted) {
                    if (Array.isArray(data)) {
                        setQuoteSummaryRows(data);
                        setQuoteSummaryCalendarQuotedCount(null);
                    } else {
                        setQuoteSummaryRows(Array.isArray(data?.rows) ? data.rows : []);
                        setQuoteSummaryCalendarQuotedCount(
                            typeof data?.calendarQuotedCount === 'number' ? data.calendarQuotedCount : null,
                        );
                    }
                }
            } catch (e) {
                if (e?.name !== 'AbortError') console.error('Dashboard quote-summary fetch:', e);
                if (!ac.signal.aborted) {
                    setQuoteSummaryRows([]);
                    setQuoteSummaryCalendarQuotedCount(null);
                }
            } finally {
                if (!ac.signal.aborted) setQuoteSummaryLoading(false);
            }
        })();
        return () => ac.abort();
    }, [
        showDashboardQuoteSummaryTable,
        currentUser,
        filters.division,
        filters.salesEngineer,
        filters.fromDate,
        filters.toDate,
        filters.dateType,
        filters.mode,
        filters.status,
        filters.search,
        dateState.selectedDate,
        dateState.selectedType,
        masters.enqItems,
        masters.users,
        dashboardRefreshCounter,
    ]);

    useEffect(() => {
        if (currentUser && masters.enquiryFor && masters.enqItems) {
            if (!filtersHydratedFromStorageRef.current) {
                if (dashboardRoleDefaultsAppliedRef.current) return;
                dashboardRoleDefaultsAppliedRef.current = true;

                const userEmail = (currentUser.email || currentUser.EmailId || '').trim().toLowerCase();
                const isAdmin = isAdminRole(currentUser);
                const isManagement = isManagementDepartmentUser(currentUser);
                const isCCUser = isCcMailUser(userEmail, masters.enqItems);
                const ccDepts = getCcDepartmentNamesForUser(userEmail, masters.enqItems);
                const ccDepartmentName = ccDepts[0] || '';

                if (isAdmin || isManagement) {
                    setFilters((prev) => ({
                        ...prev,
                        division: 'All',
                        salesEngineer: 'All',
                    }));
                } else if (isCCUser) {
                    setFilters((prev) => ({
                        ...prev,
                        division: ccDepartmentName || 'All',
                        salesEngineer: 'All',
                    }));
                } else {
                    const locked = getRegularUserDashboardFilterDefaults(currentUser, masters.users);
                    setFilters((prev) => ({
                        ...prev,
                        division: locked.division || prev.division,
                        salesEngineer: locked.salesEngineer || prev.salesEngineer,
                    }));
                }
            }
        }
    }, [currentUser, masters.enqItems, masters.enquiryFor, masters.users]);

    /** Non-coordinator SE: always lock division + name (overrides stale localStorage). */
    useEffect(() => {
        if (!currentUser || !masters?.users?.length) return;
        if (isDashboardCoordinatorUser(currentUser, masters.enqItems)) return;

        const locked = getRegularUserDashboardFilterDefaults(currentUser, masters.users);
        if (!locked.division && !locked.salesEngineer) return;

        setFilters((prev) => {
            const nextDivision = locked.division || prev.division;
            const nextSe = locked.salesEngineer || prev.salesEngineer;
            if (prev.division === nextDivision && prev.salesEngineer === nextSe) return prev;
            return { ...prev, division: nextDivision, salesEngineer: nextSe };
        });
    }, [currentUser, masters.enqItems, masters.users]);

    useEffect(() => {
        if (!currentUser) return;
        if (coordinatorDefaultsAppliedRef.current) return;
        if (!isAdminRole(currentUser) && !isManagementDepartmentUser(currentUser)) return;
        coordinatorDefaultsAppliedRef.current = true;
        setFilters((prev) => ({
            ...prev,
            division: 'All',
            salesEngineer: 'All',
        }));
    }, [currentUser]);

    // Fetch calendars + summary (one paired calendar HTTP + merged SQL per month on server).
    const fetchCalendarSummary = useCallback(
        async (signal) => {
            if (!currentUser) return;
            setLoading(true);
            try {
                const salesEngineerForApi = resolveEffectiveSalesEngineerFilter({
                    salesEngineer: filters.salesEngineer,
                    division: filters.division,
                    enqItems: masters.enqItems,
                    users: masters.users,
                    currentUserEmail: currentUser?.email || currentUser?.EmailId || '',
                    currentUser,
                });
                const baseParams = {
                    division: filters.division,
                    salesEngineer: salesEngineerForApi,
                    userEmail: currentUser.email || currentUser.EmailId || '',
                    userName: currentUser.name || '',
                    userRole: currentUser.role || currentUser.Roles || 'User',
                };

                const todayParam = (() => {
                    const d = new Date();
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    return `${y}-${m}-${day}`;
                })();

                const sumParams = new URLSearchParams({ ...baseParams, today: todayParam });

                const calLeftParams = new URLSearchParams({
                    ...baseParams,
                    month: dateState.leftCalendar.month,
                    year: dateState.leftCalendar.year,
                    today: todayParam,
                });
                const historyParams = new URLSearchParams({
                    ...baseParams,
                    anchorMonth: dateState.leftCalendar.month,
                    anchorYear: dateState.leftCalendar.year,
                    count: '12',
                    futureCount: '2',
                    today: todayParam,
                });

                const fetchOpts = signal ? { signal, cache: 'no-store' } : { cache: 'no-store' };

                const leftPromise = fetch(`${API_URL}/calendar?${calLeftParams}`, fetchOpts).then(async (r) =>
                    r.ok ? r.json() : null,
                );
                const historyPromise = fetch(`${API_URL}/calendars-history?${historyParams}`, fetchOpts).then(
                    async (r) => (r.ok ? r.json() : null),
                );
                const sumPromise = fetch(`${API_URL}/summary?${sumParams}`, fetchOpts).then((r) => (r.ok ? r.json() : {}));

                const [leftRaw, historyRaw, sumParsed] = await Promise.all([
                    leftPromise,
                    historyPromise,
                    sumPromise,
                ]);

                const leftCal = normalizeDashboardCalendarPayload(leftRaw);
                const historyMonths = Array.isArray(historyRaw?.months)
                    ? historyRaw.months.map((row) => ({
                          month: row.month,
                          year: row.year,
                          ...normalizeDashboardCalendarPayload(row),
                      }))
                    : [];
                const historyYearTotals =
                    historyRaw?.yearTotals && typeof historyRaw.yearTotals === 'object'
                        ? historyRaw.yearTotals
                        : null;

                if (signal?.aborted) return;

                setData((prev) => ({
                    ...prev,
                    calendarLeft: leftCal.daily,
                    calendarTotalsLeft: leftCal.totals,
                    historyMonths,
                    historyYearTotals,
                    summary: sumParsed || {},
                }));
            } catch (err) {
                if (err?.name === 'AbortError') return;
                console.error('Dashboard calendar fetch error:', err);
                setData((prev) => ({
                    ...prev,
                    calendarLeft: [],
                    calendarTotalsLeft: null,
                    historyMonths: [],
                    historyYearTotals: null,
                    summary: {},
                }));
            } finally {
                if (!signal?.aborted) setLoading(false);
            }
        },
        [
            currentUser,
            filters.division,
            filters.salesEngineer,
            dateState.leftCalendar.month,
            dateState.leftCalendar.year,
            masters.enqItems,
            masters.users,
            dashboardRefreshCounter,
        ],
    );

    const fetchModalEnquiries = useCallback(
        async (signal) => {
            if (!currentUser) return;
            setModalEnquiryListLoading(true);
            try {
                const salesEngineerForApi = resolveEffectiveSalesEngineerFilter({
                    salesEngineer: filters.salesEngineer,
                    division: filters.division,
                    enqItems: masters.enqItems,
                    users: masters.users,
                    currentUserEmail: currentUser?.email || currentUser?.EmailId || '',
                    currentUser,
                });
                const todayParam = (() => {
                    const d = new Date();
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    return `${y}-${m}-${day}`;
                })();

                const listParams = new URLSearchParams({
                    division: filters.division,
                    salesEngineer: salesEngineerForApi,
                    mode: filters.mode,
                    userEmail: currentUser.email || currentUser.EmailId || '',
                    userName: currentUser.name || '',
                    userRole: currentUser.role || currentUser.Roles || 'User',
                    today: todayParam,
                });

                if (dateState.selectedDate) {
                    listParams.set('date', dateState.selectedDate);
                    const chip = String(dateState.selectedType || '').trim().toLowerCase();
                    if (chip && chip !== 'all') {
                        listParams.set('calendarChip', chip);
                    }
                } else {
                    if (filters.fromDate) listParams.set('fromDate', filters.fromDate);
                    if (filters.toDate) listParams.set('toDate', filters.toDate);

                    if (filters.dateType === 'Lapsed') {
                        listParams.set('dateType', 'Due Date');
                        listParams.set('status', 'Lapsed');
                    } else {
                        listParams.set('dateType', filters.dateType);
                        if (filters.status && filters.status !== 'All') listParams.set('status', filters.status);
                    }

                    if (filters.search) listParams.set('search', filters.search);
                }

                const fetchOpts = signal ? { signal, cache: 'no-store' } : { cache: 'no-store' };
                const listRes = await fetch(`${API_URL}/enquiries?${listParams}`, fetchOpts);

                let listData = [];
                if (!listRes.ok) {
                    console.error('Enquiry API Failed:', listRes.status, listRes.statusText);
                } else {
                    const raw = await listRes.json();
                    listData = Array.isArray(raw) ? raw : [];
                }

                if (signal?.aborted) return;
                setData((prev) => ({ ...prev, table: listData }));
            } catch (err) {
                if (err?.name === 'AbortError') return;
                console.error('Dashboard modal enquiries fetch error:', err);
                if (!signal?.aborted) setData((prev) => ({ ...prev, table: [] }));
            } finally {
                if (!signal?.aborted) setModalEnquiryListLoading(false);
            }
        },
        [
            currentUser,
            filters.division,
            filters.salesEngineer,
            filters.mode,
            filters.fromDate,
            filters.toDate,
            filters.dateType,
            filters.search,
            filters.status,
            dateState.selectedDate,
            dateState.selectedType,
            masters.enqItems,
            masters.users,
            dashboardRefreshCounter,
        ],
    );

    // Filter Table Data based on selectedType (Frontend Filtering)
    useEffect(() => {
        if (!dateState.selectedDate || dateState.selectedType === 'all') {
            setFilteredTableData(data.table);
            return;
        }

        const type = dateState.selectedType;
        const targetDate = dateState.selectedDate; // Already YYYY-MM-DD from CalendarView

        if (!Array.isArray(data.table)) {
            console.error("Data Table is not an array:", data.table);
            setFilteredTableData([]);
            return;
        }

        /** Match calendar day using local date (API UTC midnight caused UTC ISO compare to drop every row). */
        const localYmd = (dateVal) => {
            if (!dateVal) return null;
            const d = new Date(dateVal);
            if (Number.isNaN(d.getTime())) return null;
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };

        const dueVal = (row) => row.DueDate ?? row.DueOn;

        /** YYYY-MM-DD for "today" in local timezone (matches calendar cell dates). */
        const todayLocalYmd = () => {
            const d = new Date();
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };
        // Due/Lapsed: with a division selected, only that division's quote blocks the row
        // (HasQuoteInScope). HasQuoteAny wrongly hid cross-division cases (e.g. BMS lapsed
        // while HVAC already quoted). With All divisions, any quote still blocks.
        const divisionSelected =
            String(filters.division || '').trim() !== '' &&
            String(filters.division).trim().toLowerCase() !== 'all';

        const filtered = data.table.filter((row) => {
            const compareDate = (dateVal) => localYmd(dateVal) === targetDate;
            const todayYmd = todayLocalYmd();
            const hasBlockingQuote = divisionSelected
                ? Number(row.HasQuoteInScope) === 1
                : Number(row.HasQuoteAny ?? row.HasQuoteInScope) === 1;

            if (type === 'enquiry') return compareDate(row.EnquiryDate);
            if (type === 'due') {
                if (!compareDate(dueVal(row))) return false;
                const dueY = localYmd(dueVal(row));
                if (!dueY || dueY < todayYmd) return false;
                if (hasBlockingQuote) return false;
                return true;
            }
            if (type === 'visit') return compareDate(row.SiteVisitDate);
            if (type === 'lapsed') {
                if (!compareDate(dueVal(row))) return false;
                const dueY = localYmd(dueVal(row));
                if (!dueY || dueY >= todayYmd) return false;
                if (hasBlockingQuote) return false;
                return true;
            }
            if (type === 'quote' || type === 'newQuote' || type === 'revQuote') {
                return compareDate(row.QuoteDate);
            }
            return true;
        });

        setFilteredTableData(filtered);
    }, [data.table, dateState.selectedDate, dateState.selectedType, filters.division]);

    useEffect(() => {
        if (!resultsModalOpen) return undefined;
        const onKeyDown = (e) => {
            if (e.key !== 'Escape') return;
            e.preventDefault();
            setResultsModalOpen(false);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [resultsModalOpen]);

    // Effects
    useEffect(() => {
        // Clear specific date selection when global filters change (Dropdowns, Buttons, Search)
        // This resolves the issue where clicking "This Month" wouldn't override a selected calendar date.
        if (dateState.selectedDate) {
            setDateState(prev => ({ ...prev, selectedDate: null, selectedType: 'all' }));
        }
    }, [filters]);

    useEffect(() => {
        const ac = new AbortController();
        const timer = setTimeout(() => {
            fetchCalendarSummary(ac.signal);
        }, 50);
        return () => {
            clearTimeout(timer);
            ac.abort();
        };
    }, [fetchCalendarSummary]);

    useEffect(() => {
        if (!resultsModalOpen) {
            setData((prev) => ({ ...prev, table: [] }));
            setFilteredTableData([]);
            setModalEnquiryListLoading(false);
            return undefined;
        }
        const ac = new AbortController();
        fetchModalEnquiries(ac.signal);
        return () => {
            ac.abort();
        };
    }, [resultsModalOpen, fetchModalEnquiries]);

    // Handlers
    const handleLeftCalendarMonthChange = (m, y) => {
        setDateState((prev) => ({ ...prev, leftCalendar: { month: m, year: y } }));
    };

    const handleDateClick = (dateStr, type = 'all') => {
        setDateState(prev => ({
            ...prev,
            selectedDate: dateStr,
            selectedType: type
        }));
        setResultsModalOpen(true);
    };

    const handleMonthBarClick = (type, month, year) => {
        const m = month;
        const y = year;
        const start = new Date(y, m - 1, 1);
        const end = new Date(y, m, 0);

        const toLocalYMD = (d) => {
            const yr = d.getFullYear();
            const mo = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${yr}-${mo}-${day}`;
        };

        const fromDate = toLocalYMD(start);
        const toDate = toLocalYMD(end);

        const newFilters = {
            fromDate,
            toDate,
            mode: 'range',
            search: '',
            date: null // Clear specific date
        };

        if (type === 'enquiry') {
            newFilters.status = 'All';
            newFilters.dateType = 'Enquiry Date';
        } else if (type === 'due') {
            newFilters.status = 'All';
            newFilters.dateType = 'Due Date';
        } else if (type === 'lapsed') {
            newFilters.status = 'All'; // Handled by dateType logic in fetchData
            newFilters.dateType = 'Lapsed';
        } else if (type === 'quote' || type === 'newQuote' || type === 'revQuote') {
            newFilters.status = 'All';
            newFilters.dateType = 'Quote Date';
        }

        setDateState((prev) => ({
            ...prev,
            selectedDate: null,
            selectedType: type,
        }));
        setFilters(prev => ({ ...prev, ...newFilters }));
        setResultsModalOpen(true);
    };

    const handleBarClick = (type) => {
        handleMonthBarClick(type, dateState.leftCalendar.month, dateState.leftCalendar.year);
    };

    const handleYearBarClick = (type) => {
        const y = dateState.leftCalendar.year;
        const fromDate = `${y}-01-01`;
        const toDate = `${y}-12-31`;

        const newFilters = {
            fromDate,
            toDate,
            mode: 'range',
            search: '',
            date: null,
        };

        if (type === 'enquiry') {
            newFilters.status = 'All';
            newFilters.dateType = 'Enquiry Date';
        } else if (type === 'due') {
            newFilters.status = 'All';
            newFilters.dateType = 'Due Date';
        } else if (type === 'lapsed') {
            newFilters.status = 'All';
            newFilters.dateType = 'Lapsed';
        } else if (type === 'quote' || type === 'newQuote' || type === 'revQuote') {
            newFilters.status = 'All';
            newFilters.dateType = 'Quote Date';
        }

        setDateState((prev) => ({
            ...prev,
            selectedDate: null,
            selectedType: type,
        }));
        setFilters((prev) => ({ ...prev, ...newFilters }));
        setResultsModalOpen(true);
    };

    return (
        <div
            className="container-fluid dashboard-page-root"
            style={{ height: 'calc(100vh - 110px)', display: 'flex', flexDirection: 'column', padding: 0 }}
        >







            {/* Two equal calendar dashboards; enquiry list opens in a modal (Search Enquiry–style grid) */}
            <div className="flex-grow-1 d-flex flex-column" style={{ minHeight: 0 }}>
                <div
                    className={`dashboard-content-shell flex-grow-1 d-flex flex-column${loading ? ' dashboard-content-shell--loading' : ''}`}
                    aria-busy={loading}
                >
                    {loading ? (
                        <div className="dashboard-content-loading" aria-live="polite" aria-label="Loading dashboard">
                            <span
                                className="spinner-border text-primary dashboard-content-loading__spinner"
                                role="status"
                                aria-hidden="true"
                            />
                            <span className="dashboard-content-loading__text">Updating dashboard…</span>
                        </div>
                    ) : null}
                <div className="dashboard-split-container dashboard-calendars-row">
                    <div className="dashboard-half-panel">
                        <div className="px-3 py-2 dashboard-filter-bar-row dashboard-filter-bar-strip">
                            <DashboardFilters
                                filters={filters}
                                setFilters={setFilters}
                                masters={masters}
                                viewMode="division_se"
                            />
                        </div>
                        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                            <div className="dashboard-calendar-gutter d-flex flex-column flex-grow-1" style={{ minHeight: 0, overflow: 'hidden' }}>
                                <div className="dashboard-calendar-combined d-flex flex-column flex-grow-1">
                                    <CalendarBarChart
                                        data={data.calendarLeft}
                                        monthlyTotals={data.calendarTotalsLeft}
                                        onBarClick={handleBarClick}
                                    />
                                    <div className="d-flex flex-column flex-grow-1" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                                        <CalendarView
                                            month={dateState.leftCalendar.month}
                                            year={dateState.leftCalendar.year}
                                            onMonthChange={handleLeftCalendarMonthChange}
                                            data={data.calendarLeft}
                                            selectedDate={dateState.selectedDate}
                                            selectedType={dateState.selectedType}
                                            onDateClick={handleDateClick}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="dashboard-half-panel">
                        <div className="px-3 py-2 dashboard-filter-bar-row dashboard-filter-bar-strip">
                            <DashboardFilters
                                filters={filters}
                                setFilters={setFilters}
                                masters={masters}
                                viewMode="search_date"
                            />
                        </div>
                        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                            <div className="dashboard-calendar-gutter d-flex flex-column flex-grow-1" style={{ minHeight: 0, overflow: 'hidden' }}>
                                <div className="dashboard-calendar-combined d-flex flex-column flex-grow-1">
                                    <LastTenMonthsOverview
                                        months={data.historyMonths}
                                        yearTotals={data.historyYearTotals}
                                        anchorMonth={dateState.leftCalendar.month}
                                        anchorYear={dateState.leftCalendar.year}
                                        onBarClick={handleMonthBarClick}
                                        onYearBarClick={handleYearBarClick}
                                        loading={loading}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                </div>
            </div>

            {resultsModalOpen && (
                <div
                    className="modal show d-block"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="dashboard-enquiries-modal-title"
                    style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10050 }}
                    onClick={() => setResultsModalOpen(false)}
                >
                    <Draggable
                        nodeRef={dashboardModalDragRef}
                        handle=".dashboard-enquiries-modal-drag-handle"
                        cancel=".btn-close, .btn-close-white, button"
                        enableUserSelectHack={false}
                    >
                        <div
                            ref={dashboardModalDragRef}
                            className="modal-dialog modal-xl"
                            onClick={(e) => e.stopPropagation()}
                            style={{ maxWidth: 'min(96vw, 1320px)', margin: '2vh auto' }}
                        >
                        <div className="modal-content border-0 shadow-lg d-flex flex-column" style={{ maxHeight: '92vh' }}>
                            <div
                                className="modal-header text-white flex-shrink-0 border-0 align-items-center dashboard-enquiries-modal-header-compact"
                                style={{
                                    paddingTop: '0.25rem',
                                    paddingBottom: '0.25rem',
                                    paddingLeft: '0.5rem',
                                    paddingRight: '0.5rem',
                                    minHeight: 0,
                                    backgroundColor: '#4169e1',
                                }}
                            >
                                <div
                                    className="dashboard-enquiries-modal-drag-handle modal-title d-flex align-items-center mb-0 flex-grow-1"
                                    id="dashboard-enquiries-modal-title"
                                    style={{ cursor: 'grab', fontSize: '0.75rem', lineHeight: 1.2 }}
                                >
                                    <i className="bi bi-grip-vertical me-1 opacity-75" aria-hidden />
                                    <span className="visually-hidden">Enquiry results table</span>
                                    {loading ? (
                                        <span className="small fw-normal opacity-75">Loading…</span>
                                    ) : null}
                                </div>
                                <button
                                    type="button"
                                    className="btn-close btn-close-white"
                                    style={{ padding: '0.3rem', transform: 'scale(0.85)' }}
                                    aria-label="Close"
                                    onClick={() => setResultsModalOpen(false)}
                                />
                            </div>
                            {/* Avoid modal-dialog-scrollable + nested flex — it collapsed the table to zero height */}
                            <div
                                className="modal-body p-2 dashboard-enquiries-modal-body d-flex flex-column"
                                style={{
                                    overflow: 'hidden',
                                    maxHeight: 'calc(92vh - 32px)',
                                    minHeight: '260px',
                                }}
                            >
                                {showDashboardQuoteSummaryTable
                                    ? quoteSummaryLoading && quoteSummaryRows.length === 0 && (
                                          <div className="text-center text-muted py-3 small flex-shrink-0">Loading quote summary…</div>
                                      )
                                    : modalEnquiryListLoading &&
                                      modalSortedRows.length === 0 && (
                                          <div className="text-center text-muted py-3 small flex-shrink-0">Loading enquiries…</div>
                                      )}
                                {/* Table inner layout uses flex:1 + minHeight:0; needs a parent with real height or the scroll area collapses to blank */}
                                <div
                                    className="d-flex flex-column flex-grow-1"
                                    style={{ minHeight: 0, height: 'min(72vh, 780px)' }}
                                >
                                    {showDashboardQuoteSummaryTable ? (
                                        <DashboardQuoteSummaryTable
                                            rows={quoteSummaryRows}
                                            onOpenEnquiry={handleModalRowOpen}
                                            emptyLabel="No quoted enquiries for this selection."
                                            quoteDateScope={quoteSummaryDateScope}
                                            calendarAlignedQuoteTotal={quoteSummaryCalendarQuotedCount}
                                        />
                                    ) : (
                                        <EnquiryResultsTable
                                            sortedRows={modalSortedRows}
                                            sortConfig={modalSortConfig}
                                            onSort={handleModalSort}
                                            masters={masters}
                                            onRowOpen={handleModalRowOpen}
                                            emptyLabel="No enquiries for this selection."
                                            headerQuotedTotal={dashboardModalHeaderQuotedTotal}
                                            enableHeaderFilters
                                        />
                                    )}
                                </div>
                            </div>
                        </div>
                        </div>
                    </Draggable>
                </div>
            )}
        </div>
    );
};

export default Dashboard;
