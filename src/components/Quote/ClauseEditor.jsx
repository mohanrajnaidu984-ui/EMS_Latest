import React, { useRef, useMemo, useEffect, useCallback } from 'react';
import JoditEditor from 'jodit-react';
import {
    registerClauseEditorListCommands,
    applyClauseEditorLineIndent,
    restoreClauseEditorFormatSelection,
    normalizeClauseListHtml,
    normalizeClauseListHtmlInString,
    registerClauseEditorExternalToolbarSelection,
    stripClauseEditorSpuriousBlankRows,
    clauseEditorHtmlContainsTable,
    isClauseEditorSelectionInTable,
    withJoditHistoryBlocked,
    withJoditHistoryBlockedAsync,
    rememberTableCellCaretBookmark,
    preserveClauseEditorSelectionDuring,
    isClauseEditorTypingActive,
    isCaretInEmptyClauseBlock,
    bindClauseEditorTypingCaretGuard,
    captureClauseEditorCaretOffset,
    restoreClauseEditorCaretOffset,
    EMS_UL_TOOLBAR_CONTROL,
    EMS_OL_TOOLBAR_CONTROL,
    CLAUSE_LIST_STYLES_CSS,
} from './clauseEditorListPresets';
import {
    bindTableCellHistoryRecorder,
    clearEmsTableCellHistory,
    canEmsTableCellHistoryUndo,
    canEmsTableCellHistoryRedo,
    installClauseEditorUndoHooks,
    bindClauseEditorUndoHotkeys,
    beginOfficePastePostProcess,
    checkpointHistoryAfterOfficePaste,
    bindOfficePasteHistoryGuard,
} from './clauseEditorTableHistory';
import { stripClauseEditorExportEmptyNodes, inlineBlobImagesInDomRoot, normalizeClauseProseTextColors } from './clauseEditorExportHtml';
import {
    harmonizeInsertedTableCells,
    stabilizeClauseEditorTablesForExport,
    initializeAllOfficePastedTableColumns,
    initializeAllEmsPricingSummaryTableColumns,
    initializeEmsPricingSummaryTableColumns,
    EMS_AUTO_PRICE_SUMMARY_TABLE_ID,
    EMS_OFFICE_PASTE_TABLE_EDITOR_CSS,
    isEmsPricingSummaryTable,
    initializeOfficePastedTableColumns,
    isTableStructureResizeActive,
    registerClauseEditorTableHooks,
    buildTableFormatToolbarControlOverrides,
    EMS_TABLE_REPEAT_HEADER_CONTROL,
    EMS_TABLE_BORDER_CONTROL,
    EMS_TABLE_VALIGN_CONTROL,
    inlineOfficeTableCellBorders,
    markOfficePasteTableBorders,
    finalizeOfficePasteTableFormatting,
    finalizeAllOfficePasteTablesFormatting,
    compactOfficePasteTableSpacing,
    applyTableRowHeightModel,
    applyAllTableRowHeightsInRoot,
    scheduleApplyAllTableRowHeightsInEditor,
    finalizeOfficePasteListFormatting,
    inlineOfficePasteRichTextFormatting,
    reinforceOfficeTableCellRichText,
    inlineExcelPasteFontColors,
    stripOfficePasteTableClassNames,
} from './clauseEditorTable';
import {
    EMS_FORECOLOR_CONTROL,
    EMS_BACKGROUND_CONTROL,
    EMS_BRUSH_CONTROL_HIDDEN,
    syncEmsToolbarColorIndicators,
} from './clauseEditorColorControls';
import { registerClauseEditorSpellcheck, stripSpellMarksFromHtml } from './clauseEditorSpellcheck';
import { registerClauseEditorImageResizerZoomSync } from './clauseEditorImageResizer';
import {
    EMS_CLAUSE_EDITOR_FONT_STACK,
    EMS_FONT_TOOLBAR_CONTROL,
    EMS_FONTSIZE_TOOLBAR_CONTROL,
} from './clauseEditorFontPresets';
import {
    buildClauseToolbarTooltipControls,
    registerClauseEditorExternalToolbarTooltips,
} from './clauseEditorToolbarTooltips';
import {
    registerEditableClauseHeadingSelectionHooks,
    tryApplyToolbarCommandToEditableClauseHeading,
} from './clauseEditorExternalHeading';
import {
    EMS_QUOTE_PRICING_TABLE_COLUMN_SYNC_CSS,
    EMS_QUOTE_PRICING_TABLE_PRESENTATION_CSS,
    EMS_QUOTE_PRICING_TABLE_COMPACT_ROW_CSS,
    EMS_QUOTE_PRICING_TABLE_TOTAL_BG,
    EMS_QUOTE_PRICING_TABLE_WIDTH,
} from '../../constants/emsTheme';

/**
 * Excel / Word pastes inflate table row heights because they ship:
 *   - inline `height` attribute or `style="height: ..."` on <tr>/<td>/<th>
 *   - multiple <p> tags per cell (which then hit the editor's `p + p { margin-top: 5px }` rule)
 *   - a trailing empty paragraph (e.g. <p><br></p> or <p>&nbsp;</p>) that takes a full line
 *   - Office-only `mso-*` line-height / margin styles on cell content
 * Both functions below strip those — once on the clipboard HTML string before Jodit
 * inserts it, and again on the live DOM as a safety net (Jodit / browser post-processing
 * sometimes re-applies inline styles a few hundred ms after the paste).
 */
/** Inline style props to strip from <tr>/<td>/<th>. We deliberately KEEP source padding / margin
 *  because Word and Excel set tight values (1–3pt) and our default editor CSS replaces them with
 *  0.4em — losing that data inflates row heights, which is exactly the bug we are fixing. */
const CELL_KILL_STYLE_PROPS = [
    'height',
    'min-height',
    'mso-line-height-alt',
    'mso-line-height-rule',
    'mso-margin-top-alt',
    'mso-margin-bottom-alt',
];

/** Stricter strip list for <p>/<div>/<li>/<span>/<font> *inside* cells — these inflate row heights
 *  via per-element margins / line-heights that the source did not actually want preserved. */
const CELL_CHILD_KILL_STYLE_PROPS = [
    'height',
    'min-height',
    'line-height',
    'margin-top',
    'margin-bottom',
    'padding-top',
    'padding-bottom',
    'mso-line-height-alt',
    'mso-line-height-rule',
    'mso-margin-top-alt',
    'mso-margin-bottom-alt',
];

const isCellEmptyOfText = (el) =>
    !el || !el.textContent || !el.textContent.replace(/\u00a0/g, '').trim();

const cellHasOnlyBrChild = (el) =>
    el && el.children && el.children.length === 1 && el.firstElementChild?.tagName === 'BR';

const cleanCellSpacingNodes = (cell) => {
    if (!cell) return;
    // Walk from the end and drop trailing empty <p>/<br> noise so Excel's terminator
    // paragraph (<p><br></p>) doesn't take a full line.
    let last = cell.lastElementChild;
    while (last) {
        const empty =
            isCellEmptyOfText(last) &&
            (last.tagName === 'BR' ||
                (last.tagName === 'P' && (last.children.length === 0 || cellHasOnlyBrChild(last))));
        if (!empty) break;
        const prev = last.previousElementSibling;
        last.remove();
        last = prev;
    }
    // If a cell now has a single empty <p>, collapse its inner <br> so the cell stays
    // editable without an extra line of height.
    if (cell.children.length === 1) {
        const only = cell.firstElementChild;
        if (only && only.tagName === 'P' && isCellEmptyOfText(only) && cellHasOnlyBrChild(only)) {
            /* Keep <br> so the caret has a visible target — empty <p></p> is hidden by CSS. */
            only.innerHTML = '<br>';
        }
    }
};

const OFFICE_PASTE_TABLE_ATTR = 'data-ems-paste-source';
const OFFICE_PASTE_TABLE_VALUE = 'office';

const OFFICE_STYLE_STRIP_RE = /mso-[a-z-]+:[^;]+;?/gi;

const OFFICE_CSS_PT_WIDTH = '(?:\\.\\d+|\\d+(?:\\.\\d+)?)';

const convertOfficeCssUnits = (css) =>
    String(css || '').replace(new RegExp(`(${OFFICE_CSS_PT_WIDTH})(pt|cm)`, 'gi'), (match, units, metrics) => {
        switch (String(metrics).toLowerCase()) {
            case 'pt':
                return `${(parseFloat(units) * 1.328).toFixed(2)}px`;
            case 'cm':
                return `${(parseFloat(units) * 37.7952755906).toFixed(2)}px`;
            default:
                return match;
        }
    });

const normalizeOfficeNamedColorsInCss = (css) =>
    String(css || '')
        .replace(/\bwindowtext\b/gi, '#000000')
        .replace(/\bwindowframe\b/gi, '#808080')
        .replace(/\bthreedshadow\b/gi, '#808080');

/** Excel/Word often encode borders only in mso-border-* — convert before stripping mso rules. */
const convertMsoFontColorProps = (css) => {
    let s = String(css || '');
    const fillMatch = s.match(/\bmso-style-textfill-fill-color\s*:\s*([^;]+)/i);
    const msoMatch = s.match(/\bmso-ansi-font-color\s*:\s*([^;]+)/i);
    const msoColor = (fillMatch?.[1] || msoMatch?.[1] || '').trim();
    if (!msoColor) return s;

    const isGenericOfficeColor = (c) => {
        const compact = String(c || '').replace(/\s/g, '').toLowerCase();
        return (
            !compact ||
            compact === 'windowtext' ||
            compact === 'windowframe' ||
            compact === 'auto' ||
            compact === 'inherit' ||
            compact === 'initial'
        );
    };

    const resolved = isGenericOfficeColor(msoColor) ? '' : msoColor;
    if (!resolved) return s;

    if (/\bcolor\s*:/i.test(s)) {
        const existing = (s.match(/\bcolor\s*:\s*([^;]+)/i)?.[1] || '').trim();
        if (isGenericOfficeColor(existing)) {
            s = s.replace(/\bcolor\s*:\s*[^;]+/i, `color:${resolved}`);
        }
    } else {
        s = `${s};color:${resolved}`;
    }
    return s;
};

const convertMsoBorderProps = (css) => {
    let s = String(css || '');
    const pt = OFFICE_CSS_PT_WIDTH;
    s = s.replace(
        new RegExp(`mso-border-alt\\s*:\\s*(\\w+)\\s+([\\w#]+)\\s+(${pt})pt`, 'gi'),
        (_, style, color, width) => `border:${width}pt ${style} ${color}`
    );
    s = s.replace(
        new RegExp(`mso-border-(top|right|bottom|left)-alt\\s*:\\s*(\\w+)\\s+([\\w#]+)\\s+(${pt})pt`, 'gi'),
        (_, side, style, color, width) => `border-${side}:${width}pt ${style} ${color}`
    );
    s = s.replace(
        new RegExp(`mso-border-(top|right|bottom|left)-alt\\s*:\\s*(${pt})pt\\s+(\\w+)\\s+([\\w#]+)`, 'gi'),
        (_, side, width, style, color) => `border-${side}:${width}pt ${style} ${color}`
    );
    // Excel inline order: border:solid windowtext 1.0pt;
    s = s.replace(
        new RegExp(`\\bborder\\s*:\\s*(\\w+)\\s+([\\w#]+)\\s+(${pt})pt`, 'gi'),
        (_, style, color, width) => `border:${width}pt ${style} ${color}`
    );
    s = s.replace(
        new RegExp(
            `\\bborder-(top|right|bottom|left)\\s*:\\s*(\\w+)\\s+([\\w#]+)\\s+(${pt})pt`,
            'gi'
        ),
        (_, side, style, color, width) => `border-${side}:${width}pt ${style} ${color}`
    );
    // Excel per-side order: border-right:.5pt solid windowtext;
    s = s.replace(
        new RegExp(`\\bborder-(top|right|bottom|left)\\s*:\\s*(${pt})pt\\s+(\\w+)\\s+([\\w#]+)`, 'gi'),
        (_, side, width, style, color) => `border-${side}:${width}pt ${style} ${color}`
    );
    return s;
};

const normalizeOfficeInlineCss = (css) =>
    normalizeOfficeNamedColorsInCss(
        convertOfficeCssUnits(
            convertMsoBorderProps(
                convertMsoFontColorProps(String(css || '')).replace(OFFICE_STYLE_STRIP_RE, '')
            )
        )
    );

/** Promote mso-ansi-font-color → color on every inline style before computed-style inlining. */
const normalizeOfficeInlineStylesInTree = (root) => {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('[style]').forEach((el) => {
        const style = el.getAttribute('style');
        if (!style) return;
        const normalized = normalizeOfficeInlineCss(style);
        if (normalized !== style) {
            el.setAttribute('style', normalized);
        }
    });
};

/** Excel wraps <style> rules in HTML comments — browsers ignore them unless unwrapped. */
const unwrapOfficeStyleBlockComments = (styleText) =>
    String(styleText || '')
        .replace(/<!--/g, '')
        .replace(/-->/g, '');

const parseOfficeClassCssRules = (styleText) => {
    const classRules = new Map();
    const cleaned = unwrapOfficeStyleBlockComments(styleText);
    const ingestRule = (cls, body) => {
        if (!cls || !body) return;
        const prev = classRules.get(cls) || '';
        const merged = `${prev};${body}`;
        classRules.set(cls, merged);
        classRules.set(cls.toLowerCase(), merged);
    };
    const dotRuleRe = /\.([a-zA-Z][\w-]*)\s*\{([^}]*)\}/g;
    let match = dotRuleRe.exec(cleaned);
    while (match) {
        ingestRule(match[1], match[2]);
        match = dotRuleRe.exec(cleaned);
    }
    // Excel also emits compound selectors like `td.xl65 { color:red }`.
    const compoundRuleRe = /[a-zA-Z][\w-]*\.([a-zA-Z][\w-]*)\s*\{([^}]*)\}/g;
    match = compoundRuleRe.exec(cleaned);
    while (match) {
        ingestRule(match[1], match[2]);
        match = compoundRuleRe.exec(cleaned);
    }
    return classRules;
};

const extractOfficeHtmlFragment = (html) => {
    let s = String(html || '');
    const start = s.search(/<!--StartFragment-->/i);
    if (start !== -1) s = s.substring(start + '<!--StartFragment-->'.length);
    const end = s.search(/<!--EndFragment-->/i);
    if (end !== -1) s = s.substring(0, end);
    return s.trim();
};

const extractStyleBlocksFromOfficeHtml = (html) => {
    const styles = [];
    const source = String(html || '');
    const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    let match = re.exec(source);
    while (match) {
        styles.push(match[1]);
        match = re.exec(source);
    }
    return styles.join('\n');
};

/** Excel Online / OneDrive may drop <style> tags but keep commented CSS in the clipboard HTML. */
const extractOfficeCssFromRawHtml = (html) => {
    const fromStyleTags = extractStyleBlocksFromOfficeHtml(html);
    if (fromStyleTags.trim()) return fromStyleTags;
    const source = String(html || '');
    const blocks = source.match(/<!--([\s\S]*?)-->/g) || [];
    return blocks
        .map((block) => block.replace(/^<!--|-->$/g, ''))
        .filter((block) => /\.[a-zA-Z][\w-]*\s*\{|\bborder[-:]/i.test(block))
        .join('\n');
};

const isExcelClipboardHtml = (html) => {
    const s = String(html || '');
    if (!s) return false;
    if (/Excel\.Sheet|ProgId\s+content\s*=\s*["']?Excel\.Sheet|schemas-microsoft-com:office:excel/i.test(s)) {
        return true;
    }
    if (/xmlns:x=["'][^"']*office:excel/i.test(s)) return true;
    if (/\bclass\s*=\s*["']?xl\d+/i.test(s)) return true;
    if (/\bsdval\s*=|\bsdnum\s*=/i.test(s) && /<t[dh][\s>]/i.test(s)) return true;
    return false;
};

const buildOfficePreviewDocumentHtml = (html) => {
    const raw = String(html || '').trim();
    if (!raw) return '';
    const styleText = extractOfficeCssFromRawHtml(raw);
    const unwrappedStyle = styleText.trim()
        ? `<style data-ems-office-paste="1">${unwrapOfficeStyleBlockComments(styleText)}</style>`
        : '';
    if (/<html[\s>]/i.test(raw)) {
        if (!unwrappedStyle) return raw;
        if (/<\/head>/i.test(raw)) {
            return raw.replace(/<\/head>/i, `${unwrappedStyle}</head>`);
        }
        return raw.replace(/<body[\s>]/i, `${unwrappedStyle}<body>`);
    }
    const fragment = extractOfficeHtmlFragment(raw) || raw;
    return `<!DOCTYPE html><html><head>${unwrappedStyle}</head><body>${fragment}</body></html>`;
};

/** True when clipboard body has headings, lists, or paragraphs besides table(s). */
const pasteRootHasNonTableContent = (root) => {
    if (!root?.childNodes) return false;
    for (const node of root.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
            if (String(node.textContent || '').replace(/\u00a0/g, ' ').trim()) return true;
            continue;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const el = /** @type {Element} */ (node);
        if (/^TABLE$/i.test(el.tagName)) continue;
        if (/^(STYLE|META|LINK|COL|O:P)$/i.test(el.tagName)) continue;
        const text = String(el.textContent || '').replace(/\u00a0/g, ' ').trim();
        if (text) return true;
    }
    return false;
};

/** Copy rendered Excel/Word styles onto inline style attributes (colors, borders, fonts, merges). */
const OFFICE_INLINE_STYLE_PROPS = [
    'background',
    'background-color',
    'color',
    'font-size',
    'font-family',
    'font-weight',
    'font-style',
    'text-align',
    'vertical-align',
    'text-decoration',
    'border',
    'border-top',
    'border-right',
    'border-bottom',
    'border-left',
    'padding',
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left',
    'width',
    'height',
];

const OFFICE_PASTE_INLINE_SELECTORS =
    'p, span, font, div, li, h1, h2, h3, h4, h5, h6, td, th, tr, table';

/** Prefer pt in inline font-size so toolbar matches Word and pasted content. */
const normalizePastedFontSizeToPt = (el) => {
    if (!el?.style?.fontSize) return;
    const match = String(el.style.fontSize).trim().match(/^([\d.]+)(px|pt)$/i);
    if (!match) return;
    const num = parseFloat(match[1]);
    if (!Number.isFinite(num)) return;
    if (match[2].toLowerCase() === 'px') {
        el.style.fontSize = `${Math.round(num * 0.75 * 2) / 2}pt`;
    }
};

const preservePastedFontStyles = (root) => {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('[style*="font-size"], [style*="font-family"]').forEach((el) => {
        normalizePastedFontSizeToPt(el);
    });
};

/** Keep Word/Excel inline color, bold, and legacy <font> tags after list/table conversion. */
const preservePastedOfficeFormatting = (root) => {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('font[color]').forEach((font) => {
        const c = font.getAttribute('color');
        if (c) font.style.setProperty('color', c, 'important');
        font.removeAttribute('color');
    });
    root.querySelectorAll('span[style], font[style], p[style], li[style]').forEach((el) => {
        normalizePastedFontSizeToPt(el);
        const color = (el.style.getPropertyValue('color') || '').trim();
        if (color && color !== 'windowtext') {
            el.style.setProperty('color', color, 'important');
        }
        const weight = (el.style.getPropertyValue('font-weight') || '').trim();
        if (weight && weight !== 'normal' && weight !== '400') {
            el.style.setProperty('font-weight', weight, 'important');
        }
        const fontStyle = (el.style.getPropertyValue('font-style') || '').trim();
        if (fontStyle && fontStyle !== 'normal') {
            el.style.setProperty('font-style', fontStyle, 'important');
        }
        const deco = (el.style.getPropertyValue('text-decoration') || '').trim();
        if (deco && deco !== 'none') {
            el.style.setProperty('text-decoration', deco, 'important');
        }
    });
};

const forceOfficeDocumentStyleReflow = (doc, win) => {
    if (!doc?.body) return;
    try {
        void doc.body.offsetHeight;
        win?.getComputedStyle?.(doc.body);
        [...(doc.styleSheets || [])].forEach((sheet) => {
            try {
                [...(sheet.cssRules || [])];
            } catch {
                /* ignore */
            }
        });
    } catch {
        /* ignore */
    }
};

const mergeCssDeclarations = (el, cssText) => {
    if (!el?.style || !cssText) return;
    normalizeOfficeInlineCss(String(cssText))
        .split(';')
        .forEach((pair) => {
            const idx = pair.indexOf(':');
            if (idx < 0) return;
            const prop = pair.slice(0, idx).trim();
            const val = pair.slice(idx + 1).trim();
            if (prop && val) el.style.setProperty(prop, val);
        });
};

const normalizeOfficeTableCellInlineStyles = (doc) => {
    if (!doc?.querySelectorAll) return;
    doc.querySelectorAll('table td, table th').forEach((cell) => {
        const style = cell.getAttribute('style');
        if (!style) return;
        cell.setAttribute('style', normalizeOfficeInlineCss(style));
    });
};

const applyOfficeClassRulesFromCssText = (doc, styleText) => {
    if (!doc?.querySelectorAll || !styleText?.trim()) return false;
    const classRules = parseOfficeClassCssRules(styleText);
    if (!classRules.size) return false;
    doc.querySelectorAll('[class]').forEach((el) => {
        [...el.classList].forEach((cls) => {
            const decl = classRules.get(cls) || classRules.get(String(cls).toLowerCase());
            if (decl) mergeCssDeclarations(el, decl);
        });
    });
    doc.querySelectorAll('table td[align], table th[align]').forEach((cell) => {
        const align = cell.getAttribute('align');
        if (align) cell.style.setProperty('text-align', align);
    });
    doc.querySelectorAll('table td[valign], table th[valign]').forEach((cell) => {
        const valign = cell.getAttribute('valign');
        if (valign) cell.style.setProperty('vertical-align', valign);
    });
    return true;
};

/** Merge Excel class rules from raw clipboard HTML (styles often live outside the table fragment). */
const applyOfficeStylesFromRawHtml = (rawHtml, doc) => {
    if (!doc?.querySelectorAll) return;
    normalizeOfficeTableCellInlineStyles(doc);
    const cssText = extractOfficeCssFromRawHtml(rawHtml);
    if (cssText.trim()) {
        applyOfficeClassRulesFromCssText(doc, cssText);
    }
    const docStyleText = [...doc.querySelectorAll('style')]
        .map((node) => node.textContent || '')
        .join('\n');
    if (docStyleText.trim()) {
        applyOfficeClassRulesFromCssText(doc, docStyleText);
    }
    normalizeOfficeTableCellInlineStyles(doc);
};

/** Excel/Word put colors, fonts, and borders in <style> class rules — inline before classes are stripped. */
const applyExcelClassRulesToTables = (doc, rawHtml) => {
    if (!doc?.querySelectorAll) return;
    if (rawHtml) {
        applyOfficeStylesFromRawHtml(rawHtml, doc);
        return;
    }
    normalizeOfficeTableCellInlineStyles(doc);
    const styleText = [...doc.querySelectorAll('style')]
        .map((node) => node.textContent || '')
        .join('\n');
    applyOfficeClassRulesFromCssText(doc, styleText);
    normalizeOfficeTableCellInlineStyles(doc);
};

const OFFICE_PROMOTE_STYLE_PROPS = [
    'background-color',
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'text-align',
    'vertical-align',
    'text-decoration',
];

/** Nested Excel spans often ignore cell fill/font — copy resolved cell styles down. */
const promoteOfficePasteCellStyles = (root) => {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('table[data-ems-paste-source="office"] td, table[data-ems-paste-source="office"] th, table.ems-office-paste-table td, table.ems-office-paste-table th').forEach((cell) => {
        const bgAttr = cell.getAttribute('bgcolor');
        if (bgAttr && !cell.style.backgroundColor) {
            cell.style.backgroundColor = bgAttr;
        }
        cell.querySelectorAll('font[color]').forEach((font) => {
            const c = font.getAttribute('color');
            if (c) font.style.setProperty('color', c);
            font.removeAttribute('color');
        });
        OFFICE_PROMOTE_STYLE_PROPS.forEach((prop) => {
            const cellVal = cell.style.getPropertyValue(prop);
            if (!cellVal) return;
            cell.querySelectorAll('span, p, div, font, li, b, strong, i, em, u').forEach((child) => {
                const childVal = (child.style.getPropertyValue(prop) || '').trim().toLowerCase();
                if (officeChildShouldKeepStyle(prop, childVal, cellVal)) return;
                if (
                    !childVal ||
                    childVal === 'windowtext' ||
                    childVal === 'windowframe' ||
                    (prop === 'color' && childVal === 'black' && cellVal.toLowerCase() !== 'black')
                ) {
                    child.style.setProperty(prop, cellVal);
                }
            });
        });
        normalizePastedFontSizeToPt(cell);
        cell.querySelectorAll('[style*="font-size"]').forEach((el) => normalizePastedFontSizeToPt(el));
    });
};

const inlineComputedOfficePasteStyles = (doc, win) => {
    if (!doc?.body || !win?.getComputedStyle) return;
    doc.body.querySelectorAll(OFFICE_PASTE_INLINE_SELECTORS).forEach((el) => {
        const computed = win.getComputedStyle(el);
        const tag = el.tagName || '';
        const inTableCell = Boolean(el.closest?.('td, th'));
        const isRowOrCell = /^(TR|TD|TH)$/i.test(tag);
        const parts = [];
        OFFICE_INLINE_STYLE_PROPS.forEach((prop) => {
            if (
                (isRowOrCell || inTableCell) &&
                (prop === 'height' ||
                    prop === 'min-height' ||
                    prop.startsWith('padding') ||
                    prop === 'line-height')
            ) {
                return;
            }
            let val = computed.getPropertyValue(prop);
            if (!val) return;
            val = val.trim();
            if (!val || val === 'initial' || val === 'auto' || val === 'normal' || val === '0px') return;
            if (prop.includes('border') && /none/i.test(val)) return;
            if (prop === 'background-color' && (val === 'rgba(0, 0, 0, 0)' || val === 'transparent')) return;
            if (prop === 'color') {
                const compact = val.replace(/\s/g, '').toLowerCase();
                if (
                    compact === 'rgb(0,0,0)' ||
                    compact === '#000000' ||
                    compact === '#000' ||
                    compact === 'black' ||
                    compact === 'windowtext'
                ) {
                    return;
                }
            }
            parts.push(`${prop}:${val}`);
        });
        if (parts.length) {
            const existing = el.getAttribute('style') || '';
            el.setAttribute('style', normalizeOfficeInlineCss(`${parts.join(';')};${existing}`));
        }
        normalizePastedFontSizeToPt(el);
    });
};

/** Word often copies bulleted lists as a 2-column table (marker | text). Detect and convert to <ul>/<ol>. */
const OFFICE_LIST_MARKER_ONLY_RE =
    /^[\s\u00a0]*(?:[\u2022●○■➤◆▪▸►·o\-\-*•]|\d+[\.\)]|[a-z][\.\)]|[ivxlcdm]+[\.\)])\s*$/i;

const OFFICE_LIST_MARKER_PREFIX_RE =
    /^\s*(?:[\u2022●○■➤◆▪▸►·o\-\-*•]|\d+[\.\)]\s*|[a-z][\.\)]\s*|[ivxlcdm]+[\.\)]\s*)/i;

const officeListCellPlainText = (cell) =>
    String(cell?.textContent || '').replace(/\u00a0/g, ' ').trim();

/** Excel grids use multiple tab columns per row; Word list lines use at most one tab (bullet + text). */
const plainTextLooksLikeExcelGrid = (plain) =>
    String(plain || '')
        .split(/\r?\n/)
        .some((line) => (line.match(/\t/g) || []).length > 1);

const isOfficeListMarkerOnly = (text) =>
    OFFICE_LIST_MARKER_ONLY_RE.test(String(text || '').trim());

const cellLooksLikeBulletMarker = (cell) => {
    if (!cell) return false;
    const text = officeListCellPlainText(cell);
    if (isOfficeListMarkerOnly(text)) return true;
    const html = String(cell.innerHTML || '');
    if (/font-family:\s*Symbol|font-family:\s*Wingdings|mso-bidi-font-family:\s*Symbol/i.test(html)) {
        return true;
    }
    const single = text.replace(/\u00a0/g, '').trim();
    if (single.length === 1 && !/[a-zA-Z0-9]/.test(single)) return true;
    return false;
};

const isNarrowOfficeListGutterCell = (cell) => {
    if (!cell) return false;
    const text = officeListCellPlainText(cell);
    if (text.length > 4) return false;
    const widthAttr = cell.getAttribute('width');
    if (widthAttr && parseFloat(widthAttr) > 0 && parseFloat(widthAttr) <= 48) return true;
    const style = String(cell.getAttribute('style') || '');
    const widthMatch = style.match(/(?:^|;)\s*width:\s*([^;]+)/i);
    if (widthMatch) {
        const px = parseFloat(widthMatch[1]);
        if (px > 0 && px <= 48) return true;
    }
    return !text;
};

const isOfficePseudoListTable = (table, { plainText = '' } = {}) => {
    if (!table || table.nodeName !== 'TABLE') return false;
    if (table.id === 'ems-auto-price-summary-table') return false;
    if (table.classList?.contains?.('ems-pricing-summary-table')) return false;
    if (isEmsPricingSummaryTable(table)) return false;
    if (plainText && plainTextLooksLikeExcelGrid(plainText)) return false;

    const rows = [...table.rows].filter((r) => r.cells?.length > 0);
    if (!rows.length) return false;

    let markerRows = 0;
    let eligible = 0;

    for (const row of rows) {
        const cells = [...row.cells];
        if (!cells.length || cells.length > 2) return false;
        if (
            cells.some((c) => {
                const colspan = parseInt(c.getAttribute('colspan') || '1', 10);
                const rowspan = parseInt(c.getAttribute('rowspan') || '1', 10);
                return colspan > 1 || rowspan > 1;
            })
        ) {
            return false;
        }

        eligible += 1;
        if (cells.length === 2) {
            const body = officeListCellPlainText(cells[1]);
            if (!body) continue;
            const col0Marker = cellLooksLikeBulletMarker(cells[0]);
            const gutter = isNarrowOfficeListGutterCell(cells[0]);
            const bodyHasPrefix = OFFICE_LIST_MARKER_PREFIX_RE.test(body);
            if (col0Marker || gutter || bodyHasPrefix) markerRows += 1;
            continue;
        }
        const body = officeListCellPlainText(cells[0]);
        if (body && OFFICE_LIST_MARKER_PREFIX_RE.test(body)) markerRows += 1;
    }

    if (eligible === 0) return false;
    if (markerRows < Math.max(1, Math.ceil(eligible * 0.6))) return false;

    const maxCols = Math.max(...rows.map((r) => r.cells.length));
    return maxCols <= 2;
};

const extractOfficeListCellBodyHtml = (cell) => {
    const clone = cell.cloneNode(true);
    clone.querySelectorAll?.('o\\:p').forEach((el) => {
        if (!String(el.textContent || '').replace(/\u00a0/g, ' ').trim()) el.remove();
    });
    let html = clone.innerHTML.trim();
    if (!html) return officeListCellPlainText(cell);
    const singleP = html.match(/^<p[^>]*>([\s\S]*)<\/p>$/i);
    if (singleP) html = singleP[1].trim();
    return html || officeListCellPlainText(cell);
};

const EMS_CLEAN_HTML_FILTER_KEYS = new Set([
    'allowAttributes',
    'convertUnsafeEmbeds',
    'fillEmptyParagraph',
    'removeEmptyTextNode',
    'removeInvTextNodes',
    'replaceOldTags',
    'safeLinksTarget',
    'sandboxIframesInContent',
    'sanitizeAttributes',
    'sanitizeStyles',
    'tryRemoveNode',
]);

const isOfficePasteInsertHtml = (html) =>
    typeof html === 'string' &&
    (html.includes(`data-ems-paste-source="${OFFICE_PASTE_TABLE_VALUE}"`) ||
        html.includes('ems-office-paste-table') ||
        html.includes('data-ems-excel-paste') ||
        html.includes('ems-num-decimal') ||
        html.includes('ems-bullet-disc') ||
        /Word\.Document|schemas-microsoft-com:office|mso-|class\s*=\s*["']?Mso/i.test(html));

const enableOfficePasteInsertGuard = (jodit) => {
    if (!jodit || jodit.__emsOfficePasteGuardActive) return;
    jodit.__emsOfficePasteGuardActive = true;
    jodit.__emsOfficePasteLock = true;
    beginOfficePastePostProcess(jodit);
    jodit.__emsOfficePasteInsertPrevFilters = jodit.o?.cleanHTML?.disableCleanFilter ?? null;
    if (jodit.o?.cleanHTML) {
        jodit.o.cleanHTML.disableCleanFilter = EMS_CLEAN_HTML_FILTER_KEYS;
    }
};

const disableOfficePasteInsertGuard = (jodit) => {
    if (!jodit?.__emsOfficePasteGuardActive) return;
    jodit.__emsOfficePasteGuardActive = false;
    if (jodit.o?.cleanHTML) {
        jodit.o.cleanHTML.disableCleanFilter = jodit.__emsOfficePasteInsertPrevFilters ?? null;
    }
    jodit.__emsOfficePasteLock = false;
};

const withOfficePasteInsertGuard = (jodit, fn) => {
    if (!jodit) return;
    enableOfficePasteInsertGuard(jodit);
    try {
        fn();
    } finally {
        window.setTimeout(() => disableOfficePasteInsertGuard(jodit), 800);
    }
};

const officeChildShouldKeepStyle = (prop, childVal, cellVal) => {
    if (!childVal || childVal === 'windowtext' || childVal === 'windowframe') return false;
    if (prop === 'color') {
        const childNorm = childVal.replace(/\s/g, '').toLowerCase();
        const cellNorm = String(cellVal || '')
            .replace(/\s/g, '')
            .toLowerCase();
        if (
            childNorm !== cellNorm &&
            childNorm !== 'rgb(0,0,0)' &&
            childNorm !== '#000000' &&
            childNorm !== '#000' &&
            childNorm !== 'black'
        ) {
            return true;
        }
        return childNorm === 'black' && cellNorm !== 'black';
    }
    if (prop === 'font-weight') {
        const n = parseInt(childVal, 10);
        if (Number.isFinite(n) && n >= 600) return true;
        return /bold/i.test(childVal);
    }
    if (prop === 'font-style' && childVal !== 'normal') return true;
    if (prop === 'text-decoration' && childVal !== 'none') return true;
    return false;
};

const officePasteFirstTextNode = (root) => {
    if (!root) return null;
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    return walker.nextNode();
};

const stripOfficeListMarkerFromLi = (li) => {
    const firstText = officePasteFirstTextNode(li);
    if (!firstText) return;
    const next = firstText.textContent
        .replace(OFFICE_LIST_MARKER_PREFIX_RE, '')
        .replace(OFFICE_LIST_MARKER_ONLY_RE, '')
        .replace(/^\s+/, '');
    if (next !== firstText.textContent) firstText.textContent = next;
};

const reinforceOfficeRichTextOnNode = (root) => {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('font[color]').forEach((font) => {
        const c = font.getAttribute('color');
        if (c) {
            font.style.setProperty('color', c, 'important');
            font.removeAttribute('color');
        }
    });
    root.querySelectorAll('b, strong').forEach((el) => {
        el.style.setProperty('font-weight', '700', 'important');
    });
    root.querySelectorAll('i, em').forEach((el) => {
        el.style.setProperty('font-style', 'italic', 'important');
    });
    root.querySelectorAll('u').forEach((el) => {
        el.style.setProperty('text-decoration', 'underline', 'important');
    });
    root.querySelectorAll('[style*="color"], [style*="font-weight"]').forEach((el) => {
        const color = (el.style.getPropertyValue('color') || '').trim();
        if (color && color !== 'windowtext') {
            el.style.setProperty('color', color, 'important');
        }
        const weight = (el.style.getPropertyValue('font-weight') || '').trim();
        if (weight && weight !== 'normal' && weight !== '400') {
            el.style.setProperty('font-weight', weight, 'important');
        }
    });
};

const cloneOfficeCellContentIntoLi = (contentCell, li) => {
    if (!contentCell || !li) return;
    const nodes = [...contentCell.childNodes];
    const appendCloned = (node) => {
        if (node.nodeType === 3) {
            if (String(node.textContent || '').replace(/\u00a0/g, '').trim()) {
                li.appendChild(node.cloneNode(true));
            }
            return;
        }
        if (node.nodeType !== 1) return;
        li.appendChild(node.cloneNode(true));
    };
    if (nodes.length === 1 && nodes[0].nodeType === 1 && nodes[0].tagName === 'P') {
        [...nodes[0].childNodes].forEach(appendCloned);
    } else {
        nodes.forEach(appendCloned);
    }
    stripOfficeListMarkerFromLi(li);
    reinforceOfficeRichTextOnNode(li);
};

const convertOfficePseudoTableToListDom = (table, doc, plain = '') => {
    if (!table || !doc) return null;
    const rows = [...table.rows].filter((r) => r.cells?.length > 0);
    if (!rows.length) return null;

    let numbered = 0;
    let bulleted = 0;
    rows.forEach((row) => {
        const cells = [...row.cells];
        if (cells.length === 2) {
            const marker = officeListCellPlainText(cells[0]);
            if (/^\d+[\.\)]/.test(marker)) numbered += 1;
            else bulleted += 1;
            return;
        }
        const body = officeListCellPlainText(cells[0]);
        if (/^\d+[\.\)]/.test(body)) numbered += 1;
        else bulleted += 1;
    });

    const useOrdered = numbered > bulleted;
    const list = doc.createElement(useOrdered ? 'ol' : 'ul');
    list.className = useOrdered ? 'ems-num-decimal' : 'ems-bullet-disc';

    rows.forEach((row) => {
        const cells = [...row.cells];
        const contentCell = cells.length === 2 ? cells[1] : cells[0];
        if (!contentCell || !officeListCellPlainText(contentCell)) return;
        const li = doc.createElement('li');
        cloneOfficeCellContentIntoLi(contentCell, li);
        if (!String(li.textContent || '').replace(/\u00a0/g, ' ').trim()) return;
        list.appendChild(li);
    });

    if (!list.querySelector('li')) return null;
    normalizeClauseListHtml(list);
    return list;
};

/**
 * Render Word clipboard HTML in a hidden iframe, inline all formatting, return <ul>/<ol> HTML.
 * Clones live DOM nodes (not innerHTML strings) so colors/bold survive list conversion.
 */
const buildOfficeFormattedHtmlFromClipboard = (htmlRaw, plain = '') => {
    const raw = String(htmlRaw || '').trim();
    if (!raw || typeof document === 'undefined') return '';
    if (plainTextLooksLikeExcelGrid(plain)) return '';
    if (/Excel\.Sheet/i.test(raw)) return '';

    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText =
        'position:fixed;left:-9999px;top:0;width:900px;height:600px;opacity:0;pointer-events:none';
    document.body.appendChild(iframe);

    let result = '';
    try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        const win = iframe.contentWindow;
        if (!iframeDoc || !win) return '';
        iframeDoc.open();
        iframeDoc.write(buildOfficePreviewDocumentHtml(raw));
        iframeDoc.close();
        normalizeOfficeInlineStylesInTree(iframeDoc.body);
        applyOfficeStylesFromRawHtml(raw, iframeDoc);
        forceOfficeDocumentStyleReflow(iframeDoc, win);
        applyExcelClassRulesToTables(iframeDoc, raw);
        inlineComputedOfficePasteStyles(iframeDoc, win);

        const table = findOfficePseudoListTableInRoot(iframeDoc.body, plain);
        if (table) {
            finalizeOfficePasteTableFormatting(table, win);
            table.querySelectorAll('td, th').forEach((cell) => {
                inlineOfficePasteRichTextFormatting(cell, win);
            });
            reinforceOfficeTableCellRichText(table);
            const list = convertOfficePseudoTableToListDom(table, iframeDoc, plain);
            if (list) {
                reinforceOfficeRichTextOnNode(list);
                result = list.outerHTML;
            }
        } else {
            const nativeLists = [...iframeDoc.body.querySelectorAll('ul, ol')];
            if (nativeLists.length === 1) {
                const list = nativeLists[0];
                inlineOfficePasteRichTextFormatting(list, win);
                list.querySelectorAll('li').forEach((li) => {
                    reinforceOfficeRichTextOnNode(li);
                });
                if (list.tagName === 'OL') {
                    list.className = 'ems-num-decimal';
                } else if (![...list.classList].some((c) => c.startsWith('ems-bullet-'))) {
                    list.className = 'ems-bullet-disc';
                }
                normalizeClauseListHtml(list);
                result = list.outerHTML;
            } else if (/Word\.Document|mso-|schemas-microsoft-com:office:word/i.test(raw)) {
                inlineOfficePasteRichTextFormatting(iframeDoc.body, win);
                reinforceOfficeRichTextOnNode(iframeDoc.body);
                result = iframeDoc.body.innerHTML.trim();
            }
        }
    } catch (_e) {
        result = '';
    } finally {
        iframe.remove();
    }
    return result;
};

const parseStyledOfficeListClipboard = (htmlRaw, plain = '') => {
    const listHtml = buildOfficeFormattedHtmlFromClipboard(htmlRaw, plain);
    if (!listHtml || /<table[\s>]/i.test(listHtml)) return null;
    let doc;
    try {
        doc = new DOMParser().parseFromString(
            `<div id="__ems_word_list_root">${listHtml}</div>`,
            'text/html'
        );
    } catch (_e) {
        return null;
    }
    const root = doc.getElementById('__ems_word_list_root');
    if (!root) return null;
    return { doc, root, win: null };
};

const findOfficePseudoListTableInRoot = (root, plain = '') => {
    if (!root?.querySelectorAll) return null;
    const tables = [...root.querySelectorAll('table')];
    if (!tables.length) return null;
    return tables.reduce((best, candidate) => {
        if (!isOfficePseudoListTable(candidate, { plainText: plain })) return best;
        const rows = candidate.rows?.length || 0;
        const bestRows = best?.rows?.length || 0;
        return rows > bestRows ? candidate : best;
    }, null);
};

const convertOfficePseudoListTableToHtmlListWithStyles = (table, doc, win) => {
    const listHtml = convertOfficePseudoListTableToHtmlList(table, doc);
    if (!listHtml || /<table[\s>]/i.test(listHtml)) return listHtml;
    if (!win || typeof document === 'undefined') return listHtml;
    const holder = document.createElement('div');
    holder.innerHTML = listHtml;
    const list = holder.firstElementChild;
    if (list) {
        finalizeOfficePasteListFormatting(list, win);
    }
    return list ? list.outerHTML : listHtml;
};

const convertOfficePseudoListTableToHtmlList = (table, doc) => {
    const ownerDoc = doc || table.ownerDocument || document;
    const rows = [...table.rows].filter((r) => r.cells?.length > 0);

    let numbered = 0;
    let bulleted = 0;
    const rowData = rows.map((row) => {
        const cells = [...row.cells];
        if (cells.length === 2) {
            const marker = officeListCellPlainText(cells[0]);
            if (/^\d+[\.\)]/.test(marker)) numbered += 1;
            else bulleted += 1;
            return extractOfficeListCellBodyHtml(cells[1]);
        }
        const plain = officeListCellPlainText(cells[0]);
        if (/^\d+[\.\)]/.test(plain)) numbered += 1;
        else bulleted += 1;
        const html = extractOfficeListCellBodyHtml(cells[0]);
        if (/<[a-z][\s>]/i.test(html)) return html;
        const plainStripped = plain.replace(OFFICE_LIST_MARKER_PREFIX_RE, '').trim();
        return plainStripped || html;
    });

    const useOrdered = numbered > bulleted;
    const list = ownerDoc.createElement(useOrdered ? 'ol' : 'ul');
    list.className = useOrdered ? 'ems-num-decimal' : 'ems-bullet-disc';

    rowData.forEach((html) => {
        const t = String(html || '').trim();
        if (!t) return;
        const li = ownerDoc.createElement('li');
        li.innerHTML = t;
        list.appendChild(li);
    });

    if (!list.querySelector('li')) return table.outerHTML;
    normalizeClauseListHtml(list);
    return list.outerHTML;
};

const replaceOfficePseudoListTablesInRoot = (root, doc) => {
    if (!root?.querySelectorAll) return;
    [...root.querySelectorAll('table')].forEach((table) => {
        if (!isOfficePseudoListTable(table)) return;
        const listHtml = convertOfficePseudoListTableToHtmlList(table, doc || root.ownerDocument);
        const temp = (doc || root.ownerDocument).createElement('div');
        temp.innerHTML = listHtml;
        const listEl = temp.firstElementChild;
        if (listEl) table.replaceWith(listEl);
    });
};

const maybeConvertPastedTableHtmlToList = (html, plain = '') => {
    if (!html || !/<table[\s>]/i.test(html)) return html;
    if (plainTextLooksLikeExcelGrid(plain)) return html;
    try {
        const guardDoc = new DOMParser().parseFromString(
            `<div id="__ems_list_paste_guard">${html}</div>`,
            'text/html'
        );
        const guardRoot = guardDoc.getElementById('__ems_list_paste_guard');
        if (guardRoot && pasteRootHasNonTableContent(guardRoot)) return html;
    } catch (_e) {
        /* continue */
    }
    const parsed = /<table[\s>]/i.test(html) && !/data-ems-paste-source/i.test(html)
        ? parseStyledOfficeListClipboard(html, plain)
        : null;
    let doc;
    let table;
    let styleWin = null;
    if (parsed) {
        doc = parsed.doc;
        styleWin = parsed.win;
        table = findOfficePseudoListTableInRoot(parsed.root, plain);
    }
    if (!table) {
        try {
            doc = new DOMParser().parseFromString(
                `<div id="__ems_list_paste_root">${html}</div>`,
                'text/html'
            );
        } catch (_e) {
            return html;
        }
        const root = doc.getElementById('__ems_list_paste_root');
        table = findOfficePseudoListTableInRoot(root, plain);
    }
    if (!table) return html;
    const listHtml = convertOfficePseudoListTableToHtmlListWithStyles(table, doc, styleWin);
    return listHtml && !/<table[\s>]/i.test(listHtml) ? listHtml : html;
};

/**
 * Word copies bulleted lists as HTML tables. Convert before the office-table paste path runs.
 * Does not call applyOfficeClipboardHtml / extractOfficeTableHtmlFromClipboard.
 */
const tryConvertWordListClipboard = (dataTransfer) => {
    if (!dataTransfer) return '';
    const htmlRaw = String(dataTransfer.getData?.('text/html') || '').trim();
    const plain = String(dataTransfer.getData?.('text/plain') || '');
    if (!htmlRaw) return '';
    if (plainTextLooksLikeExcelGrid(plain)) return '';
    if (/Excel\.Sheet/i.test(htmlRaw)) return '';
    const listHtml = buildOfficeFormattedHtmlFromClipboard(htmlRaw, plain);
    return listHtml && !/<table[\s>]/i.test(listHtml) ? listHtml : '';
};

const insertWordListHtmlIntoEditor = (jodit, html, e, cleanupAfterPaste) => {
    if (!isJoditAlive(jodit) || !html?.trim()) return false;
    e?.preventDefault?.();
    e?.stopImmediatePropagation?.();
    try {
        withOfficePasteInsertGuard(jodit, () => {
            withJoditHistoryBlocked(jodit, () => {
                jodit.s.focus();
                jodit.s.insertHTML(html);
                if (typeof jodit.synchronizeValues === 'function') {
                    jodit.synchronizeValues();
                }
            });
            jodit.e?.fire?.('afterPaste', e);
        });
    } catch (_err) {
        return false;
    }
    return true;
};

/** Apply Excel/Word styles using the full clipboard document (styles live in <head>, not the fragment). */
const applyOfficeClipboardHtml = (html, options = {}) => {
    const raw = String(html || '').trim();
    const plainText = String(options.plainText || '');
    if (!raw || !/<[a-z][\s>]/i.test(raw)) return raw;
    if (typeof document === 'undefined') return raw;

    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:900px;height:600px;opacity:0;pointer-events:none';
    document.body.appendChild(iframe);

    try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        const iframeWin = iframe.contentWindow;
        if (!iframeDoc || !iframeWin) return raw;

        iframeDoc.open();
        iframeDoc.write(buildOfficePreviewDocumentHtml(raw));
        iframeDoc.close();

        normalizeOfficeInlineStylesInTree(iframeDoc.body);
        applyOfficeStylesFromRawHtml(raw, iframeDoc);

        const isWordPaste = /Word\.Document|ProgId\s+content\s*=\s*["']?Word\.Document/i.test(raw);
        const isExcelPaste =
            !isWordPaste &&
            (isExcelClipboardHtml(raw) || plainTextLooksLikeExcelGrid(plainText));

        forceOfficeDocumentStyleReflow(iframeDoc, iframeWin);
        applyExcelClassRulesToTables(iframeDoc, raw);
        inlineComputedOfficePasteStyles(iframeDoc, iframeWin);
        applyExcelClassRulesToTables(iframeDoc, raw);
        promoteOfficePasteCellStyles(iframeDoc.body);

        iframeDoc.body.querySelectorAll('[bgcolor]').forEach((el) => {
            const bg = el.getAttribute('bgcolor');
            if (bg && el.style && !el.style.backgroundColor) {
                el.style.backgroundColor = bg;
            }
        });

        iframeDoc.body.querySelectorAll('table').forEach((table) => {
            table.setAttribute(OFFICE_PASTE_TABLE_ATTR, OFFICE_PASTE_TABLE_VALUE);
            if (isExcelPaste) table.setAttribute('data-ems-excel-paste', '1');
            if (!table.style.borderCollapse) table.style.borderCollapse = 'collapse';
            table.classList.add('ems-office-paste-table');
            table.querySelectorAll('o\\:p').forEach((el) => {
                if (!String(el.textContent || '').replace(/\u00a0/g, ' ').trim()) el.remove();
            });
            promoteOfficePasteCellStyles(table);
            finalizeOfficePasteTableFormatting(table, iframeWin);
            reinforceOfficeTableCellRichText(table);
            stripOfficePasteTableClassNames(table);
            table.classList.add('ems-office-paste-table');
        });

        normalizeClauseProseTextColors(iframeDoc.body);

        iframeDoc.body.querySelectorAll('col, o\\:p, style, meta, link').forEach((el) => {
            if (el.closest('table')) return;
            el.remove();
        });

        const tables = iframeDoc.body.querySelectorAll('table');
        const keepProse = pasteRootHasNonTableContent(iframeDoc.body);
        if (tables.length === 1 && !keepProse) return tables[0].outerHTML;
        if (tables.length > 1 && !keepProse) {
            const wrap = iframeDoc.createElement('div');
            tables.forEach((table) => wrap.appendChild(table.cloneNode(true)));
            return wrap.innerHTML;
        }
        return iframeDoc.body.innerHTML;
    } catch {
        return extractOfficeHtmlFragment(raw) || raw;
    } finally {
        iframe.remove();
    }
};

const isOfficePastedTable = (table) =>
    table?.getAttribute?.(OFFICE_PASTE_TABLE_ATTR) === OFFICE_PASTE_TABLE_VALUE ||
    table?.classList?.contains?.('ems-office-paste-table') ||
    Boolean(
        table?.querySelector?.(
            'o\\:p, td p.MsoNormal, th p.MsoNormal, td span.MsoNormal, th span.MsoNormal, .MsoNormal'
        )
    ) ||
    Boolean(table?.querySelector?.('style, [style*="mso-"]'));

const normalizeOfficePastedTable = (table) => {
    if (!table) return;
    // Some Word clipboard paths insert the table without `data-ems-paste-source="office"`.
    // Stamp it so our office-only CSS + compact spacing rules apply.
    if (table.getAttribute?.(OFFICE_PASTE_TABLE_ATTR) !== OFFICE_PASTE_TABLE_VALUE) {
        table.setAttribute(OFFICE_PASTE_TABLE_ATTR, OFFICE_PASTE_TABLE_VALUE);
    }
    if (!table.classList?.contains?.('ems-office-paste-table')) {
        table.classList.add('ems-office-paste-table');
    }
    promoteOfficePasteCellStyles(table);
    table.querySelectorAll('td, th').forEach((cell) => {
        const style = cell.getAttribute('style');
        if (style) cell.setAttribute('style', normalizeOfficeInlineCss(style));
    });
    const win = table.ownerDocument?.defaultView;
    finalizeOfficePasteTableFormatting(table, win);
    table.querySelectorAll('td, th').forEach(cleanCellSpacingNodes);
    compactOfficePasteTableSpacing(table);
    const keepRowHeights =
        table.hasAttribute('data-ems-row-heights') ||
        table.hasAttribute('data-ems-row-heights-custom');
    const stripProps = keepRowHeights
        ? CELL_KILL_STYLE_PROPS.filter(
              (p) => p !== 'height' && p !== 'min-height' && p !== 'max-height'
          )
        : CELL_KILL_STYLE_PROPS;
    table.querySelectorAll('tr, td, th').forEach((cell) => {
        if (!cell.style) return;
        stripProps.forEach((p) => cell.style.removeProperty(p));
        if (!keepRowHeights) cell.removeAttribute('height');
    });
    table.querySelectorAll('td p, td div, th p, th div, td span, th span, td font, th font').forEach((el) => {
        if (!el.style) return;
        const childStrip = keepRowHeights
            ? ['margin-top', 'margin-bottom', 'mso-line-height-alt', 'mso-line-height-rule']
            : ['height', 'min-height', 'margin-top', 'margin-bottom', 'mso-line-height-alt', 'mso-line-height-rule'];
        childStrip.forEach((p) => el.style.removeProperty(p));
        if (!keepRowHeights) el.removeAttribute('height');
    });
    initializeOfficePastedTableColumns(table);
    applyTableRowHeightModel(table);
};

/** Excel/Word sometimes inlines cursor:none or transparent text — hides pointer / caret. */
const stripPastedEditorArtifacts = (root) => {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('table [style]').forEach((el) => {
        if (!el.style) return;
        el.style.removeProperty('cursor');
        // Word/Excel may paste white-space variants that prevent wrapping inside cells.
        // Normalize to allow wrapping; we also enforce via CSS for safety.
        if (el.style.whiteSpace) {
            el.style.whiteSpace = 'normal';
        }
        // Word may paste positioned/translated runs which can paint outside the cell box.
        // Normalize these so content participates in normal flow and wraps within the cell.
        if (el.style.position && el.style.position !== 'static') {
            el.style.position = 'static';
        }
        ['left', 'top', 'right', 'bottom'].forEach((p) => el.style.removeProperty(p));
        el.style.removeProperty('transform');
        el.style.removeProperty('translate');
        el.style.removeProperty('float');

        const isCellDesc =
            el.closest?.('td, th') && !/^(TD|TH|TR|TABLE|COL|COLGROUP|TBODY|THEAD|TFOOT)$/i.test(el.tagName);
        if (isCellDesc) {
            // Prevent wide inline boxes from overflowing into neighbor columns.
            el.style.maxWidth = '100%';
            if (el.style.width) el.style.width = 'auto';
        }
        const color = (el.style.color || '').replace(/\s/g, '').toLowerCase();
        const fill = (el.style.webkitTextFillColor || '').replace(/\s/g, '').toLowerCase();
        if (color === 'transparent' || fill === 'transparent') {
            el.style.removeProperty('color');
            el.style.removeProperty('-webkit-text-fill-color');
        }
    });
};

const normalizePastedTables = (root) => {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    if (isTableStructureResizeActive(root)) return;
    stripPastedEditorArtifacts(root);
    const tables = root.querySelectorAll('table');
    tables.forEach((table) => {
        if (isOfficePastedTable(table)) {
            normalizeOfficePastedTable(table);
            return;
        }
        if (isEmsPricingSummaryTable(table)) {
            initializeEmsPricingSummaryTableColumns(table);
            applyTableRowHeightModel(table);
            return;
        }
        table.style.tableLayout = 'fixed';
        if (table.style.width === '100%') table.style.removeProperty('width');
        const keepRowHeights =
        table.hasAttribute('data-ems-row-heights') ||
        table.hasAttribute('data-ems-row-heights-custom');
        const stripProps = keepRowHeights
            ? CELL_KILL_STYLE_PROPS.filter(
                  (p) => p !== 'height' && p !== 'min-height' && p !== 'max-height'
              )
            : CELL_KILL_STYLE_PROPS;
        table.querySelectorAll('tr, td, th').forEach((cell) => {
            if (!keepRowHeights) cell.removeAttribute('height');
            if (cell.style) {
                stripProps.forEach((p) => cell.style.removeProperty(p));
            }
        });
        table.querySelectorAll('td, th').forEach(cleanCellSpacingNodes);
        table.querySelectorAll(
            'td p, td div, td li, td span, td font, th p, th div, th li, th span, th font'
        ).forEach((el) => {
            if (el.style) {
                CELL_CHILD_KILL_STYLE_PROPS.forEach((p) => el.style.removeProperty(p));
            }
            el.removeAttribute('height');
        });
    });
    harmonizeInsertedTableCells(root);
};

/** Word/Excel block styles that pull pasted lines to the extreme left of the editor. */
const PASTE_BLOCK_ALIGN_KILL_PROPS = [
    'margin-left',
    'margin-right',
    'padding-left',
    'padding-right',
    'text-indent',
    'left',
    'right',
    'position',
    'top',
    'transform',
    'mso-margin-left-alt',
    'mso-padding-alt',
];

const isInsideTable = (el) => Boolean(el?.closest?.('table'));

/** Remove Office hanging-indent / zero-margin inline styles on paragraphs and lists. */
const normalizePastedBlockAlignment = (root) => {
    if (!root || typeof root.querySelectorAll !== 'function') return;

    root.querySelectorAll('div[class*="WordSection"], div[class*="OutlineElement"], div[class*="Mso"]').forEach((wrapper) => {
        if (isInsideTable(wrapper)) return;
        if (wrapper.style) {
            PASTE_BLOCK_ALIGN_KILL_PROPS.forEach((p) => wrapper.style.removeProperty(p));
        }
        const parent = wrapper.parentElement;
        if (!parent) return;
        const unwrap =
            parent.id === '__ems_paste_root' ||
            parent.classList?.contains('jodit-wysiwyg') ||
            parent.classList?.contains('clause-editor-wrapper');
        if (!unwrap) return;
        while (wrapper.firstChild) {
            parent.insertBefore(wrapper.firstChild, wrapper);
        }
        wrapper.remove();
    });

    root.querySelectorAll('p, div, ul, ol, li, blockquote').forEach((el) => {
        if (isInsideTable(el)) return;
        if (el.style) {
            PASTE_BLOCK_ALIGN_KILL_PROPS.forEach((p) => el.style.removeProperty(p));
        }
    });
};

const escapeHtmlText = (value) =>
    String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

/** Build an HTML table when Excel only exposes tab-separated plain text on the clipboard. */
const tsvPlainToHtmlTable = (plain) => {
    const normalized = String(plain || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const rows = normalized.split('\n');
    while (rows.length && rows[rows.length - 1].trim() === '') rows.pop();
    if (!rows.length) return '';
    const body = rows
        .map((row) => {
            const cells = row.split('\t');
            return `<tr>${cells.map((cell) => `<td>${escapeHtmlText(cell)}</td>`).join('')}</tr>`;
        })
        .join('');
    return `<table cellspacing="0" cellpadding="0"><tbody>${body}</tbody></table>`;
};

/** Excel/Word put both text/html and image/png on the clipboard; Jodit's uploader prefers the PNG. */
const clipboardHasOfficeTableData = (dataTransfer) => {
    if (!dataTransfer) return false;
    const html = dataTransfer.getData?.('text/html') || '';
    const plain = dataTransfer.getData?.('text/plain') || '';
    // Excel always puts tab-separated values on the clipboard for cell ranges.
    if (plain.includes('\t')) return true;
    if (html && /<[a-z][\s>]/i.test(html)) {
        if (/<table[\s>]/i.test(html)) return true;
        if (/schemas-microsoft-com:office|Excel\.Sheet|Word\.Document|ProgId/i.test(html)) return true;
        if (/mso-/i.test(html) && /<tr[\s>]/i.test(html)) return true;
    }
    return false;
};

const clipboardHasOfficeHtml = (html) =>
    html &&
    /<[a-z][\s>]/i.test(html) &&
    (/<table[\s>]/i.test(html) ||
        /<t[dh][\s>]/i.test(html) ||
        /<tr[\s>]/i.test(html) ||
        /schemas-microsoft-com:office|Excel\.Sheet|Word\.Document|ProgId|mso-/i.test(html));

/** Clause editor copy (table + headings/lists) — keep full fragment, not table-only office extract. */
const extractEmsMixedClauseClipboardHtml = (htmlRaw) => {
    const raw = String(htmlRaw || '').trim();
    if (!raw || !/<table[\s>]/i.test(raw)) return '';
    if (!/data-ems-|ems-bullet-|ems-num-|ems-clause-/i.test(raw)) return '';
    const fragment = extractOfficeHtmlFragment(raw) || raw;
    let doc;
    try {
        doc = new DOMParser().parseFromString(
            `<div id="__ems_mixed_clause_paste">${fragment}</div>`,
            'text/html'
        );
    } catch (_e) {
        return '';
    }
    const root = doc.getElementById('__ems_mixed_clause_paste');
    if (!root || !pasteRootHasNonTableContent(root)) return '';
    return sanitizePastedHtmlString(root.innerHTML.trim());
};

const extractOfficeTableHtmlFromClipboard = (dataTransfer) => {
    if (!dataTransfer) return '';
    const htmlRaw = (dataTransfer.getData?.('text/html') || '').trim();
    const plain = dataTransfer.getData?.('text/plain') || '';

    // Prefer HTML whenever Excel sent a table — plain TSV drops colors, fonts, and merges.
    const officePasteOptions = { plainText: plain };
    if (htmlRaw && /<table[\s>]/i.test(htmlRaw)) {
        const emsMixed = extractEmsMixedClauseClipboardHtml(htmlRaw);
        if (emsMixed) return emsMixed;
        return sanitizePastedHtmlString(applyOfficeClipboardHtml(htmlRaw, officePasteOptions));
    }
    if (htmlRaw && (clipboardHasOfficeHtml(htmlRaw) || plain.includes('\t'))) {
        const processed = sanitizePastedHtmlString(applyOfficeClipboardHtml(htmlRaw, officePasteOptions));
        if (processed && /<t[dh][\s>]/i.test(processed)) return processed;
    }

    if (plain.includes('\t')) {
        const tsvTable = tsvPlainToHtmlTable(plain);
        const marked = tsvTable.replace(
            '<table ',
            `<table ${OFFICE_PASTE_TABLE_ATTR}="${OFFICE_PASTE_TABLE_VALUE}" data-ems-excel-paste="1" class="ems-office-paste-table" `
        );
        return sanitizePastedHtmlString(marked);
    }
    return '';
};

/** jodit-react ref is the Jodit instance; `.editor` on it is the contenteditable DOM node. */
const resolveJoditInstance = (editorRef, joditInstRef) => {
    const fromCallback = joditInstRef?.current;
    if (fromCallback?.s?.insertHTML && !fromCallback.isInDestruct && !fromCallback.isDestructed) {
        return fromCallback;
    }
    const fromRef = editorRef?.current;
    if (fromRef?.s?.insertHTML && !fromRef.isInDestruct && !fromRef.isDestructed) {
        return fromRef;
    }
    return null;
};

const isJoditAlive = (jodit) =>
    jodit && !jodit.isInDestruct && !jodit.isDestructed && typeof jodit.s?.insertHTML === 'function';

/** Same cleanup on clipboard HTML before Jodit inserts it (tables + block alignment). */
const sanitizePastedHtmlString = (html) => {
    if (!html || typeof html !== 'string' || !/<[a-z][\s>]/i.test(html)) return html;
    let doc;
    try {
        doc = new DOMParser().parseFromString(`<div id="__ems_paste_root">${html}</div>`, 'text/html');
    } catch (_e) {
        return html;
    }
    const root = doc.getElementById('__ems_paste_root');
    if (!root) return html;
    normalizePastedTables(root);
    normalizePastedBlockAlignment(root);
    finalizeAllOfficePasteTablesFormatting(root, root.ownerDocument?.defaultView);
    return root.innerHTML;
};

// Custom Table Icon
const TableIcon = () => (
    <svg viewBox="0 0 18 18">
        <rect className="ql-fill" height="12" width="12" x="3" y="3" />
        <rect className="ql-fill" height="2" width="12" x="3" y="8" />
        <rect className="ql-fill" height="12" width="2" x="8" y="3" />
    </svg>
);

/** Fixed toolbar host in quote preview — Jodit `toolbar` target when editing inline. */
export const EMS_QUOTE_PREVIEW_TOOLBAR_ID = 'ems-quote-preview-toolbar';

function bindQuotePreviewSharedToolbar(activeJodit, host, attempt = 0) {
    if (!activeJodit || !host) return;
    const keeper = host.__emsToolbarKeeperJodit;
    if (!keeper?.toolbar) {
        if (attempt < 24) {
            window.setTimeout(() => bindQuotePreviewSharedToolbar(activeJodit, host, attempt + 1), 50);
        }
        return;
    }
    keeper.toolbar.jodit = activeJodit;
    activeJodit.toolbar = keeper.toolbar;
    host.__emsActiveClauseEditorJodit = activeJodit;
    requestAnimationFrame(() => {
        try {
            activeJodit.e?.fire?.('updateToolbar');
        } catch (_err) {
            /* ignore */
        }
    });
}

function releaseQuotePreviewSharedToolbar(activeJodit, host) {
    if (!host || host.__emsActiveClauseEditorJodit !== activeJodit) return;
    host.__emsActiveClauseEditorJodit = null;
    const keeper = host.__emsToolbarKeeperJodit;
    if (keeper?.toolbar) {
        keeper.toolbar.jodit = keeper;
        try {
            keeper.e?.fire?.('updateToolbar');
        } catch (_err) {
            /* ignore */
        }
    }
}

const ClauseEditor = ({
    html,
    onChange,
    style,
    toolbarAnchorRef,
    toolbarMountKey,
    toolbarOnly = false,
    toolbarSharedWithKeeper = false,
    onEditorBlur,
    onEditorReflow,
    onEditorReady,
}) => {
    const editor = useRef(null);
    const joditInstRef = useRef(null);
    const wrapperRef = useRef(null);
    /**
     * Last HTML we reported via onChange. When parent echoes the same string, we must not update the `value`
     * passed to jodit-react — its useEffect does `jodit.value = value` whenever strings differ from Jodit's
     * normalized HTML, which resets the caret. We only sync React `value` when html truly changes from outside.
     */
    const lastEmittedRef = useRef(html ?? '');
    /** Initial HTML only — jodit-react must not receive a changing `value` prop. */
    const initialHtmlRef = useRef(html ?? '');
    const handlersRef = useRef({});
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const onEditorBlurRef = useRef(onEditorBlur);
    onEditorBlurRef.current = onEditorBlur;
    const onEditorReflowRef = useRef(onEditorReflow);
    onEditorReflowRef.current = onEditorReflow;
    const onEditorReadyRef = useRef(onEditorReady);
    onEditorReadyRef.current = onEditorReady;

    const useExternalToolbar = Boolean(toolbarAnchorRef);

    const runClauseHistoryToolbarCommand = useCallback((command) => {
        const host =
            typeof document !== 'undefined'
                ? document.getElementById(EMS_QUOTE_PREVIEW_TOOLBAR_ID)
                : null;
        const jodit = host?.__emsActiveClauseEditorJodit;
        if (jodit) {
            jodit.execCommand(command);
            return true;
        }
        if (command === 'undo' && host?.__emsClauseHistoryUndo?.()) {
            return true;
        }
        if (command === 'redo' && host?.__emsClauseHistoryRedo?.()) {
            return true;
        }
        return false;
    }, []);

    /** Resolve the contenteditable body. Never touch Jodit selection APIs (e.g. `s.html`) — that can
     *  throw while the instance is mid-paste or tearing down. */
    const getEditorBody = useCallback(() => {
        const jodit = joditInstRef.current || editor.current;
        if (isJoditAlive(jodit)) {
            const ed = jodit.editor;
            if (ed && typeof ed.querySelectorAll === 'function') return ed;
        }
        return wrapperRef.current?.querySelector('.jodit-wysiwyg') || null;
    }, []);

    const isEditorFocused = useCallback(() => {
        const root = getEditorBody();
        const active = document.activeElement;
        return Boolean(root && active && (active === root || root.contains(active)));
    }, [getEditorBody]);

    useEffect(() => {
        if (useExternalToolbar) {
            const incoming = html ?? '';
            if (!incoming) return undefined;
            const jodit = joditInstRef.current;
            if (!isJoditAlive(jodit)) return undefined;
            const current = String(jodit.value || '').trim();
            const isEmpty =
                !current ||
                current === '<br>' ||
                current === '<p><br></p>' ||
                current === '<p></p>';
            if (!isEmpty) return undefined;
            jodit.value = incoming;
            lastEmittedRef.current = incoming;
            initialHtmlRef.current = incoming;
            if (jodit.history?.clear) {
                jodit.history.clear();
            }
            requestAnimationFrame(() => {
                const root =
                    jodit.editor ||
                    wrapperRef.current?.querySelector('.jodit-wysiwyg') ||
                    null;
                initializeAllEmsPricingSummaryTableColumns(root);
                scheduleApplyAllTableRowHeightsInEditor(
                    () =>
                        jodit.editor ||
                        wrapperRef.current?.querySelector('.jodit-wysiwyg') ||
                        null
                );
            });
            return undefined;
        }
        const incoming = html ?? '';
        if (incoming === lastEmittedRef.current) {
            return undefined;
        }
        if (isEditorFocused()) {
            return undefined;
        }
        lastEmittedRef.current = incoming;
        initialHtmlRef.current = incoming;
        const jodit = joditInstRef.current;
        if (isJoditAlive(jodit)) {
            jodit.value = incoming;
            requestAnimationFrame(() => {
                const root =
                    jodit.editor ||
                    wrapperRef.current?.querySelector('.jodit-wysiwyg') ||
                    null;
                initializeAllEmsPricingSummaryTableColumns(root);
                scheduleApplyAllTableRowHeightsInEditor(
                    () =>
                        jodit.editor ||
                        wrapperRef.current?.querySelector('.jodit-wysiwyg') ||
                        null
                );
            });
        }
        return undefined;
    }, [html, isEditorFocused, useExternalToolbar]);

    /** Push live editor DOM into parent state (preview reads clauseContent, not Jodit directly). */
    const syncEditorToParent = useCallback(async () => {
        try {
            const jodit = joditInstRef.current || editor.current;
            if (!isJoditAlive(jodit)) return;
            if (jodit.__emsListApplyLock) {
                jodit.__emsPendingPricingRecalc = true;
                return;
            }
            if (isClauseEditorTypingActive(jodit)) {
                jodit.__emsPendingPricingRecalc = true;
                return;
            }
            if (jodit.__emsSpellScanRunning) {
                jodit.__emsPendingPricingRecalc = true;
                return;
            }
            if (
                jodit.__emsListApplyCaretLi?.isConnected ||
                jodit.__emsEnterContinueCaretBlock?.isConnected
            ) {
                jodit.__emsPendingPricingRecalc = true;
                return;
            }
            const root = getEditorBody();
            if (!root) return;

            const clauseHasTable = Boolean(root.querySelector('table'));

            const pushHtml = () => {
                const domHtml = root.innerHTML ?? '';
                const skipListNormalize =
                    jodit.__emsOfficePasteLock ||
                    isClauseEditorSelectionInTable(jodit) ||
                    clauseEditorHtmlContainsTable(domHtml);
                const normalized = stripClauseEditorExportEmptyNodes(
                    stripSpellMarksFromHtml(
                        skipListNormalize ? domHtml : normalizeClauseListHtmlInString(domHtml)
                    )
                );
                if (normalized === lastEmittedRef.current) return;
                const fromParent = onChangeRef.current(normalized);
                lastEmittedRef.current = typeof fromParent === 'string' ? fromParent : normalized;
            };

            const skipCaretRestore =
                isEditorFocused() ||
                jodit.__emsEnterContinueCaretBlock?.isConnected ||
                isCaretInEmptyClauseBlock(jodit);

            const skipDomMaintenance =
                jodit.__emsForceCaretRestore ||
                jodit.__emsOfficePastePostProcess ||
                jodit.__emsOfficePasteLock ||
                isEditorFocused();

            const runDomMaintenance = async () => {
                const maintainTableDom = () => {
                    withJoditHistoryBlocked(jodit, () => {
                        finalizeAllOfficePasteTablesFormatting(
                            root,
                            root.ownerDocument?.defaultView
                        );
                        if (isClauseEditorSelectionInTable(jodit)) {
                            root.querySelectorAll?.('table')?.forEach((table) => {
                                applyTableRowHeightModel(table);
                            });
                        }
                    });
                };
                if (root.querySelector('img[src^="blob:"]')) {
                    await withJoditHistoryBlockedAsync(jodit, () =>
                        inlineBlobImagesInDomRoot(root)
                    );
                }
                if (isClauseEditorSelectionInTable(jodit) || clauseHasTable) {
                    preserveClauseEditorSelectionDuring(jodit, maintainTableDom);
                } else {
                    maintainTableDom();
                }
            };

            if (!skipDomMaintenance) {
                await runDomMaintenance();
            }

            if (!skipCaretRestore) {
                const offset = captureClauseEditorCaretOffset(jodit);
                if (offset != null) {
                    restoreClauseEditorCaretOffset(jodit, offset);
                }
            }
            pushHtml();
        } catch (_e) {
            /* Ignore while Jodit is mid-paste or destructing. */
        }
    }, [getEditorBody, isEditorFocused]);

    /** Run multiple times: once now, again on next frame, again ~300ms / ~1.2s out — covers any
     *  Jodit post-paste pass (autoresize / cleanHTML / mso-style stripper) that re-introduces spacing. */
    const cleanupAfterPaste = useCallback(() => {
        const jodit = joditInstRef.current || editor.current;
        const root = getEditorBody();
        if (!root) return;
        const officePasteActive = Boolean(
            jodit?.__emsOfficePasteLock ||
                jodit?.__emsOfficePastePostProcess ||
                root.querySelector(
                    'table[data-ems-paste-source="office"], table.ems-office-paste-table, table[data-ems-excel-paste="1"]'
                )
        );
        if (isJoditAlive(jodit) && officePasteActive) {
            beginOfficePastePostProcess(jodit);
        }
        const runOfficeColumnInit = () => {
            const body = getEditorBody();
            initializeAllOfficePastedTableColumns(body);
            initializeAllEmsPricingSummaryTableColumns(body);
        };
        const finish = () => {
            runOfficeColumnInit();
            const live = joditInstRef.current || editor.current;
            if (!isJoditAlive(live) || !isEditorFocused()) {
                syncEditorToParent();
            }
        };
        const runCleanup = (target) => {
            if (!target) return;
            const live = joditInstRef.current || editor.current;
            const run = () => {
                replaceOfficePseudoListTablesInRoot(target);
                normalizePastedTables(target);
                normalizePastedBlockAlignment(target);
                if (!target.querySelector('table')) {
                    normalizeClauseListHtml(target);
                }
                preservePastedFontStyles(target);
                preservePastedOfficeFormatting(target);
                promoteOfficePasteCellStyles(target);
                target.querySelectorAll?.('table[data-ems-paste-source="office"], table.ems-office-paste-table').forEach((table) => {
                    reinforceOfficeTableCellRichText(table);
                });
                finalizeOfficePasteListFormatting(target, target?.ownerDocument?.defaultView);
                finalizeAllOfficePasteTablesFormatting(target, target?.ownerDocument?.defaultView);
                target.querySelectorAll?.('table[data-ems-paste-source="office"], table.ems-office-paste-table').forEach((table) => {
                    stripOfficePasteTableClassNames(table);
                });
            };
            if (isJoditAlive(live)) {
                withJoditHistoryBlocked(live, run);
            } else {
                run();
            }
        };
        runCleanup(root);
        finish();
        requestAnimationFrame(() => {
            const r = getEditorBody();
            runCleanup(r);
            finish();
        });
        setTimeout(() => {
            const r = getEditorBody();
            runCleanup(r);
            finish();
        }, 300);
        setTimeout(() => {
            const live = joditInstRef.current || editor.current;
            if (isJoditAlive(live) && live.__emsOfficePastePostProcess) {
                checkpointHistoryAfterOfficePaste(live);
            }
        }, 450);
    }, [getEditorBody, syncEditorToParent, isEditorFocused]);

    /** Intercept clipboard HTML BEFORE Jodit inserts it so the editor never sees the dirty Excel/Word
     *  height/margin attributes. Jodit fires `processPaste(event, text, types)` and lets the handler
     *  return a replacement string. */
    const processPasteHandler = useCallback((e, text /* , _types */) => {
        const dt = e?.clipboardData;
        const wordListHtml = tryConvertWordListClipboard(dt);
        if (wordListHtml?.trim()) return wordListHtml;
        const plain = dt?.getData?.('text/plain') || '';
        if (dt && clipboardHasOfficeTableData(dt)) {
            const fromClipboard = extractOfficeTableHtmlFromClipboard(dt);
            if (fromClipboard?.trim()) {
                return maybeConvertPastedTableHtmlToList(fromClipboard, plain);
            }
        }
        if (typeof text !== 'string') return undefined;
        if (!/<[a-z][\s>]/i.test(text)) return undefined;
        const isOfficeHtml =
            clipboardHasOfficeHtml(text) ||
            /<table[\s>]/i.test(text) ||
            /Word\.Document|schemas-microsoft-com:office|mso-/i.test(text);
        if (isOfficeHtml) {
            const listOrProse = buildOfficeFormattedHtmlFromClipboard(text, plain);
            if (listOrProse?.trim() && !/<table[\s>]/i.test(listOrProse)) {
                return listOrProse;
            }
        }
        const processed = isOfficeHtml ? applyOfficeClipboardHtml(text, { plainText: plain }) : text;
        return sanitizePastedHtmlString(maybeConvertPastedTableHtmlToList(processed, plain));
    }, []);

    /** Excel also copies a PNG; Jodit's base64 uploader grabs that before HTML is processed. */
    const insertOfficeTableFromClipboard = useCallback(
        (e) => {
            const dt = e?.clipboardData;
            const wordListHtml = tryConvertWordListClipboard(dt);
            if (wordListHtml?.trim()) {
                const jodit = resolveJoditInstance(editor, joditInstRef);
                return insertWordListHtmlIntoEditor(jodit, wordListHtml, e, cleanupAfterPaste);
            }
            if (!clipboardHasOfficeTableData(dt)) return false;
            const plain = dt?.getData?.('text/plain') || '';
            const html = maybeConvertPastedTableHtmlToList(
                extractOfficeTableHtmlFromClipboard(dt),
                plain
            );
            if (!html || !html.trim()) return false;
            const jodit = resolveJoditInstance(editor, joditInstRef);
            if (!isJoditAlive(jodit)) return false;
            e.preventDefault();
            e.stopImmediatePropagation?.();
            try {
                withOfficePasteInsertGuard(jodit, () => {
                    withJoditHistoryBlocked(jodit, () => {
                        jodit.s.focus();
                        jodit.s.insertHTML(html);
                        if (typeof jodit.synchronizeValues === 'function') {
                            jodit.synchronizeValues();
                        }
                    });
                    jodit.e?.fire?.('afterPaste', e);
                });
            } catch (_err) {
                return false;
            }
            return true;
        },
        [cleanupAfterPaste]
    );

    const beforePastePreferOfficeHtml = useCallback(
        (e) => (insertOfficeTableFromClipboard(e) ? false : undefined),
        [insertOfficeTableFromClipboard]
    );

    /** Clear col-resize / crosshair left on document.body by other Quote panels. */
    useEffect(() => {
        const wrap = wrapperRef.current;
        if (!wrap) return undefined;
        const clearStuckBodyCursor = () => {
            document.body.style.removeProperty('cursor');
            document.body.style.removeProperty('user-select');
        };
        wrap.addEventListener('mouseenter', clearStuckBodyCursor, true);
        wrap.addEventListener('mousedown', clearStuckBodyCursor, true);
        return () => {
            wrap.removeEventListener('mouseenter', clearStuckBodyCursor, true);
            wrap.removeEventListener('mousedown', clearStuckBodyCursor, true);
        };
    }, []);

    const applyPreviewInlineWorkplaceLayout = useCallback((jodit) => {
        if (!useExternalToolbar || !jodit) return;
        const container = jodit.container;
        const workplace =
            jodit.workplace || container?.querySelector?.('.jodit-workplace') || null;
        const root =
            jodit.editor ||
            workplace?.querySelector?.('.jodit-wysiwyg') ||
            container?.querySelector?.('.jodit-wysiwyg') ||
            null;
        const applyBox = (el) => {
            if (!el) return;
            const inWordFlow = Boolean(
                el.closest?.('.quote-clause-inline-editor--word-flow')
            );
            el.style.setProperty('width', '100%', 'important');
            el.style.setProperty('max-width', '100%', 'important');
            el.style.setProperty('min-width', '0', 'important');
            el.style.setProperty('box-sizing', 'border-box', 'important');
            el.style.setProperty('overflow-x', 'visible', 'important');
            el.style.setProperty('overflow-y', 'visible', 'important');
            el.style.setProperty('background', inWordFlow ? '#fff' : 'transparent', 'important');
        };
        applyBox(container);
        applyBox(workplace);
        if (root) {
            applyBox(root);
            root.classList.add('clause-content');
            root.style.setProperty('height', 'auto', 'important');
            root.style.setProperty('min-height', '0', 'important');
            root.style.setProperty('padding', '0', 'important');
            root.style.setProperty('margin', '0', 'important');
            root.style.setProperty('line-height', '1.6', 'important');
            root.style.setProperty('white-space', 'normal', 'important');
            root.style.setProperty('word-wrap', 'break-word', 'important');
            root.style.setProperty('overflow-wrap', 'anywhere', 'important');
            root.querySelectorAll?.('p, div:not(table div):not(td div):not(th div)').forEach((el) => {
                if (el.closest?.('table')) return;
                el.style.removeProperty('white-space');
                if (el.style.width && el.style.width !== '100%') el.style.removeProperty('width');
            });
        }
        container?.querySelectorAll?.('.jodit-toolbar, .jodit-toolbar__box').forEach((el) => {
            el.style.setProperty('display', 'none', 'important');
            el.style.setProperty('height', '0', 'important');
            el.style.setProperty('min-height', '0', 'important');
            el.style.setProperty('margin', '0', 'important');
            el.style.setProperty('padding', '0', 'important');
            el.style.setProperty('overflow', 'hidden', 'important');
        });
        if (workplace) {
            workplace.style.setProperty('display', 'block', 'important');
            workplace.style.setProperty('flex', 'none', 'important');
            workplace.style.setProperty('height', 'auto', 'important');
            workplace.style.setProperty('min-height', '0', 'important');
            workplace.style.removeProperty('max-height');
        }
        if (container) {
            container.style.setProperty('display', 'block', 'important');
            container.style.setProperty('flex', 'none', 'important');
            container.style.setProperty('height', 'auto', 'important');
            container.style.setProperty('min-height', '0', 'important');
            container.style.removeProperty('max-height');
        }
        if (root) {
            const contentHeight = Math.max(root.scrollHeight || 0, root.offsetHeight || 0);
            if (contentHeight > 0) {
                workplace?.style.setProperty('min-height', `${contentHeight}px`, 'important');
                container?.style.setProperty('min-height', `${contentHeight}px`, 'important');
            }
        }
        container?.querySelectorAll?.('.jodit-editor__resize').forEach((el) => {
            el.style.setProperty('display', 'none', 'important');
        });
    }, [useExternalToolbar]);

    const config = useMemo(() => ({
        readonly: toolbarOnly,
        ...(useExternalToolbar
            ? {
                  activeButtonsInReadOnly: [
                      'undo',
                      'redo',
                      'source',
                      'fullsize',
                      'print',
                      'about',
                      'dots',
                      'selectall',
                  ],
                  allowCommandsInReadOnly: ['undo', 'redo', 'selectall', 'preview', 'print'],
              }
            : {}),
        placeholder: toolbarOnly ? '' : 'Start typing...',
        saveSelectionOnBlur: true,
        popupRoot: typeof document !== 'undefined' ? document.body : null,
        zIndex: 100050,
        spellcheck: !toolbarOnly,
        height: toolbarOnly ? 0 : style?.height === 'auto' ? 'auto' : style?.height || 400,
        minHeight: toolbarOnly ? 0 : style?.minHeight ?? (style?.height === 'auto' ? 0 : 200),
        ...(useExternalToolbar && !toolbarOnly
            ? {
                  allowResizeX: false,
                  allowResizeY: false,
              }
            : {}),
        /** Built-in orderedList plugin uses commitStyle and only wraps part of the selection — conflicts with EMS list presets. */
        disablePlugins: [
            'orderedList',
            'resizeCells',
            'addNewLine',
            'selectCells',
            'indent',
            ...(useExternalToolbar && !toolbarOnly ? ['resize-handler'] : []),
        ],
        /** Enter-icon “add line” handle (before/after tables) uses position:fixed and blocks the horizontal scrollbar when scrolling. */
        addNewLine: false,
        addNewLineOnDBLClick: false,
        /** Off — uploader paste hook grabs Excel's PNG and ignores the HTML table on the clipboard. */
        enableDragAndDropFileToEditor: false,
        /** Skip Word/Excel paste plugin so Jodit does not run applyStyles() (it strips border* from inline CSS). */
        askBeforePasteFromWord: false,
        askBeforePasteHTML: false,
        processPasteFromWord: false,
        defaultActionOnPaste: 'insert_as_html',
        cleanHTML: {
            allowTags: false,
            denyTags: 'script,iframe,object,embed',
            removeOnError: false,
            replaceNBSP: false,
            fillEmptyParagraph: false,
        },
        uploader: {
            /** Embed pasted images as data: URIs — blob: URLs break in preview after edit mode exits. */
            insertImageAsBase64URI: true,
        },
        colorPickerDefaultTab: 'color',
        /** Word-like Tab indent step (px) for paragraphs and list items. */
        indentMargin: 24,
        /** Toolbar font-size dropdown shows pt like Word (9, 10, 11…). */
        defaultFontSizePoints: 'pt',
        toolbarAdaptive: false,
        toolbarButtonSize: 'xsmall',
        showTooltip: true,
        showTooltipDelay: 400,
        useNativeTooltip: useExternalToolbar,
        /** External toolbar host requires fullsize off (Jodit skips custom toolbar when fullsize). */
        globalFullSize: useExternalToolbar ? false : true,
        fullsize: useExternalToolbar ? false : undefined,
        toolbar: useExternalToolbar
            ? toolbarSharedWithKeeper
                ? false
                : `#${EMS_QUOTE_PREVIEW_TOOLBAR_ID}`
            : true,
        toolbarSticky: useExternalToolbar ? false : true,
        history: {
            enable: true,
            timeout: useExternalToolbar ? 0 : 1000,
            maxHistoryLength: 200,
        },
        buttons: [
            'undo', 'redo', '|',
            'bold', 'italic', 'underline', 'strikethrough', '|',
            'emsForeColor', 'emsBackground', 'font', 'fontsize', 'paragraph', '|',
            'ul', 'ol', 'indent', 'outdent', '|',
            'image', 'table', 'emsTableBorder', 'emsRepeatHeader', 'link', '|',
            'left', 'center', 'right', 'justify', 'emsValign', '|',
            'hr', 'eraser'
        ],
        controls: {
            ...buildClauseToolbarTooltipControls(),
            ...buildTableFormatToolbarControlOverrides(),
            undo: {
                mode: 1,
                tooltip: 'Undo (Ctrl+Z)',
                exec: (editor) => {
                    editor.execCommand('undo');
                    return true;
                },
                isDisabled: (editor) => {
                    if (canEmsTableCellHistoryUndo(editor)) return false;
                    if (editor.history?.canUndo?.()) return false;
                    const host =
                        typeof document !== 'undefined'
                            ? document.getElementById(EMS_QUOTE_PREVIEW_TOOLBAR_ID)
                            : null;
                    if (host?.__emsClauseHistoryCanUndo) {
                        return !host.__emsClauseHistoryCanUndo();
                    }
                    return true;
                },
            },
            redo: {
                mode: 1,
                tooltip: 'Redo (Ctrl+Y)',
                exec: (editor) => {
                    editor.execCommand('redo');
                    return true;
                },
                isDisabled: (editor) => {
                    if (canEmsTableCellHistoryRedo(editor)) return false;
                    if (editor.history?.canRedo?.()) return false;
                    const host =
                        typeof document !== 'undefined'
                            ? document.getElementById(EMS_QUOTE_PREVIEW_TOOLBAR_ID)
                            : null;
                    if (host?.__emsClauseHistoryCanRedo) {
                        return !host.__emsClauseHistoryCanRedo();
                    }
                    return true;
                },
            },
            ul: EMS_UL_TOOLBAR_CONTROL,
            ol: EMS_OL_TOOLBAR_CONTROL,
            indent: {
                tooltip: 'Increase indent',
                exec: (editor) => {
                    restoreClauseEditorFormatSelection(editor);
                    applyClauseEditorLineIndent(editor, false);
                    editor.e?.fire?.('updateToolbar');
                    return true;
                },
            },
            outdent: {
                tooltip: 'Decrease indent',
                exec: (editor) => {
                    restoreClauseEditorFormatSelection(editor);
                    applyClauseEditorLineIndent(editor, true);
                    editor.e?.fire?.('updateToolbar');
                    return true;
                },
            },
            emsTableBorder: EMS_TABLE_BORDER_CONTROL,
            emsRepeatHeader: EMS_TABLE_REPEAT_HEADER_CONTROL,
            emsValign: EMS_TABLE_VALIGN_CONTROL,
            emsForeColor: EMS_FORECOLOR_CONTROL,
            emsBackground: EMS_BACKGROUND_CONTROL,
            brush: EMS_BRUSH_CONTROL_HIDDEN,
            font: EMS_FONT_TOOLBAR_CONTROL,
            fontsize: EMS_FONTSIZE_TOOLBAR_CONTROL,
        },
        showCharsCounter: false,
        showWordsCounter: false,
        showXPathInStatusbar: false,
        /** Image corner handles only; table columns use EMS col resize (not Jodit % resize). */
        allowResizeTags: new Set(['img']),
        resizer: {
            showSize: true,
            forImageChangeAttributes: true,
            useAspectRatio: new Set(['img']),
            min_width: 24,
            min_height: 24,
        },
        tableAllowCellResize: false,
        table: {
            splitBlockOnInsertTable: true,
            useExtraClassesOptions: true,
            /** EMS handles multi-cell highlight; Jodit selectCells plugin is disabled (it hid the text caret). */
            selectionCellStyle:
                'background-color: rgba(30, 136, 229, 0.32) !important; box-shadow: inset 0 0 0 9999px rgba(30, 136, 229, 0.2) !important; outline: 2px solid #1565c0 !important; outline-offset: -2px;',
            allowCellSelection: false,
        },
        /** Strip Excel/Word height + empty trailing <p><br></p> noise:
         *   - processPaste: clean the clipboard HTML BEFORE Jodit inserts it (primary defense).
         *   - afterPaste / paste: clean the live DOM as a fallback (Jodit / plugins may add styles later). */
        events: {
            beforePaste: (e) => handlersRef.current.beforePastePreferOfficeHtml?.(e),
            processPaste: (...args) => handlersRef.current.processPasteHandler?.(...args),
            afterPaste: () => handlersRef.current.cleanupAfterPaste?.(),
            afterInit: (jodit) => {
                joditInstRef.current = jodit;
                const h = () => handlersRef.current;
                const host = useExternalToolbar
                    ? document.getElementById(EMS_QUOTE_PREVIEW_TOOLBAR_ID)
                    : null;
                const seed = initialHtmlRef.current ?? '';
                if (!jodit.__emsValueBootstrapped) {
                    jodit.__emsValueBootstrapped = true;
                    const plain = String(seed || '').trim();
                    const hasSeed =
                        plain &&
                        plain !== '<br>' &&
                        plain !== '<p><br></p>' &&
                        plain !== '<p></p>';
                    if (hasSeed && (!jodit.value || jodit.value === '<p><br></p>')) {
                        jodit.value = seed;
                    }
                    if (hasSeed) {
                        lastEmittedRef.current = seed;
                        if (jodit.history?.clear) {
                            jodit.history.clear();
                        }
                    }
                }
                jodit.e.on(
                    'beforePaste.emsOfficeTable',
                    (e) => h().beforePastePreferOfficeHtml?.(e),
                    { top: true }
                );
                jodit.e.on('beforePasteInsert.emsOfficeFormat', (html) => {
                    if (isOfficePasteInsertHtml(html)) {
                        enableOfficePasteInsertGuard(jodit);
                    }
                    return html;
                });
                jodit.e.on(
                    'processPaste.emsOfficeFormatGuard',
                    (e, text) => {
                        const dt = e?.clipboardData;
                        const plain = dt?.getData?.('text/plain') || '';
                        const html = dt?.getData?.('text/html') || '';
                        const office =
                            (typeof text === 'string' &&
                                (clipboardHasOfficeHtml(text) ||
                                    /<table[\s>]/i.test(text) ||
                                    /Word\.Document|mso-|schemas-microsoft-com:office/i.test(text))) ||
                            clipboardHasOfficeTableData(dt) ||
                            (html && clipboardHasOfficeHtml(html));
                        if (office || plainTextLooksLikeExcelGrid(plain)) {
                            enableOfficePasteInsertGuard(jodit);
                        }
                        return undefined;
                    },
                    { top: true }
                );
                jodit.e.on('afterPaste.emsOfficeFormatGuard', () => {
                    window.setTimeout(() => disableOfficePasteInsertGuard(jodit), 800);
                });
                const getBody = () =>
                    jodit.editor ||
                    h().wrapperRef?.current?.querySelector('.jodit-wysiwyg') ||
                    null;
                jodit.__emsClauseEditorBody = getBody;
                registerClauseEditorListCommands(jodit);
                registerClauseEditorTableHooks(jodit, getBody, { toolbarOnly });
                if (!toolbarOnly) {
                    registerClauseEditorImageResizerZoomSync(jodit);
                    registerClauseEditorSpellcheck(jodit, getBody);
                }
                if (!toolbarOnly) {
                    bindClauseEditorTypingCaretGuard(jodit, getBody, () => {
                        if (!isJoditAlive(jodit)) return;
                        if (jodit.__emsPendingChangeEmit) {
                            jodit.__emsPendingChangeEmit = false;
                            h().emitChangeFromDom?.();
                        }
                        if (jodit.__emsPendingPricingRecalc) {
                            jodit.__emsPendingPricingRecalc = false;
                            void h().syncEditorToParent?.();
                        }
                    });
                }

                if (useExternalToolbar && !toolbarOnly) {
                    let wordFlowReflowTimer = null;
                    const scheduleWordFlowReflow = () => {
                        if (wordFlowReflowTimer) clearTimeout(wordFlowReflowTimer);
                        wordFlowReflowTimer = window.setTimeout(() => {
                            wordFlowReflowTimer = null;
                            onEditorReflowRef.current?.();
                        }, 40);
                    };
                    jodit.e.on('change.emsWordFlowReflow', scheduleWordFlowReflow);
                    jodit.e.on('afterPaste.emsWordFlowReflow', scheduleWordFlowReflow);
                    jodit.e.on('keyup.emsWordFlowReflow', (e) => {
                        if (e?.key === 'Enter' || e?.key === 'Backspace' || e?.key === 'Delete') {
                            scheduleWordFlowReflow();
                        }
                    });
                    jodit.e.on('change.emsPreviewInlineHeight', () => {
                        if (
                            jodit.__emsListApplyLock ||
                            jodit.__emsEnterContinueCaretBlock?.isConnected ||
                            jodit.__emsListApplyCaretLi?.isConnected
                        ) {
                            return;
                        }
                        requestAnimationFrame(() => applyPreviewInlineWorkplaceLayout(jodit));
                    });
                    jodit.e.on('beforeDestruct.emsWordFlowReflow', () => {
                        if (wordFlowReflowTimer) clearTimeout(wordFlowReflowTimer);
                    });
                }
                registerEditableClauseHeadingSelectionHooks();

                if (host && toolbarOnly) {
                    host.__emsToolbarKeeperJodit = jodit;
                    jodit.e.on('beforeDestruct', () => {
                        if (host.__emsToolbarKeeperJodit === jodit) {
                            host.__emsToolbarKeeperJodit = null;
                        }
                    });
                }

                if (useExternalToolbar) {
                    if (toolbarSharedWithKeeper && host && !toolbarOnly) {
                        bindQuotePreviewSharedToolbar(jodit, host);
                    }
                    registerClauseEditorExternalToolbarSelection(jodit, EMS_QUOTE_PREVIEW_TOOLBAR_ID);
                    registerClauseEditorExternalToolbarTooltips(jodit, EMS_QUOTE_PREVIEW_TOOLBAR_ID);
                    if (!toolbarSharedWithKeeper) {
                        requestAnimationFrame(() => {
                            try {
                                if (jodit.toolbar) {
                                    jodit.toolbar.jodit = jodit;
                                }
                                jodit.e?.fire?.('updateToolbar');
                            } catch (_err) {
                                /* ignore */
                            }
                        });
                    }
                }

                if (host && !toolbarOnly) {
                    host.__emsApplyClauseEditorHtml = (html) => {
                        if (!isJoditAlive(jodit)) return;
                        jodit.__emsApplyingClauseHistory = true;
                        clearEmsTableCellHistory(jodit);
                        const next = String(html ?? '');
                        jodit.value = next;
                        lastEmittedRef.current = next;
                        if (jodit.history?.clear) {
                            jodit.history.clear();
                        }
                        const root = getBody();
                        const finishApply = () => {
                            jodit.__emsApplyingClauseHistory = false;
                        };
                        if (root) {
                            requestAnimationFrame(() => {
                                initializeAllEmsPricingSummaryTableColumns(root);
                                initializeAllOfficePastedTableColumns(root);
                                scheduleApplyAllTableRowHeightsInEditor(getBody);
                                finishApply();
                            });
                        } else {
                            requestAnimationFrame(finishApply);
                        }
                        jodit.e?.fire?.('updateToolbar');
                    };
                    jodit.e.on('beforeDestruct', () => {
                        if (host.__emsActiveClauseEditorJodit === jodit) {
                            if (toolbarSharedWithKeeper) {
                                releaseQuotePreviewSharedToolbar(jodit, host);
                            } else {
                                host.__emsActiveClauseEditorJodit = null;
                            }
                        }
                    });
                }

                if (!jodit.__emsExternalHeadingCmdBound) {
                    jodit.__emsExternalHeadingCmdBound = true;
                    jodit.e.on('beforeCommand.emsExternalHeading', (command, _ui, value) => {
                        if (
                            tryApplyToolbarCommandToEditableClauseHeading(
                                command,
                                value,
                                jodit.o?.defaultFontSizePoints || 'pt',
                                jodit
                            )
                        ) {
                            jodit.e.fire('change');
                            jodit.e.fire('updateToolbar');
                            return false;
                        }
                        return undefined;
                    });
                }

                const wrap = h().wrapperRef?.current;
                if (wrap && !wrap.__emsPasteCaptureBound) {
                    wrap.__emsPasteCaptureBound = true;
                    wrap.addEventListener(
                        'paste',
                        (e) => h().insertOfficeTableFromClipboard?.(e),
                        true
                    );
                }

                const initDom = () => {
                    const root = getBody();
                    if (!root) return;
                    normalizePastedTables(root);
                    normalizePastedBlockAlignment(root);
                    if (!root.querySelector('table')) {
                        normalizeClauseListHtml(root);
                    }
                    initializeAllEmsPricingSummaryTableColumns(root);
                    applyAllTableRowHeightsInRoot(root);
                    scheduleApplyAllTableRowHeightsInEditor(getBody);
                    requestAnimationFrame(() => {
                        const r = getBody();
                        if (!r) return;
                        normalizePastedTables(r);
                        normalizePastedBlockAlignment(r);
                        if (!r.querySelector('table')) {
                            normalizeClauseListHtml(r);
                        }
                        initializeAllEmsPricingSummaryTableColumns(r);
                        scheduleApplyAllTableRowHeightsInEditor(getBody);
                    });
                };
                if (!jodit.__emsClauseDomInit) {
                    jodit.__emsClauseDomInit = true;
                    requestAnimationFrame(initDom);
                } else if (!toolbarOnly) {
                    requestAnimationFrame(() => {
                        const root = getBody();
                        if (!root) return;
                        initializeAllEmsPricingSummaryTableColumns(root);
                        applyAllTableRowHeightsInRoot(root);
                        scheduleApplyAllTableRowHeightsInEditor(getBody);
                    });
                }

                if (useExternalToolbar) {
                    applyPreviewInlineWorkplaceLayout(jodit);
                    requestAnimationFrame(() => {
                        applyPreviewInlineWorkplaceLayout(jodit);
                        requestAnimationFrame(() => {
                            applyPreviewInlineWorkplaceLayout(jodit);
                            scheduleApplyAllTableRowHeightsInEditor(getBody);
                            const root = getBody();
                            if (root?.focus) root.focus({ preventScroll: true });
                            onEditorReadyRef.current?.();
                        });
                    });
                }

                if (!jodit.__emsToolbarFontRefresh) {
                    jodit.__emsToolbarFontRefresh = true;
                    const refreshToolbar = () => {
                        try {
                            syncEmsToolbarColorIndicators(jodit);
                            jodit.e?.fire?.('updateToolbar');
                        } catch (_err) {
                            /* ignore */
                        }
                    };
                    jodit.e.on('change selectionchange afterCommand afterPaste', refreshToolbar);
                    getBody()?.addEventListener?.('mouseup', refreshToolbar);
                    getBody()?.addEventListener?.('keyup', refreshToolbar);
                    requestAnimationFrame(() => refreshToolbar());
                }

                if (!jodit.__emsTablePasteObs && typeof MutationObserver !== 'undefined') {
                    const root = getBody();
                    if (root) {
                        jodit.__emsTablePasteObs = true;
                        let scheduled = false;
                        const obs = new MutationObserver((records) => {
                            if (isClauseEditorSelectionInTable(jodit)) return;
                            if (jodit.__emsOfficePastePostProcess || jodit.__emsOfficePasteLock) return;
                            const newTablePasted = records.some((r) =>
                                Array.from(r.addedNodes || []).some(
                                    (n) =>
                                        n.nodeType === 1 &&
                                        (n.tagName === 'TABLE' || n.querySelector?.('table'))
                                )
                            );
                            if (!newTablePasted || scheduled) return;
                            if (isTableStructureResizeActive(root)) return;
                            scheduled = true;
                            requestAnimationFrame(() => {
                                scheduled = false;
                                normalizePastedTables(getBody());
                            });
                        });
                        obs.observe(root, {
                            childList: true,
                            subtree: true,
                        });
                        jodit.e.on('beforeDestruct', () => obs.disconnect());
                    }
                }

                const rootForCaret = getBody();
                if (rootForCaret && !jodit.__emsTableCaretMemoryBound) {
                    jodit.__emsTableCaretMemoryBound = true;
                    const onRememberTableCaret = () => rememberTableCellCaretBookmark(jodit);
                    rootForCaret.addEventListener('keyup', onRememberTableCaret, true);
                    rootForCaret.addEventListener('mouseup', onRememberTableCaret, true);
                    jodit.e.on('beforeDestruct.emsTableCaretMemory', () => {
                        rootForCaret.removeEventListener('keyup', onRememberTableCaret, true);
                        rootForCaret.removeEventListener('mouseup', onRememberTableCaret, true);
                    });
                }

                bindTableCellHistoryRecorder(jodit, getBody);
                bindOfficePasteHistoryGuard(jodit);
                bindClauseEditorUndoHotkeys(jodit, getBody);

                if (!toolbarOnly) {
                    if (useExternalToolbar && host) {
                        installClauseEditorUndoHooks(jodit, {
                            onGlobalUndo: () => host.__emsClauseHistoryUndo?.() ?? false,
                            onGlobalRedo: () => host.__emsClauseHistoryRedo?.() ?? false,
                        });
                    } else {
                        installClauseEditorUndoHooks(jodit);
                    }
                }

                jodit.e.on('emsTableHistoryApplied.emsClausePreview', () => {
                    if (!useExternalToolbar) {
                        requestAnimationFrame(() => h().syncEditorToParent?.());
                        return;
                    }
                    requestAnimationFrame(() => {
                        const flushHost = document.getElementById(EMS_QUOTE_PREVIEW_TOOLBAR_ID);
                        flushHost?.__emsFlushActiveClauseEditorSync?.({
                            recordHistory: false,
                        });
                    });
                });

                jodit.e.on('afterCommand.emsClausePreview', (command) => {
                    const cmd = String(command || '').toLowerCase();
                    if (
                        /^(forecolor|background|bold|italic|underline|strikethrough|brush|justify|emstablevalign|table)/.test(
                            cmd
                        )
                    ) {
                        requestAnimationFrame(() => h().syncEditorToParent?.());
                    }
                });

                const schedulePricingRecalcSync = () => {
                    if (jodit.__emsForceCaretRestore) return;
                    if (jodit.__emsRowResizing || jodit.__emsColResizing) return;
                    if (isClauseEditorTypingActive(jodit)) {
                        jodit.__emsPendingPricingRecalc = true;
                        return;
                    }
                    if (jodit.__emsDeleteKeyLock) {
                        jodit.__emsPendingPricingRecalc = true;
                        return;
                    }
                    if (jodit.__emsListApplyLock) {
                        jodit.__emsPendingPricingRecalc = true;
                        return;
                    }
                    if (jodit.__emsSpellScanRunning) {
                        jodit.__emsPendingPricingRecalc = true;
                        return;
                    }
                    if (
                        jodit.__emsListApplyCaretLi?.isConnected ||
                        jodit.__emsEnterContinueCaretBlock?.isConnected
                    ) {
                        jodit.__emsPendingPricingRecalc = true;
                        return;
                    }
                    if (jodit.__emsPricingRecalcTimer) clearTimeout(jodit.__emsPricingRecalcTimer);
                    jodit.__emsPricingRecalcTimer = setTimeout(() => {
                        jodit.__emsPricingRecalcTimer = null;
                        if (isClauseEditorTypingActive(jodit)) {
                            jodit.__emsPendingPricingRecalc = true;
                            return;
                        }
                        requestAnimationFrame(() => h().syncEditorToParent?.());
                    }, useExternalToolbar ? 180 : 120);
                };

                const NAVIGATION_KEYS = new Set([
                    'ArrowLeft',
                    'ArrowRight',
                    'ArrowUp',
                    'ArrowDown',
                    'Home',
                    'End',
                    'PageUp',
                    'PageDown',
                ]);
                const onKeyUpForPricingRecalc = (e) => {
                    if (e?.ctrlKey || e?.metaKey || e?.altKey) return;
                    if (NAVIGATION_KEYS.has(e?.key)) return;
                    if (e?.key === 'Enter') {
                        onEditorReflowRef.current?.();
                    }
                    schedulePricingRecalcSync();
                };

                // Table cell / row edits often skip jodit-react onChange — debounced push recalculates totals in parent.
                jodit.e.on('change.emsPricingRecalc', schedulePricingRecalcSync);
                jodit.e.on('keyup.emsPricingRecalc', onKeyUpForPricingRecalc);
                jodit.e.on('afterInsertNode.emsPricingRecalc', (node) => {
                    const el = node?.nodeType === 1 ? node : node?.parentElement;
                    if (el?.closest?.(`#${EMS_AUTO_PRICE_SUMMARY_TABLE_ID}`)) {
                        schedulePricingRecalcSync();
                    }
                });
                // Flush live DOM when leaving the editor.
                jodit.e.on('blur.emsClausePreview', () => {
                    if (jodit.__emsPricingRecalcTimer) {
                        clearTimeout(jodit.__emsPricingRecalcTimer);
                        jodit.__emsPricingRecalcTimer = null;
                    }
                    jodit.__emsTypingLock = false;
                    const root = h().getEditorBody?.();
                    if (root) {
                        withJoditHistoryBlocked(jodit, () => {
                            preserveClauseEditorSelectionDuring(jodit, () => {
                                if (!root.querySelector('table')) {
                                    normalizeClauseListHtml(root);
                                }
                                stripClauseEditorSpuriousBlankRows(root);
                                finalizeAllOfficePasteTablesFormatting(
                                    root,
                                    root.ownerDocument?.defaultView
                                );
                                stabilizeClauseEditorTablesForExport(root);
                            });
                        });
                    }
                    void h().syncEditorToParent?.().finally(() => {
                        onEditorBlurRef.current?.();
                    });
                });
                jodit.e.on('beforeDestruct.emsPricingRecalc', () => {
                    if (jodit.__emsPricingRecalcTimer) clearTimeout(jodit.__emsPricingRecalcTimer);
                });

                jodit.e.on('toggleFullSize.emsClause', (enable) => {
                    const wrapEl = h().wrapperRef?.current;
                    const container = jodit.container;
                    if (wrapEl) wrapEl.classList.toggle('clause-editor-fullsize', !!enable);
                    if (container) {
                        if (enable) {
                            container.style.setProperty('width', '100vw', 'important');
                            container.style.setProperty('height', '100vh', 'important');
                            container.style.setProperty('max-width', 'none', 'important');
                        } else {
                            container.style.removeProperty('width');
                            container.style.removeProperty('height');
                            container.style.removeProperty('max-width');
                        }
                    }
                    document.body.style.overflow = enable ? 'hidden' : '';
                });
            },
        },
    }), [
        style?.height,
        style?.minHeight,
        useExternalToolbar,
        toolbarOnly,
        toolbarSharedWithKeeper,
        applyPreviewInlineWorkplaceLayout,
        runClauseHistoryToolbarCommand,
    ]);

    const emitChangeFromDom = useCallback(
        (newContent) => {
            const jodit = joditInstRef.current || editor.current;
            if (jodit?.__emsApplyingClauseHistory) {
                return;
            }
            if (jodit?.__emsOfficePastePostProcess || jodit?.__emsOfficePasteLock) {
                return;
            }
            if (jodit?.__emsForceCaretRestore) {
                return;
            }
            if (jodit?.__emsSpellScanRunning) {
                return;
            }
            if (jodit?.__emsDeleteKeyLock) {
                jodit.__emsPendingChangeEmit = true;
                return;
            }
            if (jodit?.__emsListApplyLock) {
                return;
            }
            const root = getEditorBody();
            let content = newContent ?? '';
            if (root) {
                content = root.innerHTML;
            } else if (content.includes('<table')) {
                content = newContent ?? '';
            }
            const skipListNormalize =
                jodit?.__emsOfficePasteLock ||
                jodit?.__emsListApplyCaretLi?.isConnected ||
                jodit?.__emsEnterContinueCaretBlock?.isConnected ||
                isClauseEditorSelectionInTable(jodit) ||
                clauseEditorHtmlContainsTable(content);
            const normalized = stripClauseEditorExportEmptyNodes(
                skipListNormalize ? content : normalizeClauseListHtmlInString(content)
            );
            if (normalized === lastEmittedRef.current) return;
            const fromParent = onChangeRef.current(normalized);
            lastEmittedRef.current = typeof fromParent === 'string' ? fromParent : normalized;
        },
        [getEditorBody]
    );

    const handleChange = useCallback(
        (newContent) => {
            const jodit = joditInstRef.current || editor.current;
            if (jodit?.__emsTypingLock) {
                jodit.__emsPendingChangeEmit = true;
                return;
            }
            emitChangeFromDom(newContent);
        },
        [emitChangeFromDom]
    );

    handlersRef.current = {
        cleanupAfterPaste,
        processPasteHandler,
        beforePastePreferOfficeHtml,
        insertOfficeTableFromClipboard,
        syncEditorToParent,
        emitChangeFromDom,
        getEditorBody,
        wrapperRef,
    };

    /** MUST be stable — jodit-react re-inits Jodit when `editorRef` identity changes (destroys typed text). */
    const bindEditorInstance = useCallback((inst) => {
        joditInstRef.current = inst;
    }, []);

    useEffect(() => {
        if (!useExternalToolbar || toolbarOnly || !toolbarSharedWithKeeper) return undefined;
        const host = document.getElementById(EMS_QUOTE_PREVIEW_TOOLBAR_ID);
        const jodit = joditInstRef.current;
        if (!host || !jodit) return undefined;
        bindQuotePreviewSharedToolbar(jodit, host);
        return () => {
            releaseQuotePreviewSharedToolbar(jodit, host);
        };
    }, [useExternalToolbar, toolbarSharedWithKeeper, toolbarOnly, toolbarMountKey]);

    useEffect(() => {
        if (!useExternalToolbar) return undefined;
        let raf2 = 0;
        const run = () => {
            const jodit = joditInstRef.current;
            if (jodit) {
                applyPreviewInlineWorkplaceLayout(jodit);
                scheduleApplyAllTableRowHeightsInEditor(
                    () =>
                        jodit.editor ||
                        wrapperRef.current?.querySelector('.jodit-wysiwyg') ||
                        null
                );
            }
        };
        run();
        const raf1 = requestAnimationFrame(() => {
            run();
            raf2 = requestAnimationFrame(run);
        });
        return () => {
            cancelAnimationFrame(raf1);
            cancelAnimationFrame(raf2);
        };
    }, [useExternalToolbar, toolbarMountKey, applyPreviewInlineWorkplaceLayout]);

    return (
        <div
            ref={wrapperRef}
            style={{ width: '100%', minHeight: 0, ...style, display: 'flex', flexDirection: 'column' }}
            className={`clause-editor-wrapper${
                useExternalToolbar ? ' clause-editor-external-toolbar' : ''
            }${toolbarOnly ? ' clause-editor-toolbar-only' : ''}`}
        >
            <JoditEditor
                ref={editor}
                editorRef={bindEditorInstance}
                config={config}
                tabIndex={1}
                onChange={handleChange}
            />
            <style>
                {`
                .clause-editor-wrapper .jodit-container {
                     border: 1px solid #e2e8f0 !important;
                     border-radius: 4px;
                     display: flex !important;
                     flex-direction: column !important;
                     width: 100% !important;
                     min-height: 0 !important;
                }
                /* Fullscreen — escape narrow left panel (100% !important was blocking Jodit resize). */
                .clause-editor-wrapper .jodit-container.jodit_fullsize,
                .clause-editor-wrapper.clause-editor-fullsize .jodit-container {
                    position: fixed !important;
                    top: 0 !important;
                    left: 0 !important;
                    right: 0 !important;
                    bottom: 0 !important;
                    width: 100vw !important;
                    height: 100vh !important;
                    max-width: none !important;
                    min-width: 0 !important;
                    margin: 0 !important;
                    border-radius: 0 !important;
                    z-index: 100001 !important;
                }
                .clause-editor-wrapper .jodit-container.jodit_fullsize .jodit-workplace,
                .clause-editor-wrapper.clause-editor-fullsize .jodit-workplace {
                    flex: 1 1 auto !important;
                    min-height: 0 !important;
                    height: auto !important;
                    overflow: auto !important;
                }
                .clause-editor-wrapper.clause-editor-fullsize {
                    position: static !important;
                    z-index: 100001 !important;
                    overflow: visible !important;
                }
                .clause-editor-wrapper .jodit-toolbar__box {
                    background-color: #dfe8f4;
                    border-bottom: 1px solid #b8c6da;
                    flex-shrink: 0;
                    padding: 0 1px !important;
                    overflow: hidden !important;
                    min-height: 28px !important;
                }
                .clause-editor-wrapper .jodit-toolbar-editor-collection {
                    gap: 0 !important;
                    flex-wrap: nowrap !important;
                }
                .clause-editor-wrapper .jodit-ui-group {
                    gap: 0 !important;
                    margin: 0 !important;
                    flex-wrap: nowrap !important;
                }
                /* Compact sizing — main toolbar only (not popups / dropdown lists). */
                .clause-editor-wrapper .jodit-toolbar__box .jodit-toolbar-button {
                    width: 20px !important;
                    height: 20px !important;
                    min-width: 20px !important;
                    margin: 0 !important;
                }
                .clause-editor-wrapper .jodit-toolbar__box .jodit-toolbar-button__button {
                    width: 20px !important;
                    height: 20px !important;
                    min-height: 20px !important;
                    padding: 0 !important;
                }
                .clause-editor-wrapper .jodit-toolbar__box .jodit-toolbar-button__icon,
                .clause-editor-wrapper .jodit-toolbar__box .jodit-toolbar-button__icon svg {
                    width: 12px !important;
                    height: 12px !important;
                }
                .clause-editor-wrapper .jodit-toolbar__box .jodit-toolbar-button__text {
                    font-size: 10px !important;
                    line-height: 1 !important;
                }
                .clause-editor-wrapper .jodit-toolbar__box .jodit-toolbar-select[data-ref="font"],
                .clause-editor-wrapper .jodit-toolbar__box .jodit-toolbar-button[data-ref="font"],
                .clause-editor-wrapper .jodit-toolbar__box .jodit-toolbar-button_font {
                    min-width: 112px !important;
                    max-width: 128px !important;
                    width: auto !important;
                }
                .clause-editor-wrapper .jodit-toolbar__box .jodit-toolbar-select[data-ref="fontsize"],
                .clause-editor-wrapper .jodit-toolbar__box .jodit-toolbar-button[data-ref="fontsize"],
                .clause-editor-wrapper .jodit-toolbar__box .jodit-toolbar-button_fontsize {
                    min-width: 44px !important;
                    width: auto !important;
                }
                .clause-editor-wrapper .jodit-toolbar__box .jodit-toolbar-button[data-ref="font"] .jodit-toolbar-button__icon,
                .clause-editor-wrapper .jodit-toolbar__box .jodit-toolbar-button[data-ref="fontsize"] .jodit-toolbar-button__icon,
                .clause-editor-wrapper .jodit-toolbar__box .jodit-toolbar-button_font .jodit-toolbar-button__icon,
                .clause-editor-wrapper .jodit-toolbar__box .jodit-toolbar-button_fontsize .jodit-toolbar-button__icon {
                    display: none !important;
                    width: 0 !important;
                    min-width: 0 !important;
                    margin: 0 !important;
                    padding: 0 !important;
                }
                .clause-editor-wrapper .jodit-toolbar__box .jodit-toolbar-select[data-ref="font"] .jodit-toolbar-button__text,
                .clause-editor-wrapper .jodit-toolbar__box .jodit-toolbar-select[data-ref="fontsize"] .jodit-toolbar-button__text,
                .clause-editor-wrapper .jodit-toolbar__box .jodit-toolbar-button[data-ref="font"] .jodit-toolbar-button__text,
                .clause-editor-wrapper .jodit-toolbar__box .jodit-toolbar-button[data-ref="fontsize"] .jodit-toolbar-button__text,
                .clause-editor-wrapper .jodit-toolbar__box .jodit-toolbar-button_font .jodit-toolbar-button__text,
                .clause-editor-wrapper .jodit-toolbar__box .jodit-toolbar-button_fontsize .jodit-toolbar-button__text {
                    display: inline-flex !important;
                    visibility: visible !important;
                    opacity: 1 !important;
                    font-size: 12px !important;
                    line-height: 1.2 !important;
                    white-space: nowrap !important;
                    overflow: visible !important;
                    text-overflow: clip !important;
                    max-width: none !important;
                    padding: 0 2px !important;
                }
                .clause-editor-wrapper .jodit-toolbar__box .jodit-toolbar-button[data-ref="font"],
                .clause-editor-wrapper .jodit-toolbar__box .jodit-toolbar-button[data-ref="fontsize"],
                .clause-editor-wrapper .jodit-toolbar__box .jodit-toolbar-button_font,
                .clause-editor-wrapper .jodit-toolbar__box .jodit-toolbar-button_fontsize {
                    padding-left: 4px !important;
                    padding-right: 2px !important;
                }
                .clause-editor-wrapper .jodit-toolbar__box .jodit-toolbar-select[data-ref="font"],
                .clause-editor-wrapper .jodit-toolbar__box .jodit-toolbar-select[data-ref="fontsize"] {
                    display: inline-flex !important;
                    align-items: stretch !important;
                    cursor: pointer !important;
                }
                .clause-editor-wrapper .jodit-toolbar__box .jodit-toolbar-select[data-ref="font"] .jodit-toolbar-button__button,
                .clause-editor-wrapper .jodit-toolbar__box .jodit-toolbar-select[data-ref="fontsize"] .jodit-toolbar-button__button {
                    flex: 1 1 auto !important;
                    cursor: pointer !important;
                }
                /* Text color toolbar icon (A + underline). */
                .clause-editor-wrapper .ems-toolbar-forecolor-icon {
                    display: inline-block;
                    font-weight: 700;
                    font-size: 13px;
                    line-height: 1;
                    position: relative;
                    width: 12px;
                    text-align: center;
                    color: #334155;
                    padding-bottom: 4px;
                }
                .clause-editor-wrapper .ems-toolbar-forecolor-icon::after {
                    content: '';
                    position: absolute;
                    left: -1px;
                    right: -1px;
                    bottom: 0;
                    height: 3px;
                    background: var(--ems-forecolor-bar, #dc2626);
                    border-radius: 1px;
                }
                .clause-editor-wrapper .ems-toolbar-bgcolor-icon {
                    display: inline-flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: flex-end;
                    gap: 1px;
                    vertical-align: middle;
                    line-height: 1;
                    width: 18px;
                    height: 20px;
                    box-sizing: border-box;
                }
                .clause-editor-wrapper .ems-toolbar-bgcolor-icon__glyph {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    line-height: 0;
                }
                .clause-editor-wrapper .ems-toolbar-bgcolor-icon__svg {
                    display: block;
                    width: 16px;
                    height: 13px;
                }
                .clause-editor-wrapper .ems-toolbar-bgcolor-icon__bar {
                    display: block;
                    width: 18px;
                    height: 4px;
                    border: 1px solid #8a8886;
                    background: #ffffff;
                    border-radius: 0;
                    box-sizing: border-box;
                }
                .clause-editor-wrapper .jodit-toolbar-button[data-ref="emsBackground"] .jodit-toolbar-button__button {
                    width: auto !important;
                    min-width: 22px !important;
                    padding: 1px 2px !important;
                }
                .clause-editor-wrapper .jodit-toolbar-button[data-ref="emsBackground"].jodit-toolbar-button_with-trigger_true {
                    min-width: 34px !important;
                }
                .clause-editor-wrapper .jodit-toolbar-button[data-ref="emsBackground"] .jodit-toolbar-button__trigger {
                    margin-left: 0 !important;
                }
                .clause-editor-wrapper .ems-toolbar-table-border-icon {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 20px;
                    height: 18px;
                }
                .clause-editor-wrapper .jodit-color-picker .ems-bgcolor-none-row {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    margin-bottom: 6px;
                    padding-bottom: 6px;
                    border-bottom: 1px solid #e2e8f0;
                }
                .clause-editor-wrapper .jodit-color-picker .ems-bgcolor-none-item {
                    background: #ffffff !important;
                    background-image: linear-gradient(
                        to bottom left,
                        transparent calc(50% - 1px),
                        #dc2626 calc(50% - 1px),
                        #dc2626 calc(50% + 1px),
                        transparent calc(50% + 1px)
                    ) !important;
                    border: 1px solid #94a3b8 !important;
                    cursor: pointer;
                }
                .clause-editor-wrapper .jodit-color-picker .ems-bgcolor-none-label {
                    font-size: 11px;
                    color: #334155;
                    cursor: pointer;
                    user-select: none;
                }
                /* Split buttons need room for the dropdown chevron (22px width was clipping it). */
                .clause-editor-wrapper .jodit-toolbar__box .jodit-toolbar-button_with-trigger_true {
                    width: auto !important;
                    min-width: 28px !important;
                }
                .clause-editor-wrapper .jodit-toolbar__box .jodit-toolbar-button_with-trigger_true .jodit-toolbar-button__button {
                    width: 18px !important;
                    min-width: 18px !important;
                }
                .clause-editor-wrapper .jodit-toolbar__box .jodit-toolbar-select {
                    height: 22px !important;
                    min-width: auto !important;
                }
                .clause-editor-wrapper .jodit-toolbar__box .jodit-toolbar-button__trigger,
                .clause-editor-wrapper .jodit-toolbar__box .jodit-toolbar-select__trigger {
                    opacity: 0.9 !important;
                    flex-shrink: 0;
                    width: 10px !important;
                    min-width: 10px !important;
                    color: #334155;
                }
                .clause-editor-wrapper .jodit-toolbar__box .jodit-toolbar-button__trigger svg,
                .clause-editor-wrapper .jodit-toolbar__box .jodit-toolbar-select__trigger svg {
                    width: 8px !important;
                    height: 8px !important;
                    fill: #334155 !important;
                    stroke: #334155 !important;
                    opacity: 1 !important;
                }
                /* Word-style spell check — blue wavy underline on misspelled words. */
                .clause-editor-wrapper .ems-spell-mark {
                    text-decoration: underline wavy #0078d4;
                    text-decoration-color: #0078d4;
                    text-decoration-style: wavy;
                    text-underline-offset: 2px;
                    text-decoration-skip-ink: none;
                }
                .clause-editor-wrapper .jodit-wysiwyg[spellcheck="true"] ::spelling-error {
                    text-decoration: underline wavy #0078d4 !important;
                    text-decoration-color: #0078d4 !important;
                    text-decoration-style: wavy !important;
                }
                .ems-spell-context-menu {
                    min-width: 180px;
                    padding: 4px 0;
                    background: #ffffff;
                    border: 1px solid #e2e8f0;
                    border-radius: 6px;
                    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
                }
                .ems-spell-context-menu__title {
                    padding: 6px 14px 4px;
                    font-size: 11px;
                    font-weight: 600;
                    color: #64748b;
                    user-select: none;
                }
                .ems-spell-context-menu__empty {
                    padding: 8px 14px 10px;
                    font-size: 12px;
                    color: #94a3b8;
                    font-style: italic;
                }
                .ems-spell-context-menu__loading {
                    padding: 8px 14px 10px;
                    font-size: 12px;
                    color: #64748b;
                    font-style: italic;
                }
                .ems-spell-context-menu__item {
                    display: block;
                    width: 100%;
                    box-sizing: border-box;
                    padding: 8px 14px;
                    border: none;
                    background: transparent;
                    text-align: left;
                    font-size: 13px;
                    line-height: 1.35;
                    font-family: inherit;
                    color: #1e293b;
                    cursor: pointer;
                    white-space: nowrap;
                }
                .ems-spell-context-menu__item:hover,
                .ems-spell-context-menu__item:focus-visible {
                    background: #f1f5f9;
                    outline: none;
                }
                /* Table right-click — custom text list menu (not Jodit icon toolbar). */
                .ems-table-cells-context-menu {
                    min-width: 210px;
                    padding: 4px 0;
                    background: #ffffff;
                    border: 1px solid #e2e8f0;
                    border-radius: 6px;
                    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
                }
                .ems-table-cells-context-menu__item {
                    display: block;
                    width: 100%;
                    box-sizing: border-box;
                    padding: 8px 14px;
                    border: none;
                    background: transparent;
                    text-align: left;
                    font-size: 13px;
                    line-height: 1.35;
                    font-family: inherit;
                    color: #1e293b;
                    cursor: pointer;
                    white-space: nowrap;
                }
                .ems-table-cells-context-menu__item:hover,
                .ems-table-cells-context-menu__item:focus-visible {
                    background: #f1f5f9;
                    outline: none;
                }
                .ems-table-cells-context-menu__sep {
                    height: 1px;
                    margin: 4px 0;
                    background: #e2e8f0;
                }
                .jodit-popup.ems-table-cells-context-popup .jodit-popup__content,
                .clause-editor-wrapper .jodit-popup.ems-table-cells-context-popup .jodit-popup__content {
                    padding: 0 !important;
                    min-width: 0 !important;
                    background: transparent !important;
                    border: none !important;
                    box-shadow: none !important;
                }
                .clause-editor-wrapper .jodit-popup__content {
                    min-width: 188px;
                    padding: 4px 0 !important;
                }
                .clause-editor-wrapper .jodit-popup .jodit-toolbar-button,
                .clause-editor-wrapper .jodit-popup .jodit-toolbar-button__button,
                .clause-editor-wrapper .jodit-popup .jodit-ui-button,
                .clause-editor-wrapper .jodit-popup .jodit-ui-button button {
                    width: auto !important;
                    min-width: 0 !important;
                    max-width: none !important;
                    height: auto !important;
                    min-height: 30px !important;
                    margin: 0 !important;
                }
                .clause-editor-wrapper .jodit-popup .jodit-toolbar-button__text,
                .clause-editor-wrapper .jodit-popup .jodit-ui-button-icon-text__text {
                    display: inline-flex !important;
                    font-size: 13px !important;
                    line-height: 1.35 !important;
                    white-space: nowrap !important;
                    overflow: visible !important;
                    text-overflow: clip !important;
                }
                .clause-editor-wrapper .jodit-popup .jodit-toolbar-button_with-trigger_true {
                    width: 100% !important;
                    min-width: 0 !important;
                }
                .clause-editor-wrapper .jodit-popup .jodit-toolbar-button_with-trigger_true .jodit-toolbar-button__button {
                    width: auto !important;
                    min-width: 0 !important;
                    flex: 1 1 auto !important;
                }
                .clause-editor-wrapper .jodit-popup .jodit-toolbar-editor-collection_mode_vertical,
                .clause-editor-wrapper .jodit-popup .jodit-ui-group_line_true {
                    flex-direction: column !important;
                    align-items: stretch !important;
                    width: 100% !important;
                    min-width: 168px !important;
                }
                .clause-editor-wrapper .jodit-popup .jodit-toolbar-editor-collection_mode_vertical .jodit-toolbar-button,
                .clause-editor-wrapper .jodit-popup .jodit-ui-group_line_true .jodit-ui-button {
                    width: 100% !important;
                    justify-content: flex-start !important;
                }
                .clause-editor-wrapper .jodit-workplace {
                    overflow: auto !important;
                    flex: 1 1 auto !important;
                    min-height: 0 !important;
                }
                /* Add-line floaters must not cover the horizontal scrollbar; image resizer stays visible. */
                .clause-editor-wrapper .jodit-add-new-line {
                    display: none !important;
                    pointer-events: none !important;
                    visibility: hidden !important;
                }
                .clause-editor-wrapper .jodit-resizer,
                .clause-editor-wrapper .jodit-workplace > .jodit-resizer {
                    z-index: 10000007 !important;
                    pointer-events: none !important;
                    outline-width: 2px !important;
                }
                .clause-editor-wrapper .jodit-resizer > div {
                    pointer-events: auto !important;
                    --ems-img-resizer-handle: 18px;
                    width: calc(var(--ems-img-resizer-handle) / var(--quote-preview-zoom, 1)) !important;
                    height: calc(var(--ems-img-resizer-handle) / var(--quote-preview-zoom, 1)) !important;
                    background-color: #2563eb !important;
                    border: 2px solid #fff !important;
                    box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.45);
                    box-sizing: border-box !important;
                }
                .clause-editor-wrapper .jodit-resizer > div:hover,
                .clause-editor-wrapper .jodit-resizer > div.ems-img-resizer-active {
                    background-color: #1d4ed8 !important;
                }
                .clause-editor-wrapper .jodit-resizer > div:nth-child(1) {
                    top: calc(var(--ems-img-resizer-handle) / var(--quote-preview-zoom, 1) / -2) !important;
                    left: calc(var(--ems-img-resizer-handle) / var(--quote-preview-zoom, 1) / -2) !important;
                }
                .clause-editor-wrapper .jodit-resizer > div:nth-child(2) {
                    top: calc(var(--ems-img-resizer-handle) / var(--quote-preview-zoom, 1) / -2) !important;
                    right: calc(var(--ems-img-resizer-handle) / var(--quote-preview-zoom, 1) / -2) !important;
                }
                .clause-editor-wrapper .jodit-resizer > div:nth-child(3) {
                    right: calc(var(--ems-img-resizer-handle) / var(--quote-preview-zoom, 1) / -2) !important;
                    bottom: calc(var(--ems-img-resizer-handle) / var(--quote-preview-zoom, 1) / -2) !important;
                }
                .clause-editor-wrapper .jodit-resizer > div:nth-child(4) {
                    bottom: calc(var(--ems-img-resizer-handle) / var(--quote-preview-zoom, 1) / -2) !important;
                    left: calc(var(--ems-img-resizer-handle) / var(--quote-preview-zoom, 1) / -2) !important;
                }
                /* Resizer is reparented to body for zoom alignment — keep handles clickable. */
                body > .jodit-resizer {
                    z-index: 10000008 !important;
                    pointer-events: none !important;
                }
                body > .jodit-resizer > div {
                    pointer-events: auto !important;
                    --ems-img-resizer-handle: 18px;
                    width: calc(var(--ems-img-resizer-handle) / var(--quote-preview-zoom, 1)) !important;
                    height: calc(var(--ems-img-resizer-handle) / var(--quote-preview-zoom, 1)) !important;
                    background-color: #2563eb !important;
                    border: 2px solid #fff !important;
                    box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.45);
                    box-sizing: border-box !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg img.ems-img-resizer-target,
                #quote-preview img.ems-img-resizer-target {
                    max-width: none !important;
                    max-height: none !important;
                }
                .clause-editor-wrapper .jodit-table-resizer {
                    display: none !important;
                    pointer-events: none !important;
                }
                /* Column resize cursor only on the drag handle — not the whole cell. */
                .ems-table-col-resizer {
                    position: fixed;
                    z-index: 10000006;
                    width: 10px;
                    margin-left: -5px;
                    cursor: col-resize !important;
                    pointer-events: auto !important;
                    display: block !important;
                    background: rgba(30, 136, 229, 0.12);
                }
                .ems-table-col-resizer:hover,
                .ems-table-col-resizer_moved {
                    background-color: rgba(30, 136, 229, 0.35);
                }
                /* Row resize (EMS) — thin visual line; wider invisible hit area on the handle only. */
                .ems-table-row-resizer {
                    position: fixed;
                    z-index: 10000006;
                    height: 14px;
                    margin-top: 0;
                    cursor: row-resize !important;
                    pointer-events: auto !important;
                    display: block !important;
                    background: transparent;
                    box-shadow: none;
                }
                .ems-table-row-resizer::after {
                    content: '';
                    position: absolute;
                    left: 0;
                    right: 0;
                    top: 50%;
                    transform: translateY(-50%);
                    height: 2px;
                    background: rgba(30, 136, 229, 0.45);
                    border-radius: 1px;
                    pointer-events: none;
                }
                .ems-table-row-resizer:hover::after,
                .ems-table-row-resizer.ems-table-row-resizer_moved::after {
                    height: 3px;
                    background: rgba(21, 101, 192, 0.92);
                }
                .clause-editor-wrapper .jodit-wysiwyg table[data-ems-row-resize-active="1"] tr[data-ems-row-resize-target="1"] td,
                .clause-editor-wrapper .jodit-wysiwyg table[data-ems-row-resize-active="1"] tr[data-ems-row-resize-target="1"] th {
                    cursor: inherit !important;
                }
                .clause-editor-wrapper .jodit-workplace {
                    position: relative;
                }
                .clause-editor-wrapper .jodit-workplace::-webkit-scrollbar {
                    height: 14px;
                }
                .clause-editor-wrapper .jodit-workplace::-webkit-scrollbar-thumb {
                    background: #94a3b8;
                    border-radius: 4px;
                }
                /* Single-cell caret: no stray outline; multi-cell blue comes from Jodit selectionCellStyle. */
                .clause-editor-wrapper .jodit-wysiwyg td,
                .clause-editor-wrapper .jodit-wysiwyg th {
                    outline: none;
                }
                /* Multi-cell table selection — blue fill + border (visible on dark Excel header cells). */
                .clause-editor-wrapper .jodit-wysiwyg td.ems-table-cell-selected,
                .clause-editor-wrapper .jodit-wysiwyg th.ems-table-cell-selected {
                    background-color: rgba(30, 136, 229, 0.32) !important;
                    box-shadow: inset 0 0 0 9999px rgba(30, 136, 229, 0.22) !important;
                    outline: 2px solid #1565c0 !important;
                    outline-offset: -2px;
                }
                /* Block cell selection (Word-style) — avoid fighting text highlight while dragging. */
                .clause-editor-wrapper .jodit-wysiwyg table[data-ems-cell-selecting="1"] {
                    user-select: none;
                    -webkit-user-select: none;
                }
                .clause-editor-wrapper .jodit-wysiwyg table[data-ems-cell-selecting="1"] td.ems-table-cell-selected,
                .clause-editor-wrapper .jodit-wysiwyg table[data-ems-cell-selecting="1"] th.ems-table-cell-selected {
                    user-select: none;
                    -webkit-user-select: none;
                }
                /* Visible text caret while typing (including dark header cells). */
                .clause-editor-wrapper .jodit-wysiwyg,
                .clause-editor-wrapper .jodit-wysiwyg * {
                    caret-color: #000 !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg ::selection,
                .clause-editor-wrapper .jodit-wysiwyg *::selection {
                    background: rgba(30, 136, 229, 0.35) !important;
                    color: inherit !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg table td p,
                .clause-editor-wrapper .jodit-wysiwyg table th p {
                    text-align: inherit;
                }
                /* No table cell chrome while editing — only EMS multi-select (2+ cells) adds blue. */
                .clause-editor-wrapper .jodit-wysiwyg:focus td,
                .clause-editor-wrapper .jodit-wysiwyg:focus th {
                    outline: none !important;
                }
                /* Left editor only: tight rhythm (~half cursor between paragraphs). */
                .clause-editor-wrapper:not(.clause-editor-external-toolbar) .jodit-wysiwyg {
                    font-family: ${EMS_CLAUSE_EDITOR_FONT_STACK} !important;
                    line-height: 1.25 !important;
                    padding: 6px 8px !important;
                    box-sizing: border-box !important;
                    overflow-x: auto !important;
                    overflow-y: visible !important;
                    min-height: 100%;
                    user-select: text !important;
                    -webkit-user-select: text !important;
                    cursor: auto !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg p,
                .clause-editor-wrapper .jodit-wysiwyg div,
                .clause-editor-wrapper .jodit-wysiwyg span,
                .clause-editor-wrapper .jodit-wysiwyg li,
                .clause-editor-wrapper .jodit-wysiwyg td,
                .clause-editor-wrapper .jodit-wysiwyg th {
                    cursor: auto !important;
                }
                .clause-editor-wrapper .jodit-toolbar__box .jodit-toolbar-button,
                .clause-editor-wrapper .jodit-toolbar__box .jodit-toolbar-button__button,
                .clause-editor-wrapper .jodit-popup .jodit-toolbar-button,
                .clause-editor-wrapper .jodit-popup .jodit-toolbar-button__button {
                    cursor: pointer !important;
                }
                /* Top-level blocks share the same left edge as typed text (not flush to the box border). */
                .clause-editor-wrapper .jodit-wysiwyg > p,
                .clause-editor-wrapper .jodit-wysiwyg > div,
                .clause-editor-wrapper .jodit-wysiwyg > ul,
                .clause-editor-wrapper .jodit-wysiwyg > ol,
                .clause-editor-wrapper .jodit-wysiwyg > blockquote {
                    margin-left: 0 !important;
                    margin-right: 0 !important;
                    text-indent: 0 !important;
                }
                .clause-editor-wrapper:not(.clause-editor-external-toolbar) .jodit-wysiwyg p,
                .clause-editor-wrapper:not(.clause-editor-external-toolbar) .jodit-wysiwyg li {
                    margin-top: 0 !important;
                    margin-bottom: 0 !important;
                    line-height: 1.25 !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg ol:not([class*='ems-num-']) > li,
                .clause-editor-wrapper .jodit-wysiwyg ul:not([class*='ems-bullet-']) > li {
                    display: list-item !important;
                }
                .clause-editor-wrapper:not(.clause-editor-external-toolbar) .jodit-wysiwyg p + p {
                    margin-top: 5px !important;
                }
                /* Default borders for manually inserted tables only — Excel/Word pastes keep inline styles. */
                .clause-editor-wrapper .jodit-wysiwyg table:not([data-ems-paste-source="office"]),
                .clause-editor-wrapper .jodit-wysiwyg table:not([data-ems-paste-source="office"]) td,
                .clause-editor-wrapper .jodit-wysiwyg table:not([data-ems-paste-source="office"]) th {
                    border: 1px solid #64748b !important;
                    border-collapse: collapse !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg table:not([data-ems-paste-source="office"]):not(#ems-auto-price-summary-table):not([data-ems-pricing-cols="fixed"]) thead th,
                .clause-editor-wrapper .jodit-wysiwyg table:not([data-ems-paste-source="office"]):not(#ems-auto-price-summary-table):not([data-ems-pricing-cols="fixed"]) thead td {
                    background-color: #f1f5f9 !important;
                    font-weight: 600 !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg table[data-ems-paste-source="office"] {
                    border-collapse: collapse !important;
                    border-spacing: 0 !important;
                    table-layout: fixed !important;
                    /* Let inline px width from paste/resize win. */
                    width: auto;
                    max-width: none !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg table {
                    border-collapse: collapse !important;
                    border-spacing: 0 !important;
                    table-layout: fixed !important;
                    /* Let inline px width from paste/resize win. */
                    width: auto;
                    max-width: none !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg table[data-ems-col-widths],
                .clause-editor-wrapper .jodit-wysiwyg table[data-ems-row-heights],
                .clause-editor-wrapper .jodit-wysiwyg table[data-ems-row-heights-custom] {
                    /* Let inline px width from paste/resize win. */
                    width: auto;
                }
                /* EMS auto pricing summary (Clause 4): same column widths as right-side preview. */
                ${EMS_QUOTE_PRICING_TABLE_COLUMN_SYNC_CSS.replace(
                    /table#ems-auto-price-summary-table/g,
                    '.clause-editor-wrapper .jodit-wysiwyg table#ems-auto-price-summary-table'
                )}
                ${EMS_QUOTE_PRICING_TABLE_PRESENTATION_CSS.replace(
                    /table#ems-auto-price-summary-table/g,
                    '.clause-editor-wrapper .jodit-wysiwyg table#ems-auto-price-summary-table'
                ).replace(
                    /table\[data-ems-pricing-cols="fixed"\]/g,
                    '.clause-editor-wrapper .jodit-wysiwyg table[data-ems-pricing-cols="fixed"]'
                )}
                ${EMS_QUOTE_PRICING_TABLE_COMPACT_ROW_CSS.replace(
                    /table#ems-auto-price-summary-table/g,
                    '.clause-editor-wrapper .jodit-wysiwyg table#ems-auto-price-summary-table'
                ).replace(
                    /table\[data-ems-pricing-cols="fixed"\]/g,
                    '.clause-editor-wrapper .jodit-wysiwyg table[data-ems-pricing-cols="fixed"]'
                )}
                .clause-editor-wrapper .jodit-wysiwyg table#ems-auto-price-summary-table {
                    border-collapse: collapse !important;
                    margin-top: 12px !important;
                    margin-bottom: 6px !important;
                    font-size: 11px !important;
                    line-height: 1.25 !important;
                    border: 1px solid #cbd5e1 !important;
                    width: ${EMS_QUOTE_PRICING_TABLE_WIDTH} !important;
                    max-width: ${EMS_QUOTE_PRICING_TABLE_WIDTH} !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg table#ems-auto-price-summary-table th,
                .clause-editor-wrapper .jodit-wysiwyg table#ems-auto-price-summary-table td {
                    border: 0.5px solid #cbd5e1 !important;
                    font-size: 11px !important;
                    color: #0f172a !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg table#ems-auto-price-summary-table tr[data-ems-row="total"] td,
                .clause-editor-wrapper .jodit-wysiwyg table#ems-auto-price-summary-table tr[data-ems-row="vat"] td,
                .clause-editor-wrapper .jodit-wysiwyg table#ems-auto-price-summary-table tr[data-ems-row="grand-vat"] td,
                .clause-editor-wrapper .jodit-wysiwyg table#ems-auto-price-summary-table tr[data-ems-row="grand"] td {
                    background: ${EMS_QUOTE_PRICING_TABLE_TOTAL_BG} !important;
                    font-weight: 700 !important;
                    border-top: 1px solid #94a3b8 !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg table#ems-auto-price-summary-table th:nth-child(2),
                .clause-editor-wrapper .jodit-wysiwyg table#ems-auto-price-summary-table td:nth-child(2),
                .clause-editor-wrapper .jodit-wysiwyg table#ems-auto-price-summary-table td[data-ems-amount],
                .clause-editor-wrapper .jodit-wysiwyg table#ems-auto-price-summary-table tr[data-ems-row="total"] td:first-child,
                .clause-editor-wrapper .jodit-wysiwyg table#ems-auto-price-summary-table tr[data-ems-row="vat"] td:first-child,
                .clause-editor-wrapper .jodit-wysiwyg table#ems-auto-price-summary-table tr[data-ems-row="grand-vat"] td:first-child,
                .clause-editor-wrapper .jodit-wysiwyg table#ems-auto-price-summary-table tr[data-ems-row="grand"] td:first-child {
                    text-align: right !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg table#ems-auto-price-summary-table[data-ems-row-heights] tr,
                .clause-editor-wrapper .jodit-wysiwyg table#ems-auto-price-summary-table[data-ems-row-heights-custom] tr {
                    box-sizing: border-box !important;
                    overflow: hidden !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg table#ems-auto-price-summary-table[data-ems-row-heights] td,
                .clause-editor-wrapper .jodit-wysiwyg table#ems-auto-price-summary-table[data-ems-row-heights] th,
                .clause-editor-wrapper .jodit-wysiwyg table#ems-auto-price-summary-table[data-ems-row-heights-custom] td,
                .clause-editor-wrapper .jodit-wysiwyg table#ems-auto-price-summary-table[data-ems-row-heights-custom] th {
                    box-sizing: border-box !important;
                    overflow: hidden !important;
                }
                /* Pasted tables from Excel/Word should keep their source rhythm.
                   The cleanup runs in JS, but these rules act as a safety net so
                   the global p / p+p rules above never inflate cell heights. */
                .clause-editor-wrapper .jodit-wysiwyg table {
                    margin-top: 4px !important;
                    margin-bottom: 4px !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg table td[data-ems-valign="top"],
                .clause-editor-wrapper .jodit-wysiwyg table th[data-ems-valign="top"] {
                    vertical-align: top !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg table td[data-ems-valign="middle"],
                .clause-editor-wrapper .jodit-wysiwyg table th[data-ems-valign="middle"] {
                    vertical-align: middle !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg table td[data-ems-valign="bottom"],
                .clause-editor-wrapper .jodit-wysiwyg table th[data-ems-valign="bottom"] {
                    vertical-align: bottom !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg table:not([data-ems-paste-source="office"]) tr,
                .clause-editor-wrapper .jodit-wysiwyg table:not([data-ems-paste-source="office"]) td:not([data-ems-valign]),
                .clause-editor-wrapper .jodit-wysiwyg table:not([data-ems-paste-source="office"]) th:not([data-ems-valign]) {
                    line-height: 1.25 !important;
                    vertical-align: middle !important;
                    box-sizing: border-box !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg table[data-ems-paste-source="office"] tr td,
                .clause-editor-wrapper .jodit-wysiwyg table[data-ems-paste-source="office"] tr th,
                .clause-editor-wrapper .jodit-wysiwyg table[data-ems-col-widths] tr td,
                .clause-editor-wrapper .jodit-wysiwyg table[data-ems-col-widths] tr th,
                .clause-editor-wrapper .jodit-wysiwyg table[data-ems-row-heights] tr td,
                .clause-editor-wrapper .jodit-wysiwyg table[data-ems-row-heights] tr th,
                .clause-editor-wrapper .jodit-wysiwyg table[data-ems-row-heights-custom] tr td,
                .clause-editor-wrapper .jodit-wysiwyg table[data-ems-row-heights-custom] tr th,
                .clause-editor-external-toolbar .jodit-wysiwyg table[data-ems-paste-source="office"] tr td,
                .clause-editor-external-toolbar .jodit-wysiwyg table[data-ems-paste-source="office"] tr th,
                .clause-editor-external-toolbar .jodit-wysiwyg table[data-ems-col-widths] tr td,
                .clause-editor-external-toolbar .jodit-wysiwyg table[data-ems-col-widths] tr th,
                .clause-editor-external-toolbar .jodit-wysiwyg table[data-ems-row-heights] tr td,
                .clause-editor-external-toolbar .jodit-wysiwyg table[data-ems-row-heights] tr th,
                .clause-editor-external-toolbar .jodit-wysiwyg table[data-ems-row-heights-custom] tr td,
                .clause-editor-external-toolbar .jodit-wysiwyg table[data-ems-row-heights-custom] tr th {
                    padding: 0 3px !important;
                    line-height: 1.1 !important;
                    vertical-align: middle !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg table[data-ems-paste-source="office"] td:not([data-ems-valign]),
                .clause-editor-wrapper .jodit-wysiwyg table[data-ems-paste-source="office"] th:not([data-ems-valign]),
                .clause-editor-wrapper .jodit-wysiwyg table[data-ems-col-widths] td:not([data-ems-valign]),
                .clause-editor-wrapper .jodit-wysiwyg table[data-ems-col-widths] th:not([data-ems-valign]),
                .clause-editor-wrapper .jodit-wysiwyg table[data-ems-row-heights] td:not([data-ems-valign]),
                .clause-editor-wrapper .jodit-wysiwyg table[data-ems-row-heights] th:not([data-ems-valign]),
                .clause-editor-wrapper .jodit-wysiwyg table[data-ems-row-heights-custom] td:not([data-ems-valign]),
                .clause-editor-wrapper .jodit-wysiwyg table[data-ems-row-heights-custom] th:not([data-ems-valign]) {
                    box-sizing: border-box !important;
                    vertical-align: top !important;
                    white-space: normal !important;
                    overflow-wrap: anywhere !important;
                    word-break: break-word !important;
                    overflow: hidden !important;
                }
                /* Word often sets nowrap on nested spans/fonts; override at all depths. */
                .clause-editor-wrapper .jodit-wysiwyg table[data-ems-paste-source="office"] td *,
                .clause-editor-wrapper .jodit-wysiwyg table[data-ems-paste-source="office"] th *,
                .clause-editor-wrapper .jodit-wysiwyg table[data-ems-col-widths] td *,
                .clause-editor-wrapper .jodit-wysiwyg table[data-ems-col-widths] th *,
                .clause-editor-wrapper .jodit-wysiwyg table[data-ems-row-heights] td *,
                .clause-editor-wrapper .jodit-wysiwyg table[data-ems-row-heights] th *,
                .clause-editor-wrapper .jodit-wysiwyg table[data-ems-row-heights-custom] td *,
                .clause-editor-wrapper .jodit-wysiwyg table[data-ems-row-heights-custom] th * {
                    white-space: normal !important;
                    overflow-wrap: anywhere !important;
                    word-break: break-word !important;
                    max-width: 100% !important;
                }
                /* Jodit's default is padding: 0.4em (~6px each side) which inflates rows when source
                   inline padding is absent. Use a compact Word-typical default — written WITHOUT
                   !important so an explicit inline 'padding' from the pasted source still wins. */
                .clause-editor-wrapper .jodit-wysiwyg table:not([data-ems-paste-source="office"]) tr td,
                .clause-editor-wrapper .jodit-wysiwyg table:not([data-ems-paste-source="office"]) tr th {
                    padding: 2px 6px;
                }
                .clause-editor-wrapper .jodit-wysiwyg td p,
                .clause-editor-wrapper .jodit-wysiwyg th p,
                .clause-editor-wrapper .jodit-wysiwyg td div,
                .clause-editor-wrapper .jodit-wysiwyg th div,
                .clause-editor-wrapper .jodit-wysiwyg td li,
                .clause-editor-wrapper .jodit-wysiwyg th li,
                .clause-editor-external-toolbar .jodit-wysiwyg td p,
                .clause-editor-external-toolbar .jodit-wysiwyg th p,
                .clause-editor-external-toolbar .jodit-wysiwyg td div,
                .clause-editor-external-toolbar .jodit-wysiwyg th div {
                    margin: 0 !important;
                    padding: 0 !important;
                    line-height: 1.1 !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg td p + p,
                .clause-editor-wrapper .jodit-wysiwyg th p + p {
                    margin-top: 0 !important;
                }
                /* Do not use display:none on cell paragraphs — it hides the text caret in contenteditable. */
                /* Quote preview inline — no internal scrollbars; overflow flows to next A4 page. */
                .clause-editor-external-toolbar {
                    margin: 0 !important;
                    padding: 0 !important;
                }
                .clause-editor-external-toolbar .jodit-container {
                    border: none !important;
                    border-radius: 0 !important;
                    overflow: visible !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    background: transparent !important;
                    width: 100% !important;
                    max-width: 100% !important;
                    min-width: 0 !important;
                }
                .clause-editor-external-toolbar .jodit-workplace {
                    overflow: visible !important;
                    flex: none !important;
                    min-height: 0 !important;
                    min-width: 0 !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    width: 100% !important;
                    max-width: 100% !important;
                    background: transparent !important;
                }
                .clause-editor-external-toolbar .jodit-workplace::-webkit-scrollbar {
                    width: 0 !important;
                    height: 0 !important;
                    display: none !important;
                }
                .clause-editor-external-toolbar.clause-editor-wrapper .jodit-wysiwyg {
                    font-family: inherit !important;
                    line-height: 1.45 !important;
                    padding: 0 !important;
                    margin: 0 !important;
                    position: static !important;
                    min-height: 1.5em !important;
                    height: auto !important;
                }
                .clause-editor-external-toolbar .jodit-wysiwyg {
                    overflow: visible !important;
                    min-height: 1.5em !important;
                    height: auto !important;
                    width: 100% !important;
                    max-width: 100% !important;
                    min-width: 0 !important;
                    padding: 0 !important;
                    line-height: 1.45 !important;
                    box-sizing: border-box !important;
                    white-space: normal !important;
                    word-wrap: break-word !important;
                    overflow-wrap: anywhere !important;
                    background: transparent !important;
                }
                .clause-editor-external-toolbar .jodit-workplace .jodit-wysiwyg {
                    height: auto !important;
                }
                .clause-editor-external-toolbar .jodit-wysiwyg p,
                .clause-editor-external-toolbar .jodit-wysiwyg li {
                    margin-top: 0 !important;
                    margin-bottom: 0 !important;
                    line-height: 1.45 !important;
                    text-indent: 0 !important;
                    margin-right: 0 !important;
                }
                .clause-editor-external-toolbar .jodit-wysiwyg > * + * {
                    margin-top: 1.6px !important;
                }
                .clause-editor-external-toolbar .jodit-wysiwyg p + p {
                    margin-top: 1.6px !important;
                }
                /* Hidden editor shell — only mounts Jodit toolbar into the preview bar when idle. */
                .clause-editor-wrapper.clause-editor-toolbar-only {
                    position: absolute !important;
                    width: 0 !important;
                    height: 0 !important;
                    overflow: hidden !important;
                    opacity: 0 !important;
                    pointer-events: none !important;
                    margin: 0 !important;
                    padding: 0 !important;
                }
                .clause-editor-wrapper.clause-editor-toolbar-only .jodit-container {
                    border: none !important;
                    min-height: 0 !important;
                    height: 0 !important;
                }
                .clause-editor-wrapper.clause-editor-toolbar-only .jodit-workplace,
                .clause-editor-wrapper.clause-editor-toolbar-only .jodit-status-bar {
                    display: none !important;
                    height: 0 !important;
                    min-height: 0 !important;
                    overflow: hidden !important;
                }
                ${CLAUSE_LIST_STYLES_CSS}
                ${EMS_OFFICE_PASTE_TABLE_EDITOR_CSS}
            `}
            </style>
        </div>
    );
};

export default ClauseEditor;
