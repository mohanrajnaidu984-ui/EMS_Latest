/**
 * Reuse one Puppeteer browser between quote PDF requests (avoids ~2–8s launch per download).
 */
const path = require('path');
const fs = require('fs');

let browserInstance = null;
let browserLaunchPromise = null;
let idleCloseTimer = null;
/** Profile dir passed to puppeteer.launch — only delete after browser.close(). */
let poolUserDataDir = null;

function idleCloseMs() {
    const n = Number(process.env.QUOTE_PDF_BROWSER_IDLE_MS);
    return Number.isFinite(n) && n > 0 ? n : 120000;
}

function scheduleIdleClose() {
    if (idleCloseTimer) clearTimeout(idleCloseTimer);
    idleCloseTimer = setTimeout(() => {
        idleCloseTimer = null;
        closePooledBrowser().catch(() => {});
    }, idleCloseMs());
}

function removePoolUserDataDir() {
    const dir = poolUserDataDir;
    poolUserDataDir = null;
    if (!dir) return;
    try {
        fs.rmSync(dir, { recursive: true, force: true });
    } catch {
        /* ignore — Chrome may still be releasing file locks on Windows */
    }
}

async function killBrowserProcess(browser) {
    if (!browser) return;
    try {
        const proc = typeof browser.process === 'function' ? browser.process() : null;
        await browser.close().catch(() => {});
        if (proc && !proc.killed) {
            try {
                proc.kill('SIGKILL');
            } catch {
                /* ignore */
            }
        }
    } catch {
        /* ignore */
    }
}

/**
 * @param {import('puppeteer')} puppeteer
 * @param {object} launchOptions from buildChromeLaunchOptions
 */
async function acquireBrowser(puppeteer, launchOptions) {
    if (browserInstance && browserInstance.isConnected()) {
        scheduleIdleClose();
        return browserInstance;
    }
    if (browserLaunchPromise) {
        const b = await browserLaunchPromise;
        if (b && b.isConnected()) {
            browserInstance = b;
            scheduleIdleClose();
            return b;
        }
    }
    poolUserDataDir = launchOptions?.userDataDir || null;
    browserLaunchPromise = puppeteer.launch(launchOptions).then((browser) => {
        browserInstance = browser;
        browser.on('disconnected', () => {
            browserInstance = null;
            browserLaunchPromise = null;
            removePoolUserDataDir();
        });
        return browser;
    });
    const browser = await browserLaunchPromise;
    scheduleIdleClose();
    return browser;
}

async function closePooledBrowser() {
    if (idleCloseTimer) {
        clearTimeout(idleCloseTimer);
        idleCloseTimer = null;
    }
    const b = browserInstance;
    browserInstance = null;
    browserLaunchPromise = null;
    await killBrowserProcess(b);
    removePoolUserDataDir();
}

async function newPage(puppeteer, launchOptions) {
    const browser = await acquireBrowser(puppeteer, launchOptions);
    const page = await browser.newPage();
    return { browser, page, pooled: true };
}

function releaseAfterJob() {
    scheduleIdleClose();
}

module.exports = {
    acquireBrowser,
    closePooledBrowser,
    newPage,
    releaseAfterJob,
};
