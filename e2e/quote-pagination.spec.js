/**
 * Real-browser pagination checks for EMS Quote A4 preview / PDF.
 *
 * Env:
 *   EMS_E2E_BASE_URL — Vite origin (default http://localhost:5174)
 *   EMS_E2E_QUOTE_URL — optional full URL already on quote preview
 *   EMS_E2E_SKIP_WEBSERVER=1 — use already-running Vite
 */
import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    EMS_E2E_ADMIN,
    seedEmsAuthInBrowser,
    openEnquiryQuotePreview,
    clickAlignPage,
    measurePaginationHealth,
} from './helpers/emsSession.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACT_DIR = path.join(__dirname, 'artifacts');

function ensureArtifacts() {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

async function gotoLiveQuote(page) {
    const direct = process.env.EMS_E2E_QUOTE_URL;
    await page.addInitScript(seedEmsAuthInBrowser, EMS_E2E_ADMIN);
    if (direct) {
        await page.goto(direct, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        const preview = page.locator('#quote-preview');
        await preview.first().waitFor({ state: 'visible', timeout: 120_000 });
        return preview.first();
    }
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(1500);
    return openEnquiryQuotePreview(page, process.env.EMS_E2E_REQUEST_NO || '1515');
}

test.describe('quote pagination geometry + visibility', () => {
    test('stamped units stay above CONTENT END / content box', async ({ page }) => {
        ensureArtifacts();
        const preview = await gotoLiveQuote(page);
        await clickAlignPage(page);

        const report = await measurePaginationHealth(page);
        await preview.screenshot({
            path: path.join(ARTIFACT_DIR, 'quote-preview-continuation.png'),
            fullPage: true,
        });
        fs.writeFileSync(
            path.join(ARTIFACT_DIR, 'pagination-health.json'),
            JSON.stringify(report, null, 2),
            'utf8'
        );

        expect(report.overflows, JSON.stringify(report.overflows, null, 2)).toEqual([]);
        expect(report.integrityBanner).toBe(false);
        expect(report.totalSheets).toBeGreaterThanOrEqual(1);
    });

    test('PDF download is blocked when integrity banner is shown', async ({ page }) => {
        await gotoLiveQuote(page);
        await clickAlignPage(page);

        await page.evaluate(() => {
            const content = document.querySelector(
                '#quote-preview .quote-a4-sheet--continuation .content-section'
            );
            if (!content) throw new Error('no continuation content for integrity probe');
            const unit = document.createElement('div');
            unit.setAttribute('data-ems-pack-seg', '999998');
            unit.setAttribute('data-ems-e2e-overflow-probe', '1');
            unit.style.cssText =
                'position:absolute;left:0;top:0;width:100%;height:2400px;z-index:5;';
            unit.textContent = 'INTEGRITY PROBE';
            content.style.position = 'relative';
            content.appendChild(unit);
        });

        let alertText = '';
        page.once('dialog', async (d) => {
            alertText = d.message();
            await d.accept();
        });
        const downloadPromise = page.waitForEvent('download', { timeout: 8_000 }).catch(() => null);
        const btns = page.getByRole('button', { name: /Download PDF|Save as PDF/i });
        await expect(btns.first()).toBeVisible();
        await btns.first().click();
        const download = await downloadPromise;

        const blocked =
            /integrity|clip|missing|pagination/i.test(alertText) || download == null;
        expect(blocked, `alert="${alertText}" download=${Boolean(download)}`).toBe(true);
    });
});

test.describe('fixture injection helpers (unit-like in browser)', () => {
    test('100-row BOQ fixture can be measured in isolation', async ({ page }) => {
        ensureArtifacts();
        await page.setContent(`
<!DOCTYPE html>
<html><head><style>
  .content-section { width: 180mm; height: 220mm; overflow: hidden; position: relative; box-sizing: border-box; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; line-height: 1.4; }
  td, th { border: 1px solid #ccc; padding: 1px 4px; }
</style></head><body>
  <div id="host" class="content-section"></div>
  <script>
    const host = document.getElementById('host');
    const rows = Array.from({length: 100}, (_, i) =>
      '<tr data-ems-pack-seg="'+i+'"><td>'+(i+1)+'</td><td>Item '+(i+1)+'</td><td>1</td></tr>'
    ).join('');
    host.innerHTML = '<table><thead><tr><th>#</th><th>Desc</th><th>Qty</th></tr></thead><tbody>'+rows+'</tbody></table>';
    window.__fixture = (() => {
      const cRect = host.getBoundingClientRect();
      const limit = cRect.height - 12;
      let lastOk = -1;
      let overflows = 0;
      host.querySelectorAll('[data-ems-pack-seg]').forEach((el) => {
        const r = el.getBoundingClientRect();
        const bottom = r.bottom - cRect.top;
        if (bottom <= limit + 1.5) lastOk = Number(el.getAttribute('data-ems-pack-seg'));
        else overflows += 1;
      });
      return { limit, lastOk, overflows, total: 100 };
    })();
  </script>
</body></html>`);

        const fixture = await page.evaluate(() => window.__fixture);
        expect(fixture.total).toBe(100);
        expect(fixture.overflows).toBeGreaterThan(0);
        expect(fixture.lastOk).toBeGreaterThanOrEqual(0);
        expect(fixture.lastOk).toBeLessThan(99);
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'boq-100-unpaginated-overflow.png') });
    });
});
