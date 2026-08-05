/**
 * Reuse one Puppeteer browser between quote PDF requests (avoids ~2–8s launch per download).
 *
 * Concurrency model:
 * - One shared browser, many pages (one page per request).
 * - activeJobs refcount prevents idle/error close from killing in-flight PDFs.
 * - Optional queue limits simultaneous pages (QUOTE_PDF_MAX_CONCURRENT, default 3).
 */
const path = require('path');
const fs = require('fs');

let browserInstance = null;
let browserLaunchPromise = null;
let idleCloseTimer = null;
/** Profile dir passed to puppeteer.launch — only delete after browser.close(). */
let poolUserDataDir = null;
/** In-flight PDF pages (includes warm). Idle/error must not close while > 0. */
let activeJobs = 0;
/** After a protocol/timeout failure, close the shared browser once the last job finishes. */
let closeAfterDrain = false;
/** Waiters for the concurrency semaphore. */
const slotWaiters = [];

function idleCloseMs() {
    const n = Number(process.env.QUOTE_PDF_BROWSER_IDLE_MS);
    /** Keep warm longer by default so consecutive downloads skip Chrome relaunch. */
    return Number.isFinite(n) && n > 0 ? n : 600000;
}

function maxConcurrentPages() {
    const n = Number(process.env.QUOTE_PDF_MAX_CONCURRENT);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 3;
}

function scheduleIdleClose() {
    if (idleCloseTimer) clearTimeout(idleCloseTimer);
    idleCloseTimer = setTimeout(() => {
        idleCloseTimer = null;
        if (activeJobs > 0) {
            /** Still rendering — check again later instead of killing pages. */
            scheduleIdleClose();
            return;
        }
        closePooledBrowser({ force: false }).catch(() => {});
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

function acquireJobSlot() {
    return new Promise((resolve) => {
        if (activeJobs < maxConcurrentPages()) {
            activeJobs += 1;
            resolve();
            return;
        }
        slotWaiters.push(resolve);
    });
}

function releaseJobSlot() {
    const next = slotWaiters.shift();
    if (next) {
        /** Transfer the slot to the next waiter (activeJobs unchanged). */
        next();
        return;
    }
    activeJobs = Math.max(0, activeJobs - 1);
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
    browserLaunchPromise = puppeteer
        .launch(launchOptions)
        .then((browser) => {
            browserInstance = browser;
            browser.on('disconnected', () => {
                browserInstance = null;
                browserLaunchPromise = null;
                removePoolUserDataDir();
            });
            return browser;
        })
        .catch((err) => {
            browserInstance = null;
            browserLaunchPromise = null;
            removePoolUserDataDir();
            throw err;
        });
    const browser = await browserLaunchPromise;
    scheduleIdleClose();
    return browser;
}

/**
 * @param {{ force?: boolean }} [opts] force=true closes even with active jobs (last resort / process shutdown).
 * @returns {Promise<boolean>} true if the browser was closed
 */
async function closePooledBrowser(opts = {}) {
    const force = !!opts.force;
    if (!force && activeJobs > 0) {
        closeAfterDrain = true;
        console.warn(`[quote-pdf] defer pool close; activeJobs=${activeJobs}`);
        return false;
    }
    if (idleCloseTimer) {
        clearTimeout(idleCloseTimer);
        idleCloseTimer = null;
    }
    closeAfterDrain = false;
    const b = browserInstance;
    browserInstance = null;
    browserLaunchPromise = null;
    await killBrowserProcess(b);
    removePoolUserDataDir();
    return true;
}

function markBrowserUnhealthy() {
    /** Close after in-flight pages finish so one failure does not kill sibling PDFs mid-render. */
    closeAfterDrain = true;
    if (activeJobs <= 0) {
        closePooledBrowser({ force: true }).catch(() => {});
    }
}

async function newPage(puppeteer, launchOptions) {
    await acquireJobSlot();
    try {
        const browser = await acquireBrowser(puppeteer, launchOptions);
        const page = await browser.newPage();
        return { browser, page, pooled: true };
    } catch (err) {
        releaseJobSlot();
        throw err;
    }
}

function releaseAfterJob() {
    releaseJobSlot();
    if (closeAfterDrain && activeJobs === 0 && slotWaiters.length === 0) {
        closePooledBrowser({ force: true }).catch(() => {});
        return;
    }
    scheduleIdleClose();
}

function getPoolStats() {
    return {
        activeJobs,
        waiting: slotWaiters.length,
        maxConcurrent: maxConcurrentPages(),
        browserConnected: !!(browserInstance && browserInstance.isConnected()),
        closeAfterDrain,
    };
}

module.exports = {
    acquireBrowser,
    closePooledBrowser,
    markBrowserUnhealthy,
    newPage,
    releaseAfterJob,
    getPoolStats,
};
