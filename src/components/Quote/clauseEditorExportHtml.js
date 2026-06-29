/**
 * Normalize clause HTML when leaving the inline editor so preview/PDF match edit-mode height.
 * Jodit often leaves root-level empty <p><br></p> blocks that add a full text row on exit.
 */
import {
    cellHasVisibleBorderStyle,
    propagateOfficePasteRowBackgroundsToCells,
    finalizeOfficePasteTableFormatting,
    snapshotOfficePasteCellPaint,
    EMS_OFFICE_PASTE_TABLE_QUERY,
} from './clauseEditorTable';

function isRootEmptyBlock(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = el.tagName;
    if (tag !== 'P' && tag !== 'DIV') return false;
    if (el.querySelector('img, table, ul, ol, hr, svg')) return false;
    const text = String(el.textContent || '').replace(/\u00a0/g, ' ').trim();
    if (text) return false;
    const html = String(el.innerHTML || '').trim();
    return !html || /^(\s|&nbsp;|<br\s*\/?>)*$/i.test(html);
}

function isLightInvisibleTextColor(color) {
    const compact = String(color || '')
        .replace(/\s/g, '')
        .toLowerCase();
    if (!compact || compact === 'transparent' || compact === 'inherit') return false;
    if (compact === 'white' || compact === '#fff' || compact === '#ffffff' || compact === 'window') {
        return true;
    }
    const rgb = compact.match(/rgba?\((\d+),(\d+),(\d+)/);
    if (rgb) {
        const avg = (+rgb[1] + +rgb[2] + +rgb[3]) / 3;
        return avg > 210;
    }
    return false;
}

/** Word/Excel paste can leave white body text outside tables — invisible in browse/preview. */
export function normalizeClauseProseTextColors(root) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('p, div, span, font, li').forEach((el) => {
        if (el.closest('table')) return;
        if (!el.style) return;
        const color = el.style.getPropertyValue('color');
        if (!isLightInvisibleTextColor(color)) return;
        el.style.removeProperty('color');
        el.style.removeProperty('-webkit-text-fill-color');
    });
}

export function normalizeClauseProseTextColorsInString(html) {
    const raw = String(html || '').trim();
    if (!raw || !/<[a-z][\s>]/i.test(raw)) return raw;
    try {
        const doc = new DOMParser().parseFromString(`<div id="__ems_prose_color_root">${raw}</div>`, 'text/html');
        const root = doc.getElementById('__ems_prose_color_root');
        if (!root) return raw;
        normalizeClauseProseTextColors(root);
        return root.innerHTML.trim();
    } catch {
        return raw;
    }
}

const OFFICE_TABLE_SELECTOR = EMS_OFFICE_PASTE_TABLE_QUERY;

async function blobUrlToDataUrl(blobUrl) {
    const res = await fetch(blobUrl);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/** Convert temporary blob: image URLs to data: URIs so preview/PDF survive leaving edit mode. */
export async function inlineBlobImagesInDomRoot(root) {
    if (!root?.querySelectorAll) return;
    const imgs = [...root.querySelectorAll('img[src^="blob:"]')];
    if (!imgs.length) return;
    await Promise.all(
        imgs.map(async (img) => {
            const src = img.getAttribute('src');
            if (!src || !src.startsWith('blob:')) return;
            try {
                const dataUrl = await blobUrlToDataUrl(src);
                img.setAttribute('src', String(dataUrl));
            } catch (_e) {
                /* blob may already be revoked */
            }
        })
    );
}

export async function inlineBlobImagesInClauseHtml(html) {
    const raw = String(html ?? '');
    if (!raw || !/blob:/i.test(raw)) return raw;
    try {
        const doc = new DOMParser().parseFromString(`<div id="__ems_export_root">${raw}</div>`, 'text/html');
        const root = doc.getElementById('__ems_export_root');
        if (!root) return raw;
        await inlineBlobImagesInDomRoot(root);
        return root.innerHTML.trim();
    } catch {
        return raw;
    }
}

/** Remove Jodit/table-selection artifacts and Excel gridlines cleared in the editor. */
export function sanitizeClauseHtmlForPersist(html) {
    let s = String(html || '').trim();
    if (!s || !/<[a-z][\s>]/i.test(s)) return s;

    try {
        const doc = new DOMParser().parseFromString(`<div id="__ems_export_root">${s}</div>`, 'text/html');
        const root = doc.getElementById('__ems_export_root');
        if (!root) return s;

        root.querySelectorAll('[data-ems-cell-selecting]').forEach((el) => {
            el.removeAttribute('data-ems-cell-selecting');
        });
        root.querySelectorAll('.jodit-table__selected-cell, .jodit_selected_cell, .ems-table-cell-selected').forEach((el) => {
            el.classList.remove('jodit-table__selected-cell', 'jodit_selected_cell', 'ems-table-cell-selected');
        });
        root.querySelectorAll('td[style*="outline"], th[style*="outline"]').forEach((el) => {
            el.style.removeProperty('outline');
        });

        root.querySelectorAll('.ems-spell-mark').forEach((span) => {
            const parent = span.parentNode;
            if (!parent) return;
            while (span.firstChild) parent.insertBefore(span.firstChild, span);
            parent.removeChild(span);
        });

        root.querySelectorAll(OFFICE_TABLE_SELECTOR).forEach((table) => {
            if (!table.getAttribute('data-ems-paste-source')) {
                table.setAttribute('data-ems-paste-source', 'office');
            }
            table.querySelectorAll('td, th').forEach((cell) => snapshotOfficePasteCellPaint(cell, null));
            propagateOfficePasteRowBackgroundsToCells(table, null);
            table.querySelectorAll('td, th').forEach((cell) => snapshotOfficePasteCellPaint(cell, null));
            finalizeOfficePasteTableFormatting(table, null);
            table.querySelectorAll('td, th').forEach((cell) => {
                if (cellHasVisibleBorderStyle(cell) && !cell.hasAttribute('data-ems-cell-border')) {
                    cell.setAttribute('data-ems-cell-border', '1');
                }
            });
        });

        normalizeClauseProseTextColors(root);

        return root.innerHTML.trim();
    } catch {
        return s;
    }
}

/** Strip leading/trailing empty root blocks and stray <br> from editor export HTML. */
export function stripClauseEditorExportEmptyNodes(html) {
    let s = String(html || '').trim();
    if (!s) return s;

    if (!/<[a-z][\s>]/i.test(s)) {
        return s.replace(/(<br\s*\/?>\s*)+$/gi, '').trim();
    }

    try {
        const doc = new DOMParser().parseFromString(`<div id="__ems_export_root">${s}</div>`, 'text/html');
        const root = doc.getElementById('__ems_export_root');
        if (!root) return s;

        while (root.firstElementChild && isRootEmptyBlock(root.firstElementChild)) {
            root.firstElementChild.remove();
        }
        /* Keep trailing empty paragraphs — users add spacing with Enter at end of a line. */

        let out = root.innerHTML.trim();
        out = out.replace(/(<br\s*\/?>\s*)+$/gi, '').trim();
        return sanitizeClauseHtmlForPersist(out);
    } catch {
        return s;
    }
}

/** Full clause export pipeline — empty nodes, list normalization caller, editor artifacts. */
export function finalizeClauseHtmlForPersist(html) {
    return sanitizeClauseHtmlForPersist(stripClauseEditorExportEmptyNodes(html));
}
