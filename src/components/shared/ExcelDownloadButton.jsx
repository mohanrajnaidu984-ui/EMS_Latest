import React from 'react';
import excelIconSrc from '../../assets/excel_icon.png';

/** Default icon size (25 × 0.85 ≈ 21). */
export const EMS_EXCEL_ICON_SIZE = 21;

/**
 * Official Microsoft Excel icon (shared across EMS list exports).
 */
export function ExcelIcon({ size = EMS_EXCEL_ICON_SIZE, className, title = 'Excel' }) {
    const s = Number(size) || EMS_EXCEL_ICON_SIZE;
    return (
        <img
            src={excelIconSrc}
            alt={title}
            width={s}
            height={s}
            className={className}
            draggable={false}
            style={{
                display: 'block',
                width: s,
                height: s,
                objectFit: 'contain',
                flexShrink: 0,
                pointerEvents: 'none',
            }}
        />
    );
}

/**
 * Shared Excel download control — original Excel icon on Enquiry, Pricing, Quote, Sales Report.
 */
export default function ExcelDownloadButton({
    onClick,
    disabled = false,
    title = 'Download as Excel (.xlsx)',
    size = EMS_EXCEL_ICON_SIZE,
    className = '',
    style = {},
}) {
    const iconSize = Number(size) || EMS_EXCEL_ICON_SIZE;
    const hit = Math.max(28, Math.round(iconSize + 8));
    const { width: _w, height: _h, minWidth: _mw, minHeight: _mh, ...restStyle } = style || {};
    return (
        <button
            type="button"
            className={`ems-excel-download-btn no-print ${className}`.trim()}
            onClick={onClick}
            disabled={disabled}
            title={title}
            aria-label={title}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: hit,
                height: hit,
                minWidth: hit,
                minHeight: hit,
                padding: 0,
                border: 'none',
                borderRadius: 4,
                background: 'transparent',
                color: 'inherit',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.45 : 1,
                flexShrink: 0,
                lineHeight: 0,
                ...restStyle,
            }}
        >
            <ExcelIcon size={iconSize} />
        </button>
    );
}
