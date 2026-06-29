const { sql, connectDB } = require('./dbConfig');
const bcrypt = require('bcryptjs');

const seedData = async () => {
    try {
        await connectDB();

        const userEmail = 'vigneshgovardhan5163@gmail.com';
        const passwordHash = await bcrypt.hash('password123', 10);

        console.log('Seeding MasterEnquiryItems...');

        // Check if empty
        const itemsCount = await sql.query`SELECT COUNT(*) as count FROM MasterEnquiryItems`;
        console.log('Current MasterEnquiryItems count:', itemsCount.recordset[0].count);

        // Force insert for debugging
        if (true || itemsCount.recordset[0].count === 0) {
            // Check if items exist by name to avoid duplicates
            const existing = await sql.query`SELECT ItemName FROM MasterEnquiryItems`;
            const existingNames = existing.recordset.map(i => i.ItemName);

            if (!existingNames.includes('Electrical')) {
                await sql.query`INSERT INTO MasterEnquiryItems (ItemName, CommonMailIds, CCMailIds) VALUES ('Electrical', ${userEmail}, ${userEmail})`;
                console.log('Inserted Electrical');
            }
            if (!existingNames.includes('Mechanical')) {
                await sql.query`INSERT INTO MasterEnquiryItems (ItemName, CommonMailIds, CCMailIds) VALUES ('Mechanical', ${userEmail}, ${userEmail})`;
                console.log('Inserted Mechanical');
            }
        }

        console.log('Seeding Users...');
        const usersCount = await sql.query`SELECT COUNT(*) as count FROM Users`;
        console.log('Current Users count:', usersCount.recordset[0].count);

        if (true || usersCount.recordset[0].count === 0) {
            const existingUsers = await sql.query`SELECT Email FROM Users`;
            const existingEmails = existingUsers.recordset.map(u => u.Email);

            if (!existingEmails.includes(userEmail)) {
                await sql.query`INSERT INTO Users (FullName, Email, LoginPassword, Roles, Status) VALUES 
                    ('SE1 - John Doe', ${userEmail}, ${passwordHash}, 'Enquiry', 'Active')`;
                console.log('Inserted User SE1');
            }
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

seedData();
