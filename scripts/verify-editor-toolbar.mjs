import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const artifact = 'e2e/artifacts/editor-production';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const toolbar = page.locator('#ems-quote-preview-toolbar');
const editor = page.locator('.jodit-wysiwyg');
const button = ref => toolbar.locator(`[data-ref="${ref}"] .jodit-toolbar-button__button`).first();
const popup = page.locator('.jodit-popup:visible').last();
const checks = [];
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.setDefaultTimeout(1800);
await page.route('http://ems-editor.test/**', route => {
    const url = new URL(route.request().url());
    const file = path.join(artifact, url.pathname === '/' ? 'e2e/harness/clause-editor.html' : url.pathname);
    return fs.existsSync(file) ? route.fulfill({ path: file }) : route.fulfill({ status: 404 });
});

async function openEditor(query = '') {
    await page.goto(`http://ems-editor.test/${query}`);
    await editor.waitFor();
    await button('bold').waitFor();
}

async function select(selector) {
    await editor.locator(selector).first().click();
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');
}

async function menu(ref) {
    const control = toolbar.locator(`[data-ref="${ref}"]`).first();
    const arrow = control.locator('.jodit-toolbar-button__trigger, .jodit-toolbar-select__trigger').first();
    await (await arrow.isVisible() ? arrow : button(ref)).click();
    await popup.waitFor();
}

async function inspect(needle) {
    return editor.evaluate((root, needle) => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            if (node.textContent.trim() !== needle) continue;
            const ancestors = [];
            for (let el = node.parentElement; el && el !== root; el = el.parentElement) {
                const css = getComputedStyle(el);
                ancestors.push({
                    tag: el.tagName, class: el.className, style: el.getAttribute('style'),
                    weight: css.fontWeight, italic: css.fontStyle, decoration: css.textDecorationLine,
                    font: css.fontFamily, size: css.fontSize, color: css.color,
                    background: css.backgroundColor, align: css.textAlign, vertical: css.verticalAlign,
                });
            }
            return ancestors;
        }
        return [];
    }, needle);
}

async function run(name, setup, action, verify, verifyHistory = false, query = '') {
    if (process.env.EMS_TOOLBAR_CASE && !name.includes(process.env.EMS_TOOLBAR_CASE)) return;
    try {
        await openEditor(query);
        await setup();
        const start = performance.now();
        await action();
        const actual = await verify();
        checks.push({ name, ms: Math.round(performance.now() - start), ...actual });
        if (actual.passed && verifyHistory) {
            await page.keyboard.press('Control+z');
            const undone = await verify();
            checks.push({ name: `${name}-undo`, passed: !undone.passed && undone.gridPreserved !== false });
            await page.keyboard.press('Control+y');
            checks.push({ name: `${name}-redo`, passed: (await verify()).passed });
        }
    } catch (error) {
        checks.push({ name, passed: false, error: error.message.split('\n')[0], popup: await popup.isVisible() ? await popup.innerText() : '' });
    }
}

const firstCell = editor.locator('td').first();
async function tableMenu(label) {
    await firstCell.click({ button: 'right' });
    await page.getByRole('menuitem', { name: label, exact: true }).click();
}

async function selectCellBlock() {
    const row = editor.locator('tr').nth(1);
    const first = await row.locator('td').nth(0).boundingBox();
    const second = await row.locator('td').nth(1).boundingBox();
    await page.mouse.move(first.x + 10, first.y + first.height / 2);
    await page.mouse.down();
    await page.mouse.move(second.x + 15, second.y + second.height / 2, { steps: 8 });
    await page.mouse.up();
}

const formats = [
    ['bold', 'weight', value => Number(value) >= 600],
    ['italic', 'italic', value => value === 'italic'],
    ['underline', 'decoration', value => value.includes('underline')],
    ['strikethrough', 'decoration', value => value.includes('line-through')],
    ...['left', 'center', 'right', 'justify'].map(ref => [ref, 'align', value => value === ref]),
    ['font', 'font', value => value.includes('Courier New'), 'Courier New'],
    ['fontsize', 'size', value => parseFloat(value) >= 23.9, '18pt'],
    ['emsForeColor', 'color', value => value === 'rgb(255, 0, 0)', '#ff0000'],
    ['emsBackground', 'background', value => value === 'rgb(255, 255, 0)', '#ffff00'],
];
const presets = [
    ...[['Solid round', 'disc'], ['Hollow round', 'circle'], ['Solid square', 'square'], ['Tick', 'check'], ['Arrow', 'arrow'], ['Diamond', 'diamond']]
        .map(([option, preset]) => ['ul', option, 'UL', preset]),
    ...[['1. 2. 3.', 'decimal'], ['1) 2) 3)', 'decimal-paren'], ['I. II. III.', 'upper-roman'],
        ['A. B. C.', 'upper-alpha'], ['a) b) c)', 'lower-alpha-paren'], ['a. b. c.', 'lower-alpha'], ['i. ii. iii.', 'lower-roman']]
        .map(([option, preset]) => ['ol', option, 'OL', preset]),
];

try {
    for (const [scope, selector, needle] of [['text', 'p', 'Before table'], ['cell', 'td', 'Patch panel']]) {
        for (const [ref, property, matches, option] of formats) {
            if (process.env.EMS_TOOLBAR_CASE && !`${scope}-${ref}`.includes(process.env.EMS_TOOLBAR_CASE)) continue;
            await run(`${scope}-${ref}`, async () => {
                await select(selector);
                if (ref === 'left') {
                    await button('right').click();
                    await select(selector);
                }
            }, async () => {
                if (!option) return button(ref).click();
                await menu(ref);
                if (option.startsWith('#')) {
                    await popup.locator(`[data-color="${option}" i]`).first().click();
                } else {
                    await popup.getByText(option, { exact: true }).first().click();
                }
            }, async () => {
                const styles = await inspect(needle);
                const values = styles.map(style => style[property]);
                return { passed: values.some(matches), actual: values, ...(values.some(matches) ? {} : { html: (await editor.innerHTML()).slice(0, 450) }) };
            }, true);
        }
        for (const ref of ['ul', 'ol']) {
            await run(`${scope}-${ref}-remove-list`, async () => {
                await select(selector);
                await button(ref).click();
                await editor.locator(`${ref} li`).first().click();
            }, async () => {
                await menu(ref);
                await popup.getByText('None', { exact: true }).click();
            }, async () => ({
                passed: (await inspect(needle)).length > 0 && await editor.locator(ref).count() === 0,
            }), true);
        }
        for (const [ref, option, tag, preset] of presets) {
            await run(`${scope}-${ref}-${preset}`, () => select(selector), async () => {
                await menu(ref);
                await popup.getByText(option, { exact: ref === 'ol' }).first().click();
            }, async () => {
                const styles = await inspect(needle);
                return { passed: styles.some(style => style.tag === tag && String(style.class).includes(preset)), actual: styles.map(s => [s.tag, s.class]) };
            }, true);
        }
    }
    for (const [label, axis] of [['Split vertically', 'v'], ['Split horizontally', 'h']]) {
        await run(`table-split-${axis}`, () => firstCell.click(), () => tableMenu(label), async () => ({
            passed: await firstCell.locator(`.ems-cell-split-${axis}__pane`).count() === 2 && (await firstCell.innerText()).includes('Patch panel'),
            actual: await firstCell.innerHTML(),
        }));
        await run(`table-split-${axis}-undo`, () => firstCell.click(), async () => {
            await tableMenu(label);
            await firstCell.locator(`.ems-cell-split-${axis}`).waitFor();
            await page.keyboard.press('Control+z');
        }, async () => ({ passed: await firstCell.locator(`.ems-cell-split-${axis}`).count() === 0 }));
    }
    await run('table-merge', selectCellBlock, () => tableMenu('Merge cells'), async () => ({
        passed: await editor.locator('tr').nth(1).locator('td[colspan="2"]').count() === 1 &&
            (await editor.locator('td[colspan="2"]').innerText()).includes('Patch panel') &&
            (await editor.locator('td[colspan="2"]').innerText()).includes('2'),
        actual: await editor.locator('tr').nth(1).innerText(),
    }), true);
    await run('table-block-bold', selectCellBlock, () => button('bold').click(), async () => ({
        passed: (await inspect('Patch panel')).some(s => Number(s.weight) >= 600) &&
            (await editor.locator('tr').nth(1).locator('td').nth(1).evaluate(el => getComputedStyle(el).fontWeight)) === '700',
    }));
    await run('text-paragraph-style', () => select('p'), async () => {
        await menu('paragraph');
        await popup.getByText('Heading 2', { exact: true }).click();
    }, async () => ({ passed: await editor.locator('h2').count() === 1 }));
    await run('text-horizontal-line', () => editor.locator('p').first().click(), () => button('hr').click(), async () => ({
        passed: await editor.locator('hr').count() === 1,
    }));
    await run('text-insert-table', () => editor.locator('p').last().click(), async () => {
        await menu('table');
        const cell = popup.locator('.jodit-form__container [data-index="11"]');
        await cell.hover();
        await cell.click();
    }, async () => ({ passed: await editor.locator('table').count() === 2 && await editor.locator('table').last().locator('td').count() === 4 }));
    await run('text-insert-link', () => select('p'), async () => {
        await menu('link');
        await popup.locator('input[name="url"], input[name="href"]').first().fill('https://example.invalid/quote');
        await popup.getByRole('button', { name: 'Insert', exact: true }).click();
    }, async () => ({ passed: await editor.locator('a[href="https://example.invalid/quote"]').count() === 1 }));
    await run('text-insert-image', () => editor.locator('p').last().click(), async () => {
        await menu('image');
        await popup.locator('input[type="file"]').first().setInputFiles({
            name: 'toolbar-test.png', mimeType: 'image/png',
            buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG5sAAAAASUVORK5CYII=', 'base64'),
        });
        await editor.locator('img').waitFor();
    }, async () => ({ passed: (await editor.locator('img').first().getAttribute('src')).startsWith('data:image/png') }));
    await run('text-clear-formatting', async () => {
        await select('p');
        await button('bold').click();
        if (!(await inspect('Before table')).some(s => Number(s.weight) >= 600)) throw new Error('Bold setup failed');
        await select('p');
    }, () => button('eraser').click(), async () => ({
        passed: (await inspect('Before table')).every(s => Number(s.weight) < 600),
    }));
    await run('text-reset-font', async () => {
        await select('p');
        await menu('font');
        await popup.getByText('Courier New', { exact: true }).click();
        if (!(await inspect('Before table')).some(s => s.font.includes('Courier New'))) throw new Error('Font setup failed');
        await select('p');
    }, () => button('emsResetFont').click(), async () => ({
        passed: (await inspect('Before table')).every(s => !s.font.includes('Courier New')),
    }));
    await run('text-numbered-indent', async () => {
        await select('p');
        await menu('ol');
        await popup.getByText('1. 2. 3.', { exact: true }).click();
        await editor.locator('ol li').first().click();
        await page.keyboard.press('End');
        await page.keyboard.press('Enter');
        await page.keyboard.type('Nested item');
        await editor.locator('ol > li').filter({ hasText: 'Nested item' }).click();
    }, () => button('indent').click(), async () => ({
        passed: await editor.locator('ol li ol li').count() === 1,
        actual: (await editor.innerHTML()).slice(0, 650),
    }));
    await run('text-outline-subnumber-style', async () => {
        const line = editor.locator('p').filter({ hasText: /\bSub item$/ });
        await line.click();
        await page.keyboard.press('End');
    }, async () => {
        await menu('ol');
        await popup.getByText('a) b) c)', { exact: true }).click();
    }, async () => {
        const line = editor.locator('p').filter({ hasText: /\bSub item$/ });
        const actual = await line.innerText();
        return { passed: /^a\)\s+Sub item/.test(actual), actual };
    }, true, '?outline');
    await run('text-outline-outdent', async () => {
        await editor.locator('p').filter({ hasText: /\bSub item$/ }).click();
        await page.keyboard.press('End');
    }, () => button('outdent').click(), async () => ({
        passed: /^2\.5\.\s+Sub item/.test(await editor.locator('p').filter({ hasText: /\bSub item$/ }).innerText()),
    }), true, '?outline');
    await run('toolbar-undo-redo-buttons', async () => {
        await select('p');
        await button('bold').click();
    }, async () => {
        await button('undo').click();
        if ((await inspect('Before table')).some(s => Number(s.weight) >= 600)) throw new Error('Undo left bold active');
        await button('redo').click();
    }, async () => ({ passed: (await inspect('Before table')).some(s => Number(s.weight) >= 600) }));
    await run('table-cell-vertical-align', () => firstCell.click(), async () => {
        await menu('emsValign');
        await popup.getByText('Bottom', { exact: true }).click();
    }, async () => ({ passed: await firstCell.evaluate(el => getComputedStyle(el).verticalAlign) === 'bottom' }), true);
    await run('table-cell-no-border', () => firstCell.click(), async () => {
        await menu('emsTableBorder');
        await popup.getByText('No border', { exact: true }).click();
    }, async () => ({ passed: await firstCell.getAttribute('data-ems-cell-border') === 'none' }), true);
    await run('table-repeat-header', () => editor.locator('th').first().click(), () => button('emsRepeatHeader').click(), async () => ({
        passed: await editor.locator('table[data-ems-repeat-header="1"] thead th').count() === 3,
    }), true);
    await run('large-boq-cell-bold', () => select('td'), () => button('bold').click(), async () => ({
        passed: (await inspect('Patch panel')).some(s => Number(s.weight) >= 600) && await editor.locator('tr').count() === 120,
    }), false, '?large');
    const readGrid = () => editor.evaluate(root => [...root.querySelectorAll('table')].map(table =>
        [...table.rows].map(row => [...row.cells].map(cell => [cell.textContent, cell.colSpan, cell.rowSpan]))));
    let originalGrid;
    await run('table-block-font', async () => {
        originalGrid = await readGrid();
        await selectCellBlock();
    }, async () => {
        await menu('font');
        await popup.getByText('Arial', { exact: true }).click();
    }, async () => {
        const gridPreserved = JSON.stringify(await readGrid()) === JSON.stringify(originalGrid);
        const firstRow = editor.locator('tr').nth(1);
        const families = await firstRow.locator('td').evaluateAll(cells => cells.map(cell => getComputedStyle(cell).fontFamily));
        const arial = /^"?Arial\b/i;
        return { passed: gridPreserved && arial.test(families[0]) && arial.test(families[1]) && !arial.test(families[2]), gridPreserved, families };
    }, true);
    for (const mode of ['partial', 'cell-boundary', 'whole-cell']) await run(`boq-wrapped-description-arial-${mode}`, async () => {
        originalGrid = await readGrid();
        await firstCell.click();
        await page.waitForTimeout(300);
        await firstCell.evaluate((cell, mode) => {
            const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
            const nodes = [];
            while (walker.nextNode()) nodes.push(walker.currentNode);
            const range = document.createRange();
            range.setStart(nodes[0], mode === 'partial' ? 4 : 0);
            if (mode === 'cell-boundary') range.setEnd(cell.nextElementSibling, 0);
            else range.setEnd(nodes.at(-1), mode === 'partial' ? nodes.at(-1).length - 6 : nodes.at(-1).length);
            if (mode === 'whole-cell') range.collapse(true);
            getSelection().removeAllRanges();
            getSelection().addRange(range);
        }, mode);
    }, async () => {
        await menu('font');
        await popup.getByText('Arial', { exact: true }).click();
    }, async () => {
        const grid = await readGrid();
        const styles = await inspect('Key-Stone Module RJ45 UTP');
        const preserved = JSON.stringify(grid) === JSON.stringify(originalGrid);
        const excluded = await inspect('2');
        if (mode === 'partial') excluded.push(...await inspect('19"'));
        return {
            passed: preserved && /^"?Arial\b/i.test(styles[0]?.font || '') &&
                excluded.length > 0 && !excluded.some(style => /^"?Arial\b/i.test(style.font)),
            gridPreserved: preserved,
            actual: styles[0]?.font,
            ...(mode === 'partial' ? { unselectedPrefix: (await inspect('19"'))[0]?.font } : {}),
        };
    }, true, '?boq-font');
    for (const mode of ['highlight', 'whole-cell']) await run(`boq-font-persists-in-preview-${mode}`, async () => {
        originalGrid = await readGrid();
        await firstCell.click();
        if (mode === 'highlight') await firstCell.locator('strong').evaluate(el => {
            const range = document.createRange();
            range.selectNodeContents(el);
            getSelection().removeAllRanges();
            getSelection().addRange(range);
        });
    }, async () => {
        await menu('font');
        await popup.getByText('Arial', { exact: true }).click();
        await page.waitForFunction(() => {
            const strong = document.querySelector('#saved-preview td strong');
            const text = strong?.querySelector('[data-ems-user-font]') || strong;
            return text && /^"?Arial\b/i.test(getComputedStyle(text).fontFamily);
        }, undefined, { timeout: 2000 });
    }, async () => ({
        passed: JSON.stringify(await readGrid()) === JSON.stringify(originalGrid) &&
            await page.locator('#saved-preview td[data-ems-user-font], #saved-preview td [data-ems-user-font]').count() > 0,
    }), false, '?boq-font');
    await run('large-boq-split-horizontal', () => firstCell.click(), () => tableMenu('Split horizontally'), async () => ({
        passed: await firstCell.locator('.ems-cell-split-h__pane').count() === 2 && await editor.locator('tr').count() === 120,
    }), false, '?large');
    const fontOptions = [
        'Segoe UI', 'Arial', 'Courier New', 'Georgia', 'Lucida Sans Unicode', 'Tahoma',
        'Times New Roman', 'Trebuchet MS', 'Helvetica', 'Impact', 'Verdana',
    ];
    const bundledFaces = {
        'Segoe UI': /^(Segoe UI|Selawik)$/i,
        Arial: /^Arimo$/i,
        Helvetica: /^(Helvetica|Inter(?: Variable)?)$/i,
    };
    for (const [scope, target, selected] of [
        ['prose', editor.locator('p').first(), 'selected text'],
        ['cell', firstCell, 'cell sample'],
    ]) for (const useLocalFonts of [true, false]) {
        const suffix = useLocalFonts ? 'installed' : 'fallback';
        let cdp;
        const readGlyphFont = async (selector) => {
            await page.evaluate(() => document.fonts.ready);
            const { root } = await cdp.send('DOM.getDocument');
            const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
            const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
            return fonts.filter(font => font.glyphCount > 0).map(font => font.familyName);
        };
        const pick = async family => {
            await target.click();
            await target.evaluate((el, selected) => {
                const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
                while (walker.nextNode()) {
                    const text = walker.currentNode;
                    const start = text.data.indexOf(selected);
                    if (start < 0) continue;
                    const range = document.createRange();
                    range.setStart(text, start);
                    range.setEnd(text, start + selected.length);
                    getSelection().removeAllRanges();
                    getSelection().addRange(range);
                    return;
                }
                throw new Error('Selected text not found');
            }, selected);
            await menu('font');
            await popup.getByText(family, { exact: true }).click();
            const selector = '[data-ems-user-font="1"]';
            const expected = family;
            await page.waitForFunction(({ selector, expected, selected }) =>
                [...document.querySelectorAll(`#saved-preview ${selector}`)].some(el =>
                    el.textContent === selected && getComputedStyle(el).fontFamily.replace(/["']/g, '').startsWith(expected)
                ), { selector, expected, selected });
            // On a second font pick the previous wrapper may contain the new one.
            const leaf = `${selector}:not(:has(${selector}))`;
            return {
                editor: await readGlyphFont(`.jodit-wysiwyg ${leaf}`),
                preview: await readGlyphFont(`#saved-preview ${leaf}`),
            };
        };
        const results = {};
        await run(`rendered-font-${scope}-${suffix}`, async () => {
            cdp = await page.context().newCDPSession(page);
            await cdp.send('DOM.enable');
            await cdp.send('CSS.enable');
            await cdp.send('CSS.setLocalFontsEnabled', { enabled: useLocalFonts });
        }, async () => {
            for (const family of useLocalFonts ? fontOptions : Object.keys(bundledFaces)) {
                results[family] = await pick(family);
            }
        }, async () => {
            const matches = (font, expected) => expected instanceof RegExp ? expected.test(font) : font === expected;
            return {
                passed: Object.entries(results).every(([family, surfaces]) => {
                    const expected = useLocalFonts && family !== 'Helvetica' ? family : bundledFaces[family];
                    return Object.values(surfaces).every(fonts => fonts.length === 1 && matches(fonts[0], expected));
                }),
                fonts: results,
            };
        }, false, '?font-render');
        await cdp?.detach();
    }
    for (const [surface, root] of [
        ['editor', editor],
        ['preview', page.locator('#saved-preview')],
        ['print', page.frameLocator('iframe[title="Quote print fixture"]').locator('.clause-content')],
    ]) {
        if (surface === 'print') await page.emulateMedia({ media: 'print' });
        await run(`office-cell-list-spacing-${surface}`, async () => {
            await root.locator('li').first().waitFor();
        }, async () => {}, async () => {
            const items = await root.locator('li').evaluateAll(items => items.map(item => {
                const range = item.ownerDocument.createRange();
                range.selectNodeContents(item.firstChild);
                const lines = [...range.getClientRects()];
                const marker = getComputedStyle(item, '::before');
                const bounds = item.getBoundingClientRect();
                const markerEnd = marker.right === 'auto'
                    ? parseFloat(marker.left) + parseFloat(marker.width)
                    : item.clientWidth - parseFloat(marker.right);
                return {
                    marker: marker.content,
                    lineCount: lines.length,
                    gap: Math.min(...lines.map(line => line.left - bounds.left - markerEnd)),
                };
            }));
            return {
                passed: items.length === 6 && items[0].lineCount > 1 &&
                    items.every(item => item.marker !== 'none' && item.gap >= 4),
                items,
            };
        }, false, '?cell-lists');
    }
    fs.writeFileSync(`${artifact}/toolbar-results.json`, JSON.stringify({ checks, errors }, null, 2));
    console.log(JSON.stringify({ checks, errors }, null, 2));
    if (errors.length || checks.some(check => !check.passed)) process.exitCode = 1;
} finally {
    await browser.close();
}
