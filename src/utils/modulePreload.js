// Load each screen only when requested. Hover/focus can fetch the same module
// promise before a click; React.lazy reuses it without duplicate downloads.
const imports = {
    Dashboard: () => import('../components/Dashboard/Dashboard'),
    Enquiry: () => import('../components/Enquiry/EnquiryForm'),
    Pricing: () => import('../components/Pricing/PricingForm'),
    'Quote B2B': () => import('../components/Quote/QuoteForm'),
    'Quote B2C': () => import('../components/Quote/QuoteB2CPlaceholder'),
    Approvals: () => import('../components/Quote/QuoteApprovalPage'),
    Probability: () => import('../components/Probability/ProbabilityForm'),
    ChatBox: () => import('../components/ChatBox/ChatBox'),
    'Sales Report': () => import('../components/SalesReport/SalesReport'),
    Reports: () => import('../components/SalesTarget/SalesTarget'),
    About: () => import('../components/About/About'),
    Help: () => import('../components/Help/Help'),
    Usage: () => import('../components/Usage/Usage'),
};
const pending = new Map();
export function loadAppModule(id) {
    const key = id === 'Quote' ? 'Quote B2B' : id;
    if (!imports[key]) return Promise.reject(new Error(`Unknown module: ${key}`));
    if (!pending.has(key)) {
        pending.set(key, imports[key]().catch(error => { pending.delete(key); throw error; }));
    }
    return pending.get(key);
}
export function preloadAppModule(id) {
    if (imports[id] || id === 'Quote') void loadAppModule(id).catch(() => {});
}
