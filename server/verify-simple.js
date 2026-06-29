const { connectDB, sql } = require('./dbConfig');

const runVerification = async () => {
    try {
        console.log('--- START VERIFICATION 2 ---');
        await connectDB();
        console.log('DB Connected');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

runVerification();
