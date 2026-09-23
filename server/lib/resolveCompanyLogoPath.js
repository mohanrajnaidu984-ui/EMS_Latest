'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_LOGOS_DIR = path.join(__dirname, '..', 'uploads', 'logos');

let logoFileCache = { at: 0, files: [] };
const LOGO_CACHE_MS = 30_000;

function stripLogoTimestamp(filename) {
    return String(filename || '').replace(/^\d+-/, '');
}

function listLogoFilenames(logosDir = DEFAULT_LOGOS_DIR) {
    const now = Date.now();
    if (now - logoFileCache.at < LOGO_CACHE_MS && logoFileCache.dir === logosDir && logoFileCache.files.length) {
        return logoFileCache.files;
    }
    let files = [];
    try {
        files = fs.existsSync(logosDir) ? fs.readdirSync(logosDir) : [];
    } catch {
        files = [];
    }
    logoFileCache = { at: now, dir: logosDir, files };
    return files;
}

/** Find an on-disk logo filename when the exact DB path is missing (re-upload changed timestamp prefix). */
function findLogoFilenameOnDisk(requestedFilename, logosDir = DEFAULT_LOGOS_DIR) {
    const base = path.basename(String(requestedFilename || '').trim());
    if (!base) return null;

    const exactPath = path.join(logosDir, base);
    if (fs.existsSync(exactPath)) return base;

    const wantBase = stripLogoTimestamp(base);
    if (!wantBase) return null;

    const matches = listLogoFilenames(logosDir).filter((f) => stripLogoTimestamp(f) === wantBase);
    if (!matches.length) return null;

    matches.sort((a, b) => {
        const ta = parseInt(String(a.match(/^(\d+)-/)?.[1] || '0'), 10);
        const tb = parseInt(String(b.match(/^(\d+)-/)?.[1] || '0'), 10);
        return tb - ta;
    });
    return matches[0];
}

/**
 * Normalize a stored CompanyLogo path and resolve to an existing file when possible.
 * Returns relative path like `uploads/logos/123-name.png`, or original for http/data URLs.
 */
function resolveCompanyLogoPath(logoPath, logosDir = DEFAULT_LOGOS_DIR) {
    if (logoPath == null) return null;
    const raw = String(logoPath).trim();
    if (!raw) return null;
    if (/^data:/i.test(raw) || /^https?:\/\//i.test(raw)) return raw;

    let s = raw.replace(/\\/g, '/');
    const lower = s.toLowerCase();
    const uploadsIdx = lower.indexOf('uploads/');
    if (uploadsIdx >= 0) s = s.slice(uploadsIdx);
    if (!s.startsWith('uploads/')) {
        s = `uploads/logos/${path.basename(s)}`;
    }

    const base = path.basename(s);
    const exactPath = path.join(logosDir, base);
    if (fs.existsSync(exactPath)) return s;

    const alt = findLogoFilenameOnDisk(base, logosDir);
    return alt ? `uploads/logos/${alt}` : s;
}

module.exports = {
    resolveCompanyLogoPath,
    findLogoFilenameOnDisk,
    stripLogoTimestamp,
};
