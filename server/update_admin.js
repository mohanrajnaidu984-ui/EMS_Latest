const { connectDB, sql } = require('./dbConfig');

async function run() {
    try {
        await connectDB();
        console.log('Connected to DB');

        const email = 'ranigovardhan@gmail.com';

        // 1. Check if user exists
        const check = await sql.query`SELECT * FROM Master_ConcernedSE WHERE EmailId = ${email}`;

        if (check.recordset.length === 0) {
            console.log(`User ${email} not found in Master_ConcernedSE.`);
            // Optionally insert? No, let's just alert.
            console.log('Inserting user as admin...');
            await sql.query`INSERT INTO Master_ConcernedSE (FullName, EmailId, Roles, Status) VALUES ('Rani Govardhan', ${email}, 'Admin', 'Active')`;
            console.log('User inserted as Admin.');
        } else {
            const user = check.recordset[0];
            console.log(`User found: ${user.FullName} (Roles: ${user.Roles})`);

            if (user.Roles !== 'Admin') {
                console.log('Updating user to Admin role...');
                await sql.query`UPDATE Master_ConcernedSE SET Roles = 'Admin' WHERE EmailId = ${email}`;
                console.log('User updated to Admin.');
            } else {
                console.log('User is already an Admin.');
            }
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

run();
