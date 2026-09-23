import React from 'react';

/** Compact "Currency: BHD" chip — value from Master_EnquiryFor for the active division. */
export default function MasterCurrencyBadge({
    currencyCode = 'BHD',
    division = '',
    style = {},
}) {
    const code = String(currencyCode || 'BHD').trim().toUpperCase() || 'BHD';
    return (
        <span
            title={
                division
                    ? `Master_EnquiryFor.Currency for division: ${division}`
                    : 'Master_EnquiryFor.Currency'
            }
            style={{
                padding: '3px 8px',
                borderRadius: '12px',
                fontSize: '10px',
                fontWeight: 600,
                background: '#e0e7ff',
                color: '#3730a3',
                letterSpacing: '0.02em',
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                ...style,
            }}
        >
            Currency: {code}
        </span>
    );
}
