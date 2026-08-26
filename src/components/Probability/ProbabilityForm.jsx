import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import Select from 'react-select';
import AsyncCreatableSelect from 'react-select/async-creatable';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { format } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { FilterX, RefreshCw } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { EMS_TABLE_HEADER_GRADIENT } from '../../constants/emsTheme';
import { flip } from '@floating-ui/react';
import ExcelDownloadButton from '../shared/ExcelDownloadButton';
import {
    downloadProbabilityListXlsx,
    PROBABILITY_VIEW_MODE_LABELS,
} from './probabilityListExcel';
import '../../styles/emsTableColumnFilters.css';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

const PROB_DATE_MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

function parseProbDateFilterKey(key) {
    if (!key || key === '—') return null;
    const raw = String(key).trim();
    const d = new Date(`${raw}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    return {
        year: d.getFullYear(),
        monthName: PROB_DATE_MONTH_NAMES[d.getMonth()],
        raw,
    };
}

function buildProbDateGroupsFromKeys(allKeys) {
    const dateGroups = {};
    const otherKeys = [];
    for (const key of allKeys || []) {
        const parsed = parseProbDateFilterKey(key);
        if (!parsed) {
            otherKeys.push(key);
            continue;
        }
        if (!dateGroups[parsed.year]) dateGroups[parsed.year] = {};
        if (!dateGroups[parsed.year][parsed.monthName]) dateGroups[parsed.year][parsed.monthName] = [];
        dateGroups[parsed.year][parsed.monthName].push(parsed.raw);
    }
    return { dateGroups, otherKeys };
}

function probDateKeyMatchesSearch(key, q, formatLabel) {
    if (!q) return true;
    const lo = q.toLowerCase();
    if (String(key).toLowerCase().includes(lo)) return true;
    const parsed = parseProbDateFilterKey(key);
    if (parsed) {
        if (String(parsed.year).includes(lo)) return true;
        if (parsed.monthName.toLowerCase().includes(lo)) return true;
    }
    const label = formatLabel(key);
    if (label && String(label).toLowerCase().includes(lo)) return true;
    return false;
}

/** Probability status colors for row dropdown and history. */
function getProbStatusColor(status) {
    const s = String(status || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
    if (s === 'won') return '#198754';
    if (s === 'lost') return '#dc3545';
    if (s === 'pending') return '#6f42c1';
    if (s === 'followup') return '#4169e1';
    if (s === 'onhold' || s === 'hold') return '#800000';
    if (s === 'cancelled') return '#800000';
    if (s === 'retendered') return '#800000';
    return '#212529';
}

const probStatusSelectStyle = (status) => ({
    fontWeight: 700,
    color: getProbStatusColor(status),
});

const probStatusOptionStyle = (status) => ({
    fontWeight: 700,
    color: getProbStatusColor(status),
});

/** Prefer opening below the input; restrict flip fallbacks so the calendar rarely moves above the field. */
const PROB_LIST_DATE_PICKER_POPPER_MODIFIERS = [
    flip({
        padding: 16,
        fallbackPlacements: ['bottom-start', 'bottom-end', 'left-start', 'right-start'],
    }),
];

/** Portal + popper: above fixed header (9999) and probability thead stacking — all Probability date pickers. */
const PROB_DATE_PICKER_POPPER_COMMON = {
    popperClassName: 'prob-datepicker-popper',
    portalId: 'prob-datepicker-portal',
    popperProps: { strategy: 'fixed' },
    popperPlacement: 'bottom-start',
    showPopperArrow: false,
    popperModifiers: PROB_LIST_DATE_PICKER_POPPER_MODIFIERS,
};

/** Lost To — directory search (contractors + clients) after this many characters; free text always allowed. */
const LOST_TO_MIN_SEARCH_CHARS = 3;

/** Fields whose change should enable the per-row Update button. Mirrors the persistUpdate payload. */
const PROB_TRACKED_FIELDS = [
    'Status', 'WonQuoteRef', 'WonCustomerName', 'LeadJobName', 'WonQuoteRefDate',
    'WonOrderValue', 'WonJobNo', 'WonOption', 'WonGrossProfit',
    'LostCompetitor', 'LostReason', 'LostCompetitorPrice', 'LostDate',
    'ProbabilityOption', 'ExpectedOrderDate', 'GrossMargin', 'ProbabilityRemarks',
    'SelectedTotalQuotedValue', 'SelectedNetQuotedValue', 'QuotePreparedBy',
];

/** Normalize a tracked field so semantically equal values (null/'' /trimmed) compare equal. */
const normalizeTrackedValue = (v) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'number') return String(v);
    return String(v);
};

const buildProbItemSnapshot = (item) => {
    const snap = {};
    PROB_TRACKED_FIELDS.forEach((f) => {
        snap[f] = item ? item[f] : undefined;
    });
    return snap;
};

/** Parse EnquiryQuotes.TotalAmount from a quote-ref list entry. */
function parseQuoteRefTotalAmount(hit) {
    if (!hit || typeof hit !== 'object') return null;
    const raw = hit.TotalAmount ?? hit.totalAmount;
    if (raw === null || raw === undefined || raw === '') return null;
    const n = Number(String(raw).replace(/,/g, '').replace(/BD/gi, '').trim());
    return Number.isFinite(n) ? n : null;
}

/** EnquiryQuotes.TotalAmount for the selected quote reference (from list payload). */
function netQuotedFromQuoteRefList(quoteRefs, ref) {
    const r = String(ref || '').trim();
    if (!r || !Array.isArray(quoteRefs)) return null;
    const hit = quoteRefs.find((q) => {
        const num = typeof q === 'string' ? String(q).trim() : String(q?.QuoteNumber || q?.value || '').trim();
        return num === r;
    });
    return parseQuoteRefTotalAmount(hit);
}

/** Resolved net quoted from selected quote ref (EnquiryQuotes.TotalAmount preferred). */
function resolveRowNetQuotedNumber(item) {
    if (!String(item?.WonQuoteRef || '').trim()) return null;
    if (item.SelectedNetQuotedValue !== null && item.SelectedNetQuotedValue !== undefined && item.SelectedNetQuotedValue !== '') {
        return Number(item.SelectedNetQuotedValue);
    }
    const fromRef = netQuotedFromQuoteRefList(item?.QuoteRefs, item.WonQuoteRef);
    if (fromRef != null) return fromRef;
    if (item.NetQuotedValue !== null && item.NetQuotedValue !== undefined && item.NetQuotedValue !== '') {
        return Number(item.NetQuotedValue);
    }
    return null;
}

/** Numeric net quoted for filters/sort (same rules as display cell). */
function getRowNetQuotedNumber(item, currentUser) {
    const userDept = (currentUser?.Department || currentUser?.Division || '').trim().toLowerCase();
    const isSubUser = userDept && userDept !== 'civil' && userDept !== 'admin' && currentUser?.Roles !== 'Admin' && currentUser?.role !== 'Admin';
    if (isSubUser && (!item.QuoteRefs || item.QuoteRefs.length === 0)) return null;
    return resolveRowNetQuotedNumber(item);
}

function formatNetQuotedDisplay(item) {
    const n = resolveRowNetQuotedNumber(item);
    if (n === null || Number.isNaN(n)) return '';
    return 'BD ' + n.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function compareEnquiryNo(a, b) {
    const sa = String(a ?? '');
    const sb = String(b ?? '');
    const na = Number(sa);
    const nb = Number(sb);
    if (!Number.isNaN(na) && !Number.isNaN(nb) && String(na) === sa.trim() && String(nb) === sb.trim()) {
        return na - nb;
    }
    return sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' });
}

const ProbabilityForm = () => {
    const { currentUser } = useAuth();
    const { masters } = useData();

    // --- View State ---
    const [divisionOptions, setDivisionOptions] = useState([]);
    const [selectedDivision, setSelectedDivision] = useState(() => localStorage.getItem('prob_division') || '');
    const [listMode, setListMode] = useState(() => localStorage.getItem('prob_listMode') || 'Pending'); // 'Pending', 'Won', 'Lost', 'OnHold', 'Cancelled', 'FollowUp', 'Retendered'
    const [fromDate, setFromDate] = useState(() => localStorage.getItem('prob_fromDate') || '');
    const [toDate, setToDate] = useState(() => localStorage.getItem('prob_toDate') || '');
    const [filterProbability, setFilterProbability] = useState(() => localStorage.getItem('prob_filterProbability') || '');
    const [viewSearchText, setViewSearchText] = useState(() => localStorage.getItem('prob_viewSearchText') || '');

    const [loadingList, setLoadingList] = useState(false);
    const [updatingReqNo, setUpdatingReqNo] = useState(null); // Track which row is being updated
    const [updatedItems, setUpdatedItems] = useState({});
    /** Per-row snapshot of editable fields, captured on fetch and after each successful save.
     *  Used to enable the Update button only when the user has made a real change. */
    const [itemSnapshots, setItemSnapshots] = useState({});
    const [historyReqNo, setHistoryReqNo] = useState('');
    const [historyHeader, setHistoryHeader] = useState({ projectName: '', leadJobName: '' });
    const [historyRows, setHistoryRows] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    /** Excel-style column filters: null = inactive (show all). */
    const [colFEnquiry, setColFEnquiry] = useState(null);
    const [colFProject, setColFProject] = useState(null);
    const [colFCustomer, setColFCustomer] = useState(null);
    const [colFStatus, setColFStatus] = useState(null);
    const [colFQuoteType, setColFQuoteType] = useState(null);
    const [colFProbability, setColFProbability] = useState(null);
    const [colFExpectedDate, setColFExpectedDate] = useState(null);
    const [colFDetailQuoteRef, setColFDetailQuoteRef] = useState(null);
    const [colFWonJobNo, setColFWonJobNo] = useState(null);
    const [colFWonBookedDate, setColFWonBookedDate] = useState(null);
    const [colFDetailRemarks, setColFDetailRemarks] = useState(null);
    const [colFLostTo, setColFLostTo] = useState(null);
    const [colFLostReason, setColFLostReason] = useState(null);
    const [colFLostDate, setColFLostDate] = useState(null);
    const [colFWonJobValue, setColFWonJobValue] = useState({ mode: 'all', v1: '', v2: '' });
    const [colFWonGpPct, setColFWonGpPct] = useState({ mode: 'all', v1: '', v2: '' });
    const [colFGrossMargin, setColFGrossMargin] = useState({ mode: 'all', v1: '', v2: '' });
    const [colFLostCompetitorPrice, setColFLostCompetitorPrice] = useState({ mode: 'all', v1: '', v2: '' });
    const [colFNet, setColFNet] = useState({ mode: 'all', v1: '', v2: '' });
    const [sortCol, setSortCol] = useState(null);
    const [sortAsc, setSortAsc] = useState(true);
    const [openColFilter, setOpenColFilter] = useState(null);
    /** Fixed positioning for column filter popovers (escapes overflow:auto on table scroll wrap). */
    const [filterPanelPos, setFilterPanelPos] = useState(null);
    const tableScrollWrapRef = useRef(null);
    const filterHeaderRefs = useRef({
        enquiry: null,
        project: null,
        customer: null,
        net: null,
        status: null,
        quoteType: null,
        probability: null,
        expectedDate: null,
        detailQuoteRef: null,
        wonJobNo: null,
        wonBookedDate: null,
        detailRemarks: null,
        lostTo: null,
        lostReason: null,
        lostDate: null,
        wonJobValue: null,
        wonGpPct: null,
        grossMargin: null,
        lostCompetitorPrice: null,
    });
    const [draftMulti, setDraftMulti] = useState(() => new Set());
    const [draftNet, setDraftNet] = useState({ mode: 'all', v1: '', v2: '' });
    const [filterSearch, setFilterSearch] = useState('');

    // -- Persistence --
    useEffect(() => {
        localStorage.setItem('prob_division', selectedDivision);
        localStorage.setItem('prob_listMode', listMode);
        localStorage.setItem('prob_fromDate', fromDate);
        localStorage.setItem('prob_toDate', toDate);
        localStorage.setItem('prob_filterProbability', filterProbability);
        localStorage.setItem('prob_viewSearchText', viewSearchText);
    }, [selectedDivision, listMode, fromDate, toDate, filterProbability, viewSearchText]);
    const [enquiriesList, setEnquiriesList] = useState([]);
    // Removed viewMode and detail states as per request



    useEffect(() => {
        const loadDivisions = async () => {
            if (!currentUser) return;
            try {
                const userEmail = currentUser?.EmailId || currentUser?.email || '';
                if (!userEmail) return;
                const res = await fetch(`${API_BASE}/api/probability/divisions?userEmail=${encodeURIComponent(userEmail)}`);
                if (!res.ok) return;
                const data = await res.json();
                const list = Array.isArray(data?.divisions) ? data.divisions.map((d) => String(d || '').trim()).filter(Boolean) : [];
                setDivisionOptions(list);
                if (!list.length) {
                    setSelectedDivision('');
                    return;
                }
                const existing = String(selectedDivision || '').trim().toLowerCase();
                const hit = list.find((d) => d.toLowerCase() === existing);
                setSelectedDivision(hit || data?.selectedDivision || list[0]);
            } catch (e) {
                console.error('ProbabilityForm: failed to load divisions', e);
                setDivisionOptions([]);
                setSelectedDivision('');
            }
        };
        loadDivisions();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser?.EmailId, currentUser?.email]);

    // --- Fetch List ---
    useEffect(() => {
        if (currentUser && selectedDivision) {
            console.log('ProbabilityForm: Current User:', currentUser);
            fetchList();
        }
    }, [listMode, fromDate, toDate, filterProbability, selectedDivision, currentUser]);

    useEffect(() => {
        if (!historyReqNo) return undefined;
        const onKeyDown = (e) => {
            if (e.key !== 'Escape') return;
            e.preventDefault();
            setHistoryReqNo('');
            setHistoryRows([]);
            setHistoryHeader({ projectName: '', leadJobName: '' });
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [historyReqNo]);

    const fetchList = async () => {
        setLoadingList(true);
        try {
            const queryParams = new URLSearchParams({
                mode: listMode,
                fromDate: fromDate || '',
                toDate: toDate || '',
                probability: filterProbability || '',
                userEmail: currentUser?.EmailId || currentUser?.email || '',
                userDepartment: currentUser?.Department || '',
                division: selectedDivision || ''
            });

            const url = `${API_BASE}/api/probability/list?${queryParams}`;
            console.log('ProbabilityForm: Fetching list from:', url);
            const res = await fetch(url);
            if (res.ok) {
                const data = (await res.json()).map((item, index) => {
                    if (item.QuoteOptions && typeof item.QuoteOptions === 'string') {
                        if (item.QuoteOptions.includes('::')) {
                            // Parse custom delimited string: OptionName::Price##OptionName2::Price2
                            item.QuoteOptions = item.QuoteOptions.split('##').map(opt => {
                                const parts = opt.split('::');
                                // Handle potential multiple :: if name contains it, though unlikely. 
                                // Better: last part is price, rest is name.
                                const priceVal = parts.pop();
                                const nameVal = parts.join('::');
                                return { name: nameVal || '', price: parseFloat(priceVal) || 0 };
                            });
                        } else {
                            try {
                                item.QuoteOptions = JSON.parse(item.QuoteOptions);
                            } catch (e) {
                                item.QuoteOptions = [];
                            }
                        }
                    } else if (!Array.isArray(item.QuoteOptions)) {
                        item.QuoteOptions = [];
                    }

                    console.log(`Enquiry ${item.RequestNo} API Data:`, { FilteredQuoteRefs: item.FilteredQuoteRefs, FinalQuoteRefsTarget: item.FinalQuoteRefsTarget });
                    // Handle QuoteRefsData from new FilteredQuoteRefs or legacy fields
                    let qRefsRaw = item.FilteredQuoteRefs || item.FinalQuoteRefsTarget || item.FinalQuoteRefTarget || item.QuoteRefsData;

                    if (qRefsRaw) {
                        if (typeof qRefsRaw === 'string') {
                            // If it starts with [ it's JSON from previous attempt or different version
                            if (qRefsRaw.trim().startsWith('[')) {
                                try {
                                    item.QuoteRefs = JSON.parse(qRefsRaw);
                                } catch (e) {
                                    item.QuoteRefs = qRefsRaw.split(',').filter(Boolean);
                                }
                            } else {
                                // STRING_AGG format: "Ref|ToName|LeadJob|QuoteDate|QuoteType"
                                item.QuoteRefs = qRefsRaw.split(',').filter(Boolean).map(refStr => {
                                    const parts = refStr.includes('|') ? refStr.split('|') : [refStr, 'N/A', ''];
                                    const ref = (parts[0] || '').trim();
                                    const name = (parts[1] || 'N/A').trim();
                                    const dateSeg = (parts[3] || '').trim();
                                    const dateIsDate =
                                        /^\d{4}-\d{2}-\d{2}/.test(dateSeg) ||
                                        (dateSeg && !Number.isNaN(Date.parse(dateSeg)));
                                    let quoteDate = null;
                                    let leadJob = '';
                                    let quoteType = '';
                                    let totalAmount = null;
                                    if (parts.length >= 4 && dateIsDate) {
                                        quoteDate = dateSeg;
                                        leadJob = (parts[2] || '').trim();
                                        quoteType = (parts[4] || '').trim();
                                        totalAmount = (parts[5] || '').trim() || null;
                                    } else if (parts.length >= 4) {
                                        leadJob = parts.slice(2, -1).join('|').trim();
                                        quoteType = (parts[parts.length - 1] || '').trim();
                                    } else {
                                        leadJob = parts.slice(2).join('|').trim();
                                    }
                                    return {
                                        QuoteNumber: ref,
                                        ToName: name,
                                        LeadJob: String(leadJob || '').trim(),
                                        QuoteDate: quoteDate || null,
                                        QuoteType: quoteType || '',
                                        TotalAmount: totalAmount,
                                    };
                                }).sort((a, b) => {
                                    const extractLeadCode = (quoteNo) => {
                                        const m = String(quoteNo || '').toUpperCase().match(/\/L(\d+)\b/);
                                        return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
                                    };
                                    const aCode = extractLeadCode(a.QuoteNumber);
                                    const bCode = extractLeadCode(b.QuoteNumber);
                                    if (aCode !== bCode) return aCode - bCode;
                                    return String(a.QuoteNumber || '').localeCompare(String(b.QuoteNumber || ''));
                                });
                            }
                        } else if (Array.isArray(qRefsRaw)) {
                            item.QuoteRefs = qRefsRaw;
                        } else {
                            item.QuoteRefs = [];
                        }
                    } else {
                        item.QuoteRefs = [];
                    }

                    /* 
                    // STRICT FILTER: Filter QuoteRefs based on user's department scope (Step 1922)
                    // REMOVED: This was incorrectly matching user department with customer name (ToName).
                    // Backend already filters FilteredQuoteRefs based on division/email access.
                    if (item.QuoteRefs && item.QuoteRefs.length > 0) {
                        const userDept = (currentUser?.Department || currentUser?.Division || '').trim().toLowerCase();
                        const isSubUser = userDept && userDept !== 'civil' && userDept !== 'admin' && currentUser?.Roles !== 'Admin' && currentUser?.role !== 'Admin';

                        if (isSubUser) {
                            item.QuoteRefs = item.QuoteRefs.filter(q => {
                                const toName = (q.ToName || '').toLowerCase();
                                return toName.includes(userDept) || userDept.includes(toName);
                            });
                        }
                    }
                    */


                    // Robust Quoted Values
                    item.TotalQuotedValue = item.TotalQuotedValue || item.totalquotedvalue;
                    item.NetQuotedValue = item.NetQuotedValue || item.netquotedvalue;

                    // Follow Up Gross Margin shares Probability.GrossMargin with Won GP %
                    if (item.GrossMargin == null || item.GrossMargin === '') {
                        item.GrossMargin = item.WonGrossProfit ?? '';
                    }

                    // Align net quoted with EnquiryQuotes.TotalAmount for the saved quote ref
                    const savedRef = String(item.WonQuoteRef || '').trim();
                    if (savedRef) {
                        const netFromQuote = netQuotedFromQuoteRefList(item.QuoteRefs, savedRef);
                        if (netFromQuote != null) {
                            item.SelectedNetQuotedValue = netFromQuote;
                        }
                    }

                    if (item.QuoteRefs && item.QuoteRefs.length > 0) {
                        console.log(`Enquiry ${item.RequestNo} QuoteRefs:`, item.QuoteRefs);
                    }
                    return item;
                });
                setEnquiriesList(data);
                // Capture baseline snapshots so the Update button can detect real edits.
                const initialSnapshots = {};
                data.forEach((row) => {
                    if (row?.RequestNo != null) {
                        initialSnapshots[row.RequestNo] = buildProbItemSnapshot(row);
                    }
                });
                setItemSnapshots(initialSnapshots);
                // Clear stale "SAVED" indicators when refreshing the list.
                setUpdatedItems({});
            } else {
                console.error("Failed to fetch list");
                setEnquiriesList([]);
                setItemSnapshots({});
            }
        } catch (err) {
            console.error("Error fetching list:", err);
            setEnquiriesList([]);
        } finally {
            setLoadingList(false);
        }
    };

    const formatHistoryDateTime = (iso) => {
        if (!iso) return '';
        try {
            return format(new Date(iso), 'dd-MMM-yy hh:mm a', { locale: enUS });
        } catch {
            return '';
        }
    };

    /** At least one quote in scope for this enquiry (division-filtered QuoteRefs from API). */
    const enquiryHasGeneratedQuotes = (item) =>
        Array.isArray(item?.QuoteRefs) && item.QuoteRefs.length > 0;

    /** Label next to project name: from WonCustomerName or the selected row in QuoteRefs (ToName). */
    const customerNameForQuoteRef = (item) => {
        const ref = String(item?.WonQuoteRef || '').trim();
        if (!ref) return '';
        let name = String(item?.WonCustomerName || '').trim();
        if (!name && Array.isArray(item?.QuoteRefs)) {
            const hit = item.QuoteRefs.find((q) => {
                const num = typeof q === 'string' ? String(q).trim() : String(q?.QuoteNumber || q?.value || '').trim();
                return num === ref;
            });
            if (hit && typeof hit === 'object') {
                name = String(hit.ToName || hit.customer || '').trim();
            }
        }
        return name;
    };

    /** Quote type from EnquiryQuotes for the selected quote ref (Won / Lost / Follow Up). */
    const quoteTypeForQuoteRef = (item) => {
        const ref = String(item?.WonQuoteRef || '').trim();
        if (!ref) return '';
        const statusNorm = String(item?.Status || '').trim().toLowerCase().replace(/-/g, '');
        if (!['won', 'lost', 'followup'].includes(statusNorm)) return '';

        let quoteType = String(item?.WonQuoteType || '').trim();
        if (!quoteType && Array.isArray(item?.QuoteRefs)) {
            const hit = item.QuoteRefs.find((q) => {
                const num = typeof q === 'string' ? String(q).trim() : String(q?.QuoteNumber || q?.value || '').trim();
                return num === ref;
            });
            if (hit && typeof hit === 'object') {
                quoteType = String(hit.QuoteType || hit.quoteType || '').trim();
            }
        }
        return quoteType;
    };

    const quoteRefLabelWithDate = (ref, dateVal) => {
        const r = String(ref || '').trim();
        if (!r) return '';
        const d = (() => {
            if (!dateVal) return '';
            try {
                return format(new Date(dateVal), 'dd-MMM-yy', { locale: enUS });
            } catch {
                return '';
            }
        })();
        return d ? `${r} (${d})` : r;
    };

    const buildQuoteRefOptions = (item) =>
        (Array.isArray(item?.QuoteRefs) ? item.QuoteRefs : []).map((q) => {
            if (typeof q === 'string') {
                return {
                    value: q,
                    label: quoteRefLabelWithDate(q, null),
                    quoteDate: null,
                    customer: 'N/A',
                    leadJob: '',
                };
            }
            const v = q.QuoteNumber || q.value || '';
            const qd = q.QuoteDate || q.quoteDate || null;
            return {
                value: v,
                label: quoteRefLabelWithDate(v, qd),
                quoteDate: qd,
                customer: q.ToName || q.customer || '',
                leadJob: q.LeadJob || q.leadJob || '',
                quoteType: q.QuoteType || q.quoteType || '',
            };
        });

    /** Returns true if any tracked field on this row differs from its stored baseline snapshot. */
    const hasItemChanges = useCallback((item) => {
        if (!item) return false;
        const snap = itemSnapshots[item.RequestNo];
        if (!snap) return false;
        return PROB_TRACKED_FIELDS.some(
            (f) => normalizeTrackedValue(snap[f]) !== normalizeTrackedValue(item[f])
        );
    }, [itemSnapshots]);

    const quoteRefSelectValue = (item) => {
        const ref = String(item?.WonQuoteRef || '').trim();
        if (!ref) return null;
        const opts = buildQuoteRefOptions(item);
        const sel = opts.find((o) => o.value === ref);
        let dt = sel?.quoteDate;
        if (item.WonQuoteRefDate != null && item.WonQuoteRefDate !== '') {
            dt = item.WonQuoteRefDate;
        }
        return {
            value: ref,
            label: quoteRefLabelWithDate(ref, dt),
            quoteDate: dt,
            customer: sel?.customer,
            leadJob: sel?.leadJob,
        };
    };

    // --- Handlers ---

    // New: Handle Status Change in List (specifically for FollowUp)
    // --- Handlers ---

    // Generic Inline State Update (Does NOT save to backend)
    const handleUpdate = (item, updates) => {
        // Update local state ONLY
        const updatedItem = { ...item, ...updates };
        setEnquiriesList(prev => prev.map(e =>
            e.RequestNo === item.RequestNo ? updatedItem : e
        ));
        // Reset updated status on edit
        if (updatedItems && updatedItems[item.RequestNo]) {
            setUpdatedItems(prev => {
                const newState = { ...prev };
                delete newState[item.RequestNo];
                return newState;
            });
        }
    };

    // PERSISTence handler called by Update button
    const persistUpdate = async (item) => {
        // 1. Mandatory Validation for "Won" status
        if (item.Status === 'Won') {
            if (!item.WonQuoteRef) {
                alert('Quote Reference is mandatory for Won status.');
                return;
            }
            // Clean value for check
            const rawVal = String(item.WonOrderValue || '').replace(/,/g, '').replace(/BD/g, '').trim();
            if (!item.WonOrderValue || isNaN(rawVal) || Number(rawVal) <= 0) {
                alert('Valid Job Value is mandatory for Won status.');
                return;
            }
            if (!item.WonJobNo || !item.WonJobNo.trim()) {
                alert('ERP Job No. is mandatory for Won status.');
                return;
            }
            if (!item.ExpectedOrderDate) {
                alert('Booked Date is mandatory for Won status.');
                return;
            }
            if (item.WonGrossProfit === null || item.WonGrossProfit === undefined || item.WonGrossProfit === '') {
                alert('GP % is mandatory for Won status.');
                return;
            }
        }

        if (item.Status === 'Lost') {
            if (!String(item.LostCompetitor || '').trim()) {
                alert('Lost To is mandatory for Lost status.');
                return;
            }
            if (!String(item.LostReason || '').trim()) {
                alert('Reason for losing is mandatory for Lost status.');
                return;
            }
            const priceRaw = String(item.LostCompetitorPrice ?? '')
                .replace(/,/g, '')
                .replace(/BD/gi, '')
                .trim();
            if (priceRaw === '' || Number.isNaN(Number(priceRaw))) {
                alert("Competitor's price is mandatory for Lost status (enter a number, 0 is allowed).");
                return;
            }
            if (Number(priceRaw) < 0) {
                alert("Competitor's price cannot be negative.");
                return;
            }
            const lostDateVal = item.LostDate;
            if (lostDateVal == null || (typeof lostDateVal === 'string' && !lostDateVal.trim())) {
                alert('Lost Date is mandatory for Lost status.');
                return;
            }
            const lostTime = new Date(lostDateVal).getTime();
            if (Number.isNaN(lostTime)) {
                alert('Lost Date is invalid. Please select a valid date.');
                return;
            }
        }

        // 2. Mandatory Validation for "FollowUp" status
        // 2. Mandatory Validation for "FollowUp" status
        if (item.Status === 'FollowUp' || item.Status === 'Follow-up') {
            // Mandatory for ALL FollowUp scenarios
            if (!item.WonQuoteRef || String(item.WonQuoteRef).trim() === '') {
                alert('Quote Reference is mandatory for Follow Up.');
                return;
            }
            if (!item.ProbabilityOption || String(item.ProbabilityOption).trim() === '') {
                alert('Probability is mandatory for Follow Up.');
                return;
            }

            const gmRaw = String(item.GrossMargin ?? '').replace(/,/g, '').trim();
            if (gmRaw === '' || Number.isNaN(Number(gmRaw))) {
                alert('Gross Margin is mandatory for Follow Up.');
                return;
            }
            if (Number(gmRaw) < 0 || Number(gmRaw) > 100) {
                alert('Gross Margin must be between 0 and 100.');
                return;
            }

            const dateVal = item.ExpectedOrderDate;
            if (!dateVal || String(dateVal).trim() === '' || String(dateVal) === 'null' || String(dateVal) === 'undefined' || String(dateVal) === '0000-00-00') {
                alert('Expected Date is mandatory for Follow Up.');
                return;
            }
        }

        setUpdatingReqNo(item.RequestNo);
        try {
            // For Follow-up status, use NetQuotedValue as CustomerPreferredPrice if not explicitly set
            let customerPreferredPrice = item.CustomerPreferredPrice;
            if ((item.Status === 'FollowUp' || item.Status === 'Follow-up') && !customerPreferredPrice && item.NetQuotedValue) {
                customerPreferredPrice = String(item.NetQuotedValue).replace(/,/g, '').replace(/BD/g, '').trim();
            }

            const payload = {
                enquiryNo: item.RequestNo,
                projectName: item.ProjectName,
                leadJobName: item.LeadJobName || '',
                userEmail: currentUser?.EmailId || currentUser?.email || '',
                division: selectedDivision || '',
                toName: item.WonCustomerName || '',
                totalQuotedValue: item.SelectedTotalQuotedValue ?? item.TotalQuotedValue,
                netQuotedValue: resolveRowNetQuotedNumber(item) ?? item.NetQuotedValue,
                status: item.Status,
                probabilityOption: item.ProbabilityOption,
                remarks: item.ProbabilityRemarks,
                wonDetails: {
                    customerName: item.WonCustomerName,
                    orderValue: String(item.WonOrderValue || '').replace(/,/g, '').replace(/BD/g, '').trim(),
                    jobNo: item.WonJobNo,
                    wonQuoteRef: item.WonQuoteRef,
                    wonOption: item.WonOption,
                    grossProfit: item.WonGrossProfit != null && item.WonGrossProfit !== '' ? parseFloat(item.WonGrossProfit) : null,
                },
                customerPreferredPrice: customerPreferredPrice,
                expectedDate: item.ExpectedOrderDate,
                grossMargin: (() => {
                    if (!(item.Status === 'FollowUp' || item.Status === 'Follow-up')) return null;
                    const raw = String(item.GrossMargin ?? '').replace(/,/g, '').trim();
                    if (raw === '' || Number.isNaN(Number(raw))) return null;
                    return parseFloat(raw);
                })(),
                lostDetails: {
                    customer: item.LostCompetitor,
                    reason: item.LostReason,
                    competitorPrice: String(item.LostCompetitorPrice || '').replace(/,/g, '').replace(/BD/g, '').trim(),
                    lostDate: item.LostDate
                }
            };

            const res = await fetch(`${API_BASE}/api/probability/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                // alert(`Enquiry ${item.RequestNo} updated successfully. Saved Date: ${item.ExpectedOrderDate || 'None'}`);
                setUpdatedItems(prev => ({ ...prev, [item.RequestNo]: true }));
                // Refresh the baseline so the Update button stays disabled until the next user edit.
                setItemSnapshots(prev => ({ ...prev, [item.RequestNo]: buildProbItemSnapshot(item) }));

                // Optionally refresh list if it moves out of current mode (e.g. Pending -> Won)
                if (listMode === 'Pending') {
                    fetchList();
                }
            } else {
                const errData = await res.json();
                alert(`Update failed: ${errData.error || 'Server error'}`);
            }
        } catch (err) {
            console.error("Error saving probability:", err);
            alert("Connection error while saving.");
        } finally {
            setUpdatingReqNo(null);
        }
    };

    const handleStatusChange = (item, newStatus) => {
        handleUpdate(item, { Status: newStatus });
    };

    const fetchHistory = async (item) => {
        const requestNo = item?.RequestNo;
        try {
            setHistoryReqNo(String(requestNo || ''));
            setHistoryHeader({
                projectName: item?.ProjectName || '',
                leadJobName: item?.LeadJobName || '',
            });
            setHistoryLoading(true);
            const userEmail = currentUser?.EmailId || currentUser?.email || '';
            const qs = new URLSearchParams({
                userEmail,
                division: selectedDivision || '',
            });
            const res = await fetch(`${API_BASE}/api/probability/history/${encodeURIComponent(requestNo)}?${qs.toString()}`);
            if (!res.ok) throw new Error('Failed to load history');
            const data = await res.json();
            const rows = Array.isArray(data) ? data : [];
            setHistoryRows(rows);
            if (rows.length > 0) {
                const top = rows[0];
                setHistoryHeader((h) => ({
                    projectName: (h.projectName && String(h.projectName).trim()) ? h.projectName : (top.ProjectName || ''),
                    leadJobName: (h.leadJobName && String(h.leadJobName).trim()) ? h.leadJobName : (top.LeadJobName || ''),
                }));
            }
        } catch (e) {
            console.error('Probability history load failed', e);
            setHistoryRows([]);
            alert('Failed to load probability history.');
        } finally {
            setHistoryLoading(false);
        }
    };

    const fetchQuoteDetails = async (quoteNumber) => {
        try {
            const userEmail = currentUser?.EmailId || currentUser?.email || '';
            const res = await fetch(`${API_BASE}/api/probability/quote-details/${encodeURIComponent(quoteNumber)}?userEmail=${encodeURIComponent(userEmail)}&division=${encodeURIComponent(selectedDivision || '')}`);
            if (res.ok) {
                return await res.json();
            }
        } catch (err) {
            console.error("Error fetching quote details:", err);
        }
        return null;
    };

    const handleQuoteRefSelection = async (item, option) => {
        const nextRef = option ? option.value : '';
        const nextLead = option?.leadJob || '';
        if (!nextRef) {
            handleUpdate(item, {
                WonQuoteRef: '',
                LeadJobName: '',
                WonCustomerName: '',
                WonQuoteRefDate: '',
                WonQuoteType: '',
                SelectedTotalQuotedValue: null,
                SelectedNetQuotedValue: null,
                QuotePreparedBy: '',
            });
            return;
        }
        const localNet = netQuotedFromQuoteRefList(item.QuoteRefs, nextRef);
        // Apply EnquiryQuotes.TotalAmount immediately from list payload
        handleUpdate(item, {
            WonQuoteRef: nextRef,
            LeadJobName: nextLead,
            WonCustomerName: option?.customer || item.WonCustomerName || '',
            WonQuoteRefDate: option?.quoteDate ?? null,
            WonQuoteType: option?.quoteType || '',
            SelectedNetQuotedValue: localNet ?? null,
        });
        const details = await fetchQuoteDetails(nextRef);
        if (!details) return;
        handleUpdate(item, {
            WonQuoteRef: nextRef,
            LeadJobName: nextLead,
            WonCustomerName: details.customerName || option?.customer || item.WonCustomerName || '',
            WonQuoteRefDate: details.quoteDate ?? option?.quoteDate ?? null,
            WonQuoteType: details.quoteType || option?.quoteType || '',
            SelectedTotalQuotedValue: details.totalQuotedValue ?? null,
            SelectedNetQuotedValue: details.netQuotedValue ?? localNet ?? null,
            QuotePreparedBy: details.preparedBy != null && details.preparedBy !== '' ? String(details.preparedBy) : '',
            ...(details.options ? { QuoteOptions: details.options } : {}),
            ...(details.totalAmount != null && item.Status === 'Won'
                ? { WonOrderValue: details.totalAmount }
                : {}),
        });
    };

    const handleInlineUpdate = async (item, field, value) => {
        if (field === 'WonQuoteRef' && !value) {
            handleUpdate(item, { WonQuoteRef: '', WonCustomerName: '', WonQuoteRefDate: '', WonQuoteType: '' });
            return;
        }
        if (field === 'WonQuoteRef' && value) {
            const details = await fetchQuoteDetails(value);
            const localNet = netQuotedFromQuoteRefList(item.QuoteRefs, value);
            if (details || localNet != null) {
                const updates = {
                    WonQuoteRef: value,
                    WonCustomerName: details?.customerName ?? item.WonCustomerName ?? '',
                    WonQuoteRefDate: details?.quoteDate ?? item.WonQuoteRefDate ?? '',
                    WonQuoteType: details?.quoteType || item.WonQuoteType || '',
                    WonOrderValue: details?.totalAmount ?? item.WonOrderValue,
                    SelectedTotalQuotedValue: details?.totalQuotedValue ?? item.SelectedTotalQuotedValue,
                    SelectedNetQuotedValue: details?.netQuotedValue ?? localNet ?? null,
                    QuotePreparedBy: details?.preparedBy != null && details?.preparedBy !== '' ? String(details.preparedBy) : '',
                };

                // If there are options, we don't auto-fill WonOrderValue yet, 
                // or we fill it if there's only one? User said "if optional price is not available directly fill the quoted value"
                // So if options exist, we might want to clear WonOrderValue or wait for option selection.
                // Let's store options in the item for the UI to pick up.
                updates.QuoteOptions = details?.options || [];

                handleUpdate(item, updates);
                return;
            }
        }

        // Handle Option selection
        if (field === 'WonOption' && value) {
            const selectedOpt = (item.QuoteOptions || []).find(o => o.name === value);
            if (selectedOpt) {
                handleUpdate(item, { WonOption: value, WonOrderValue: selectedOpt.price });
                return;
            }
        }

        handleUpdate(item, { [field]: value });
    };

    // Removed handleSelectEnquiry, fetchQuotes, handleProbabilityChange, handleDetailsChange, handleSubmit

    const customerKey = (item) => {
        const s = String(customerNameForQuoteRef(item) || '').trim();
        return s || '—';
    };
    const projectKey = (item) => {
        const s = String(item.ProjectName || '').trim();
        return s || '—';
    };
    const statusKey = (item) => String(item.Status || '').trim() || '—';
    const quoteTypeKey = (item) => {
        const s = String(quoteTypeForQuoteRef(item) || '').trim();
        return s || '—';
    };
    const probabilityKey = (item) => {
        const s = String(item.ProbabilityOption || item.ProbabilityChance || '').trim();
        return s || '—';
    };
    const expectedDateKey = (item) => {
        const raw = item.ExpectedOrderDate;
        if (!raw) return '—';
        try {
            const d = raw instanceof Date ? raw : new Date(raw);
            if (Number.isNaN(d.getTime())) return '—';
            return format(d, 'yyyy-MM-dd');
        } catch {
            return '—';
        }
    };
    const formatExpectedDateLabel = (key) => {
        if (!key || key === '—') return '—';
        try {
            const d = new Date(`${key}T00:00:00`);
            if (Number.isNaN(d.getTime())) return key;
            return format(d, 'dd-MMM-yyyy', { locale: enUS });
        } catch {
            return key;
        }
    };
    const expectedDateSortValue = (item) => {
        const raw = item.ExpectedOrderDate;
        if (!raw) return null;
        const d = raw instanceof Date ? raw : new Date(raw);
        const t = d.getTime();
        return Number.isNaN(t) ? null : t;
    };
    const probabilitySortValue = (item) => {
        const s = probabilityKey(item);
        const m = String(s).match(/(\d+)\s*%/);
        return m ? Number(m[1]) : -1;
    };
    const detailQuoteRefKey = (item) => {
        const s = String(item.WonQuoteRef || '').trim();
        return s || '—';
    };
    const wonJobNoKey = (item) => {
        const s = String(item.WonJobNo || '').trim();
        return s || '—';
    };
    const wonBookedDateKey = (item) => expectedDateKey(item);
    const detailRemarksKey = (item) => {
        const s = String(item.ProbabilityRemarks || '').trim();
        return s || '—';
    };
    const lostToKey = (item) => {
        const s = String(item.LostCompetitor || '').trim();
        return s || '—';
    };
    const lostReasonKey = (item) => {
        const s = String(item.LostReason || '').trim();
        return s || '—';
    };
    const lostDateKey = (item) => {
        const raw = item.LostDate;
        if (!raw) return '—';
        try {
            const d = raw instanceof Date ? raw : new Date(raw);
            if (Number.isNaN(d.getTime())) return '—';
            return format(d, 'yyyy-MM-dd');
        } catch {
            return '—';
        }
    };
    const wonJobValueNum = (item) => {
        const raw = String(item.WonOrderValue ?? '').replace(/,/g, '').replace(/BD/gi, '').trim();
        const n = parseFloat(raw);
        return Number.isFinite(n) ? n : null;
    };
    const wonGpPctNum = (item) => {
        const n = Number(item.WonGrossProfit);
        return Number.isFinite(n) ? n : null;
    };
    const grossMarginNum = (item) => {
        const n = Number(item.GrossMargin);
        return Number.isFinite(n) ? n : null;
    };
    const lostCompetitorPriceNum = (item) => {
        const raw = String(item.LostCompetitorPrice ?? '').replace(/,/g, '').replace(/BD/gi, '').trim();
        const n = parseFloat(raw);
        return Number.isFinite(n) ? n : null;
    };
    const lostDateSortValue = (item) => {
        const raw = item.LostDate;
        if (!raw) return null;
        const d = raw instanceof Date ? raw : new Date(raw);
        const t = d.getTime();
        return Number.isNaN(t) ? null : t;
    };
    const applyNumericColumnFilter = (rows, filterState, getValue) => {
        if (!filterState || filterState.mode === 'all') return rows;
        const v1 = parseFloat(String(filterState.v1 ?? '').replace(/,/g, '').trim());
        const v2 = parseFloat(String(filterState.v2 ?? '').replace(/,/g, '').trim());
        return rows.filter((r) => {
            const n = getValue(r);
            if (n === null || Number.isNaN(n)) return false;
            switch (filterState.mode) {
                case 'gt':
                    return !Number.isNaN(v1) && n > v1;
                case 'lt':
                    return !Number.isNaN(v1) && n < v1;
                case 'eq':
                    return !Number.isNaN(v1) && Math.abs(n - v1) < 1e-6;
                case 'gte':
                    return !Number.isNaN(v1) && n >= v1;
                case 'lte':
                    return !Number.isNaN(v1) && n <= v1;
                case 'between':
                    if (Number.isNaN(v1) || Number.isNaN(v2)) return false;
                    return n >= Math.min(v1, v2) && n <= Math.max(v1, v2);
                default:
                    return true;
            }
        });
    };

    const columnUniques = useMemo(() => {
        const enquiry = new Set();
        const project = new Set();
        const customer = new Set();
        const status = new Set();
        const quoteType = new Set();
        const probability = new Set();
        const expectedDate = new Set();
        const detailQuoteRef = new Set();
        const wonJobNo = new Set();
        const wonBookedDate = new Set();
        const detailRemarks = new Set();
        const lostTo = new Set();
        const lostReason = new Set();
        const lostDate = new Set();
        for (const item of enquiriesList) {
            enquiry.add(String(item.RequestNo ?? ''));
            project.add(projectKey(item));
            customer.add(customerKey(item));
            status.add(statusKey(item));
            quoteType.add(quoteTypeKey(item));
            probability.add(probabilityKey(item));
            expectedDate.add(expectedDateKey(item));
            detailQuoteRef.add(detailQuoteRefKey(item));
            wonJobNo.add(wonJobNoKey(item));
            wonBookedDate.add(wonBookedDateKey(item));
            detailRemarks.add(detailRemarksKey(item));
            lostTo.add(lostToKey(item));
            lostReason.add(lostReasonKey(item));
            lostDate.add(lostDateKey(item));
        }
        const probOrder = [
            'Low Chance (25%)',
            '50-50 Chance (50%)',
            'Medium Chance (75%)',
            'High Chance (90%)',
            'Very High Chance (99%)',
            'No Chance (0%)',
            '—',
        ];
        return {
            enquiry: [...enquiry].sort(compareEnquiryNo),
            project: [...project].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
            customer: [...customer].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
            status: [...status].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
            quoteType: [...quoteType].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
            probability: [...probability].sort((a, b) => {
                const ia = probOrder.indexOf(a);
                const ib = probOrder.indexOf(b);
                if (ia >= 0 || ib >= 0) return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
                return a.localeCompare(b, undefined, { sensitivity: 'base' });
            }),
            expectedDate: [...expectedDate].sort((a, b) => {
                if (a === '—') return 1;
                if (b === '—') return -1;
                return a.localeCompare(b);
            }),
            detailQuoteRef: [...detailQuoteRef].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
            wonJobNo: [...wonJobNo].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
            wonBookedDate: [...wonBookedDate].sort((a, b) => {
                if (a === '—') return 1;
                if (b === '—') return -1;
                return a.localeCompare(b);
            }),
            detailRemarks: [...detailRemarks].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
            lostTo: [...lostTo].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
            lostReason: [...lostReason].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
            lostDate: [...lostDate].sort((a, b) => {
                if (a === '—') return 1;
                if (b === '—') return -1;
                return a.localeCompare(b);
            }),
        };
    }, [enquiriesList]);

    const filteredSortedRows = useMemo(() => {
        let rows = [...enquiriesList];
        const q = String(viewSearchText || '').trim().toLowerCase();
        if (q) {
            rows = rows.filter((r) => {
                const enquiryNo = String(r.RequestNo ?? '').toLowerCase();
                const proj = String(r.ProjectName ?? '').toLowerCase();
                const cust = customerKey(r).toLowerCase();
                return enquiryNo.includes(q) || proj.includes(q) || cust.includes(q);
            });
        }
        if (colFEnquiry !== null) {
            rows = rows.filter((r) => colFEnquiry.has(String(r.RequestNo ?? '')));
        }
        if (colFProject !== null) {
            rows = rows.filter((r) => colFProject.has(projectKey(r)));
        }
        if (colFCustomer !== null) {
            rows = rows.filter((r) => colFCustomer.has(customerKey(r)));
        }
        if (colFStatus !== null) {
            rows = rows.filter((r) => colFStatus.has(statusKey(r)));
        }
        if (colFQuoteType !== null) {
            rows = rows.filter((r) => colFQuoteType.has(quoteTypeKey(r)));
        }
        if (colFProbability !== null) {
            rows = rows.filter((r) => colFProbability.has(probabilityKey(r)));
        }
        if (colFExpectedDate !== null) {
            rows = rows.filter((r) => colFExpectedDate.has(expectedDateKey(r)));
        }
        if (colFDetailQuoteRef !== null) {
            rows = rows.filter((r) => colFDetailQuoteRef.has(detailQuoteRefKey(r)));
        }
        if (colFWonJobNo !== null) {
            rows = rows.filter((r) => colFWonJobNo.has(wonJobNoKey(r)));
        }
        if (colFWonBookedDate !== null) {
            rows = rows.filter((r) => colFWonBookedDate.has(wonBookedDateKey(r)));
        }
        if (colFDetailRemarks !== null) {
            rows = rows.filter((r) => colFDetailRemarks.has(detailRemarksKey(r)));
        }
        if (colFLostTo !== null) {
            rows = rows.filter((r) => colFLostTo.has(lostToKey(r)));
        }
        if (colFLostReason !== null) {
            rows = rows.filter((r) => colFLostReason.has(lostReasonKey(r)));
        }
        if (colFLostDate !== null) {
            rows = rows.filter((r) => colFLostDate.has(lostDateKey(r)));
        }
        rows = applyNumericColumnFilter(rows, colFWonJobValue, wonJobValueNum);
        rows = applyNumericColumnFilter(rows, colFWonGpPct, wonGpPctNum);
        rows = applyNumericColumnFilter(rows, colFGrossMargin, grossMarginNum);
        rows = applyNumericColumnFilter(rows, colFLostCompetitorPrice, lostCompetitorPriceNum);
        if (colFNet && colFNet.mode !== 'all') {
            const v1 = parseFloat(String(colFNet.v1 ?? '').replace(/,/g, '').trim());
            const v2 = parseFloat(String(colFNet.v2 ?? '').replace(/,/g, '').trim());
            rows = rows.filter((r) => {
                const n = getRowNetQuotedNumber(r, currentUser);
                if (n === null || Number.isNaN(n)) return false;
                switch (colFNet.mode) {
                    case 'gt':
                        return !Number.isNaN(v1) && n > v1;
                    case 'lt':
                        return !Number.isNaN(v1) && n < v1;
                    case 'eq':
                        return !Number.isNaN(v1) && Math.abs(n - v1) < 1e-6;
                    case 'gte':
                        return !Number.isNaN(v1) && n >= v1;
                    case 'lte':
                        return !Number.isNaN(v1) && n <= v1;
                    case 'between':
                        if (Number.isNaN(v1) || Number.isNaN(v2)) return false;
                        return n >= Math.min(v1, v2) && n <= Math.max(v1, v2);
                    default:
                        return true;
                }
            });
        }
        if (sortCol) {
            const mul = sortAsc ? 1 : -1;
            rows.sort((a, b) => {
                let c = 0;
                switch (sortCol) {
                    case 'enquiry':
                        c = compareEnquiryNo(a.RequestNo, b.RequestNo);
                        break;
                    case 'project':
                        c = projectKey(a).localeCompare(projectKey(b), undefined, { sensitivity: 'base' });
                        break;
                    case 'customer':
                        c = customerKey(a).localeCompare(customerKey(b), undefined, { sensitivity: 'base' });
                        break;
                    case 'net': {
                        const na = getRowNetQuotedNumber(a, currentUser);
                        const nb = getRowNetQuotedNumber(b, currentUser);
                        const fa = na === null || Number.isNaN(na) ? -Infinity : na;
                        const fb = nb === null || Number.isNaN(nb) ? -Infinity : nb;
                        c = fa === fb ? 0 : fa < fb ? -1 : 1;
                        break;
                    }
                    case 'status':
                        c = statusKey(a).localeCompare(statusKey(b), undefined, { sensitivity: 'base' });
                        break;
                    case 'quoteType':
                        c = quoteTypeKey(a).localeCompare(quoteTypeKey(b), undefined, { sensitivity: 'base' });
                        break;
                    case 'probability': {
                        const pa = probabilitySortValue(a);
                        const pb = probabilitySortValue(b);
                        c = pa === pb ? 0 : pa < pb ? -1 : 1;
                        break;
                    }
                    case 'expectedDate': {
                        const da = expectedDateSortValue(a);
                        const db = expectedDateSortValue(b);
                        const fa = da == null ? Number.POSITIVE_INFINITY : da;
                        const fb = db == null ? Number.POSITIVE_INFINITY : db;
                        c = fa === fb ? 0 : fa < fb ? -1 : 1;
                        break;
                    }
                    case 'detailQuoteRef':
                        c = detailQuoteRefKey(a).localeCompare(detailQuoteRefKey(b), undefined, { sensitivity: 'base' });
                        break;
                    case 'wonJobNo':
                        c = wonJobNoKey(a).localeCompare(wonJobNoKey(b), undefined, { sensitivity: 'base' });
                        break;
                    case 'wonBookedDate': {
                        const da = expectedDateSortValue(a);
                        const db = expectedDateSortValue(b);
                        const fa = da == null ? Number.POSITIVE_INFINITY : da;
                        const fb = db == null ? Number.POSITIVE_INFINITY : db;
                        c = fa === fb ? 0 : fa < fb ? -1 : 1;
                        break;
                    }
                    case 'detailRemarks':
                        c = detailRemarksKey(a).localeCompare(detailRemarksKey(b), undefined, { sensitivity: 'base' });
                        break;
                    case 'wonJobValue': {
                        const na = wonJobValueNum(a);
                        const nb = wonJobValueNum(b);
                        const fa = na == null ? -Infinity : na;
                        const fb = nb == null ? -Infinity : nb;
                        c = fa === fb ? 0 : fa < fb ? -1 : 1;
                        break;
                    }
                    case 'wonGpPct': {
                        const na = wonGpPctNum(a);
                        const nb = wonGpPctNum(b);
                        const fa = na == null ? -Infinity : na;
                        const fb = nb == null ? -Infinity : nb;
                        c = fa === fb ? 0 : fa < fb ? -1 : 1;
                        break;
                    }
                    case 'grossMargin': {
                        const na = grossMarginNum(a);
                        const nb = grossMarginNum(b);
                        const fa = na == null ? -Infinity : na;
                        const fb = nb == null ? -Infinity : nb;
                        c = fa === fb ? 0 : fa < fb ? -1 : 1;
                        break;
                    }
                    case 'lostTo':
                        c = lostToKey(a).localeCompare(lostToKey(b), undefined, { sensitivity: 'base' });
                        break;
                    case 'lostReason':
                        c = lostReasonKey(a).localeCompare(lostReasonKey(b), undefined, { sensitivity: 'base' });
                        break;
                    case 'lostCompetitorPrice': {
                        const na = lostCompetitorPriceNum(a);
                        const nb = lostCompetitorPriceNum(b);
                        const fa = na == null ? -Infinity : na;
                        const fb = nb == null ? -Infinity : nb;
                        c = fa === fb ? 0 : fa < fb ? -1 : 1;
                        break;
                    }
                    case 'lostDate': {
                        const da = lostDateSortValue(a);
                        const db = lostDateSortValue(b);
                        const fa = da == null ? Number.POSITIVE_INFINITY : da;
                        const fb = db == null ? Number.POSITIVE_INFINITY : db;
                        c = fa === fb ? 0 : fa < fb ? -1 : 1;
                        break;
                    }
                    default:
                        c = 0;
                }
                return c * mul;
            });
        }
        return rows;
    }, [
        enquiriesList,
        viewSearchText,
        colFEnquiry,
        colFProject,
        colFCustomer,
        colFStatus,
        colFQuoteType,
        colFProbability,
        colFExpectedDate,
        colFDetailQuoteRef,
        colFWonJobNo,
        colFWonBookedDate,
        colFDetailRemarks,
        colFLostTo,
        colFLostReason,
        colFLostDate,
        colFWonJobValue,
        colFWonGpPct,
        colFGrossMargin,
        colFLostCompetitorPrice,
        colFNet,
        sortCol,
        sortAsc,
        currentUser,
    ]);

    const handleProbabilityExcelDownload = useCallback(async () => {
        if (!filteredSortedRows.length) {
            window.alert('No data to export');
            return;
        }
        const viewModeLabel = PROBABILITY_VIEW_MODE_LABELS[listMode] || listMode || 'Probability';
        try {
            await downloadProbabilityListXlsx({
                rows: filteredSortedRows,
                viewModeLabel,
                meta: {
                    division: selectedDivision || '',
                    viewMode: viewModeLabel,
                    searchQuery: String(viewSearchText || '').trim(),
                    dateFrom: fromDate || '',
                    dateTo: toDate || '',
                    probabilityFilter: filterProbability || ''
                },
                enrichRow: (item) => {
                    const userDept = (currentUser?.Department || currentUser?.Division || '').trim().toLowerCase();
                    const isSubUser =
                        userDept &&
                        userDept !== 'civil' &&
                        userDept !== 'admin' &&
                        currentUser?.Roles !== 'Admin' &&
                        currentUser?.role !== 'Admin';
                    const netRestricted = !!(isSubUser && (!item.QuoteRefs || item.QuoteRefs.length === 0));
                    const sel = quoteRefSelectValue(item);
                    return {
                        customerName: customerNameForQuoteRef(item),
                        quoteType: quoteTypeForQuoteRef(item),
                        netQuoted: getRowNetQuotedNumber(item, currentUser),
                        netRestricted,
                        quoteRef: sel?.label || ''
                    };
                }
            });
        } catch (err) {
            console.error('Probability Excel export failed', err);
            window.alert(err?.message || 'Failed to export Excel workbook');
        }
    }, [
        filteredSortedRows,
        listMode,
        selectedDivision,
        viewSearchText,
        fromDate,
        toDate,
        filterProbability,
        currentUser,
        customerNameForQuoteRef,
        quoteTypeForQuoteRef,
        quoteRefSelectValue
    ]);

    const listAggregates = useMemo(() => {
        let sumNet = 0;
        let sumJob = 0;
        let gpSum = 0;
        let gpCount = 0;
        let sumLost = 0;
        let sumFollowup = 0;
        for (const item of filteredSortedRows) {
            const n = getRowNetQuotedNumber(item, currentUser);
            if (n !== null && !Number.isNaN(n)) sumNet += n;
            const statusNorm = String(item.Status || '').trim().toLowerCase();
            if (statusNorm === 'won') {
                const rawJv = String(item.WonOrderValue ?? '').replace(/,/g, '').replace(/BD/g, '').trim();
                const jv = parseFloat(rawJv);
                if (!Number.isNaN(jv)) sumJob += jv;
                const gp = Number(item.WonGrossProfit);
                if (item.WonGrossProfit !== null && item.WonGrossProfit !== undefined && item.WonGrossProfit !== '' && !Number.isNaN(gp)) {
                    gpSum += gp;
                    gpCount += 1;
                }
            }
            if (statusNorm === 'lost') {
                const rawLost = String(item.LostCompetitorPrice ?? '').replace(/,/g, '').replace(/BD/g, '').trim();
                const lostVal = parseFloat(rawLost);
                if (!Number.isNaN(lostVal)) sumLost += lostVal;
            }
            if (statusNorm === 'followup' || statusNorm === 'follow-up') {
                const rawFollow = String(item.WonOrderValue ?? '').replace(/,/g, '').replace(/BD/g, '').trim();
                const followVal = parseFloat(rawFollow);
                if (!Number.isNaN(followVal)) {
                    sumFollowup += followVal;
                } else if (n !== null && !Number.isNaN(n)) {
                    sumFollowup += n;
                }
            }
        }
        return {
            sumNet,
            sumJob,
            avgGp: gpCount > 0 ? gpSum / gpCount : null,
            sumLost,
            sumFollowup,
        };
    }, [filteredSortedRows, currentUser]);

    const formatSummaryAmountCompact = useCallback((value) => {
        const n = Number(value);
        if (!Number.isFinite(n) || n <= 0) return null;
        if (n >= 1000000) return `BD ${(n / 1000000).toFixed(2)} M`;
        return `BD ${(n / 1000).toFixed(2)} K`;
    }, []);

    const parseIsoDate = useCallback((value) => {
        const raw = String(value || '').trim();
        if (!raw) return null;
        const d = new Date(`${raw}T00:00:00`);
        return Number.isNaN(d.getTime()) ? null : d;
    }, []);

    const updateFilterPanelPosition = useCallback(() => {
        if (!openColFilter) {
            setFilterPanelPos(null);
            return;
        }
        const el = filterHeaderRefs.current[openColFilter];
        if (!el) {
            setFilterPanelPos(null);
            return;
        }
        const rect = el.getBoundingClientRect();
        const isNet = openColFilter === 'net';
        const isNumericDetail =
            openColFilter === 'wonJobValue' ||
            openColFilter === 'wonGpPct' ||
            openColFilter === 'grossMargin' ||
            openColFilter === 'lostCompetitorPrice';
        const baseMinW =
            openColFilter === 'status' ||
            openColFilter === 'quoteType' ||
            openColFilter === 'probability' ||
            openColFilter === 'expectedDate' ||
            openColFilter === 'detailQuoteRef' ||
            openColFilter === 'wonJobNo' ||
            openColFilter === 'wonBookedDate' ||
            openColFilter === 'detailRemarks' ||
            openColFilter === 'lostTo' ||
            openColFilter === 'lostReason' ||
            openColFilter === 'lostDate'
                ? 220
                : isNet || isNumericDetail
                  ? 240
                  : 260;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let left = isNet || isNumericDetail ? rect.right - Math.max(baseMinW, rect.width) : rect.left;
        left = Math.max(8, Math.min(left, vw - baseMinW - 8));
        const top = rect.bottom + 4;
        const capMax =
            openColFilter === 'status' || openColFilter === 'quoteType' ? 280 : isNet || isNumericDetail ? 360 : 320;
        const maxH = Math.min(capMax, Math.max(120, vh - top - 16));
        setFilterPanelPos({
            top,
            left,
            minWidth: Math.max(baseMinW, rect.width),
            maxHeight: maxH,
        });
    }, [openColFilter]);

    useLayoutEffect(() => {
        updateFilterPanelPosition();
    }, [updateFilterPanelPosition]);

    useEffect(() => {
        if (!openColFilter) return undefined;
        const onScrollOrResize = () => updateFilterPanelPosition();
        window.addEventListener('resize', onScrollOrResize);
        window.addEventListener('scroll', onScrollOrResize, true);
        const scrollEl = tableScrollWrapRef.current;
        scrollEl?.addEventListener('scroll', onScrollOrResize);
        return () => {
            window.removeEventListener('resize', onScrollOrResize);
            window.removeEventListener('scroll', onScrollOrResize, true);
            scrollEl?.removeEventListener('scroll', onScrollOrResize);
        };
    }, [openColFilter, updateFilterPanelPosition]);

    useEffect(() => {
        if (!openColFilter) return undefined;
        const onDoc = (e) => {
            if (e.target.closest('.prob-filter-panel') || e.target.closest('.prob-table-filter-header')) return;
            setOpenColFilter(null);
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [openColFilter]);

    const getMultiFilterAll = (kind) => {
        if (kind === 'enquiry') return columnUniques.enquiry;
        if (kind === 'project') return columnUniques.project;
        if (kind === 'customer') return columnUniques.customer;
        if (kind === 'status') return columnUniques.status;
        if (kind === 'quoteType') return columnUniques.quoteType;
        if (kind === 'probability') return columnUniques.probability;
        if (kind === 'expectedDate') return columnUniques.expectedDate;
        if (kind === 'detailQuoteRef') return columnUniques.detailQuoteRef;
        if (kind === 'wonJobNo') return columnUniques.wonJobNo;
        if (kind === 'wonBookedDate') return columnUniques.wonBookedDate;
        if (kind === 'detailRemarks') return columnUniques.detailRemarks;
        if (kind === 'lostTo') return columnUniques.lostTo;
        if (kind === 'lostReason') return columnUniques.lostReason;
        if (kind === 'lostDate') return columnUniques.lostDate;
        return [];
    };

    const getMultiFilterActive = (kind) => {
        if (kind === 'enquiry') return colFEnquiry;
        if (kind === 'project') return colFProject;
        if (kind === 'customer') return colFCustomer;
        if (kind === 'status') return colFStatus;
        if (kind === 'quoteType') return colFQuoteType;
        if (kind === 'probability') return colFProbability;
        if (kind === 'expectedDate') return colFExpectedDate;
        if (kind === 'detailQuoteRef') return colFDetailQuoteRef;
        if (kind === 'wonJobNo') return colFWonJobNo;
        if (kind === 'wonBookedDate') return colFWonBookedDate;
        if (kind === 'detailRemarks') return colFDetailRemarks;
        if (kind === 'lostTo') return colFLostTo;
        if (kind === 'lostReason') return colFLostReason;
        if (kind === 'lostDate') return colFLostDate;
        return null;
    };

    const getMultiFilterSetter = (kind) => {
        if (kind === 'enquiry') return setColFEnquiry;
        if (kind === 'project') return setColFProject;
        if (kind === 'customer') return setColFCustomer;
        if (kind === 'status') return setColFStatus;
        if (kind === 'quoteType') return setColFQuoteType;
        if (kind === 'probability') return setColFProbability;
        if (kind === 'expectedDate') return setColFExpectedDate;
        if (kind === 'detailQuoteRef') return setColFDetailQuoteRef;
        if (kind === 'wonJobNo') return setColFWonJobNo;
        if (kind === 'wonBookedDate') return setColFWonBookedDate;
        if (kind === 'detailRemarks') return setColFDetailRemarks;
        if (kind === 'lostTo') return setColFLostTo;
        if (kind === 'lostReason') return setColFLostReason;
        if (kind === 'lostDate') return setColFLostDate;
        return null;
    };

    const getNumericFilterState = (kind) => {
        if (kind === 'net') return colFNet;
        if (kind === 'wonJobValue') return colFWonJobValue;
        if (kind === 'wonGpPct') return colFWonGpPct;
        if (kind === 'grossMargin') return colFGrossMargin;
        if (kind === 'lostCompetitorPrice') return colFLostCompetitorPrice;
        return { mode: 'all', v1: '', v2: '' };
    };

    const setNumericFilterState = (kind, val) => {
        if (kind === 'net') setColFNet(val);
        else if (kind === 'wonJobValue') setColFWonJobValue(val);
        else if (kind === 'wonGpPct') setColFWonGpPct(val);
        else if (kind === 'grossMargin') setColFGrossMargin(val);
        else if (kind === 'lostCompetitorPrice') setColFLostCompetitorPrice(val);
    };

    const openMultiDraft = (kind) => {
        const all = getMultiFilterAll(kind);
        const active = getMultiFilterActive(kind);
        setDraftMulti(active !== null ? new Set(active) : new Set(all));
        setFilterSearch('');
        setOpenColFilter(kind);
    };

    const applyMultiDraft = (kind) => {
        const all = getMultiFilterAll(kind);
        const next = new Set(draftMulti);
        const setter = getMultiFilterSetter(kind);
        if (!setter) return;
        if (next.size === all.length) {
            setter(null);
        } else {
            setter(next);
        }
        setOpenColFilter(null);
    };

    const clearMultiFilter = (kind) => {
        const setter = getMultiFilterSetter(kind);
        if (setter) setter(null);
        setOpenColFilter(null);
    };

    const openNumericDraft = (kind) => {
        setDraftNet({ ...getNumericFilterState(kind) });
        setOpenColFilter(kind);
    };

    const toggleDetailNumericFilter = (kind, e) => {
        if (e.target.closest('.prob-filter-panel')) return;
        if (e.target.closest('[data-sort-only="true"]')) return;
        if (openColFilter === kind) {
            setOpenColFilter(null);
        } else {
            openNumericDraft(kind);
        }
    };

    const applyNumericDraft = (kind) => {
        if (draftNet.mode === 'all') {
            setNumericFilterState(kind, { mode: 'all', v1: '', v2: '' });
        } else {
            setNumericFilterState(kind, { ...draftNet });
        }
        setOpenColFilter(null);
    };

    const clearNumericFilter = (kind) => {
        setNumericFilterState(kind, { mode: 'all', v1: '', v2: '' });
        setOpenColFilter(null);
    };

    const openNetDraft = () => {
        openNumericDraft('net');
    };

    const toggleMultiColumnFilter = (kind, e) => {
        if (e.target.closest('.prob-filter-panel')) return;
        if (e.target.closest('[data-sort-only="true"]')) return;
        if (openColFilter === kind) {
            setOpenColFilter(null);
        } else {
            openMultiDraft(kind);
        }
    };

    const toggleNetColumnFilter = (e) => {
        if (e.target.closest('.prob-filter-panel')) return;
        if (e.target.closest('[data-sort-only="true"]')) return;
        if (openColFilter === 'net') {
            setOpenColFilter(null);
        } else {
            openNetDraft();
        }
    };

    const applyNetDraft = () => {
        applyNumericDraft('net');
    };

    const clearNetFilter = () => {
        clearNumericFilter('net');
    };

    const handleSortClick = (key) => {
        if (sortCol !== key) {
            setSortCol(key);
            setSortAsc(true);
        } else {
            setSortAsc((v) => !v);
        }
    };

    const sortIndicator = (key) => {
        if (sortCol !== key) return '⇅';
        return sortAsc ? '▲' : '▼';
    };

    const filterActiveClass = (kind) => {
        if (kind === 'net' || kind === 'wonJobValue' || kind === 'wonGpPct' || kind === 'grossMargin' || kind === 'lostCompetitorPrice') {
            const s = getNumericFilterState(kind);
            return s && s.mode !== 'all' ? 'text-primary' : 'text-secondary';
        }
        const s = getMultiFilterActive(kind);
        return s !== null ? 'text-primary' : 'text-secondary';
    };

    const clearAllColumnFilters = () => {
        setColFEnquiry(null);
        setColFProject(null);
        setColFCustomer(null);
        setColFStatus(null);
        setColFQuoteType(null);
        setColFProbability(null);
        setColFExpectedDate(null);
        setColFDetailQuoteRef(null);
        setColFWonJobNo(null);
        setColFWonBookedDate(null);
        setColFDetailRemarks(null);
        setColFLostTo(null);
        setColFLostReason(null);
        setColFLostDate(null);
        setColFWonJobValue({ mode: 'all', v1: '', v2: '' });
        setColFWonGpPct({ mode: 'all', v1: '', v2: '' });
        setColFGrossMargin({ mode: 'all', v1: '', v2: '' });
        setColFLostCompetitorPrice({ mode: 'all', v1: '', v2: '' });
        setColFNet({ mode: 'all', v1: '', v2: '' });
        setSortCol(null);
        setSortAsc(true);
    };

    const renderDetailFilterHeader = (label, kind, colClass, { numeric = false } = {}) => (
        <div
            ref={(el) => {
                filterHeaderRefs.current[kind] = el;
            }}
            className={`${colClass} prob-table-filter-header position-relative`}
            style={{ cursor: 'pointer' }}
            onClick={(e) => (numeric ? toggleDetailNumericFilter(kind, e) : toggleMultiColumnFilter(kind, e))}
        >
            <div className="d-flex align-items-end justify-content-between gap-1 w-100">
                <span className="fw-normal">{label}</span>
                <span className="d-flex align-items-center gap-1 flex-shrink-0">
                    <span
                        className={`user-select-none ${filterActiveClass(kind)}`}
                        style={{ fontSize: '10px', lineHeight: 1 }}
                        title="Filter"
                    >
                        ▼
                    </span>
                    <button
                        type="button"
                        data-sort-only="true"
                        className="btn btn-link p-0 text-decoration-none user-select-none"
                        style={{ fontSize: '11px', lineHeight: 1 }}
                        title="Sort"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleSortClick(kind);
                        }}
                    >
                        {sortIndicator(kind)}
                    </button>
                </span>
            </div>
        </div>
    );

    const renderProbDateHierarchyFilterPanel = (kind) => {
        const all = getMultiFilterAll(kind);
        const formatLabel = (val) => {
            if (val !== '—') return formatExpectedDateLabel(val);
            return '—';
        };
        const { dateGroups, otherKeys } = buildProbDateGroupsFromKeys(all);
        const q = String(filterSearch || '').trim();
        const visibleOther = otherKeys.filter((k) => probDateKeyMatchesSearch(k, q, formatLabel));
        const visibleYears = Object.keys(dateGroups)
            .sort((a, b) => Number(b) - Number(a))
            .filter((y) => {
                const yearValues = Object.values(dateGroups[y]).flat();
                if (!q) return true;
                if (String(y).includes(q)) return true;
                return yearValues.some((v) => probDateKeyMatchesSearch(v, q, formatLabel));
            });

        const toggleKeys = (keys, checked) => {
            setDraftMulti((prev) => {
                const n = new Set(prev);
                keys.forEach((k) => {
                    if (checked) n.add(k);
                    else n.delete(k);
                });
                return n;
            });
        };

        return (
            <div className="ems-cf-scope">
                <input
                    className="ert-th-filter-search"
                    placeholder="Search..."
                    value={filterSearch}
                    onChange={(e) => setFilterSearch(e.target.value)}
                />
                <div className="ert-th-filter-actions">
                    <button type="button" onClick={() => setDraftMulti(new Set(all))}>
                        Select All
                    </button>
                    <button type="button" onClick={() => setDraftMulti(new Set())}>
                        Unselect All
                    </button>
                </div>
                <div className="ert-th-filter-options">
                    {visibleYears.map((y) => {
                        const yearValues = Object.values(dateGroups[y]).flat();
                        const yearChecked = yearValues.length > 0 && yearValues.every((v) => draftMulti.has(v));
                        const visibleMonths = Object.keys(dateGroups[y])
                            .sort((a, b) => PROB_DATE_MONTH_NAMES.indexOf(a) - PROB_DATE_MONTH_NAMES.indexOf(b))
                            .filter((mn) => {
                                const monthValues = dateGroups[y][mn];
                                if (!q) return true;
                                if (mn.toLowerCase().includes(q.toLowerCase())) return true;
                                return monthValues.some((v) => probDateKeyMatchesSearch(v, q, formatLabel));
                            });
                        return (
                            <div key={y}>
                                <label className="ert-th-filter-option">
                                    <input
                                        type="checkbox"
                                        checked={yearChecked}
                                        onChange={(e) => toggleKeys(yearValues, e.target.checked)}
                                    />
                                    <span>{y}</span>
                                </label>
                                {visibleMonths.map((mn) => {
                                    const monthValues = dateGroups[y][mn];
                                    const monthChecked =
                                        monthValues.length > 0 && monthValues.every((v) => draftMulti.has(v));
                                    return (
                                        <label key={`${y}-${mn}`} className="ert-th-filter-option ert-th-filter-option--month">
                                            <input
                                                type="checkbox"
                                                checked={monthChecked}
                                                onChange={(e) => toggleKeys(monthValues, e.target.checked)}
                                            />
                                            <span>{mn}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        );
                    })}
                    {visibleOther.map((opt) => (
                        <label key={String(opt)} className="ert-th-filter-option">
                            <input
                                type="checkbox"
                                checked={draftMulti.has(opt)}
                                onChange={(e) => toggleKeys([opt], e.target.checked)}
                            />
                            <span>{opt || '—'}</span>
                        </label>
                    ))}
                </div>
                <div className="ert-th-filter-footer">
                    <button type="button" onClick={() => clearMultiFilter(kind)}>
                        Clear
                    </button>
                    <button type="button" className="ert-th-filter-apply" onClick={() => applyMultiDraft(kind)}>
                        Apply
                    </button>
                </div>
            </div>
        );
    };

    const renderMultiFilterPanel = (kind) => {
        const all = getMultiFilterAll(kind);
        const formatLabel = (val) => {
            if ((kind === 'wonBookedDate' || kind === 'lostDate' || kind === 'expectedDate') && val !== '—') {
                return formatExpectedDateLabel(val);
            }
            return val;
        };
        return (
            <>
                <input
                    className="form-control form-control-sm mb-2"
                    placeholder="Search..."
                    value={filterSearch}
                    onChange={(e) => setFilterSearch(e.target.value)}
                />
                <div className="d-flex gap-1 mb-2">
                    <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => setDraftMulti(new Set(all))}>
                        All
                    </button>
                    <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => setDraftMulti(new Set())}>
                        None
                    </button>
                </div>
                <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                    {all
                        .filter((v) => {
                            if (!filterSearch) return true;
                            const q = filterSearch.toLowerCase();
                            return String(v).toLowerCase().includes(q) || String(formatLabel(v)).toLowerCase().includes(q);
                        })
                        .map((val) => (
                            <label key={String(val)} className="d-flex align-items-center gap-2 mb-1 text-truncate" style={{ cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={draftMulti.has(val)}
                                    onChange={() => {
                                        setDraftMulti((prev) => {
                                            const n = new Set(prev);
                                            if (n.has(val)) n.delete(val);
                                            else n.add(val);
                                            return n;
                                        });
                                    }}
                                />
                                <span className="text-truncate">{formatLabel(val)}</span>
                            </label>
                        ))}
                </div>
                <div className="d-flex gap-1 mt-2 justify-content-end">
                    <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => clearMultiFilter(kind)}>
                        Clear
                    </button>
                    <button type="button" className="btn btn-sm btn-primary py-0" onClick={() => applyMultiDraft(kind)}>
                        Apply
                    </button>
                </div>
            </>
        );
    };

    const renderNumericFilterPanel = (kind, valueLabel) => (
        <>
            <label className="form-label small mb-1">Condition</label>
            <select
                className="form-select form-select-sm mb-2"
                value={draftNet.mode}
                onChange={(e) => setDraftNet((d) => ({ ...d, mode: e.target.value }))}
            >
                <option value="all">All</option>
                <option value="gt">Greater than</option>
                <option value="lt">Less than</option>
                <option value="eq">Equal to</option>
                <option value="gte">Greater or equal</option>
                <option value="lte">Less or equal</option>
                <option value="between">Between</option>
            </select>
            <label className="form-label small mb-1">{valueLabel}</label>
            <input
                type="text"
                className="form-control form-control-sm mb-2"
                placeholder="e.g. 100"
                value={draftNet.v1}
                onChange={(e) => setDraftNet((d) => ({ ...d, v1: e.target.value }))}
            />
            {draftNet.mode === 'between' && (
                <>
                    <label className="form-label small mb-1">And</label>
                    <input
                        type="text"
                        className="form-control form-control-sm mb-2"
                        placeholder="e.g. 200"
                        value={draftNet.v2}
                        onChange={(e) => setDraftNet((d) => ({ ...d, v2: e.target.value }))}
                    />
                </>
            )}
            <div className="d-flex gap-1 mt-2 justify-content-end">
                <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => clearNumericFilter(kind)}>
                    Clear
                </button>
                <button type="button" className="btn btn-sm btn-primary py-0" onClick={() => applyNumericDraft(kind)}>
                    Apply
                </button>
            </div>
        </>
    );

    useEffect(() => {
        if (listMode !== 'FollowUp') {
            setColFProbability(null);
            setColFExpectedDate(null);
            if (openColFilter === 'probability' || openColFilter === 'expectedDate') {
                setOpenColFilter(null);
            }
        }
        if (listMode !== 'Won') {
            setColFWonJobNo(null);
            setColFWonBookedDate(null);
            setColFWonJobValue({ mode: 'all', v1: '', v2: '' });
            setColFWonGpPct({ mode: 'all', v1: '', v2: '' });
            if (['wonJobNo', 'wonBookedDate', 'wonJobValue', 'wonGpPct'].includes(openColFilter)) {
                setOpenColFilter(null);
            }
        }
        if (listMode !== 'FollowUp') {
            setColFGrossMargin({ mode: 'all', v1: '', v2: '' });
            if (openColFilter === 'grossMargin') {
                setOpenColFilter(null);
            }
        }
        if (listMode !== 'Lost') {
            setColFLostTo(null);
            setColFLostReason(null);
            setColFLostDate(null);
            setColFLostCompetitorPrice({ mode: 'all', v1: '', v2: '' });
            if (['lostTo', 'lostReason', 'lostDate', 'lostCompetitorPrice'].includes(openColFilter)) {
                setOpenColFilter(null);
            }
        }
        if (listMode !== 'Won' && listMode !== 'Lost' && listMode !== 'FollowUp') {
            setColFDetailQuoteRef(null);
            setColFDetailRemarks(null);
            if (openColFilter === 'detailQuoteRef' || openColFilter === 'detailRemarks') {
                setOpenColFilter(null);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [listMode]);

    // --- Render Logic ---

    // List View
    return (
        <div className="container-fluid pt-1 pb-0 bg-light prob-probability-page d-flex flex-column h-100 min-h-0 overflow-hidden px-0">
            <div className="prob-probability-shell flex-grow-1 d-flex flex-column" style={{ minHeight: 0, minWidth: 0 }}>
                    <div className="card prob-probability-card border-0 shadow-sm rounded-3 d-flex flex-column flex-grow-1 min-h-0" style={{ minHeight: 0, minWidth: 0, flex: '1 1 0' }}>
                        {/* Header & Filters */}
                        <div className="card-header border-0 bg-transparent py-0 px-2" style={{ flexShrink: 0 }}>
                            <div className="prob-list-filter-panel">
                                <div
                                    className="d-flex align-items-end gap-1"
                                    style={{
                                        flexWrap: 'nowrap',
                                        overflowX: 'auto',
                                        overflowY: 'visible',
                                        scrollbarGutter: 'stable',
                                        WebkitOverflowScrolling: 'touch',
                                    }}
                                >
                                {/* Division Selector */}
                                <div style={{ width: '158px', flex: '0 0 auto' }}>
                                    <label className="small text-muted fw-normal mb-0">Division</label>
                                    <select
                                        className="form-select form-select-sm"
                                        value={selectedDivision}
                                        onChange={(e) => setSelectedDivision(e.target.value)}
                                        disabled={divisionOptions.length <= 1}
                                    >
                                        {divisionOptions.length === 0 ? (
                                            <option value="">Select division</option>
                                        ) : (
                                            divisionOptions.map((div) => (
                                                <option key={div} value={div}>{div}</option>
                                            ))
                                        )}
                                    </select>
                                </div>

                                {/* Mode Selector */}
                                <div style={{ width: '142px', flex: '0 0 auto' }}>
                                    <label className="small text-muted fw-normal mb-0">View Mode</label>
                                    <select
                                        className="form-select form-select-sm"
                                        value={listMode}
                                        onChange={(e) => {
                                            setListMode(e.target.value);
                                            // Reset filters when mode changes
                                            setFromDate('');
                                            setToDate('');
                                            setFilterProbability('');
                                        }}
                                    >
                                        <option value="All">ALL</option>
                                        <option value="Pending">Pending Update</option>
                                        <option value="Won">Won</option>
                                        <option value="Lost">Lost</option>
                                        <option value="FollowUp">Follow Up</option>
                                        <option value="OnHold">On Hold</option>
                                        <option value="Cancelled">Cancelled</option>
                                        <option value="Retendered">Retendered</option>
                                    </select>
                                </div>
                                <div style={{ width: '198px', flex: '0 0 auto' }}>
                                    <label className="small text-muted fw-normal mb-0">Search</label>
                                    <input
                                        type="text"
                                        className="form-control form-control-sm"
                                        value={viewSearchText}
                                        onChange={(e) => setViewSearchText(e.target.value)}
                                        placeholder="Enquiry No, Project Name, Customer Name"
                                    />
                                </div>

                                {/* Date filters — field depends on view mode (quote date for Pending, P.* for others) */}
                                <>
                                        <div style={{ width: '142px', flex: '0 0 auto' }} className="d-flex flex-column">
                                            <label className="small text-muted fw-normal mb-0 d-block">From</label>
                                            <div className="prob-date-picker-wrap">
                                                <DatePicker
                                                    selected={parseIsoDate(fromDate)}
                                                    onChange={(date) => {
                                                        const nextFrom = date ? format(date, 'yyyy-MM-dd') : '';
                                                        setFromDate(nextFrom);
                                                        if (nextFrom && !toDate) {
                                                            setToDate(format(new Date(), 'yyyy-MM-dd'));
                                                        }
                                                    }}
                                                    dateFormat="dd-MMM-yy"
                                                    placeholderText="DD-MMM-YY"
                                                    className="form-control prob-date-input"
                                                    {...PROB_DATE_PICKER_POPPER_COMMON}
                                                    todayButton="Today"
                                                    clearButtonTitle="Clear"
                                                    isClearable
                                                />
                                                <span className="prob-date-input-icon" aria-hidden="true" />
                                            </div>
                                        </div>
                                        <div style={{ width: '142px', flex: '0 0 auto' }} className="d-flex flex-column">
                                            <label className="small text-muted fw-normal mb-0 d-block">To</label>
                                            <div className="prob-date-picker-wrap">
                                                <DatePicker
                                                    selected={parseIsoDate(toDate)}
                                                    onChange={(date) => setToDate(date ? format(date, 'yyyy-MM-dd') : '')}
                                                    dateFormat="dd-MMM-yy"
                                                    placeholderText="DD-MMM-YY"
                                                    className="form-control prob-date-input"
                                                    {...PROB_DATE_PICKER_POPPER_COMMON}
                                                    todayButton="Today"
                                                    clearButtonTitle="Clear"
                                                    isClearable
                                                />
                                                <span className="prob-date-input-icon" aria-hidden="true" />
                                            </div>
                                        </div>
                                        {listMode !== 'Pending' && listMode !== 'FollowUp' && (
                                        <div
                                            className="align-self-end"
                                            style={{
                                                minWidth: '248px',
                                                flex: '0 0 auto',
                                                background: '#ffffff',
                                                border: '1px solid #d7dee8',
                                                borderRadius: '8px',
                                                boxShadow: '0 1px 5px rgba(15, 23, 42, 0.07)',
                                                overflow: 'hidden',
                                            }}
                                        >
                                            <div
                                                style={{
                                                    padding: '3px 6px',
                                                    fontSize: '9px',
                                                    fontWeight: 400,
                                                    color: '#ffffff',
                                                    backgroundColor: 'transparent',
                                                    backgroundImage: EMS_TABLE_HEADER_GRADIENT,
                                                    borderBottom: '1px solid rgba(22, 33, 74, 0.38)',
                                                    lineHeight: 1.1,
                                                    textShadow: '0 1px 1px rgba(19, 27, 58, 0.6)',
                                                    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.35)',
                                                }}
                                            >
                                                Probability Summary
                                            </div>
                                            <div title="Net quoted total" style={{ color: '#0c4a6e', display: 'flex', justifyContent: 'space-between', gap: '6px', padding: '1px 6px', fontSize: '10px', fontWeight: 700, lineHeight: 1.1, borderBottom: '1px solid #eef3f8' }}>
                                                <span>Total Net Quoted :</span>
                                                <span style={{ textAlign: 'right' }}>
                                                    {filteredSortedRows.length > 0
                                                        ? formatSummaryAmountCompact(listAggregates.sumNet)
                                                        : <span className="text-muted">—</span>}
                                                </span>
                                            </div>
                                            <div title="Job Value total (Won)" style={{ color: '#198754', display: 'flex', justifyContent: 'space-between', gap: '6px', padding: '1px 6px', fontSize: '10px', fontWeight: 700, lineHeight: 1.1, borderBottom: '1px solid #eef3f8' }}>
                                                <span>Won Total :</span>
                                                <span style={{ textAlign: 'right' }}>
                                                    {listAggregates.sumJob > 0
                                                        ? formatSummaryAmountCompact(listAggregates.sumJob)
                                                        : <span className="text-muted">—</span>}
                                                </span>
                                            </div>
                                            <div title="GP average (Won)" style={{ color: '#198754', display: 'flex', justifyContent: 'space-between', gap: '6px', padding: '1px 6px', fontSize: '10px', fontWeight: 700, lineHeight: 1.1, borderBottom: '1px solid #eef3f8' }}>
                                                <span>GP AVG :</span>
                                                <span style={{ textAlign: 'right' }}>
                                                    {listAggregates.avgGp != null ? `${listAggregates.avgGp.toFixed(2)}%` : <span className="text-muted">—</span>}
                                                </span>
                                            </div>
                                            <div title="Lost total" style={{ color: '#dc3545', display: 'flex', justifyContent: 'space-between', gap: '6px', padding: '1px 6px', fontSize: '10px', fontWeight: 700, lineHeight: 1.1, borderBottom: '1px solid #eef3f8' }}>
                                                <span>Lost Total :</span>
                                                <span style={{ textAlign: 'right' }}>
                                                    {listAggregates.sumLost > 0
                                                        ? formatSummaryAmountCompact(listAggregates.sumLost)
                                                        : <span className="text-muted">—</span>}
                                                </span>
                                            </div>
                                            <div title="Followup total" style={{ color: '#4169e1', display: 'flex', justifyContent: 'space-between', gap: '6px', padding: '1px 6px', fontSize: '10px', fontWeight: 700, lineHeight: 1.1 }}>
                                                <span>Followup Total :</span>
                                                <span style={{ textAlign: 'right' }}>
                                                    {listAggregates.sumFollowup > 0
                                                        ? formatSummaryAmountCompact(listAggregates.sumFollowup)
                                                        : <span className="text-muted">—</span>}
                                                </span>
                                            </div>
                                        </div>
                                        )}
                                </>

                                {/* FollowUp Probability Filter */}
                                {listMode === 'FollowUp' && (
                                    <div style={{ width: '142px', flex: '0 0 auto' }}>
                                        <label className="small text-muted fw-normal mb-0">Probability</label>
                                        <select className="form-select form-select-sm" value={filterProbability} onChange={e => setFilterProbability(e.target.value)}>
                                            <option value="">All</option>
                                            <option value="Low Chance (25%)">Low Chance (25%)</option>
                                            <option value="50-50 Chance (50%)">50-50 Chance (50%)</option>
                                            <option value="Medium Chance (75%)">Medium Chance (75%)</option>
                                            <option value="High Chance (90%)">High Chance (90%)</option>
                                            <option value="Very High Chance (99%)">Very High Chance (99%)</option>
                                            <option value="No Chance (0%)">No Chance (0%)</option>
                                        </select>
                                    </div>
                                )}

                                {/* Excel download, clear filters & refresh */}
                                <div className="ms-auto align-self-end d-flex gap-1 align-items-center" style={{ flex: '0 0 auto' }}>
                                    <ExcelDownloadButton
                                        onClick={handleProbabilityExcelDownload}
                                        disabled={loadingList || filteredSortedRows.length === 0}
                                    />
                                    <button
                                        type="button"
                                        className="btn btn-outline-secondary btn-sm d-flex align-items-center justify-content-center"
                                        style={{ width: '28px', height: '28px', padding: 0 }}
                                        onClick={clearAllColumnFilters}
                                        title="Clear table filters"
                                        aria-label="Clear table filters"
                                    >
                                        <FilterX size={14} />
                                    </button>
                                    <button
                                        className="btn btn-outline-primary btn-sm d-flex align-items-center justify-content-center"
                                        style={{ width: '28px', height: '28px', padding: 0 }}
                                        onClick={fetchList}
                                        disabled={loadingList}
                                        title="Refresh"
                                        aria-label="Refresh"
                                    >
                                        <RefreshCw size={14} />
                                    </button>
                                </div>
                                </div>
                            </div>
                        </div>

                        <div className="card-body p-0 d-flex flex-column flex-grow-1 min-h-0" style={{ minHeight: 0, minWidth: 0, flex: '1 1 0' }}>
                            <div
                                ref={tableScrollWrapRef}
                                className="prob-table-scroll-wrap border-top px-2 flex-grow-1 min-h-0"
                            >
                                <table className="table table-hover mb-0 prob-probability-list-table" style={{ minWidth: '2442px', tableLayout: 'fixed' }}>
                                    <thead>
                                        <tr className="prob-summary-row">
                                            <th className="prob-summary-th" style={{ width: '50px' }} aria-hidden="true" />
                                            <th className="prob-summary-th" style={{ width: '72px' }} aria-hidden="true" />
                                            <th className="prob-summary-th" style={{ width: '100px' }} aria-hidden="true" />
                                            <th className="prob-summary-th" style={{ width: '200px' }} aria-hidden="true" />
                                            <th className="prob-summary-th" style={{ width: '160px' }} aria-hidden="true" />
                                            <th className="prob-summary-th prob-summary-net text-end pe-2" style={{ width: '140px' }} aria-hidden="true" />
                                            <th className="prob-summary-th" style={{ width: '130px' }} aria-hidden="true" />
                                            <th className="prob-summary-th" style={{ width: '130px' }} aria-hidden="true" />
                                            <th className="prob-summary-th prob-summary-details" style={{ width: '1300px' }} aria-hidden="true" />
                                        </tr>
                                        <tr className="prob-thead-labels">
                                            <th className="px-2 py-1 align-bottom fw-normal" style={{ width: '50px', textAlign: 'left' }}>SL</th>
                                            <th className="px-2 py-1 align-bottom fw-normal" style={{ minWidth: '108px', textAlign: 'left' }}>Update</th>
                                            <th
                                                ref={(el) => {
                                                    filterHeaderRefs.current.enquiry = el;
                                                }}
                                                className="px-2 py-1 align-bottom position-relative prob-table-filter-header"
                                                style={{ width: '100px', textAlign: 'left', cursor: 'pointer' }}
                                                onClick={(e) => toggleMultiColumnFilter('enquiry', e)}
                                            >
                                                <div className="d-flex align-items-end justify-content-between gap-1">
                                                    <span className="fw-normal">Enquiry</span>
                                                    <span className="d-flex align-items-center gap-1 flex-shrink-0">
                                                        <span className={`user-select-none ${filterActiveClass('enquiry')}`} style={{ fontSize: '10px', lineHeight: 1 }} title="Filter">▼</span>
                                                        <button
                                                            type="button"
                                                            data-sort-only="true"
                                                            className="btn btn-link p-0 text-decoration-none user-select-none"
                                                            style={{ fontSize: '11px', lineHeight: 1 }}
                                                            title="Sort"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleSortClick('enquiry');
                                                            }}
                                                        >
                                                            {sortIndicator('enquiry')}
                                                        </button>
                                                    </span>
                                                </div>
                                            </th>
                                            <th
                                                ref={(el) => {
                                                    filterHeaderRefs.current.project = el;
                                                }}
                                                className="px-2 py-1 align-bottom position-relative prob-table-filter-header"
                                                style={{ width: '200px', textAlign: 'left', cursor: 'pointer' }}
                                                onClick={(e) => toggleMultiColumnFilter('project', e)}
                                            >
                                                <div className="d-flex align-items-end justify-content-between gap-1">
                                                    <span className="fw-normal">Project Name</span>
                                                    <span className="d-flex align-items-center gap-1 flex-shrink-0">
                                                        <span className={`user-select-none ${filterActiveClass('project')}`} style={{ fontSize: '10px', lineHeight: 1 }} title="Filter">▼</span>
                                                        <button
                                                            type="button"
                                                            data-sort-only="true"
                                                            className="btn btn-link p-0 text-decoration-none user-select-none"
                                                            style={{ fontSize: '11px', lineHeight: 1 }}
                                                            title="Sort"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleSortClick('project');
                                                            }}
                                                        >
                                                            {sortIndicator('project')}
                                                        </button>
                                                    </span>
                                                </div>
                                            </th>
                                            <th
                                                ref={(el) => {
                                                    filterHeaderRefs.current.customer = el;
                                                }}
                                                className="px-2 py-1 align-bottom position-relative prob-table-filter-header"
                                                style={{ width: '160px', textAlign: 'left', cursor: 'pointer' }}
                                                onClick={(e) => toggleMultiColumnFilter('customer', e)}
                                            >
                                                <div className="d-flex align-items-end justify-content-between gap-1">
                                                    <span className="fw-normal">Customer Name</span>
                                                    <span className="d-flex align-items-center gap-1 flex-shrink-0">
                                                        <span className={`user-select-none ${filterActiveClass('customer')}`} style={{ fontSize: '10px', lineHeight: 1 }} title="Filter">▼</span>
                                                        <button
                                                            type="button"
                                                            data-sort-only="true"
                                                            className="btn btn-link p-0 text-decoration-none user-select-none"
                                                            style={{ fontSize: '11px', lineHeight: 1 }}
                                                            title="Sort"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleSortClick('customer');
                                                            }}
                                                        >
                                                            {sortIndicator('customer')}
                                                        </button>
                                                    </span>
                                                </div>
                                            </th>
                                            <th
                                                ref={(el) => {
                                                    filterHeaderRefs.current.net = el;
                                                }}
                                                className="px-2 py-1 align-bottom position-relative prob-table-filter-header prob-net-quoted-th"
                                                style={{ width: '140px', textAlign: 'left', cursor: 'pointer' }}
                                                onClick={(e) => toggleNetColumnFilter(e)}
                                            >
                                                <div className="d-flex align-items-end justify-content-between gap-1">
                                                    <div className="d-flex flex-column align-items-start" style={{ minWidth: 0, textAlign: 'left' }}>
                                                        <span className="prob-net-quoted-sub">(Excludes Subjobs)</span>
                                                        <span className="fw-normal">Net Quoted</span>
                                                    </div>
                                                    <span className="d-flex align-items-center gap-1 flex-shrink-0 align-self-end">
                                                        <span className={`user-select-none ${filterActiveClass('net')}`} style={{ fontSize: '10px', lineHeight: 1 }} title="Filter">
                                                            ▼
                                                        </span>
                                                        <button
                                                            type="button"
                                                            data-sort-only="true"
                                                            className="btn btn-link p-0 text-decoration-none user-select-none"
                                                            style={{ fontSize: '11px', lineHeight: 1 }}
                                                            title="Sort"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleSortClick('net');
                                                            }}
                                                        >
                                                            {sortIndicator('net')}
                                                        </button>
                                                    </span>
                                                </div>
                                            </th>
                                            <th
                                                ref={(el) => {
                                                    filterHeaderRefs.current.status = el;
                                                }}
                                                className="px-2 py-1 align-bottom position-relative prob-table-filter-header"
                                                style={{ width: '130px', textAlign: 'left', cursor: 'pointer' }}
                                                onClick={(e) => toggleMultiColumnFilter('status', e)}
                                            >
                                                <div className="d-flex align-items-end justify-content-between gap-1">
                                                    <span className="fw-normal">Status</span>
                                                    <span className="d-flex align-items-center gap-1 flex-shrink-0">
                                                        <span className={`user-select-none ${filterActiveClass('status')}`} style={{ fontSize: '10px', lineHeight: 1 }} title="Filter">
                                                            ▼
                                                        </span>
                                                        <button
                                                            type="button"
                                                            data-sort-only="true"
                                                            className="btn btn-link p-0 text-decoration-none user-select-none"
                                                            style={{ fontSize: '11px', lineHeight: 1 }}
                                                            title="Sort"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleSortClick('status');
                                                            }}
                                                        >
                                                            {sortIndicator('status')}
                                                        </button>
                                                    </span>
                                                </div>
                                            </th>
                                            <th
                                                ref={(el) => {
                                                    filterHeaderRefs.current.quoteType = el;
                                                }}
                                                className="px-2 py-1 align-bottom position-relative prob-table-filter-header"
                                                style={{ width: '130px', textAlign: 'left', cursor: 'pointer' }}
                                                onClick={(e) => toggleMultiColumnFilter('quoteType', e)}
                                            >
                                                <div className="d-flex align-items-end justify-content-between gap-1">
                                                    <span className="fw-normal">Quote Type</span>
                                                    <span className="d-flex align-items-center gap-1 flex-shrink-0">
                                                        <span className={`user-select-none ${filterActiveClass('quoteType')}`} style={{ fontSize: '10px', lineHeight: 1 }} title="Filter">
                                                            ▼
                                                        </span>
                                                        <button
                                                            type="button"
                                                            data-sort-only="true"
                                                            className="btn btn-link p-0 text-decoration-none user-select-none"
                                                            style={{ fontSize: '11px', lineHeight: 1 }}
                                                            title="Sort"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleSortClick('quoteType');
                                                            }}
                                                        >
                                                            {sortIndicator('quoteType')}
                                                        </button>
                                                    </span>
                                                </div>
                                            </th>
                                            <th
                                                className="px-2 py-1 align-bottom fw-normal"
                                                style={{ width: '1300px', textAlign: 'left' }}
                                            >
                                                {listMode === 'FollowUp' ? (
                                                    <div className="prob-followup-header-grid">
                                                        {renderDetailFilterHeader('Quote Reference', 'detailQuoteRef', 'prob-detail-col-1')}
                                                        {renderDetailFilterHeader('Chances %', 'probability', 'prob-detail-col-2')}
                                                        {renderDetailFilterHeader('Expected Date', 'expectedDate', 'prob-detail-col-3')}
                                                        {renderDetailFilterHeader('GP %', 'grossMargin', 'prob-detail-col-4', { numeric: true })}
                                                        {renderDetailFilterHeader('Remarks', 'detailRemarks', 'prob-detail-col-5')}
                                                    </div>
                                                ) : listMode === 'Won' ? (
                                                    <div className="prob-won-header-grid">
                                                        {renderDetailFilterHeader('Quote Reference', 'detailQuoteRef', 'prob-detail-col-1')}
                                                        {renderDetailFilterHeader('ERP Job No.', 'wonJobNo', 'prob-detail-col-2')}
                                                        {renderDetailFilterHeader('Job Value', 'wonJobValue', 'prob-detail-col-3', { numeric: true })}
                                                        {renderDetailFilterHeader('GP %', 'wonGpPct', 'prob-detail-col-4', { numeric: true })}
                                                        {renderDetailFilterHeader('Booked Date', 'wonBookedDate', 'prob-detail-col-5')}
                                                        {renderDetailFilterHeader('Remarks', 'detailRemarks', 'prob-detail-col-6')}
                                                    </div>
                                                ) : listMode === 'Lost' ? (
                                                    <div className="prob-lost-header-grid">
                                                        {renderDetailFilterHeader('Quote Reference', 'detailQuoteRef', 'prob-detail-col-1')}
                                                        {renderDetailFilterHeader('Lost To', 'lostTo', 'prob-detail-col-2')}
                                                        {renderDetailFilterHeader('Reason for losing', 'lostReason', 'prob-detail-col-3')}
                                                        {renderDetailFilterHeader("Competitor's price", 'lostCompetitorPrice', 'prob-detail-col-4', { numeric: true })}
                                                        {renderDetailFilterHeader('Lost Date', 'lostDate', 'prob-detail-col-5')}
                                                        {renderDetailFilterHeader('Remarks', 'detailRemarks', 'prob-detail-col-6')}
                                                    </div>
                                                ) : (
                                                    'Details'
                                                )}
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loadingList ? (
                                            <tr>
                                                <td colSpan="9" className="text-center py-5">Loading...</td>
                                            </tr>
                                        ) : enquiriesList.length === 0 ? (
                                            <tr>
                                                <td colSpan="9" className="text-center py-5 text-muted">No records found.</td>
                                            </tr>
                                        ) : filteredSortedRows.length === 0 ? (
                                            <tr>
                                                <td colSpan="9" className="text-center py-5 text-muted">
                                                    No rows match the current column filters.{' '}
                                                    <button type="button" className="btn btn-link btn-sm p-0" onClick={clearAllColumnFilters}>
                                                        Clear filters
                                                    </button>
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredSortedRows.map((item, index) => (
                                                <tr key={item.RequestNo} className="border-b hover:bg-gray-50">
                                                    <td className="px-2 pt-1 pb-2 font-medium text-primary prob-td">
                                                        {index + 1}
                                                    </td>
                                                    <td className="px-2 py-1 prob-td text-center">
                                                        <div className="d-flex flex-column align-items-center gap-1">
                                                            {item.UpdatedDateTime ? (
                                                                <span
                                                                    className="text-muted"
                                                                    style={{
                                                                        fontSize: '9px',
                                                                        lineHeight: 1.15,
                                                                        whiteSpace: 'nowrap',
                                                                        fontWeight: 500,
                                                                    }}
                                                                    title="Latest probability update"
                                                                >
                                                                    {formatHistoryDateTime(item.UpdatedDateTime)}
                                                                </span>
                                                            ) : null}
                                                            {(() => {
                                                            const isUpdating = updatingReqNo === item.RequestNo;
                                                            const isSaved = !!updatedItems[item.RequestNo];
                                                            const hasChanges = hasItemChanges(item);
                                                            // Show the spinner while saving.
                                                            if (isUpdating) {
                                                                return (
                                                                    <button type="button" className="btn btn-sm prob-row-update-btn btn-primary" disabled>
                                                                        <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                                                                    </button>
                                                                );
                                                            }
                                                            // Surface UPDATE only when the row has unsaved edits.
                                                            if (hasChanges) {
                                                                return (
                                                                    <button
                                                                        type="button"
                                                                        className="btn btn-sm prob-row-update-btn btn-primary"
                                                                        onClick={() => persistUpdate(item)}
                                                                        title="Save changes for this row"
                                                                    >
                                                                        UPDATE
                                                                    </button>
                                                                );
                                                            }
                                                            // Keep a brief SAVED confirmation after a successful save (cleared on next fetch or edit).
                                                            if (isSaved) {
                                                                return (
                                                                    <span
                                                                        className="badge bg-success prob-row-update-btn"
                                                                        title="Saved"
                                                                        style={{ fontSize: '0.62rem', fontWeight: 700, padding: '0.25rem 0.4rem' }}
                                                                    >
                                                                        SAVED
                                                                    </span>
                                                                );
                                                            }
                                                            // No changes and not just-saved: hide the button entirely so it only appears on edit.
                                                            return <span className="text-muted" style={{ fontSize: '11px' }}>—</span>;
                                                        })()}
                                                        </div>
                                                    </td>
                                                    <td className="px-2 pt-1 pb-2 font-medium text-primary prob-td">
                                                        <div className="d-flex align-items-center gap-2">
                                                            <span>{item.RequestNo}</span>
                                                            <button
                                                                type="button"
                                                                className="btn btn-link p-0"
                                                                style={{ fontSize: '11px', textDecoration: 'underline' }}
                                                                onClick={() => fetchHistory(item)}
                                                            >
                                                                History
                                                            </button>
                                                        </div>
                                                    </td>
                                                    <td className="px-2 pt-1 pb-2 text-gray-700 prob-td">{item.ProjectName || ''}</td>
                                                    <td className="px-2 pt-1 pb-2 text-gray-700 prob-td" style={{ fontSize: '12px' }}>
                                                        {customerNameForQuoteRef(item)}
                                                    </td>
                                                    <td className="px-2 pt-1 pb-2 fw-medium prob-td prob-td-net" style={{ fontSize: '12px' }}>
                                                        {(() => {
                                                            const userDept = (currentUser?.Department || currentUser?.Division || '').trim().toLowerCase();
                                                            const isSubUser = userDept && userDept !== 'civil' && userDept !== 'admin' && currentUser?.Roles !== 'Admin' && currentUser?.role !== 'Admin';
                                                            if (isSubUser && (!item.QuoteRefs || item.QuoteRefs.length === 0)) return <span className="text-muted italic">Restricted</span>;
                                                            return formatNetQuotedDisplay(item);
                                                        })()}
                                                    </td>
                                                    <td className="px-2 py-1 prob-td">
                                                        <select
                                                            className="form-select form-select-sm"
                                                            style={probStatusSelectStyle(item.Status)}
                                                            value={item.Status}
                                                            onChange={(e) => handleStatusChange(item, e.target.value)}
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            {enquiryHasGeneratedQuotes(item) ? (
                                                                <option value="Pending" style={probStatusOptionStyle('Pending')}>Pending</option>
                                                            ) : null}
                                                            <option value="FollowUp" style={probStatusOptionStyle('FollowUp')}>Follow Up</option>
                                                            <option value="Won" style={probStatusOptionStyle('Won')}>Won</option>
                                                            <option value="Lost" style={probStatusOptionStyle('Lost')}>Lost</option>
                                                            <option value="OnHold" style={probStatusOptionStyle('OnHold')}>On Hold</option>
                                                            <option value="Cancelled" style={probStatusOptionStyle('Cancelled')}>Cancelled</option>
                                                            <option value="Retendered" style={probStatusOptionStyle('Retendered')}>Retendered</option>
                                                        </select>
                                                    </td>
                                                    <td className="px-2 pt-1 pb-2 text-gray-700 prob-td" style={{ fontSize: '12px' }}>
                                                        {quoteTypeForQuoteRef(item)}
                                                    </td>
                                                    <td className="px-2 py-1 prob-td">
                                                        <div className={`d-flex align-items-end gap-2 flex-wrap prob-detail-controls ${item.Status === 'Lost' ? 'prob-detail-lost-layout' : ''} ${item.Status === 'Won' ? 'prob-detail-won-layout' : ''} ${(item.Status === 'FollowUp' || item.Status === 'Follow-up') ? 'prob-detail-followup-layout' : ''}`}>
                                                            {item.Status === 'Lost' && (
                                                                <>
                                                                    <div className="d-flex flex-column prob-detail-col-1">
                                                                        <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>Quote Reference</span>
                                                                        <div style={{ width: '320px', minWidth: '320px', maxWidth: '320px' }}>
                                                                            <Select
                                                                                className="basic-single"
                                                                                classNamePrefix="select"
                                                                                placeholder="Quote ref..."
                                                                                isSearchable={true}
                                                                                isClearable={true}
                                                                                menuPortalTarget={document.body}
                                                                                value={quoteRefSelectValue(item)}
                                                                                onChange={(option) => handleQuoteRefSelection(item, option)}
                                                                                options={buildQuoteRefOptions(item)}
                                                                                formatOptionLabel={(opt, { context }) => (
                                                                                    context === 'value'
                                                                                        ? (
                                                                                            <div
                                                                                                style={{
                                                                                                    fontSize: '11px',
                                                                                                    fontWeight: 400,
                                                                                                    whiteSpace: 'nowrap',
                                                                                                    overflow: 'hidden',
                                                                                                    textOverflow: 'ellipsis'
                                                                                                }}
                                                                                                title={opt.label}
                                                                                            >
                                                                                                {opt.label}
                                                                                            </div>
                                                                                        ) : (
                                                                                            <div style={{ lineHeight: '1.15', padding: '2px 0' }}>
                                                                                                <div style={{ fontWeight: 400, fontSize: '11px' }}>{opt.label}</div>
                                                                                                <div style={{ fontSize: '10px', color: '#666' }}>
                                                                                                    {opt.customer}{opt.leadJob ? ` (Leadjob-${opt.leadJob})` : ''}
                                                                                                </div>
                                                                                            </div>
                                                                                        )
                                                                                )}
                                                                                styles={{
                                                                                    control: (base) => ({
                                                                                        ...base,
                                                                                        minHeight: '31px',
                                                                                        height: '31px',
                                                                                        fontSize: '12px'
                                                                                    }),
                                                                                    valueContainer: (base) => ({
                                                                                        ...base,
                                                                                        padding: '0 8px'
                                                                                    }),
                                                                                    singleValue: (base) => ({
                                                                                        ...base,
                                                                                        whiteSpace: 'nowrap',
                                                                                        overflow: 'hidden',
                                                                                        textOverflow: 'ellipsis'
                                                                                    }),
                                                                                    indicatorsContainer: (base) => ({
                                                                                        ...base,
                                                                                        height: '31px'
                                                                                    }),
                                                                                    menuPortal: (base) => ({
                                                                                        ...base,
                                                                                        zIndex: 9999
                                                                                    })
                                                                                }}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                    <div className="d-flex flex-column prob-detail-col-2">
                                                                        <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>Lost To</span>
                                                                        <div style={{ width: '320px', minWidth: '320px', maxWidth: '320px' }}>
                                                                            <AsyncCreatableSelect
                                                                                className="basic-single"
                                                                                classNamePrefix="select"
                                                                                placeholder="Pick from list or type free text…"
                                                                                isSearchable={true}
                                                                                isClearable={true}
                                                                                backspaceRemovesValue={true}
                                                                                escapeClearsValue={true}
                                                                                allowCreateWhileLoading={true}
                                                                                menuPortalTarget={document.body}
                                                                                cacheOptions
                                                                                value={item.LostCompetitor ? { value: item.LostCompetitor, label: item.LostCompetitor } : null}
                                                                                onChange={(option) => handleInlineUpdate(item, 'LostCompetitor', option ? option.value : '')}
                                                                                formatCreateLabel={(inputValue) => `Use "${String(inputValue || '').trim()}"`}
                                                                                isValidNewOption={(inputValue) => String(inputValue || '').trim().length > 0}
                                                                                createOptionPosition="first"
                                                                                defaultOptions={(Array.isArray(item.QuoteRefs) ? item.QuoteRefs : [])
                                                                                    .map(q => ({
                                                                                        value: q.ToName || 'N/A',
                                                                                        label: q.ToName || 'N/A',
                                                                                        type: 'Quoted'
                                                                                    }))
                                                                                    .filter((v, i, a) => a.findIndex(t => t.value === v.value) === i)}
                                                                                formatOptionLabel={(opt, { context }) => (
                                                                                    context === 'menu' && opt.__isNew__ ? (
                                                                                        <span style={{ fontStyle: 'italic' }}>{opt.label}</span>
                                                                                    ) : (
                                                                                        <span className="d-flex justify-content-between gap-2 align-items-baseline">
                                                                                            <span className="text-truncate">{opt.label}</span>
                                                                                            {opt.type && !opt.__isNew__ && (
                                                                                                <span className="text-muted flex-shrink-0" style={{ fontSize: '10px' }}>
                                                                                                    {opt.type === 'Quoted' ? 'Quote' : opt.type}
                                                                                                </span>
                                                                                            )}
                                                                                        </span>
                                                                                    )
                                                                                )}
                                                                                noOptionsMessage={({ inputValue }) => {
                                                                                    const t = String(inputValue || '').trim();
                                                                                    if (!t) return 'Type to search or enter a free-text name';
                                                                                    if (t.length > 0 && t.length < LOST_TO_MIN_SEARCH_CHARS) {
                                                                                        return `Use free text, or type ${LOST_TO_MIN_SEARCH_CHARS}+ letters to search directory`;
                                                                                    }
                                                                                    return 'No directory matches — press Enter to use free text';
                                                                                }}
                                                                                loadOptions={(inputValue, callback) => {
                                                                                    const normalize = (str) => (str || '').toLowerCase();
                                                                                    const raw = String(inputValue || '').trim();
                                                                                    const termLo = normalize(raw);

                                                                                    const quotedRaw = (Array.isArray(item.QuoteRefs) ? item.QuoteRefs : []).map(q => ({
                                                                                        value: q.ToName || 'N/A',
                                                                                        label: q.ToName || 'N/A',
                                                                                        type: 'Quoted'
                                                                                    }));
                                                                                    const quoted = quotedRaw.filter((v, i, a) => a.findIndex(t => t.value === v.value) === i);
                                                                                    const filteredQuoted = termLo
                                                                                        ? quoted.filter((q) => normalize(q.label).includes(termLo))
                                                                                        : quoted;

                                                                                    let globals = [];
                                                                                    if (raw.length >= LOST_TO_MIN_SEARCH_CHARS && masters?.customers?.length) {
                                                                                        const isContractorOrClient = (c) => {
                                                                                            const cat = String(c?.Category || '').trim().toLowerCase();
                                                                                            return cat === 'contractor' || cat === 'client';
                                                                                        };
                                                                                        globals = masters.customers
                                                                                            .filter(
                                                                                                (c) =>
                                                                                                    isContractorOrClient(c) &&
                                                                                                    normalize(c.CompanyName).includes(termLo)
                                                                                            )
                                                                                            .map((c) => ({
                                                                                                value: c.CompanyName,
                                                                                                label: c.CompanyName,
                                                                                                type: String(c.Category || '').trim() || 'Directory'
                                                                                            }))
                                                                                            .slice(0, 80);
                                                                                    }

                                                                                    const existing = new Set(filteredQuoted.map((q) => q.value));
                                                                                    callback([
                                                                                        ...filteredQuoted,
                                                                                        ...globals.filter((g) => !existing.has(g.value))
                                                                                    ]);
                                                                                }}
                                                                                styles={{
                                                                                    control: (base) => ({
                                                                                        ...base,
                                                                                        minHeight: '31px',
                                                                                        fontSize: '12px'
                                                                                    }),
                                                                                    valueContainer: (base) => ({
                                                                                        ...base,
                                                                                        minHeight: '31px',
                                                                                        paddingTop: '0',
                                                                                        paddingBottom: '0'
                                                                                    }),
                                                                                    input: (base) => ({
                                                                                        ...base,
                                                                                        margin: '0',
                                                                                        padding: '0'
                                                                                    }),
                                                                                    placeholder: (base) => ({
                                                                                        ...base,
                                                                                        whiteSpace: 'nowrap',
                                                                                        overflow: 'hidden',
                                                                                        textOverflow: 'ellipsis'
                                                                                    }),
                                                                                    singleValue: (base) => ({
                                                                                        ...base,
                                                                                        whiteSpace: 'nowrap',
                                                                                        overflow: 'hidden',
                                                                                        textOverflow: 'ellipsis'
                                                                                    }),
                                                                                    indicatorsContainer: (base) => ({
                                                                                        ...base,
                                                                                        minHeight: '31px'
                                                                                    }),
                                                                                    menuPortal: (base) => ({ ...base, zIndex: 9999 })
                                                                                }}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                    <div className="d-flex flex-column prob-detail-col-3">
                                                                        <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>Reason for losing</span>
                                                                        <div style={{ width: '180px' }}>
                                                                            <select
                                                                                className="form-select form-select-sm"
                                                                                value={item.LostReason || ''}
                                                                                onChange={(e) => handleInlineUpdate(item, 'LostReason', e.target.value)}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            >
                                                                                <option value="">Select Reason...</option>
                                                                                <option value="Price high">Price high</option>
                                                                                <option value="Main contractor has own team">Main contractor has own team</option>
                                                                                <option value="Client has own team">Client has own team</option>
                                                                                <option value="Client prefers competitor">Client prefers competitor</option>
                                                                                <option value="Submission error">Submission error</option>
                                                                                <option value="Eligibility criteria">Eligibility criteria</option>
                                                                            </select>
                                                                        </div>
                                                                    </div>
                                                                    <div className="d-flex flex-column prob-detail-col-4">
                                                                        <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>Competitor's price</span>
                                                                        <div className="input-group input-group-sm" style={{ width: '120px' }}>
                                                                            <span className="input-group-text px-1 text-muted" style={{ fontSize: '10px' }}>BD</span>
                                                                            <input
                                                                                type="number"
                                                                                className="form-control form-control-sm"
                                                                                placeholder="0"
                                                                                value={item.LostCompetitorPrice || ''}
                                                                                onChange={(e) => handleInlineUpdate(item, 'LostCompetitorPrice', e.target.value)}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                    <div className="d-flex flex-column prob-detail-col-5">
                                                                        <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>Lost Date</span>
                                                                        <div style={{ width: '130px' }}>
                                                                            <input
                                                                                type="date"
                                                                                className="form-control form-control-sm"
                                                                                value={item.LostDate ? (typeof item.LostDate === 'string' ? item.LostDate.split('T')[0] : format(new Date(item.LostDate), 'yyyy-MM-dd')) : ''}
                                                                                onChange={(e) => handleInlineUpdate(item, 'LostDate', e.target.value)}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                                style={{ fontSize: '12px', height: '31px' }}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                    <div className="d-flex flex-column prob-detail-col-6">
                                                                        <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>Remarks</span>
                                                                        <div style={{ width: '200px' }}>
                                                                            <textarea
                                                                                className="form-control form-control-sm"
                                                                                rows="1"
                                                                                placeholder="Remarks"
                                                                                value={item.ProbabilityRemarks || ''}
                                                                                onChange={(e) => handleUpdate(item, { ProbabilityRemarks: e.target.value })}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                </>
                                                            )}
                                                            {/* Follow Up UI in 7th Column */}
                                                            {(item.Status === 'FollowUp' || item.Status === 'Follow-up') && (
                                                                <>
                                                                    <div className="d-flex flex-column prob-detail-col-1">
                                                                        <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>Quote Reference</span>
                                                                        <div style={{ width: '320px', minWidth: '320px', maxWidth: '320px' }}>
                                                                            <Select
                                                                                className="basic-single"
                                                                                classNamePrefix="select"
                                                                                placeholder="Quote ref..."
                                                                                isSearchable={true}
                                                                                menuPortalTarget={document.body}
                                                                                value={quoteRefSelectValue(item)}
                                                                                onChange={(option) => handleQuoteRefSelection(item, option)}
                                                                                options={buildQuoteRefOptions(item)}
                                                                                formatOptionLabel={(opt, { context }) => (
                                                                                    context === 'value'
                                                                                        ? (
                                                                                            <div
                                                                                                style={{
                                                                                                    fontSize: '11px',
                                                                                                    fontWeight: 400,
                                                                                                    whiteSpace: 'nowrap',
                                                                                                    overflow: 'hidden',
                                                                                                    textOverflow: 'ellipsis'
                                                                                                }}
                                                                                                title={opt.label}
                                                                                            >
                                                                                                {opt.label}
                                                                                            </div>
                                                                                        ) : (
                                                                                            <div style={{ lineHeight: '1.15', padding: '2px 0' }}>
                                                                                                <div style={{ fontWeight: 400, fontSize: '11px' }}>{opt.label}</div>
                                                                                                <div style={{ fontSize: '10px', color: '#666' }}>
                                                                                                    {opt.customer}{opt.leadJob ? ` (Leadjob-${opt.leadJob})` : ''}
                                                                                                </div>
                                                                                            </div>
                                                                                        )
                                                                                )}
                                                                                styles={{
                                                                                    control: (base) => ({
                                                                                        ...base,
                                                                                        minHeight: '31px',
                                                                                        height: '31px',
                                                                                        fontSize: '12px'
                                                                                    }),
                                                                                    valueContainer: (base) => ({
                                                                                        ...base,
                                                                                        padding: '0 8px'
                                                                                    }),
                                                                                    singleValue: (base) => ({
                                                                                        ...base,
                                                                                        whiteSpace: 'nowrap',
                                                                                        overflow: 'hidden',
                                                                                        textOverflow: 'ellipsis'
                                                                                    }),
                                                                                    indicatorsContainer: (base) => ({
                                                                                        ...base,
                                                                                        height: '31px'
                                                                                    }),
                                                                                    menuPortal: (base) => ({
                                                                                        ...base,
                                                                                        zIndex: 9999
                                                                                    })
                                                                                }}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                    <div className="d-flex flex-column prob-detail-col-2">
                                                                        <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>Chances %</span>
                                                                        <div style={{ width: '180px' }}>
                                                                            <select
                                                                                className="form-select form-select-sm"
                                                                                value={item.ProbabilityOption || ''}
                                                                                onChange={(e) => handleInlineUpdate(item, 'ProbabilityOption', e.target.value)}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                                aria-label="Probability"
                                                                            >
                                                                                <option value="">Select Probability...</option>
                                                                                <option value="Low Chance (25%)">Low Chance (25%)</option>
                                                                                <option value="50-50 Chance (50%)">50-50 Chance (50%)</option>
                                                                                <option value="Medium Chance (75%)">Medium Chance (75%)</option>
                                                                                <option value="High Chance (90%)">High Chance (90%)</option>
                                                                                <option value="Very High Chance (99%)">Very High Chance (99%)</option>
                                                                                <option value="No Chance (0%)">No Chance (0%)</option>
                                                                            </select>
                                                                        </div>
                                                                    </div>
                                                                    <div className="d-flex flex-column prob-detail-col-3">
                                                                        <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>Expected Date</span>
                                                                        <div style={{ width: '130px' }}>
                                                                            <DatePicker
                                                                                selected={item.ExpectedOrderDate ? new Date(item.ExpectedOrderDate) : null}
                                                                                onChange={(date) => {
                                                                                    const dateStr = date ? format(date, 'yyyy-MM-dd') : '';
                                                                                    handleInlineUpdate(item, 'ExpectedOrderDate', dateStr);
                                                                                }}
                                                                                dateFormat="dd-MMM-yyyy"
                                                                                className="form-control form-control-sm"
                                                                                placeholderText="dd-MMM-yyyy"
                                                                                {...PROB_DATE_PICKER_POPPER_COMMON}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                                onKeyDown={(e) => e.stopPropagation()}
                                                                                wrapperClassName="w-100"
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                    <div className="d-flex flex-column prob-detail-field-num prob-detail-col-4">
                                                                        <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>GP % <span className="text-danger">*</span></span>
                                                                        <div className="input-group input-group-sm" style={{ width: '110px' }}>
                                                                            <input
                                                                                type="number"
                                                                                className="form-control form-control-sm"
                                                                                placeholder="0.00"
                                                                                min="0"
                                                                                max="100"
                                                                                step="0.01"
                                                                                value={item.GrossMargin ?? ''}
                                                                                onChange={(e) => handleInlineUpdate(item, 'GrossMargin', e.target.value)}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                                aria-label="Gross Margin"
                                                                                required
                                                                            />
                                                                            <span className="input-group-text px-1 text-muted" style={{ fontSize: '10px' }}>%</span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="d-flex flex-column prob-detail-col-5">
                                                                        <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>Remarks</span>
                                                                        <div style={{ width: '250px' }}>
                                                                            <textarea
                                                                                className="form-control form-control-sm"
                                                                                rows="1"
                                                                                placeholder="Follow-up Remarks"
                                                                                value={item.ProbabilityRemarks || ''}
                                                                                onChange={(e) => handleUpdate(item, { ProbabilityRemarks: e.target.value })}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                                aria-label="Remarks"
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                </>
                                                            )}
                                                            {/* Won UI in 7th Column */}
                                                            {item.Status === 'Won' && (
                                                                <>
                                                                    <div className="d-flex flex-column prob-detail-col-1">
                                                                        <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>Quote Reference</span>
                                                                        <div style={{ width: '320px', minWidth: '320px', maxWidth: '320px' }}>
                                                                            <Select
                                                                                className="basic-single"
                                                                                classNamePrefix="select"
                                                                                placeholder="Quote ref..."
                                                                                isSearchable={true}
                                                                                menuPortalTarget={document.body}
                                                                                value={quoteRefSelectValue(item)}
                                                                                onChange={(option) => handleQuoteRefSelection(item, option)}
                                                                                options={buildQuoteRefOptions(item)}
                                                                                formatOptionLabel={(opt, { context }) => (
                                                                                    context === 'value'
                                                                                        ? (
                                                                                            <div
                                                                                                style={{
                                                                                                    fontSize: '11px',
                                                                                                    fontWeight: 400,
                                                                                                    whiteSpace: 'nowrap',
                                                                                                    overflow: 'hidden',
                                                                                                    textOverflow: 'ellipsis'
                                                                                                }}
                                                                                                title={opt.label}
                                                                                            >
                                                                                                {opt.label}
                                                                                            </div>
                                                                                        ) : (
                                                                                            <div style={{ lineHeight: '1.15', padding: '2px 0' }}>
                                                                                                <div style={{ fontWeight: 400, fontSize: '11px' }}>{opt.label}</div>
                                                                                                <div style={{ fontSize: '10px', color: '#666' }}>
                                                                                                    {opt.customer}{opt.leadJob ? ` (Leadjob-${opt.leadJob})` : ''}
                                                                                                </div>
                                                                                            </div>
                                                                                        )
                                                                                )}
                                                                                styles={{
                                                                                    control: (base) => ({
                                                                                        ...base,
                                                                                        minHeight: '31px',
                                                                                        height: '31px',
                                                                                        fontSize: '12px'
                                                                                    }),
                                                                                    valueContainer: (base) => ({
                                                                                        ...base,
                                                                                        padding: '0 8px'
                                                                                    }),
                                                                                    singleValue: (base) => ({
                                                                                        ...base,
                                                                                        whiteSpace: 'nowrap',
                                                                                        overflow: 'hidden',
                                                                                        textOverflow: 'ellipsis'
                                                                                    }),
                                                                                    indicatorsContainer: (base) => ({
                                                                                        ...base,
                                                                                        height: '31px'
                                                                                    }),
                                                                                    menuPortal: (base) => ({
                                                                                        ...base,
                                                                                        zIndex: 9999
                                                                                    })
                                                                                }}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            />
                                                                        </div>
                                                                    </div>



                                                                    <div className="d-flex flex-column prob-detail-col-2">
                                                                        <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>ERP Job No.</span>
                                                                        <div style={{ width: '130px' }}>
                                                                            <input
                                                                                type="text"
                                                                                className="form-control form-control-sm"
                                                                                placeholder="ERP Job No."
                                                                                value={item.WonJobNo || ''}
                                                                                onChange={(e) => handleInlineUpdate(item, 'WonJobNo', e.target.value)}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                    <div className="d-flex flex-column prob-detail-field-num prob-detail-col-3">
                                                                        <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>Job Value</span>
                                                                        <div className="input-group input-group-sm" style={{ width: '140px' }}>
                                                                            <span className="input-group-text px-1 text-muted" style={{ fontSize: '10px' }}>BD</span>
                                                                            <input
                                                                                type="number"
                                                                                className="form-control form-control-sm"
                                                                                placeholder="0"
                                                                                value={item.WonOrderValue || ''}
                                                                                onChange={(e) => handleInlineUpdate(item, 'WonOrderValue', e.target.value)}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                    <div className="d-flex flex-column prob-detail-field-num prob-detail-col-4">
                                                                        <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>GP % <span className="text-danger">*</span></span>
                                                                        <div className="input-group input-group-sm" style={{ width: '110px' }}>
                                                                            <input
                                                                                type="number"
                                                                                className="form-control form-control-sm"
                                                                                placeholder="0.00"
                                                                                min="0"
                                                                                max="100"
                                                                                step="0.01"
                                                                                value={item.WonGrossProfit ?? ''}
                                                                                onChange={(e) => handleInlineUpdate(item, 'WonGrossProfit', e.target.value)}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            />
                                                                            <span className="input-group-text px-1 text-muted" style={{ fontSize: '10px' }}>%</span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="d-flex flex-column prob-detail-col-5">
                                                                        <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>Booked Date</span>
                                                                        <div style={{ width: '130px' }}>
                                                                            <DatePicker
                                                                                selected={item.ExpectedOrderDate ? new Date(item.ExpectedOrderDate) : null}
                                                                                onChange={(date) => {
                                                                                    const dateStr = date ? format(date, 'yyyy-MM-dd') : '';
                                                                                    handleInlineUpdate(item, 'ExpectedOrderDate', dateStr);
                                                                                }}
                                                                                dateFormat="dd-MMM-yyyy"
                                                                                className="form-control form-control-sm"
                                                                                placeholderText="dd-MMM-yyyy"
                                                                                {...PROB_DATE_PICKER_POPPER_COMMON}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                                onKeyDown={(e) => e.stopPropagation()}
                                                                                wrapperClassName="w-100"
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                    <div className="d-flex flex-column prob-detail-col-6">
                                                                        <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>Remarks</span>
                                                                        <div style={{ width: '250px' }}>
                                                                            <textarea
                                                                                className="form-control form-control-sm"
                                                                                rows="1"
                                                                                placeholder="Won Remarks"
                                                                                value={item.ProbabilityRemarks || ''}
                                                                                onChange={(e) => handleUpdate(item, { ProbabilityRemarks: e.target.value })}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                </>
                                                            )}

                                                            {/* OnHold/Cancelled/Retendered UI */}
                                                            {(item.Status === 'OnHold' || item.Status === 'Cancelled' || item.Status === 'Retendered') && (
                                                                <>
                                                                    <div className="d-flex flex-column prob-detail-col-1" aria-hidden="true">
                                                                        <span style={{ fontSize: '10px', color: 'transparent', marginBottom: '2px' }}>Spacer</span>
                                                                        <div style={{ width: '320px', minHeight: '1.35rem' }} />
                                                                    </div>
                                                                    <div className="d-flex flex-column prob-detail-col-2">
                                                                        <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>Reason</span>
                                                                        <div style={{ width: '220px' }}>
                                                                            <input
                                                                                type="text"
                                                                                className="form-control form-control-sm"
                                                                                placeholder="Reason"
                                                                                value={item.LostReason || ''}
                                                                                onChange={(e) => handleInlineUpdate(item, 'LostReason', e.target.value)}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                    <div className="d-flex flex-column prob-detail-col-3">
                                                                        <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>Remarks</span>
                                                                        <div style={{ width: '250px' }}>
                                                                            <textarea
                                                                                className="form-control form-control-sm"
                                                                                rows="1"
                                                                                placeholder="Remarks"
                                                                                value={item.ProbabilityRemarks || ''}
                                                                                onChange={(e) => handleUpdate(item, { ProbabilityRemarks: e.target.value })}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>

                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            {openColFilter && filterPanelPos
                ? createPortal(
                      <div
                          className="prob-filter-panel border rounded shadow-sm bg-white p-2 text-start text-dark normal-case fw-normal"
                          style={{
                              position: 'fixed',
                              top: filterPanelPos.top,
                              left: filterPanelPos.left,
                              zIndex: 1100,
                              minWidth: filterPanelPos.minWidth,
                              maxHeight: filterPanelPos.maxHeight,
                              overflow: 'auto',
                              fontSize: '11px',
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                      >
                          {openColFilter === 'enquiry' && (
                              <>
                                  <input className="form-control form-control-sm mb-2" placeholder="Search..." value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} />
                                  <div className="d-flex gap-1 mb-2">
                                      <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => setDraftMulti(new Set(columnUniques.enquiry))}>
                                          All
                                      </button>
                                      <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => setDraftMulti(new Set())}>
                                          None
                                      </button>
                                  </div>
                                  <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                                      {columnUniques.enquiry
                                          .filter((v) => !filterSearch || String(v).toLowerCase().includes(filterSearch.toLowerCase()))
                                          .map((val) => (
                                              <label key={String(val)} className="d-flex align-items-center gap-2 mb-1 text-truncate" style={{ cursor: 'pointer' }}>
                                                  <input
                                                      type="checkbox"
                                                      checked={draftMulti.has(val)}
                                                      onChange={() => {
                                                          setDraftMulti((prev) => {
                                                              const n = new Set(prev);
                                                              if (n.has(val)) n.delete(val);
                                                              else n.add(val);
                                                              return n;
                                                          });
                                                      }}
                                                  />
                                                  <span className="text-truncate">{val}</span>
                                              </label>
                                          ))}
                                  </div>
                                  <div className="d-flex gap-1 mt-2 justify-content-end">
                                      <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => clearMultiFilter('enquiry')}>
                                          Clear
                                      </button>
                                      <button type="button" className="btn btn-sm btn-primary py-0" onClick={() => applyMultiDraft('enquiry')}>
                                          Apply
                                      </button>
                                  </div>
                              </>
                          )}
                          {openColFilter === 'project' && (
                              <>
                                  <input className="form-control form-control-sm mb-2" placeholder="Search..." value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} />
                                  <div className="d-flex gap-1 mb-2">
                                      <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => setDraftMulti(new Set(columnUniques.project))}>
                                          All
                                      </button>
                                      <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => setDraftMulti(new Set())}>
                                          None
                                      </button>
                                  </div>
                                  <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                                      {columnUniques.project
                                          .filter((v) => !filterSearch || String(v).toLowerCase().includes(filterSearch.toLowerCase()))
                                          .map((val) => (
                                              <label key={String(val)} className="d-flex align-items-center gap-2 mb-1 text-truncate" style={{ cursor: 'pointer' }}>
                                                  <input
                                                      type="checkbox"
                                                      checked={draftMulti.has(val)}
                                                      onChange={() => {
                                                          setDraftMulti((prev) => {
                                                              const n = new Set(prev);
                                                              if (n.has(val)) n.delete(val);
                                                              else n.add(val);
                                                              return n;
                                                          });
                                                      }}
                                                  />
                                                  <span className="text-truncate">{val}</span>
                                              </label>
                                          ))}
                                  </div>
                                  <div className="d-flex gap-1 mt-2 justify-content-end">
                                      <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => clearMultiFilter('project')}>
                                          Clear
                                      </button>
                                      <button type="button" className="btn btn-sm btn-primary py-0" onClick={() => applyMultiDraft('project')}>
                                          Apply
                                      </button>
                                  </div>
                              </>
                          )}
                          {openColFilter === 'customer' && (
                              <>
                                  <input className="form-control form-control-sm mb-2" placeholder="Search..." value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} />
                                  <div className="d-flex gap-1 mb-2">
                                      <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => setDraftMulti(new Set(columnUniques.customer))}>
                                          All
                                      </button>
                                      <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => setDraftMulti(new Set())}>
                                          None
                                      </button>
                                  </div>
                                  <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                                      {columnUniques.customer
                                          .filter((v) => !filterSearch || String(v).toLowerCase().includes(filterSearch.toLowerCase()))
                                          .map((val) => (
                                              <label key={String(val)} className="d-flex align-items-center gap-2 mb-1 text-truncate" style={{ cursor: 'pointer' }}>
                                                  <input
                                                      type="checkbox"
                                                      checked={draftMulti.has(val)}
                                                      onChange={() => {
                                                          setDraftMulti((prev) => {
                                                              const n = new Set(prev);
                                                              if (n.has(val)) n.delete(val);
                                                              else n.add(val);
                                                              return n;
                                                          });
                                                      }}
                                                  />
                                                  <span className="text-truncate">{val}</span>
                                              </label>
                                          ))}
                                  </div>
                                  <div className="d-flex gap-1 mt-2 justify-content-end">
                                      <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => clearMultiFilter('customer')}>
                                          Clear
                                      </button>
                                      <button type="button" className="btn btn-sm btn-primary py-0" onClick={() => applyMultiDraft('customer')}>
                                          Apply
                                      </button>
                                  </div>
                              </>
                          )}
                          {openColFilter === 'net' && (
                              <>
                                  <label className="form-label small mb-1">Condition</label>
                                  <select className="form-select form-select-sm mb-2" value={draftNet.mode} onChange={(e) => setDraftNet((d) => ({ ...d, mode: e.target.value }))}>
                                      <option value="all">All</option>
                                      <option value="gt">Greater than</option>
                                      <option value="lt">Less than</option>
                                      <option value="eq">Equal to</option>
                                      <option value="gte">Greater or equal</option>
                                      <option value="lte">Less or equal</option>
                                      <option value="between">Between</option>
                                  </select>
                                  <label className="form-label small mb-1">Value (BD)</label>
                                  <input type="text" className="form-control form-control-sm mb-2" placeholder="e.g. 101.100" value={draftNet.v1} onChange={(e) => setDraftNet((d) => ({ ...d, v1: e.target.value }))} />
                                  {draftNet.mode === 'between' && (
                                      <>
                                          <label className="form-label small mb-1">And (BD)</label>
                                          <input type="text" className="form-control form-control-sm mb-2" placeholder="e.g. 200" value={draftNet.v2} onChange={(e) => setDraftNet((d) => ({ ...d, v2: e.target.value }))} />
                                      </>
                                  )}
                                  <div className="d-flex gap-1 mt-2 justify-content-end">
                                      <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={clearNetFilter}>
                                          Clear
                                      </button>
                                      <button type="button" className="btn btn-sm btn-primary py-0" onClick={applyNetDraft}>
                                          Apply
                                      </button>
                                  </div>
                              </>
                          )}
                          {openColFilter === 'status' && (
                              <>
                                  <input className="form-control form-control-sm mb-2" placeholder="Search..." value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} />
                                  <div className="d-flex gap-1 mb-2">
                                      <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => setDraftMulti(new Set(columnUniques.status))}>
                                          All
                                      </button>
                                      <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => setDraftMulti(new Set())}>
                                          None
                                      </button>
                                  </div>
                                  <div style={{ maxHeight: 140, overflowY: 'auto' }}>
                                      {columnUniques.status
                                          .filter((v) => !filterSearch || String(v).toLowerCase().includes(filterSearch.toLowerCase()))
                                          .map((val) => (
                                              <label key={String(val)} className="d-flex align-items-center gap-2 mb-1 text-truncate" style={{ cursor: 'pointer' }}>
                                                  <input
                                                      type="checkbox"
                                                      checked={draftMulti.has(val)}
                                                      onChange={() => {
                                                          setDraftMulti((prev) => {
                                                              const n = new Set(prev);
                                                              if (n.has(val)) n.delete(val);
                                                              else n.add(val);
                                                              return n;
                                                          });
                                                      }}
                                                  />
                                                  <span className="text-truncate">{val}</span>
                                              </label>
                                          ))}
                                  </div>
                                  <div className="d-flex gap-1 mt-2 justify-content-end">
                                      <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => clearMultiFilter('status')}>
                                          Clear
                                      </button>
                                      <button type="button" className="btn btn-sm btn-primary py-0" onClick={() => applyMultiDraft('status')}>
                                          Apply
                                      </button>
                                  </div>
                              </>
                          )}
                          {openColFilter === 'quoteType' && (
                              <>
                                  <input className="form-control form-control-sm mb-2" placeholder="Search..." value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} />
                                  <div className="d-flex gap-1 mb-2">
                                      <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => setDraftMulti(new Set(columnUniques.quoteType))}>
                                          All
                                      </button>
                                      <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => setDraftMulti(new Set())}>
                                          None
                                      </button>
                                  </div>
                                  <div style={{ maxHeight: 140, overflowY: 'auto' }}>
                                      {columnUniques.quoteType
                                          .filter((v) => !filterSearch || String(v).toLowerCase().includes(filterSearch.toLowerCase()))
                                          .map((val) => (
                                              <label key={String(val)} className="d-flex align-items-center gap-2 mb-1 text-truncate" style={{ cursor: 'pointer' }}>
                                                  <input
                                                      type="checkbox"
                                                      checked={draftMulti.has(val)}
                                                      onChange={() => {
                                                          setDraftMulti((prev) => {
                                                              const n = new Set(prev);
                                                              if (n.has(val)) n.delete(val);
                                                              else n.add(val);
                                                              return n;
                                                          });
                                                      }}
                                                  />
                                                  <span className="text-truncate">{val}</span>
                                              </label>
                                          ))}
                                  </div>
                                  <div className="d-flex gap-1 mt-2 justify-content-end">
                                      <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => clearMultiFilter('quoteType')}>
                                          Clear
                                      </button>
                                      <button type="button" className="btn btn-sm btn-primary py-0" onClick={() => applyMultiDraft('quoteType')}>
                                          Apply
                                      </button>
                                  </div>
                              </>
                          )}
                          {openColFilter === 'probability' && (
                              <>
                                  <input className="form-control form-control-sm mb-2" placeholder="Search..." value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} />
                                  <div className="d-flex gap-1 mb-2">
                                      <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => setDraftMulti(new Set(columnUniques.probability))}>
                                          All
                                      </button>
                                      <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => setDraftMulti(new Set())}>
                                          None
                                      </button>
                                  </div>
                                  <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                                      {columnUniques.probability
                                          .filter((v) => !filterSearch || String(v).toLowerCase().includes(filterSearch.toLowerCase()))
                                          .map((val) => (
                                              <label key={String(val)} className="d-flex align-items-center gap-2 mb-1 text-truncate" style={{ cursor: 'pointer' }}>
                                                  <input
                                                      type="checkbox"
                                                      checked={draftMulti.has(val)}
                                                      onChange={() => {
                                                          setDraftMulti((prev) => {
                                                              const n = new Set(prev);
                                                              if (n.has(val)) n.delete(val);
                                                              else n.add(val);
                                                              return n;
                                                          });
                                                      }}
                                                  />
                                                  <span className="text-truncate">{val}</span>
                                              </label>
                                          ))}
                                  </div>
                                  <div className="d-flex gap-1 mt-2 justify-content-end">
                                      <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => clearMultiFilter('probability')}>
                                          Clear
                                      </button>
                                      <button type="button" className="btn btn-sm btn-primary py-0" onClick={() => applyMultiDraft('probability')}>
                                          Apply
                                      </button>
                                  </div>
                              </>
                          )}
                          {openColFilter === 'expectedDate' && (
                              <>
                                  <input className="form-control form-control-sm mb-2" placeholder="Search..." value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} />
                                  <div className="d-flex gap-1 mb-2">
                                      <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => setDraftMulti(new Set(columnUniques.expectedDate))}>
                                          All
                                      </button>
                                      <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => setDraftMulti(new Set())}>
                                          None
                                      </button>
                                  </div>
                                  <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                                      {columnUniques.expectedDate
                                          .filter((v) => !filterSearch || String(formatExpectedDateLabel(v)).toLowerCase().includes(filterSearch.toLowerCase()) || String(v).toLowerCase().includes(filterSearch.toLowerCase()))
                                          .map((val) => (
                                              <label key={String(val)} className="d-flex align-items-center gap-2 mb-1 text-truncate" style={{ cursor: 'pointer' }}>
                                                  <input
                                                      type="checkbox"
                                                      checked={draftMulti.has(val)}
                                                      onChange={() => {
                                                          setDraftMulti((prev) => {
                                                              const n = new Set(prev);
                                                              if (n.has(val)) n.delete(val);
                                                              else n.add(val);
                                                              return n;
                                                          });
                                                      }}
                                                  />
                                                  <span className="text-truncate">{formatExpectedDateLabel(val)}</span>
                                              </label>
                                          ))}
                                  </div>
                                  <div className="d-flex gap-1 mt-2 justify-content-end">
                                      <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => clearMultiFilter('expectedDate')}>
                                          Clear
                                      </button>
                                      <button type="button" className="btn btn-sm btn-primary py-0" onClick={() => applyMultiDraft('expectedDate')}>
                                          Apply
                                      </button>
                                  </div>
                              </>
                          )}
                          {openColFilter === 'wonBookedDate' && renderProbDateHierarchyFilterPanel('wonBookedDate')}
                          {openColFilter === 'lostDate' && renderProbDateHierarchyFilterPanel('lostDate')}
                          {[
                              'detailQuoteRef',
                              'wonJobNo',
                              'detailRemarks',
                              'lostTo',
                              'lostReason',
                          ].includes(openColFilter) && renderMultiFilterPanel(openColFilter)}
                          {openColFilter === 'wonJobValue' && renderNumericFilterPanel('wonJobValue', 'Value (BD)')}
                          {openColFilter === 'wonGpPct' && renderNumericFilterPanel('wonGpPct', 'Value (%)')}
                          {openColFilter === 'grossMargin' && renderNumericFilterPanel('grossMargin', 'Value (%)')}
                          {openColFilter === 'lostCompetitorPrice' && renderNumericFilterPanel('lostCompetitorPrice', 'Value (BD)')}
                      </div>,
                      document.body,
                  )
                : null}
            {historyReqNo ? (
                <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center" style={{ background: 'rgba(0,0,0,0.35)', zIndex: 2000 }}>
                    <div className="bg-white rounded shadow" style={{ width: '95%', maxWidth: '1200px', maxHeight: '85vh', overflow: 'hidden' }}>
                        <div className="d-flex justify-content-between align-items-start border-bottom p-3">
                            <div>
                                <h6 className="mb-2 fw-semibold">Probability Update History for</h6>
                                <div className="small text-dark" style={{ lineHeight: 1.65 }}>
                                    <div><span className="text-muted">Enquiry No.:</span> {historyReqNo}</div>
                                    <div>
                                        <span className="text-muted">Project Name:</span>{' '}
                                        <strong className="text-dark">{historyHeader.projectName || '—'}</strong>
                                    </div>
                                    <div><span className="text-muted">Leadjob Name:</span> {historyHeader.leadJobName || '—'}</div>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary"
                                onClick={() => {
                                    setHistoryReqNo('');
                                    setHistoryRows([]);
                                    setHistoryHeader({ projectName: '', leadJobName: '' });
                                }}
                            >
                                Close
                            </button>
                        </div>
                        <div className="p-2" style={{ maxHeight: '70vh', overflow: 'auto' }}>
                            <table className="table table-sm table-bordered mb-0" style={{ fontSize: '12px' }}>
                                <thead style={{ background: EMS_TABLE_HEADER_GRADIENT }}>
                                    <tr className="text-white">
                                        <th>Updated</th>
                                        <th>Customer name</th>
                                        <th>Quote Ref</th>
                                        <th>Status</th>
                                        <th>Probability</th>
                                        <th>Remarks</th>
                                        <th>Probability Updated by</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {historyLoading ? (
                                        <tr><td colSpan="7" className="text-center py-3">Loading history...</td></tr>
                                    ) : historyRows.length === 0 ? (
                                        <tr><td colSpan="7" className="text-center py-3 text-muted">No history found.</td></tr>
                                    ) : [...historyRows]
                                        .sort((a, b) => {
                                            const ta = new Date(a.UpdatedDateTime || 0).getTime();
                                            const tb = new Date(b.UpdatedDateTime || 0).getTime();
                                            return tb - ta;
                                        })
                                        .map((r) => (
                                        <tr key={r.ID}>
                                            <td>{formatHistoryDateTime(r.UpdatedDateTime)}</td>
                                            <td>{r.ToName || ''}</td>
                                            <td>
                                                {r.QuoteRef || ''}
                                                {r.QuoteRefQuoteDate
                                                    ? ` (${formatHistoryDateTime(r.QuoteRefQuoteDate)})`
                                                    : ''}
                                            </td>
                                            <td
                                                style={{
                                                    fontWeight: 700,
                                                    color: getProbStatusColor(r.Status),
                                                }}
                                            >
                                                {r.Status || ''}
                                            </td>
                                            <td>{r.ProbabilityChance || ''}</td>
                                            <td>{r.Remarks || ''}</td>
                                            <td>{r.UpdatedByDisplayName || r.UpdatedBy || ''}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            ) : null}
        </div >
    );
};

export default ProbabilityForm;
