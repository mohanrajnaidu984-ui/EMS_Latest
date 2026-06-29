'use strict';

const { sql } = require('../dbConfig');

const REQUEST_NO_START = 9;

const NUMERIC_REQUEST_NO_FILTER = `RequestNo NOT LIKE '%[^0-9]%'`;

/**
 * Preview next enquiry number (no lock — for form display only).
 */
async function previewNextRequestNo() {
    const result = await sql.query`
        SELECT MAX(CAST(RequestNo AS BIGINT)) AS MaxID
        FROM EnquiryMaster
        WHERE RequestNo NOT LIKE '%[^0-9]%'
    `;
    const maxVal = result.recordset?.[0]?.MaxID;
    const nextId = maxVal != null ? parseInt(maxVal, 10) + 1 : REQUEST_NO_START;
    return String(nextId);
}

/**
 * Allocate the next unique RequestNo inside an open transaction (called on Add Enquiry only).
 */
async function resolveRequestNoForCreate(transaction) {
    const request = new sql.Request(transaction);
    const maxResult = await request.query(`
        SELECT MAX(CAST(RequestNo AS BIGINT)) AS MaxID
        FROM EnquiryMaster WITH (TABLOCKX, HOLDLOCK)
        WHERE ${NUMERIC_REQUEST_NO_FILTER}
    `);
    const maxVal = maxResult.recordset?.[0]?.MaxID;
    const nextFromMax = maxVal != null ? parseInt(maxVal, 10) + 1 : REQUEST_NO_START;
    return String(nextFromMax);
}

module.exports = { previewNextRequestNo, resolveRequestNoForCreate, REQUEST_NO_START };
