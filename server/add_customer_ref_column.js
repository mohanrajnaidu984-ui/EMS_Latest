const { sql, connectDB } = require('./dbConfig');

const addColumn = async () => {
    try {
        await connectDB();
        await sql.query`ALTER TABLE EnquiryMaster ADD CustomerRefNo NVARCHAR(255)`;
        console.log("Column 'CustomerRefNo' added successfully.");
    } catch (err) {
        if (err.message.includes("Column names in each table must be unique")) {
            console.log("Column 'CustomerRefNo' already exists.");
        } else {
            console.error("Error adding column:", err);
        }
    }
};

addColumn();
