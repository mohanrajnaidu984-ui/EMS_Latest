/**
 * Resolve a Chromium/Chrome executable for Puppeteer on Windows Server / IIS.
 * EFTYPE on spawn = path exists but file is not a valid PE executable (copied cache, wrong arch, corrupt).
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

/** Puppeteer win64 chrome.exe is typically 1–5 MB; tiny files are stubs/corrupt. */
const MIN_CHROME_EXE_BYTES = 500_000;

/** Reuse last good path in-process (health + /generate share the same PM2 worker). */
let cachedResolution = null;
/** Brief negative cache so a hung --version probe is not repeated on every PDF click. */
let negativeCacheUntil = 0;
let negativeCacheResult = null;

function normalizeExecutablePath(value) {
    let p = String(value || '').trim();
    if (!p) return '';
    if (
        (p.startsWith('"') && p.endsWith('"')) ||
        (p.startsWith("'") && p.endsWith("'"))
    ) {
        p = p.slice(1, -1).trim();
    }
    if (!path.isAbsolute(p)) {
        p = path.resolve(process.cwd(), p);
    }
    return path.normalize(p);
}

function hasWindowsPeHeader(filePath) {
    try {
        const fd = fs.openSync(filePath, 'r');
        const buf = Buffer.alloc(2);
        fs.readSync(fd, buf, 0, 2, 0);
        fs.closeSync(fd);
        return buf[0] === 0x4d && buf[1] === 0x5a;
    } catch {
        return false;
    }
}

function isUsableWindowsExe(filePath) {
    if (process.platform !== 'win32') {
        return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
    }
    if (!/\.exe$/i.test(filePath)) return false;
    if (!fs.existsSync(filePath)) return false;
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size < MIN_CHROME_EXE_BYTES) return false;
    return hasWindowsPeHeader(filePath);
}

function spawnProbeTimeoutMs() {
    const n = Number(process.env.PUPPETEER_SPAWN_PROBE_TIMEOUT_MS);
    /** Default 3s — bundled Chrome --version can take 10s+ and previously blocked PDF for 20s. */
    return Number.isFinite(n) && n > 0 ? n : 3000;
}

/**
 * Quick spawn test — catches EFTYPE before Puppeteer launch.
 * Chrome 109 on Server 2012 R2 may need --no-sandbox for child_process spawn.
 * @returns {{ ok: boolean, output?: string, error?: string, code?: string, status?: number }}
 */
function probeChromeExecutableSync(filePath) {
    if (process.platform !== 'win32') {
        return { ok: true };
    }
    const args = ['--no-sandbox', '--disable-gpu', '--version'];
    try {
        const r = spawnSync(filePath, args, {
            timeout: spawnProbeTimeoutMs(),
            windowsHide: true,
            encoding: 'utf8',
        });
        if (r.error) {
            return {
                ok: false,
                error: r.error.message || String(r.error),
                code: r.error.code,
            };
        }
        const out = `${r.stdout || ''}${r.stderr || ''}`.trim();
        const ok = r.status === 0 || /chrome|chromium|microsoft edge/i.test(out);
        return { ok, output: out.slice(0, 160), status: r.status };
    } catch (e) {
        return { ok: false, error: e.message || String(e), code: e.code };
    }
}

function pushCandidate(list, seen, value, meta = {}) {
    const p = normalizeExecutablePath(value);
    if (!p || seen.has(p.toLowerCase())) return;
    seen.add(p.toLowerCase());
    list.push({ path: p, ...meta });
}

/** Installed browser paths — usually start much faster than Puppeteer's downloaded Chrome. */
function findSystemChromeCandidates(candidates, seen) {
    if (process.platform === 'win32') {
        const roots = [
            process.env.PROGRAMFILES,
            process.env['PROGRAMFILES(X86)'],
            process.env.LOCALAPPDATA,
        ].filter(Boolean);
        for (const root of roots) {
            pushCandidate(
                candidates,
                seen,
                path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'),
                { source: 'system-chrome' }
            );
            /**
             * Edge often fails Puppeteer launch on Windows Server (Code 1002) while still
             * passing PE/size checks — that forces html2pdf fallback and lost overlays.
             * Opt in with PUPPETEER_ALLOW_EDGE=1 only when Edge is known to work.
             */
            const allowEdge = /^(1|true|yes)$/i.test(String(process.env.PUPPETEER_ALLOW_EDGE || '').trim());
            if (allowEdge) {
                pushCandidate(
                    candidates,
                    seen,
                    path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
                    { source: 'system-edge' }
                );
            }
        }
        return;
    }
    for (const p of [
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/snap/bin/chromium',
    ]) {
        pushCandidate(candidates, seen, p, { source: 'system-chrome' });
    }
}

/** Walk a cache tree and return the newest usable chrome.exe. */
function findChromeExeUnderCacheDir(cacheRoot, checked, maxDepth = 8) {
    if (!cacheRoot || !fs.existsSync(cacheRoot)) return null;

    const stack = [{ dir: cacheRoot, depth: 0 }];
    let newest = null;
    let newestMtime = 0;

    while (stack.length) {
        const { dir, depth } = stack.pop();
        if (depth > maxDepth) continue;
        let ents;
        try {
            ents = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const ent of ents) {
            const full = path.join(dir, ent.name);
            if (ent.isDirectory()) {
                stack.push({ dir: full, depth: depth + 1 });
                continue;
            }
            if (!ent.isFile() || !/^chrome\.exe$/i.test(ent.name)) continue;
            if (checked && !checked.includes(full)) checked.push(full);
            if (!isUsableWindowsExe(full)) continue;
            let mtime = 0;
            try {
                mtime = fs.statSync(full).mtimeMs;
            } catch {
                /* ignore */
            }
            if (!newest || mtime >= newestMtime) {
                newest = full;
                newestMtime = mtime;
            }
        }
    }

    return newest ? normalizeExecutablePath(newest) : null;
}

/** EMS + Puppeteer cache locations (includes chromium-chrome109 for Server 2012 R2). */
function findChromeInProjectCaches(searchRoot, checked) {
    const cacheBase = path.join(searchRoot, '.cache');
    if (!fs.existsSync(cacheBase)) return null;

    const cacheDirs = [];
    try {
        for (const ent of fs.readdirSync(cacheBase, { withFileTypes: true })) {
            if (!ent.isDirectory()) continue;
            if (/^(puppeteer|chromium-chrome\d+|chromium)$/i.test(ent.name)) {
                cacheDirs.push(path.join(cacheBase, ent.name));
            }
        }
    } catch {
        return null;
    }

    let newest = null;
    let newestMtime = 0;
    for (const dir of cacheDirs) {
        const hit = findChromeExeUnderCacheDir(dir, checked);
        if (!hit) continue;
        let mtime = 0;
        try {
            mtime = fs.statSync(hit).mtimeMs;
        } catch {
            /* ignore */
        }
        if (!newest || mtime >= newestMtime) {
            newest = hit;
            newestMtime = mtime;
        }
    }
    return newest;
}

function buildCandidateList(puppeteer) {
    const seen = new Set();
    const candidates = [];
    const cwd = process.cwd();

    const envPath = normalizeExecutablePath(process.env.PUPPETEER_EXECUTABLE_PATH);
    if (envPath) {
        pushCandidate(candidates, seen, envPath, { source: 'env', trustedEnv: true });
    }

    /** Prefer system Chrome/Edge before Puppeteer cache — spawn --version is ~1s vs ~10s locally. */
    findSystemChromeCandidates(candidates, seen);

    try {
        if (puppeteer && typeof puppeteer.executablePath === 'function') {
            pushCandidate(candidates, seen, puppeteer.executablePath(), { source: 'puppeteer' });
        }
    } catch {
        /* ignore */
    }

    const checked = [];
    const cacheChrome = findChromeInProjectCaches(cwd, checked);
    if (cacheChrome) {
        pushCandidate(candidates, seen, cacheChrome, { source: 'cache' });
    }

    return { candidates, checked };
}

function finalizeResolution(resolved, checked, extra = {}) {
    const out = {
        executablePath: resolved,
        checked: [...checked],
        ...extra,
    };
    if (resolved) {
        cachedResolution = out;
        negativeCacheUntil = 0;
        negativeCacheResult = null;
    }
    return out;
}

function finalizeNegative(checked, reason) {
    const out = { executablePath: null, checked, reason };
    negativeCacheResult = out;
    negativeCacheUntil = Date.now() + 30_000;
    return out;
}

/**
 * @param {import('puppeteer')} puppeteer
 * @param {{ skipSpawnProbe?: boolean, bypassCache?: boolean }} [opts]
 * @returns {{ executablePath: string|null, checked: string[], spawnProbe?: object, reason?: string, trustedEnvPath?: boolean, source?: string }}
 */
function resolvePuppeteerChromeExecutable(puppeteer, opts = {}) {
    if (!opts.bypassCache && cachedResolution?.executablePath) {
        const cachedPath = cachedResolution.executablePath;
        if (fs.existsSync(cachedPath) && isUsableWindowsExe(cachedPath)) {
            return { ...cachedResolution, checked: [...(cachedResolution.checked || [])] };
        }
        cachedResolution = null;
    }

    if (!opts.bypassCache && Date.now() < negativeCacheUntil && negativeCacheResult) {
        return {
            ...negativeCacheResult,
            checked: [...(negativeCacheResult.checked || [])],
            fromNegativeCache: true,
        };
    }

    const skipSpawnProbe = !!opts.skipSpawnProbe;
    const { candidates, checked } = buildCandidateList(puppeteer);
    let lastSpawnError = '';
    let lastInvalidReason = '';
    let peValidFallback = null;

    for (const candidate of candidates) {
        const resolved = candidate.path;
        if (!checked.includes(resolved)) {
            checked.push(resolved);
        }

        if (process.platform === 'win32') {
            if (!isUsableWindowsExe(resolved)) {
                lastInvalidReason = `invalid PE or too small (${resolved})`;
                continue;
            }
        } else if (!fs.existsSync(resolved)) {
            continue;
        }

        let spawnProbe = skipSpawnProbe ? { ok: true, skipped: true } : probeChromeExecutableSync(resolved);

        if (spawnProbe.ok) {
            return finalizeResolution(resolved, checked, {
                spawnProbe,
                source: candidate.source,
                trustedEnvPath: !!candidate.trustedEnv,
            });
        }

        lastSpawnError = spawnProbe.error || spawnProbe.code || spawnProbe.output || 'spawn probe failed';

        /**
         * Root cause fix: explicit PUPPETEER_EXECUTABLE_PATH is operator-configured (Chrome 109 on 2012 R2).
         * spawnSync --version can fail under PM2/session 0 while puppeteer.launch still works.
         * Do not reject the only valid candidate when PE validation passes.
         */
        if (candidate.trustedEnv) {
            return finalizeResolution(resolved, checked, {
                spawnProbe,
                source: 'env',
                trustedEnvPath: true,
                spawnProbeWarning:
                    'PUPPETEER_EXECUTABLE_PATH passed PE validation but spawn --version probe failed; using env path because Puppeteer launch is authoritative.',
            });
        }

        /**
         * System / cache Chrome: PE-valid but --version hung/timed out (AV, Session 0).
         * Prefer first PE-valid candidate over returning null (which previously blocked PDF for 20s+).
         */
        if (!peValidFallback) {
            peValidFallback = {
                resolved,
                spawnProbe,
                source: candidate.source,
            };
        }
    }

    if (peValidFallback) {
        return finalizeResolution(peValidFallback.resolved, checked, {
            spawnProbe: peValidFallback.spawnProbe,
            source: peValidFallback.source,
            trustedEnvPath: false,
            spawnProbeWarning:
                'Chrome PE validation passed but spawn --version probe failed; using path because Puppeteer launch is authoritative.',
        });
    }

    const reason =
        process.platform === 'win32'
            ? lastSpawnError || lastInvalidReason
                ? `No spawnable chrome.exe (last error: ${lastSpawnError || lastInvalidReason}). ` +
                  'Set PUPPETEER_EXECUTABLE_PATH to Chrome 109 on Server 2012 R2, or run helpers\\fix_puppeteer_pdf_ws2012.bat.'
                : 'No valid chrome.exe found. Set PUPPETEER_EXECUTABLE_PATH or install Chrome 109 via helpers\\fix_puppeteer_pdf_ws2012.bat.'
            : 'Chrome/Chromium executable not found for Puppeteer.';

    return finalizeNegative(checked, reason);
}

module.exports = {
    resolvePuppeteerChromeExecutable,
    isUsableWindowsExe,
    probeChromeExecutableSync,
    hasWindowsPeHeader,
    normalizeExecutablePath,
};
