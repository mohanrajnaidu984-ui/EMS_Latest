'use strict';

// Read current annual commitments and entered targets; never sync or modify either table.
const fs = require('node:fs');
const path = require('node:path');
const { sql, dbConfig } = require('../dbConfig');
const { getSmtpFromEmail } = require('../lib/smtpTransport');
const { sendEnquiryNotificationViaSmtp } = require('../lib/enquiryNotifySmtp');
const { escapeHtml } = require('../lib/htmlEscape');
const { ymdInTimeZone, isWorkingDayYmd } = require('../lib/schedulerTime');
const {ensureBookingTargetEscalationLog,claimBookingTargetRun,finishBookingTargetRun}=require('../lib/bookingTargetEscalationLog');

const TO = 'lohidas@almoayyedcg.com';
const BCC = 'mohan.naidu@almoayyedcg.com';
const SUBJECT = 'Escalation: Unset EMS Booking Targets – Action Required';
const NOTICE = '* This is an auto generated E-mail from Enquiry Management System * Please do not reply *';
const INTRO = 'The below divisions have not set their Booking targets in the EMS. Your intervention is required on this regards.';
const outDir = path.join(__dirname, '..', 'temp', 'booking-target-escalation');

/** Same From resolution as due / ED-CEO reminders (SMTP_FROM → SMTP_USER). */
function escalationFromEmail() {
    return String(process.env.EMS_BOOKING_TARGET_ESCALATION_FROM || getSmtpFromEmail() || 'ems@almoayyedcg.com').trim();
}

async function loadRows(year) {
    const pool = await new sql.ConnectionPool(dbConfig).connect();
    try {
        const result = await pool.request().input('year', sql.Int, year).query(`
            WITH Entered AS (
                SELECT LTRIM(RTRIM(Division)) AS Division,
                    SUM(ISNULL(TargetValue,0)) AS Booking,
                    SUM(CAST(ISNULL(TargetValue,0) AS DECIMAL(18,4))
                        * CAST(ISNULL(GrossProfitTarget,0) AS DECIMAL(18,4))/100.0) AS Gp
                FROM dbo.SalesTargets WHERE FinancialYear=@year
                GROUP BY LTRIM(RTRIM(Division))
            )
            SELECT LTRIM(RTRIM(C.Division)) AS Division,
                C.Revenue AS BookingTarget,C.GpValue AS GpTarget,
                CAST(ISNULL(T.Booking,0) AS DECIMAL(18,2)) AS SetBookingTarget,
                CAST(ISNULL(T.Gp,0) AS DECIMAL(18,2)) AS SetGpTarget,
                CAST(C.Revenue-ISNULL(T.Booking,0) AS DECIMAL(18,2)) AS Shortfall
            FROM dbo.commit_Target C
            LEFT JOIN Entered T ON T.Division = CASE
                WHEN LTRIM(RTRIM(C.Division))=N'Almoayyed Watersolution' THEN N'Almoayyed Water Solutions'
                ELSE LTRIM(RTRIM(C.Division)) END
            WHERE C.[Year]=@year AND C.Revenue>ISNULL(T.Booking,0)
              -- Direct Sales has multiple new divisions; preserve the reviewed exclusion
              -- until its annual commitment is explicitly mapped.
              AND LTRIM(RTRIM(C.Division))<>N'Direct Sales'
            ORDER BY C.Revenue DESC,C.Division;
        `);
        return result.recordset;
    } finally { await pool.close(); }
}

function formatAmount(value) {
    return Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildMessage(rows, year, fromEmail = escalationFromEmail()) {
    const headers = ['Sl.No', 'Division name', 'Division Booking Target', 'Division GP Target', 'Set Booking Target', 'Set GP Target', 'Remarks'];
    const values = rows.map((r, i) => [i + 1, r.Division,
        formatAmount(r.BookingTarget), formatAmount(r.GpTarget), formatAmount(r.SetBookingTarget),
        formatAmount(r.SetGpTarget), `Booking shortfall: ${formatAmount(r.Shortfall)}`]);
    const th = headers.map(h => `<th style="padding:8px;border:1px solid #b8c5d6;background:#285a96;color:#fff;text-align:left">${escapeHtml(h)}</th>`).join('');
    const body = values.map(cells => `<tr>${cells.map((v,i) => `<td style="padding:7px;border:1px solid #b8c5d6;text-align:${i>=2&&i<=5?'right':'left'}">${escapeHtml(v)}</td>`).join('')}</tr>`).join('');
    return {
        from: fromEmail, to: TO, bcc: BCC, subject: SUBJECT,
        text: [NOTICE,'','Dear Sir/Madam,','',INTRO,'',`Financial Year: ${year} | All amounts in BHD`,'',headers.join(' | '),...values.map(c=>c.join(' | '))].join('\n'),
        html: `<html><body style="font-family:Arial,sans-serif;font-size:13px;color:#222"><p><strong>${escapeHtml(NOTICE)}</strong></p><p>Dear Sir/Madam,</p><p>${escapeHtml(INTRO)}</p><p><strong>Financial Year: ${year} | All amounts in BHD</strong></p><table style="border-collapse:collapse;font-size:12px"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></body></html>`
    };
}

async function runBookingTargetEscalation({send=true,now=new Date(),force=false}={}) {
    const date=ymdInTimeZone(now,'Asia/Bahrain');
    const year=Number(date.slice(0,4));
    const from=escalationFromEmail();
    const context={date,year,from,to:TO,bcc:BCC,subject:SUBJECT};
    /* Same cadence as due notifications (7:00 via daily scheduler), but Fri/Sat off. */
    if(!force && !isWorkingDayYmd(date)){
        const result={status:'weekly-off',date,year,to:TO,bcc:BCC};
        console.log(`[booking-target-escalation] Skipped for ${date} — weekly off day (Fri/Sat by default).`);
        console.log(JSON.stringify(result));
        return result;
    }
    fs.mkdirSync(outDir,{recursive:true});
    const receiptPath=path.join(outDir,`${date}-sent.json`);
    let pool,claim,mailInfo,divisions=0,smtpStarted=false;
    try {
        if(send){
            pool=await new sql.ConnectionPool(dbConfig).connect();
            await ensureBookingTargetEscalationLog(pool);
            claim=await claimBookingTargetRun(pool,context);
            if(!claim.claimed){
                const result={status:'already-recorded',logId:claim.id,deliveryStatus:claim.status,date};
                console.log(JSON.stringify(result));return result;
            }
            if(fs.existsSync(receiptPath)){
                const previous=JSON.parse(fs.readFileSync(receiptPath,'utf8'));
                await finishBookingTargetRun(pool,claim.id,{...previous,status:'Sent',error:'Imported existing send receipt; no new email sent.'});
                const result={status:'already-sent',logId:claim.id,receiptPath};
                console.log(JSON.stringify(result));return result;
            }
        }
        const rows=await loadRows(year);divisions=rows.length;
        const message=buildMessage(rows,year,from);
        fs.writeFileSync(path.join(outDir,`${date}-draft.html`),message.html);
        fs.writeFileSync(path.join(outDir,`${date}-draft.json`),JSON.stringify({date,year,rows,...message},null,2));
        if(!send||!rows.length){
            if(send)await finishBookingTargetRun(pool,claim.id,{status:'NoShortfalls',divisions:0});
            const result={status:send?'no-booking-shortfalls':'draft',year,divisions,to:TO,bcc:BCC,cc:[],from};
            console.log(JSON.stringify(result));return result;
        }
        /* Same shared Office 365 SMTP path as due / ED-CEO notifications (not Outlook COM). */
        smtpStarted=true;
        mailInfo=await sendEnquiryNotificationViaSmtp({
            fromEmail:from,
            to:TO,
            cc:'',
            bcc:BCC,
            subject:SUBJECT,
            html:message.html,
            skipRecipientExclusions:true,
            transportExtra:{socketTimeout:60000},
        });
        const receipt={status:'sent',sentAt:new Date().toISOString(),year,divisions,from,to:TO,bcc:BCC,cc:[],
            messageId:mailInfo.messageId,accepted:mailInfo.accepted,rejected:mailInfo.rejected,response:mailInfo.response};
        await finishBookingTargetRun(pool,claim.id,{...receipt,status:mailInfo.rejected?.length?'Partial':'Sent'});
        fs.writeFileSync(receiptPath,JSON.stringify(receipt,null,2));
        console.log(`[booking-target-escalation] Sent via SMTP to ${TO}`+(BCC?` (bcc: ${BCC})`:'')+` (${divisions} division(s))`);
        console.log(JSON.stringify({...receipt,logId:claim.id}));
        if(mailInfo.rejected?.length)throw new Error('Booking escalation recipient rejected: '+mailInfo.rejected.join(', '));
        return receipt;
    }catch(error){
        if(pool&&claim?.claimed){
            const status=mailInfo?(mailInfo.rejected?.length?'Partial':'Sent'):smtpStarted?'Uncertain':'Failed';
            await finishBookingTargetRun(pool,claim.id,{status,divisions,
                messageId:mailInfo?.messageId,accepted:mailInfo?.accepted,rejected:mailInfo?.rejected,
                response:mailInfo?.response,error:error.message}).catch(logError=>console.error('[booking-target-escalation] SQL log update failed:',logError.message));
        }
        throw error;
    }finally{if(pool)await pool.close();}
}

if(require.main===module){
    runBookingTargetEscalation({
        send:process.argv.includes('--send'),
        force:process.argv.includes('--force'),
    }).catch(error=>{console.error(error.message);process.exitCode=1;});
}
module.exports={buildMessage,loadRows,runBookingTargetEscalation};
