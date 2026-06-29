'use strict';

function getSchedulerTimeZone() {
    return String(process.env.EMS_SCHEDULER_TIMEZONE || 'Asia/Bahrain').trim() || 'Asia/Bahrain';
}

/** YYYY-MM-DD in scheduler timezone. */
function ymdInTimeZone(date, timeZone) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const pick = (type) => parts.find((p) => p.type === type)?.value || '';
    return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

function addDaysToYmd(ymd, days) {
    const [y, m, d] = String(ymd || '').split('-').map(Number);
    if (!y || !m || !d) return '';
    const dt = new Date(y, m - 1, d + days);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function tomorrowYmdInSchedulerTz() {
    const tz = getSchedulerTimeZone();
    return addDaysToYmd(ymdInTimeZone(new Date(), tz), 1);
}

/** JS getDay(): 0=Sun … 6=Sat. Default Fri+Sat weekly off (Gulf / EMS). */
function getWorkingWeekendDays() {
    const raw = String(process.env.EMS_WORKING_WEEKEND_DAYS || '5,6').trim();
    if (!raw) return [5, 6];
    const days = raw
        .split(',')
        .map((part) => Number(String(part).trim()))
        .filter((n) => Number.isFinite(n) && n >= 0 && n <= 6);
    return days.length ? days : [5, 6];
}

function isWorkingDayYmd(ymd) {
    const parts = String(ymd || '').split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return false;
    const dt = new Date(parts[0], parts[1] - 1, parts[2]);
    return !getWorkingWeekendDays().includes(dt.getDay());
}

/** Advance by N working days from a calendar YMD (exclusive of start day). */
function addWorkingDaysToYmd(startYmd, workingDays) {
    const steps = Math.max(0, Number(workingDays) || 0);
    let cursor = String(startYmd || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cursor)) return '';
    if (steps === 0) return cursor;
    let added = 0;
    while (added < steps) {
        cursor = addDaysToYmd(cursor, 1);
        if (isWorkingDayYmd(cursor)) added += 1;
    }
    return cursor;
}

function todayYmdInSchedulerTz() {
    return ymdInTimeZone(new Date(), getSchedulerTimeZone());
}

module.exports = {
    getSchedulerTimeZone,
    ymdInTimeZone,
    addDaysToYmd,
    tomorrowYmdInSchedulerTz,
    todayYmdInSchedulerTz,
    getWorkingWeekendDays,
    isWorkingDayYmd,
    addWorkingDaysToYmd,
};
