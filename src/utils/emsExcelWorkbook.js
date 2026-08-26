import ExcelJSModule from 'exceljs';
import emsLogoFinalUrl from '../assets/ems_logo_final.png?url';

export const ExcelJS = ExcelJSModule?.Workbook ? ExcelJSModule : ExcelJSModule?.default || ExcelJSModule;

export const HEADER_FILL = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF20396D' }
};
export const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10, name: 'Calibri' };
export const TITLE_FONT = { bold: true, size: 13, name: 'Calibri', color: { argb: 'FF20396D' } };
export const META_FONT = { size: 9, name: 'Calibri', color: { argb: 'FF4B5563' } };
export const CELL_FONT = { size: 10, name: 'Calibri' };
export const THIN_BORDER = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
};
export const TOTAL_FILL = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE8EEF7' }
};

const EMS_LOGO_DISPLAY_HEIGHT = 44;

let cachedBrandLogo = null;

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to load EMS logo'));
        img.src = src;
    });
}

async function fetchLogoBase64(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to load EMS logo');
    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

/** Load EMS Logo Final.png once; returns base64 and display dimensions. */
async function getEmsBrandLogoAsset() {
    if (cachedBrandLogo) return cachedBrandLogo;

    const img = await loadImage(emsLogoFinalUrl);
    const aspect = img.naturalWidth / img.naturalHeight;
    const height = EMS_LOGO_DISPLAY_HEIGHT;
    const width = Math.round(height * aspect);
    const base64 = await fetchLogoBase64(emsLogoFinalUrl);

    cachedBrandLogo = { base64, width, height };
    return cachedBrandLogo;
}

/** Load full EMS header brand logo once for Excel image embed. */
export async function getEmsLogoBase64() {
    const logo = await getEmsBrandLogoAsset();
    return logo.base64;
}

async function embedEmsLogo(workbook, sheet) {
    try {
        const { base64, width, height } = await getEmsBrandLogoAsset();
        const imageId = workbook.addImage({ base64, extension: 'png' });
        sheet.addImage(imageId, {
            tl: { col: 0, row: 0 },
            ext: { width, height }
        });
        return { width, height };
    } catch (err) {
        console.warn('[EMS Excel] Could not embed logo', err);
        return { width: EMS_LOGO_DISPLAY_HEIGHT, height: EMS_LOGO_DISPLAY_HEIGHT };
    }
}

function titleColumnForLogo(logoWidthPx, lastCol) {
    const pxPerCol = 58;
    const startCol = Math.max(2, Math.ceil(logoWidthPx / pxPerCol) + 1);
    return Math.min(startCol, Math.max(2, lastCol));
}

/**
 * Top banner: EMS Logo Final.png (top-left), module title + meta beside it, column headers on row 3.
 * Returns { headerRowIndex: 3, dataStartRow: 4 }.
 */
export async function setupEmsExcelReportHeader(workbook, sheet, {
    lastCol,
    title,
    metaText = '',
    columns = [],
    getHeaderAlignment = (col) => ({
        vertical: 'middle',
        horizontal: col.type === 'number' ? 'right' : 'left',
        wrapText: true
    })
}) {
    const { width: logoWidth, height: logoHeight } = await embedEmsLogo(workbook, sheet);

    sheet.getRow(1).height = Math.max(44, logoHeight + 4);
    const titleColStart = titleColumnForLogo(logoWidth, lastCol);
    if (lastCol >= titleColStart) {
        sheet.mergeCells(1, titleColStart, 1, lastCol);
    }
    const titleCell = sheet.getCell(1, titleColStart);
    titleCell.value = title;
    titleCell.font = TITLE_FONT;
    titleCell.alignment = { vertical: 'middle', horizontal: 'left' };

    sheet.getRow(2).height = 18;
    if (lastCol >= titleColStart) {
        sheet.mergeCells(2, titleColStart, 2, lastCol);
    }
    const metaCell = sheet.getCell(2, titleColStart);
    metaCell.value = metaText;
    metaCell.font = META_FONT;
    metaCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

    const headerRowIndex = 3;
    const headerRow = sheet.getRow(headerRowIndex);
    columns.forEach((col, i) => {
        const cell = headerRow.getCell(i + 1);
        cell.value = col.header;
        cell.fill = HEADER_FILL;
        cell.font = HEADER_FONT;
        cell.border = THIN_BORDER;
        cell.alignment = getHeaderAlignment(col, i);
    });
    headerRow.height = 20;

    sheet.views = [{ state: 'frozen', ySplit: headerRowIndex }];

    return { headerRowIndex, dataStartRow: headerRowIndex + 1 };
}

export function downloadExcelBlob(buffer, fileName) {
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export function safeExcelFilePart(s) {
    return String(s || 'EMS_Export')
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 80);
}
