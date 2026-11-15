import { test, expect } from '@playwright/test';
test('copy multiline formatted text and append in another cell without changing other rows', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/e2e/harness/clause-editor.html');
    const editor = page.locator('.jodit-wysiwyg').last();
    await editor.waitFor();
    await editor.evaluate(root => {
        const rows = root.querySelectorAll('tr');
        rows[1].cells[0].innerHTML = 'Source prefix <span id="copy-run">Modulating Non-Spring<br>Return Electric Gear Actuators <strong>(AME 110NLX)</strong></span>';
        rows[2].cells[0].innerHTML = 'Existing description ';
        const row = rows[2].cloneNode(true); row.cells[0].textContent = 'Third row unchanged'; rows[2].parentNode.appendChild(row);
        root.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    });
    await editor.locator('#copy-run').click();
    await editor.evaluate(root => {
        const range = document.createRange(); range.selectNodeContents(root.querySelector('#copy-run'));
        getSelection().removeAllRanges(); getSelection().addRange(range);
    });
    await page.keyboard.press('Control+c');
    const payload = await page.evaluate(async () => {
        const items = await navigator.clipboard.read(); const data = {};
        for (const item of items) for (const type of item.types) if (type === 'text/html' || type === 'text/plain') data[type] = await (await item.getType(type)).text();
        return data;
    });
    expect(payload['text/plain']).toContain('Return Electric Gear Actuators');
    const destination = editor.locator('tr').nth(2).locator('td').first();
    await destination.click();
    await destination.evaluate((cell, data) => {
        const range = document.createRange(); range.selectNodeContents(cell); range.collapse(false);
        getSelection().removeAllRanges(); getSelection().addRange(range);
        const clipboard = new DataTransfer(); for (const [type, text] of Object.entries(data)) clipboard.setData(type, text);
        cell.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }));
    }, payload);
    await expect(destination).toContainText('Existing description');
    await expect(destination).toContainText('Modulating Non-Spring');
    await expect(destination).toContainText('Return Electric Gear Actuators');
    await expect(destination.locator('strong')).toHaveText('(AME 110NLX)');
    await expect(editor.locator('tr').nth(3).locator('td').first()).toHaveText('Third row unchanged');
    await expect(editor.locator('tr').nth(1).locator('td').first()).toContainText('Source prefix');
    await expect(destination.locator('..').locator('td').nth(1)).toHaveText('3');
    await page.keyboard.press('Control+z');
    await expect(destination).toHaveText('Existing description ');
});
