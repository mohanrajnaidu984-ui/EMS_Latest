/**
 * Toolbar tooltips for the quote clause Jodit editor.
 * External toolbar hosts live outside jodit.container, so native title tooltips are applied explicitly.
 */

export const EMS_CLAUSE_TOOLBAR_TOOLTIPS = {
    undo: 'Undo (Ctrl+Z)',
    redo: 'Redo (Ctrl+Y)',
    bold: 'Bold (Ctrl+B)',
    italic: 'Italic (Ctrl+I)',
    underline: 'Underline (Ctrl+U)',
    strikethrough: 'Strikethrough',
    emsForeColor: 'Text color',
    emsBackground: 'Shading',
    font: 'Font family',
    fontsize: 'Font size',
    paragraph: 'Paragraph style',
    ul: 'Bullet list',
    ol: 'Numbered list',
    indent: 'Increase indent',
    outdent: 'Decrease indent',
    image: 'Insert image',
    table: 'Insert table',
    emsRepeatHeader: 'Repeat header row on each page',
    link: 'Insert link',
    left: 'Align left',
    center: 'Align center',
    right: 'Align right',
    justify: 'Justify',
    emsValign: 'Vertical align (table cells)',
    hr: 'Horizontal line',
    eraser: 'Clear formatting',
};

/** @param {HTMLElement | null | undefined} toolbarHost */
export function applyClauseToolbarNativeTitles(toolbarHost) {
    if (!toolbarHost) return;
    toolbarHost
        .querySelectorAll('.jodit-toolbar-button, .jodit-toolbar-select')
        .forEach((el) => {
            const ref = el.getAttribute('data-ref');
            const aria = el.getAttribute('aria-label');
            const title = EMS_CLAUSE_TOOLBAR_TOOLTIPS[ref] || aria;
            if (!title) return;
            el.setAttribute('title', title);
            el.setAttribute('aria-label', title);
            const inner = el.querySelector('.jodit-toolbar-button__button');
            if (inner) {
                inner.setAttribute('title', title);
                inner.setAttribute('aria-label', title);
            }
        });
}

/** Keep native/browser tooltips working on the detached quote preview toolbar. */
export function registerClauseEditorExternalToolbarTooltips(jodit, toolbarHostId) {
    if (!jodit || !toolbarHostId) return;

    const sync = () => {
        const host = document.getElementById(toolbarHostId);
        if (!host) return;
        applyClauseToolbarNativeTitles(host);
    };

    jodit.e.off('.emsToolbarTooltips');
    jodit.e.on('afterInit.emsToolbarTooltips updateToolbar.emsToolbarTooltips', sync);
    sync();
    requestAnimationFrame(sync);
}

export function buildClauseToolbarTooltipControls() {
    return Object.fromEntries(
        Object.entries(EMS_CLAUSE_TOOLBAR_TOOLTIPS).map(([name, tooltip]) => [name, { tooltip }])
    );
}
