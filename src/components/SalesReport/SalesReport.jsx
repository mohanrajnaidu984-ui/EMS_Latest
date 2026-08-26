import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell, CartesianGrid
} from 'recharts';
import { Printer, Mail, Maximize2, Minimize2, FilterX } from 'lucide-react';
import { downloadJobsTableXlsx } from './salesReportJobsExcel';
import ExcelDownloadButton from '../shared/ExcelDownloadButton';
import './SalesReport.css';

/** A4 landscape printable area (mm margins each side). */
const SR_PRINT_PAGE_MM = { width: 297, height: 210, margin: 6 };
/** Slight inset so the right-edge pipeline column is not clipped by the printer. */
const SR_PRINT_SCALE_INSET = 0.97;

const defaultReport = () => ({
    targetVsActual: [
        { name: 'Q1', target: 0, actual: 0 },
        { name: 'Q2', target: 0, actual: 0 },
        { name: 'Q3', target: 0, actual: 0 },
        { name: 'Q4', target: 0, actual: 0 }
    ],
    grossMarginTargetVsActual: [
        { name: 'Q1', target: 0, actual: 0, targetSalesBase: 0, targetGpPct: 0 },
        { name: 'Q2', target: 0, actual: 0, targetSalesBase: 0, targetGpPct: 0 },
        { name: 'Q3', target: 0, actual: 0, targetSalesBase: 0, targetGpPct: 0 },
        { name: 'Q4', target: 0, actual: 0, targetSalesBase: 0, targetGpPct: 0 }
    ],
    /** Mean of each won job's booked GrossMargin% (same Probability snapshot as summary); null = use blended fallback. */
    avgWonBookedGpPct: null,
    winLoss: {
        won: 0, lost: 0, followUp: 0, quoted: 0,
        wonValue: 0, lostValue: 0, followUpValue: 0, quotedValue: 0
    },
    probabilityFunnel: [],
    topJobBooked: []
});

/** BHD: up to 999 direct; 1,000–999,999 as k; 1,000,000+ as M (entire report). */
const SR_ONE_MILLION = 1_000_000;
const SR_ONE_THOUSAND = 1_000;

function formatSalesAmountString(num) {
    const n = Number(num);
    if (Number.isNaN(n)) return '0.00';
    const abs = Math.abs(n);
    const neg = n < 0;
    let body;
    if (abs < SR_ONE_THOUSAND) {
        body = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } else if (abs < SR_ONE_MILLION) {
        body = `${(abs / SR_ONE_THOUSAND).toFixed(2)}k`;
    } else {
        body = `${(abs / SR_ONE_MILLION).toFixed(2)}M`;
    }
    return neg ? `-${body}` : body;
}

function formatExactAmountString(num) {
    const n = Number(num);
    if (Number.isNaN(n)) return '0.00';
    return n.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

/** Brand palette for this report only */
const SR_BLUE = '#6a73ae';
const SR_BLUE_LIGHT = '#abc3e4';

const WON_GREEN = '#15803d';
const LOST_RED = '#dc2626';
/** Won/Lost card: Follow up KPI + donut segment */
const SR_ROYAL_BLUE = '#20396D';

const PIE_COLORS = {
    Won: WON_GREEN,
    Lost: LOST_RED,
    'Follow up': SR_ROYAL_BLUE
};

/** Won/Lost donut: SVG defs gradient ids (fills pie sectors) */
const SR_DONUT_GRADIENTS = {
    Won: { id: 'srDonutGradWon', hi: '#22c55e', lo: WON_GREEN },
    Lost: { id: 'srDonutGradLost', hi: '#f87171', lo: LOST_RED },
    'Follow up': { id: 'srDonutGradFollowUp', hi: '#7BA3FF', lo: '#2952c4' }
};

/** Target vs Actual / GM charts — actual darker slate; target lighter periwinkle */
const BAR_TARGET_FILL = '#8fa9d2';
const BAR_ACTUAL_FILL = '#20396D';

/** SVG fill URLs (unique per chart so two BarCharts can coexist) */
const SR_BAR_JB = { target: 'url(#srBarJbTarget)', actual: 'url(#srBarJbActual)' };
const SR_BAR_GM = { target: 'url(#srBarGmTarget)', actual: 'url(#srBarGmActual)' };

/** Lighten any #RRGGBB toward white (0 = solid, 1 = white) — bar + funnel gradients */
function mixHexWithWhite(hex, whiteBlend) {
    const raw = String(hex || '').replace('#', '');
    if (raw.length !== 6) return hex;
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    const t = Math.min(1, Math.max(0, whiteBlend));
    const mx = (c) => Math.round(c + (255 - c) * t);
    const h = (n) => n.toString(16).padStart(2, '0');
    return `#${h(mx(r))}${h(mx(g))}${h(mx(b))}`;
}

/** Darken #RRGGBB toward black (0 = no change, 1 = strong) — funnel band bottom edge */
function mixHexWithBlack(hex, amount) {
    const raw = String(hex || '').replace('#', '');
    if (raw.length !== 6) return hex;
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    const t = Math.min(1, Math.max(0, amount));
    const dk = (c) => Math.round(c * (1 - t * 0.5));
    const h = (n) => n.toString(16).padStart(2, '0');
    return `#${h(dk(r))}${h(dk(g))}${h(dk(b))}`;
}

function hexToRgb(hex) {
    const raw = String(hex || '').replace('#', '');
    if (raw.length !== 6) return null;
    return {
        r: parseInt(raw.slice(0, 2), 16),
        g: parseInt(raw.slice(2, 4), 16),
        b: parseInt(raw.slice(4, 6), 16)
    };
}

function lerpColorHex(hexA, hexB, t) {
    const a = hexToRgb(hexA);
    const b = hexToRgb(hexB);
    if (!a || !b) return hexA;
    const u = Math.min(1, Math.max(0, t));
    const x = (c1, c2) => Math.round(c1 + (c2 - c1) * u);
    const pad = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
    return `#${pad(x(a.r, b.r))}${pad(x(a.g, b.g))}${pad(x(a.b, b.b))}`;
}

/** Legend order: Recharts sorts by `value` alphabetically by default (Actual before Target). Pin Target first. */
const legendTargetFirstSorter = (entry) => (entry.value === 'Target' ? 0 : 1);

/** Slightly dark grey for Target vs Actual / GM bar chart axes + legend (matches summary text tuning). */
const SR_CHART_TICK_FILL = '#1f2937';
/** Legend label text — dark grey for all charts. */
const SR_CHART_LEGEND_GREY = '#374151';

/** Bar charts: left margin + Y width so "400.00k" ticks are not clipped; tick size ≥ summary legibility. */
const SR_BAR_CHART_MARGIN = { top: 6, right: 6, left: 16, bottom: 6 };
const SR_YAXIS_WIDTH = 46;
const SR_YAXIS_TICK = { fontSize: 10, fill: SR_CHART_TICK_FILL };

/** Target vs Actual / GM charts — align tick legend sizes with summary (+15%) */
const SR_TA_TEXT_SCALE = 1.15;
const SR_TA_YAXIS_WIDTH = Math.round(SR_YAXIS_WIDTH * SR_TA_TEXT_SCALE);
/** Y-axis value labels −15% vs prior scaled size */
const SR_TA_YAXIS_FONT_SCALE = 0.85;
const SR_TA_YAXIS_TICK = {
    fontSize: Math.round(10 * SR_TA_TEXT_SCALE * SR_TA_YAXIS_FONT_SCALE),
    fill: SR_CHART_TICK_FILL
};
const SR_TA_XAXIS_TICK = {
    fontSize: Math.round(9 * SR_TA_TEXT_SCALE),
    fill: SR_CHART_TICK_FILL,
    textAnchor: 'middle'
};
const SR_TA_LEGEND_FONT_SIZE = Math.round(9 * SR_TA_TEXT_SCALE);
const SR_TA_XAXIS_HEIGHT = Math.round(16 * SR_TA_TEXT_SCALE);

/** Job Booking + Gross margin: tight chart left; quarter table padding matches Recharts plot inset so Q1–Q4 line up with bar / x-axis centres */
const SR_TA_ALIGNED_BAR_MARGIN = { top: 6, right: 6, left: 2, bottom: 6 };
/** Left offset to category plot (margin.left + Y-axis width) — same basis as Recharts layout. */
const SR_TA_PLOT_OFFSET_LEFT = SR_TA_ALIGNED_BAR_MARGIN.left + SR_TA_YAXIS_WIDTH;
const SR_TA_PLOT_OFFSET_RIGHT = SR_TA_ALIGNED_BAR_MARGIN.right;
const SR_TA_QUARTER_CHART_ALIGN_STYLE = {
    '--sr-ta-plot-offset-left': `${SR_TA_PLOT_OFFSET_LEFT}px`,
    '--sr-ta-plot-offset-right': `${SR_TA_PLOT_OFFSET_RIGHT}px`
};

/** Job list table (all rows for status, sorted by value) — options must match `salesReportRoutes.js` */
const TOP_JOB_STATUS_OPTIONS = [
    { value: 'Quoted', label: 'Quoted' },
    { value: 'Won', label: 'Won' },
    { value: 'Lost', label: 'Lost' },
    { value: 'Follow Up', label: 'Follow up' },
    { value: 'Pending', label: 'Pending to update Probability' }
];

const TOP_JOB_TABLE_CONFIG = {
    Quoted: {
        valueHeader: 'Net Quoted Value',
        chartHeader: 'Net Quoted Value Chart',
        metricHeader: 'Quote Ref',
        extraHeader: null
    },
    Won: {
        valueHeader: 'Booked Value',
        chartHeader: 'Booked Value Chart',
        metricHeader: 'Gross Profit (%)',
        extraHeader: null
    },
    Lost: {
        valueHeader: 'Lost Value',
        chartHeader: 'Lost Value Chart',
        metricHeader: 'Lost To Whom',
        extraHeader: 'Reason For Lost'
    },
    Pending: {
        valueHeader: 'Net Quoted Value',
        chartHeader: 'Net Quoted Value Chart',
        metricHeader: 'Status',
        extraHeader: null
    },
    'Follow Up': {
        valueHeader: 'Net Quoted Value',
        chartHeader: 'Net Quoted Value Chart',
        metricHeader: 'Chance %',
        extraHeader: 'Follow Up Remarks'
    }
};

const TOP_JOB_QUOTE_TYPE_STATUSES = new Set(['Quoted', 'Won', 'Lost', 'Follow Up']);
const TOP_JOB_PROB_QUOTE_REF_DATE_STATUSES = new Set(['Won', 'Lost', 'Follow Up']);
/** Total + chart % use highest line value per enquiry; value column shows each customer row. */
const TOP_JOB_MAX_PER_ENQUIRY_VALUE_STATUSES = new Set(['Quoted', 'Follow Up']);

const SR_STORAGE_LEGACY = {
    year: 'reports_year',
    company: 'reports_company',
    division: 'reports_division',
    role: 'reports_role',
    topJobStatus: 'reports_top_job_status',
    tableExpanded: 'reports_table_expanded'
};

function normalizeSalesReportUserEmail(currentUser, storedLoginEmail) {
    return (currentUser?.EmailId || currentUser?.email || storedLoginEmail || '')
        .toString()
        .trim()
        .toLowerCase();
}

function srPrefKey(email, name) {
    return email ? `reports_${name}_${email}` : SR_STORAGE_LEGACY[name] || `reports_${name}`;
}

function readSrPref(email, name, fallback = '') {
    if (email) {
        const perUser = localStorage.getItem(srPrefKey(email, name));
        if (perUser != null && perUser !== '') return perUser;
    }
    const legacyKey = SR_STORAGE_LEGACY[name];
    if (legacyKey) {
        const legacy = localStorage.getItem(legacyKey);
        if (legacy != null && legacy !== '') return legacy;
    }
    return fallback;
}

function writeSrPref(email, name, value) {
    const stored = value == null ? '' : String(value);
    if (email) localStorage.setItem(srPrefKey(email, name), stored);
    const legacyKey = SR_STORAGE_LEGACY[name];
    if (legacyKey) localStorage.setItem(legacyKey, stored);
}

function readSrTableFilters(email, topJobStatus) {
    const key = email
        ? `reports_table_filters_${email}_${topJobStatus}`
        : `reports_table_filters_${topJobStatus}`;
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return { columnFilters: {}, valueFilter: null, grossMarginFilter: null };
        const parsed = JSON.parse(raw);
        return {
            columnFilters:
                parsed?.columnFilters && typeof parsed.columnFilters === 'object'
                    ? parsed.columnFilters
                    : {},
            valueFilter: parsed?.valueFilter ?? null,
            grossMarginFilter: parsed?.grossMarginFilter ?? null
        };
    } catch {
        return { columnFilters: {}, valueFilter: null, grossMarginFilter: null };
    }
}

function writeSrTableFilters(email, topJobStatus, columnFilters, valueFilter, grossMarginFilter) {
    const key = email
        ? `reports_table_filters_${email}_${topJobStatus}`
        : `reports_table_filters_${topJobStatus}`;
    localStorage.setItem(
        key,
        JSON.stringify({
            columnFilters: columnFilters || {},
            valueFilter: valueFilter ?? null,
            grossMarginFilter: grossMarginFilter ?? null
        })
    );
}

function passesNumericCompareFilter(rawValue, filter) {
    if (!filter) return true;
    const raw1 = String(filter.v1 ?? '').trim();
    const raw2 = String(filter.v2 ?? '').trim();
    if (raw1 === '') return true;
    const n1 = Number(raw1);
    const n2 = Number(raw2);
    if (!Number.isFinite(n1)) return true;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return false;
    if (filter.mode === 'gt') return value > n1;
    if (filter.mode === 'lt') return value < n1;
    if (filter.mode === 'eq') return value === n1;
    if (filter.mode === 'between') {
        if (raw2 === '' || !Number.isFinite(n2)) return true;
        const min = Math.min(n1, n2);
        const max = Math.max(n1, n2);
        return value >= min && value <= max;
    }
    return true;
}

/** Gross Margin % from Probability.GrossMargin (API may alias as WonGrossProfit). */
function parseRowGrossMarginPct(row) {
    const raw = row?.GrossMargin ?? row?.WonGrossProfit;
    if (raw === null || raw === undefined || raw === '') return null;
    const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/%/g, '').trim());
    return Number.isFinite(n) ? n : null;
}

const FUNNEL_STAGE_DEFS = [
    { name: 'Quoted', probability: 10, pctLabel: 'Pending' },
    { name: 'Low Chance', probability: 25, pctLabel: '25%' },
    { name: '50-50 Chance', probability: 50, pctLabel: '50%' },
    { name: 'Medium Chance', probability: 75, pctLabel: '75%' },
    { name: 'High Chance', probability: 90, pctLabel: '90%' },
    { name: 'Very High Chance', probability: 99, pctLabel: '99%' }
];

/** Pipeline funnel: requested blue gradient ramp — dark top -> lighter bottom */
const FUNNEL_COLOR_TOP = '#203f75';
const FUNNEL_COLOR_BOTTOM = '#3f68ad';

const FUNNEL_STAGES = FUNNEL_STAGE_DEFS.map((s, i) => {
    const n = FUNNEL_STAGE_DEFS.length;
    const t = n <= 1 ? 0 : i / (n - 1);
    return { ...s, color: lerpColorHex(FUNNEL_COLOR_TOP, FUNNEL_COLOR_BOTTOM, t) };
});

/** Match API funnel rows to a pipeline stage by numeric % only (aligned with Jobs Follow-up table filter). */
function probabilityFunnelRowMatchesStage(item, stage) {
    const pct = Number(item?.ProbabilityPercentage);
    return Number.isFinite(pct) && pct === stage.probability;
}

function topJobEnquiryKey(row) {
    return String(row?.RequestNo || row?.EnquiryNo || '').trim();
}

/** Keep all lines for one enquiry adjacent; order groups by highest line value in the group. */
function sortTopJobRowsWithEnquiryGroups(rows, topJobStatus) {
    const list = Array.isArray(rows) ? rows : [];
    const maxByEnquiry = new Map();
    list.forEach((r) => {
        const k = topJobEnquiryKey(r);
        const v = Number(r.JobValue) || 0;
        if (!k) return;
        maxByEnquiry.set(k, Math.max(maxByEnquiry.get(k) ?? 0, v));
    });
    const groupMax = (r) => {
        const k = topJobEnquiryKey(r);
        return k ? (maxByEnquiry.get(k) ?? (Number(r.JobValue) || 0)) : (Number(r.JobValue) || 0);
    };
    const byValue = (a, b) => (Number(b.JobValue) || 0) - (Number(a.JobValue) || 0);
    if (topJobStatus === 'Follow Up') {
        const chancePct = (row) => {
            const m = String(row.ProbabilityChance || '').match(/(\d+(?:\.\d+)?)\s*%/);
            return m ? Number(m[1]) : -1;
        };
        return [...list].sort((a, b) => {
            const pctDiff = chancePct(b) - chancePct(a);
            if (pctDiff !== 0) return pctDiff;
            const ka = topJobEnquiryKey(a);
            const kb = topJobEnquiryKey(b);
            if (ka !== kb) {
                const maxDiff = groupMax(b) - groupMax(a);
                if (maxDiff !== 0) return maxDiff;
                if (!ka) return 1;
                if (!kb) return -1;
                return ka.localeCompare(kb, undefined, { numeric: true });
            }
            const valDiff = byValue(a, b);
            if (valDiff !== 0) return valDiff;
            return String(a.CustomerName || '').localeCompare(String(b.CustomerName || ''), undefined, {
                sensitivity: 'base',
            });
        });
    }
    return [...list].sort((a, b) => {
        const maxDiff = groupMax(b) - groupMax(a);
        if (maxDiff !== 0) return maxDiff;
        const ka = topJobEnquiryKey(a);
        const kb = topJobEnquiryKey(b);
        if (ka !== kb) {
            if (!ka) return 1;
            if (!kb) return -1;
            return ka.localeCompare(kb, undefined, { numeric: true });
        }
        const valDiff = byValue(a, b);
        if (valDiff !== 0) return valDiff;
        return String(a.CustomerName || '').localeCompare(String(b.CustomerName || ''), undefined, {
            sensitivity: 'base',
        });
    });
}

function buildTopJobEnquiryGroupMeta(rows) {
    const continuation = new Set();
    const rowSpanAt = new Map();
    let i = 0;
    while (i < rows.length) {
        const key = topJobEnquiryKey(rows[i]);
        let j = i + 1;
        if (key) {
            while (j < rows.length && topJobEnquiryKey(rows[j]) === key) j += 1;
        }
        rowSpanAt.set(i, j - i);
        for (let k = i + 1; k < j; k++) continuation.add(k);
        i = j;
    }
    return { continuation, rowSpanAt };
}

function renderTopJobEnquiryGroupCell(isContinuation, rowSpan, className, content, style) {
    if (isContinuation) return null;
    const cls = ['sr-detail-table__enquiry-group-cell', className].filter(Boolean).join(' ');
    return (
        <td rowSpan={rowSpan} className={cls} style={style}>
            {content}
        </td>
    );
}

/** Default Jobs table column widths (px) — shared across all status dropdown options; user-resizable. */
const DEFAULT_TOP_JOB_COL_WIDTHS = {
    slNo: 44,
    requestNo: 90,
    projectName: 250,
    customerName: 250,
    jobValue: 120,
    chart: 150,
    grossMargin: 120,
    metric: 110,
    quoteDate: 95,
    bookedDate: 95,
    lostDate: 95,
    expectedDate: 105,
    leadJob: 150,
    quoteRef: 140,
    clientName: 250,
    consultantName: 250,
    quoteType: 110,
    concernSe: 150,
    extra: 180,
};

const TOP_JOB_CLIP_COLS = new Set([
    'requestNo',
    'projectName',
    'customerName',
    'metric',
    'quoteRef',
    'leadJob',
    'clientName',
    'consultantName',
    'quoteType',
    'concernSe',
    'extra',
]);

function readTopJobColWidths() {
    try {
        const raw = localStorage.getItem('reports_topJobColWidths');
        if (!raw) return { ...DEFAULT_TOP_JOB_COL_WIDTHS };
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_TOP_JOB_COL_WIDTHS };
        return { ...DEFAULT_TOP_JOB_COL_WIDTHS, ...parsed };
    } catch {
        return { ...DEFAULT_TOP_JOB_COL_WIDTHS };
    }
}

function writeTopJobColWidths(widths) {
    try {
        localStorage.setItem('reports_topJobColWidths', JSON.stringify(widths || {}));
    } catch {
        /* ignore */
    }
}

/** Custom inverted funnel; numeric values are shown in the summary block below. */
function SalesPipelineFunnelVisual({ rows, formatFullNumber, formatGmParts }) {
    const funnelWrapRef = useRef(null);
    const [svgPx, setSvgPx] = useState(null);

    useLayoutEffect(() => {
        const el = funnelWrapRef.current;
        if (!el) return undefined;

        const measure = () => {
            const r = el.getBoundingClientRect();
            const w = Math.max(1, Math.round(r.width));
            const h = Math.max(1, Math.round(r.height));
            setSvgPx((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
        };

        measure();
        if (typeof ResizeObserver === 'undefined') return undefined;
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const vb = { w: 100, h: 100 };
    /** Extra viewBox space above/below drawing (y 0…h) so top % label (e.g. 10%) isn’t clipped. */
    const vbPadY = 6;
    /** Left/right viewBox pad — % labels use textAnchor end and extend left of the funnel edge; without this, “10%” clips. */
    const vbPadX = 14;
    /** Widest row at top — nudge up slightly vs inset copy while vbPadX keeps “10%” clear. */
    const hwTop = 50.5;
    /** Minimum half-width at bottom — flat base. */
    const hwBot = 14.2;
    const hwAt = (y) => hwTop + ((hwBot - hwTop) * y) / vb.h;
    const n = Math.max(rows?.length || 0, 1);
    const bandH = vb.h / n;
    /** Small visual separation only between 10% and 25% bands. */
    const topBandGap = 2.4;

    const vbW = vb.w + 2 * vbPadX;
    const vbH = vb.h + 2 * vbPadY;
    const getGmParts = formatGmParts || (() => null);
    /** Highlight color for GP line (prefix + value + %) on dark funnel bands */
    const gpLineFill = '#FDE047';

    return (
        <div className="sales-pipeline-funnel-visual d-flex flex-column flex-grow-1 min-h-0 w-100">
            <div className="sr-funnel-svg-wrap" ref={funnelWrapRef}>
                <svg
                    viewBox={`${-vbPadX} ${-vbPadY} ${vbW} ${vbH}`}
                    preserveAspectRatio="xMidYMid meet"
                    width={svgPx?.w}
                    height={svgPx?.h}
                    className={`sr-funnel-svg${svgPx ? ' sr-funnel-svg--sized' : ''}`}
                    role="img"
                    aria-label="Sales pipeline by probability stage"
                >
                    <defs>
                        {rows.map((row, i) => (
                            <linearGradient
                                key={`srFunnelGrad-${i}`}
                                id={`srFunnelGrad-${i}`}
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                            >
                                <stop offset="0%" stopColor={mixHexWithWhite(row.fill, 0.38)} />
                                <stop offset="100%" stopColor={mixHexWithBlack(row.fill, 0.42)} />
                            </linearGradient>
                        ))}
                    </defs>
                    <g>
                    {rows.map((row, i) => {
                        const y0 = i * bandH + (i === 1 ? topBandGap / 2 : 0);
                        const y1 = (i + 1) * bandH - (i === 0 ? topBandGap / 2 : 0);
                        const xLT = vb.w / 2 - hwAt(y0);
                        const xRT = vb.w / 2 + hwAt(y0);
                        const xLB = vb.w / 2 - hwAt(y1);
                        const xRB = vb.w / 2 + hwAt(y1);
                        const pts = `${xLT},${y0} ${xRT},${y0} ${xRB},${y1} ${xLB},${y1}`;
                        const val = Number(row.value) || 0;
                        const stage = FUNNEL_STAGES[i];
                        const gmParts = stage?.probability === 10 ? null : getGmParts(row);
                        return (
                            <g key={row.name || i}>
                                <title>{`${row.name}: ${formatFullNumber(val)}${gmParts ? ` ${gmParts.full}` : ''}`}</title>
                                <polygon
                                    points={pts}
                                    fill={`url(#srFunnelGrad-${i})`}
                                    stroke="#1e293b"
                                    strokeOpacity={0.42}
                                    strokeWidth="0.5"
                                    strokeLinejoin="miter"
                                    vectorEffect="non-scaling-stroke"
                                />
                            </g>
                        );
                    })}
                    </g>
                    {rows.map((row, i) => {
                        const stage = FUNNEL_STAGES[i];
                        if (!stage) return null;
                        const y0 = i * bandH + (i === 1 ? topBandGap / 2 : 0);
                        const y1 = (i + 1) * bandH - (i === 0 ? topBandGap / 2 : 0);
                        const bandMid = (y0 + y1) / 2;
                        /* Top band: label a bit lower so “10%” clears viewBox padding; others slightly above mid-band */
                        const cy =
                            i === 0 ? y0 + (y1 - y0) * 0.5 : bandMid - (y1 - y0) * 0.12;
                        const xLeftAtCy = vb.w / 2 - hwAt(cy);
                        const labelX = xLeftAtCy - 1.15;
                        return (
                            <text
                                key={`lbl-${stage.probability}`}
                                x={labelX}
                                y={cy}
                                fontSize={4.97}
                                textAnchor="end"
                                dominantBaseline="middle"
                                className="sr-funnel-label-text-svg"
                            >
                                {stage.pctLabel || `${stage.probability}%`}
                            </text>
                        );
                    })}
                    {rows.map((row, i) => {
                        const val = Number(row.value) || 0;
                        if (val <= 0) return null;
                        const stage = FUNNEL_STAGES[i];
                        const y0 = i * bandH + (i === 1 ? topBandGap / 2 : 0);
                        const y1 = (i + 1) * bandH - (i === 0 ? topBandGap / 2 : 0);
                        // Pending (10%): quoted value only — no gross margin suffix
                        const gmParts = stage?.probability === 10 ? null : getGmParts(row);
                        const bandMid = (y0 + y1) / 2;
                        const cyVal = gmParts ? bandMid - (y1 - y0) * 0.12 : y0 + (y1 - y0) * 0.62;
                        return (
                            <text
                                key={`fval-${row.name || i}`}
                                x={vb.w / 2}
                                y={cyVal}
                                fontSize={gmParts ? 4.41 : 5.6}
                                fontWeight="600"
                                textAnchor="middle"
                                dominantBaseline="middle"
                                className="sr-funnel-block-value-svg"
                                fill="#ffffff"
                            >
                                <tspan x={vb.w / 2} dy="0">
                                    {formatSalesAmountString(val)}
                                </tspan>
                                {gmParts ? (
                                    <tspan
                                        x={vb.w / 2}
                                        dy="4.2"
                                        fontSize={3.57}
                                        fontWeight="600"
                                        fill={gpLineFill}
                                    >
                                        {`${gmParts.prefix} ${gmParts.detail}`}
                                    </tspan>
                                ) : null}
                            </text>
                        );
                    })}
                </svg>
            </div>
        </div>
    );
}

const SalesReport = () => {
    const { currentUser, storedLoginEmail } = useAuth();
    const userEmailNorm = useMemo(
        () => normalizeSalesReportUserEmail(currentUser, storedLoginEmail),
        [currentUser, storedLoginEmail]
    );
    const prefsHydratedForEmail = useRef('');
    const tableFiltersHydratedKey = useRef('');
    const [tableFiltersReady, setTableFiltersReady] = useState(false);

    const [filterLocks, setFilterLocks] = useState({
        company: false,
        division: false,
        role: false
    });

    const [year, setYear] = useState(() => readSrPref('', 'year', '2026'));
    const [company, setCompany] = useState(() => {
        const s = readSrPref('', 'company', '');
        return s && s !== 'All' ? s : '';
    });
    const [division, setDivision] = useState(() => {
        const s = readSrPref('', 'division', '');
        return s && s !== 'All' ? s : '';
    });
    const [role, setRole] = useState(() => readSrPref('', 'role', 'All'));
    const [topJobStatus, setTopJobStatus] = useState(() => {
        const saved = readSrPref('', 'topJobStatus', '');
        if (saved && TOP_JOB_STATUS_OPTIONS.some((x) => x.value === saved)) return saved;
        return 'Won';
    });

    const [summaryLoading, setSummaryLoading] = useState(false);
    const [topJobsLoading, setTopJobsLoading] = useState(false);
    const [pipelinePending, setPipelinePending] = useState({ totalValue: 0, count: 0 });
    const [tableExpanded, setTableExpanded] = useState(
        () => readSrPref('', 'tableExpanded', '') === '1'
    );
    const [topJobColumnFilters, setTopJobColumnFilters] = useState({});
    const [topJobValueFilter, setTopJobValueFilter] = useState(null);
    const [topJobValueFilterDraft, setTopJobValueFilterDraft] = useState({ mode: 'gt', v1: '', v2: '' });
    const [topJobGrossMarginFilter, setTopJobGrossMarginFilter] = useState(null);
    const [topJobGrossMarginFilterDraft, setTopJobGrossMarginFilterDraft] = useState({ mode: 'gt', v1: '', v2: '' });
    const [topJobColWidths, setTopJobColWidths] = useState(() => readTopJobColWidths());
    const topJobColWidthsRef = useRef(topJobColWidths);
    topJobColWidthsRef.current = topJobColWidths;
    const topJobColResizeRef = useRef({ key: null, startX: 0, startWidth: 0 });
    const [activeHeaderFilter, setActiveHeaderFilter] = useState(null);
    const [headerFilterSearch, setHeaderFilterSearch] = useState('');
    const [headerFilterDraft, setHeaderFilterDraft] = useState([]);
    const headerFilterBtnRefs = useRef({});
    const tableScrollWrapRef = useRef(null);
    const [filterPanelPos, setFilterPanelPos] = useState(null);
    const [summaryError, setSummaryError] = useState(null);
    const [reportData, setReportData] = useState(defaultReport);

    const [filterOptions, setFilterOptions] = useState({
        years: [],
        companies: [],
        divisions: [],
        roles: []
    });

    /**
     * Cascading filter options from GET /filters:
     * divisions scope to selected company; SE names to company + division (server-side).
     * Assigned-only SE (locked): fetch only `email`. CC-mail / Admin: pass company+division for cascading lists.
     */
    React.useEffect(() => {
        const loadFilters = async () => {
            try {
                const email = (currentUser?.EmailId || currentUser?.email || storedLoginEmail || '').trim();
                const params = new URLSearchParams();
                if (email) params.append('email', email);
                if (!filterLocks.company) {
                    if (company) params.append('company', company);
                    if (division) params.append('division', division);
                }

                const response = await fetch(`/api/sales-report/filters?${params.toString()}`);
                if (response.ok) {
                    const data = await response.json();
                    const companies = data.companies || [];
                    const divisions = data.divisions || [];
                    const roles = data.roles || [];
                    setFilterOptions((prev) => ({
                        ...prev,
                        years: data.years || [],
                        companies,
                        divisions,
                        roles
                    }));
                    setCompany((prev) => {
                        if (!companies.length) return prev;
                        if (prev && companies.includes(prev)) return prev;
                        return prev || companies[0];
                    });
                    setDivision((prev) => {
                        if (prev === 'All') return 'All';
                        if (!divisions.length) return prev;
                        if (prev && divisions.includes(prev)) return prev;
                        return 'All';
                    });
                }
            } catch (error) {
                console.error('Failed to fetch sales report filters', error);
            }
        };
        loadFilters();
    }, [company, division, filterLocks.company, currentUser, storedLoginEmail]);

    useEffect(() => {
        if (!userEmailNorm || prefsHydratedForEmail.current === userEmailNorm) return;
        prefsHydratedForEmail.current = userEmailNorm;

        const savedYear = readSrPref(userEmailNorm, 'year', '');
        if (savedYear) setYear(savedYear);

        const savedCompany = readSrPref(userEmailNorm, 'company', '');
        if (savedCompany && savedCompany !== 'All') setCompany(savedCompany);

        const savedDivision = readSrPref(userEmailNorm, 'division', '');
        if (savedDivision && savedDivision !== 'All') setDivision(savedDivision);

        const savedRole = readSrPref(userEmailNorm, 'role', '');
        if (savedRole) setRole(savedRole);

        const savedStatus = readSrPref(userEmailNorm, 'topJobStatus', '');
        if (savedStatus && TOP_JOB_STATUS_OPTIONS.some((x) => x.value === savedStatus)) {
            setTopJobStatus(savedStatus);
        }

        if (readSrPref(userEmailNorm, 'tableExpanded', '') === '1') setTableExpanded(true);
    }, [userEmailNorm]);

    useEffect(() => {
        writeSrPref(userEmailNorm, 'year', year);
        if (company) writeSrPref(userEmailNorm, 'company', company);
        if (division) writeSrPref(userEmailNorm, 'division', division);
        writeSrPref(userEmailNorm, 'role', role);
        writeSrPref(userEmailNorm, 'topJobStatus', topJobStatus);
        writeSrPref(userEmailNorm, 'tableExpanded', tableExpanded ? '1' : '0');
    }, [userEmailNorm, year, company, division, role, topJobStatus, tableExpanded]);

    useEffect(() => {
        const token = `${userEmailNorm}|${topJobStatus}`;
        if (tableFiltersHydratedKey.current === token) return;
        tableFiltersHydratedKey.current = token;
        setTableFiltersReady(false);
        const { columnFilters, valueFilter, grossMarginFilter } = readSrTableFilters(userEmailNorm, topJobStatus);
        setTopJobColumnFilters(columnFilters);
        setTopJobValueFilter(valueFilter);
        setTopJobGrossMarginFilter(grossMarginFilter);
        setActiveHeaderFilter(null);
        setTableFiltersReady(true);
    }, [userEmailNorm, topJobStatus]);

    useEffect(() => {
        if (!tableFiltersReady) return;
        writeSrTableFilters(
            userEmailNorm,
            topJobStatus,
            topJobColumnFilters,
            topJobValueFilter,
            topJobGrossMarginFilter
        );
    }, [
        tableFiltersReady,
        userEmailNorm,
        topJobStatus,
        topJobColumnFilters,
        topJobValueFilter,
        topJobGrossMarginFilter
    ]);

    useEffect(() => {
        if (filterLocks.role || !filterOptions.roles.length) return;
        if (role !== 'All' && !filterOptions.roles.includes(role)) {
            setRole('All');
        }
    }, [filterOptions.roles, role, filterLocks.role]);

    const fetchSummary = useCallback(async (signal) => {
        setSummaryLoading(true);
        setSummaryError(null);
        try {
            const params = new URLSearchParams();
            params.append('year', year);
            if (company) params.append('company', company);
            if (division) params.append('division', division);
            if (role && role !== 'All') params.append('role', role);
            const email = (currentUser?.EmailId || currentUser?.email || storedLoginEmail || '').trim();
            if (email) params.append('email', email);

            const res = await fetch(`/api/sales-report/summary?${params.toString()}`, { signal });
            if (res.ok) {
                const data = await res.json();
                const d = defaultReport();
                setReportData((prev) => ({
                    ...prev,
                    targetVsActual: data.targetVsActual || d.targetVsActual,
                    grossMarginTargetVsActual: data.grossMarginTargetVsActual || d.grossMarginTargetVsActual,
                    avgWonBookedGpPct:
                        data.avgWonBookedGpPct !== undefined && data.avgWonBookedGpPct !== null
                            ? Number(data.avgWonBookedGpPct)
                            : d.avgWonBookedGpPct,
                    winLoss: { ...d.winLoss, ...(data.winLoss || {}) },
                    probabilityFunnel: data.probabilityFunnel || []
                }));
            } else {
                setSummaryError('Could not load sales report.');
                setReportData((prev) => ({
                    ...defaultReport(),
                    topJobBooked: prev.topJobBooked || []
                }));
            }
        } catch (error) {
            if (error?.name === 'AbortError') return;
            console.error('Failed to fetch report summary', error);
            setSummaryError('Could not load sales report.');
            setReportData((prev) => ({
                ...defaultReport(),
                topJobBooked: prev.topJobBooked || []
            }));
        } finally {
            if (!signal.aborted) setSummaryLoading(false);
        }
    }, [year, company, division, role, filterLocks.company, currentUser, storedLoginEmail]);

    /** Heavy Pending/10% pipeline bucket — does not block chart loading. */
    const fetchPipelinePending = useCallback(async (signal) => {
        setPipelinePending({ totalValue: 0, count: 0 });
        try {
            const params = new URLSearchParams();
            params.append('year', year);
            if (company) params.append('company', company);
            if (division) params.append('division', division);
            if (role && role !== 'All') params.append('role', role);
            const email = (currentUser?.EmailId || currentUser?.email || storedLoginEmail || '').trim();
            if (email) params.append('email', email);

            const res = await fetch(`/api/sales-report/pipeline-pending?${params.toString()}`, { signal });
            if (!res.ok || signal.aborted) return;
            const data = await res.json();
            if (signal.aborted) return;
            setPipelinePending({
                totalValue: Number(data.totalValue) || 0,
                count: Number(data.count) || 0
            });
        } catch (e) {
            if (e?.name === 'AbortError') return;
            console.error('Failed to fetch pipeline pending', e);
        }
    }, [year, company, division, role, filterLocks.company, currentUser, storedLoginEmail]);

    const fetchTopJobBooked = useCallback(async (signal) => {
        setTopJobsLoading(true);
        try {
            const params = new URLSearchParams();
            params.append('year', year);
            if (company) params.append('company', company);
            if (division) params.append('division', division);
            if (role && role !== 'All') params.append('role', role);
            params.append('topJobStatus', topJobStatus);
            const email = (currentUser?.EmailId || currentUser?.email || storedLoginEmail || '').trim();
            if (email) params.append('email', email);

            const res = await fetch(`/api/sales-report/top-job-booked?${params.toString()}`, { signal });
            if (res.ok) {
                const data = await res.json();
                setReportData((prev) => ({
                    ...prev,
                    topJobBooked: data.topJobBooked || []
                }));
            }
        } catch (e) {
            if (e?.name === 'AbortError') return;
            console.error('Failed to fetch top jobs', e);
        } finally {
            if (!signal.aborted) setTopJobsLoading(false);
        }
    }, [year, company, division, role, topJobStatus, filterLocks.company, currentUser, storedLoginEmail]);

    useEffect(() => {
        if (!year) return;
        if (!filterLocks.company && !company) return;
        const ac = new AbortController();
        fetchSummary(ac.signal);
        return () => ac.abort();
    }, [fetchSummary]);

    useEffect(() => {
        if (!year) return;
        if (!filterLocks.company && !company) return;
        const ac = new AbortController();
        fetchPipelinePending(ac.signal);
        return () => ac.abort();
    }, [fetchPipelinePending]);

    useEffect(() => {
        if (!year) return;
        if (!filterLocks.company && !company) return;
        const ac = new AbortController();
        fetchTopJobBooked(ac.signal);
        return () => ac.abort();
    }, [fetchTopJobBooked]);

    useEffect(() => {
        const email = (currentUser?.EmailId || currentUser?.email || storedLoginEmail || '').trim();
        if (email) {
            fetch(`/api/sales-report/user-access-details?email=${encodeURIComponent(email)}`)
                .then(res => {
                    if (!res.ok) throw new Error('Network response was not ok');
                    return res.json();
                })
                .then(data => {
                    const shouldLockCompanyDivision = !!data.lockCompanyDivisionRole;
                    const shouldLockRole =
                        data.lockRole !== undefined ? !!data.lockRole : shouldLockCompanyDivision;
                    setFilterLocks({
                        company: shouldLockCompanyDivision,
                        division: shouldLockCompanyDivision,
                        role: shouldLockRole
                    });
                    if (shouldLockCompanyDivision) {
                        if (data.company) setCompany(data.company);
                        if (data.division) setDivision(data.division);
                        if (data.role) setRole(data.role);
                        setFilterOptions(prev => ({
                            ...prev,
                            companies: data.company ? [data.company] : prev.companies,
                            divisions: data.division ? [data.division] : prev.divisions,
                            roles: data.role ? [data.role] : prev.roles
                        }));
                    } else if (data.scopedCcFilters) {
                        const savedRole = readSrPref(email, 'role', 'All');
                        if (savedRole && savedRole !== 'All') {
                            setRole(savedRole);
                        }
                    }
                })
                .catch(err => {
                    console.error('Failed to fetch user access details', err);
                    setFilterLocks({ company: false, division: false, role: false });
                });
        }
    }, [currentUser, storedLoginEmail]);

    const handleCompanyChange = (e) => {
        const val = e.target.value;
        setCompany(val);
        setDivision('All');
        setRole('All');
    };

    const handleDivisionChange = (e) => {
        const val = e.target.value;
        setDivision(val);
        setRole('All');
    };

    /** Full-precision string for hover/tooltips. */
    const formatFullNumber = (num) => formatExactAmountString(num);

    /** In-page amounts: suffix k or M at 50% of digit size (see `.sr-money-thousands__k` / `__M`). */
    const formatK = (num) => {
        const n = Number(num);
        if (Number.isNaN(n)) {
            return (
                <span className="sr-money-thousands" title={formatExactAmountString(0)}>
                    0.00
                </span>
            );
        }
        const s = formatSalesAmountString(n);
        if (!s.endsWith('k') && !s.endsWith('M')) {
            return (
                <span className="sr-money-thousands" title={formatExactAmountString(n)}>
                    {s}
                </span>
            );
        }
        const isM = s.endsWith('M');
        const digits = s.slice(0, -1);
        return (
            <span className="sr-money-thousands" title={formatExactAmountString(n)}>
                {digits}
                <span className={isM ? 'sr-money-thousands__M' : 'sr-money-thousands__k'}>{isM ? 'M' : 'k'}</span>
            </span>
        );
    };

    /** Funnel summary: keep exact values for small numbers; k/M for larger values. */
    const formatFunnelSummaryValue = (num) => {
        const n = Number(num);
        if (Number.isNaN(n)) return formatK(0);
        if (Math.abs(n) < 1000) return formatExactAmountString(n);
        return formatK(n);
    };

    const formatShort = (num) => formatSalesAmountString(num);

    const formatGpTargetPct = (n) => {
        const x = Number(n);
        if (Number.isNaN(x)) return '0%';
        return `${Math.round(x)}%`;
    };

    const formatGpTargetPctDisplay = (n) => {
        const x = Number(n);
        const r = Number.isNaN(x) ? 0 : Math.round(x);
        return (
            <>
                {r}
                <span className="sr-pct-sym">%</span>
            </>
        );
    };

    /** WonGrossProfit / GrossMargin is GP %; JobValue is full units — GP amount = JobValue × GP% / 100. */
    const formatJobBookedGrossMargin = (row) => {
        const jv = Number(row.JobValue) || 0;
        const gpPct = parseRowGrossMarginPct(row);
        if (gpPct == null) return '—';
        const gpVal = jv * (gpPct / 100);
        const pctRounded = Math.round(gpPct);
        return (
            <>
                {formatK(gpVal)} {pctRounded}
                <span className="sr-pct-sym">%</span>
            </>
        );
    };

    const targetVsActualData = reportData.targetVsActual || [];
    const totalActual = targetVsActualData.reduce((acc, curr) => acc + (Number(curr.actual) || 0), 0);
    const totalTarget = targetVsActualData.reduce((acc, curr) => acc + (Number(curr.target) || 0), 0);
    const overallRatio = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : 0;

    const grossMarginData = reportData.grossMarginTargetVsActual || defaultReport().grossMarginTargetVsActual;
    const gmTotalActual = grossMarginData.reduce((acc, curr) => acc + (Number(curr.actual) || 0), 0);
    const gmTotalTarget = grossMarginData.reduce((acc, curr) => acc + (Number(curr.target) || 0), 0);
    const gmTotalSalesTargetBase = grossMarginData.reduce((acc, curr) => acc + (Number(curr.targetSalesBase) || 0), 0);
    const gmOverallTargetGpPct = gmTotalSalesTargetBase > 0 ? (gmTotalTarget / gmTotalSalesTargetBase) * 100 : 0;
    const gmOverallRatio = gmTotalTarget > 0 ? Math.round((gmTotalActual / gmTotalTarget) * 100) : 0;
    /** Actual GP% in GM summary: mean of each won job's booked GrossMargin% when API provides it; else blended GP/booking. */
    const blendedActualGpPct = totalActual > 0 ? (gmTotalActual / totalActual) * 100 : 0;
    const apiAvgGp = reportData.avgWonBookedGpPct;
    const gmOverallActualGpPct =
        apiAvgGp != null && Number.isFinite(Number(apiAvgGp)) ? Number(apiAvgGp) : blendedActualGpPct;

    const wl = reportData.winLoss || defaultReport().winLoss;
    /** Winning/Losing % = Won/Lost value over Quoted value (floor — no round-up). */
    const quotedDenom = Number(wl.quotedValue) || 0;
    const winNumerator = Number(wl.wonValue) || 0;
    const lossNumerator = Number(wl.lostValue) || 0;
    const winningRate =
        quotedDenom > 0 ? Math.floor((winNumerator / quotedDenom) * 100) : 0;
    const losingRate =
        quotedDenom > 0 ? Math.floor((lossNumerator / quotedDenom) * 100) : 0;

    /** Donut: Won / Lost / Follow up only (Quoted stays in KPI row, not in chart). */
    const pieSlices = useMemo(() => {
        const rows = [
            { name: 'Won', value: Number(wl.wonValue) || 0 },
            { name: 'Lost', value: Number(wl.lostValue) || 0 },
            { name: 'Follow up', value: Number(wl.followUpValue) || 0 }
        ];
        return rows.filter((r) => r.value > 0);
    }, [wl]);

    const funnelData = useMemo(() => {
        const rows = [...(reportData.probabilityFunnel || [])];
        const pendingVal = Number(pipelinePending.totalValue) || 0;
        const pendingCnt = Number(pipelinePending.count) || 0;
        if (pendingVal > 0 || pendingCnt > 0) {
            const tenIdx = rows.findIndex((r) => Number(r.ProbabilityPercentage) === 10);
            if (tenIdx >= 0) {
                const cur = rows[tenIdx];
                rows[tenIdx] = {
                    ...cur,
                    TotalValue: (Number(cur.TotalValue) || 0) + pendingVal,
                    Count: (Number(cur.Count) || 0) + pendingCnt,
                    GrossMarginValue: cur.GrossMarginValue == null ? 0 : cur.GrossMarginValue,
                    GrossMarginPct: cur.GrossMarginPct == null ? 0 : cur.GrossMarginPct,
                    ProbabilityName:
                        !cur.ProbabilityName || String(cur.ProbabilityName).trim() === ''
                            ? 'Quoted'
                            : cur.ProbabilityName
                };
            } else {
                rows.push({
                    ProbabilityName: 'Quoted',
                    ProbabilityPercentage: 10,
                    TotalValue: pendingVal,
                    GrossMarginValue: 0,
                    GrossMarginPct: 0,
                    Count: pendingCnt
                });
            }
        }
        return FUNNEL_STAGES.map((stage) => {
            const matched = rows.filter((item) => probabilityFunnelRowMatchesStage(item, stage));
            const value = matched.reduce((sum, item) => sum + (Number(item.TotalValue) || 0), 0);
            const grossMarginValue = matched.reduce(
                (sum, item) => sum + (Number(item.GrossMarginValue) || 0),
                0
            );
            const gmPctWeighted = matched.reduce((acc, item) => {
                const tv = Number(item.TotalValue) || 0;
                const pct = Number(item.GrossMarginPct);
                if (!(tv > 0) || !Number.isFinite(pct)) return acc;
                return { sum: acc.sum + tv * pct, w: acc.w + tv };
            }, { sum: 0, w: 0 });
            const grossMarginPct =
                gmPctWeighted.w > 0
                    ? gmPctWeighted.sum / gmPctWeighted.w
                    : matched.reduce((sum, item) => sum + (Number(item.GrossMarginPct) || 0), 0) /
                      (matched.length || 1);
            return {
                value,
                grossMarginValue,
                grossMarginPct: Number.isFinite(grossMarginPct) ? grossMarginPct : 0,
                name: `${stage.name} (${stage.pctLabel || `${stage.probability}%`})`,
                fill: stage.color
            };
        });
    }, [reportData.probabilityFunnel, pipelinePending]);

    const formatFunnelGrossMarginParts = useCallback((row) => {
        const gmVal = Number(row?.grossMarginValue) || 0;
        const gmPct = Number(row?.grossMarginPct);
        const pctRounded = Number.isFinite(gmPct) ? Math.round(gmPct) : 0;
        const detail = `${formatSalesAmountString(gmVal)} ${pctRounded}%`;
        return {
            prefix: 'GP:',
            detail,
            full: `GP: ${detail}`
        };
    }, []);

    const topRows = useMemo(
        () => sortTopJobRowsWithEnquiryGroups(reportData.topJobBooked || [], topJobStatus),
        [reportData.topJobBooked, topJobStatus]
    );

    const getTopJobMetricFilterValue = (row) => {
        if (topJobStatus === 'Quoted') return String(row.QuoteRef || '—');
        if (topJobStatus === 'Won') return String(Math.round(Number(row.WonGrossProfit) || 0));
        if (topJobStatus === 'Lost') return String(row.LostToWhom || row.CustomerName || '—');
        if (topJobStatus === 'Follow Up') return String(row.ProbabilityChance || '—');
        return String(row.Status || '—');
    };

    const getTopJobFilterValue = (row, key) => {
        const fmt = (v) => {
            if (!v) return '—';
            const d = new Date(v);
            if (Number.isNaN(d.getTime())) return '—';
            const day = String(d.getDate()).padStart(2, '0');
            const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const mon = MONTHS[d.getMonth()] || '';
            const yy = String(d.getFullYear()).slice(-2);
            return `${day}-${mon}-${yy}`;
        };
        if (key === 'requestNo') return String(row.RequestNo || row.EnquiryNo || '—');
        if (key === 'projectName') return String(row.ProjectName || '—');
        if (key === 'customerName') return String(row.CustomerName || '—');
        if (key === 'jobValue') return String(Number(row.JobValue) || 0);
        if (key === 'metric') return getTopJobMetricFilterValue(row);
        if (key === 'quoteDate') {
            if (!row.QuoteDate) return '—';
            const d = new Date(row.QuoteDate);
            if (Number.isNaN(d.getTime())) return '—';
            const day = String(d.getDate()).padStart(2, '0');
            const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const mon = MONTHS[d.getMonth()] || '';
            const yy = String(d.getFullYear()).slice(-2);
            return `${day}-${mon}-${yy}`;
        }
        if (key === 'bookedDate') return fmt(row.BookedDate);
        if (key === 'lostDate') return fmt(row.LostDate);
        if (key === 'expectedDate') return fmt(row.ExpectedDate);
        if (key === 'leadJob') return String(row.LeadJob || '—');
        if (key === 'quoteRef') return String(row.QuoteRef || '—');
        if (key === 'clientName') return String(row.ClientName || '—');
        if (key === 'consultantName') return String(row.ConsultantName || '—');
        if (key === 'quoteType') return String(row.QuoteType || '—').trim() || '—';
        if (key === 'concernSe') return String(row.ConcernSEEEQS || '—');
        if (key === 'extra') return String(row.ReasonForLost || row.FollowUpRemarks || '—');
        return '';
    };

    const filterableTopJobColumns = useMemo(() => {
        const cols = [
            { key: 'requestNo', label: 'Enquiry No.' },
            { key: 'projectName', label: 'Project Name' },
            { key: 'customerName', label: 'Customer Name' },
            { key: 'metric', label: topJobStatus === 'Quoted' ? 'Quote Ref' : 'Metric' },
            { key: 'clientName', label: 'Client Name' },
            { key: 'consultantName', label: 'Consultant Name' },
            { key: 'concernSe', label: 'Concern SE/EE/TE/QS' }
        ];
        if (topJobStatus === 'Won') cols.splice(4, 0, { key: 'bookedDate', label: 'Booked Date' });
        if (topJobStatus === 'Lost') cols.splice(4, 0, { key: 'lostDate', label: 'Lost Date' });
        if (topJobStatus === 'Follow Up') cols.splice(4, 0, { key: 'expectedDate', label: 'Expected Date' });
        if (topJobStatus === 'Pending') {
            const metricIdx = cols.findIndex((c) => c.key === 'metric');
            cols.splice(metricIdx, 0, { key: 'quoteRef', label: 'Quote Ref' }, { key: 'quoteDate', label: 'Quote Date' });
        }
        if (topJobStatus === 'Quoted') {
            cols.splice(4, 0, { key: 'quoteDate', label: 'Quote Date' }, { key: 'leadJob', label: 'Lead Job Name' });
        }
        if (TOP_JOB_PROB_QUOTE_REF_DATE_STATUSES.has(topJobStatus)) {
            const clientIdx = cols.findIndex((c) => c.key === 'clientName');
            cols.splice(clientIdx, 0, { key: 'quoteRef', label: 'Quote Ref' }, { key: 'quoteDate', label: 'Quote Date' });
        }
        if (TOP_JOB_QUOTE_TYPE_STATUSES.has(topJobStatus)) {
            const concernIdx = cols.findIndex((c) => c.key === 'concernSe');
            cols.splice(concernIdx, 0, { key: 'quoteType', label: 'Quote Type' });
        }
        if ((TOP_JOB_TABLE_CONFIG[topJobStatus] || TOP_JOB_TABLE_CONFIG.Won)?.extraHeader) {
            cols.push({ key: 'extra', label: 'Extra' });
        }
        return cols;
    }, [topJobStatus]);

    const topJobFilterOptions = useMemo(() => {
        const out = {};
        filterableTopJobColumns.forEach((c) => {
            out[c.key] = Array.from(new Set(topRows.map((r) => getTopJobFilterValue(r, c.key)))).sort((a, b) =>
                a.localeCompare(b, undefined, { sensitivity: 'base' })
            );
        });
        return out;
    }, [topRows, filterableTopJobColumns]);

    const topRowsFiltered = useMemo(() => {
        return topRows.filter((row) => {
            const columnOk = filterableTopJobColumns.every((col) => {
                const selected = topJobColumnFilters[col.key];
                if (selected === undefined) return true;
                const value = getTopJobFilterValue(row, col.key);
                return selected.includes(value);
            });
            if (!columnOk) return false;
            if (!passesNumericCompareFilter(row.JobValue, topJobValueFilter)) return false;
            if (topJobGrossMarginFilter) {
                const gmPct = parseRowGrossMarginPct(row);
                // Active GM filter: rows without a Gross Margin value are excluded
                if (gmPct == null) return false;
                if (!passesNumericCompareFilter(gmPct, topJobGrossMarginFilter)) return false;
            }
            return true;
        });
    }, [
        topRows,
        topJobColumnFilters,
        filterableTopJobColumns,
        topJobValueFilter,
        topJobGrossMarginFilter
    ]);

    const topJobEnquiryGroupMeta = useMemo(
        () => buildTopJobEnquiryGroupMeta(topRowsFiltered),
        [topRowsFiltered]
    );
    const topJobEnquiryMaxValueByKey = useMemo(() => {
        const maxBy = new Map();
        topRowsFiltered.forEach((row) => {
            const k = topJobEnquiryKey(row);
            if (!k) return;
            const val = Math.abs(Number(row.JobValue)) || 0;
            maxBy.set(k, Math.max(maxBy.get(k) ?? 0, val));
        });
        return maxBy;
    }, [topRowsFiltered]);

    useEffect(() => {
        const onDocDown = (e) => {
            if (e.target.closest('.sr-th-filter-popover')) return;
            if (e.target.closest('.sr-th-filter-btn')) return;
            setActiveHeaderFilter(null);
        };
        document.addEventListener('mousedown', onDocDown);
        return () => document.removeEventListener('mousedown', onDocDown);
    }, []);

    const updateFilterPanelPosition = useCallback(() => {
        if (!activeHeaderFilter) {
            setFilterPanelPos(null);
            return;
        }
        const el = headerFilterBtnRefs.current[activeHeaderFilter];
        if (!el) {
            setFilterPanelPos(null);
            return;
        }
        const rect = el.getBoundingClientRect();
        const isValue = activeHeaderFilter === 'jobValue' || activeHeaderFilter === 'grossMargin';
        const baseMinW = isValue ? 190 : 220;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let left = rect.left;
        left = Math.max(8, Math.min(left, vw - baseMinW - 8));
        const top = rect.bottom + 4;
        const capMax = isValue ? 360 : 320;
        const maxH = Math.min(capMax, Math.max(120, vh - top - 16));
        setFilterPanelPos({
            top,
            left,
            minWidth: Math.max(baseMinW, rect.width),
            maxHeight: maxH,
        });
    }, [activeHeaderFilter]);

    useLayoutEffect(() => {
        updateFilterPanelPosition();
    }, [updateFilterPanelPosition]);

    useEffect(() => {
        if (!activeHeaderFilter) return undefined;
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
    }, [activeHeaderFilter, updateFilterPanelPosition]);

    const getTopJobColStyle = useCallback(
        (key) => {
            const w = Number(topJobColWidths[key] ?? DEFAULT_TOP_JOB_COL_WIDTHS[key]);
            if (!Number.isFinite(w) || w <= 0) return undefined;
            return { width: w, minWidth: w, maxWidth: w };
        },
        [topJobColWidths]
    );

    const onTopJobColResizeMove = useCallback((e) => {
        const r = topJobColResizeRef.current;
        if (!r.key) return;
        const next = Math.max(60, Math.round(r.startWidth + (e.pageX - r.startX)));
        setTopJobColWidths((prev) => ({ ...prev, [r.key]: next }));
    }, []);

    const onTopJobColResizeEnd = useCallback(() => {
        topJobColResizeRef.current = { key: null, startX: 0, startWidth: 0 };
        document.removeEventListener('mousemove', onTopJobColResizeMove);
        document.removeEventListener('mouseup', onTopJobColResizeEnd);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        writeTopJobColWidths(topJobColWidthsRef.current);
    }, [onTopJobColResizeMove]);

    const startTopJobColResize = useCallback(
        (e, key) => {
            e.preventDefault();
            e.stopPropagation();
            const startWidth =
                Number(topJobColWidthsRef.current[key] ?? DEFAULT_TOP_JOB_COL_WIDTHS[key]) || 100;
            topJobColResizeRef.current = { key, startX: e.pageX, startWidth };
            document.addEventListener('mousemove', onTopJobColResizeMove);
            document.addEventListener('mouseup', onTopJobColResizeEnd);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        },
        [onTopJobColResizeMove, onTopJobColResizeEnd]
    );

    useEffect(() => {
        return () => {
            document.removeEventListener('mousemove', onTopJobColResizeMove);
            document.removeEventListener('mouseup', onTopJobColResizeEnd);
        };
    }, [onTopJobColResizeMove, onTopJobColResizeEnd]);

    const openHeaderFilter = (key) => {
        if (key === 'jobValue') {
            setHeaderFilterSearch('');
            setTopJobValueFilterDraft(
                topJobValueFilter
                    ? { ...topJobValueFilter }
                    : { mode: 'gt', v1: '', v2: '' }
            );
            setActiveHeaderFilter((prev) => (prev === key ? null : key));
            return;
        }
        if (key === 'grossMargin') {
            setHeaderFilterSearch('');
            setTopJobGrossMarginFilterDraft(
                topJobGrossMarginFilter
                    ? { ...topJobGrossMarginFilter }
                    : { mode: 'gt', v1: '', v2: '' }
            );
            setActiveHeaderFilter((prev) => (prev === key ? null : key));
            return;
        }
        const options = topJobFilterOptions[key] || [];
        const applied = topJobColumnFilters[key];
        setHeaderFilterDraft(Array.isArray(applied) ? [...applied] : [...options]);
        setHeaderFilterSearch('');
        setActiveHeaderFilter((prev) => (prev === key ? null : key));
    };

    const topJobValueMax = useMemo(() => {
        const vals = topRowsFiltered.map((r) => Math.abs(Number(r.JobValue)) || 0);
        return vals.length ? Math.max(...vals) : 0;
    }, [topRowsFiltered]);
    const topRowsFilteredTotalValue = useMemo(
        () => topRowsFiltered.reduce((acc, row) => acc + (Number(row.JobValue) || 0), 0),
        [topRowsFiltered]
    );
    const topRowsFilteredQuotedMaxPerEnquiryTotal = useMemo(() => {
        const maxByEnquiry = new Map();
        topRowsFiltered.forEach((row) => {
            const enquiryNo = String(row.RequestNo || row.EnquiryNo || '').trim();
            if (!enquiryNo) return;
            const value = Number(row.JobValue) || 0;
            const currentMax = maxByEnquiry.get(enquiryNo);
            if (currentMax === undefined || value > currentMax) {
                maxByEnquiry.set(enquiryNo, value);
            }
        });
        let total = 0;
        maxByEnquiry.forEach((v) => {
            total += Number(v) || 0;
        });
        return total;
    }, [topRowsFiltered]);
    /** Unique enquiries in the filtered table (multiple quote lines per enquiry count once). */
    const topRowsFilteredDistinctProjectCount = useMemo(() => {
        const keys = new Set();
        topRowsFiltered.forEach((row, idx) => {
            const no = String(row.RequestNo ?? row.EnquiryNo ?? '').trim();
            if (no) keys.add(`e:${no}`);
            else {
                const pn = String(row.ProjectName ?? '').trim();
                keys.add(pn ? `p:${pn.toLowerCase()}` : `row:${idx}`);
            }
        });
        return keys.size;
    }, [topRowsFiltered]);
    /** Same basis as the blue “Total” row in the value column — bar length + % prefix use this (not max single job). */
    const topJobChartDenominator = useMemo(() => {
        const raw = TOP_JOB_MAX_PER_ENQUIRY_VALUE_STATUSES.has(topJobStatus)
            ? topRowsFilteredQuotedMaxPerEnquiryTotal
            : topRowsFilteredTotalValue;
        const n = Math.abs(Number(raw)) || 0;
        return Number.isFinite(n) ? n : 0;
    }, [topJobStatus, topRowsFilteredQuotedMaxPerEnquiryTotal, topRowsFilteredTotalValue]);
    const topRowsFilteredWonGpTotal = useMemo(
        () =>
            topRowsFiltered.reduce((acc, row) => {
                const jv = Number(row.JobValue) || 0;
                const gpPct = parseRowGrossMarginPct(row);
                if (gpPct == null) return acc;
                return acc + (jv * gpPct) / 100;
            }, 0),
        [topRowsFiltered]
    );
    const topRowsFilteredWonAvgGpPct = useMemo(() => {
        const gpRows = topRowsFiltered
            .map((row) => parseRowGrossMarginPct(row))
            .filter((v) => v != null);
        if (!gpRows.length) return 0;
        const sum = gpRows.reduce((acc, v) => acc + v, 0);
        return Math.round(sum / gpRows.length);
    }, [topRowsFiltered]);
    const hasAnyTopJobFilters = useMemo(
        () =>
            Object.keys(topJobColumnFilters).length > 0 ||
            !!topJobValueFilter ||
            !!topJobGrossMarginFilter,
        [topJobColumnFilters, topJobValueFilter, topJobGrossMarginFilter]
    );

    const topJobsHeadingWord = useMemo(() => {
        const o = TOP_JOB_STATUS_OPTIONS.find((x) => x.value === topJobStatus);
        return o ? o.label : 'Won';
    }, [topJobStatus]);

    const topJobsTableConfig = useMemo(() => {
        return TOP_JOB_TABLE_CONFIG[topJobStatus] || TOP_JOB_TABLE_CONFIG.Won;
    }, [topJobStatus]);

    const formatDateShort = (v) => {
        if (!v) return '—';
        const d = new Date(v);
        if (Number.isNaN(d.getTime())) return '—';
        const day = String(d.getDate()).padStart(2, '0');
        const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const mon = MONTHS[d.getMonth()] || '';
        const yy = String(d.getFullYear()).slice(-2);
        return `${day}-${mon}-${yy}`;
    };

    const renderTopJobsMetricCell = (row) => {
        if (topJobStatus === 'Won') {
            return formatJobBookedGrossMargin(row);
        }
        if (topJobStatus === 'Lost') {
            return row.LostToWhom || row.CustomerName || '—';
        }
        if (topJobStatus === 'Follow Up') {
            return row.ProbabilityChance || '—';
        }
        if (topJobStatus === 'Pending') {
            const st = String(row.Status || '').trim().toLowerCase();
            if (st === 'pending') return 'Pending to update Probability';
            return row.Status || topJobsHeadingWord || '—';
        }
        return row.Status || topJobsHeadingWord;
    };

    const capturePrintLayout = useCallback((printArea) => {
        const pick = (selector) => {
            const el = printArea.querySelector(selector);
            const rect = el?.getBoundingClientRect();
            if (!rect || rect.height < 4) return null;
            return Math.round(rect.height);
        };
        const pickW = (selector) => {
            const el = printArea.querySelector(selector);
            const rect = el?.getBoundingClientRect();
            if (!rect || rect.width < 4) return null;
            return Math.round(rect.width);
        };
        const areaRect = printArea.getBoundingClientRect();
        const gridRect = printArea.querySelector('.sr-dashboard-grid')?.getBoundingClientRect();
        return {
            areaW: Math.round(areaRect.width),
            areaH: Math.round(areaRect.height),
            gridW: gridRect ? Math.round(gridRect.width) : Math.round(areaRect.width),
            gridH: gridRect ? Math.round(gridRect.height) : null,
            tableCellH: pick('.sr-cell-table'),
            tableInnerH: pick('.sr-table-inner'),
            pipelineCellH: pick('.sr-cell-pipeline'),
            pipelineCellW: pickW('.sr-cell-pipeline'),
            pipelineSummaryH: pick('.sr-pipeline-summary'),
            pieH: pick('.sr-chart-pie'),
            pieStackH: pick('.sr-won-chart-stack'),
            jbBarH: pick('.sr-jb-chart-stack .sr-chart-bar'),
            gmBarH: pick('.sr-gm-chart-stack .sr-chart-bar'),
            jbStackH: pick('.sr-jb-chart-stack'),
            gmStackH: pick('.sr-gm-chart-stack'),
            funnelH: pick('.sr-funnel-svg-wrap'),
            funnelW: pickW('.sr-funnel-svg-wrap'),
        };
    }, []);

    const applyPrintLayoutVars = useCallback((printArea, snapshot) => {
        const setPx = (name, value) => {
            if (value != null && value > 0) printArea.style.setProperty(name, `${value}px`);
        };
        setPx('--sr-print-area-w', snapshot.areaW);
        setPx('--sr-print-area-h', snapshot.areaH);
        setPx('--sr-print-grid-w', snapshot.gridW);
        setPx('--sr-print-grid-h', snapshot.gridH);
        setPx('--sr-print-table-cell-h', snapshot.tableCellH);
        setPx('--sr-print-table-inner-h', snapshot.tableInnerH);
        setPx('--sr-print-pipeline-cell-h', snapshot.pipelineCellH);
        setPx('--sr-print-pipeline-cell-w', snapshot.pipelineCellW);
        setPx('--sr-print-pipeline-summary-h', snapshot.pipelineSummaryH);
        setPx('--sr-print-pie-h', snapshot.pieH);
        setPx('--sr-print-pie-stack-h', snapshot.pieStackH);
        setPx('--sr-print-jb-bar-h', snapshot.jbBarH);
        setPx('--sr-print-gm-bar-h', snapshot.gmBarH);
        setPx('--sr-print-jb-stack-h', snapshot.jbStackH);
        setPx('--sr-print-gm-stack-h', snapshot.gmStackH);
        setPx('--sr-print-funnel-h', snapshot.funnelH);
        setPx('--sr-print-funnel-w', snapshot.funnelW);

        const mmToPx = 96 / 25.4;
        const pageW = (SR_PRINT_PAGE_MM.width - SR_PRINT_PAGE_MM.margin * 2) * mmToPx;
        const pageH = (SR_PRINT_PAGE_MM.height - SR_PRINT_PAGE_MM.margin * 2) * mmToPx;
        const scale = Math.min(1, pageW / snapshot.areaW, pageH / snapshot.areaH) * SR_PRINT_SCALE_INSET;
        printArea.style.setProperty('--sr-print-scale', String(Number(scale.toFixed(4))));
    }, []);

    const clearPrintLayoutVars = useCallback((printArea) => {
        if (!printArea) return;
        [
            '--sr-print-scale',
            '--sr-print-area-w',
            '--sr-print-area-h',
            '--sr-print-grid-w',
            '--sr-print-grid-h',
            '--sr-print-table-cell-h',
            '--sr-print-table-inner-h',
            '--sr-print-pipeline-cell-h',
            '--sr-print-pipeline-cell-w',
            '--sr-print-pipeline-summary-h',
            '--sr-print-pie-h',
            '--sr-print-pie-stack-h',
            '--sr-print-jb-bar-h',
            '--sr-print-gm-bar-h',
            '--sr-print-jb-stack-h',
            '--sr-print-gm-stack-h',
            '--sr-print-funnel-h',
            '--sr-print-funnel-w',
        ].forEach((name) => printArea.style.removeProperty(name));
        printArea.classList.remove('sr-print-fit');
    }, []);

    const handlePrint = () => {
        setActiveHeaderFilter(null);
        const printArea = document.querySelector('.sr-print-area');
        const page = document.querySelector('.sales-report-page');
        if (!printArea || !page) {
            window.print();
            return;
        }

        const snapshot = capturePrintLayout(printArea);
        applyPrintLayoutVars(printArea, snapshot);
        document.body.classList.add('sr-print-active');
        page.classList.add('printing');
        printArea.classList.add('sr-print-fit');

        requestAnimationFrame(() => {
            window.dispatchEvent(new Event('resize'));
            setTimeout(() => window.print(), 350);
        });
    };

    useEffect(() => {
        const handleAfterPrint = () => {
            const printArea = document.querySelector('.sr-print-area');
            const page = document.querySelector('.sales-report-page');
            page?.classList.remove('printing');
            document.body.classList.remove('sr-print-active');
            clearPrintLayoutVars(printArea);
        };
        window.addEventListener('afterprint', handleAfterPrint);
        return () => window.removeEventListener('afterprint', handleAfterPrint);
    }, []);

    const handleEmail = () => {
        const subject = 'Sales Report';
        const body = 'Please find the Sales Report attached. (Note: Please save the report as PDF using the Print option before attaching)';
        window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    };

    const handleDownloadJobsExcel = async () => {
        if (topJobsLoading) return;
        if (!topRowsFiltered.length) {
            window.alert('No data to export');
            return;
        }
        try {
            await downloadJobsTableXlsx({
                rows: topRowsFiltered,
                topJobStatus,
                tableConfig: topJobsTableConfig,
                headingLabel: topJobsHeadingWord,
                meta: { year, company, division, role }
            });
        } catch (err) {
            console.error('Jobs Excel export failed', err);
            window.alert(err?.message || 'Failed to export Excel workbook');
        }
    };

    const renderColumnFilterPopoverBody = (key) => {
        const options = topJobFilterOptions[key] || [];
        const searchQ = String(headerFilterSearch || '').trim().toLowerCase();
        const visible = options.filter((o) => String(o).toLowerCase().includes(searchQ));
        const isDateColumn = key.toLowerCase().includes('date');
        const monthOrder = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const parseShortDate = (s) => {
            const m = String(s || '').trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/);
            if (!m) return null;
            const mIdx = monthShort.findIndex((x) => x.toLowerCase() === m[2].toLowerCase());
            if (mIdx < 0) return null;
            const yy = Number(m[3]);
            const year = yy >= 70 ? 1900 + yy : 2000 + yy;
            return { year, monthName: monthOrder[mIdx], raw: String(s) };
        };
        const dateGroups = isDateColumn
            ? visible
                  .map(parseShortDate)
                  .filter(Boolean)
                  .reduce((acc, d) => {
                      if (!acc[d.year]) acc[d.year] = {};
                      if (!acc[d.year][d.monthName]) acc[d.year][d.monthName] = [];
                      acc[d.year][d.monthName].push(d.raw);
                      return acc;
                  }, {})
            : {};
        return (
            <>
                <input
                    className="sr-th-filter-search"
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
                <div className="sr-th-filter-actions">
                    <button type="button" onClick={() => setHeaderFilterDraft(visible)}>Select All</button>
                    <button type="button" onClick={() => setHeaderFilterDraft([])}>Unselect All</button>
                </div>
                {isDateColumn ? (
                    <div className="sr-th-filter-options">
                        {Object.keys(dateGroups)
                            .sort((a, b) => Number(b) - Number(a))
                            .map((y) => {
                                const yearValues = Object.values(dateGroups[y]).flat();
                                const yearChecked = yearValues.length > 0 && yearValues.every((v) => headerFilterDraft.includes(v));
                                return (
                                    <div key={y}>
                                        <label className="sr-th-filter-option">
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
                                                const monthChecked = monthValues.length > 0 && monthValues.every((v) => headerFilterDraft.includes(v));
                                                return (
                                                    <label key={`${y}-${mn}`} className="sr-th-filter-option sr-th-filter-option--month">
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
                                <label key={opt} className="sr-th-filter-option">
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
                    </div>
                ) : (
                    <div className="sr-th-filter-options">
                        {visible.map((opt) => (
                            <label key={opt} className="sr-th-filter-option">
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
                )}
                <div className="sr-th-filter-footer">
                    <button
                        type="button"
                        onClick={() => {
                            setTopJobColumnFilters((prev) => {
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
                        className="sr-th-filter-apply"
                        onClick={() => {
                            setTopJobColumnFilters((prev) => {
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
            </>
        );
    };

    const renderFilterableHeader = (key, label, className = '') => {
        const applied = topJobColumnFilters[key];
        const isFiltered = Array.isArray(applied);
        const clip = TOP_JOB_CLIP_COLS.has(key) ? 'sr-detail-table__clip' : '';
        return (
            <th
                className={`sr-filterable-th sr-resizable-th ${clip} ${className}`.trim()}
                style={getTopJobColStyle(key)}
            >
                <button
                    type="button"
                    className="sr-th-filter-btn"
                    ref={(el) => {
                        if (el) headerFilterBtnRefs.current[key] = el;
                    }}
                    onClick={() => openHeaderFilter(key)}
                >
                    <span>{label}</span>
                    <span className={`sr-th-filter-caret${isFiltered ? ' sr-th-filter-caret--active' : ''}`}>▼</span>
                </button>
                <span
                    className="sr-col-resize-handle"
                    title="Drag to resize column"
                    onMouseDown={(e) => startTopJobColResize(e, key)}
                />
            </th>
        );
    };

    const renderValueFilterHeader = (label) => {
        const isFiltered = !!topJobValueFilter;
        return (
            <th className="sr-filterable-th sr-resizable-th text-end" style={getTopJobColStyle('jobValue')}>
                <button
                    type="button"
                    className="sr-th-filter-btn"
                    ref={(el) => {
                        if (el) headerFilterBtnRefs.current.jobValue = el;
                    }}
                    onClick={() => openHeaderFilter('jobValue')}
                >
                    <span>{label}</span>
                    <span className={`sr-th-filter-caret${isFiltered ? ' sr-th-filter-caret--active' : ''}`}>▼</span>
                </button>
                <span
                    className="sr-col-resize-handle"
                    title="Drag to resize column"
                    onMouseDown={(e) => startTopJobColResize(e, 'jobValue')}
                />
            </th>
        );
    };

    const renderGrossMarginFilterHeader = () => {
        const isFiltered = !!topJobGrossMarginFilter;
        return (
            <th className="sr-filterable-th sr-resizable-th text-end text-nowrap" style={getTopJobColStyle('grossMargin')}>
                <button
                    type="button"
                    className="sr-th-filter-btn"
                    ref={(el) => {
                        if (el) headerFilterBtnRefs.current.grossMargin = el;
                    }}
                    onClick={() => openHeaderFilter('grossMargin')}
                    title="Filter by Gross Margin % from Probability"
                >
                    <span>Gross Margin</span>
                    <span className={`sr-th-filter-caret${isFiltered ? ' sr-th-filter-caret--active' : ''}`}>▼</span>
                </button>
                <span
                    className="sr-col-resize-handle"
                    title="Drag to resize column"
                    onMouseDown={(e) => startTopJobColResize(e, 'grossMargin')}
                />
            </th>
        );
    };

    const renderPlainHeader = (key, label, className = '', title) => (
        <th
            className={`sr-resizable-th ${className}`.trim()}
            style={getTopJobColStyle(key)}
            title={title}
        >
            {label}
            <span
                className="sr-col-resize-handle"
                title="Drag to resize column"
                onMouseDown={(e) => startTopJobColResize(e, key)}
            />
        </th>
    );

    const renderHeaderFilterPortal = () => {
        if (!activeHeaderFilter || !filterPanelPos) return null;
        const isJobValue = activeHeaderFilter === 'jobValue';
        const isGrossMargin = activeHeaderFilter === 'grossMargin';
        const isValue = isJobValue || isGrossMargin;
        const draft = isGrossMargin ? topJobGrossMarginFilterDraft : topJobValueFilterDraft;
        const setDraft = isGrossMargin ? setTopJobGrossMarginFilterDraft : setTopJobValueFilterDraft;
        const clearFilter = () => {
            if (isGrossMargin) setTopJobGrossMarginFilter(null);
            else setTopJobValueFilter(null);
            setActiveHeaderFilter(null);
        };
        const applyFilter = () => {
            const mode = String(draft.mode || 'gt');
            const v1 = String(draft.v1 ?? '').trim();
            const v2 = String(draft.v2 ?? '').trim();
            const n1 = Number(v1);
            const n2 = Number(v2);
            const valid =
                mode === 'between'
                    ? v1 !== '' && v2 !== '' && Number.isFinite(n1) && Number.isFinite(n2)
                    : v1 !== '' && Number.isFinite(n1);
            const next = valid ? { mode, v1, v2 } : null;
            if (isGrossMargin) {
                setTopJobGrossMarginFilter(next);
            } else {
                setTopJobValueFilter(next);
            }
            setActiveHeaderFilter(null);
        };
        return createPortal(
            <div
                className={`sr-th-filter-popover sr-th-filter-popover--portal${isValue ? ' sr-th-filter-popover--value' : ''}`}
                style={{
                    top: filterPanelPos.top,
                    left: filterPanelPos.left,
                    minWidth: filterPanelPos.minWidth,
                    maxHeight: filterPanelPos.maxHeight,
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
            >
                {isValue ? (
                    <>
                        <select
                            className="sr-th-value-op-select"
                            value={draft.mode}
                            onChange={(e) => setDraft((p) => ({ ...p, mode: e.target.value }))}
                        >
                            <option value="gt">Greater than</option>
                            <option value="lt">Less than</option>
                            <option value="eq">Equal</option>
                            <option value="between">Between</option>
                        </select>
                        <input
                            className="sr-th-filter-search"
                            type="number"
                            inputMode="decimal"
                            placeholder={isGrossMargin ? 'Gross Margin %' : 'Value'}
                            value={draft.v1}
                            onChange={(e) => setDraft((p) => ({ ...p, v1: e.target.value }))}
                        />
                        {draft.mode === 'between' ? (
                            <input
                                className="sr-th-filter-search"
                                type="number"
                                inputMode="decimal"
                                placeholder={isGrossMargin ? 'And Gross Margin %' : 'And value'}
                                value={draft.v2}
                                onChange={(e) => setDraft((p) => ({ ...p, v2: e.target.value }))}
                            />
                        ) : null}
                        <div className="sr-th-filter-footer">
                            <button type="button" onClick={clearFilter}>
                                Clear
                            </button>
                            <button
                                type="button"
                                className="sr-th-filter-apply"
                                onClick={applyFilter}
                            >
                                Apply
                            </button>
                        </div>
                    </>
                ) : (
                    renderColumnFilterPopoverBody(activeHeaderFilter)
                )}
            </div>,
            document.body
        );
    };

    const contentLoading = summaryLoading || topJobsLoading;

    return (
        <div
            className={`container-fluid sales-report-page sales-report-fit d-flex flex-column${tableExpanded ? ' sr-table-expanded' : ''}`}
            style={{
                width: '100vw',
                marginLeft: 'calc(50% - 50vw)',
                marginRight: 'calc(50% - 50vw)'
            }}
        >
            {summaryError && (
                <div className="alert alert-warning py-1 px-2 small mb-2 no-print">{summaryError}</div>
            )}

            <div className="sr-print-area flex-grow-1 min-h-0 d-flex flex-column">
            <div className="sr-filter-bar flex-shrink-0 mb-1">
                <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                    <div className="d-flex flex-wrap align-items-end sr-filter-groups">
                        <div className="sr-filter-field">
                            <label className="sr-filter-label">Year</label>
                            <select className="form-select form-select-sm" aria-label="Year" style={{ minWidth: 100 }} value={year} onChange={(e) => setYear(e.target.value)}>
                                {filterOptions.years.map((y) => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>
                        </div>
                        <div className="sr-filter-field">
                            <label className="sr-filter-label">Company Name</label>
                            <select
                                className="form-select form-select-sm"
                                aria-label="Company Name"
                                style={{ minWidth: 260 }}
                                value={company}
                                onChange={handleCompanyChange}
                                disabled={filterLocks.company || filterOptions.companies.length === 0}
                            >
                                {filterOptions.companies.map((c) => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>
                        <div className="sr-filter-field">
                            <label className="sr-filter-label">Division Name</label>
                            <select
                                className="form-select form-select-sm"
                                aria-label="Division Name"
                                style={{ minWidth: 160 }}
                                value={division || 'All'}
                                onChange={handleDivisionChange}
                                disabled={filterLocks.division || filterOptions.divisions.length === 0}
                            >
                                {!filterLocks.division && (
                                    <option value="All">All</option>
                                )}
                                {filterOptions.divisions.map((d) => (
                                    <option key={d} value={d}>{d}</option>
                                ))}
                            </select>
                        </div>
                        <div className="sr-filter-field">
                            <label className="sr-filter-label">SE / QS / EE / TE / SM</label>
                            <select className="form-select form-select-sm" aria-label="Role" style={{ minWidth: 180 }} value={role} onChange={(e) => setRole(e.target.value)} disabled={filterLocks.role}>
                                <option value="All">All</option>
                                {filterOptions.roles.map((r) => (
                                    <option key={r} value={r}>{r}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="d-flex align-items-center gap-2 flex-wrap">
                        <span className="text-muted small mb-0" style={{ fontSize: '0.7rem' }}>* All values in BHD</span>
                        <div className="d-flex gap-2 no-print">
                            <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary d-flex align-items-center justify-content-center"
                                style={{ width: 32, height: 32, padding: 0 }}
                                onClick={handlePrint}
                                title="Print / Save as PDF"
                                aria-label="Print / Save as PDF"
                            >
                                <Printer size={14} />
                            </button>
                            <button
                                type="button"
                                className="btn btn-sm btn-outline-primary d-flex align-items-center justify-content-center"
                                style={{ width: 32, height: 32, padding: 0 }}
                                onClick={handleEmail}
                                title="Email"
                                aria-label="Email"
                            >
                                <Mail size={14} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div
                className={`sr-content-shell flex-grow-1 min-h-0 d-flex flex-column${contentLoading ? ' sr-content-shell--loading' : ''}`}
                aria-busy={contentLoading}
            >
                {contentLoading ? (
                    <div className="sr-content-loading" aria-live="polite" aria-label="Loading sales report">
                        <span
                            className="spinner-border text-primary sr-content-loading__spinner"
                            role="status"
                            aria-hidden="true"
                        />
                        <span className="sr-content-loading__text">Loading report…</span>
                    </div>
                ) : null}
            <div className="sr-dashboard-grid flex-grow-1 min-h-0">
                    {/* 1 — Won / Lost: summary + pie chart in one card (row 1–2) */}
                    <section className="sr-cell sr-cell-won-combined sr-summary-panel sr-summary-compact sr-target-card card border-0 shadow-sm d-flex flex-column min-h-0">
                        <div className="sr-summary-title">Won / Lost</div>
                        <div className="sr-metric-stack d-flex flex-column flex-grow-1 min-h-0">
                        <div className="sr-stack-top d-flex flex-column min-h-0">
                        <div className="sr-summary-body sr-target-body sr-won-summary d-flex">
                            <div className="sr-won-rates d-flex flex-column justify-content-center align-items-center text-center">
                                <div className="sr-rate-block">
                                    <span className="sr-rate-label">
                                        Winning
                                        <br />
                                        rate
                                    </span>
                                    <span className="sr-rate-pct text-success"><span className="sr-rate-pct__val">{winningRate}</span><span className="sr-pct-sym">%</span></span>
                                </div>
                                <div className="sr-rate-block">
                                    <span className="sr-rate-label">
                                        Losing
                                        <br />
                                        rate
                                    </span>
                                    <span className="sr-rate-pct text-danger"><span className="sr-rate-pct__val">{losingRate}</span><span className="sr-pct-sym">%</span></span>
                                </div>
                            </div>
                            <div className="sr-won-values">
                                <div className="sr-kpi-line border-bottom py-0">
                                    <span className="text-muted sr-kpi-label">Won</span>
                                    <span className="sr-kpi-num text-success">{formatK(wl.wonValue)}</span>
                                </div>
                                <div className="sr-kpi-line border-bottom py-0">
                                    <span className="text-muted sr-kpi-label">Lost</span>
                                    <span className="sr-kpi-num text-danger">{formatK(wl.lostValue)}</span>
                                </div>
                                <div className="sr-kpi-line border-bottom py-0">
                                    <span className="text-muted sr-kpi-label">Follow up</span>
                                    <span className="sr-kpi-num" style={{ color: SR_ROYAL_BLUE }}>{formatK(wl.followUpValue)}</span>
                                </div>
                                <div className="sr-kpi-line py-0">
                                    <span className="text-muted sr-kpi-label">Quoted</span>
                                    <span className="sr-kpi-num sr-quoted-strong">{formatK(wl.quotedValue)}</span>
                                </div>
                            </div>
                        </div>
                        <hr className="sr-won-stack-divider" role="presentation" />
                        </div>
                        <div className="sr-won-chart-stack min-h-0 d-flex flex-column p-1">
                            <div className="sr-chart-pie sr-donut-chart flex-grow-1 min-h-0">
                                {pieSlices.length === 0 ? (
                                    <div className="text-muted small text-center py-3">No data</div>
                                ) : (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart margin={{ top: 4, right: 2, bottom: 28, left: 2 }}>
                                            <defs>
                                                {Object.values(SR_DONUT_GRADIENTS).map((g) => (
                                                    <linearGradient
                                                        key={g.id}
                                                        id={g.id}
                                                        x1="0"
                                                        y1="0"
                                                        x2="1"
                                                        y2="1"
                                                    >
                                                        <stop offset="0%" stopColor={g.hi} />
                                                        <stop offset="55%" stopColor={g.lo} />
                                                        <stop offset="100%" stopColor={g.lo} />
                                                    </linearGradient>
                                                ))}
                                            </defs>
                                            <Pie
                                                data={pieSlices}
                                                dataKey="value"
                                                nameKey="name"
                                                cx="50%"
                                                cy="50%"
                                                innerRadius="50%"
                                                outerRadius="84%"
                                                paddingAngle={pieSlices.length > 1 ? 2 : 0}
                                                cornerRadius={4}
                                                startAngle={90}
                                                endAngle={-270}
                                                isAnimationActive={false}
                                            >
                                                {pieSlices.map((entry, index) => {
                                                    const g = SR_DONUT_GRADIENTS[entry.name];
                                                    const fill = g
                                                        ? `url(#${g.id})`
                                                        : PIE_COLORS[entry.name] || SR_BLUE_LIGHT;
                                                    return (
                                                        <Cell
                                                            key={`cell-${index}`}
                                                            fill={fill}
                                                            stroke="none"
                                                            strokeWidth={0}
                                                        />
                                                    );
                                                })}
                                            </Pie>
                                            <Tooltip formatter={(v) => formatFullNumber(v)} />
                                            <Legend
                                                wrapperStyle={{ fontSize: 9, color: SR_CHART_LEGEND_GREY }}
                                                verticalAlign="bottom"
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                )}
                            </div>
                        </div>
                        </div>
                    </section>

                    {/* 2 — Job Booking Target vs Actual: summary + bar chart (rows 1–2) */}
                    <section
                        className="sr-cell sr-cell-target-combined sr-jb-section sr-summary-panel sr-summary-compact sr-target-card card border-0 shadow-sm d-flex flex-column min-h-0"
                        style={SR_TA_QUARTER_CHART_ALIGN_STYLE}
                    >
                        <div className="sr-summary-title">Job Booking Target Vs Actual</div>
                        <div className="sr-metric-stack d-flex flex-column flex-grow-1 min-h-0">
                        <div className="sr-stack-top d-flex flex-column min-h-0">
                        <div className="sr-summary-body sr-target-body d-flex flex-column">
                            <div className="d-flex justify-content-between align-items-center sr-target-top sr-jb-target-top">
                                <div className="sr-target-achieved">
                                    <span className="sr-target-achieved-label">Achieved Bookings</span>
                                    <span className="sr-achieved-pct text-success">
                                        <span className="sr-achieved-pct__num">{overallRatio}</span>
                                        <span className="sr-achieved-pct__sym">%</span>
                                    </span>
                                </div>
                                <div className="sr-target-fraction sr-jb-fraction-stack d-flex flex-column align-items-end justify-content-center text-end">
                                    <div className="sr-fraction-actual sr-jb-fraction-cell sr-fraction-kpi-row">
                                        <span className="sr-fraction-suffix sr-fraction-suffix--lead">Actual</span>
                                        <span className="sr-fraction-value text-success">{formatK(totalActual)}</span>
                                    </div>
                                    <div className="sr-fraction-rule sr-jb-fraction-stack-rule" role="presentation" />
                                    <div className="sr-fraction-target sr-jb-fraction-cell sr-fraction-kpi-row">
                                        <span className="sr-fraction-suffix sr-fraction-suffix--lead">Target</span>
                                        <span className="sr-fraction-value sr-fraction-target-val">{formatK(totalTarget)}</span>
                                    </div>
                                </div>
                            </div>
                            <hr className="sr-target-hr" />
                            <div className="sr-jb-quarter-align">
                                <div className="sr-quarter-matrix" aria-label="Quarter breakdown">
                                    <div className="sr-q-matrix__corner" aria-hidden />
                                    {targetVsActualData.map((row, qi) => {
                                        const t = Number(row.target) || 0;
                                        const a = Number(row.actual) || 0;
                                        const pct = t > 0 ? Math.round((a / t) * 100) : 0;
                                        const vsep = qi < 3 ? ' sr-q-matrix__cell--vsep' : '';
                                        return (
                                            <div key={`jb-qh-${row.name}`} className={`sr-q-matrix__qh text-center${vsep}`}>
                                                <div className="sr-quarter-header">
                                                    <span className="sr-quarter-name">{row.name}</span>
                                                    <span className="sr-quarter-pct text-success"> {pct}<span className="sr-pct-sym">%</span></span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    <div className="sr-q-matrix__lab sr-q-matrix__lab--actual">Actual</div>
                                    {targetVsActualData.map((row, qi) => {
                                        const t = Number(row.target) || 0;
                                        const a = Number(row.actual) || 0;
                                        const vsep = qi < 3 ? ' sr-q-matrix__cell--vsep' : '';
                                        return (
                                            <div key={`jb-qa-${row.name}`} className={`sr-q-matrix__actual text-center text-success${vsep}`}>
                                                {formatK(a)}
                                            </div>
                                        );
                                    })}
                                    <div className="sr-q-matrix__rule" role="presentation" />
                                    <div className="sr-q-matrix__lab sr-q-matrix__lab--target">Target</div>
                                    {targetVsActualData.map((row, qi) => {
                                        const t = Number(row.target) || 0;
                                        const vsep = qi < 3 ? ' sr-q-matrix__cell--vsep' : '';
                                        return (
                                            <div key={`jb-qt-${row.name}`} className={`sr-q-matrix__target sr-quarter-target text-center${vsep}`}>
                                                {formatK(t)}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                        <hr className="sr-stack-divider" role="presentation" />
                        </div>
                        <div className="sr-ta-chart-stack sr-jb-chart-stack min-h-0 d-flex flex-column">
                            <div className="sr-chart-bar flex-grow-1 min-h-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={targetVsActualData} margin={SR_TA_ALIGNED_BAR_MARGIN}>
                                        <defs>
                                            <linearGradient id="srBarJbTarget" x1="0" y1="1" x2="0" y2="0">
                                                <stop offset="0%" stopColor={mixHexWithWhite(BAR_TARGET_FILL, 0.08)} />
                                                <stop offset="100%" stopColor={mixHexWithWhite(BAR_TARGET_FILL, 0.42)} />
                                            </linearGradient>
                                            <linearGradient id="srBarJbActual" x1="0" y1="1" x2="0" y2="0">
                                                <stop offset="0%" stopColor={BAR_ACTUAL_FILL} />
                                                <stop offset="100%" stopColor={mixHexWithWhite(BAR_ACTUAL_FILL, 0.35)} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e8ecf4" strokeOpacity={0.95} />
                                        <XAxis dataKey="name" tick={SR_TA_XAXIS_TICK} height={SR_TA_XAXIS_HEIGHT} />
                                        <YAxis tickFormatter={formatShort} width={SR_TA_YAXIS_WIDTH} tick={SR_TA_YAXIS_TICK} />
                                        <Tooltip formatter={(v) => formatFullNumber(v)} />
                                        <Legend
                                            itemSorter={legendTargetFirstSorter}
                                            wrapperStyle={{ fontSize: SR_TA_LEGEND_FONT_SIZE, color: SR_CHART_LEGEND_GREY }}
                                            verticalAlign="bottom"
                                        />
                                        <Bar dataKey="target" name="Target" fill={SR_BAR_JB.target} radius={[5, 5, 0, 0]} maxBarSize={20} isAnimationActive={false} />
                                        <Bar dataKey="actual" name="Actual Achieved" fill={SR_BAR_JB.actual} radius={[5, 5, 0, 0]} maxBarSize={20} isAnimationActive={false} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                        </div>
                    </section>

                    {/* 3 — Gross margin: summary + bar chart (rows 1–2) */}
                    <section
                        className="sr-cell sr-cell-gm-combined sr-summary-panel sr-summary-compact sr-target-card sr-gm-section card border-0 shadow-sm d-flex flex-column min-h-0"
                        style={SR_TA_QUARTER_CHART_ALIGN_STYLE}
                    >
                        <div className="sr-summary-title">Job Booking Gross Profit Target Vs Actual</div>
                        <div className="sr-metric-stack d-flex flex-column flex-grow-1 min-h-0">
                        <div className="sr-stack-top d-flex flex-column min-h-0">
                        <div className="sr-summary-body sr-target-body d-flex flex-column">
                            <div className="d-flex justify-content-between align-items-center sr-target-top sr-gm-target-top">
                                <div className="sr-target-achieved">
                                    <span className="sr-target-achieved-label">Achieved GP</span>
                                    <span className="sr-achieved-pct text-success">
                                        <span className="sr-achieved-pct__num">{gmOverallRatio}</span>
                                        <span className="sr-achieved-pct__sym">%</span>
                                    </span>
                                </div>
                                <div className="sr-target-fraction sr-gm-fraction-stack d-flex flex-column align-items-end justify-content-center text-end">
                                    <div className="sr-fraction-actual sr-gm-fraction-cell sr-fraction-kpi-row">
                                        <span className="sr-fraction-suffix sr-fraction-suffix--lead">Actual</span>
                                        <span className="sr-fraction-value text-success">{formatK(gmTotalActual)}</span>
                                        <span className="sr-gp-summary-actual-pct"> {Math.round(gmOverallActualGpPct)}<span className="sr-pct-sym">%</span></span>
                                    </div>
                                    <div className="sr-fraction-rule sr-gm-fraction-stack-rule" role="presentation" />
                                    <div className="sr-fraction-target sr-gm-fraction-cell sr-fraction-kpi-row">
                                        <span className="sr-fraction-suffix sr-fraction-suffix--lead">Target</span>
                                            <span className="sr-fraction-value sr-fraction-target-val">
                                            {formatK(gmTotalTarget)}
                                            <span className="sr-fraction-target-gp-pct"> {formatGpTargetPctDisplay(gmOverallTargetGpPct)}</span>
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <hr className="sr-target-hr" />
                            <div className="sr-gm-quarter-align">
                                <div className="sr-quarter-matrix" aria-label="Quarter breakdown">
                                    <div className="sr-q-matrix__corner" aria-hidden />
                                    {grossMarginData.map((row, qi) => {
                                        const vsep = qi < 3 ? ' sr-q-matrix__cell--vsep' : '';
                                        return (
                                            <div key={`gm-qh-${row.name}`} className={`sr-q-matrix__qh text-center${vsep}`}>
                                                <div className="sr-quarter-header">
                                                    <span className="sr-quarter-name">{row.name}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    <div className="sr-q-matrix__lab sr-q-matrix__lab--actual">Actual</div>
                                    {grossMarginData.map((row, qi) => {
                                        const a = Number(row.actual) || 0;
                                        const quarterActualBooking = Number(targetVsActualData[qi]?.actual) || 0;
                                        const pct = quarterActualBooking > 0 ? Math.round((a / quarterActualBooking) * 100) : 0;
                                        const vsep = qi < 3 ? ' sr-q-matrix__cell--vsep' : '';
                                        return (
                                            <div key={`gm-qa-${row.name}`} className={`sr-q-matrix__actual sr-quarter-gp-line text-center${vsep}`}>
                                                <span className="sr-quarter-gp-val">{formatK(a)}</span>
                                                <span className="sr-quarter-gp-pct"> {pct}<span className="sr-pct-sym">%</span></span>
                                            </div>
                                        );
                                    })}
                                    <div className="sr-q-matrix__rule" role="presentation" />
                                    <div className="sr-q-matrix__lab sr-q-matrix__lab--target">Target</div>
                                    {grossMarginData.map((row, qi) => {
                                        const t = Number(row.target) || 0;
                                        const vsep = qi < 3 ? ' sr-q-matrix__cell--vsep' : '';
                                        return (
                                            <div key={`gm-qt-${row.name}`} className={`sr-q-matrix__target sr-gp-quarter-target text-center${vsep}`}>
                                                <span className="sr-quarter-target-k">{formatK(t)}</span>
                                                <span className="sr-quarter-target-gp-pct"> {formatGpTargetPctDisplay(Number(row.targetGpPct) || 0)}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                        <hr className="sr-stack-divider" role="presentation" />
                        </div>
                        <div className="sr-ta-chart-stack sr-gm-chart-stack min-h-0 d-flex flex-column">
                            <div className="sr-chart-bar flex-grow-1 min-h-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={grossMarginData} margin={SR_TA_ALIGNED_BAR_MARGIN}>
                                        <defs>
                                            <linearGradient id="srBarGmTarget" x1="0" y1="1" x2="0" y2="0">
                                                <stop offset="0%" stopColor={mixHexWithWhite(BAR_TARGET_FILL, 0.08)} />
                                                <stop offset="100%" stopColor={mixHexWithWhite(BAR_TARGET_FILL, 0.42)} />
                                            </linearGradient>
                                            <linearGradient id="srBarGmActual" x1="0" y1="1" x2="0" y2="0">
                                                <stop offset="0%" stopColor={BAR_ACTUAL_FILL} />
                                                <stop offset="100%" stopColor={mixHexWithWhite(BAR_ACTUAL_FILL, 0.35)} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e8ecf4" strokeOpacity={0.95} />
                                        <XAxis dataKey="name" tick={SR_TA_XAXIS_TICK} height={SR_TA_XAXIS_HEIGHT} />
                                        <YAxis tickFormatter={formatShort} width={SR_TA_YAXIS_WIDTH} tick={SR_TA_YAXIS_TICK} />
                                        <Tooltip formatter={(v) => formatFullNumber(v)} />
                                        <Legend
                                            itemSorter={legendTargetFirstSorter}
                                            wrapperStyle={{ fontSize: SR_TA_LEGEND_FONT_SIZE, color: SR_CHART_LEGEND_GREY }}
                                            verticalAlign="bottom"
                                        />
                                        <Bar dataKey="target" name="Target" fill={SR_BAR_GM.target} radius={[5, 5, 0, 0]} maxBarSize={20} isAnimationActive={false} />
                                        <Bar dataKey="actual" name="Actual Achieved" fill={SR_BAR_GM.actual} radius={[5, 5, 0, 0]} maxBarSize={20} isAnimationActive={false} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                        </div>
                    </section>

                    <section className="sr-cell sr-cell-pipeline sr-pipeline-panel card border-0 shadow-sm">
                        <div className="sr-pipeline-header">Sales Pipeline</div>
                        <div className="sr-pipeline-body d-flex flex-column flex-grow-1 min-h-0">
                            <div className="sr-pipeline-top d-flex flex-column min-h-0 flex-grow-1 p-2">
                                <div className="sr-chart-funnel flex-grow-1 min-h-0">
                                    <SalesPipelineFunnelVisual
                                        rows={funnelData}
                                        formatFullNumber={formatFullNumber}
                                        formatGmParts={formatFunnelGrossMarginParts}
                                    />
                                </div>
                            </div>
                            <div className="sr-pipeline-summary flex-shrink-0">
                                {FUNNEL_STAGES.map((stage, i) => {
                                    const v = Number(funnelData[i]?.value) || 0;
                                    const showGm = stage.probability !== 10;
                                    const gmParts = showGm
                                        ? formatFunnelGrossMarginParts(funnelData[i] || {})
                                        : null;
                                    return (
                                        <div
                                            key={stage.probability}
                                            className="sr-pipeline-summary-row d-flex align-items-center justify-content-between gap-2"
                                        >
                                            <div className="d-flex align-items-center gap-2 min-w-0 flex-grow-1">
                                                <span className="sr-pipeline-summary-pct">{stage.pctLabel || `${stage.probability}%`}</span>
                                                <span className="sr-pipeline-swatch" style={{ backgroundColor: stage.color }} title={stage.name} aria-hidden />
                                                <span className="sr-pipeline-summary-legend text-truncate">{stage.name}</span>
                                            </div>
                                            <span className="sr-pipeline-summary-value text-end">
                                                <span className="sr-pipeline-summary-value-main text-nowrap">
                                                    {formatFunnelSummaryValue(v)}
                                                </span>
                                                {gmParts ? (
                                                    <span className="sr-pipeline-summary-gm d-block text-nowrap">
                                                        <span className="sr-pipeline-summary-gp-prefix">{gmParts.prefix}</span>
                                                        {` ${gmParts.detail}`}
                                                    </span>
                                                ) : null}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </section>

                    <section className="sr-cell sr-cell-table card border-0 shadow-sm">
                        <div className="card-header sr-report-table-title sr-report-table-title--toolbar px-2 py-1 small">
                            <span className="flex-grow-1" aria-hidden />
                            <span className="sr-report-table-heading text-center flex-shrink-0 px-1">
                                Jobs ({topJobsHeadingWord})
                            </span>
                            <div className="flex-grow-1 d-flex justify-content-end align-items-center no-print">
                                <button
                                    type="button"
                                    className={`btn btn-sm sr-table-clear-filters-btn me-2${
                                        hasAnyTopJobFilters
                                            ? ' sr-table-clear-filters-btn--active'
                                            : ' btn-outline-light'
                                    }`}
                                    onClick={() => {
                                        setTopJobColumnFilters({});
                                        setTopJobValueFilter(null);
                                        setTopJobGrossMarginFilter(null);
                                        setActiveHeaderFilter(null);
                                    }}
                                    title={hasAnyTopJobFilters ? 'Clear all table filters (filters active)' : 'Clear all table filters'}
                                    aria-label="Clear all table filters"
                                    aria-pressed={hasAnyTopJobFilters}
                                    disabled={!hasAnyTopJobFilters}
                                >
                                    <FilterX size={13} />
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-sm btn-outline-light sr-table-expand-btn me-2"
                                    onClick={() => setTableExpanded((prev) => !prev)}
                                    title={tableExpanded ? 'Collapse table view' : 'Expand table view'}
                                    aria-label={tableExpanded ? 'Collapse table view' : 'Expand table view'}
                                >
                                    {tableExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                                </button>
                                <ExcelDownloadButton
                                    onClick={handleDownloadJobsExcel}
                                    disabled={topJobsLoading || topRowsFiltered.length === 0}
                                    className="sr-table-excel-btn me-2"
                                />
                                <label className="visually-hidden" htmlFor="sr-top-jobs-status">
                                    Filter top jobs by status
                                </label>
                                <select
                                    id="sr-top-jobs-status"
                                    className="form-select form-select-sm sr-top-jobs-status-select"
                                    value={topJobStatus}
                                    onChange={(e) => setTopJobStatus(e.target.value)}
                                    aria-label="Filter top jobs by status"
                                >
                                    {TOP_JOB_STATUS_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>
                                            {o.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="table-responsive sr-table-inner min-h-0" ref={tableScrollWrapRef}>
                            <table className="table table-sm table-striped table-bordered mb-0 align-middle sr-detail-table">
                                <thead className="table-secondary">
                                    <tr>
                                        {renderPlainHeader('slNo', 'Sl.No.')}
                                        {renderFilterableHeader('requestNo', 'Enquiry No.')}
                                        {renderFilterableHeader('projectName', 'Project Name')}
                                        {renderFilterableHeader('customerName', 'Customer Name')}
                                        {renderValueFilterHeader(topJobsTableConfig.valueHeader)}
                                        {renderPlainHeader(
                                            'chart',
                                            topJobsTableConfig.chartHeader,
                                            'sr-job-bar-th',
                                            'Each row: % of the table Total (same as the blue Total row in the value column); bar length matches that %.'
                                        )}
                                        {topJobStatus === 'Follow Up'
                                            ? renderGrossMarginFilterHeader()
                                            : null}
                                        {topJobStatus === 'Quoted' ? (
                                            <>
                                                {renderFilterableHeader('metric', topJobsTableConfig.metricHeader, 'text-end text-nowrap')}
                                                {renderFilterableHeader('quoteDate', 'Quote Date', 'text-nowrap')}
                                                {renderFilterableHeader('leadJob', 'Lead Job Name', 'text-nowrap')}
                                            </>
                                        ) : topJobStatus === 'Won' ? (
                                            <>
                                                {renderFilterableHeader('metric', topJobsTableConfig.metricHeader, 'text-end text-nowrap')}
                                                {renderFilterableHeader('bookedDate', 'Booked Date', 'text-nowrap')}
                                            </>
                                        ) : topJobStatus === 'Lost' ? (
                                            <>
                                                {renderFilterableHeader('metric', topJobsTableConfig.metricHeader, 'text-end text-nowrap')}
                                                {renderFilterableHeader('lostDate', 'Lost Date', 'text-nowrap')}
                                            </>
                                        ) : topJobStatus === 'Follow Up' ? (
                                            <>
                                                {renderFilterableHeader('metric', topJobsTableConfig.metricHeader, 'text-end text-nowrap')}
                                                {renderFilterableHeader('expectedDate', 'Expected Date', 'text-nowrap')}
                                            </>
                                        ) : topJobStatus === 'Pending' ? (
                                            <>
                                                {renderFilterableHeader('quoteRef', 'Quote Ref', 'text-end text-nowrap')}
                                                {renderFilterableHeader('quoteDate', 'Quote Date', 'text-nowrap')}
                                                {renderFilterableHeader('metric', topJobsTableConfig.metricHeader, 'text-end text-nowrap')}
                                            </>
                                        ) : (
                                            renderFilterableHeader('metric', topJobsTableConfig.metricHeader, 'text-end text-nowrap')
                                        )}
                                        {TOP_JOB_PROB_QUOTE_REF_DATE_STATUSES.has(topJobStatus) ? (
                                            <>
                                                {renderFilterableHeader('quoteRef', 'Quote Ref', 'text-end text-nowrap')}
                                                {renderFilterableHeader('quoteDate', 'Quote Date', 'text-nowrap')}
                                            </>
                                        ) : null}
                                        {renderFilterableHeader('clientName', 'Client Name')}
                                        {renderFilterableHeader('consultantName', 'Consultant Name')}
                                        {TOP_JOB_QUOTE_TYPE_STATUSES.has(topJobStatus)
                                            ? renderFilterableHeader('quoteType', 'Quote Type')
                                            : null}
                                        {renderFilterableHeader('concernSe', 'Concern SE/EE/TE/QS')}
                                        {topJobsTableConfig.extraHeader ? renderFilterableHeader('extra', topJobsTableConfig.extraHeader) : null}
                                    </tr>
                                </thead>
                                <tbody
                                    className={topJobsLoading ? 'sr-detail-table__body-loading' : undefined}
                                    aria-busy={topJobsLoading}
                                >
                                    {topRowsFiltered.length === 0 ? (
                                        <tr>
                                            <td
                                                colSpan={
                                                    9 +
                                                    (topJobStatus === 'Quoted' ? 2 : 0) +
                                                    (topJobStatus === 'Won' || topJobStatus === 'Lost' || topJobStatus === 'Follow Up' ? 1 : 0) +
                                                    (topJobStatus === 'Follow Up' ? 1 : 0) +
                                                    (topJobStatus === 'Pending' ? 2 : 0) +
                                                    (TOP_JOB_PROB_QUOTE_REF_DATE_STATUSES.has(topJobStatus) ? 2 : 0) +
                                                    (TOP_JOB_QUOTE_TYPE_STATUSES.has(topJobStatus) ? 1 : 0) +
                                                    (topJobsTableConfig.extraHeader ? 1 : 0)
                                                }
                                                className="text-center text-muted py-2"
                                            >
                                                No job booked rows for the selected filters.
                                            </td>
                                        </tr>
                                    ) : (
                                        <>
                                        <tr className="sr-detail-table__total-row">
                                            <td style={getTopJobColStyle('slNo')} />
                                            <td style={getTopJobColStyle('requestNo')} />
                                            <td
                                                className="text-center fw-semibold small sr-detail-table__clip"
                                                style={getTopJobColStyle('projectName')}
                                                title="Distinct projects: unique enquiry numbers in this list (multiple quotes for the same enquiry count once)."
                                            >
                                                {topRowsFilteredDistinctProjectCount > 0
                                                    ? `${topRowsFilteredDistinctProjectCount} ${
                                                          topRowsFilteredDistinctProjectCount === 1
                                                              ? 'project'
                                                              : 'projects'
                                                      }`
                                                    : ''}
                                            </td>
                                            <td className="text-end fw-semibold sr-detail-table__clip" style={getTopJobColStyle('customerName')}>
                                                Total
                                            </td>
                                            <td className="text-end fw-semibold" style={getTopJobColStyle('jobValue')}>
                                                {formatK(
                                                    TOP_JOB_MAX_PER_ENQUIRY_VALUE_STATUSES.has(topJobStatus)
                                                        ? topRowsFilteredQuotedMaxPerEnquiryTotal
                                                        : topRowsFilteredTotalValue
                                                )}
                                            </td>
                                            <td style={getTopJobColStyle('chart')} />
                                            {topJobStatus === 'Follow Up' ? (
                                                <td className="text-end fw-semibold" style={getTopJobColStyle('grossMargin')}>
                                                    {formatK(topRowsFilteredWonGpTotal)} ({topRowsFilteredWonAvgGpPct}
                                                    <span className="sr-pct-sym">%</span>)
                                                </td>
                                            ) : null}
                                            {topJobStatus === 'Quoted' ? (
                                                <>
                                                    <td />
                                                    <td />
                                                    <td />
                                                </>
                                            ) : topJobStatus === 'Won' ? (
                                                <>
                                                    <td className="text-end fw-semibold">
                                                        {formatK(topRowsFilteredWonGpTotal)} ({topRowsFilteredWonAvgGpPct}
                                                        <span className="sr-pct-sym">%</span>)
                                                    </td>
                                                    <td />
                                                </>
                                            ) : topJobStatus === 'Lost' ? (
                                                <>
                                                    <td />
                                                    <td />
                                                </>
                                            ) : topJobStatus === 'Follow Up' ? (
                                                <>
                                                    <td />
                                                    <td />
                                                </>
                                            ) : topJobStatus === 'Pending' ? (
                                                <>
                                                    <td />
                                                    <td />
                                                    <td />
                                                </>
                                            ) : (
                                                <td className="text-end fw-semibold">
                                                    {null}
                                                </td>
                                            )}
                                            {TOP_JOB_PROB_QUOTE_REF_DATE_STATUSES.has(topJobStatus) ? (
                                                <>
                                                    <td />
                                                    <td />
                                                </>
                                            ) : null}
                                            <td />
                                            <td />
                                            {TOP_JOB_QUOTE_TYPE_STATUSES.has(topJobStatus) ? <td /> : null}
                                            <td />
                                            {topJobsTableConfig.extraHeader ? <td /> : null}
                                        </tr>
                                        {topRowsFiltered.map((row, idx) => {
                                            const enquiryKey = topJobEnquiryKey(row);
                                            const isEnquiryGroupContinuation =
                                                topJobEnquiryGroupMeta.continuation.has(idx);
                                            const enquiryGroupRowSpan =
                                                topJobEnquiryGroupMeta.rowSpanAt.get(idx) || 1;
                                            const rowValue = Math.abs(Number(row.JobValue)) || 0;
                                            const chartValue =
                                                TOP_JOB_MAX_PER_ENQUIRY_VALUE_STATUSES.has(topJobStatus) &&
                                                enquiryKey
                                                    ? (topJobEnquiryMaxValueByKey.get(enquiryKey) ?? rowValue)
                                                    : rowValue;
                                            const v = chartValue;
                                            const denom =
                                                topJobChartDenominator > 0 ? topJobChartDenominator : topJobValueMax;
                                            const pctNum = denom > 0 ? (v / denom) * 100 : 0;
                                            const barW = denom > 0 ? Math.min(100, Math.max(0, pctNum)) : 0;
                                            const pctRounded = Math.round(pctNum);
                                            const pctTitle = `${pctRounded}% of ${topJobChartDenominator > 0 ? 'table total' : 'largest job in list'}`;
                                            const basisLabel =
                                                topJobChartDenominator > 0 ? 'table total' : 'largest job in list';
                                            const groupClass = idx === 0
                                                ? 'sr-enquiry-strip-a'
                                                : (topRowsFiltered[idx - 1].RequestNo === row.RequestNo
                                                    ? topRowsFiltered[idx - 1].__stripClass || 'sr-enquiry-strip-a'
                                                    : (topRowsFiltered[idx - 1].__stripClass === 'sr-enquiry-strip-a'
                                                        ? 'sr-enquiry-strip-b'
                                                        : 'sr-enquiry-strip-a'));
                                            // Store computed class on the row object for subsequent comparisons.
                                            // eslint-disable-next-line no-param-reassign
                                            row.__stripClass = groupClass;
                                            return (
                                                <tr
                                                    key={`${row.RequestNo || row.ProjectName || 'r'}-${String(row.LeadJob || '').slice(0, 40)}-${idx}`}
                                                    className={groupClass}
                                                >
                                                    <td style={getTopJobColStyle('slNo')}>{idx + 1}</td>
                                                    {renderTopJobEnquiryGroupCell(
                                                        isEnquiryGroupContinuation,
                                                        enquiryGroupRowSpan,
                                                        null,
                                                        row.RequestNo || row.EnquiryNo || '—',
                                                        getTopJobColStyle('requestNo')
                                                    )}
                                                    {renderTopJobEnquiryGroupCell(
                                                        isEnquiryGroupContinuation,
                                                        enquiryGroupRowSpan,
                                                        'sr-detail-table__clip',
                                                        <span title={String(row.ProjectName || '').trim() || undefined}>
                                                            {row.ProjectName || '—'}
                                                        </span>,
                                                        getTopJobColStyle('projectName')
                                                    )}
                                                    <td
                                                        className="sr-detail-table__clip"
                                                        style={getTopJobColStyle('customerName')}
                                                        title={String(row.CustomerName || '').trim() || undefined}
                                                    >
                                                        {row.CustomerName || '—'}
                                                    </td>
                                                    <td className="text-end" style={getTopJobColStyle('jobValue')}>
                                                        {formatK(row.JobValue)}
                                                    </td>
                                                    {TOP_JOB_MAX_PER_ENQUIRY_VALUE_STATUSES.has(topJobStatus) ? (
                                                        renderTopJobEnquiryGroupCell(
                                                            isEnquiryGroupContinuation,
                                                            enquiryGroupRowSpan,
                                                            'sr-job-bar-cell',
                                                            <div className="sr-job-bar-wrap">
                                                                <span className="sr-job-bar-pct" title={pctTitle}>
                                                                    <span className="sr-job-bar-pct-num">{pctRounded}</span>
                                                                    <span className="sr-job-bar-pct-sym">%</span>
                                                                </span>
                                                                <div
                                                                    className="sr-job-bar-track"
                                                                    title={`${pctRounded}% of ${basisLabel} (${formatExactAmountString(v)})`}
                                                                    role="img"
                                                                    aria-label={`Job value ${pctRounded} percent of ${basisLabel}`}
                                                                >
                                                                    <div className="sr-job-bar-fill" style={{ width: `${barW}%` }} />
                                                                </div>
                                                            </div>,
                                                            getTopJobColStyle('chart')
                                                        )
                                                    ) : (
                                                        <td className="sr-job-bar-cell" style={getTopJobColStyle('chart')}>
                                                            <div className="sr-job-bar-wrap">
                                                                <span className="sr-job-bar-pct" title={pctTitle}>
                                                                    <span className="sr-job-bar-pct-num">{pctRounded}</span>
                                                                    <span className="sr-job-bar-pct-sym">%</span>
                                                                </span>
                                                                <div
                                                                    className="sr-job-bar-track"
                                                                    title={`${pctRounded}% of ${basisLabel} (${formatExactAmountString(v)})`}
                                                                    role="img"
                                                                    aria-label={`Job value ${pctRounded} percent of ${basisLabel}`}
                                                                >
                                                                    <div className="sr-job-bar-fill" style={{ width: `${barW}%` }} />
                                                                </div>
                                                            </div>
                                                        </td>
                                                    )}
                                                    {topJobStatus === 'Follow Up' ? (
                                                        <td className="text-end small text-nowrap" style={getTopJobColStyle('grossMargin')}>
                                                            {formatJobBookedGrossMargin(row)}
                                                        </td>
                                                    ) : null}
                                                    {topJobStatus === 'Quoted' ? (
                                                        <>
                                                            <td
                                                                className="text-end small text-nowrap sr-detail-table__clip"
                                                                style={getTopJobColStyle('metric')}
                                                                title={String(row.QuoteRef || '').trim() || undefined}
                                                            >
                                                                {row.QuoteRef || '—'}
                                                            </td>
                                                            <td className="text-nowrap" style={getTopJobColStyle('quoteDate')}>
                                                                {formatDateShort(row.QuoteDate)}
                                                            </td>
                                                            {renderTopJobEnquiryGroupCell(
                                                                isEnquiryGroupContinuation,
                                                                enquiryGroupRowSpan,
                                                                'text-nowrap sr-detail-table__clip',
                                                                <span title={String(row.LeadJob || '').trim() || undefined}>
                                                                    {row.LeadJob || '—'}
                                                                </span>,
                                                                getTopJobColStyle('leadJob')
                                                            )}
                                                        </>
                                                    ) : topJobStatus === 'Won' ? (
                                                        <>
                                                            <td className="text-end small text-nowrap" style={getTopJobColStyle('metric')}>
                                                                {renderTopJobsMetricCell(row)}
                                                            </td>
                                                            <td className="text-nowrap" style={getTopJobColStyle('bookedDate')}>
                                                                {formatDateShort(row.BookedDate)}
                                                            </td>
                                                        </>
                                                    ) : topJobStatus === 'Lost' ? (
                                                        <>
                                                            <td className="text-end small text-nowrap" style={getTopJobColStyle('metric')}>
                                                                {renderTopJobsMetricCell(row)}
                                                            </td>
                                                            <td className="text-nowrap" style={getTopJobColStyle('lostDate')}>
                                                                {formatDateShort(row.LostDate)}
                                                            </td>
                                                        </>
                                                    ) : topJobStatus === 'Follow Up' ? (
                                                        <>
                                                            <td className="text-end small text-nowrap" style={getTopJobColStyle('metric')}>
                                                                {renderTopJobsMetricCell(row)}
                                                            </td>
                                                            <td className="text-nowrap" style={getTopJobColStyle('expectedDate')}>
                                                                {formatDateShort(row.ExpectedDate)}
                                                            </td>
                                                        </>
                                                    ) : topJobStatus === 'Pending' ? (
                                                        <>
                                                            <td
                                                                className="text-end small text-nowrap sr-detail-table__clip"
                                                                style={getTopJobColStyle('quoteRef')}
                                                                title={String(row.QuoteRef || '').trim() || undefined}
                                                            >
                                                                {row.QuoteRef || '—'}
                                                            </td>
                                                            <td className="text-nowrap" style={getTopJobColStyle('quoteDate')}>
                                                                {formatDateShort(row.QuoteDate)}
                                                            </td>
                                                            <td className="text-end small text-nowrap" style={getTopJobColStyle('metric')}>
                                                                {renderTopJobsMetricCell(row)}
                                                            </td>
                                                        </>
                                                    ) : (
                                                        <td className="text-end small text-nowrap" style={getTopJobColStyle('metric')}>
                                                            {renderTopJobsMetricCell(row)}
                                                        </td>
                                                    )}
                                                    {TOP_JOB_PROB_QUOTE_REF_DATE_STATUSES.has(topJobStatus) ? (
                                                        <>
                                                            <td
                                                                className="text-end small text-nowrap sr-detail-table__clip"
                                                                style={getTopJobColStyle('quoteRef')}
                                                                title={String(row.QuoteRef || '').trim() || undefined}
                                                            >
                                                                {row.QuoteRef || '—'}
                                                            </td>
                                                            <td className="text-nowrap" style={getTopJobColStyle('quoteDate')}>
                                                                {formatDateShort(row.QuoteDate)}
                                                            </td>
                                                        </>
                                                    ) : null}
                                                    {renderTopJobEnquiryGroupCell(
                                                        isEnquiryGroupContinuation,
                                                        enquiryGroupRowSpan,
                                                        'sr-detail-table__clip',
                                                        <span title={String(row.ClientName || '').trim() || undefined}>
                                                            {row.ClientName || '—'}
                                                        </span>,
                                                        getTopJobColStyle('clientName')
                                                    )}
                                                    {renderTopJobEnquiryGroupCell(
                                                        isEnquiryGroupContinuation,
                                                        enquiryGroupRowSpan,
                                                        'sr-detail-table__clip',
                                                        <span title={String(row.ConsultantName || '').trim() || undefined}>
                                                            {row.ConsultantName || '—'}
                                                        </span>,
                                                        getTopJobColStyle('consultantName')
                                                    )}
                                                    {TOP_JOB_QUOTE_TYPE_STATUSES.has(topJobStatus)
                                                        ? renderTopJobEnquiryGroupCell(
                                                              isEnquiryGroupContinuation,
                                                              enquiryGroupRowSpan,
                                                              null,
                                                              row.QuoteType || '—',
                                                              getTopJobColStyle('quoteType')
                                                          )
                                                        : null}
                                                    {renderTopJobEnquiryGroupCell(
                                                        isEnquiryGroupContinuation,
                                                        enquiryGroupRowSpan,
                                                        'sr-detail-table__clip',
                                                        <span title={String(row.ConcernSEEEQS || '').trim() || undefined}>
                                                            {row.ConcernSEEEQS || '—'}
                                                        </span>,
                                                        getTopJobColStyle('concernSe')
                                                    )}
                                                    {topJobsTableConfig.extraHeader ? (
                                                        <td
                                                            className="sr-detail-table__clip"
                                                            style={getTopJobColStyle('extra')}
                                                            title={String(row.ReasonForLost || row.FollowUpRemarks || '').trim() || undefined}
                                                        >
                                                            {row.ReasonForLost || row.FollowUpRemarks || '—'}
                                                        </td>
                                                    ) : null}
                                                </tr>
                                            );
                                        })}
                                        </>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </div>
            </div>

            <div className="sr-print-footer flex-shrink-0">
                This report is generated from Enquiry Management System
            </div>
            </div>
            {renderHeaderFilterPortal()}
        </div>
    );
};

export default SalesReport;
