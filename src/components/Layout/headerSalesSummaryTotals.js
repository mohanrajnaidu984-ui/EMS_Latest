export function summarizeHeaderSales(report) {
    const sum = (rows, key) => (Array.isArray(rows) ? rows : []).reduce((total, row) => {
        const value = Number(row?.[key]);
        return total + (Number.isFinite(value) ? value : 0);
    }, 0);
    const metric = (rows) => {
        const actual = sum(rows, 'actual');
        const target = sum(rows, 'target');
        return { actual, target, percent: target > 0 ? Math.round(actual / target * 100) : null };
    };
    return { booking: metric(report?.targetVsActual), gp: metric(report?.grossMarginTargetVsActual) };
}

export function formatHeaderSalesAmount(value) {
    const amount = Number(value) || 0;
    const absolute = Math.abs(amount);
    if (absolute >= 1000000) return `${(amount / 1000000).toFixed(2)}M`;
    if (absolute >= 1000) return `${(amount / 1000).toFixed(2)}k`;
    return amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function achievementDirection(values) {
    if (!values || values.target <= 0) return '';
    return values.actual > values.target ? '↑' : values.actual < values.target ? '↓' : '=';
}

export function formatTopDivisionAmount(value) {
    const amount = Number(value) || 0;
    if (Math.abs(amount) >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
    if (Math.abs(amount) >= 1000) return `${(amount / 1000).toFixed(1)}k`;
    return amount.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function buildHeaderSalesFrames(report, date = new Date()) {
    const month = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Riyadh', month: 'numeric' }).format(date));
    const quarter = Math.ceil(month / 3);
    const frames = [{ label: 'Total', ...summarizeHeaderSales(report) }];
    for (let number = 1; number <= quarter; number += 1) {
        const label = `Q${number}`;
        frames.push({ label, ...summarizeHeaderSales({
            targetVsActual: (report?.targetVsActual || []).filter(row => row.name === label),
            grossMarginTargetVsActual: (report?.grossMarginTargetVsActual || []).filter(row => row.name === label),
        }) });
    }
    return frames;
}
