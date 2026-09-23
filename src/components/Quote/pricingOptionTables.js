/**
 * Multi price-option tables for Quote "Pricing & Payment Terms".
 * One table (+ wording) per option (Base Price, Option-1, …); Disc% applies to all.
 */

import {
    formatRuntimeCurrencyAmount,
    runtimeAmountColumnHeader,
} from '../../utils/currency';

export const EMS_AUTO_PRICE_SUMMARY_TABLE_ID = 'ems-auto-price-summary-table';

export function escapeHtmlAttr(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

export function slugPricingOptionKey(name) {
    const s = String(name || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return s || 'option';
}

export function pricingOptionTableId(optionName, index) {
    if (index === 0) return EMS_AUTO_PRICE_SUMMARY_TABLE_ID;
    return `${EMS_AUTO_PRICE_SUMMARY_TABLE_ID}--${slugPricingOptionKey(optionName)}`;
}

export function formatPricingTotalRowLabel(_optionName) {
    return 'Total';
}

export function isPricingTotalRowLabel(label) {
    const t = String(label || '').trim();
    // Accept plain "Total" and legacy "Total (Option-1)" labels.
    return /^Total(\s*\([^)]*\))?$/i.test(t);
}

export function pricingOptionWordingClauseNumber(index) {
    if (index === 0) return '4.1';
    return `4.1.${index}`;
}

/** Ordered price-option names for checked jobs (Base Price first). */
export function collectPricingOptionKeys(summary, activeJobs, jobNameMatchesActiveJobsList) {
    const checked = Array.isArray(activeJobs) ? activeJobs : [];
    const keys = [];
    const seen = new Set();
    const push = (name) => {
        const n = String(name || '').trim();
        if (!n || seen.has(n)) return;
        seen.add(n);
        keys.push(n);
    };
    (summary || []).forEach((grp) => {
        if (!grp?.name || !jobNameMatchesActiveJobsList(grp.name, checked)) return;
        const items = Array.isArray(grp.items) ? grp.items : [];
        items.forEach((item) => push(item?.name));
    });
    keys.sort((a, b) => {
        if (a === 'Base Price') return -1;
        if (b === 'Base Price') return 1;
        return a.localeCompare(b, undefined, { sensitivity: 'base' });
    });
    return keys.length ? keys : ['Base Price'];
}

export function buildPricingOptionWordingHtml(optionName, grandTotalNum, clauseNum, formatLumpSumFn) {
    const opt = String(optionName || '').trim() || 'Base Price';
    const totalString = formatLumpSumFn(grandTotalNum);
    const scopePhrase = opt === 'Base Price' ? 'the scope mentioned above' : escapeHtmlAttr(opt);
    const body = `${clauseNum}. Our [Lump sum price / total quotation amount] for ${scopePhrase} shall be ${totalString}.`;
    return `<p data-ems-price-wording="${escapeHtmlAttr(opt)}">${body}</p>`;
}

/**
 * Build one or more pricing summary tables.
 * Multiple options → separate table + wording under each.
 */
export function buildMultiOptionPricingTablesHtml({
    summary,
    activeJobs,
    jobNameMatchesActiveJobsList,
    theme,
    calcPricingTotalsFromBase,
    formatLumpSumFn,
}) {
    const {
        EMS_QUOTE_PRICING_TABLE_CELL_PADDING: pad,
        EMS_QUOTE_PRICING_TABLE_CELL_BORDER: cellBorder,
        EMS_QUOTE_PRICING_TABLE_HEADER_BG,
        EMS_QUOTE_PRICING_TABLE_HEADER_COLOR,
        EMS_QUOTE_PRICING_TABLE_TOTAL_BG,
        EMS_QUOTE_PRICING_TABLE_WIDTH,
        EMS_QUOTE_PRICING_TABLE_MARGIN_TOP,
        EMS_QUOTE_PRICING_TABLE_DESC_COL_WIDTH,
        EMS_QUOTE_PRICING_TABLE_AMOUNT_COL_WIDTH,
        EMS_QUOTE_PRICING_TABLE_OUTER_BORDER,
    } = theme;

    const colgroup = `<colgroup><col style="width:${EMS_QUOTE_PRICING_TABLE_DESC_COL_WIDTH}" /><col style="width:${EMS_QUOTE_PRICING_TABLE_AMOUNT_COL_WIDTH}" /></colgroup>`;
    const fmtBhd = (n) => formatRuntimeCurrencyAmount(n);
    const amountHeader = runtimeAmountColumnHeader();

    const optionKeys = collectPricingOptionKeys(summary, activeJobs, jobNameMatchesActiveJobsList);
    const checked = Array.isArray(activeJobs) ? activeJobs : [];

    const buildOne = (optionName, tableIndex) => {
        const opt = String(optionName || '').trim() || 'Base Price';
        const tableId = pricingOptionTableId(opt, tableIndex);
        let tableHtml = `<table id="${tableId}" data-ems-pricing-cols="fixed" data-ems-price-option="${escapeHtmlAttr(opt)}" style="width:${EMS_QUOTE_PRICING_TABLE_WIDTH} !important;max-width:${EMS_QUOTE_PRICING_TABLE_WIDTH} !important;table-layout:fixed;border-collapse:collapse;margin-top:${EMS_QUOTE_PRICING_TABLE_MARGIN_TOP};margin-bottom:6px;font-size:11px;line-height:1.25;border:${EMS_QUOTE_PRICING_TABLE_OUTER_BORDER};box-sizing:border-box;">`;
        tableHtml += colgroup;
        tableHtml +=
            `<thead><tr><th style="padding:${pad};border:${cellBorder};text-align:left;font-size:11px;font-weight:600;background:${EMS_QUOTE_PRICING_TABLE_HEADER_BG};color:${EMS_QUOTE_PRICING_TABLE_HEADER_COLOR};">Description</th><th style="padding:${pad};border:${cellBorder};text-align:right;font-size:11px;font-weight:600;background:${EMS_QUOTE_PRICING_TABLE_HEADER_BG};color:${EMS_QUOTE_PRICING_TABLE_HEADER_COLOR};">${amountHeader}</th></tr></thead>`;
        tableHtml += '<tbody>';

        let htmlGrandTotal = 0;
        (summary || []).forEach((grp) => {
            if (!grp?.name || !jobNameMatchesActiveJobsList(grp.name, checked)) return;
            const items = Array.isArray(grp.items) ? grp.items : [];
            const optItem = items.find((i) => String(i?.name || '').trim() === opt);
            if (!optItem) return;
            const amount = Number(optItem?.total) || 0;
            htmlGrandTotal += amount;
            // Description = pricing option name only (e.g. "ELV Option-1"), not "BMS Project - …".
            const descriptionLabel = opt;
            tableHtml += `<tr data-ems-row="division"><td style="padding:${pad};border:${cellBorder};font-weight:600;font-size:11px;background:#ffffff;color:#0f172a;">${escapeHtmlAttr(descriptionLabel)}</td><td data-ems-amount="division" style="padding:${pad};border:${cellBorder};text-align:right;font-weight:600;font-size:11px;background:#ffffff;color:#0f172a;">${fmtBhd(amount)}</td></tr>`;
        });

        let htmlGrandTotalWithVat = 0;
        if (htmlGrandTotal > 0) {
            const { vat, grandWithVat } = calcPricingTotalsFromBase(htmlGrandTotal);
            htmlGrandTotalWithVat = grandWithVat;
            const footerStyle = `padding:${pad};border:${cellBorder};border-top:1px solid #94a3b8;text-align:right;font-size:11px;font-weight:700;background:${EMS_QUOTE_PRICING_TABLE_TOTAL_BG};color:#0f172a;`;
            const totalLabel = formatPricingTotalRowLabel(opt);
            tableHtml += `<tr data-ems-row="total"><td style="${footerStyle}">${totalLabel}</td><td data-ems-amount="total" style="${footerStyle}">${fmtBhd(htmlGrandTotal)}</td></tr>`;
            tableHtml += `<tr data-ems-row="vat"><td style="${footerStyle}">VAT 10%</td><td data-ems-amount="vat" style="${footerStyle}">${fmtBhd(vat)}</td></tr>`;
            tableHtml += `<tr data-ems-row="grand-vat"><td style="${footerStyle}">Grand Total with VAT 10%</td><td data-ems-amount="grand-vat" style="${footerStyle}">${fmtBhd(grandWithVat)}</td></tr>`;
        }
        tableHtml += '</tbody></table>';
        return { tableHtml, htmlGrandTotal, htmlGrandTotalWithVat, optionName: opt };
    };

    /* Single option: one table only (4.1 wording stays in clause template). */
    if (optionKeys.length <= 1) {
        const only = buildOne(optionKeys[0] || 'Base Price', 0);
        return {
            tableHtml: only.tableHtml,
            htmlGrandTotal: only.htmlGrandTotal,
            htmlGrandTotalWithVat: only.htmlGrandTotalWithVat,
            multiOption: false,
        };
    }

    const multiParts = [];
    let wordingIdx = 0;
    let htmlGrandTotal = 0;
    let htmlGrandTotalWithVat = 0;

    optionKeys.forEach((opt, idx) => {
        const built = buildOne(opt, idx);
        if (built.htmlGrandTotal <= 0) return;
        multiParts.push(built.tableHtml);
        if (typeof formatLumpSumFn === 'function') {
            multiParts.push(
                buildPricingOptionWordingHtml(
                    built.optionName,
                    built.htmlGrandTotalWithVat || built.htmlGrandTotal,
                    pricingOptionWordingClauseNumber(wordingIdx),
                    formatLumpSumFn
                )
            );
            wordingIdx += 1;
        }
        if (opt === 'Base Price' || wordingIdx === 1) {
            htmlGrandTotal = built.htmlGrandTotal;
            htmlGrandTotalWithVat = built.htmlGrandTotalWithVat;
        }
    });

    return {
        tableHtml: multiParts.join('\n'),
        htmlGrandTotal,
        htmlGrandTotalWithVat,
        multiOption: true,
    };
}

/** Remove all auto pricing tables + option wording paragraphs. */
export function stripEmsAutoPricingBlockFromHtml(html) {
    let rest = String(html || '');
    rest = rest.replace(
        /<table[^>]*(?:id=["']ems-auto-price-summary-table(?:--[^"']*)?["']|data-ems-pricing-cols=["']fixed["'])[^>]*>[\s\S]*?<\/table>\s*/gi,
        ''
    );
    rest = rest.replace(/<p[^>]*data-ems-price-wording=["'][^"']*["'][^>]*>[\s\S]*?<\/p>\s*/gi, '');
    return rest.trim();
}

export function mergeMultiOptionPricingTermsHtml(prevHtml, tableFullHtml, proseFallback, hasAutoTable) {
    const prev = String(prevHtml || '').trim();
    const block = String(tableFullHtml || '').trim();
    if (!block) return prev || String(proseFallback || '').trim();

    if (hasAutoTable(prev)) {
        let rest = stripEmsAutoPricingBlockFromHtml(prev);
        if (/data-ems-price-wording=/i.test(block)) {
            rest = rest
                .replace(/<p[^>]*>[\s\S]*?4\.1\.[\s\S]*?\bshall be\b[\s\S]*?<\/p>\s*/gi, '')
                .trim();
        }
        return `${block}\n${rest || String(proseFallback || '').trim()}`;
    }
    if (/^<table/i.test(prev)) {
        const rest = prev.replace(/^<table[\s\S]*?<\/table>\s*/i, '').trim();
        return `${block}\n${rest || String(proseFallback || '').trim()}`;
    }
    return `${block}\n${String(proseFallback || '').trim()}`;
}
