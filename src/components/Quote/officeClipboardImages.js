/**
 * Excel/Word paste images as file:///…/clip_imageNNN.png in HTML (blocked by browsers).
 * Real bytes usually live in clipboard text/rtf (\pngblip / \jpegblip) or as image Files.
 */

function convertHexToBase64(hexString) {
    const hex = String(hexString || '').replace(/[^\da-fA-F]/g, '');
    if (!hex || hex.length % 2 !== 0) return '';
    const pairs = hex.match(/.{1,2}/g);
    if (!pairs?.length) return '';
    const chunkSize = 0x8000;
    let binary = '';
    for (let i = 0; i < pairs.length; i += chunkSize) {
        const slice = pairs.slice(i, i + chunkSize);
        binary += String.fromCharCode(...slice.map((b) => parseInt(b, 16)));
    }
    try {
        return btoa(binary);
    } catch {
        return '';
    }
}

function pictBlockType(block) {
    if (block.includes('\\pngblip')) return 'image/png';
    if (block.includes('\\jpegblip')) return 'image/jpeg';
    return '';
}

function pictBlockName(block) {
    const m =
        block.match(/\\sp\{\\sn wzName\}\{\\sv ([^}]+)\}/i) ||
        block.match(/\\sp\{\\sn wzDescription\}\{\\sv ([^}]+)\}/i);
    return m ? String(m[1] || '').trim().toLowerCase() : '';
}

function trimHexToImageMagic(hex) {
    const raw = String(hex || '').replace(/[^\da-fA-F]/g, '');
    const pngIdx = raw.indexOf('89504e47');
    if (pngIdx >= 0) return raw.slice(pngIdx);
    const jpgIdx = raw.indexOf('ffd8ff');
    if (jpgIdx >= 0) return raw.slice(jpgIdx);
    return raw;
}

function pictBlockHex(block) {
    const match = block.match(/(?:\\pngblip|\\jpegblip)([\s\S]*)/i);
    if (!match) return '';
    const hex = match[1]
        .replace(/\\[a-z]+-?\d*(?:\s|$)?/gi, ' ')
        .replace(/[{}]/g, ' ')
        .replace(/[^\da-fA-F]/g, '');
    return trimHexToImageMagic(hex);
}

/** Extract each {\\pict ...} block from RTF (brace-balanced). */
function extractRtfPictBlocks(rtfData) {
    const rtf = String(rtfData || '');
    if (!rtf || !/\\pict/i.test(rtf)) return [];
    const blocks = [];
    let i = 0;
    while (i < rtf.length) {
        const start = rtf.indexOf('{\\pict', i);
        if (start < 0) break;
        let depth = 0;
        let end = start;
        for (let j = start; j < rtf.length; j += 1) {
            const ch = rtf[j];
            if (ch === '{') depth += 1;
            else if (ch === '}') {
                depth -= 1;
                if (depth === 0) {
                    end = j;
                    break;
                }
            }
        }
        if (end > start) blocks.push(rtf.slice(start, end + 1));
        i = end + 1;
    }
    return blocks;
}

/**
 * Extract PNG/JPEG payloads from Office RTF clipboard.
 * @returns {{ type: string, dataUrl: string, name: string }[]}
 */
export function extractImageEntriesFromRtf(rtfData) {
    const blocks = extractRtfPictBlocks(rtfData);
    const result = [];
    const seen = new Set();

    for (const block of blocks) {
        const type = pictBlockType(block);
        if (!type) continue;
        const hex = pictBlockHex(block);
        if (!hex || hex.length < 32) continue;
        const name = pictBlockName(block);
        const dedupeKey = `${name}|${hex.slice(0, 48)}`;
        if (seen.has(dedupeKey)) continue;
        const b64 = convertHexToBase64(hex);
        if (!b64) continue;
        seen.add(dedupeKey);
        result.push({
            type,
            name,
            dataUrl: `data:${type};base64,${b64}`,
        });
    }

    return result;
}

/** @deprecated use extractImageEntriesFromRtf */
export function extractImageDataUrlsFromRtf(rtfData) {
    return extractImageEntriesFromRtf(rtfData);
}

export function collectClipboardImageFiles(dataTransfer) {
    if (!dataTransfer) return [];
    const files = [];
    const seen = new Set();

    const pushFile = (file) => {
        if (!file || !String(file.type || '').startsWith('image/')) return;
        const key = `${file.name}|${file.size}|${file.lastModified}|${file.type}`;
        if (seen.has(key)) return;
        seen.add(key);
        files.push(file);
    };

    const items = dataTransfer.items;
    if (items?.length) {
        for (let i = 0; i < items.length; i += 1) {
            const item = items[i];
            if (item?.kind === 'file' && String(item.type || '').startsWith('image/')) {
                pushFile(item.getAsFile());
            }
        }
    }

    const list = dataTransfer.files;
    if (list?.length) {
        for (let i = 0; i < list.length; i += 1) {
            pushFile(list[i]);
        }
    }

    return files;
}

export function readFileAsDataUrl(file) {
    return new Promise((resolve) => {
        if (!file) {
            resolve('');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
    });
}

export async function collectClipboardImageEntries(dataTransfer) {
    const rtfEntries = extractImageEntriesFromRtf(dataTransfer?.getData?.('text/rtf') || '');
    if (rtfEntries.length) return rtfEntries;

    const files = collectClipboardImageFiles(dataTransfer);
    if (!files.length) return [];

    const urls = await Promise.all(files.map((f) => readFileAsDataUrl(f)));
    return urls
        .filter(Boolean)
        .map((dataUrl, idx) => ({
            type: String(dataUrl.match(/^data:([^;]+)/)?.[1] || 'image/png'),
            name: String(files[idx]?.name || '').trim().toLowerCase(),
            dataUrl,
        }));
}

function preserveOfficeImageShapeAttrs(html) {
    return String(html || '')
        .replace(/\sv:shapes="([^"]*)"/gi, ' data-v-shapes="$1"')
        .replace(/\sv:shapes='([^']*)'/gi, " data-v-shapes='$1'");
}

function parseOfficeImageHtmlRoot(html) {
    const safe = preserveOfficeImageShapeAttrs(html);
    try {
        const doc = new DOMParser().parseFromString(
            `<div id="__ems_office_img_root">${safe}</div>`,
            'text/html'
        );
        return doc.getElementById('__ems_office_img_root');
    } catch {
        return null;
    }
}
function buildImageLookup(entries) {
    const byName = new Map();
    const ordered = [];
    for (const entry of entries || []) {
        if (!entry?.dataUrl) continue;
        ordered.push(entry.dataUrl);
        const name = String(entry.name || '').trim().toLowerCase();
        if (name) byName.set(name, entry.dataUrl);
        const base = name.split(/[\\/]/).pop();
        if (base && base !== name) byName.set(base, entry.dataUrl);
    }
    return { byName, ordered };
}

function isLocalOrBrokenImageSrc(src) {
    const s = String(src || '').trim();
    if (!s) return true;
    if (/^data:/i.test(s)) return false;
    if (/^https?:\/\//i.test(s)) return false;
    if (/^blob:/i.test(s)) return false;
    if (/^file:/i.test(s)) return true;
    if (/^cid:/i.test(s)) return true;
    if (/clip_image\d+/i.test(s)) return true;
    if (/^msohtmlclip/i.test(s)) return true;
    if (/^[.]{0,2}\/?[\w .-]*image\d+/i.test(s)) return true;
    return false;
}

function imageIndexFromSrc(src) {
    const m = String(src || '').match(/clip_image0*(\d+)/i) || String(src || '').match(/image0*(\d+)/i);
    if (!m) return null;
    return Math.max(0, parseInt(m[1], 10) - 1);
}

function imageShapeKeys(img) {
    const keys = new Set();
    const shapes = String(img.getAttribute('v:shapes') || img.getAttribute('data-v-shapes') || '').trim();
    if (shapes) {
        shapes.split(/\s+/).forEach((part) => {
            const k = part.trim().toLowerCase();
            if (k) keys.add(k);
        });
    }
    const src = String(img.getAttribute('src') || '');
    const fileName = src.split(/[\\/]/).pop()?.toLowerCase() || '';
    if (fileName) keys.add(fileName);
    const idx = imageIndexFromSrc(src);
    if (idx != null) keys.add(`clip_image${String(idx + 1).padStart(3, '0')}`);
    return [...keys];
}

/** Turn Word/Excel VML picture shapes into normal <img> so we can rewrite src. */
export function convertOfficeVmlShapesToImages(root) {
    if (!root?.querySelectorAll) return;

    const shapes = [
        ...root.querySelectorAll('v\\:shape, shape'),
        ...[...(root.getElementsByTagName?.('v:shape') || [])],
    ];
    const seen = new Set();
    shapes.forEach((shape) => {
        if (!shape || seen.has(shape)) return;
        seen.add(shape);
        const imagedata =
            shape.querySelector?.('v\\:imagedata, imagedata') ||
            [...(shape.getElementsByTagName?.('v:imagedata') || [])][0];
        if (!imagedata) return;

        const src =
            imagedata.getAttribute('src') ||
            imagedata.getAttribute('o:href') ||
            imagedata.getAttribute('href') ||
            '';
        const shapeId =
            shape.getAttribute('id') ||
            shape.getAttribute('o:spid') ||
            imagedata.getAttribute('o:title') ||
            '';

        const doc = shape.ownerDocument || document;
        const img = doc.createElement('img');
        if (src) img.setAttribute('src', src);
        if (shapeId) img.setAttribute('v:shapes', shapeId);
        const style = shape.getAttribute('style') || '';
        const widthMatch = style.match(/width\s*:\s*([^;]+)/i);
        if (widthMatch) img.style.width = widthMatch[1].trim();
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        img.setAttribute('data-ems-office-paste-img', '1');
        shape.replaceWith(img);
    });
}

function pickDataUrlForImage(img, lookup, sequentialIdx) {
    const { byName, ordered } = lookup;
    if (!ordered.length) return { dataUrl: '', nextSequential: sequentialIdx };

    for (const key of imageShapeKeys(img)) {
        if (byName.has(key)) return { dataUrl: byName.get(key), nextSequential: sequentialIdx };
        const base = key.split(/[\\/]/).pop();
        if (base && byName.has(base)) return { dataUrl: byName.get(base), nextSequential: sequentialIdx };
    }

    const namedIdx = imageIndexFromSrc(img.getAttribute('src') || '');
    if (namedIdx != null && ordered[namedIdx]) {
        return { dataUrl: ordered[namedIdx], nextSequential: sequentialIdx };
    }

    if (sequentialIdx < ordered.length) {
        return { dataUrl: ordered[sequentialIdx], nextSequential: sequentialIdx + 1 };
    }
    return { dataUrl: '', nextSequential: sequentialIdx };
}

/**
 * Replace local/broken Office image srcs with data URLs.
 * @returns {number} how many images were rewritten
 */
export function replaceLocalOfficeImagesWithDataUrls(root, entries) {
    const lookup = buildImageLookup(entries);
    if (!lookup.ordered.length || !root?.querySelectorAll) return 0;

    convertOfficeVmlShapesToImages(root);

    const imgs = [...root.querySelectorAll('img')];
    let sequential = 0;
    let replaced = 0;

    imgs.forEach((img) => {
        const src = img.getAttribute('src') || '';
        if (!isLocalOrBrokenImageSrc(src)) return;

        const { dataUrl, nextSequential } = pickDataUrlForImage(img, lookup, sequential);
        sequential = nextSequential;
        if (!dataUrl) return;

        img.setAttribute('src', dataUrl);
        img.setAttribute('data-ems-office-paste-img', '1');
        img.removeAttribute('height');
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        replaced += 1;
    });

    return replaced;
}

/** Drop images that still point at blocked local Office temp paths. */
export function removeBrokenOfficePasteImages(root) {
    if (!root?.querySelectorAll) return 0;
    let removed = 0;
    root.querySelectorAll('img').forEach((img) => {
        const src = img.getAttribute('src') || '';
        if (!isLocalOrBrokenImageSrc(src)) return;
        img.remove();
        removed += 1;
    });
    return removed;
}

/** Prevent Excel picture row heights from blowing up the table when src fails. */
export function normalizeOfficePasteImageLayout(root) {
    if (!root?.querySelectorAll) return;

    root.querySelectorAll('table img, img[data-ems-office-paste-img]').forEach((img) => {
        img.removeAttribute('height');
        img.style.setProperty('max-width', '100%', 'important');
        img.style.setProperty('max-height', '72px', 'important');
        img.style.setProperty('width', 'auto', 'important');
        img.style.setProperty('height', 'auto', 'important');
        img.style.setProperty('display', 'inline-block', 'important');
        img.style.setProperty('vertical-align', 'middle', 'important');
        img.style.setProperty('object-fit', 'contain', 'important');
    });

    root.querySelectorAll('td, th').forEach((cell) => {
        if (!cell.querySelector('img')) return;
        const tr = cell.closest('tr');
        if (tr) {
            tr.style.setProperty('height', 'auto', 'important');
            tr.style.setProperty('min-height', '0', 'important');
            tr.style.setProperty('max-height', 'none', 'important');
            tr.removeAttribute('height');
        }
        cell.style.setProperty('height', 'auto', 'important');
        cell.style.setProperty('min-height', '0', 'important');
        cell.style.setProperty('max-height', 'none', 'important');
        cell.style.setProperty('vertical-align', 'middle', 'important');
        cell.removeAttribute('height');
    });
}

export function htmlNeedsOfficeImageRepair(html) {
    const raw = String(html || '');
    if (!raw) return false;
    if (/<v:imagedata[\s>]/i.test(raw) || /<v:shape[\s>]/i.test(raw)) return true;
    if (!/<img[\s>]/i.test(raw)) return false;
    if (/v:shapes\s*=/i.test(raw)) return true;
    if (/src\s*=\s*["']?\s*(file:|cid:|[^"'>\s]*clip_image)/i.test(raw)) return true;
    if (/src\s*=\s*["']\s*["']/i.test(raw)) return true;
    return /<img(?![^>]*\bsrc\s*=\s*["']data:)/i.test(raw);
}

function repairOfficeImagesInRoot(root, entries) {
    if (!root) return 0;
    const replaced = replaceLocalOfficeImagesWithDataUrls(root, entries);
    removeBrokenOfficePasteImages(root);
    normalizeOfficePasteImageLayout(root);
    return replaced;
}

/**
 * Sync repair using RTF only (no FileReader).
 */
export function repairOfficeHtmlImagesFromRtf(html, rtfData) {
    if (!htmlNeedsOfficeImageRepair(html)) return html;
    const entries = extractImageEntriesFromRtf(rtfData);
    if (!entries.length) return html;

    const root = parseOfficeImageHtmlRoot(html);
    if (!root) return html;
    repairOfficeImagesInRoot(root, entries);
    return root.innerHTML;
}

/**
 * Async repair: RTF first, then clipboard image files.
 */
export async function repairOfficeHtmlImagesFromClipboard(html, dataTransfer) {
    if (!htmlNeedsOfficeImageRepair(html) || !dataTransfer) return html;

    const entries = await collectClipboardImageEntries(dataTransfer);
    if (!entries.length) return html;

    const root = parseOfficeImageHtmlRoot(html);
    if (!root) return html;
    repairOfficeImagesInRoot(root, entries);
    return root.innerHTML;
}

/** Repair images already inserted in the live editor DOM (post-paste fallback). */
export async function repairOfficeImagesInDom(root, dataTransfer) {
    if (!root?.querySelector || !dataTransfer) return 0;
    if (!root.querySelector('img') && !root.querySelector('v\\:shape, v\\:imagedata')) return 0;

    const entries = await collectClipboardImageEntries(dataTransfer);
    if (!entries.length) {
        removeBrokenOfficePasteImages(root);
        normalizeOfficePasteImageLayout(root);
        return 0;
    }
    return repairOfficeImagesInRoot(root, entries);
}
