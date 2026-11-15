import { test, expect } from '@playwright/test';

for (const [scope, actual, target] of [['se', 100000, 200000], ['cc', 300000, 400000], ['admin', 1000000, 2000000]]) {
    test(`header displays ${scope} scoped API figures above the menu`, async ({ page }) => {
        page.on('pageerror', error => console.error(error.message));
        await page.clock.install();
        await page.clock.pauseAt(new Date());
        const email = `${scope}@example.com`;
        const user = { email, EmailId: email, FullName: 'Test User', role: scope === 'admin' ? 'admin' : 'sales report' };
        await page.addInitScript(user => {
            sessionStorage.setItem('currentUser', JSON.stringify(user));
            sessionStorage.setItem('currentUserEmail', user.email);
        }, user);
        const queries = [];
        await page.route('**/api/**', async route => {
            const url = new URL(route.request().url());
            let json = {};
            if (url.pathname === '/api/auth/profile') json = user;
            if (url.pathname === '/api/sales-report/summary') {
                queries.push(Object.fromEntries(url.searchParams));
                json = { currency: 'BHD', topDivisions: ['Interiors Project', 'Plumbing & Fire Fighting Project', 'Almoayyed Aluminium', 'HVAC Project', 'Civil Maint']
                    .map((division,index) => ({rank:index+1,division,bookedValue:5400000-index*500000})),
                    targetVsActual: [{ name: 'Q1', actual, target }], grossMarginTargetVsActual: [{ name: 'Q1', actual: actual / 10, target: target / 10 }] };
            }
            await route.fulfill({ json });
        });
        await page.goto('/e2e/harness/header-sales-summary.html');
        const summary = page.getByLabel('Annual booking and gross profit achievement');
        await expect(summary).toContainText(`${Math.round(actual / target * 100)}%`);
        await expect(summary).toContainText('GP Achieved Vs Target:');
        expect(queries).toHaveLength(1);
        expect(queries[0].email).toBe(email);
        expect(queries[0].currency).toBe('BHD');
        expect(queries[0].view).toBe('header');
        expect(Object.keys(queries[0]).sort()).toEqual(['currency', 'email', 'view', 'year']);
        const ranking = page.getByLabel('Top BHD divisions by annual booked value');
        await expect(ranking).toContainText('Top 1 Division: Interiors Project');
        await expect(ranking).toContainText('(5.4M) Booking');
        await expect(ranking.locator('.ems-header-sales__division-value')).toHaveCSS('color', 'rgb(20, 128, 68)');
        await expect(ranking.locator('.ems-header-sales__division-value')).toHaveCSS('font-weight', '700');
        for (const width of [1280, 1600]) {
            await page.setViewportSize({ width, height: 900 });
            const box = await summary.boundingBox();
            const menu = await page.locator('.ems-top-nav').boundingBox();
            expect(box.y + box.height).toBeLessThanOrEqual(menu.y);
            const overlap = await summary.evaluate(el => {
                const r = el.getBoundingClientRect();
                const left = document.querySelector('.logo-container').getBoundingClientRect();
                const right = document.querySelector('.acg-header-right').getBoundingClientRect();
                return r.left < left.right || r.right > right.left || el.scrollWidth > el.clientWidth + 2;
            });
            expect(overlap).toBe(false);
        }
        const fixedRankingX=(await ranking.boundingBox()).x;
        await page.clock.runFor(4999);
        await expect(summary.locator('.ems-header-sales__period')).toHaveText(queries[0].year+' Total (BHD)');
        await expect(ranking).toContainText('Top 1 Division:');
        await page.clock.runFor(1);
        await expect(summary.locator('.ems-header-sales__row--in .ems-header-sales__period')).toHaveText(queries[0].year+' Q1 (BHD)');
        await expect(ranking.locator('.ems-header-sales__row--in')).toContainText('Top 2 Division: Plumbing & Fire Fighting Project');
        await page.clock.runFor(500);
        expect(Math.abs((await ranking.boundingBox()).x-fixedRankingX)).toBeLessThan(1);
        await summary.hover();
        const pausedPeriod=await summary.locator('.ems-header-sales__period').innerText();
        const pausedRanking=await ranking.innerText();
        await page.clock.runFor(10000);
        await expect(summary.locator('.ems-header-sales__period')).toHaveText(pausedPeriod);
        expect(await ranking.innerText()).toBe(pausedRanking);
        await page.mouse.move(2,200);
        await page.clock.runFor(4500);
        await expect(summary.locator('.ems-header-sales__row--in .ems-header-sales__period')).toHaveText(queries[0].year+' Q2 (BHD)');
        await expect(ranking.locator('.ems-header-sales__row--in')).toContainText('Top 3 Division:');
        await page.clock.runFor(500);
        expect(Math.abs((await ranking.boundingBox()).x-fixedRankingX)).toBeLessThan(1);
        if (scope === 'admin') await page.screenshot({ path: 'test-results/header-sales-summary.png' });
    });
}
