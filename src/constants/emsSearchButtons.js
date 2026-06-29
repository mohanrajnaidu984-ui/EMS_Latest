/**
 * EMS nav strip gradient — same as Header.jsx (`linear-gradient(180deg, #2f5fae 0%, #203f75 100%)`).
 * Used for list Search buttons (Enquiry search, Pricing, Quote).
 */
export const EMS_NAV_GRADIENT = 'linear-gradient(180deg, #2f5fae 0%, #203f75 100%)';

/** Primary Search — gradient fill, white label */
export const EMS_LIST_SEARCH_ENABLED_STYLE = {
    background: EMS_NAV_GRADIENT,
    color: '#ffffff',
    border: '1px solid #1a3568',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14)',
};

/** Search disabled / not applicable (category not Search, or loading) */
export const EMS_LIST_SEARCH_DISABLED_STYLE = {
    background: '#e2e8f0',
    color: '#94a3b8',
    border: '1px solid #cbd5e1',
    boxShadow: 'none',
};

/** Clear — neutral grey background, dark text (Pricing / Quote / Enquiry list) */
export const EMS_LIST_CLEAR_STYLE = {
    backgroundColor: '#9ca3af',
    color: '#111827',
    border: '1px solid #8892a0',
};
