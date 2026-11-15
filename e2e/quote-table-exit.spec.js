import { test, expect } from '@playwright/test';
async function selectTrailingTable(page) {
    await page.goto('/e2e/harness/clause-editor.html');
    const editor = page.locator('.jodit-wysiwyg').last(); await editor.waitFor();
    await editor.evaluate(root => {
        const table = root.querySelector('table'); root.replaceChildren(table);
        root.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    });
    const cells = editor.locator('td,th');
    const first = await cells.first().boundingBox(), last = await cells.last().boundingBox();
    await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
    await page.mouse.down();
    await page.mouse.move(last.x + last.width / 2, last.y + last.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect(editor.locator('.ems-table-cell-selected')).toHaveCount(await cells.count());
    return editor;
}
test('mouse-selected trailing table allows clicking after it and Enter to add a blank line', async ({ page }) => {
    const editor = await selectTrailingTable(page);
    const before = await editor.locator('table').textContent();
    const after = editor.locator('table + p'); await expect(after).toBeVisible();
    await after.click(); await page.keyboard.press('Enter'); await page.keyboard.type('Text after the table');
    await expect(editor.locator('table')).toHaveText(before);
    await expect(editor.locator('p').filter({ hasText: 'Text after the table' })).toBeVisible();
    await expect(editor.locator('.ems-table-cell-selected')).toHaveCount(0);
    expect(await editor.locator('p').count()).toBeGreaterThanOrEqual(2);
});
test('Enter leaves a selected table and typing stays outside the cells', async ({ page }) => {
    const editor = await selectTrailingTable(page);
    await page.keyboard.press('Enter'); await page.keyboard.type('Outside table');
    await expect(editor.locator('table + p')).toHaveText('Outside table');
    await expect(editor.locator('table')).not.toContainText('Outside table');
});

for (const method of ['mouse', 'ArrowRight']) {
    test('leave a floated table from its last row with ' + method, async ({ page }) => {
        await page.goto('/e2e/harness/clause-editor.html');
        const editor = page.locator('.jodit-wysiwyg').last(); await editor.waitFor();
        await editor.evaluate(root => {
            const table = root.querySelector('table'); root.replaceChildren(table);
            table.style.cssFloat = 'left'; table.setAttribute('align', 'left');
            root.style.minHeight = '250px';
            root.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
        });
        const last = editor.locator('tr').last().locator('td').last();
        await last.click();
        if (method === 'mouse') {
            const table = await editor.locator('table').boundingBox();
            const row = await editor.locator('tr').last().boundingBox();
            await page.mouse.click(table.x + table.width + 12, row.y + row.height / 2);
        } else {
            await last.evaluate(cell => {
                const range = document.createRange(); range.selectNodeContents(cell); range.collapse(false);
                getSelection().removeAllRanges(); getSelection().addRange(range);
            });
            await page.keyboard.press('ArrowRight');
        }
        await page.keyboard.type('Directly below table');
        const paragraph = editor.locator('table + p');
        await expect(paragraph).toHaveText('Directly below table');
        const bounds = await paragraph.boundingBox(), table = await editor.locator('table').boundingBox();
        expect(bounds.y).toBeGreaterThanOrEqual(table.y + table.height - 1);
        await expect(editor.locator('table')).not.toContainText('Directly below table');
        await page.keyboard.press('Enter'); await page.keyboard.type('Next line');
        await expect(editor.locator('p').last()).toHaveText('Next line');
    });
}
