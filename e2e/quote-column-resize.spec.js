import { test, expect } from '@playwright/test';

for (const internalCopy of [false, true]) for (const zoom of [0.7, 1, 1.2]) {
    test(`column guide follows the lower table border and widths survive exit/reopen at zoom ${zoom} (internal copy: ${internalCopy})`, async ({ page }) => {
        await page.goto(`/e2e/harness/clause-editor.html?edit-exit&column-resize&zoom=${zoom}${internalCopy ? '&internal-copy' : ''}`);
        const editor = page.locator('.jodit-wysiwyg').last();
        await expect(editor.locator('table')).toHaveCount(2);
        const table = editor.locator('table').nth(1);
        const cell = table.locator('tr').first().locator('th,td').nth(1);
        await cell.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
        const topBefore = await editor.locator('table').first().getAttribute('data-ems-col-widths');
        const before = await cell.boundingBox();
        const y = before.y + before.height / 2;
        const x = before.x + before.width;
        await page.mouse.move(x, y);
        const handle = page.locator('.ems-table-col-resizer').last();
        await expect(handle).toBeVisible();
        await page.mouse.down();
        for (const delta of [-10, -25, -35, -10, 10, 20]) {
            await page.mouse.move(x + delta, y);
            await page.waitForTimeout(50);
            const border = await cell.boundingBox();
            const guide = await handle.boundingBox();
            expect(Math.abs(guide.x + guide.width / 2 - (border.x + border.width))).toBeLessThan(2);
            expect(Math.abs(border.x + border.width - (x + delta))).toBeLessThan(3);
        }
        await page.mouse.up();
        await page.waitForTimeout(200);
        const resized = await cell.boundingBox();
        const model = await table.getAttribute('data-ems-col-widths');
        expect(await editor.locator('table').first().getAttribute('data-ems-col-widths')).toBe(topBefore);
        await page.getByRole('button', { name: 'Exit edit', exact: true }).click();
        const browse = page.locator('#quote-preview .clause-content table').nth(1);
        await expect(browse).toBeVisible();
        expect(await browse.getAttribute('data-ems-col-widths')).toBe(model);
        const after = await browse.locator('tr').first().locator('th,td').nth(1).boundingBox();
        expect(Math.abs(after.width - resized.width)).toBeLessThan(2);
        await page.getByRole('button', { name: 'Reopen edit', exact: true }).click();
        await expect(editor.locator('table')).toHaveCount(2);
        await page.waitForTimeout(300);
        expect(await editor.locator('table').nth(1).getAttribute('data-ems-col-widths')).toBe(model);
        const reopened = await editor.locator('table').nth(1).locator('tr').first().locator('th,td').nth(1).boundingBox();
        expect(Math.abs(reopened.width - resized.width)).toBeLessThan(2);
    });
}
