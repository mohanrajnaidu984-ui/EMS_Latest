const fs = require('fs');
const p = 'server/routes/dashboard.js';
let s = fs.readFileSync(p,'utf8');
const start = s.indexOf('function buildDashboardCalendarMergedBatchSql(');
const end = s.indexOf('\nfunction splitDashboardCalendarBatchResult',start);
let block = s.slice(start,end);
block = block.slice(0,block.indexOf('    const totalsPart =')) + '    return dailyPart;\n}\n';
for(const column of ['EnquiryDate','fe.DueDate','SiteVisitDate','eq.QuoteDate']) {
 const pattern = `MONTH(${column}) = @month AND YEAR(${column}) = @year`;
 block = block.split(pattern).join(`${column} >= @rangeStart AND ${column} < @rangeEnd`);
}
s = s.slice(0,start)+block+s.slice(end);
const binding = "request.input('month', sql.Int, parseInt(month, 10));\n    request.input('year', sql.Int, parseInt(year, 10));";
s = s.replace(binding,"bindCalendarRange(request, Number(year), Number(month), Number(year), Number(month));");
const helper = `
// One date-range query supplies all visible months; daily rows already define KPI totals.
function bindCalendarRange(request, fromYear, fromMonth, toYear, toMonth) {
    request.input('rangeStart', sql.Date, new Date(Date.UTC(fromYear, fromMonth - 1, 1)));
    request.input('rangeEnd', sql.Date, new Date(Date.UTC(toYear, toMonth, 1)));
}
`;
s = s.replace('async function runDashboardCalendarMonthQuery',helper+'\nasync function runDashboardCalendarMonthQuery');
const a = s.indexOf('        const runOne = async (m, y) =>',s.indexOf("router.get('/calendars-history'"));
const b = s.indexOf('        const yearTotals =',a);
if(a<0||b<0)throw Error('history markers missing');
s = s.slice(0,a)+`        const anchorY = parseInt(anchorYear, 10);
        const allMonths = [...monthList, ...Array.from({length: 12}, (_, i) => ({month: i + 1, year: anchorY}))];
        const ordered = allMonths.slice().sort((a, b) => a.year - b.year || a.month - b.month);
        const request = new sql.Request();
        const { baseFilter, quoteScopeFilter } = bindDashboardCalendarFilters(request, req.query, resolved);
        bindCalendarRange(request, ordered[0].year, ordered[0].month, ordered.at(-1).year, ordered.at(-1).month);
        const result = await request.query(buildDashboardCalendarMergedBatchSql(baseFilter, quoteScopeFilter, req.query.division));
        const daily = result.recordset || [];
        const monthPayloadByKey = new Map();
        for (const meta of allMonths) {
            const key = dashboardMonthPayloadKey(meta.year, meta.month);
            if (monthPayloadByKey.has(key)) continue;
            const prefix = String(meta.year) + '-' + String(meta.month).padStart(2, '0');
            const rows = daily.filter(row => String(row.Date).startsWith(prefix));
            monthPayloadByKey.set(key, { daily: rows, totals: reconcileCalendarTotalsFromDaily(rows, null) });
        }
        const payloads = monthList.map(meta => monthPayloadByKey.get(dashboardMonthPayloadKey(meta.year, meta.month)));

`+s.slice(b);
s=s.replace("request.input('month', sql.Int, parseInt(m, 10));\n            request.input('year', sql.Int, parseInt(y, 10));", "bindCalendarRange(request, Number(y), Number(m), Number(y), Number(m));");
fs.writeFileSync(p,s);
