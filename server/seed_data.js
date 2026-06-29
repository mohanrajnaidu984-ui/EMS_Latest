const { connectDB, sql } = require('./dbConfig');

async function seedDatabase() {
    try {
        await connectDB();
        console.log('Connected to DB');

        // Seed SourceOfEnquiry
        const sources = ['Email', 'Phone', 'Website', 'Referral', 'Walk-in'];
        for (const source of sources) {
            try {
                await sql.query`INSERT INTO Master_SourceOfEnquiry (SourceName) VALUES (${source})`;
            } catch (e) { /* Ignore duplicates */ }
        }
        console.log('Seeded Master_SourceOfEnquiry');

        // Seed EnquiryType
        const types = ['Budgetary', 'Firm', 'Tender'];
        for (const type of types) {
            try {
                await sql.query`INSERT INTO Master_EnquiryType (TypeName) VALUES (${type})`;
            } catch (e) { /* Ignore duplicates */ }
        }
        console.log('Seeded Master_EnquiryType');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit(0);
    }
}

seedDatabase();
