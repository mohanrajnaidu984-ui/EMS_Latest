
const mssql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function debug() {
    try {
        const pool = await mssql.connect(config);
        const reqNo = '51';

        const jobsRes = await pool.request().query(`SELECT ID, ParentID, ItemName FROM EnquiryFor WHERE RequestNo = '${reqNo}'`);
        const jobs = jobsRes.recordset;

        const normalize = str => str.toLowerCase().replace(/[^a-z0-9]/g, '');

        const rootJob = jobs.find(j => !j.ParentID || j.ParentID == '0' || j.ParentID == 0);
        const internalCustomer = rootJob ? rootJob.ItemName.trim() : 'Internal';
        const internalCustomerNorm = normalize(internalCustomer);
        const jobNameSetNorm = new Set(jobs.map(j => normalize(j.ItemName)));

        console.log('Internal Customer:', internalCustomer);
        console.log('Internal Customer Norm:', internalCustomerNorm);
        console.log('Job Name Set Norm:', Array.from(jobNameSetNorm));

        // Let's see if "Electrical" matches
        const testName = "Electrical";
        const testNorm = normalize(testName);
        console.log(`Testing "${testName}" -> "${testNorm}"`);
        console.log(`Match?`, jobNameSetNorm.has(testNorm));

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

debug();
