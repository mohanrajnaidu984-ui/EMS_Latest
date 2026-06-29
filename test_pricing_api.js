const sql = require('mssql');
const { connectDB } = require('./server/dbConfig');
const pricingRouter = require('./server/routes/pricing');
const express = require('express');
const app = express();

async function test() {
    try {
        await connectDB();
        console.log('Connected to DB');
        
        // Mocking Request/Response if needed, or calling the helper directly
        // The helper getEnquiryPricingList is not exported, but we can call the route
        const axios = require('axios');
        // Actually, let's just copy the logic or require it if it were exported.
        // It's not exported. I'll create a temporary test script that imports what it needs.
    } catch (err) {
        console.error(err);
    }
}
