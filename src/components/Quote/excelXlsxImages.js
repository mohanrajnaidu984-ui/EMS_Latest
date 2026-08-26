/**
 * Excel 365 does not put usable per-cell picture bytes on the browser clipboard
 * (HTML uses blocked file:// paths). Images do live inside the .xlsx package.
 */

import { ExcelJS } from '../../utils/emsExcelWorkbook';
import JSZip from 'jszip';

function bufferToDataUrl(buffer, extHint = '') {
    const bytes =
        buffer instanceof Uint8Array
            ? buffer
            : buffer?.buffer
              ? new Uint8Array(buffer)
              : new Uint8Array(buffer || []);
    if (!bytes.length) return '';
    let mime = 'image/png';
    const e = String(extHint || '').toLowerCase();
    if (e.includes('jpg') || e.includes('jpeg')) mime = 'image/jpeg';
    else if (e.includes('gif')) mime = 'image/gif';
    else if (e.includes('bmp')) mime = 'image/bmp';
    else if (e.includes('webp')) mime = 'image/webp';
    else if (bytes[0] === 0xff && bytes[1] === 0xd8) mime = 'image/jpeg';
    else if (bytes[0] === 0x47 && bytes[1] === 0x49) mime = 'image/gif';

    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return `data:${mime};base64,${btoa(binary)}`;
}

function parseRels(relsXml) {
    const map = new Map();
    const re = /Id="(rId\d+)"[^>]*Target="([^"]+)"/gi;
    let m;
    while ((m = re.exec(relsXml))) {
        map.set(m[1], m[2].replace(/^\.\.\//, '').replace(/^\//, ''));
    }
    const re2 = /Target="([^"]+)"[^>]*Id="(rId\d+)"/gi;
    while ((m = re2.exec(relsXml))) {
        map.set(m[2], m[1].replace(/^\.\.\//, '').replace(/^\//, ''));
    }
    return map;
}

async function readZipText(zip, path) {
    const file = zip.file(path);
    if (!file) return '';
    return file.async('string');
}

async function readZipBuffer(zip, path) {
    const file = zip.file(path);
    if (!file) return null;
    return file.async('uint8array');
}

async function pushMedia(zip, out, seen, mediaPath, row = 0, col = 0, name = '') {
    const leaf = String(mediaPath || '').split('/').pop();
    const candidates = [
        mediaPath.replace(/^\/+/, ''),
        mediaPath.replace(/^\.\.\//, 'xl/'),
        mediaPath.startsWith('xl/') ? mediaPath : `xl/${mediaPath}`,
        leaf ? `xl/media/${leaf}` : '',
    ].filter(Boolean);

    for (const path of candidates) {
        if (seen.has(path)) return;
        const buf = await readZipBuffer(zip, path);
        if (!buf?.length) continue;
        const dataUrl = bufferToDataUrl(buf, path);
        if (!dataUrl) continue;
        seen.add(path);
        out.push({
            dataUrl,
            row: row || 0,
            col: col || 0,
            name: name || leaf || path,
        });
        return;
    }
}

async function extractViaZip(arrayBuffer) {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const out = [];
    const seen = new Set();

    // Excel 365 Place-in-Cell
    const cellImagesXml = await readZipText(zip, 'xl/cellimages.xml');
    const cellImagesRels = await readZipText(zip, 'xl/_rels/cellimages.xml.rels');
    if (cellImagesXml && cellImagesRels) {
        const rels = parseRels(cellImagesRels);
        const blipRe = /r:embed="(rId\d+)"/gi;
        let m;
        while ((m = blipRe.exec(cellImagesXml))) {
            const target = rels.get(m[1]);
            if (target) await pushMedia(zip, out, seen, target);
        }
    }

    // Floating drawings
    const drawingFiles = Object.keys(zip.files).filter((p) =>
        /^xl\/drawings\/drawing\d+\.xml$/i.test(p)
    );
    for (const drawingPath of drawingFiles) {
        const drawingXml = await readZipText(zip, drawingPath);
        const relsPath = drawingPath.replace('xl/drawings/', 'xl/drawings/_rels/') + '.rels';
        const rels = parseRels(await readZipText(zip, relsPath));
        if (!drawingXml) continue;

        const anchorRe =
            /<(?:xdr:)?(?:twoCellAnchor|oneCellAnchor)[\s\S]*?<(?:xdr:)?from>[\s\S]*?<(?:xdr:)?col>(\d+)<\/(?:xdr:)?col>[\s\S]*?<(?:xdr:)?row>(\d+)<\/(?:xdr:)?row>[\s\S]*?r:embed="(rId\d+)"[\s\S]*?<\/(?:xdr:)?(?:twoCellAnchor|oneCellAnchor)>/gi;
        let m;
        while ((m = anchorRe.exec(drawingXml))) {
            const col = parseInt(m[1], 10) + 1;
            const row = parseInt(m[2], 10) + 1;
            const target = rels.get(m[3]);
            if (target) await pushMedia(zip, out, seen, target, row, col);
        }
        const embedRe = /r:embed="(rId\d+)"/gi;
        while ((m = embedRe.exec(drawingXml))) {
            const target = rels.get(m[1]);
            if (target) await pushMedia(zip, out, seen, target);
        }
    }

    if (!out.length) {
        const mediaFiles = Object.keys(zip.files)
            .filter((p) => /^xl\/media\//i.test(p) && !zip.files[p].dir)
            .sort();
        for (const path of mediaFiles) {
            await pushMedia(zip, out, seen, path);
        }
    }

    out.sort((a, b) => {
        if (a.row && b.row && a.row !== b.row) return a.row - b.row;
        if (a.row && !b.row) return -1;
        if (!a.row && b.row) return 1;
        if (a.col && b.col && a.col !== b.col) return a.col - b.col;
        return String(a.name).localeCompare(String(b.name));
    });
    return out;
}

async function extractViaExcelJs(arrayBuffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);
    const out = [];

    const media = workbook.media || [];
    const byId = new Map();
    media.forEach((m, id) => {
        if (!m?.buffer) return;
        const dataUrl = bufferToDataUrl(m.buffer, m.extension || m.name || '');
        if (!dataUrl) return;
        byId.set(id, dataUrl);
    });

    workbook.eachSheet((ws) => {
        const images = typeof ws.getImages === 'function' ? ws.getImages() : [];
        images.forEach((img) => {
            const dataUrl = byId.get(img.imageId);
            if (!dataUrl) return;
            const range = img.range || {};
            const tl = range.tl || range.nativeCol != null
                ? { nativeCol: range.nativeCol, nativeRow: range.nativeRow }
                : range.tl;
            const col = (tl?.nativeCol ?? range?.nativeCol ?? 0) + 1;
            const row = (tl?.nativeRow ?? range?.nativeRow ?? 0) + 1;
            out.push({ dataUrl, row, col, name: `img-${img.imageId}` });
        });
    });

    if (!out.length) {
        byId.forEach((dataUrl, id) => {
            out.push({ dataUrl, row: 0, col: 0, name: `media-${id}` });
        });
    }
    return out;
}

/**
 * @returns {Promise<{ dataUrl: string, row: number, col: number, name: string }[]>}
 */
export async function extractImagesFromXlsxArrayBuffer(arrayBuffer) {
    let fromZip = [];
    try {
        fromZip = await extractViaZip(arrayBuffer);
    } catch (err) {
        console.warn('[EMS] xlsx zip image extract failed:', err);
    }
    if (fromZip.length) return fromZip;

    try {
        return await extractViaExcelJs(arrayBuffer);
    } catch (err) {
        console.warn('[EMS] exceljs image extract failed:', err);
        return [];
    }
}

function findImagesColumnIndex(table) {
    const headerRow = table.querySelector('tr');
    if (!headerRow) return -1;
    const cells = [...headerRow.querySelectorAll('th, td')];
    return cells.findIndex((c) => /image/i.test(String(c.textContent || '')));
}

function isEmptyOrBrokenImageCell(cell) {
    if (!cell) return true;
    const img = cell.querySelector('img');
    if (!img) {
        const text = String(cell.textContent || '')
            .replace(/\u00a0/g, ' ')
            .trim();
        return !text;
    }
    const src = img.getAttribute('src') || '';
    if (/^data:image\//i.test(src) && src.length > 64) return false;
    return true;
}

function styleOfficePasteImg(img) {
    img.setAttribute('data-ems-office-paste-img', '1');
    img.removeAttribute('height');
    img.style.setProperty('max-width', '100%', 'important');
    img.style.setProperty('max-height', '96px', 'important');
    img.style.setProperty('width', 'auto', 'important');
    img.style.setProperty('height', 'auto', 'important');
    img.style.setProperty('display', 'inline-block', 'important');
    img.style.setProperty('vertical-align', 'middle', 'important');
    img.style.setProperty('object-fit', 'contain', 'important');
}

/**
 * @returns {number} cells filled
 */
export function fillTableImagesFromExcelExtract(table, extracts) {
    if (!table || !extracts?.length) return 0;
    const rows = [...table.querySelectorAll('tr')];
    if (rows.length < 2) return 0;

    const imgCol = findImagesColumnIndex(table);
    const dataUrls = extracts.map((e) => e.dataUrl).filter(Boolean);
    if (!dataUrls.length) return 0;

    let filled = 0;
    let urlIdx = 0;

    for (let r = 1; r < rows.length; r += 1) {
        const tr = rows[r];
        const cells = [...tr.querySelectorAll('td, th')];
        let cell = imgCol >= 0 ? cells[imgCol] : null;
        if (!cell) cell = cells.find((c) => c.querySelector('img')) || null;
        if (!cell) continue;
        if (!isEmptyOrBrokenImageCell(cell) && cell.querySelector('img[src^="data:image"]')) {
            continue;
        }

        if (urlIdx >= dataUrls.length) break;
        const dataUrl = dataUrls[urlIdx];
        urlIdx += 1;

        const doc = table.ownerDocument || document;
        let img = cell.querySelector('img');
        if (!img) {
            img = doc.createElement('img');
            cell.textContent = '';
            cell.appendChild(img);
        }
        img.setAttribute('src', dataUrl);
        styleOfficePasteImg(img);
        tr.style.setProperty('height', 'auto', 'important');
        cell.style.setProperty('height', 'auto', 'important');
        cell.style.setProperty('vertical-align', 'middle', 'important');
        filled += 1;
    }

    return filled;
}

export function findLastOfficePastedTable(root) {
    if (!root?.querySelectorAll) return null;
    const tables = [
        ...root.querySelectorAll(
            'table[data-ems-excel-paste="1"], table[data-ems-paste-source="office"], table.ems-office-paste-table'
        ),
    ];
    return tables.length ? tables[tables.length - 1] : root.querySelector('table');
}

export function tableNeedsExcelImageImport(table) {
    if (!table) return false;
    const imgCol = findImagesColumnIndex(table);
    if (imgCol < 0) {
        return [...table.querySelectorAll('img')].some((img) => {
            const src = img.getAttribute('src') || '';
            return !/^data:image\//i.test(src);
        });
    }
    const rows = [...table.querySelectorAll('tr')].slice(1);
    return rows.some((tr) => {
        const cell = tr.querySelectorAll('td, th')[imgCol];
        return isEmptyOrBrokenImageCell(cell);
    });
}
