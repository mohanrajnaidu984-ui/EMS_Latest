import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import DashboardQuoteSummaryTable, { getQuoteListRowKey } from '../Dashboard/DashboardQuoteSummaryTable';
import DateInput from '../Enquiry/DateInput';
import QuoteForm from './QuoteForm';
import { QUOTE_TAB_B2B } from '../../utils/quoteNav';
import {
    EMS_LIST_SEARCH_ENABLED_STYLE,
    EMS_LIST_SEARCH_DISABLED_STYLE,
    EMS_LIST_CLEAR_STYLE,
} from '../../constants/emsSearchButtons';
import { EMS_PENDING_APPROVALS_CHANGED } from '../../constants/approvalEvents';

const API_BASE = String(import.meta.env?.VITE_API_BASE ?? '').replace(/\/+$/, '');

/** Approvals list column — 30% narrower than the original 624px cap (≈437px). */
const APPROVAL_LIST_PANEL_DEFAULT_WIDTH = Math.round(624 * 0.7);
const APPROVAL_LIST_PANEL_MIN_WIDTH = 220;
const APPROVAL_LIST_PANEL_MAX_WIDTH = 680;

const LIST_TAB = {
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    SEARCH: 'search',
};

const APPROVAL_FILTERS_SESSION_KEY = 'ems_approvalListFilters';

function loadApprovalFilters(userEmail) {
    const email = String(userEmail || '').trim();
    if (!email) return null;
    try {
        const raw = sessionStorage.getItem(APPROVAL_FILTERS_SESSION_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (String(parsed?.userEmail || '').trim() !== email) return null;
        return parsed;
    } catch {
        return null;
    }
}

function saveApprovalFilters(userEmail, filters) {
    const email = String(userEmail || '').trim();
    if (!email) return;
    try {
        sessionStorage.setItem(
            APPROVAL_FILTERS_SESSION_KEY,
            JSON.stringify({ userEmail: email, ...filters })
        );
    } catch {
        /* quota / private mode */
    }
}

function clearApprovalFilters(userEmail) {
    const email = String(userEmail || '').trim();
    if (!email) return;
    try {
        const existing = loadApprovalFilters(email);
        sessionStorage.setItem(
            APPROVAL_FILTERS_SESSION_KEY,
            JSON.stringify({
                userEmail: email,
                listTab: LIST_TAB.PENDING,
                division: existing?.division || '',
                searchCriteria: '',
                dateFrom: '',
                dateTo: '',
                listPanelWidth: existing?.listPanelWidth,
            })
        );
    } catch {
        /* ignore */
    }
}

function formatQuoteLineDate(raw) {
    if (!raw) return '';
    try {
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return '';
        return format(d, 'dd-MMM-yyyy');
    } catch {
        return '';
    }
}

function mapPendingApprovalToTableRow(row) {
    const ref = String(row.quoteNumber || row.quoteRef || '').trim();
    const cust = String(row.customerName || '').trim();
    const dateStr = formatQuoteLineDate(row.quoteDate);
    const textLine = ref
        ? `${cust || '—'} — ${ref}${dateStr ? ` (${dateStr})` : ''}`
        : cust || '—';
    const quoteId = row.quoteId || null;
    return {
        RequestNo: row.requestNo,
        ProjectName: row.projectName || '—',
        DueDate: row.dueDate,
        ConsultantName: row.consultantName,
        ListQuoteDetailLines: [{ textLine }],
        ListQuoteRef: ref,
        ListQuoteDate: row.quoteDate,
        ListQuoteDetailToName: cust,
        ListWorkflowNo: String(row.workflowNo || '').trim(),
        ListApprovalStatus: String(row.approvalStatus || '').trim(),
        ListReasonForRevision: String(row.reasonForRevision || '').trim(),
        ListPendingPvId: quoteId ? String(quoteId) : '',
        QuoteListKind: ref || (quoteId ? `q-${quoteId}` : ''),
        _approvalSelection: {
            quoteId,
            quoteNumber: row.quoteNumber || ref,
            requestNo: row.requestNo,
            customerName: cust,
            leadJobName: row.leadJobName,
            ownJob: row.ownJob,
            projectName: row.projectName,
            revisionNo: row.revisionNo ?? null,
        },
    };
}

function parseQuoteRefFromListRow(row) {
    const sel = row?._approvalSelection || {};
    if (sel.quoteNumber) return String(sel.quoteNumber).trim();

    const multi = row?.ListMultiLeadQuoteRefs;
    if (Array.isArray(multi) && multi.length) {
        const customerHint = String(
            sel.customerName || row?.ListQuoteDetailToName || row?.ListPendingCustomerName || ''
        )
            .trim()
            .toLowerCase();
        if (customerHint) {
            const lines = Array.isArray(row?.ListQuoteDetailLines) ? row.ListQuoteDetailLines : [];
            for (const ln of lines) {
                const text = String(ln?.textLine || '');
                if (!text.toLowerCase().includes(customerHint.split(',')[0].trim())) continue;
                const m = text.match(/\(([A-Za-z0-9][A-Za-z0-9./_-]*)\s*-/);
                if (m?.[1]) return m[1].trim();
            }
        }
        const first = multi.find((e) => String(e?.quoteNumber || '').trim());
        if (first?.quoteNumber) return String(first.quoteNumber).trim();
    }

    const lines = Array.isArray(row?.ListQuoteDetailLines) ? row.ListQuoteDetailLines : [];
    for (const ln of lines) {
        const text = String(ln?.textLine || '');
        if (/\(Not Quoted\)/i.test(text)) continue;
        const m = text.match(/\(([A-Za-z0-9][A-Za-z0-9./_-]*)\s*-/);
        if (m?.[1]) return m[1].trim();
    }

    const ref = String(row?.ListQuoteRef ?? '').trim();
    if (!ref) return '';
    return ref.split(/\s*\|\s*/).map((s) => s.trim()).filter(Boolean)[0] || '';
}

function mapQuoteListRowToApprovalSelection(row) {
    const requestNo = String(row?.RequestNo || '').trim();
    const quoteNumber = parseQuoteRefFromListRow(row);
    const pvRaw = row?.ListPendingPvId ?? row?.listpendingpvid;
    const quoteId =
        pvRaw != null && String(pvRaw).trim() !== '' && !Number.isNaN(Number(pvRaw))
            ? Number(pvRaw)
            : null;
    return {
        ...row,
        _approvalSelection: {
            quoteId,
            quoteNumber,
            requestNo,
            customerName: String(
                row?.ListQuoteDetailToName || row?.ListPendingCustomerName || ''
            ).trim(),
            leadJobName: String(row?.ListPendingLeadJobName || '').trim(),
            ownJob: String(row?.ListPendingOwnJobItem || '').trim(),
            projectName: row?.ProjectName || '',
            revisionNo: null,
        },
    };
}

async function resolveQuoteSelectionFromListRow(row, userEmail) {
    const mapped = row?._approvalSelection ? row : mapQuoteListRowToApprovalSelection(row);
    const sel = mapped?._approvalSelection || {};
    const quoteId =
        sel.quoteId ||
        (String(mapped?.ListPendingPvId || '').trim() ? Number(mapped.ListPendingPvId) : null);
    const quoteNumber = String(sel.quoteNumber || parseQuoteRefFromListRow(mapped) || '').trim();
    const requestNo = String(sel.requestNo || mapped?.RequestNo || '').trim();

    if (quoteId && requestNo) {
        return {
            quoteId,
            quoteNumber,
            requestNo,
            customerName: String(sel.customerName || mapped?.ListQuoteDetailToName || '').trim(),
            leadJobName: sel.leadJobName || '',
            ownJob: sel.ownJob || '',
            projectName: sel.projectName || mapped?.ProjectName || '',
            revisionNo: sel.revisionNo ?? null,
        };
    }
    if (!requestNo) return null;
    if (!quoteNumber) return null;

    const params = new URLSearchParams();
    params.set('requestNo', requestNo);
    params.set('quoteNumber', quoteNumber);
    if (userEmail) params.set('userEmail', userEmail);

    const res = await fetch(`${API_BASE}/api/quotes/by-quote-number?${params.toString()}`, {
        cache: 'no-store',
    });
    if (!res.ok) return null;
    const match = await res.json();
    if (!match?.ID && !match?.id) return null;

    const cust = String(
        mapped?.ListQuoteDetailToName || sel.customerName || match?.ToName || ''
    ).trim();

    return {
        quoteId: match.ID ?? match.id,
        quoteNumber: match.QuoteNumber || match.quoteNumber || quoteNumber,
        requestNo,
        customerName: cust || match.ToName,
        leadJobName: match.LeadJob || sel.leadJobName || mapped?.ListPendingLeadJobName || '',
        ownJob: match.OwnJob || sel.ownJob || mapped?.ListPendingOwnJobItem || '',
        projectName: mapped?.ProjectName || sel.projectName,
    };
}

export default function QuoteApprovalPage({ openContext = null }) {
    const { currentUser } = useAuth();
    const userEmail = String(currentUser?.email || currentUser?.EmailId || currentUser?.MailId || '').trim();

    const [listTab, setListTab] = useState(LIST_TAB.PENDING);
    const [searchCriteria, setSearchCriteria] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [division, setDivision] = useState('');
    const [divisions, setDivisions] = useState([]);
    const [divisionsLoading, setDivisionsLoading] = useState(false);

    const [pendingRows, setPendingRows] = useState([]);
    const [pendingLoading, setPendingLoading] = useState(false);
    const [approvedRows, setApprovedRows] = useState([]);
    const [approvedLoading, setApprovedLoading] = useState(false);
    const [rejectedRows, setRejectedRows] = useState([]);
    const [rejectedLoading, setRejectedLoading] = useState(false);
    const [searchRows, setSearchRows] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);

    const [selectedPreview, setSelectedPreview] = useState(null);
    const [resolvingPreview, setResolvingPreview] = useState(false);
    const [listPanelWidth, setListPanelWidth] = useState(APPROVAL_LIST_PANEL_DEFAULT_WIDTH);
    const listPanelResizeRef = useRef({ dragging: false });

    const startListPanelResize = useCallback((mouseDownEvent) => {
        mouseDownEvent.preventDefault();
        const startX = mouseDownEvent.clientX;
        const startWidth = listPanelWidth;

        const doDrag = (mouseMoveEvent) => {
            const next = startWidth + (mouseMoveEvent.clientX - startX);
            const clamped = Math.min(
                APPROVAL_LIST_PANEL_MAX_WIDTH,
                Math.max(APPROVAL_LIST_PANEL_MIN_WIDTH, next)
            );
            setListPanelWidth(clamped);
        };

        const stopDrag = () => {
            listPanelResizeRef.current.dragging = false;
            document.removeEventListener('mousemove', doDrag);
            document.removeEventListener('mouseup', stopDrag);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        listPanelResizeRef.current.dragging = true;
        document.addEventListener('mousemove', doDrag);
        document.addEventListener('mouseup', stopDrag);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, [listPanelWidth]);

    const summaryClearColFiltersRef = useRef(() => {});
    const openContextConsumedRef = useRef('');
    const filtersHydratedRef = useRef(false);
    const sessionDivisionRef = useRef('');
    const restoreListRanRef = useRef(false);
    const pendingFetchSeqRef = useRef(0);
    const pendingAbortRef = useRef(null);

    const runQuoteSearch = useCallback(
        async (criteria, from, to, div) => {
            if (!userEmail) {
                setSearchRows([]);
                return;
            }
            const q = String(criteria || '').trim();
            const df = String(from || '').trim();
            const dt = String(to || '').trim();
            if (!q && !(df && dt)) {
                setSearchRows([]);
                return;
            }
            setSearchLoading(true);
            try {
                const params = new URLSearchParams();
                params.set('userEmail', userEmail);
                params.set('q', q);
                if (df) params.set('dateFrom', df);
                if (dt) params.set('dateTo', dt);
                if (String(div || '').trim()) params.set('division', String(div).trim());
                const res = await fetch(`${API_BASE}/api/quotes/list/approval-search?${params.toString()}`, {
                    cache: 'no-store',
                });
                const data = res.ok ? await res.json() : [];
                setSearchRows(
                    (Array.isArray(data) ? data : []).map(mapPendingApprovalToTableRow)
                );
            } catch (e) {
                console.warn('[QuoteApprovalPage] search', e);
                setSearchRows([]);
            } finally {
                setSearchLoading(false);
            }
        },
        [userEmail]
    );

    const displayRows =
        listTab === LIST_TAB.SEARCH
            ? searchRows
            : listTab === LIST_TAB.APPROVED
              ? approvedRows
              : listTab === LIST_TAB.REJECTED
                ? rejectedRows
                : pendingRows;
    const listLoading =
        listTab === LIST_TAB.SEARCH
            ? searchLoading
            : listTab === LIST_TAB.APPROVED
              ? approvedLoading
              : listTab === LIST_TAB.REJECTED
                ? rejectedLoading
                : pendingLoading;

    const notifyPendingApprovalsChanged = useCallback(() => {
        window.dispatchEvent(new CustomEvent(EMS_PENDING_APPROVALS_CHANGED));
    }, []);

    const refetchPending = useCallback(async () => {
        if (!userEmail) {
            setPendingRows([]);
            return;
        }
        pendingAbortRef.current?.abort();
        const ac = new AbortController();
        pendingAbortRef.current = ac;
        const seq = ++pendingFetchSeqRef.current;
        setPendingLoading(true);
        try {
            const params = new URLSearchParams();
            params.set('userEmail', userEmail);
            if (division.trim()) params.set('division', division.trim());
            const res = await fetch(
                `${API_BASE}/api/quotes/list/pending-approvals?${params.toString()}`,
                { cache: 'no-store', signal: ac.signal }
            );
            if (seq !== pendingFetchSeqRef.current) return;
            const data = res.ok ? await res.json() : [];
            setPendingRows(
                (Array.isArray(data) ? data : []).map(mapPendingApprovalToTableRow)
            );
        } catch (e) {
            if (e?.name === 'AbortError') return;
            console.warn('[QuoteApprovalPage] pending list', e);
            if (seq !== pendingFetchSeqRef.current) return;
            setPendingRows([]);
        } finally {
            if (seq === pendingFetchSeqRef.current && !ac.signal.aborted) {
                setPendingLoading(false);
            }
        }
    }, [userEmail, division]);

    const handleApprovalActionComplete = useCallback(() => {
        const qid = selectedPreview?.quoteId;
        if (qid) {
            const qidStr = String(qid);
            setPendingRows((prev) =>
                prev.filter(
                    (r) =>
                        String(r._approvalSelection?.quoteId ?? r.ListPendingPvId ?? '').trim() !==
                        qidStr
                )
            );
            setSelectedPreview(null);
        }
        notifyPendingApprovalsChanged();
        void refetchPending();
    }, [refetchPending, selectedPreview, notifyPendingApprovalsChanged]);

    const fetchApprovedList = useCallback(
        async (withFilters = false) => {
            if (!userEmail) {
                setApprovedRows([]);
                return;
            }
            setApprovedLoading(true);
            try {
                const params = new URLSearchParams();
                params.set('userEmail', userEmail);
                if (withFilters) {
                    const q = searchCriteria.trim();
                    const df = (dateFrom || '').trim();
                    const dt = (dateTo || '').trim();
                    if (q) params.set('q', q);
                    if (df) params.set('dateFrom', df);
                    if (dt) params.set('dateTo', dt);
                }
                if (division.trim()) params.set('division', division.trim());
                const res = await fetch(
                    `${API_BASE}/api/quotes/list/approved-by-me?${params.toString()}`,
                    { cache: 'no-store' }
                );
                const data = res.ok ? await res.json() : [];
                setApprovedRows(
                    (Array.isArray(data) ? data : []).map(mapPendingApprovalToTableRow)
                );
            } catch (e) {
                console.warn('[QuoteApprovalPage] approved list', e);
                setApprovedRows([]);
            } finally {
                setApprovedLoading(false);
            }
        },
        [userEmail, searchCriteria, dateFrom, dateTo, division]
    );

    const refetchApproved = useCallback(() => fetchApprovedList(false), [fetchApprovedList]);

    const fetchRejectedList = useCallback(
        async (withFilters = false) => {
            if (!userEmail) {
                setRejectedRows([]);
                return;
            }
            setRejectedLoading(true);
            try {
                const params = new URLSearchParams();
                params.set('userEmail', userEmail);
                if (withFilters) {
                    const q = searchCriteria.trim();
                    const df = (dateFrom || '').trim();
                    const dt = (dateTo || '').trim();
                    if (q) params.set('q', q);
                    if (df) params.set('dateFrom', df);
                    if (dt) params.set('dateTo', dt);
                }
                if (division.trim()) params.set('division', division.trim());
                const res = await fetch(
                    `${API_BASE}/api/quotes/list/rejected-by-me?${params.toString()}`,
                    { cache: 'no-store' }
                );
                const data = res.ok ? await res.json() : [];
                setRejectedRows(
                    (Array.isArray(data) ? data : []).map(mapPendingApprovalToTableRow)
                );
            } catch (e) {
                console.warn('[QuoteApprovalPage] rejected list', e);
                setRejectedRows([]);
            } finally {
                setRejectedLoading(false);
            }
        },
        [userEmail, searchCriteria, dateFrom, dateTo, division]
    );

    const refetchRejected = useCallback(() => fetchRejectedList(false), [fetchRejectedList]);

    useEffect(() => {
        if (!userEmail) {
            filtersHydratedRef.current = false;
            restoreListRanRef.current = false;
            sessionDivisionRef.current = '';
            return;
        }
        const saved = loadApprovalFilters(userEmail);
        if (saved) {
            if (saved.listTab && Object.values(LIST_TAB).includes(saved.listTab)) {
                setListTab(saved.listTab);
            }
            if (typeof saved.searchCriteria === 'string') setSearchCriteria(saved.searchCriteria);
            if (typeof saved.dateFrom === 'string') setDateFrom(saved.dateFrom);
            if (typeof saved.dateTo === 'string') setDateTo(saved.dateTo);
            if (typeof saved.listPanelWidth === 'number' && Number.isFinite(saved.listPanelWidth)) {
                setListPanelWidth(
                    Math.min(
                        APPROVAL_LIST_PANEL_MAX_WIDTH,
                        Math.max(APPROVAL_LIST_PANEL_MIN_WIDTH, saved.listPanelWidth)
                    )
                );
            }
            // Division is intentionally NOT restored: a stale saved division silently
            // hides cross-division pending approvals. Each visit starts at "All Divisions".
            sessionDivisionRef.current = '';
        }
        filtersHydratedRef.current = true;
    }, [userEmail]);

    useEffect(() => {
        if (!userEmail || !filtersHydratedRef.current) return;
        saveApprovalFilters(userEmail, {
            listTab,
            division,
            searchCriteria,
            dateFrom,
            dateTo,
            listPanelWidth,
        });
    }, [userEmail, listTab, division, searchCriteria, dateFrom, dateTo, listPanelWidth]);

    useEffect(() => {
        if (!userEmail || !filtersHydratedRef.current || restoreListRanRef.current) return;
        if (divisionsLoading) return;
        restoreListRanRef.current = true;
        const saved = loadApprovalFilters(userEmail);
        const tab = saved?.listTab || LIST_TAB.PENDING;
        if (tab === LIST_TAB.SEARCH) {
            void runQuoteSearch(
                saved?.searchCriteria ?? searchCriteria,
                saved?.dateFrom ?? dateFrom,
                saved?.dateTo ?? dateTo,
                saved?.division ?? division
            );
        }
    }, [userEmail, divisionsLoading, division, searchCriteria, dateFrom, dateTo, runQuoteSearch]);

    useEffect(() => {
        if (listTab !== LIST_TAB.PENDING) return;
        if (divisionsLoading) return;
        refetchPending();
    }, [listTab, refetchPending, divisionsLoading]);

    useEffect(() => {
        if (listTab !== LIST_TAB.PENDING || !userEmail || divisionsLoading) return;
        const interval = setInterval(() => {
            void refetchPending();
        }, 20000);
        return () => clearInterval(interval);
    }, [listTab, userEmail, divisionsLoading, refetchPending]);

    // Instant refresh: workflow send / approve / reject anywhere in the app, or returning to this tab.
    useEffect(() => {
        if (listTab !== LIST_TAB.PENDING || !userEmail || divisionsLoading) return;
        const onChanged = () => {
            void refetchPending();
        };
        const onVisible = () => {
            if (document.visibilityState === 'visible') void refetchPending();
        };
        window.addEventListener(EMS_PENDING_APPROVALS_CHANGED, onChanged);
        window.addEventListener('focus', onChanged);
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            window.removeEventListener(EMS_PENDING_APPROVALS_CHANGED, onChanged);
            window.removeEventListener('focus', onChanged);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [listTab, userEmail, divisionsLoading, refetchPending]);

    useEffect(() => {
        if (listTab === LIST_TAB.APPROVED) refetchApproved();
    }, [listTab, refetchApproved]);

    useEffect(() => {
        if (listTab === LIST_TAB.REJECTED) refetchRejected();
    }, [listTab, refetchRejected]);

    useEffect(() => {
        if (!userEmail) {
            setDivisions([]);
            setDivision('');
            return;
        }
        let cancelled = false;
        (async () => {
            setDivisionsLoading(true);
            try {
                const res = await fetch(
                    `${API_BASE}/api/pricing/list/divisions?userEmail=${encodeURIComponent(userEmail)}`
                );
                const data = res.ok ? await res.json() : { divisions: [] };
                if (cancelled) return;
                const list = Array.isArray(data.divisions) ? data.divisions : [];
                setDivisions(list);
                setDivision((prev) => {
                    if (!list.length) return '';
                    const sessionDiv = sessionDivisionRef.current;
                    if (sessionDiv && list.includes(sessionDiv)) return sessionDiv;
                    if (prev && list.includes(prev)) return prev;
                    return '';
                });
            } catch {
                if (!cancelled) {
                    setDivisions([]);
                }
            } finally {
                if (!cancelled) setDivisionsLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [userEmail]);

    const handleSearch = useCallback(async () => {
        if (listTab === LIST_TAB.APPROVED) {
            await fetchApprovedList(true);
            return;
        }
        if (listTab === LIST_TAB.REJECTED) {
            await fetchRejectedList(true);
            return;
        }
        if (listTab !== LIST_TAB.SEARCH) return;
        await runQuoteSearch(searchCriteria, dateFrom, dateTo, division);
    }, [listTab, searchCriteria, dateFrom, dateTo, division, fetchApprovedList, fetchRejectedList, runQuoteSearch]);

    const handleClear = useCallback(() => {
        summaryClearColFiltersRef.current?.();
        setSearchCriteria('');
        setDateFrom('');
        setDateTo('');
        setSearchRows([]);
        setApprovedRows([]);
        setRejectedRows([]);
        setSelectedPreview(null);
        setListTab(LIST_TAB.PENDING);
        clearApprovalFilters(userEmail);
        refetchPending();
    }, [refetchPending, userEmail]);

    const handleRowOpen = useCallback(
        async (row) => {
            if (!row) return;
            setResolvingPreview(true);
            try {
                const sel = await resolveQuoteSelectionFromListRow(row, userEmail);
                setSelectedPreview(sel);
            } catch (e) {
                console.warn('[QuoteApprovalPage] resolve preview', e);
                setSelectedPreview(null);
            } finally {
                setResolvingPreview(false);
            }
        },
        [userEmail]
    );

    useEffect(() => {
        const tab = String(openContext?.tab || '').trim();
        if (tab !== 'Approvals') return;
        const requestNo = String(openContext?.requestNo || '').trim();
        const quoteId = String(openContext?.quoteId || '').trim();
        if (!requestNo && !quoteId) return;
        const key = `${requestNo}::${quoteId}`;
        if (openContextConsumedRef.current === key) return;
        if (pendingLoading) return;

        const match = pendingRows.find((row) => {
            const sel = row?._approvalSelection || {};
            const rowQid = String(sel.quoteId || row?.ListPendingPvId || '').trim();
            const rowRn = String(sel.requestNo || row?.RequestNo || '').trim();
            if (quoteId && rowQid === quoteId) return true;
            if (requestNo && rowRn === requestNo) {
                if (!quoteId) return true;
                return rowQid === quoteId;
            }
            return false;
        });
        if (!match) return;
        openContextConsumedRef.current = key;
        void handleRowOpen(match);
    }, [openContext, pendingRows, pendingLoading, handleRowOpen]);

    const previewOpenContext = useMemo(() => {
        if (!selectedPreview?.requestNo) return null;
        return {
            tab: QUOTE_TAB_B2B,
            requestNo: selectedPreview.requestNo,
            quoteId: selectedPreview.quoteId ? String(selectedPreview.quoteId) : '',
            quoteNumber: selectedPreview.quoteNumber ? String(selectedPreview.quoteNumber) : '',
            leadJobName: selectedPreview.leadJobName ? String(selectedPreview.leadJobName) : '',
            ownJob: selectedPreview.ownJob ? String(selectedPreview.ownJob) : '',
            customerName: selectedPreview.customerName ? String(selectedPreview.customerName) : '',
        };
    }, [selectedPreview]);

    const previewKey = previewOpenContext
        ? [
              previewOpenContext.requestNo,
              previewOpenContext.quoteId,
              previewOpenContext.quoteNumber,
          ].join('::')
        : '';

    const selectedListRowKey = useMemo(() => {
        if (!selectedPreview?.quoteId) return '';
        const qid = String(selectedPreview.quoteId);
        const match = displayRows.find(
            (r) => String(r._approvalSelection?.quoteId ?? r.ListPendingPvId ?? '').trim() === qid
        );
        if (match) {
            return getQuoteListRowKey(match, displayRows.indexOf(match));
        }
        return getQuoteListRowKey({
            RequestNo: selectedPreview.requestNo,
            QuoteListKind: selectedPreview.quoteNumber || `q-${qid}`,
        });
    }, [selectedPreview, displayRows]);

    const emptyTableLabel =
        listTab === LIST_TAB.SEARCH
            ? 'No quotes submitted for approval match this search. Try different text or quote dates (both required when search text is empty).'
            : listTab === LIST_TAB.APPROVED
              ? approvedLoading
                  ? 'Loading quotes you approved…'
                  : 'No approved quotes found. Adjust search criteria or dates and try again.'
              : listTab === LIST_TAB.REJECTED
                ? rejectedLoading
                    ? 'Loading quotes you rejected…'
                    : 'No rejected quotes found. Adjust search criteria or dates and try again.'
                : pendingLoading
                  ? 'Loading pending approvals…'
                  : 'No quotes pending your approval. Use Approved by Me, Rejected by Me, or Quote Search to find quotes.';

    const isSearchMode = listTab === LIST_TAB.SEARCH;
    const isApprovedMode = listTab === LIST_TAB.APPROVED;
    const isRejectedMode = listTab === LIST_TAB.REJECTED;
    const criteriaEnabled = isSearchMode || isApprovedMode || isRejectedMode;
    const divisionEnabled = divisions.length > 0 && !divisionsLoading;
    const toolbarLabelStyle = {
        fontSize: '10px',
        fontWeight: 600,
        color: '#374151',
        whiteSpace: 'nowrap',
        lineHeight: 1.1,
    };
    const toolbarFieldStyle = {
        padding: '3px 6px',
        fontSize: '10.5px',
        borderRadius: '5px',
        border: '1px solid #cbd5e1',
        minHeight: '28px',
        height: '28px',
        boxSizing: 'border-box',
        width: '100%',
        minWidth: 0,
    };
    const toolbarFieldStackStyle = {
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        minWidth: 0,
        flex: 1,
    };

    const toolbar = (
        <div
            className="no-print"
            style={{
                flexShrink: 0,
                padding: '8px 10px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                background: '#e8eef6',
                borderBottom: '1px solid #c5d0e0',
                minWidth: 0,
                overflow: 'hidden',
                boxSizing: 'border-box',
            }}
        >
            {/* Row 1: Category + Division */}
            <div style={{ display: 'flex', gap: '6px', width: '100%', minWidth: 0 }}>
                <div style={toolbarFieldStackStyle}>
                    <span style={toolbarLabelStyle}>Category</span>
                    <select
                        value={listTab}
                    onChange={(e) => {
                        const v = e.target.value;
                        setListTab(v);
                        setSelectedPreview(null);
                        if (v === LIST_TAB.PENDING) refetchPending();
                        if (v === LIST_TAB.APPROVED && approvedRows.length === 0) refetchApproved();
                        if (v === LIST_TAB.REJECTED && rejectedRows.length === 0) refetchRejected();
                        if (
                            v === LIST_TAB.SEARCH &&
                            searchRows.length === 0 &&
                            (searchCriteria.trim() || (dateFrom.trim() && dateTo.trim()))
                        ) {
                            void runQuoteSearch(searchCriteria, dateFrom, dateTo, division);
                        }
                    }}
                        style={{
                            ...toolbarFieldStyle,
                            background: '#fff',
                            cursor: 'pointer',
                        }}
                    >
                        <option value={LIST_TAB.PENDING}>Pending for Approval</option>
                        <option value={LIST_TAB.APPROVED}>Approved by Me</option>
                        <option value={LIST_TAB.REJECTED}>Rejected by Me</option>
                        <option value={LIST_TAB.SEARCH}>Quote Search</option>
                    </select>
                </div>
                <div style={toolbarFieldStackStyle}>
                    <span style={toolbarLabelStyle}>Division</span>
                    <select
                        value={division}
                        disabled={!divisionEnabled}
                        onChange={(e) => {
                            const next = e.target.value;
                            setDivision(next);
                            sessionDivisionRef.current = next;
                            setSelectedPreview(null);
                        }}
                        title={
                            divisionEnabled
                                ? 'Your accessible divisions'
                                : divisionsLoading
                                  ? 'Loading divisions…'
                                  : 'No division assigned'
                        }
                        style={{
                            ...toolbarFieldStyle,
                            background: divisionEnabled ? '#fff' : '#f1f5f9',
                            color: '#334155',
                            cursor: divisionEnabled ? 'pointer' : 'not-allowed',
                        }}
                    >
                        {divisionsLoading && !divisions.length ? (
                            <option value="" disabled>
                                Loading…
                            </option>
                        ) : null}
                        {!divisionsLoading && !divisions.length ? (
                            <option value="" disabled>
                                No division
                            </option>
                        ) : null}
                        {divisions.length > 0 ? (
                            <option value="">All Divisions</option>
                        ) : null}
                        {divisions.map((d) => (
                            <option key={d} value={d}>
                                {d}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Row 2: Criteria */}
            <div style={{ ...toolbarFieldStackStyle, flex: 'none', width: '100%' }}>
                <span style={{ ...toolbarLabelStyle, opacity: criteriaEnabled ? 1 : 0.7 }}>Criteria</span>
                <input
                    type="text"
                    value={searchCriteria}
                    onChange={(e) => setSearchCriteria(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key !== 'Enter' || !criteriaEnabled) return;
                        e.preventDefault();
                        if (searchLoading || approvedLoading || rejectedLoading) return;
                        handleSearch();
                    }}
                    disabled={!criteriaEnabled}
                    placeholder={
                        isApprovedMode
                            ? 'Filter enquiry, project, workflow no, customer…'
                            : isRejectedMode
                              ? 'Filter enquiry, project, workflow no, customer…'
                            : isSearchMode
                              ? 'Enquiry, project, workflow no, customer, quote ref (approval quotes only)…'
                              : 'Use Approved, Rejected, or Search'
                    }
                    style={{
                        ...toolbarFieldStyle,
                        opacity: criteriaEnabled ? 1 : 0.7,
                        background: criteriaEnabled ? '#fff' : '#f1f5f9',
                        cursor: criteriaEnabled ? 'text' : 'not-allowed',
                    }}
                />
            </div>

            {/* Row 3: From + To + Search + Clear */}
            <div
                style={{
                    display: 'flex',
                    gap: '6px',
                    width: '100%',
                    minWidth: 0,
                    alignItems: 'flex-end',
                }}
            >
                <div style={{ ...toolbarFieldStackStyle, flex: '1 1 0' }}>
                    <span style={{ ...toolbarLabelStyle, opacity: criteriaEnabled ? 1 : 0.7 }}>From</span>
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
                        disabled={!criteriaEnabled}
                        placeholder="DD-MMM-YYYY"
                        style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            fontSize: '10.5px',
                            padding: '3px 6px',
                            minHeight: '28px',
                            height: '28px',
                            opacity: criteriaEnabled ? 1 : 0.7,
                            background: criteriaEnabled ? '#fff' : '#f1f5f9',
                        }}
                    />
                </div>
                <div style={{ ...toolbarFieldStackStyle, flex: '1 1 0' }}>
                    <span style={{ ...toolbarLabelStyle, opacity: criteriaEnabled ? 1 : 0.7 }}>To</span>
                    <DateInput
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        disabled={!criteriaEnabled}
                        placeholder="DD-MMM-YYYY"
                        style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            fontSize: '10.5px',
                            padding: '3px 6px',
                            minHeight: '28px',
                            height: '28px',
                            opacity: criteriaEnabled ? 1 : 0.7,
                            background: criteriaEnabled ? '#fff' : '#f1f5f9',
                        }}
                    />
                </div>
                <button
                    type="button"
                    onClick={handleSearch}
                    disabled={!criteriaEnabled || searchLoading || approvedLoading || rejectedLoading}
                    style={{
                        ...(criteriaEnabled && !searchLoading && !approvedLoading && !rejectedLoading
                            ? EMS_LIST_SEARCH_ENABLED_STYLE
                            : EMS_LIST_SEARCH_DISABLED_STYLE),
                        padding: '3px 8px',
                        fontSize: '10.5px',
                        fontWeight: '600',
                        borderRadius: '5px',
                        minHeight: '28px',
                        height: '28px',
                        flexShrink: 0,
                        cursor:
                            criteriaEnabled && !searchLoading && !approvedLoading && !rejectedLoading
                                ? 'pointer'
                                : 'not-allowed',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {searchLoading || approvedLoading ? '…' : 'Search'}
                </button>
                <button
                    type="button"
                    onClick={handleClear}
                    style={{
                        ...EMS_LIST_CLEAR_STYLE,
                        padding: '3px 8px',
                        fontSize: '10.5px',
                        fontWeight: '600',
                        borderRadius: '5px',
                        minHeight: '28px',
                        height: '28px',
                        flexShrink: 0,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                    }}
                >
                    Clear
                </button>
            </div>
        </div>
    );

    return (
        <div
            style={{
                display: 'flex',
                height: '100%',
                minHeight: 0,
                background: '#f5f7fa',
                overflow: 'hidden',
            }}
        >
            <div
                style={{
                    width: `${listPanelWidth}px`,
                    minWidth: `${APPROVAL_LIST_PANEL_MIN_WIDTH}px`,
                    maxWidth: `${APPROVAL_LIST_PANEL_MAX_WIDTH}px`,
                    flexShrink: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    background: '#fff',
                    borderRight: '1px solid #e2e8f0',
                    minHeight: 0,
                }}
            >
                {toolbar}
                <div
                    style={{
                        flex: 1,
                        minHeight: 0,
                        minWidth: 0,
                        overflow: 'hidden',
                        padding: '4px',
                        boxSizing: 'border-box',
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                >
                    {listLoading && !displayRows.length ? (
                        <div
                            style={{
                                height: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#64748b',
                                fontSize: '13px',
                            }}
                        >
                            Loading…
                        </div>
                    ) : (
                        <DashboardQuoteSummaryTable
                            rows={displayRows}
                            onOpenEnquiry={handleRowOpen}
                            emptyLabel={emptyTableLabel}
                            hideRequestNoStatus
                            flatTableHeader
                            showWorkflowNoColumn
                            selectedRowKey={selectedListRowKey}
                            defaultSortConfig={
                                listTab === LIST_TAB.SEARCH ||
                                listTab === LIST_TAB.APPROVED ||
                                listTab === LIST_TAB.REJECTED
                                    ? { field: 'LatestQuoteDate', direction: 'desc' }
                                    : { field: 'DueDate', direction: 'asc' }
                            }
                            resetSortOnRowsChange={
                                listTab === LIST_TAB.SEARCH ||
                                listTab === LIST_TAB.APPROVED ||
                                listTab === LIST_TAB.REJECTED
                            }
                            onRegisterClearColumnFilters={(fn) => {
                                summaryClearColFiltersRef.current = fn;
                            }}
                        />
                    )}
                </div>
            </div>

            <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize quote list panel"
                title="Drag to resize list panel"
                onMouseDown={startListPanelResize}
                style={{
                    width: '8px',
                    flexShrink: 0,
                    cursor: 'col-resize',
                    background: '#f1f5f9',
                    borderRight: '1px solid #e2e8f0',
                    borderLeft: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 5,
                }}
            >
                <div
                    style={{
                        width: '3px',
                        height: '36px',
                        borderRadius: '2px',
                        background: '#cbd5e1',
                    }}
                />
            </div>

            <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {resolvingPreview ? (
                    <div
                        style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#64748b',
                            fontSize: '14px',
                        }}
                    >
                        Loading quote preview…
                    </div>
                ) : previewOpenContext ? (
                    <QuoteForm
                        key={previewKey}
                        embeddedApprovalReview
                        openContext={previewOpenContext}
                        onApprovalActionComplete={handleApprovalActionComplete}
                    />
                ) : (
                    <div
                        style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexDirection: 'column',
                            gap: '8px',
                            color: '#94a3b8',
                            fontSize: '14px',
                            fontStyle: 'italic',
                            padding: '24px',
                            textAlign: 'center',
                        }}
                    >
                        <span>Select a quote from the list to preview it here.</span>
                        <span style={{ fontSize: '12px' }}>
                            Use Approved by Me, Rejected by Me, or Quote Search when you have no pending approvals.
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}
