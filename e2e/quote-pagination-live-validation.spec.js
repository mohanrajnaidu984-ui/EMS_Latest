/**
 * End-to-end validation of EMS Quote pagination against a live Vite + API instance.
 *
 * Requires:
 *   - Vite (default http://localhost:5174)
 *   - API on :5002
 *
 * Env:
 *   EMS_E2E_BASE_URL=http://localhost:5174
 *   EMS_E2E_REQUEST_NO=1515
 *   EMS_E2E_SKIP_WEBSERVER=1
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
    alignUntilStable,
    measurePaginationHealth,
} from './helpers/emsSession.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACT_DIR = path.join(__dirname, 'artifacts', 'live-validation');
const REPORT_PATH = path.join(ARTIFACT_DIR, 'validation-report.json');

function ensureArtifacts() {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

async function setBrowserZoom(page, percent) {
    const factor = percent / 100;
    await page.evaluate((z) => {
        const shell =
            document.querySelector('.quote-preview-zoom-shell') ||
            document.getElementById('quote-preview')?.parentElement;
        if (shell) {
            shell.style.setProperty('--quote-preview-zoom', String(z));
            shell.style.transform = `scale(${z})`;
            shell.style.transformOrigin = 'top left';
        }
        document.body.style.zoom = String(z);
    }, factor);
    await page.waitForTimeout(600);
}

test.describe.configure({ mode: 'serial' });

test.describe('Live quote pagination validation (enquiry 1515)', () => {
    /** @type {import('@playwright/test').Page} */
    let page;
    /** @type {object} */
    const report = {
        startedAt: new Date().toISOString(),
        requestNo: process.env.EMS_E2E_REQUEST_NO || '1515',
        baseURL: process.env.EMS_E2E_BASE_URL || 'http://localhost:5174',
        phases: {},
        productionReady: false,
        unresolved: [],
    };

    test.beforeAll(async ({ browser }) => {
        ensureArtifacts();
        page = await browser.newPage({
            viewport: { width: 1600, height: 1000 },
            acceptDownloads: true,
        });
        await page.addInitScript(seedEmsAuthInBrowser, EMS_E2E_ADMIN);
        await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await page.waitForTimeout(2000);
    });

    test.afterAll(async () => {
        report.finishedAt = new Date().toISOString();
        fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
        await page?.close();
    });

    test('Phase 1 — open quotation, Align Page, verify geometry & visibility', async () => {
        const preview = await openEnquiryQuotePreview(page, report.requestNo);
        const health = await alignUntilStable(page, 3);
        report.phases.phase1 = { health };

        await preview.screenshot({
            path: path.join(ARTIFACT_DIR, 'preview-full.png'),
            fullPage: true,
        });

        const contCount = await page.locator('#quote-preview .quote-a4-sheet--continuation').count();
        const maxShot = Math.min(contCount, 8);
        for (let i = 0; i < maxShot; i += 1) {
            const sheet = page.locator('#quote-preview .quote-a4-sheet--continuation').nth(i);
            await sheet.screenshot({
                path: path.join(ARTIFACT_DIR, `continuation-page-${i + 1}.png`),
            });
        }
        report.phases.phase1.screenshots = {
            previewFull: 'preview-full.png',
            continuationPages: maxShot,
        };
        fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');

        expect(health.totalSheets, 'expected at least cover + content').toBeGreaterThanOrEqual(1);
        for (const meta of health.sheetMeta) {
            expect(meta.hasLogo, `sheet ${meta.sheet} missing logo band`).toBe(true);
            expect(meta.hasFooter, `sheet ${meta.sheet} missing footer band`).toBe(true);
            expect(meta.contentH, `sheet ${meta.sheet} content height`).toBeGreaterThan(200);
        }

        /* Coverage / uniqueness (application pipeline, not selector noise). */
        if (health.duplicateSegs?.length) {
            report.unresolved.push(
                `Phase1 duplicate packed segs: ${health.duplicateSegs.slice(0, 12).join(',')}`
            );
        }
        if (health.sparseSheets?.length) {
            report.unresolved.push(
                `Phase1 avoidable sparse sheets (≤2 units, <35% filled): ${health.sparseSheets.join(',')}`
            );
        }

        /* Determinism: repeated Align must settle to zero overflows (sheet count may vary slightly). */
        const health2 = await alignUntilStable(page, 3);
        report.phases.phase1.alignRepeat = {
            sheets1: health.totalSheets,
            sheets2: health2.totalSheets,
            overflows1: health.overflows.length,
            overflows2: health2.overflows.length,
            stamped1: health.stampedTotal,
            stamped2: health2.stampedTotal,
            sparse2: health2.sparseSheets,
        };
        if (health2.overflows.length !== 0) {
            report.unresolved.push(
                `Phase1 Align re-run left overflows: sheets ${health.totalSheets}→${health2.totalSheets}, overflows ${health2.overflows.length}`
            );
        } else if (
            health.overflows.length === 0 &&
            Math.abs(health2.totalSheets - health.totalSheets) > 2
        ) {
            report.unresolved.push(
                `Phase1 Align sheet-count drift (overflows clear): ${health.totalSheets}→${health2.totalSheets}`
            );
        }

        /*
         * Soft-assert geometry: record overflow failure but keep the browser session so
         * later phases can still capture PDF / failure-handling evidence.
         */
        if (health.overflows.length > 0) {
            report.unresolved.push(
                `Phase1 overflows after ${health.alignAttempts} Align attempts: ${health.overflows.length} units past CONTENT END (sheets ${[...new Set(health.overflows.map((o) => o.sheet))].join(', ')})`
            );
            report.phases.phase1.passed = false;
            console.error(
                '[Phase1] OVERFLOWS (not production-ready):',
                JSON.stringify(health.overflows, null, 2)
            );
            /* Hard-fail — soft-pass hid the still-broken pagination algorithm. */
            expect(
                health.overflows,
                `overflows remain after Align×${health.alignAttempts}`
            ).toEqual([]);
        } else {
            report.phases.phase1.passed =
                !health.integrityBanner &&
                !(health.duplicateSegs?.length) &&
                !(health.sparseSheets?.length > 2);
            expect(health.integrityBanner).toBe(false);
            expect(health.duplicateSegs || []).toEqual([]);
        }
    });

    test('Phase 2 — zoom 80 / 100 / 125% visibility', async () => {
        const zooms = [80, 100, 125];
        /** @type {object[]} */
        const zoomResults = [];
        for (const z of zooms) {
            await setBrowserZoom(page, z);
            const health = await alignUntilStable(page, 2).catch(async () => {
                await clickAlignPage(page).catch(() => {});
                return measurePaginationHealth(page);
            });
            await page.screenshot({
                path: path.join(ARTIFACT_DIR, `preview-zoom-${z}.png`),
                fullPage: false,
            });
            zoomResults.push({
                zoom: z,
                overflows: health.overflows.length,
                sheets: health.totalSheets,
                stamped: health.stampedTotal,
                banner: health.integrityBanner,
                overflowSample: health.overflows.slice(0, 5),
            });
            if (health.overflows.length) {
                report.unresolved.push(`Phase2 zoom ${z}%: ${health.overflows.length} overflows`);
            }
        }
        await setBrowserZoom(page, 100);
        report.phases.phase2 = {
            zoomResults,
            passed: zoomResults.every((z) => z.overflows === 0 && !z.banner),
        };
        fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
    });

    test('Phase 3 — download PDF and compare to preview', async () => {
        const previewHealth = await measurePaginationHealth(page);
        const previewText = await page.evaluate(
            () => (document.getElementById('quote-preview')?.innerText || '').replace(/\s+/g, ' ').trim()
        );

        const alertMsgs = [];
        page.on('dialog', async (d) => {
            alertMsgs.push(d.message());
            await d.accept().catch(() => d.dismiss());
        });

        const dlBtn = page
            .getByRole('button', { name: /Download quote PDF|Save quote as PDF|Download PDF|Save as PDF/i })
            .first();
        const hasBtn = (await dlBtn.count()) > 0;

        let download = null;
        let pdfPath = null;
        let pdfBytes = 0;
        let pdfText = '';
        let pdfPageCount = null;

        if (hasBtn) {
            const downloadPromise = page.waitForEvent('download', { timeout: 60_000 }).catch(() => null);
            await dlBtn.click();
            download = await downloadPromise;
        } else {
            report.unresolved.push('Phase3: Download PDF toolbar button not found');
        }

        if (download) {
            const suggested = await download.suggestedFilename();
            pdfPath = path.join(ARTIFACT_DIR, suggested?.endsWith('.pdf') ? suggested : 'quote-1515.pdf');
            await download.saveAs(pdfPath);
            pdfBytes = fs.statSync(pdfPath).size;
            try {
                const pdfParse = (await import('pdf-parse')).default;
                const data = await pdfParse(fs.readFileSync(pdfPath));
                pdfText = String(data.text || '').replace(/\s+/g, ' ').trim();
                pdfPageCount = data.numpages;
            } catch (err) {
                report.unresolved.push(`pdf-parse failed: ${err?.message || err}`);
            }
        }

        const previewDirty =
            previewHealth.integrityBanner || previewHealth.overflows.length > 0;
        const previewTokens = previewText
            .split(/\s+/)
            .filter((w) => w.length > 4)
            .slice(0, 40);
        const missingInPdf = previewTokens.filter((t) => pdfText && !pdfText.includes(t)).slice(0, 15);

        let phase3Ok = false;
        if (previewDirty) {
            /* When preview is clipped, PDF must be blocked (alert and/or no download). */
            const blocked =
                download == null ||
                alertMsgs.some((m) => /integrity|clip|missing|pagination/i.test(m));
            phase3Ok = blocked;
            if (!blocked) {
                report.unresolved.push(
                    'Phase3: dirty preview still allowed PDF download — export gate failed'
                );
            } else {
                report.unresolved.push(
                    'Phase3: PDF correctly blocked because preview still has overflows/integrity fail (parity compare skipped)'
                );
            }
        } else {
            phase3Ok =
                Boolean(download) &&
                pdfBytes > 5000 &&
                (pdfPageCount == null ||
                    Math.abs(pdfPageCount - previewHealth.totalSheets) <= 2) &&
                !(pdfText.length > 100 && missingInPdf.length > 12);
            if (!phase3Ok) {
                report.unresolved.push(
                    `Phase3 PDF parity issues: download=${Boolean(download)} bytes=${pdfBytes} pages=${pdfPageCount}`
                );
            }
        }

        report.phases.phase3 = {
            previewSheets: previewHealth.totalSheets,
            previewContinuations: previewHealth.continuationCount,
            previewDirty,
            pdfPath: pdfPath ? path.basename(pdfPath) : null,
            pdfBytes,
            pdfPageCount,
            alertMsgs,
            missingTokenSample: missingInPdf,
            previewTextLen: previewText.length,
            pdfTextLen: pdfText.length,
            passed: phase3Ok,
        };
        fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
    });

    test('Phase 4 — unsplittable overflow blocks PDF export', async () => {
        /* Inject a stamped unit that extends past the content box */
        await page.evaluate(() => {
            const content = document.querySelector(
                '#quote-preview .quote-a4-sheet--continuation .content-section'
            );
            if (!content) throw new Error('no continuation content-section');
            let unit = content.querySelector('[data-ems-e2e-overflow-probe]');
            if (!unit) {
                unit = document.createElement('div');
                unit.setAttribute('data-ems-e2e-overflow-probe', '1');
                unit.setAttribute('data-ems-pack-seg', '999999');
                unit.textContent = 'E2E OVERFLOW PROBE — MUST BLOCK PDF';
                unit.style.cssText =
                    'position:absolute;left:0;top:0;width:100%;height:2400px;background:rgba(255,0,0,0.08);z-index:5;';
                content.style.position = 'relative';
                content.appendChild(unit);
            }
        });

        await page.waitForTimeout(400);
        const health = await measurePaginationHealth(page);
        expect(health.overflows.length).toBeGreaterThan(0);

        const alertMsgs = [];
        const onDlg = async (d) => {
            alertMsgs.push(d.message());
            try {
                await d.accept();
            } catch {
                /* already handled by another listener */
            }
        };
        page.on('dialog', onDlg);

        const downloadPromise = page.waitForEvent('download', { timeout: 8_000 }).catch(() => null);
        const dlBtn = page
            .getByRole('button', { name: /Download quote PDF|Save quote as PDF|Download PDF|Save as PDF/i })
            .first();
        if ((await dlBtn.count()) > 0) {
            await dlBtn.click();
        }
        const download = await downloadPromise;
        page.off('dialog', onDlg);

        const alertText = alertMsgs.join(' | ');
        const blocked =
            Boolean(alertText && /integrity|clip|missing|pagination/i.test(alertText)) ||
            download == null;

        report.phases.phase4 = {
            overflowsDetected: health.overflows.length,
            alertText,
            downloadOccurred: Boolean(download),
            passed: blocked,
        };
        if (!blocked) {
            report.unresolved.push(
                `Phase4: PDF was not blocked for overflow probe (alert="${alertText}") — export gate gap`
            );
        }
        fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');

        await page.evaluate(() => {
            document.querySelectorAll('[data-ems-e2e-overflow-probe]').forEach((el) => el.remove());
        });
        /* Recorded above — do not hard-stop the suite so Phase 5 can conclude. */
    });

    test('Phase 5 — write production-readiness conclusion', async () => {
        const p1 = report.phases.phase1 || {};
        const p2 = report.phases.phase2 || {};
        const p3 = report.phases.phase3 || {};
        const p4 = report.phases.phase4 || {};

        const phase1Ok = p1.passed === true;
        const phase2Ok = p2.passed === true;
        const phase3Ok = p3.passed === true;
        const phase4Ok = p4.passed === true;

        report.productionReady = Boolean(phase1Ok && phase2Ok && phase3Ok && phase4Ok);
        report.conclusion = report.productionReady
            ? 'PRODUCTION-READY for pagination on validated enquiry content (subject to remaining limitations in unresolved[]).'
            : 'NOT production-ready — live preview still has clipped/overflowing units and/or PDF parity/gate failures; see phases and unresolved[].';
        report.summary = {
            phase1: phase1Ok ? 'PASS' : 'FAIL',
            phase2: phase2Ok ? 'PASS' : 'FAIL',
            phase3: phase3Ok ? 'PASS' : 'FAIL',
            phase4: phase4Ok ? 'PASS' : 'FAIL',
            productionReady: report.productionReady,
        };

        fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
        expect(report.conclusion).toBeTruthy();
        expect(report.summary).toBeTruthy();
        /* Never claim ready when Phase1 still has overflows */
        if ((report.phases.phase1?.health?.overflows || []).length > 0) {
            expect(report.productionReady).toBe(false);
        }
    });
});
