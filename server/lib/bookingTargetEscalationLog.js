'use strict';
const {sql}=require('../dbConfig');
const CREATE_LOG_SQL=`
IF OBJECT_ID(N'dbo.BookingTargetEscalationLog',N'U') IS NULL
BEGIN
    CREATE TABLE dbo.BookingTargetEscalationLog (
        ID BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        RunDate DATE NOT NULL,
        FinancialYear INT NOT NULL,
        TimeZone NVARCHAR(64) NOT NULL DEFAULT N'Asia/Bahrain',
        TriggeredAtUTC DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
        CompletedAtUTC DATETIME2(3) NULL,
        Status NVARCHAR(32) NOT NULL,
        FromEmail NVARCHAR(320) NOT NULL,
        ToEmail NVARCHAR(320) NOT NULL,
        BccEmail NVARCHAR(320) NOT NULL,
        CcRecipients NVARCHAR(MAX) NOT NULL DEFAULT N'[]',
        Subject NVARCHAR(500) NOT NULL,
        DivisionCount INT NULL,
        MessageId NVARCHAR(500) NULL,
        AcceptedRecipients NVARCHAR(MAX) NULL,
        RejectedRecipients NVARCHAR(MAX) NULL,
        SmtpResponse NVARCHAR(MAX) NULL,
        ErrorMessage NVARCHAR(MAX) NULL,
        ServerName NVARCHAR(256) NOT NULL DEFAULT HOST_NAME(),
        CONSTRAINT UQ_BookingTargetEscalationLog_RunDate UNIQUE(RunDate)
    );
END;`;
async function ensureBookingTargetEscalationLog(pool){await pool.request().query(CREATE_LOG_SQL);}
async function claimBookingTargetRun(pool,context){
    try{
        const r=await pool.request().input('date',sql.Date,context.date).input('year',sql.Int,context.year)
            .input('from',sql.NVarChar(320),context.from).input('to',sql.NVarChar(320),context.to)
            .input('bcc',sql.NVarChar(320),context.bcc).input('subject',sql.NVarChar(500),context.subject)
            .query(`INSERT INTO dbo.BookingTargetEscalationLog(RunDate,FinancialYear,Status,FromEmail,ToEmail,BccEmail,Subject)
                OUTPUT INSERTED.ID AS id VALUES(@date,@year,N'Running',@from,@to,@bcc,@subject)`);
        return {claimed:true,id:r.recordset[0].id};
    }catch(error){
        if(![2601,2627].includes(error.number))throw error;
        const r=await pool.request().input('date',sql.Date,context.date)
            .query('SELECT ID AS id,Status AS status FROM dbo.BookingTargetEscalationLog WHERE RunDate=@date');
        return {claimed:false,...r.recordset[0]};
    }
}
async function finishBookingTargetRun(pool,id,result){
    await pool.request().input('id',sql.BigInt,id).input('status',sql.NVarChar(32),result.status)
        .input('count',sql.Int,result.divisions??null).input('message',sql.NVarChar(500),result.messageId||null)
        .input('accepted',sql.NVarChar(sql.MAX),JSON.stringify(result.accepted||[]))
        .input('rejected',sql.NVarChar(sql.MAX),JSON.stringify(result.rejected||[]))
        .input('response',sql.NVarChar(sql.MAX),result.response||null)
        .input('error',sql.NVarChar(sql.MAX),result.error||null)
        .input('completed',sql.DateTime2,result.sentAt?new Date(result.sentAt):new Date())
        .query(`UPDATE dbo.BookingTargetEscalationLog SET Status=@status,CompletedAtUTC=@completed,
            DivisionCount=@count,MessageId=@message,AcceptedRecipients=@accepted,RejectedRecipients=@rejected,
            SmtpResponse=@response,ErrorMessage=@error WHERE ID=@id`);
}
module.exports={CREATE_LOG_SQL,ensureBookingTargetEscalationLog,claimBookingTargetRun,finishBookingTargetRun};
