/**
 * Separate toolbar buttons for text color and background color (Word-style).
 */

import { ColorPickerWidget } from 'jodit/esm/modules/widget/color-picker/color-picker.js';
import { Dom } from 'jodit/esm/core/dom/dom.js';
import { css } from 'jodit/esm/core/helpers/utils/css.js';
import { dataBind } from 'jodit/esm/core/helpers/utils/data-bind.js';
import { tryApplyToolbarCommandToEditableClauseHeading } from './clauseEditorExternalHeading';
import {
    tryApplyTableCellFormatCommand,
    readUniformTableCellStyle,
    armTableToolbarCellStash,
} from './clauseEditorTable';
import {
    restoreClauseEditorFormatSelection,
    captureClauseEditorSelectionBookmark,
    scheduleClauseEditorSelectionRestore,
} from './clauseEditorListPresets';

function readCurrentColor(editor, mode) {
    const prop = mode === 'forecolor' ? 'color' : 'background-color';
    const tableSample = readUniformTableCellStyle(editor, prop);
    if (tableSample) return tableSample;

    const current = editor?.s?.current?.();
    if (!current || !editor?.editor) return '';
    let found = '';
    Dom.up(
        current,
        (node) => {
            if (!Dom.isHTMLElement(node)) return;
            const val = css(node, prop, true);
            if (val) {
                found = val.toString();
                return true;
            }
        },
        editor.editor
    );
    if (found) return found;
    const box = Dom.closest(current, Dom.isElement, editor.editor) || editor.editor;
    const val = css(box, prop, true);
    return val ? val.toString() : '';
}

/** Keep Word-style color bars in sync with the current selection. */
export function syncEmsToolbarColorIndicators(editor) {
    const root = editor?.toolbar?.container || editor?.container;
    if (!root?.querySelectorAll) return;

    const fg = readCurrentColor(editor, 'forecolor') || '#334155';
    const bg = readCurrentColor(editor, 'background');

    root.querySelectorAll('.ems-toolbar-forecolor-icon').forEach((el) => {
        el.style.color = fg;
        el.style.setProperty('--ems-forecolor-bar', fg);
    });

    const activeBg =
        bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' ? bg : '';
    root.querySelectorAll('.ems-toolbar-bgcolor-icon__bar').forEach((el) => {
        if (activeBg) {
            el.style.backgroundColor = activeBg;
            el.style.borderColor = '#8a8886';
        } else {
            el.style.backgroundColor = '#ffffff';
            el.style.borderColor = '#8a8886';
        }
    });
    root.querySelectorAll('.ems-toolbar-bgcolor-icon__drip').forEach((el) => {
        el.setAttribute('fill', activeBg || '#185abd');
    });
}

function rememberToolbarBackgroundColor(editor, value) {
    const root = editor?.toolbar?.container || editor?.container;
    if (!root?.querySelector) return;
    const btnEl = root.querySelector('.jodit-toolbar-button[data-ref="emsBackground"] .jodit-toolbar-button__button');
    if (btnEl) {
        dataBind(btnEl, 'color', value || '#ffffff');
        dataBind(btnEl, 'color-mode', 'background');
    }
}

function isNoBackgroundColor(value) {
    const v = String(value ?? '').trim().toLowerCase();
    return !v || v === 'transparent' || v === 'rgba(0, 0, 0, 0)' || v === 'inherit' || v === 'none';
}

function applyEmsColorPick(editor, command, value, close) {
    const getBody =
        typeof editor?.__emsClauseEditorBody === 'function'
            ? editor.__emsClauseEditorBody
            : () => editor?.editor || null;
    armTableToolbarCellStash(editor, getBody);
    const pickValue = isNoBackgroundColor(value) && command === 'background' ? '' : value;
    if (tryApplyTableCellFormatCommand(editor, getBody, command, pickValue)) {
        if (typeof editor.synchronizeValues === 'function') {
            editor.synchronizeValues();
        }
        if (command === 'background') {
            rememberToolbarBackgroundColor(editor, pickValue || '#ffffff');
        }
        syncEmsToolbarColorIndicators(editor);
        close?.();
        return;
    }

    const selectionBookmark = captureClauseEditorSelectionBookmark(editor);
    restoreClauseEditorFormatSelection(editor);
    const appliedToHeading = tryApplyToolbarCommandToEditableClauseHeading(
        command,
        value,
        editor?.o?.defaultFontSizePoints || 'pt',
        editor
    );
    if (!appliedToHeading) {
        restoreClauseEditorFormatSelection(editor);
        editor.execCommand(command, false, value);
        scheduleClauseEditorSelectionRestore(editor, selectionBookmark);
    }
    if (typeof editor.synchronizeValues === 'function') {
        editor.synchronizeValues();
    }
    if (command === 'background') {
        rememberToolbarBackgroundColor(editor, pickValue || '#ffffff');
    }
    syncEmsToolbarColorIndicators(editor);
    close?.();
}

/** Background picker with a Word-style “None” swatch to clear cell/text shading. */
function buildEmsBackgroundColorPicker(editor, onPick, coldColor) {
    const form = ColorPickerWidget(editor, onPick, coldColor);
    const cn = 'jodit-color-picker';
    const noneActive = isNoBackgroundColor(coldColor);
    const noneRow = editor.c.div('ems-bgcolor-none-row');
    const noneItem = editor.c.fromHTML(
        `<span class="${cn}__color-item ems-bgcolor-none-item${
            noneActive ? ` ${cn}__color-item_active_true` : ''
        }" title="None" data-color="" role="button" tabindex="0" aria-label="No background color"></span>`
    );
    const noneLabel = editor.c.fromHTML('<span class="ems-bgcolor-none-label">None</span>');
    noneRow.appendChild(noneItem);
    noneRow.appendChild(noneLabel);
    form.insertBefore(noneRow, form.firstChild);

    const pickNone = (e) => {
        e.stopPropagation();
        e.preventDefault();
        onPick('');
    };
    editor.e.on(noneItem, 'mousedown touchend', pickNone);
    editor.e.on(noneLabel, 'mousedown touchend', pickNone);

    return form;
}

function createEmsColorControl(name, command, tooltip, options = {}) {
    const { icon, template } = options;
    return {
        name,
        ...(icon ? { icon } : {}),
        ...(template ? { template } : {}),
        tooltip,
        isVisible: (editor) => !editor?.o?.disablePlugins?.includes?.('color'),
        popup: (editor, _current, close) => {
            if (!editor?.c) return false;
            return ColorPickerWidget(
                editor,
                (value) => applyEmsColorPick(editor, command, value, close),
                readCurrentColor(editor, command)
            );
        },
    };
}

const EMS_FORECOLOR_ICON_HTML =
    '<span class="ems-toolbar-forecolor-icon" aria-hidden="true">A</span>';

/** Word-style paint bucket (Shading) with color bar beneath the glyph. */
const EMS_BACKGROUND_ICON_HTML = `<span class="ems-toolbar-bgcolor-icon" aria-hidden="true">
<span class="ems-toolbar-bgcolor-icon__glyph">
<svg class="ems-toolbar-bgcolor-icon__svg" viewBox="0 0 20 15" width="16" height="13" focusable="false" aria-hidden="true">
<path fill="none" stroke="#323130" stroke-width="1.1" stroke-linejoin="miter" d="M3.8 11.8h9.8L10.8 4.6H6.1L3.8 11.8z"/>
<path fill="none" stroke="#323130" stroke-width="1.1" d="M6.1 4.6h4.7"/>
<path fill="none" stroke="#323130" stroke-width="1.1" stroke-linecap="round" d="M6.6 4.8c0-1.35 1.1-2.45 2.9-2.45s2.9 1.1 2.9 2.45"/>
<path fill="none" stroke="#323130" stroke-width="1.1" stroke-linecap="round" d="M13.6 11.8h2.1"/>
<circle class="ems-toolbar-bgcolor-icon__drip" cx="16.1" cy="12.8" r="1.25" fill="#185abd"/>
</svg>
</span>
<span class="ems-toolbar-bgcolor-icon__bar"></span>
</span>`;

/** “A” with underline — text (font) color. */
export const EMS_FORECOLOR_CONTROL = createEmsColorControl(
    'emsForeColor',
    'forecolor',
    'Text color',
    {
        template: () => EMS_FORECOLOR_ICON_HTML,
    }
);

/** Paint bucket — background / cell fill (table logic handled in clauseEditorTable). */
export const EMS_BACKGROUND_CONTROL = {
    name: 'emsBackground',
    template: () => EMS_BACKGROUND_ICON_HTML,
    tooltip: 'Shading',
    isVisible: (editor) => !editor?.o?.disablePlugins?.includes?.('color'),
    update(editor, button) {
        syncEmsToolbarColorIndicators(editor);
        const color = readCurrentColor(editor, 'background');
        if (!isNoBackgroundColor(color)) {
            dataBind(button, 'color', color);
            dataBind(button, 'color-mode', 'background');
        } else if (!dataBind(button, 'color')) {
            dataBind(button, 'color', '#ffffff');
            dataBind(button, 'color-mode', 'background');
        }
    },
    exec(jodit, current, { button }) {
        if (dataBind(button, 'color-mode') !== 'background') return false;
        const color = dataBind(button, 'color');
        if (color === undefined || color === null) return false;
        applyEmsColorPick(jodit, 'background', isNoBackgroundColor(color) ? '' : color, () => {});
        return true;
    },
    popup: (editor, _current, close) => {
        if (!editor?.c) return false;
        return buildEmsBackgroundColorPicker(
            editor,
            (value) => applyEmsColorPick(editor, 'background', value, close),
            readCurrentColor(editor, 'background')
        );
    },
};

/** Hide Jodit’s combined fill+text color control when using separate buttons. */
export const EMS_BRUSH_CONTROL_HIDDEN = {
    name: 'brush',
    isVisible: () => false,
};
