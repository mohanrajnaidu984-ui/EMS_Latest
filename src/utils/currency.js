/**
 * Client currency helpers — codes come from Master_EnquiryFor.Currency (per company/division).
 * Display always uses the stored code (e.g. BHD), never legacy short symbols like BD/KD.
 * Default remains BHD when unset.
 */

export const DEFAULT_CURRENCY = 'BHD';

/** @typedef {{ code: string, symbol: string, words: string, decimals: number, subunitName: string, subunitDivisor: number }} CurrencyMeta */

/** @type {Record<string, CurrencyMeta>} */
const CURRENCY_META = {
    BHD: {
        code: 'BHD',
        symbol: 'BHD',
        words: 'Bahraini Dinars',
        decimals: 3,
        subunitName: 'fils',
        subunitDivisor: 1000,
    },
    AED: {
        code: 'AED',
        symbol: 'AED',
        words: 'UAE Dirhams',
        decimals: 2,
        subunitName: 'fils',
        subunitDivisor: 100,
    },
    SAR: {
        code: 'SAR',
        symbol: 'SAR',
        words: 'Saudi Riyals',
        decimals: 2,
        subunitName: 'halalas',
        subunitDivisor: 100,
    },
    USD: {
        code: 'USD',
        symbol: 'USD',
        words: 'US Dollars',
        decimals: 2,
        subunitName: 'cents',
        subunitDivisor: 100,
    },
    EUR: {
        code: 'EUR',
        symbol: 'EUR',
        words: 'Euros',
        decimals: 2,
        subunitName: 'cents',
        subunitDivisor: 100,
    },
    GBP: {
        code: 'GBP',
        symbol: 'GBP',
        words: 'Pounds Sterling',
        decimals: 2,
        subunitName: 'pence',
        subunitDivisor: 100,
    },
    KWD: {
        code: 'KWD',
        symbol: 'KWD',
        words: 'Kuwaiti Dinars',
        decimals: 3,
        subunitName: 'fils',
        subunitDivisor: 1000,
    },
    OMR: {
        code: 'OMR',
        symbol: 'OMR',
        words: 'Omani Rials',
        decimals: 3,
        subunitName: 'baisa',
        subunitDivisor: 1000,
    },
    QAR: {
        code: 'QAR',
        symbol: 'QAR',
        words: 'Qatari Riyals',
        decimals: 2,
        subunitName: 'dirhams',
        subunitDivisor: 100,
    },
};

function normKey(s) {
    return String(s || '')
        .trim()
        .toLowerCase()
        .replace(/^(l\d+|sub job)\s*-\s*/i, '')
        .replace(/[^a-z0-9]+/g, '');
}

export function normalizeCurrencyCode(raw) {
    const code = String(raw || '')
        .trim()
        .toUpperCase();
    if (!code) return DEFAULT_CURRENCY;
    if (CURRENCY_META[code]) return code;
    // Legacy aliases
    if (code === 'BD' || code === 'BAHRAIN' || code === 'BAHRAINI DINAR') return 'BHD';
    return code;
}

/** @returns {CurrencyMeta} */
export function getCurrencyMeta(currencyCode) {
    const code = normalizeCurrencyCode(currencyCode);
    if (CURRENCY_META[code]) return CURRENCY_META[code];
    return {
        code,
        symbol: code,
        words: code,
        decimals: 2,
        subunitName: 'cents',
        subunitDivisor: 100,
    };
}

/**
 * Resolve currency code from Master_EnquiryFor rows (masters.enqItems).
 * @param {object[]} masterRows
 * @param {{ departmentName?: string, companyName?: string, itemName?: string, division?: string }} keys
 */
export function resolveCurrencyFromMasterRows(masterRows, keys = {}) {
    const list = Array.isArray(masterRows) ? masterRows : [];
    const dept = normKey(keys.departmentName || keys.division || keys.DepartmentName);
    const company = normKey(keys.companyName || keys.CompanyName);
    const item = normKey(keys.itemName || keys.ItemName);

    const scored = [];
    for (const row of list) {
        const cur = String(row?.Currency ?? row?.currency ?? '').trim();
        if (!cur) continue;
        const rDept = normKey(row.DepartmentName || row.departmentName);
        const rCompany = normKey(row.CompanyName || row.companyName);
        const rItem = normKey(row.ItemName || row.itemName);
        let score = 0;
        if (item && rItem && item === rItem) score += 100;
        if (dept && rDept && dept === rDept) score += 40;
        if (company && rCompany && company === rCompany) score += 20;
        if (score > 0) scored.push({ score, cur });
    }
    scored.sort((a, b) => b.score - a.score);
    if (scored.length) return normalizeCurrencyCode(scored[0].cur);

    if (company) {
        const byCo = list.find(
            (r) =>
                normKey(r.CompanyName || r.companyName) === company &&
                String(r.Currency || r.currency || '').trim()
        );
        if (byCo) return normalizeCurrencyCode(byCo.Currency || byCo.currency);
    }
    if (dept) {
        const byDept = list.find(
            (r) =>
                normKey(r.DepartmentName || r.departmentName) === dept &&
                String(r.Currency || r.currency || '').trim()
        );
        if (byDept) return normalizeCurrencyCode(byDept.Currency || byDept.currency);
    }
    return DEFAULT_CURRENCY;
}

export function formatCurrencyAmount(n, currencyCode = DEFAULT_CURRENCY) {
    const meta = getCurrencyMeta(currencyCode);
    /** Always show Master_EnquiryFor.Currency code (BHD, AED, …) — never legacy BD/KD. */
    const label = meta.code;
    const num = Number(n || 0);
    if (!Number.isFinite(num)) {
        return `${label} ${Number(0).toLocaleString('en-US', {
            minimumFractionDigits: meta.decimals,
            maximumFractionDigits: meta.decimals,
        })}`;
    }
    const absFmt = Math.abs(num).toLocaleString('en-US', {
        minimumFractionDigits: meta.decimals,
        maximumFractionDigits: meta.decimals,
    });
    return num < 0 ? `-${label} ${absFmt}` : `${label} ${absFmt}`;
}

/** Strip known currency symbols/codes from a money string for parsing. */
export function stripCurrencyNoise(raw) {
    return String(raw || '')
        .replace(/[()]/g, '')
        .replace(/\b(BHD|AED|SAR|USD|EUR|GBP|KWD|OMR|QAR|BD|KD)\b/gi, '')
        .replace(/,/g, '')
        .trim();
}

export function parseCurrencyAmount(raw) {
    const cleaned = stripCurrencyNoise(raw);
    if (!cleaned || cleaned === '-' || cleaned === '.') return null;
    const n = parseFloat(cleaned.replace(/^\s*-\s*/, '-'));
    return Number.isFinite(n) ? n : null;
}

export function amountColumnHeader(currencyCode = DEFAULT_CURRENCY) {
    const meta = getCurrencyMeta(currencyCode);
    return `Amount (${meta.code})`;
}

export function valueColumnHeader(currencyCode = DEFAULT_CURRENCY) {
    const meta = getCurrencyMeta(currencyCode);
    return `Value (${meta.code})`;
}

export function currencyFooterNote(currencyCode = DEFAULT_CURRENCY) {
    const meta = getCurrencyMeta(currencyCode);
    return `* All values in ${meta.code}`;
}

/**
 * Convert amount to words using the currency's major/subunit rules.
 * @param {number} num
 * @param {string} currencyCode
 */
export function numberToWordsCurrency(num, currencyCode = DEFAULT_CURRENCY) {
    const meta = getCurrencyMeta(currencyCode);
    const n = Number(num);
    if (!Number.isFinite(n)) return `${meta.words} Zero only.`;
    const negative = n < 0;
    const abs = Math.abs(n);
    const majors = Math.floor(abs);
    const frac = Math.round((abs - majors) * meta.subunitDivisor);

    const convert = (v) => {
        const units = [
            '',
            'One',
            'Two',
            'Three',
            'Four',
            'Five',
            'Six',
            'Seven',
            'Eight',
            'Nine',
            'Ten',
            'Eleven',
            'Twelve',
            'Thirteen',
            'Fourteen',
            'Fifteen',
            'Sixteen',
            'Seventeen',
            'Eighteen',
            'Nineteen',
        ];
        const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
        const scales = ['', 'Thousand', 'Million', 'Billion'];

        if (v === 0) return '';
        if (v < 20) return units[v];
        if (v < 100) return tens[Math.floor(v / 10)] + (v % 10 !== 0 ? ' ' + units[v % 10] : '');
        if (v < 1000) {
            return units[Math.floor(v / 100)] + ' Hundred' + (v % 100 !== 0 ? ' and ' + convert(v % 100) : '');
        }

        for (let i = 0, scale = 1; i < scales.length; i++, scale *= 1000) {
            if (v < scale * 1000) {
                return (
                    convert(Math.floor(v / scale)) +
                    ' ' +
                    scales[i] +
                    (v % scale !== 0 ? ' ' + convert(v % scale) : '')
                );
            }
        }
        return String(v);
    };

    let result = negative ? 'Negative ' : '';
    result += `${meta.words} `;
    if (majors === 0) result += 'Zero';
    else result += convert(majors);

    if (frac > 0) {
        result += ` and ${meta.subunitName} ${frac}/${meta.subunitDivisor}`;
    }
    result += ' only.';
    return result;
}

/** Build a compact display like "BHD 1,234.000" or "AED 1,234.00". */
export function formatCurrencyCompact(n, currencyCode = DEFAULT_CURRENCY) {
    return formatCurrencyAmount(n, currencyCode);
}

/** Session/runtime currency for the active company+division (set by each module). */
let runtimeCurrencyCode = DEFAULT_CURRENCY;

export function setRuntimeCurrency(code) {
    runtimeCurrencyCode = normalizeCurrencyCode(code);
    return runtimeCurrencyCode;
}

export function getRuntimeCurrency() {
    return runtimeCurrencyCode || DEFAULT_CURRENCY;
}

export function formatRuntimeCurrencyAmount(n) {
    return formatCurrencyAmount(n, getRuntimeCurrency());
}

export function numberToWordsRuntimeCurrency(n) {
    return numberToWordsCurrency(n, getRuntimeCurrency());
}

export function runtimeAmountColumnHeader() {
    return amountColumnHeader(getRuntimeCurrency());
}

/** Display label for amounts/UI — Master_EnquiryFor.Currency code (not legacy BD). */
export function runtimeCurrencySymbol() {
    return getRuntimeCurrencyCode();
}

export function getRuntimeCurrencyCode() {
    return getCurrencyMeta(getRuntimeCurrency()).code;
}

export function currencyLabelFromMaster(currencyCode = getRuntimeCurrency()) {
    return `Currency: ${getCurrencyMeta(currencyCode).code}`;
}

export function runtimeValueColumnHeader() {
    return valueColumnHeader(getRuntimeCurrency());
}

export function runtimeCurrencyFooterNote() {
    return currencyFooterNote(getRuntimeCurrency());
}
