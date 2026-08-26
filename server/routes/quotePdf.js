/**
 * Vector PDF from HTML using headless Chromium (selectable text, not canvas screenshots).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const express = require('express');
const { applyQuotePdfRestrictions, isQuotePdfRestrictEnabled } = require('../lib/restrictQuotePdf');
const { resolvePuppeteerChromeExecutable } = require('../lib/resolvePuppeteerChrome');
const {
    newPage: newPooledPdfPage,
    releaseAfterJob: releasePooledBrowser,
    closePooledBrowser,
    markBrowserUnhealthy,
} = require('../lib/quotePdfBrowserPool.cjs');
const { msSince, logStage, headerJson, isPerfLogEnabled, printPerfReport } = require('../lib/quotePdfPerf.cjs');
const { logQuotePdfPaginationDiagnostics, isPaginationDebugEnabled } = require('../lib/quotePdfPaginationDebug.cjs');
const {
    streamPdfBufferToResponse,
    storePdfForTokenDownload,
    streamTokenPdfToResponse,
} = require('../lib/quotePdfResponseStream.cjs');

const { PDFDocument } = require('pdf-lib');
const router = express.Router();

/** In-memory logo data URLs keyed by absolute path + mtime (avoids FS read per PDF). */
const logoDataUrlCache = new Map();
const LOGO_CACHE_MAX = 64;

function readLogoDataUrlCached(diskPath) {
    let stat;
    try {
        stat = fs.statSync(diskPath);
    } catch {
        return null;
    }
    const key = `${diskPath}|${stat.mtimeMs}|${stat.size}`;
    const hit = logoDataUrlCache.get(key);
    if (hit) return hit;
    const buf = fs.readFileSync(diskPath);
    const dataUrl = `data:${mimeForLogoPath(diskPath)};base64,${buf.toString('base64')}`;
    if (logoDataUrlCache.size >= LOGO_CACHE_MAX) {
        const first = logoDataUrlCache.keys().next().value;
        logoDataUrlCache.delete(first);
    }
    logoDataUrlCache.set(key, dataUrl);
    return dataUrl;
}

/** Beyond this, use file:// load instead of setContent (CDP limits / IIS hangs). */
const SETCONTENT_SAFE_MAX = 8_000_000;

/** Outside the Vite project tree so dev HMR does not reload on every PDF HTML write. */
function getPdfTempDir() {
    const dir = path.join(os.tmpdir(), 'ems-quote-pdf');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}

function puppeteerLaunchTimeoutMs() {
    const n = Number(process.env.PUPPETEER_LAUNCH_TIMEOUT_MS);
    return Number.isFinite(n) && n > 0 ? n : 120000;
}

function quotePdfPageTimeoutMs() {
    const n = Number(process.env.QUOTE_PDF_PAGE_TIMEOUT_MS);
    return Number.isFinite(n) && n > 0 ? n : 120000;
}

function useSingleProcessChrome() {
    /** Windows Server / PM2: --single-process often hangs launch (120s timeout). Default off on win32. */
    const winDefault = process.platform === 'win32' ? '0' : '1';
    const raw = String(process.env.QUOTE_PDF_SINGLE_PROCESS ?? winDefault).trim().toLowerCase();
    return raw !== '0' && raw !== 'false' && raw !== 'no';
}

/** Always log critical Puppeteer steps (PM2 stdout). Verbose when EMS_QUOTE_PDF_PERF_LOG=1. */
function pdfStepLog(step, detail) {
    const suffix = detail != null ? ` ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : '';
    console.log(`[quote-pdf][step] ${step}${suffix}`);
}

function useFileHtmlLoad(htmlLength) {
    const force = String(process.env.QUOTE_PDF_USE_FILE_LOAD ?? '1').trim().toLowerCase();
    if (force === '0' || force === 'false' || force === 'no') {
        return htmlLength > SETCONTENT_SAFE_MAX;
    }
    /** Default on IIS/PM2: file:// avoids setContent hangs on loopback /uploads subresources. */
    return true;
}

/**
 * Block slow/hanging network loads (fonts, external images). Logos are embedded from disk after load.
 */
async function setupPdfRequestInterception(page) {
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        try {
            const url = req.url();
            const type = req.resourceType();
            if (url.startsWith('data:') || url.startsWith('file:') || url.startsWith('about:')) {
                req.continue();
                return;
            }
            if (/fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(url)) {
                req.abort();
                return;
            }
            /** Rewritten /uploads URLs — disk embed handles logos; do not wait on loopback HTTP. */
            if (/^https?:\/\/(?:127\.0\.0\.1|localhost)[^/]*\/uploads\//i.test(url)) {
                req.abort();
                return;
            }
            if (type === 'image' || type === 'font' || type === 'media') {
                req.abort();
                return;
            }
            req.continue();
        } catch {
            try {
                req.continue();
            } catch {
                /* ignore */
            }
        }
    });
}

/**
 * Shared launch options for /health probe and /generate (IIS/PM2 service accounts).
 * Hardened for Windows Server session isolation — see PUPPETEER_* / QUOTE_PDF_* in server/.env.
 */
function buildChromeLaunchOptions(executablePath, userDataDir) {
    const args = [
        '--headless=new',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--hide-scrollbars',
        '--mute-audio',
        /** Prevent visible "Restore pages?" bubble when profile was touched while Chrome still running. */
        '--disable-session-crashed-bubble',
        '--disable-features=InfiniteSessionRestore,Translate',
        '--noerrdialogs',
        '--disable-restore-session-state',
        '--no-zygote',
        '--disable-software-rasterizer',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-hang-monitor',
        '--disable-ipc-flooding-protection',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--disable-client-side-phishing-detection',
        '--disable-default-apps',
        '--disable-sync',
        '--metrics-recording-only',
        '--disable-print-preview',
        '--no-proxy-server',
        '--proxy-bypass-list=*',
        '--proxy-server="direct://"',
        '--disable-web-security',
        /** CRITICAL: Prevent occlusion hang on Windows Server Session 0 & block CORS loopback blocks */
        '--disable-features=CalculateNativeWinOcclusion,BlockInsecurePrivateNetworkRequests',
    ];
    if (useSingleProcessChrome()) {
        args.push('--single-process');
    }
    return {
        headless: true,
        executablePath,
        timeout: puppeteerLaunchTimeoutMs(),
        userDataDir,
        /** pipe:true can flash a window on Windows; pipe:false is more stable when profile is not deleted mid-flight. */
        pipe: false,
        args,
        /** Do not inherit the user's desktop Chrome profile (avoids restore-session dialogs). */
        ignoreDefaultArgs: ['--enable-automation'],
    };
}

/**
 * Validate Puppeteer browser launch stability under Windows service session.
 */
async function runLaunchProbe(puppeteer, chromePath) {
    if (!chromePath) return { ok: false, error: 'No chrome path resolved.' };
    const probeDir = path.join(getPdfTempDir(), `ems-puppeteer-probe-${process.pid}-${Date.now()}`);
    const t0 = Date.now();
    let probeBrowser;
    try {
        probeBrowser = await puppeteer.launch(buildChromeLaunchOptions(chromePath, probeDir));
        const probePage = await probeBrowser.newPage();
        await probePage.goto('about:blank', {
            waitUntil: 'domcontentloaded',
            timeout: quotePdfPageTimeoutMs(),
        });
        return { ok: true, ms: Date.now() - t0 };
    } catch (probeErr) {
        return {
            ok: false,
            ms: Date.now() - t0,
            error: probeErr && probeErr.message ? String(probeErr.message) : String(probeErr),
        };
    } finally {
        if (probeBrowser) await probeBrowser.close().catch(() => {});
        try {
            fs.rmSync(probeDir, { recursive: true, force: true });
        } catch {
            /* ignore */
        }
    }
}

/** Quick reachability check for Quote tab PDF download (Vite proxies /api → Express). */
router.get('/health', async (req, res) => {
    let puppeteerOk = false;
    let chromePath = null;
    let chromeReady = false;
    let chromeHint = '';
    let launchProbe;
    let chromeSpawnProbe;
    let trustedEnvPath;
    let spawnProbeWarning;
    let chromeSource;
    try {
        require.resolve('puppeteer');
        puppeteerOk = true;
        const puppeteer = require('puppeteer');
        const resolved = resolvePuppeteerChromeExecutable(puppeteer);
        trustedEnvPath = resolved.trustedEnvPath;
        spawnProbeWarning = resolved.spawnProbeWarning;
        chromeSource = resolved.source;
        chromeSpawnProbe = resolved.spawnProbe;
        chromePath = resolved.executablePath;
        chromeReady =
            !!chromePath &&
            (resolved.trustedEnvPath || resolved.spawnProbe?.ok !== false || resolved.spawnProbe?.skipped);
        if (!chromeReady) chromeHint = resolved.reason || '';
        if (resolved.spawnProbe && !resolved.spawnProbe.ok && !resolved.trustedEnvPath) {
            chromeHint = resolved.spawnProbe.error || resolved.reason || 'Chrome spawn probe failed (EFTYPE?)';
        }
        if (resolved.spawnProbeWarning) {
            chromeHint = resolved.spawnProbeWarning;
        }

        if (String(req.query.launch || '').trim() === '1' && chromePath) {
            const probeDir = path.join(getPdfTempDir(), `ems-puppeteer-probe-${process.pid}-${Date.now()}`);
            const t0 = Date.now();
            let probeBrowser;
            try {
                probeBrowser = await puppeteer.launch(buildChromeLaunchOptions(chromePath, probeDir));
                const probePage = await probeBrowser.newPage();
                await probePage.goto('about:blank', {
                    waitUntil: 'domcontentloaded',
                    timeout: quotePdfPageTimeoutMs(),
                });
                launchProbe = { ok: true, ms: Date.now() - t0 };
            } catch (probeErr) {
                launchProbe = {
                    ok: false,
                    ms: Date.now() - t0,
                    error: probeErr && probeErr.message ? String(probeErr.message) : String(probeErr),
                };
            } finally {
                if (probeBrowser) await probeBrowser.close().catch(() => {});
                try {
                    fs.rmSync(probeDir, { recursive: true, force: true });
                } catch {
                    /* ignore */
                }
            }
        }
    } catch {
        puppeteerOk = false;
        chromeHint = 'Install: cd server && npm install puppeteer';
    }
    const serverPdfEnabled = process.env.EMS_QUOTE_PDF_SERVER_ENABLED === '1';
    const chromeLabel = chromePath
        ? /msedge\.exe/i.test(chromePath)
            ? 'edge'
            : /chrome\.exe/i.test(chromePath)
              ? 'chrome'
              : 'chromium'
        : undefined;
    return res.json({
        ok: true,
        port: serverListenPort(),
        puppeteer: puppeteerOk,
        chromeReady,
        chromePath: chromePath || undefined,
        chromeEngine: chromeLabel,
        chromeHint: chromeHint || undefined,
        chromeSource: chromeSource || undefined,
        launchProbe,
        chromeSpawnProbe,
        trustedEnvPath: trustedEnvPath || undefined,
        spawnProbeWarning: spawnProbeWarning || undefined,
        emsQuotePdfServerEnabled: serverPdfEnabled,
        emsQuotePdfPerfLog: isPerfLogEnabled(),
        emsQuotePdfDebugPagination: isPaginationDebugEnabled(),
        quotePdfCssVersion: '2026-08-26-latest',
        quotePdfAssetOrigin: (process.env.QUOTE_PDF_ASSET_ORIGIN || `http://127.0.0.1:${serverListenPort()}`).replace(
            /\/$/,
            ''
        ),
    });
});

const serverListenPort = () => String(process.env.PORT || 5002);

/** Same font as on-screen #quote-preview (QuoteForm.jsx) — do not switch to Inter in PDF. */
const QUOTE_PREVIEW_FONT_STACK =
    "'Segoe UI', 'Segoe UI Web (West European)', system-ui, -apple-system, sans-serif";

const { QUOTE_UNIFIED_SHEET_EXPORT_CSS } = require('../lib/quotePrintExportCss.cjs');

/** Injected last in <head> — strip compositing that rasterizes text; keep Segoe UI from hoisted CSS. */
function buildPdfSharpTextHeadCss() {
    return `<style id="ems-pdf-sharp-text">
html[data-preview-pdf="1"] #quote-preview {
    background: #fff !important;
    padding: 0 !important;
    gap: 0 !important;
    font-family: ${QUOTE_PREVIEW_FONT_STACK} !important;
    -webkit-font-smoothing: antialiased !important;
    -moz-osx-font-smoothing: grayscale !important;
    text-rendering: auto !important;
}
html[data-preview-pdf="1"] #quote-preview *:not(.quote-digital-signature-stamp):not(.quote-signature-stamp-caption):not(.quote-signature-stamp-body):not(svg):not(svg *):not(.quote-header-quote-meta-ic-wrap):not(.quote-header-quote-meta-ic-wrap *):not(.quote-header-address-meta-ic-wrap):not(.quote-header-address-meta-ic-wrap *) {
    -webkit-font-smoothing: antialiased !important;
    -moz-osx-font-smoothing: grayscale !important;
    text-rendering: auto !important;
    transform: none !important;
    filter: none !important;
    backdrop-filter: none !important;
}
/** Lucide stroke icons — Chromium PDF often drops CSS stroke; pin presentation + print colors. */
html[data-preview-pdf="1"] .quote-header-quote-meta-ic-wrap svg,
html[data-preview-pdf="1"] .quote-header-address-meta-ic-wrap svg {
    display: block !important;
    stroke: #ffffff !important;
    color: #ffffff !important;
    overflow: visible !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
}
html[data-preview-pdf="1"] .quote-header-quote-meta-ic-wrap svg path,
html[data-preview-pdf="1"] .quote-header-quote-meta-ic-wrap svg line,
html[data-preview-pdf="1"] .quote-header-quote-meta-ic-wrap svg circle,
html[data-preview-pdf="1"] .quote-header-quote-meta-ic-wrap svg polyline,
html[data-preview-pdf="1"] .quote-header-quote-meta-ic-wrap svg polygon,
html[data-preview-pdf="1"] .quote-header-quote-meta-ic-wrap svg rect,
html[data-preview-pdf="1"] .quote-header-address-meta-ic-wrap svg path,
html[data-preview-pdf="1"] .quote-header-address-meta-ic-wrap svg line,
html[data-preview-pdf="1"] .quote-header-address-meta-ic-wrap svg circle,
html[data-preview-pdf="1"] .quote-header-address-meta-ic-wrap svg polyline,
html[data-preview-pdf="1"] .quote-header-address-meta-ic-wrap svg polygon,
html[data-preview-pdf="1"] .quote-header-address-meta-ic-wrap svg rect {
    stroke: #ffffff !important;
    fill: none !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
}
html[data-preview-pdf="1"] .quote-header-quote-meta-ic-wrap img,
html[data-preview-pdf="1"] .quote-header-address-meta-ic-wrap img {
    display: block !important;
    width: 11px !important;
    height: 11px !important;
}
html[data-preview-pdf="1"] .quote-a4-sheet {
    position: relative !important;
}
html[data-preview-pdf="1"] .quote-digital-signature-stamp {
    position: absolute !important;
    /* left/top: inline calc(xPct/yPct) — never override for preview/PDF parity */
}
html[data-preview-pdf="1"] .quote-a4-sheet,
html[data-preview-pdf="1"] .quote-preview-panel-shell,
html[data-preview-pdf="1"] .quote-cover-body-panel,
html[data-preview-pdf="1"] .quote-clause-heading-panel,
html[data-preview-pdf="1"] .quote-cover-meta-table {
    box-shadow: none !important;
}
html[data-preview-pdf="1"] .clause-content,
html[data-preview-pdf="1"] .clause-content p,
html[data-preview-pdf="1"] .clause-content li,
html[data-preview-pdf="1"] .clause-content td,
html[data-preview-pdf="1"] .clause-content th,
html[data-preview-pdf="1"] .quote-clause-heading-panel h3 {
    font-family: inherit !important;
}
${QUOTE_UNIFIED_SHEET_EXPORT_CSS}
html[data-preview-pdf="1"] #quote-preview:has(.quote-a4-sheet--landscape),
html[data-preview-pdf="1"] #quote-preview:has(.quote-a4-sheet[data-page-orientation="landscape"]) {
    width: auto !important;
    min-width: 0 !important;
    max-width: none !important;
    margin: 0 !important;
}
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet--landscape,
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet[data-page-orientation="landscape"] {
    width: 297mm !important;
    min-width: 297mm !important;
    max-width: 297mm !important;
    min-height: 210mm !important;
    height: 210mm !important;
    max-height: 210mm !important;
    margin: 0 !important;
}
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet--landscape .quote-sheet-main-flex,
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet--landscape .content-section,
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet--landscape .header-section,
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet--landscape .footer-section,
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet--landscape .quote-clause-block,
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet--landscape .clause-content,
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet[data-page-orientation="landscape"] .quote-sheet-main-flex,
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet[data-page-orientation="landscape"] .content-section,
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet[data-page-orientation="landscape"] .header-section,
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet[data-page-orientation="landscape"] .footer-section,
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet[data-page-orientation="landscape"] .quote-clause-block,
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet[data-page-orientation="landscape"] .clause-content {
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
}
</style>`;
}

function injectPdfSharpTextHead(html) {
    let out = String(html);
    out = out.replace(/<link[^>]*fonts\.googleapis\.com[^>]*>\s*/gi, '');
    out = out.replace(/<link[^>]*fonts\.gstatic\.com[^>]*>\s*/gi, '');
    const block = buildPdfSharpTextHeadCss();
    if (out.includes('</head>')) {
        return out.replace('</head>', `${block}</head>`);
    }
    return `${block}${out}`;
}

/**
 * HTML is built in the browser; `<base href>` and `/uploads` URLs often use the LAN host (e.g. 192.168.x.x).
 * Puppeteer runs on the API machine and must load logos from a host it can reach — default loopback + PORT.
 * Override with QUOTE_PDF_ASSET_ORIGIN (e.g. http://127.0.0.1:5002) if needed.
 */
function rewriteHtmlAssetHostsForPuppeteer(html) {
    const port = serverListenPort();
    const local = (process.env.QUOTE_PDF_ASSET_ORIGIN || `http://127.0.0.1:${port}`).replace(/\/$/, '');
    let out = String(html);
    out = out.replace(/<base\s+href\s*=\s*["'][^"']*["']/i, `<base href="${local}/">`);
    const reAbsUploads = new RegExp(`https?:\\/\\/[^\\s"'<>]+:${port}\\/uploads`, 'gi');
    out = out.replace(reAbsUploads, `${local}/uploads`);
    /**
     * Dev: logos often use the Vite origin (`:5174/uploads`, etc.). Puppeteer must hit Express `/uploads`
     * (same machine) — rewrite common dev-server ports so Chromium does not hang or fail loading assets.
     */
    out = out.replace(
        /https?:\/\/(?:localhost|127\.0\.0\.1|[\w.-]+):\s*(?:5173|5174|5175|5176|5177|5178|5179)\/uploads/gi,
        `${local}/uploads`
    );
    /** IIS proxy (:5173) or LAN API host — Puppeteer must use loopback, not the server’s public IP. */
    out = out.replace(
        new RegExp(`https?:\\/\\/(?:localhost|127\\.0\\.0\\.1|[\\w.-]+):\\s*${port}\\/uploads`, 'gi'),
        `${local}/uploads`
    );
    return out;
}

function extractBaseHrefFromHtml(html) {
    const m = String(html).match(/<base\s+href\s*=\s*["']([^"']+)["']/i);
    if (!m) return undefined;
    const u = m[1].trim().replace(/\/+$/, '');
    return u || undefined;
}

const QUOTE_LOGO_IMG_SELECTOR = '.quote-sheet-logo-row img, .quote-continuation-header img';

function mimeForLogoPath(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.gif') return 'image/gif';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.svg') return 'image/svg+xml';
    return 'image/png';
}

/**
 * When HTML still references /uploads over HTTP, Puppeteer may fail while the browser preview worked.
 * Read logos from disk on the API server and set data URLs (matches embedded client capture).
 */
function uploadsRelativePathFromImgSrc(src) {
    const raw = String(src || '').trim();
    if (!raw || /^data:/i.test(raw)) return '';
    try {
        const u = new URL(raw);
        const m = u.pathname.match(/\/uploads\/(.+)$/i);
        if (m) return decodeURIComponent(m[1]);
    } catch {
        const m = raw.replace(/\\/g, '/').match(/uploads\/(.+)$/i);
        if (m) return decodeURIComponent(m[1]);
    }
    return '';
}

/**
 * Embed division logos from server disk (IIS: Puppeteer cannot load LAN/Vite /uploads URLs).
 * Runs for every logo img, not only failed network loads.
 */
async function embedLocalUploadLogosInPage(page) {
    const rows = await page.evaluate((sel) => {
        return [...document.querySelectorAll(sel)].map((img, index) => ({
            index,
            src: img.getAttribute('src') || img.src || '',
        }));
    }, QUOTE_LOGO_IMG_SELECTOR);

    const uploadsRoot = path.join(__dirname, '..', 'uploads');
    const embeds = [];

    for (const row of rows) {
        if (/^data:/i.test(row.src)) continue;

        let rel = uploadsRelativePathFromImgSrc(row.src);
        if (!rel && row.src && !/^https?:/i.test(row.src)) {
            rel = String(row.src).replace(/\\/g, '/').replace(/^\/+/, '');
        }
        if (!rel) {
            pdfStepLog('logo skip (no path)', { src: String(row.src).slice(0, 120) });
            continue;
        }

        let diskPath = path.join(uploadsRoot, rel);
        if (!fs.existsSync(diskPath) && !rel.includes('/')) {
            diskPath = path.join(uploadsRoot, 'logos', rel);
        }
        if (!fs.existsSync(diskPath)) {
            console.warn('[quote-pdf] logo file missing on server:', diskPath, 'src:', row.src);
            continue;
        }

        let dataUrl;
        try {
            dataUrl = readLogoDataUrlCached(diskPath);
            if (!dataUrl) {
                console.warn('[quote-pdf] logo read failed:', diskPath);
                continue;
            }
        } catch (e) {
            console.warn('[quote-pdf] logo read failed:', diskPath, e && e.message);
            continue;
        }

        embeds.push({ index: row.index, dataUrl, rel, diskPath });
    }

    if (embeds.length) {
        await page.evaluate(
            (sel, items) => {
                const imgs = [...document.querySelectorAll(sel)];
                for (const item of items) {
                    const img = imgs[item.index];
                    if (img) {
                        img.src = item.dataUrl;
                        img.removeAttribute('srcset');
                    }
                }
            },
            QUOTE_LOGO_IMG_SELECTOR,
            embeds.map(({ index, dataUrl }) => ({ index, dataUrl }))
        );
        for (const e of embeds) {
            pdfStepLog('logo embedded', { rel: e.rel, diskPath: e.diskPath });
        }
    }
    return embeds.length;
}

/** Brief wait after logos are embedded as data URLs (no long network waits). */
async function waitForImagesLoaded(page) {
    const needsWait = await page.evaluate(() =>
        Array.from(document.images || []).some((img) => !img.complete)
    );
    if (!needsWait) return;

    const capMs = Math.min(quotePdfPageTimeoutMs(), 2500);
    await page.evaluate((maxMs) => {
        const imgs = Array.from(document.images || []);
        const perImgMs = 800;
        return Promise.race([
            Promise.all(
                imgs.map(
                    (img) =>
                        img.complete
                            ? Promise.resolve()
                            : new Promise((resolve) => {
                                  const done = () => resolve();
                                  img.addEventListener('load', done, { once: true });
                                  img.addEventListener('error', done, { once: true });
                                  setTimeout(done, perImgMs);
                              })
                )
            ),
            new Promise((resolve) => setTimeout(resolve, maxMs)),
        ]);
    }, capMs);
}

/**
 * Single Chromium round-trip: fonts + style clean + empty-sheet prune + A4 layout pin.
 * Replaces three serial page.evaluate calls.
 */
async function prepareLoadedHtmlForPdf(page) {
    return page.evaluate(async () => {
        if (document.fonts && document.fonts.ready) {
            await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 800))]);
        }

        const root = document.getElementById('quote-print-root');
        if (root) {
            root.querySelectorAll('[style]').forEach((el) => {
                if (!el.style) return;
                const fam = el.style.fontFamily || '';
                if (/inter|calibri|arial/i.test(fam)) {
                    el.style.removeProperty('font-family');
                }
                if (el.style.transform && el.style.transform !== 'none') {
                    el.style.removeProperty('transform');
                }
                if (el.style.filter && el.style.filter !== 'none') {
                    el.style.removeProperty('filter');
                }
                if (el.style.webkitFontSmoothing) {
                    el.style.removeProperty('-webkit-font-smoothing');
                }
            });
        }

        function quoteSheetHasBodyContent(sheetEl) {
            if (!sheetEl || !sheetEl.querySelector) return false;
            const sels = [
                '.quote-cover-first-page',
                '.header-section',
                '.quote-clause-block',
                '.quote-digital-signature-stamp',
                '.clause-content table',
                '.clause-content img',
            ];
            for (const sel of sels) {
                const nodes = sheetEl.querySelectorAll(sel);
                for (const node of nodes) {
                    if (node.matches && node.matches('img[src]') && node.getAttribute('src')) return true;
                    if (node.matches && node.matches('table')) return true;
                    if (node.matches && node.matches('.quote-digital-signature-stamp')) return true;
                    const text = (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim();
                    if (text.length > 0) return true;
                }
            }
            const content = sheetEl.querySelector('.quote-sheet-main-flex .content-section');
            if (content) {
                const prose = (content.innerText || '')
                    .replace(/\s+/g, ' ')
                    .replace(/Page\s+\d+\s+of\s+\d+/gi, '')
                    .trim();
                if (prose.length > 12) return true;
            }
            return false;
        }

        function renumberQuoteSheetPageIndicators(previewRoot) {
            const sheets = [...previewRoot.querySelectorAll('.quote-a4-sheet')];
            const total = sheets.length;
            sheets.forEach((sheet, i) => {
                const ind = sheet.querySelector('.quote-print-page-indicator');
                if (ind) ind.textContent = `Page ${i + 1} of ${total}`;
            });
        }

        let removed = 0;
        const preview = document.getElementById('quote-preview');
        if (preview) {
            preview.querySelectorAll('.quote-a4-sheet--word-flow-extra, [data-word-flow-extra]').forEach((el) => {
                el.remove();
                removed += 1;
            });
            preview.querySelectorAll('.quote-clause-word-flow-ribbon').forEach((el) => {
                el.remove();
                removed += 1;
            });

            let sheets = [...preview.querySelectorAll('.quote-a4-sheet')];
            while (sheets.length > 1) {
                const last = sheets[sheets.length - 1];
                if (!quoteSheetHasBodyContent(last)) {
                    last.remove();
                    removed += 1;
                    sheets = [...preview.querySelectorAll('.quote-a4-sheet')];
                } else {
                    break;
                }
            }

            sheets = [...preview.querySelectorAll('.quote-a4-sheet')];
            sheets.forEach((sheet, idx) => {
                if (idx === 0) return;
                if (!quoteSheetHasBodyContent(sheet)) {
                    sheet.remove();
                    removed += 1;
                }
            });

            if (removed > 0) renumberQuoteSheetPageIndicators(preview);

            const finalSheets = [...preview.querySelectorAll('.quote-a4-sheet')];
            const lastSheet = finalSheets[finalSheets.length - 1];
            if (lastSheet) {
                lastSheet.style.setProperty('page-break-after', 'avoid', 'important');
                lastSheet.style.setProperty('break-after', 'avoid', 'important');
            }
        }

        const pinSheetGrid = (sheetEl, isCover) => {
            const isLandscape =
                sheetEl.classList.contains('quote-a4-sheet--landscape') ||
                sheetEl.getAttribute('data-page-orientation') === 'landscape';
            if (isLandscape) sheetEl.classList.add('quote-a4-sheet--landscape');
            const sheetW = isLandscape ? '297mm' : '210mm';
            const sheetH = isLandscape ? '210mm' : '297mm';
            ['width', 'min-width', 'max-width', 'height', 'min-height', 'max-height', 'margin'].forEach((prop) =>
                sheetEl.style.removeProperty(prop)
            );
            sheetEl.style.setProperty('box-sizing', 'border-box', 'important');
            sheetEl.style.setProperty('width', sheetW, 'important');
            sheetEl.style.setProperty('min-width', sheetW, 'important');
            sheetEl.style.setProperty('max-width', sheetW, 'important');
            sheetEl.style.setProperty('padding', '15mm', 'important');
            sheetEl.style.setProperty('margin', '0', 'important');
            sheetEl.style.setProperty('height', sheetH, 'important');
            sheetEl.style.setProperty('min-height', sheetH, 'important');
            sheetEl.style.setProperty('max-height', sheetH, 'important');
            sheetEl.style.setProperty('display', 'grid', 'important');
            sheetEl.style.setProperty('grid-template-columns', 'minmax(0, 1fr)', 'important');
            sheetEl.style.setProperty('grid-template-rows', 'auto minmax(0, 1fr) auto', 'important');
            sheetEl.style.setProperty('align-content', 'stretch', 'important');
            sheetEl.style.setProperty('overflow', 'hidden', 'important');
            const logo = sheetEl.querySelector(':scope > .quote-sheet-logo-row');
            if (logo) {
                logo.style.setProperty('grid-row', '1', 'important');
                logo.style.setProperty('display', 'flex', 'important');
                logo.style.setProperty('flex-direction', 'row', 'important');
                logo.style.setProperty('justify-content', 'flex-end', 'important');
                logo.style.setProperty('align-items', 'flex-start', 'important');
                logo.style.setProperty('width', '100%', 'important');
                logo.style.setProperty('text-align', 'right', 'important');
                logo.querySelectorAll(':scope > div').forEach((wrap) => {
                    wrap.style.setProperty('width', '100%', 'important');
                    wrap.style.setProperty('text-align', 'right', 'important');
                    wrap.style.setProperty('display', 'block', 'important');
                });
            }
            const main = sheetEl.querySelector(':scope > .quote-sheet-main-flex');
            const content = sheetEl.querySelector('.quote-sheet-main-flex > .content-section');
            const spacer = sheetEl.querySelector('.quote-cover-page1-spacer');
            const header = sheetEl.querySelector('.header-section');
            if (main) {
                main.style.setProperty('grid-row', '2', 'important');
                main.style.setProperty('min-height', '0', 'important');
                main.style.setProperty('height', '100%', 'important');
                main.style.setProperty('display', 'flex', 'important');
                main.style.setProperty('flex-direction', 'column', 'important');
                main.style.setProperty('overflow', 'hidden', 'important');
            }
            if (content) {
                content.style.setProperty('flex', isCover ? '1 1 0' : '0 1 auto', 'important');
                content.style.setProperty('min-height', '0', 'important');
                if (isCover) {
                    content.style.setProperty('display', 'flex', 'important');
                    content.style.setProperty('flex-direction', 'column', 'important');
                }
            }
            if (header) header.style.setProperty('flex', '0 0 auto', 'important');
            if (isCover && spacer) {
                spacer.style.setProperty('flex', '1 1 0', 'important');
                spacer.style.setProperty('min-height', '0', 'important');
            }
            const footer = sheetEl.querySelector(':scope > .footer-section');
            if (footer) {
                footer.style.setProperty('grid-row', '3', 'important');
                footer.style.setProperty('align-self', 'end', 'important');
            }
            if (isLandscape) {
                sheetEl
                    .querySelectorAll(
                        '.quote-sheet-main-flex, .content-section, .header-section, .footer-section, .quote-clause-block, .clause-content'
                    )
                    .forEach((el) => {
                        el.style.setProperty('width', '100%', 'important');
                        el.style.setProperty('max-width', '100%', 'important');
                        el.style.setProperty('box-sizing', 'border-box', 'important');
                    });
            }
        };
        // Ensure @page rules are present as a stylesheet (not just sent HTML) so Chrome PDF engine picks them up.
        if (!document.getElementById('ems-page-rules')) {
            const st = document.createElement('style');
            st.id = 'ems-page-rules';
            st.textContent = `
                @page { size: A4 portrait; margin: 0; }
                @page quote-landscape { size: A4 landscape; margin: 0; }
                .quote-a4-sheet--landscape { page: quote-landscape; }
            `;
            document.head.appendChild(st);
        }

        document.querySelectorAll('#quote-print-root .quote-a4-sheet').forEach((sheetEl) => {
            const isCover = !sheetEl.classList.contains('quote-a4-sheet--continuation');
            pinSheetGrid(sheetEl, isCover);
        });
        const previewRoot = document.getElementById('quote-preview');
        const printRootEl = document.getElementById('quote-print-root');
        if (previewRoot) {
            ['width', 'min-width', 'max-width', 'margin', 'padding', 'min-height', 'height'].forEach((prop) =>
                previewRoot.style.removeProperty(prop)
            );
            previewRoot.style.setProperty('margin', '0', 'important');
            previewRoot.style.setProperty('padding', '0', 'important');
            previewRoot.style.setProperty('align-items', 'stretch', 'important');
            previewRoot.style.setProperty('min-width', '0', 'important');
            previewRoot.style.setProperty('width', 'auto', 'important');
            previewRoot.style.setProperty('max-width', 'none', 'important');
        }
        if (printRootEl) {
            printRootEl.style.setProperty('margin', '0', 'important');
            printRootEl.style.setProperty('min-width', '0', 'important');
            printRootEl.style.setProperty('width', 'auto', 'important');
            printRootEl.style.setProperty('max-width', 'none', 'important');
        }
        document.body.style.setProperty('display', 'block', 'important');
        document.body.style.setProperty('margin', '0', 'important');
        document.querySelectorAll('.quote-preview-zoom-viewport, .quote-preview-zoom-shell').forEach((el) => {
            el.style.setProperty('transform', 'none', 'important');
            el.style.setProperty('width', '100%', 'important');
            el.style.setProperty('flex', 'none', 'important');
            el.style.setProperty('height', 'auto', 'important');
            el.style.setProperty('overflow', 'visible', 'important');
        });
        document.querySelectorAll('.quote-a4-sheet').forEach((sheetEl) => {
            ['page-break-before', 'page-break-after', 'break-before', 'break-after'].forEach((prop) => {
                sheetEl.style.setProperty(prop, 'auto', 'important');
            });
            sheetEl.style.removeProperty('page-break-inside');
            sheetEl.style.removeProperty('break-inside');
        });
        const sheets = [...document.querySelectorAll('#quote-preview .quote-a4-sheet')];
        const lastSheet = sheets[sheets.length - 1];
        if (lastSheet) {
            lastSheet.style.setProperty('page-break-after', 'avoid', 'important');
            lastSheet.style.setProperty('break-after', 'avoid', 'important');
        }
        document.querySelectorAll('.quote-continuation-header').forEach((hdr) => {
            hdr.style.setProperty('display', 'flex', 'important');
            hdr.style.setProperty('flex-direction', 'row', 'important');
            hdr.style.setProperty('justify-content', 'flex-end', 'important');
            hdr.style.setProperty('align-items', 'flex-start', 'important');
            hdr.style.setProperty('width', '100%', 'important');
            hdr.style.setProperty('text-align', 'right', 'important');
        });

        /** Strip spell-check spans / broken attribute tails that leak into PDF text. */
        document.querySelectorAll('.ems-spell-mark, [data-spell-id]').forEach((span) => {
            const parent = span.parentNode;
            if (!parent) return;
            while (span.firstChild) parent.insertBefore(span.firstChild, span);
            parent.removeChild(span);
        });
        document.querySelectorAll('.clause-content, .jodit-wysiwyg').forEach((el) => {
            let s = el.innerHTML || '';
            if (!/ems-spell-mark|data-suggestions|background-repeat:repeat-x !important;background-position:0 100%/i.test(s)) {
                return;
            }
            s = s.replace(/<span\b[^>]*\bems-spell-mark\b[^>]*>([\s\S]*?)<\/span>/gi, '$1');
            s = s.replace(
                /!?important;background-repeat:repeat-x !important;background-position:0 100% !important;background-size:100% 2px !important;padding-bottom:1px !important;text-decoration:none !important;[\s\S]*?(?:&gt;|>)(?:[^<]{0,400}?\)\.?)?/gi,
                ''
            );
            el.innerHTML = s;
        });

        document.querySelectorAll('.quote-sheet-logo-row img, .quote-continuation-header img').forEach((img) => {
            img.style.setProperty('max-height', '68px', 'important');
            img.style.setProperty('height', 'auto', 'important');
            img.style.setProperty('width', 'auto', 'important');
            img.style.setProperty('max-width', '212px', 'important');
            img.style.setProperty('object-fit', 'contain', 'important');
            img.style.setProperty('display', 'inline-block', 'important');
            img.style.setProperty('margin-left', 'auto', 'important');
            img.style.setProperty('margin-right', '0', 'important');
            img.style.setProperty('float', 'none', 'important');
        });

        /** Pin Lucide strokes if client did not rasterize (Chromium PDF drops CSS stroke). */
        document
            .querySelectorAll(
                '.quote-header-quote-meta-ic-wrap svg, .quote-header-address-meta-ic-wrap svg'
            )
            .forEach((svg) => {
                svg.setAttribute('stroke', '#ffffff');
                svg.setAttribute('color', '#ffffff');
                svg.style.setProperty('stroke', '#ffffff', 'important');
                svg.style.setProperty('color', '#ffffff', 'important');
                svg.querySelectorAll('path, line, circle, polyline, polygon, rect').forEach((el) => {
                    const stroke = el.getAttribute('stroke');
                    if (!stroke || stroke === 'currentColor') el.setAttribute('stroke', '#ffffff');
                    el.style.setProperty('stroke', '#ffffff', 'important');
                });
            });

        return { removed };
    });
}

/**
 * Load quote HTML in Chromium.
 * @returns {{ tmpPath: string|null, navigationUrl: string, mode: 'file'|'setContent' }}
 */
async function loadHtmlInPage(page, html) {
    const baseURL = extractBaseHrefFromHtml(html);
    const timeoutMs = quotePdfPageTimeoutMs();
    const useFile = useFileHtmlLoad(html.length);

    if (useFile) {
        const tmpPath = path.join(
            getPdfTempDir(),
            `ems-quote-pdf-${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 10)}.html`
        );
        fs.writeFileSync(tmpPath, html, 'utf8');
        const navigationUrl = pathToFileURL(tmpPath).href;
        pdfStepLog('page.goto (file)', { navigationUrl, htmlChars: html.length, baseURL: baseURL || null });
        await page.goto(navigationUrl, {
            waitUntil: 'domcontentloaded',
            timeout: timeoutMs,
        });
        return { tmpPath, navigationUrl, mode: 'file' };
    }

    const navigationUrl = baseURL ? `${baseURL.replace(/\/$/, '')}/` : 'about:blank (setContent)';
    pdfStepLog('page.setContent', { navigationUrl, htmlChars: html.length, baseURL: baseURL || null });
    await page.setContent(html, {
        waitUntil: 'domcontentloaded',
        timeout: timeoutMs,
        ...(baseURL ? { baseURL } : {}),
    });
    return { tmpPath: null, navigationUrl, mode: 'setContent' };
}

/**
 * Portrait-only render — proven stable path (all sheets portrait).
 */
async function renderPortraitPdfBuffer(page) {
    const timeoutMs = quotePdfPageTimeoutMs();
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
    pdfStepLog('page.pdf start (portrait-only)', { timeoutMs });
    const buf = await Promise.race([
        page.pdf({ printBackground: true, format: 'A4', margin: { top: '0', right: '0', bottom: '0', left: '0' }, preferCSSPageSize: false }),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`page.pdf timed out after ${timeoutMs}ms`)), timeoutMs)),
    ]).catch(async (e1) => {
        console.warn('[quote-pdf] portrait retry:', e1 && e1.message);
        return page.pdf({ printBackground: true, format: 'A4', margin: { top: '0', right: '0', bottom: '0', left: '0' } });
    });
    pdfStepLog('page.pdf done (portrait-only)', { bytes: buf?.length || 0 });
    return buf;
}

function mmToPx(mmStr) {
    const n = parseFloat(String(mmStr || '').replace(/mm$/i, ''));
    return Math.max(1, Math.round((n / 25.4) * 96));
}

/** Match viewport to one sheet so page.pdf(width/height) captures from (0,0), not a centered 1200px canvas. */
async function setPdfViewportForSheet(page, sheetW, sheetH) {
    const w = mmToPx(sheetW);
    const h = mmToPx(sheetH);
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await page.evaluate((widthMm, heightMm) => {
        document.documentElement.style.setProperty('margin', '0', 'important');
        document.documentElement.style.setProperty('padding', '0', 'important');
        document.documentElement.style.setProperty('width', widthMm, 'important');
        document.documentElement.style.setProperty('min-width', '0', 'important');
        document.body.style.setProperty('margin', '0', 'important');
        document.body.style.setProperty('padding', '0', 'important');
        document.body.style.setProperty('display', 'block', 'important');
        document.body.style.setProperty('width', widthMm, 'important');
        document.body.style.setProperty('min-width', '0', 'important');
        const printRoot = document.getElementById('quote-print-root');
        const preview = document.getElementById('quote-preview');
        if (printRoot) {
            printRoot.style.setProperty('margin', '0', 'important');
            printRoot.style.setProperty('padding', '0', 'important');
            printRoot.style.setProperty('width', widthMm, 'important');
            printRoot.style.setProperty('min-width', '0', 'important');
            printRoot.style.setProperty('max-width', 'none', 'important');
        }
        if (preview) {
            preview.style.setProperty('margin', '0', 'important');
            preview.style.setProperty('padding', '0', 'important');
            preview.style.setProperty('width', widthMm, 'important');
            preview.style.setProperty('min-width', '0', 'important');
            preview.style.setProperty('max-width', 'none', 'important');
            preview.style.setProperty('align-items', 'stretch', 'important');
        }
    }, sheetW, sheetH);
}

/**
 * Show only one sheet for isolated vector PDF render; keep display:grid on the visible sheet.
 */
async function isolateQuoteSheetForPdfRender(page, idx, sheetW, sheetH) {
    await page.evaluate((sheetIndex, w, h) => {
        /**
         * Export CSS injects `@page { size: A4 portrait }`. Chromium still applies that default
         * even when page.pdf() passes explicit width/height with preferCSSPageSize:false, which
         * yields a portrait MediaBox while the sheet DOM is pinned to landscape width — content
         * appears letterboxed on page 2+. Strip all @page rules and inject one rule for this sheet.
         */
        document.querySelectorAll('style').forEach((st) => {
            if (st.id === 'ems-isolated-page-size') return;
            st.textContent = st.textContent.replace(/@page[^{]*\{[^}]*\}/g, '');
        });
        document.getElementById('ems-page-rules')?.remove();
        let pageSizeStyle = document.getElementById('ems-isolated-page-size');
        if (!pageSizeStyle) {
            pageSizeStyle = document.createElement('style');
            pageSizeStyle.id = 'ems-isolated-page-size';
            document.head.appendChild(pageSizeStyle);
        }
        pageSizeStyle.textContent = `@page { size: ${w} ${h}; margin: 0; }`;

        const preview = document.getElementById('quote-preview');
        const printRoot = document.getElementById('quote-print-root');
        if (preview) {
            ['width', 'min-width', 'max-width', 'margin', 'padding'].forEach((prop) =>
                preview.style.removeProperty(prop)
            );
            preview.style.setProperty('width', w, 'important');
            preview.style.setProperty('max-width', w, 'important');
            preview.style.setProperty('min-width', '0', 'important');
            preview.style.setProperty('margin', '0', 'important');
            preview.style.setProperty('padding', '0', 'important');
            preview.style.setProperty('align-items', 'stretch', 'important');
        }
        if (printRoot) {
            printRoot.style.setProperty('width', w, 'important');
            printRoot.style.setProperty('max-width', w, 'important');
            printRoot.style.setProperty('min-width', '0', 'important');
            printRoot.style.setProperty('margin', '0', 'important');
        }
        document.body.style.setProperty('display', 'block', 'important');
        document.body.style.setProperty('margin', '0', 'important');
        document.body.style.setProperty('width', w, 'important');
        [...document.querySelectorAll('#quote-preview .quote-a4-sheet')].forEach((s, j) => {
            if (j === sheetIndex) {
                if (
                    s.classList.contains('quote-a4-sheet--landscape') ||
                    s.getAttribute('data-page-orientation') === 'landscape'
                ) {
                    s.classList.add('quote-a4-sheet--landscape');
                }
                s.style.setProperty('display', 'grid', 'important');
                s.style.setProperty('width', w, 'important');
                s.style.setProperty('min-width', w, 'important');
                s.style.setProperty('max-width', w, 'important');
                s.style.setProperty('height', h, 'important');
                s.style.setProperty('min-height', h, 'important');
                s.style.setProperty('max-height', h, 'important');
                s.style.setProperty('margin', '0', 'important');
                /**
                 * For isolated Puppeteer renders we already force the target paper size via
                 * page.pdf({ width, height }). Keeping the named CSS page assignment
                 * (`page: quote-landscape`) can cause Chromium to emit an extra blank/offset
                 * page before the real sheet. Neutralize it here so the isolated render has
                 * exactly one page sized only by the explicit width/height above.
                 */
                s.style.setProperty('page', 'auto', 'important');
                ['page-break-before', 'page-break-after', 'break-before', 'break-after'].forEach((prop) => {
                    s.style.setProperty(prop, 'auto', 'important');
                });
                s.querySelectorAll(
                    '.quote-sheet-main-flex, .content-section, .header-section, .footer-section, .quote-clause-block, .clause-content'
                ).forEach((el) => {
                    el.style.setProperty('width', '100%', 'important');
                    el.style.setProperty('max-width', '100%', 'important');
                });
            } else {
                s.style.setProperty('display', 'none', 'important');
            }
        });
    }, idx, sheetW, sheetH);
}

async function restoreAllQuoteSheetsAfterPdfRender(page) {
    await page.evaluate(() => {
        document.querySelectorAll('#quote-preview .quote-a4-sheet').forEach((s) => {
            s.style.setProperty('display', 'grid', 'important');
            s.style.removeProperty('page');
        });
        const preview = document.getElementById('quote-preview');
        const printRoot = document.getElementById('quote-print-root');
        if (preview) {
            preview.style.removeProperty('width');
            preview.style.removeProperty('max-width');
            preview.style.removeProperty('min-width');
        }
        if (printRoot) {
            printRoot.style.removeProperty('width');
            printRoot.style.removeProperty('max-width');
        }
    });
}

/**
 * Mixed orientation: render each sheet in isolation at its own size.
 * Avoids copying pages from a wide-viewport full-doc render (portrait sheets were shifted right).
 */
async function renderMixedOrientationPdfBuffer(page, sheetInfos) {
    const timeoutMs = quotePdfPageTimeoutMs();
    pdfStepLog('mixed orientation render start', { sheetCount: sheetInfos.length });

    const mergedDoc = await PDFDocument.create();

    for (let i = 0; i < sheetInfos.length; i++) {
        const { isLandscape } = sheetInfos[i];
        const w = isLandscape ? '297mm' : '210mm';
        const h = isLandscape ? '210mm' : '297mm';

        await isolateQuoteSheetForPdfRender(page, i, w, h);
        await setPdfViewportForSheet(page, w, h);

        const pageBuf = await Promise.race([
            page.pdf({
                printBackground: true,
                width: w,
                height: h,
                margin: { top: '0', right: '0', bottom: '0', left: '0' },
                preferCSSPageSize: false,
            }),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`sheet ${i} timed out after ${timeoutMs}ms`)), timeoutMs)
            ),
        ]);

        const sheetDoc = await PDFDocument.load(pageBuf);
        const pageCount = sheetDoc.getPageCount();
        let pageIndex = 0;
        if (pageCount > 1) {
            const sizes = [];
            for (let p = 0; p < pageCount; p++) {
                const single = await PDFDocument.create();
                const [copied] = await single.copyPages(sheetDoc, [p]);
                single.addPage(copied);
                sizes.push((await single.save()).length);
            }
            pageIndex = sizes.indexOf(Math.max(...sizes));
        }
        const [sheetPage] = await mergedDoc.copyPages(sheetDoc, [pageIndex]);
        mergedDoc.addPage(sheetPage);
        const mergedSize = sheetPage.getSize();
        pdfStepLog(`sheet ${i} done (${isLandscape ? 'landscape' : 'portrait'} isolated)`, {
            w,
            h,
            srcPages: pageCount,
            usedPage: pageIndex,
            pdfW: Math.round(mergedSize.width),
            pdfH: Math.round(mergedSize.height),
        });
    }

    await restoreAllQuoteSheetsAfterPdfRender(page);

    const merged = Buffer.from(await mergedDoc.save());
    pdfStepLog('mixed orientation render done', { pages: sheetInfos.length, bytes: merged.length });
    return merged;
}

async function renderPdfBuffer(page, { hasLandscapeSheets = false } = {}) {
    if (!hasLandscapeSheets) return renderPortraitPdfBuffer(page);

    const sheetInfos = await page.evaluate(() =>
        [...document.querySelectorAll('#quote-preview .quote-a4-sheet')]
            .filter((s) => !s.classList.contains('quote-clause-measure-host') && !s.hasAttribute('data-pack-measure-shell'))
            .map((s) => ({
                isLandscape:
                    s.classList.contains('quote-a4-sheet--landscape') ||
                    s.getAttribute('data-page-orientation') === 'landscape',
            }))
    ).catch(() => []);

    if (!sheetInfos.length) return renderPortraitPdfBuffer(page);
    return renderMixedOrientationPdfBuffer(page, sheetInfos);
}

router.post('/generate', express.json({ limit: '50mb' }), async (req, res) => {
    const { html, filename, emulateScreen, delivery } = req.body || {};
    /** When true (default), @media print is ignored — layout matches Quote tab on-screen CSS (grid/flex A4 sheets). */
    const useScreenMedia = emulateScreen !== false;
    /**
     * delivery=link → generate PDF, store temp file, return JSON with short-lived GET URL.
     * Browser then downloads via GET (native streaming; works through IIS/ARR with responseBufferLimit=0).
     * Default remains binary PDF body (email / existing clients).
     */
    const wantDownloadLink =
        String(delivery || '').toLowerCase() === 'link' ||
        String(req.query.delivery || '').toLowerCase() === 'link';
    if (!html || typeof html !== 'string') {
        return res.status(400).json({ error: 'html_required' });
    }

    const perfT0 = Date.now();
    const perf = {
        htmlChars: String(html).length,
        databaseMs: 0,
        calculationsMs: 0,
        dataPrepMs: 0,
        browserLaunchMs: 0,
        pageLoadMs: 0,
        imagesMs: 0,
        layoutPrepMs: 0,
        renderMs: 0,
        restrictMs: 0,
        responseMs: 0,
        totalMs: 0,
    };

    const tPrep = Date.now();
    let htmlForPdf = rewriteHtmlAssetHostsForPuppeteer(html);
    htmlForPdf = injectPdfSharpTextHead(htmlForPdf);
    perf.dataPrepMs = msSince(tPrep);
    logStage('generate', 'Stage 1 Data prep (rewrite/inject)', perf.dataPrepMs, { htmlChars: perf.htmlChars });

    if (process.env.DEBUG_QUOTE_PDF_HTML === '1') {
        try {
            fs.writeFileSync(path.join(__dirname, '../debug_pdf_structure.html'), htmlForPdf, 'utf8');
        } catch (e) {
            console.error('Debug save failed', e);
        }
    }

    let puppeteer;
    try {
        puppeteer = require('puppeteer');
    } catch (e) {
        return res.status(501).json({
            error: 'puppeteer_unavailable',
            message: 'Install server dependency: cd server && npm install puppeteer',
        });
    }

    let browser;
    let tmpHtmlPath = null;
    let puppeteerUserDataDir = null;
    let page = null;
    try {
        /** Skip slow chrome --version spawn; PE check + puppeteer.launch are authoritative. */
        const resolvedChrome = resolvePuppeteerChromeExecutable(puppeteer, { skipSpawnProbe: true });
        const { executablePath: chromeExe, checked, reason, spawnProbe, trustedEnvPath, source } = resolvedChrome;
        if (!chromeExe) {
            console.error('[quote-pdf] Chrome executable not found.', {
                reason: reason || '(no reason)',
                envPath: process.env.PUPPETEER_EXECUTABLE_PATH || '(unset)',
                cwd: process.cwd(),
                checkedPaths: (checked || []).slice(0, 12),
            });
            return res.status(503).json({
                error: 'chrome_not_configured',
                message: reason || 'Chrome/Chromium is not installed on this API server.',
                hint:
                    'On Windows Server 2012 R2: set PUPPETEER_EXECUTABLE_PATH to Chrome 109 and run helpers\\fix_puppeteer_pdf_ws2012.bat. ' +
                    'Do not use npx puppeteer browsers install chrome (installs Chrome 146).',
                checkedPaths: checked.slice(0, 12),
            });
        }
        if (spawnProbe && !spawnProbe.ok && trustedEnvPath) {
            pdfStepLog('chrome.resolve trusted env path despite spawn probe failure', {
                executable: chromeExe,
                source,
                spawnProbe,
            });
        }

        puppeteerUserDataDir = path.join(
            getPdfTempDir(),
            `ems-puppeteer-pool-${process.pid}`
        );
        pdfStepLog('browser.launch/acquire start', { executable: chromeExe, userDataDir: puppeteerUserDataDir, source });
        const tBrowser = Date.now();
        const launchOpts = buildChromeLaunchOptions(chromeExe, puppeteerUserDataDir);
        let acquireAttempt = 0;
        for (;;) {
            try {
                ({ browser, page } = await newPooledPdfPage(puppeteer, launchOpts));
                break;
            } catch (launchErr) {
                const launchMsg = launchErr && launchErr.message ? String(launchErr.message) : String(launchErr);
                if (acquireAttempt >= 1 || !/Timed out after waiting \d+ms/i.test(launchMsg)) {
                    throw launchErr;
                }
                acquireAttempt += 1;
                /** Refcount-aware: closes now if idle, otherwise drains after sibling jobs finish. */
                await closePooledBrowser({ force: false }).catch(() => {});
                pdfStepLog('browser.launch retry after timeout', { attempt: acquireAttempt });
            }
        }
        perf.browserLaunchMs = msSince(tBrowser);
        pdfStepLog('browser.launch/acquire done', { ms: perf.browserLaunchMs });
        logStage('generate', 'Stage 2 Browser acquire', perf.browserLaunchMs, { pooled: true, executable: chromeExe });
        const pageTimeoutMs = quotePdfPageTimeoutMs();
        page.setDefaultTimeout(pageTimeoutMs);
        page.setDefaultNavigationTimeout(pageTimeoutMs);

        try {
            const browser = typeof page.browser === 'function' ? page.browser() : null;
            const ver = browser && typeof browser.version === 'function' ? await browser.version() : null;
            pdfStepLog('browser.version', {
                version: ver || undefined,
                executable: chromeExe,
                source,
                printBackground: true,
                emulateScreen: useScreenMedia,
            });
        } catch (verErr) {
            console.warn('[quote-pdf] browser.version probe failed:', verErr && verErr.message);
        }

        pdfStepLog('page.setup', { emulateScreen: useScreenMedia, viewport: '1200x1700' });
        await setupPdfRequestInterception(page);
        await Promise.all([
            page.emulateMediaType(useScreenMedia ? 'screen' : 'print'),
            // 1200px wide covers landscape A4 (≈1123px at 96dpi); height is just a viewport hint.
            page.setViewport({ width: 1200, height: 1700, deviceScaleFactor: 1 }),
        ]);

        const tLoad = Date.now();
        const loadResult = await loadHtmlInPage(page, htmlForPdf);
        tmpHtmlPath = loadResult.tmpPath;
        perf.pageLoadMs = msSince(tLoad);
        perf.pageLoadMode = loadResult.mode;
        perf.navigationUrl = loadResult.navigationUrl;
        logStage('generate', 'Stage 2 Page load', perf.pageLoadMs, {
            mode: loadResult.mode,
            url: loadResult.navigationUrl,
        });

        const tImg = Date.now();
        try {
            pdfStepLog('embedLocalUploadLogos start');
            const embedded = await embedLocalUploadLogosInPage(page);
            pdfStepLog('embedLocalUploadLogos done', { count: embedded });
            await waitForImagesLoaded(page);
        } catch (imgErr) {
            console.warn('[quote-pdf] image/logo load warning:', imgErr && imgErr.message);
        }
        perf.imagesMs = msSince(tImg);
        logStage('generate', 'Stage 2 Images/logos', perf.imagesMs);

        const tLayout = Date.now();
        try {
            pdfStepLog('prepareLoadedHtmlForPdf start');
            const prep = await prepareLoadedHtmlForPdf(page);
            if (prep && prep.removed > 0) {
                console.log(`[quote-pdf] Removed ${prep.removed} empty continuation sheet(s).`);
            }
            pdfStepLog('prepareLoadedHtmlForPdf done', { removed: prep?.removed || 0 });
        } catch (prepErr) {
            console.warn('[quote-pdf] layout prep warning:', prepErr && prepErr.message);
        }
        perf.layoutPrepMs = msSince(tLayout);
        logStage('generate', 'Stage 2 Layout prep', perf.layoutPrepMs);

        try {
            const pagStats = await logQuotePdfPaginationDiagnostics(page);
            if (pagStats && isPerfLogEnabled()) {
                perf.sheetCount = pagStats.sheetCount;
            }
        } catch (pagLogErr) {
            console.warn('[quote-pdf] pagination diagnostics warning:', pagLogErr && pagLogErr.message);
        }

        const tRender = Date.now();
        const hasLandscapeSheets = await page.evaluate(() =>
            document.querySelector('.quote-a4-sheet--landscape') !== null
        ).catch(() => false);
        pdfStepLog('landscape detection', { hasLandscapeSheets });
        let buf = Buffer.from(await renderPdfBuffer(page, { hasLandscapeSheets }));
        perf.renderMs = msSince(tRender);
        logStage('generate', 'Stage 2 PDF render', perf.renderMs);

        const tRestrict = Date.now();
        buf = await applyQuotePdfRestrictions(buf);
        perf.restrictMs = msSince(tRestrict);
        logStage('generate', 'Stage 2 Restrict', perf.restrictMs);

        const tResponse = Date.now();
        const safeName = String(filename || 'quote.pdf').replace(/[^\w.\-]+/g, '_');
        /** Pre-send totals (responseMs filled after send for console report). */
        perf.totalMs = msSince(perfT0);
        const perfHeader = headerJson(perf);
        const extraHeaders = {};
        if (isQuotePdfRestrictEnabled()) {
            extraHeaders['X-EMS-PDF-Restricted'] = '1';
        }
        if (perfHeader) {
            extraHeaders['X-EMS-PDF-Timing'] = perfHeader;
        }

        if (wantDownloadLink) {
            const stored = storePdfForTokenDownload(buf, safeName);
            perf.responseMs = msSince(tResponse);
            perf.totalMs = msSince(perfT0);
            logStage('generate', 'TOTAL', perf.totalMs, { ...perf, delivery: 'link' });
            printPerfReport(perf);
            return res.status(201).json({
                delivery: 'link',
                downloadPath: stored.downloadPath,
                fileName: stored.fileName,
                bytes: stored.bytes,
                expiresInMs: stored.expiresInMs,
                timing: perf,
            });
        }

        await streamPdfBufferToResponse(res, buf, safeName, extraHeaders);
        perf.responseMs = msSince(tResponse);
        perf.totalMs = msSince(perfT0);
        logStage('generate', 'TOTAL', perf.totalMs, perf);
        printPerfReport(perf);
        return;
    } catch (err) {
        const raw = err && err.message ? String(err.message) : String(err);
        if (
            /Timed out after waiting \d+ms/i.test(raw) ||
            /Target closed|Protocol error|Browser closed|Session closed|Connection closed/i.test(raw)
        ) {
            /** Do not kill sibling in-flight PDFs — drain close after this page releases. */
            markBrowserUnhealthy();
        }
        console.error('[quote-pdf] PDF generation error handler caught:', err);
        let msg = raw.trim() || 'pdf_generation_failed';
        let hint =
            'If logos fail to load, set QUOTE_PDF_ASSET_ORIGIN in server/.env (e.g. http://127.0.0.1:5002). ' +
            'Ensure Puppeteer can launch Chrome: cd server && npx puppeteer browsers install chrome (or set PUPPETEER_EXECUTABLE_PATH).';
        if (/Could not find Chrome|browser.*executable|Executable doesn't exist|Browser closed|spawn .* ENOENT/i.test(raw)) {
            hint =
                'Chrome for Puppeteer is missing or blocked. From the server folder run: npx puppeteer browsers install chrome. ' +
                'On locked-down PCs set PUPPETEER_EXECUTABLE_PATH to a Chrome/Chromium exe.';
        }
        if (/spawn EFTYPE|EFTYPE|exec format error/i.test(raw)) {
            hint =
                'The Chrome path on this server is invalid (wrong file or copied from another machine). ' +
                'On the API server run: cd server && npx puppeteer browsers install chrome. ' +
                'Or set PUPPETEER_EXECUTABLE_PATH in server/.env to a real chrome.exe on this server.';
        }
        if (/Timed out after waiting \d+ms/i.test(raw)) {
            hint =
                'Chrome did not start or load the quote in time (common on IIS/PM2). Run GET /api/quote-pdf/health?launch=1. ' +
                'Set PUPPETEER_EXECUTABLE_PATH, QUOTE_PDF_ASSET_ORIGIN=http://127.0.0.1:5002, grant the PM2 user write access to %TEMP%, ' +
                'or use Print → Save as PDF from the quote tab. To disable --single-process set QUOTE_PDF_SINGLE_PROCESS=0 and restart PM2.';
        }
        console.error('[quote-pdf]', err && err.stack ? err.stack : err);
        if (!res.headersSent) {
            return res.status(500).json({
                error: 'pdf_generation_failed',
                message: msg,
                hint,
            });
        }
        return;
    } finally {
        if (page) {
            await page.close().catch(() => {});
        }
        releasePooledBrowser();
        if (tmpHtmlPath) {
            try {
                fs.unlinkSync(tmpHtmlPath);
            } catch {
                /* ignore */
            }
        }
        /** Profile dir is owned by the browser pool — deleted only in closePooledBrowser(). */
    }
});

/**
 * Browser-native PDF download (streams from disk). Used after POST /generate with delivery=link.
 * Prefer this in production HTTP (non-secure-context) so the browser download manager streams to disk
 * instead of holding the full PDF in a JS Blob after IIS ARR buffering.
 */
router.get('/file/:token', async (req, res) => {
    try {
        await streamTokenPdfToResponse(req.params.token, res);
    } catch (err) {
        console.error('[quote-pdf] token download failed:', err && err.message ? err.message : err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'download_failed', message: err.message || 'Download failed' });
        }
    }
});

/**
 * Warm Puppeteer browser after server listen so the first Download is not a cold Chrome launch.
 * Fire-and-forget; never blocks startup.
 */
async function warmQuotePdfBrowserPool() {
    if (String(process.env.EMS_QUOTE_PDF_SERVER_ENABLED || '').trim() !== '1') {
        return { skipped: true, reason: 'server_pdf_disabled' };
    }
    if (String(process.env.QUOTE_PDF_WARM_ON_START || '1').trim() === '0') {
        return { skipped: true, reason: 'warm_disabled' };
    }
    let puppeteer;
    try {
        puppeteer = require('puppeteer');
    } catch {
        return { skipped: true, reason: 'puppeteer_unavailable' };
    }
    const resolved = resolvePuppeteerChromeExecutable(puppeteer, { skipSpawnProbe: true });
    if (!resolved.executablePath) {
        return { skipped: true, reason: resolved.reason || 'chrome_missing' };
    }
    const userDataDir = path.join(getPdfTempDir(), `ems-puppeteer-pool-${process.pid}`);
    const t0 = Date.now();
    let page = null;
    try {
        const launchOpts = buildChromeLaunchOptions(resolved.executablePath, userDataDir);
        ({ page } = await newPooledPdfPage(puppeteer, launchOpts));
        await page.goto('about:blank', { waitUntil: 'domcontentloaded', timeout: 15000 });
        console.log(`[quote-pdf] browser pool warmed in ${Date.now() - t0}ms (${resolved.source || 'chrome'})`);
        return { ok: true, ms: Date.now() - t0, executable: resolved.executablePath };
    } catch (err) {
        console.warn('[quote-pdf] browser warm failed:', err && err.message ? err.message : err);
        /** Only tear down if nothing else is using the pool (refcount-aware). */
        await closePooledBrowser({ force: false }).catch(() => {});
        return { ok: false, error: err && err.message ? err.message : String(err) };
    } finally {
        if (page) await page.close().catch(() => {});
        releasePooledBrowser();
    }
}

module.exports = router;
module.exports.warmQuotePdfBrowserPool = warmQuotePdfBrowserPool;
module.exports.buildChromeLaunchOptions = buildChromeLaunchOptions;
