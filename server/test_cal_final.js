const request = require('supertest');
const express = require('express');
const dashboardRoutes = require('./routes/dashboard');
const { connectDB } = require('./dbConfig');

const app = express();
app.use(express.json());
// Mock checkUserRole middleware
app.use((req, res, next) => {
    req.user = { id: 1, role: 'Admin', DivisionName: 'All' };
    next();
});
app.use('/api/dashboard', dashboardRoutes);

async function testCal() {
    await connectDB();
    const res = await request(app).get('/api/dashboard/calendar?month=2&year=2026&division=All');
    console.log(res.body);
    process.exit(0);
}
testCal();
