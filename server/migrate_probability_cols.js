
const { sql, connectDB } = require('./dbConfig');

const addColumns = async () => {
    try {
        await connectDB();

        const alterQueries = [
            `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='EnquiryMaster' AND COLUMN_NAME='ProbabilityOption')
             ALTER TABLE EnquiryMaster ADD ProbabilityOption VARCHAR(50);`,

            `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='EnquiryMaster' AND COLUMN_NAME='Probability')
             ALTER TABLE EnquiryMaster ADD Probability INT;`, // 0-100 logic

            `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='EnquiryMaster' AND COLUMN_NAME='AACQuotedContractor')
             ALTER TABLE EnquiryMaster ADD AACQuotedContractor VARCHAR(255);`,

            `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='EnquiryMaster' AND COLUMN_NAME='CustomerPreferredPrice')
             ALTER TABLE EnquiryMaster ADD CustomerPreferredPrice VARCHAR(50);`,

            `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='EnquiryMaster' AND COLUMN_NAME='PreferredPriceOption1')
             ALTER TABLE EnquiryMaster ADD PreferredPriceOption1 VARCHAR(50);`,

            `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='EnquiryMaster' AND COLUMN_NAME='PreferredPriceOption2')
             ALTER TABLE EnquiryMaster ADD PreferredPriceOption2 VARCHAR(50);`,

            `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='EnquiryMaster' AND COLUMN_NAME='PreferredPriceOption3')
             ALTER TABLE EnquiryMaster ADD PreferredPriceOption3 VARCHAR(50);`,

            `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='EnquiryMaster' AND COLUMN_NAME='ExpectedOrderDate')
             ALTER TABLE EnquiryMaster ADD ExpectedOrderDate DATETIME;`,

            `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='EnquiryMaster' AND COLUMN_NAME='ProbabilityRemarks')
             ALTER TABLE EnquiryMaster ADD ProbabilityRemarks NVARCHAR(MAX);`,

            // Won Details
            `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='EnquiryMaster' AND COLUMN_NAME='WonOrderValue')
             ALTER TABLE EnquiryMaster ADD WonOrderValue VARCHAR(50);`,

            `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='EnquiryMaster' AND COLUMN_NAME='WonJobNo')
             ALTER TABLE EnquiryMaster ADD WonJobNo VARCHAR(50);`,

            `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='EnquiryMaster' AND COLUMN_NAME='WonCustomerName')
             ALTER TABLE EnquiryMaster ADD WonCustomerName VARCHAR(255);`,

            `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='EnquiryMaster' AND COLUMN_NAME='WonContactName')
             ALTER TABLE EnquiryMaster ADD WonContactName VARCHAR(255);`,

            `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='EnquiryMaster' AND COLUMN_NAME='WonContactNo')
             ALTER TABLE EnquiryMaster ADD WonContactNo VARCHAR(50);`,

            `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='EnquiryMaster' AND COLUMN_NAME='WonQuoteRef')
             ALTER TABLE EnquiryMaster ADD WonQuoteRef NVARCHAR(100);`,

            `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='EnquiryMaster' AND COLUMN_NAME='WonOption')
             ALTER TABLE EnquiryMaster ADD WonOption NVARCHAR(255);`,

            // Lost Details
            `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='EnquiryMaster' AND COLUMN_NAME='LostCompetitor')
             ALTER TABLE EnquiryMaster ADD LostCompetitor VARCHAR(255);`,

            `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='EnquiryMaster' AND COLUMN_NAME='LostReason')
             ALTER TABLE EnquiryMaster ADD LostReason VARCHAR(255);`,

            `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='EnquiryMaster' AND COLUMN_NAME='LostCompetitorPrice')
             ALTER TABLE EnquiryMaster ADD LostCompetitorPrice VARCHAR(50);`,

            // Other Dates
            `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='EnquiryMaster' AND COLUMN_NAME='RetenderDate')
             ALTER TABLE EnquiryMaster ADD RetenderDate DATETIME;`,

            `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='EnquiryMaster' AND COLUMN_NAME='OnHoldDate')
             ALTER TABLE EnquiryMaster ADD OnHoldDate DATETIME;`,

            `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='EnquiryMaster' AND COLUMN_NAME='CancelDate')
             ALTER TABLE EnquiryMaster ADD CancelDate DATETIME;`
        ];

        for (let query of alterQueries) {
            await sql.query(query);
            console.log("Executed schema update.");
        }

        console.log('All columns added successfully.');

    } catch (err) {
        console.error('Migration Error:', err);
    } finally {
        process.exit();
    }
};

addColumns();
