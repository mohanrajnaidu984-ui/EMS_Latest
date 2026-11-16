const { sql } = require('../dbConfig');
let schemaPromise;
function ensureAddendumSchema() {
    if (!schemaPromise) schemaPromise = sql.query(`
        IF OBJECT_ID('dbo.EnquiryAddendums', 'U') IS NULL
        CREATE TABLE dbo.EnquiryAddendums (
            RequestNo nvarchar(50) NOT NULL,
            AddendumNo int NOT NULL,
            Details nvarchar(max) NOT NULL DEFAULT '',
            CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
            ModifiedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
            CONSTRAINT PK_EnquiryAddendums PRIMARY KEY(RequestNo, AddendumNo)
        );
        IF COL_LENGTH('dbo.Attachments', 'AddendumNo') IS NULL
        ALTER TABLE dbo.Attachments ADD AddendumNo int NULL;
        IF COL_LENGTH('dbo.EnquiryAddendums', 'CreatedByEmail') IS NULL
        ALTER TABLE dbo.EnquiryAddendums ADD CreatedByEmail nvarchar(320) NULL;
        IF COL_LENGTH('dbo.EnquiryAddendums', 'ReceivedDate') IS NULL
        ALTER TABLE dbo.EnquiryAddendums ADD ReceivedDate date NULL;
    `).catch(err => { schemaPromise = null; throw err; });
    return schemaPromise;
}
module.exports = { ensureAddendumSchema };
