const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {isWorkingDayYmd}=require('../schedulerTime');
function harness(env={},failBooking=false){
    /* Default clock just before 7:00 Bahrain on Thu 2026-11-12 (weekday). */
    let now='2026-11-12T03:59:59.000Z',interval;
    const calls=[];
    class Clock extends Date {constructor(...args){super(...(args.length?args:[now]));}}
    const jobs={runSiteVisitReminders:async()=>calls.push('site'),runDueSubmissionReminders:async()=>calls.push('due'),runEdCeoDueSubmissionReminders:async()=>calls.push('ed'),
        runBookingTargetEscalation:async()=>{calls.push('booking');if(failBooking)throw new Error('test failure');}};
    const context={module:{exports:{}},process:{env},Date:Clock,Intl,console:{log(){},error(){}},
        setInterval:fn=>{interval=fn;},require:name=>name==='./schedulerTime'?{getSchedulerTimeZone:()=>'Asia/Bahrain',isWorkingDayYmd}:jobs};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../siteVisitReminderScheduler.js'),'utf8'),context);
    context.module.exports.startSiteVisitReminderScheduler();
    return {calls,hasTimer:()=>!!interval,async tick(time){now=time;interval?.();await new Promise(setImmediate);}};
}
test('starts booking first in the 7:00 Bahrain minute, once per day (Sun–Thu)',async()=>{
    const h=harness();assert.deepEqual(h.calls,[]);
    await h.tick('2026-11-12T04:00:00.000Z');assert.deepEqual(h.calls,['booking','site','due','ed']);
    await h.tick('2026-11-12T04:00:30.000Z');assert.equal(h.calls.length,4);
    await h.tick('2026-11-15T04:00:00.000Z');assert.equal(h.calls.filter(v=>v==='booking').length,2);
});
test('development global disable prevents all automatic email jobs',()=>{
    const h=harness({EMS_DAILY_REMINDERS_ENABLED:'0'});assert.equal(h.hasTimer(),false);assert.deepEqual(h.calls,[]);
});
test('booking failure does not block existing due notifications',async()=>{
    const h=harness({},true);await h.tick('2026-11-12T04:00:00Z');assert.deepEqual(h.calls,['booking','site','due','ed']);
});
test('booking escalation can be individually disabled',async()=>{
    const h=harness({EMS_BOOKING_TARGET_ESCALATION_ENABLED:'0'});await h.tick('2026-11-12T04:00:00Z');assert.deepEqual(h.calls,['site','due','ed']);
});
test('does not turn a missed 7am schedule into a 7:59 catch-up send',async()=>{
    const h=harness();await h.tick('2026-11-12T04:59:00Z');assert.deepEqual(h.calls,[]);
});
test('skips booking escalation on Friday (weekly off)',async()=>{
    const h=harness();
    await h.tick('2026-11-13T04:00:00.000Z');
    assert.deepEqual(h.calls,['site','due','ed']);
});
test('skips booking escalation on Saturday (weekly off)',async()=>{
    const h=harness();
    await h.tick('2026-11-14T04:00:00.000Z');
    assert.deepEqual(h.calls,['site','due','ed']);
});
