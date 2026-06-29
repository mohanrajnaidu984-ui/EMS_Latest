const { connectDB, sql } = require('./dbConfig');

const createTable = async () => {
    try {
        await connectDB();
        console.log('Connected to DB');

        const checkTable = await sql.query`SELECT * FROM sysobjects WHERE name='Notifications' AND xtype='U'`;

        if (checkTable.recordset.length > 0) {
            console.log('Notifications table already exists.');
        } else {
            await sql.query`
                CREATE TABLE Notifications (
                    ID INT IDENTITY(1,1) PRIMARY KEY,
                    UserID INT NOT NULL,
                    Type NVARCHAR(50) NOT NULL,
                    Message NVARCHAR(MAX) NOT NULL,
                    LinkID NVARCHAR(255),
                    IsRead BIT DEFAULT 0,
                    IsAcknowledged BIT NOT NULL DEFAULT 0,
                    AcknowledgedAt DATETIME NULL,
                    CreatedAt DATETIME DEFAULT GETDATE(),
                    CreatedBy NVARCHAR(255)
                )
            `;
            console.log('Notifications table created.');
        }
        process.exit(0);

    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
};

createTable();
