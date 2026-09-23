'use strict';

const os = require('os');
const { execFile } = require('child_process');

/** Rolling samples for CPU / network */
let lastCpuSample = null;
let cachedSnapshot = null;
let cachedAt = 0;
const CACHE_MS = 2000;

let lastNetSample = null; // { at, rx, tx }
let cachedNet = { rxMbps: null, txMbps: null, utilizationPct: null, adapter: null, error: null };

function cpuTimesAggregate() {
    const cpus = os.cpus() || [];
    let idle = 0;
    let total = 0;
    for (const cpu of cpus) {
        const t = cpu.times || {};
        const i = Number(t.idle) || 0;
        const sum = Object.values(t).reduce((a, b) => a + (Number(b) || 0), 0);
        idle += i;
        total += sum;
    }
    return { idle, total, cores: cpus.length };
}

function sampleCpuPercent() {
    const now = cpuTimesAggregate();
    if (!lastCpuSample || !now.total) {
        lastCpuSample = now;
        return null; // need a second sample
    }
    const idleDelta = now.idle - lastCpuSample.idle;
    const totalDelta = now.total - lastCpuSample.total;
    lastCpuSample = now;
    if (totalDelta <= 0) return 0;
    const busy = 1 - idleDelta / totalDelta;
    return Math.round(Math.min(100, Math.max(0, busy * 100)) * 10) / 10;
}

function ramSnapshot() {
    const total = os.totalmem();
    const free = os.freemem();
    const used = Math.max(0, total - free);
    const pct = total > 0 ? Math.round((used / total) * 1000) / 10 : 0;
    return {
        totalBytes: total,
        freeBytes: free,
        usedBytes: used,
        usedPercent: pct,
        totalGb: Math.round((total / 1024 / 1024 / 1024) * 100) / 100,
        usedGb: Math.round((used / 1024 / 1024 / 1024) * 100) / 100,
        freeGb: Math.round((free / 1024 / 1024 / 1024) * 100) / 100,
    };
}

function processMemorySnapshot() {
    const m = process.memoryUsage();
    return {
        rssBytes: m.rss,
        heapUsedBytes: m.heapUsed,
        heapTotalBytes: m.heapTotal,
        rssMb: Math.round((m.rss / 1024 / 1024) * 10) / 10,
        heapUsedMb: Math.round((m.heapUsed / 1024 / 1024) * 10) / 10,
    };
}

function runPs(command, timeoutMs = 4000) {
    return new Promise((resolve) => {
        if (process.platform !== 'win32') {
            resolve({ ok: false, error: 'Network counters available on Windows web server only' });
            return;
        }
        execFile(
            'powershell.exe',
            ['-NoProfile', '-NonInteractive', '-Command', command],
            { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 },
            (err, stdout) => {
                if (err) {
                    resolve({ ok: false, error: err.message || 'powershell failed' });
                    return;
                }
                resolve({ ok: true, stdout: String(stdout || '') });
            }
        );
    });
}

/**
 * Sample primary NIC bytes + link speed → approx utilization %.
 * Uses Windows Get-NetAdapterStatistics (best-effort; cached).
 */
async function sampleNetwork() {
    const ps = `
$ErrorActionPreference = 'SilentlyContinue'
$adapters = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and $_.Virtual -ne $true } |
  Sort-Object -Property LinkSpeed -Descending
$a = $adapters | Select-Object -First 1
if (-not $a) { Write-Output 'NONE'; exit 0 }
$s = Get-NetAdapterStatistics -Name $a.Name
$link = 0
if ($a.LinkSpeed -match '([0-9.]+)\\s*Gbps') { $link = [double]$Matches[1] * 1e9 }
elseif ($a.LinkSpeed -match '([0-9.]+)\\s*Mbps') { $link = [double]$Matches[1] * 1e6 }
Write-Output (($a.Name) + '|' + $s.ReceivedBytes + '|' + $s.SentBytes + '|' + $link)
`.trim();

    const result = await runPs(ps);
    if (!result.ok) {
        cachedNet = { ...cachedNet, error: result.error };
        return cachedNet;
    }
    const line = String(result.stdout || '')
        .trim()
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .pop();
    if (!line || line === 'NONE') {
        cachedNet = { rxMbps: null, txMbps: null, utilizationPct: null, adapter: null, error: 'No active adapter' };
        return cachedNet;
    }
    const [name, rxStr, txStr, linkStr] = line.split('|');
    const rx = Number(rxStr) || 0;
    const tx = Number(txStr) || 0;
    const linkBps = Number(linkStr) || 0;
    const at = Date.now();

    if (lastNetSample && at > lastNetSample.at) {
        const dt = (at - lastNetSample.at) / 1000;
        if (dt > 0.2) {
            const rxBps = Math.max(0, (rx - lastNetSample.rx) / dt);
            const txBps = Math.max(0, (tx - lastNetSample.tx) / dt);
            const totalBps = rxBps + txBps;
            const rxMbps = Math.round((rxBps * 8) / 1e6 * 100) / 100;
            const txMbps = Math.round((txBps * 8) / 1e6 * 100) / 100;
            let utilizationPct = null;
            if (linkBps > 0) {
                utilizationPct = Math.round(Math.min(100, (totalBps * 8) / linkBps * 1000) / 10);
            }
            cachedNet = {
                adapter: name || null,
                rxMbps,
                txMbps,
                linkMbps: linkBps > 0 ? Math.round(linkBps / 1e6) : null,
                utilizationPct,
                error: null,
            };
        }
    }
    lastNetSample = { at, rx, tx };
    return cachedNet;
}

async function getHostMetrics() {
    const now = Date.now();
    if (cachedSnapshot && now - cachedAt < CACHE_MS) {
        return cachedSnapshot;
    }

    // Ensure CPU has two samples ~250ms apart on cold start
    let cpuPercent = sampleCpuPercent();
    if (cpuPercent == null) {
        await new Promise((r) => setTimeout(r, 250));
        cpuPercent = sampleCpuPercent();
    }

    // Network sample is async; kick it but don't block forever
    try {
        await Promise.race([
            sampleNetwork(),
            new Promise((r) => setTimeout(r, 1200)),
        ]);
    } catch (_) {
        /* ignore */
    }

    const ram = ramSnapshot();
    const proc = processMemorySnapshot();
    const load = os.loadavg ? os.loadavg() : [0, 0, 0];

    cachedSnapshot = {
        at: new Date().toISOString(),
        hostname: os.hostname(),
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        uptimeSec: Math.round(os.uptime()),
        processUptimeSec: Math.round(process.uptime()),
        nodeVersion: process.version,
        cpu: {
            percent: cpuPercent == null ? 0 : cpuPercent,
            cores: os.cpus()?.length || 0,
            model: os.cpus()?.[0]?.model || null,
            loadAvg: load,
        },
        ram,
        processMemory: proc,
        network: { ...cachedNet },
        http: {
            keepAliveTimeoutMs: parseInt(process.env.HTTP_KEEP_ALIVE_TIMEOUT_MS || '310000', 10),
            headersTimeoutMs: parseInt(process.env.HTTP_HEADERS_TIMEOUT_MS || '315000', 10),
            requestTimeoutMs: parseInt(process.env.HTTP_REQUEST_TIMEOUT_MS || '0', 10),
            arrProxyTimeoutHintSec: 300,
            note: 'Node keepAlive must stay > IIS ARR proxy timeout (300s) or clients see 502 / “backend disconnected”.',
        },
    };
    cachedAt = now;
    return cachedSnapshot;
}

// Warm CPU + network sampler in background
setInterval(() => {
    sampleCpuPercent();
}, 2000).unref?.();

setInterval(() => {
    sampleNetwork().catch(() => {});
}, 5000).unref?.();

module.exports = {
    getHostMetrics,
};
