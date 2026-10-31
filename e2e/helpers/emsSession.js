/**
 * Seed EMS session auth (APIs authorize by userEmail query; UI needs sessionStorage).
 */
export const EMS_E2E_ADMIN = {
    email: process.env.EMS_E2E_EMAIL || 'ems_admin@almoayyedcg.com',
    name: process.env.EMS_E2E_NAME || 'Admin',
    id: Number(process.env.EMS_E2E_USER_ID || 83),
    role: 'Admin',
    Department: 'Admin',
};

/** Call as: await page.addInitScript(seedEmsAuthInBrowser, EMS_E2E_ADMIN); */
export function seedEmsAuthInBrowser(user) {
    const payload = {
        id: user.id,
        name: user.name,
        FullName: user.name,
        email: user.email,
        EmailId: user.email,
        role: user.role,
        Roles: user.role,
        Department: user.Department,
        DivisionName: user.Department,
    };
    try {
        sessionStorage.setItem('currentUser', JSON.stringify(payload));
        sessionStorage.setItem('currentUserEmail', user.email);
        sessionStorage.setItem('ems_activeTab', 'Quote B2B');
    } catch {
        /* ignore */
    }
}

export async function waitForQuoteModule(page, timeout = 60_000) {
    await page.locator('[data-ems-main-nav-id="Quote"]').waitFor({
        state: 'visible',
        timeout,
    });
    await page.locator('[data-ems-main-nav-id="Quote"]').click();
    await page.getByRole('combobox', { name: /Division Name/i }).first().waitFor({ state: 'visible', timeout });
}

/**
 * Open enquiry quote via Search Quote list (most reliable for approved revisions).
 */
export async function openEnquiryQuotePreview(
    page,
    requestNo = process.env.EMS_E2E_REQUEST_NO || '1515',
    division = process.env.EMS_E2E_DIVISION || 'Simplex Project'
) {
    await waitForQuoteModule(page);

    /* Division Name (right toolbar) */
    const divisionSelect = page.getByRole('combobox', { name: /Division Name/i }).first();
    if ((await divisionSelect.count()) > 0) {
        await divisionSelect.locator('option').filter({ hasText: division }).first().waitFor({ state: 'attached', timeout: 60000 });
        await divisionSelect.selectOption({ label: division }).catch(async () => {
            await divisionSelect.selectOption({ value: division }).catch(() => {});
        });
        await page.waitForTimeout(800);
    } else {
        /* Fallback: first select that contains Simplex Project */
        const selects = page.locator('select');
        const n = await selects.count();
        for (let i = 0; i < n; i += 1) {
            const sel = selects.nth(i);
            const has = await sel.locator(`option`, { hasText: division }).count();
            if (has > 0) {
                await sel.selectOption({ label: division }).catch(() => {});
                break;
            }
        }
        await page.waitForTimeout(800);
    }

    /* Category → Search Quote */
    const category = page
        .locator('select')
        .filter({ has: page.locator('option', { hasText: 'Search Quote' }) })
        .first();
    await category.selectOption({ value: 'search_quote' }).catch(async () => {
        await category.selectOption({ label: 'Search Quote' }).catch(() => {});
    });
    await page.waitForTimeout(400);

    /* Criteria */
    const criteria = page.getByPlaceholder(/Quote, project, enq|Quote details|Search Quote/i).first();
    await criteria.waitFor({ state: 'visible', timeout: 30_000 });
    await criteria.fill(String(requestNo));
    await page.waitForTimeout(300);

    /* Search button in the list toolbar (not left-panel Search) */
    const searchBtns = page.getByRole('button', { name: /^Search$/ });
    const count = await searchBtns.count();
    /* Prefer the enabled Search near Criteria */
    let clicked = false;
    for (let i = count - 1; i >= 0; i -= 1) {
        const btn = searchBtns.nth(i);
        if (await btn.isEnabled()) {
            await btn.click();
            clicked = true;
            break;
        }
    }
    if (!clicked) {
        await criteria.press('Enter');
    }

    /* Wait for search results containing the enquiry / quote ref */
    await page.waitForFunction(
        (rn) => {
            const root = document.body;
            const t = root?.innerText || '';
            return (
                t.includes(`SMA/SXP/${rn}`) ||
                t.includes(`${rn}-L1`) ||
                (t.includes(String(rn)) && /Approved|Saved|Revision/i.test(t))
            );
        },
        requestNo,
        { timeout: 90_000 }
    );

    /* Click the results table body row (role=row from DashboardQuoteSummaryTable). */
    const dataRow = page
        .getByRole('row')
        .filter({ hasText: new RegExp(String(requestNo)) })
        .filter({ hasText: /SMA\/SXP|Cinqo|Quoted/i })
        .first();
    await dataRow.waitFor({ state: 'visible', timeout: 60_000 });
    await dataRow.scrollIntoViewIfNeeded();
    await dataRow.click({ timeout: 30_000 });
    await page.waitForTimeout(3000);

    try {
        await page.screenshot({
            path: 'e2e/artifacts/live-validation/after-row-click.png',
            fullPage: false,
        });
    } catch {
        /* ignore */
    }

    /*
     * List-row open often leaves Lead Job / Customer empty until selected.
     * Drive the left panel to Simplex + Cinqo so the saved quote preview loads.
     */
    await page.waitForFunction(
        () => {
            const sel = [...document.querySelectorAll('select')].find(select =>
                [...select.options].some(option => /Select Lead/i.test(option.textContent || ''))
            );
            return Boolean(sel && !sel.disabled && sel.options && sel.options.length > 1);
        },
        undefined,
        { timeout: 15_000 }
    ).catch(() => {});

    const leadSelect = page.locator('select').filter({ has: page.locator('option', { hasText: /Simplex|Select Lead/i }) }).first();
    if ((await leadSelect.count()) > 0 && (await leadSelect.isEnabled())) {
        const opts = await leadSelect.locator('option').allTextContents();
        const match =
            opts.find((o) => /Simplex/i.test(o) && !/Select/i.test(o)) ||
            opts.find((o) => o && !/Select Lead/i.test(o));
        if (match) {
            await leadSelect.selectOption({ label: match.trim() }).catch(() => {});
            await page.waitForTimeout(1500);
        }
    }

    /* react-select customer */
    const customerInput = page.locator('input[id*="react-select"]').first();
    if ((await customerInput.count()) > 0) {
        await customerInput.click({ force: true });
        await page.keyboard.type('Cinqo', { delay: 40 });
        await page.waitForTimeout(800);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2500);
    } else {
        /* Fallback: click the customer control placeholder */
        const placeholder = page.getByText(/Select customer|Select lead job first/i).first();
        if ((await placeholder.count()) > 0) {
            await placeholder.click();
            await page.keyboard.type('Cinqo', { delay: 40 });
            await page.keyboard.press('Enter');
            await page.waitForTimeout(2500);
        }
    }

    /* Open Previous Quotes if preview still empty / draft shell */
    const stillEmpty = await page.getByText(/New Quote Preview|No Customer Selected/i).count();
    if (stillEmpty > 0) {
        const prev = page.getByRole('button', { name: /Previous Quotes|Browse|Revisions/i }).first();
        if ((await prev.count()) > 0) {
            await prev.click().catch(() => {});
            await page.waitForTimeout(1000);
            const rev = page.getByText(/SMA\/SXP\/1515|1504-R4|1504-R/i).first();
            if ((await rev.count()) > 0) await rev.click().catch(() => {});
        }
    }

    try {
        await page.screenshot({
            path: 'e2e/artifacts/live-validation/after-customer-select.png',
            fullPage: false,
        });
    } catch {
        /* ignore */
    }

    /* Wait until A4 preview exists with real content */
    await page.waitForFunction(
        () => {
            const root = document.getElementById('quote-preview');
            if (!root) return false;
            const style = window.getComputedStyle(root);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            const sheets = root.querySelectorAll('.quote-a4-sheet');
            const text = (root.innerText || '').trim();
            return sheets.length >= 1 && text.length > 120;
        },
        { timeout: 180_000 }
    );

    const preview = page.locator('#quote-preview');
    await preview.waitFor({ state: 'visible', timeout: 30_000 });

    /* Allow auto Align / pack to settle */
    await page.waitForTimeout(4000);
    return preview;
}

export async function clickAlignPage(page) {
    const btn = page.getByRole('button', { name: /Align Page|Aligning/i }).first();
    await btn.waitFor({ state: 'visible', timeout: 60_000 });
    // Do not silently skip the requested click while an automatic pass is busy.
    // In particular the first click after adding a clause must commit its editor.
    await page.waitForFunction(() => [...document.querySelectorAll('button')]
        .some(button => /Align Page/i.test(button.textContent || '') && !button.disabled),
        undefined, { timeout: 180_000 });
    await btn.click();
    await page.waitForFunction(
        () =>
            ![...document.querySelectorAll('button')].some((b) =>
                /Aligning/i.test(b.textContent || '')
            ),
        undefined, { timeout: 180_000 }
    );
    await page.waitForFunction(() => {
        const root = document.querySelector('#quote-preview');
        if (!root || root.querySelector('.quote-clause-inline-editor')) return false;
        const signature = [...root.querySelectorAll('.quote-a4-sheet')].map(sheet =>
            [...sheet.querySelectorAll('[data-ems-pack-seg]')].map(n => n.dataset.emsPackSeg).join(',')).join('|');
        const state = window.__emsAlignTestSettled;
        if (!state || state.signature !== signature) {
            window.__emsAlignTestSettled = { signature, at: performance.now() };
            return false;
        }
        return document.fonts.status !== 'loading' && performance.now() - state.at > 250;
    }, undefined, { timeout: 180_000 });
}

/** Align up to `attempts` times until overflows clear. Allows peel/fill-up to settle. */
export async function alignUntilStable(page, attempts = 3) {
    /** @type {object|null} */
    let last = null;
    for (let i = 0; i < attempts; i += 1) {
        await clickAlignPage(page);
        /* Peel is one overflowing sheet per frame — wait for cascade + fill-up. */
        for (let settle = 0; settle < 12; settle += 1) {
            await page.waitForTimeout(800);
            last = await measurePaginationHealth(page);
            if (last.overflows.length === 0 && !last.integrityBanner) {
                return { ...last, alignAttempts: i + 1, settlePasses: settle + 1 };
            }
        }
        if (last?.overflows?.length === 0) {
            return { ...last, alignAttempts: i + 1 };
        }
    }
    return { ...last, alignAttempts: attempts };
}

export async function measurePaginationHealth(page) {
    return page.evaluate(() => {
        const sheets = [
            ...document.querySelectorAll(
                '#quote-preview .quote-a4-sheet--continuation:not(.quote-a4-sheet--clause-editing)'
            ),
        ];
        const coverSheets = [
            ...document.querySelectorAll(
                '#quote-preview .quote-a4-sheet:not(.quote-a4-sheet--continuation)'
            ),
        ];
        /** @type {Array<object>} */
        const overflows = [];
        /** @type {Array<object>} */
        const sheetMeta = [];
        /** Nearly-empty: ≤2 stamps and lastBottom < 35% of limit. */
        /** @type {number[]} */
        const sparseSheets = [];
        /** @type {Set<string>} */
        const seenSegs = new Set();
        /** @type {string[]} */
        const duplicateSegs = [];

        sheets.forEach((sheet, si) => {
            const content = sheet.querySelector('.content-section');
            const logo = sheet.querySelector('.quote-sheet-logo-row');
            const footer = sheet.querySelector('.footer-section');
            if (!content) return;

            const cRect = content.getBoundingClientRect();
            const endMark = sheet.querySelector('.quote-content-area-mark--end');
            /*
             * Only correct for zoom when a CSS transform scale is actually on an ancestor.
             * Using --quote-preview-zoom alone falsely inflated bottoms when transform was absent.
             */
            let zoom = 1;
            try {
                let el = content;
                while (el && el !== document.body) {
                    const t = getComputedStyle(el).transform;
                    if (t && t !== 'none') {
                        const m = t.match(/matrix\(([^,]+)/);
                        if (m) {
                            const a = Math.abs(parseFloat(m[1]));
                            if (a > 0.05 && Math.abs(a - 1) > 0.01) {
                                zoom = a;
                                break;
                            }
                        }
                    }
                    el = el.parentElement;
                }
            } catch {
                zoom = 1;
            }
            zoom = Math.max(zoom, 0.05);

            /* Fixed content box height (do not collapse via height:auto). */
            const contentH = cRect.height / zoom;
            let limitPx;
            /* Match PACK_HEIGHT_SAFETY_PX (20) used by pack + live peel. */
            if (endMark) {
                limitPx = (endMark.getBoundingClientRect().top - cRect.top) / zoom - 20;
            } else {
                limitPx = contentH - 20;
            }

            content.style.setProperty('overflow', 'visible', 'important');
            sheet.style.setProperty('overflow', 'visible', 'important');
            const mainFlex = sheet.querySelector('.quote-sheet-main-flex');
            if (mainFlex) mainFlex.style.setProperty('overflow', 'visible', 'important');
            void content.offsetHeight;

            let stamped = 0;
            let lastBottomPx = 0;
            content.querySelectorAll('[data-ems-pack-seg]').forEach((el) => {
                stamped += 1;
                const seg = el.getAttribute('data-ems-pack-seg') || '';
                if (seg) {
                    if (seenSegs.has(seg)) duplicateSegs.push(seg);
                    else seenSegs.add(seg);
                }
                const r = el.getBoundingClientRect();
                // Empty split wrappers have no painted box. A zero rect at the
                // viewport origin becomes a false overflow after scrolling/zoom.
                if (r.width / zoom < 1 && r.height / zoom < 1) return;
                const topPx = (r.top - cRect.top) / zoom;
                const bottomPx = (r.bottom - cRect.top) / zoom;
                if (bottomPx > lastBottomPx) lastBottomPx = bottomPx;
                if (bottomPx > limitPx + 1.5 || topPx >= limitPx - 1.5) {
                    overflows.push({
                        sheet: si + 1,
                        seg,
                        topPx: Math.round(topPx * 10) / 10,
                        bottomPx: Math.round(bottomPx * 10) / 10,
                        limit: Math.round(limitPx * 10) / 10,
                    });
                }
            });

            content.style.removeProperty('overflow');
            sheet.style.removeProperty('overflow');
            if (mainFlex) mainFlex.style.removeProperty('overflow');

            if (stamped > 0 && stamped <= 2 && lastBottomPx < limitPx * 0.35) {
                sparseSheets.push(si + 1);
            }

            sheetMeta.push({
                sheet: si + 1,
                stamped,
                contentH: Math.round(contentH),
                lastBottomPx: Math.round(lastBottomPx),
                limitPx: Math.round(limitPx),
                hasLogo: Boolean(logo),
                hasFooter: Boolean(footer),
                landscape: sheet.classList.contains('quote-a4-sheet--landscape'),
            });
        });
        const banner = /pagination (integrity|error)|clipped or missing/i.test(
            document.body.innerText || ''
        );
        const textSample = (document.getElementById('quote-preview')?.innerText || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 800);

        return {
            continuationCount: sheets.length,
            coverCount: coverSheets.length,
            totalSheets: sheets.length + coverSheets.length,
            stampedTotal: sheetMeta.reduce((s, m) => s + m.stamped, 0),
            uniqueSegs: seenSegs.size,
            duplicateSegs: [...new Set(duplicateSegs)],
            overflows,
            sparseSheets,
            sheetMeta,
            integrityBanner: banner,
            textSample,
        };
    });
}
