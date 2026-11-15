'use strict';

const { runSiteVisitReminders } = require('./siteVisitReminder');
const { runDueSubmissionReminders } = require('./dueSubmissionReminder');
const { runEdCeoDueSubmissionReminders } = require('./edCeoDueSubmissionReminder');
const { getSchedulerTimeZone, isWorkingDayYmd } = require('./schedulerTime');
const { runBookingTargetEscalation } = require('../scripts/send-booking-target-escalation.cjs');

const TICK_MS = 30_000;

function isDailyRemindersEnabled() {
    const v = String(process.env.EMS_DAILY_REMINDERS_ENABLED ?? '1').trim().toLowerCase();
    return v !== '0' && v !== 'false' && v !== 'no';
}

function isSiteVisitReminderEnabled() {
    const v = String(process.env.EMS_SITE_VISIT_REMINDER_ENABLED ?? '1').trim().toLowerCase();
    return v !== '0' && v !== 'false' && v !== 'no';
}

function isDueSubmissionReminderEnabled() {
    const v = String(process.env.EMS_DUE_SUBMISSION_REMINDER_ENABLED ?? '1').trim().toLowerCase();
    return v !== '0' && v !== 'false' && v !== 'no';
}

function isEdCeoDueReminderEnabled() {
    const v = String(process.env.EMS_ED_CEO_DUE_REMINDER_ENABLED ?? '1').trim().toLowerCase();
    return v !== '0' && v !== 'false' && v !== 'no';
}

function isBookingTargetEscalationEnabled() {
    const v=String(process.env.EMS_BOOKING_TARGET_ESCALATION_ENABLED ?? '1').trim().toLowerCase();
    return v!=='0' && v!=='false' && v!=='no';
}

function getRunHour() {
    const fromEnv = process.env.EMS_DAILY_REMINDERS_HOUR ?? process.env.EMS_SITE_VISIT_REMINDER_HOUR;
    const h = Number(fromEnv);
    return Number.isFinite(h) && h >= 0 && h <= 23 ? h : 7;
}

function getRunMinute() {
    const fromEnv = process.env.EMS_DAILY_REMINDERS_MINUTE ?? process.env.EMS_SITE_VISIT_REMINDER_MINUTE;
    const m = Number(fromEnv);
    return Number.isFinite(m) && m >= 0 && m <= 59 ? m : 0;
}

function getZonedDateParts(date = new Date()) {
    const tz = getSchedulerTimeZone();
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
    }).formatToParts(date);
    const pick = (type) => parts.find((p) => p.type === type)?.value || '';
    return {
        dateKey: `${pick('year')}-${pick('month')}-${pick('day')}`,
        hour: Number(pick('hour')),
        minute: Number(pick('minute')),
    };
}

/**
 * Daily EMS reminders at 7:00 AM (configurable) in EMS_SCHEDULER_TIMEZONE (default Asia/Bahrain).
 * - Booking-target escalation (Sun–Thu only; Fri/Sat off — EMS_WORKING_WEEKEND_DAYS)
 * - Site visit (one day before SiteVisitDate)
 * - Quote/tender submission (one day before DueDate, no quote yet)
 * - ED/CEO signature due reminders (2 working days before + due today, Fri/Sat off)
 */
function startSiteVisitReminderScheduler() {
    if (!isDailyRemindersEnabled()) {
        console.log('[ems-daily-reminders] Scheduler disabled (EMS_DAILY_REMINDERS_ENABLED).');
        return;
    }

    const hour = getRunHour();
    const minute = getRunMinute();
    const tz = getSchedulerTimeZone();
    let lastRunDateKey = '';
    let running = false;

    const jobs = [];
    if (isBookingTargetEscalationEnabled()) jobs.push('booking-target-escalation');
    if (isSiteVisitReminderEnabled()) jobs.push('site-visit');
    if (isDueSubmissionReminderEnabled()) jobs.push('due-submission');
    if (isEdCeoDueReminderEnabled()) jobs.push('ed-ceo-due');
    if (!jobs.length) {
        console.log('[ems-daily-reminders] No reminder jobs enabled.');
        return;
    }

    console.log(
        `[ems-daily-reminders] Active — ${jobs.join(', ')} at ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} (${tz}).`,
    );

    const tick = async () => {
        if (running) return;
        const { dateKey, hour: h, minute: m } = getZonedDateParts();
        if (h !== hour) return;
        if (m < minute || m > minute + 1) return;
        if (lastRunDateKey === dateKey) return;

        running = true;
        lastRunDateKey = dateKey;
        try {
            // Same 7:00 slot as due notifications; skip Fri/Sat (weekly off).
            if (isBookingTargetEscalationEnabled()) {
                if (!isWorkingDayYmd(dateKey)) {
                    console.log(
                        `[booking-target-escalation] Skipped for ${dateKey} — weekly off day (Fri/Sat by default).`,
                    );
                } else {
                    try { await runBookingTargetEscalation(); }
                    catch (error) { console.error('[booking-target-escalation] Scheduled send failed:', error); }
                }
            }
            if (isSiteVisitReminderEnabled()) {
                await runSiteVisitReminders();
            }
            if (isDueSubmissionReminderEnabled()) {
                await runDueSubmissionReminders();
            }
            if (isEdCeoDueReminderEnabled()) {
                await runEdCeoDueSubmissionReminders();
            }
        } catch (err) {
            console.error('[ems-daily-reminders] Scheduled run failed:', err);
        } finally {
            running = false;
        }
    };

    setInterval(() => {
        tick().catch((err) => console.error('[ems-daily-reminders] Tick error:', err));
    }, TICK_MS);

    tick().catch((err) => console.error('[ems-daily-reminders] Initial tick error:', err));
}

module.exports = { startSiteVisitReminderScheduler };
