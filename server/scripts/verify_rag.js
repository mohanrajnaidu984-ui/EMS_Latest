const { getEmbedding } = require('../services/openai');
const { search } = require('../services/vectorDb');
const { runIngestion } = require('../scripts/ingest');
require('dotenv').config();

async function testRAG() {
    console.log('--- Starting RAG Verification ---');

    // 1. Check Qdrant Connection
    try {
        console.log('Testing Qdrant Connection...');
        // Just try a search with a dummy vector
        const dummyVector = new Array(1536).fill(0.1);
        await search(dummyVector, 1);
        console.log('✔ Qdrant is reachable.');
    } catch (e) {
        console.error('✘ Qdrant connection failed. Is Docker running?');
        console.error(e.message);
        return;
    }

    // 2. Test Ingestion (Small Scale - maybe skip real ingestion if DB huge, but here we can try)
    // We won't run full ingestion here to avoid cost/time, but we assume user runs it.
    // Instead, let's just search for something we know implies data exists.

    // 3. Test Retrieval
    try {
        const query = "test"; // Generic query
        console.log(`Generating embedding for: "${query}"...`);
        const vec = await getEmbedding(query);
        console.log('✔ Embedding generated.');

        console.log('Searching Vector DB...');
        const results = await search(vec, 3);
        console.log(`✔ Found ${results.length} results.`);
        if (results.length > 0) {
            console.log('Sample Result:', results[0].payload.text.substring(0, 50) + '...');
        } else {
            console.warn('! No results found. Have you run ingestion? (node scripts/ingest.js)');
        }

    } catch (e) {
        console.error('✘ Retrieval test failed.');
        console.error(e);
    }

    console.log('--- Verification Complete ---');
}

if (require.main === module) {
    testRAG();
}
