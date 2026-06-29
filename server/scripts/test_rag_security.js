const { search } = require('../services/vectorDb');
const { getEmbedding } = require('../services/openai');

async function runTests() {
    console.log("=== RAG Security Tests ===");

    const query = "What are my recent enquiries?";
    const queryVector = await getEmbedding(query);

    console.log("Mock User 1: Admin");
    const adminFilter = { role: 'Admin' }; // Admin filter logic in vectorDb treats 'Admin' differently or api.js doesn't pass filter
    const adminResults = await search(queryVector, 5, 0.0, null);
    console.log(`Admin found ${adminResults.length} results.\n`);

    console.log("Mock User 2: Civil SE (mohan.naidu@almoayyedcg.com)");
    const civilFilter = {
        role: 'User',
        email: 'mohan.naidu@almoayyedcg.com',
        division: 'Civil Project'
    };
    const civilResults = await search(queryVector, 5, 0.0, civilFilter);
    console.log(`Civil SE found ${civilResults.length} results.`);
    if (civilResults.length > 0) {
        console.log(`Sample source IDs: ${civilResults.map(r => r.payload.source_id).join(', ')}`);
    } else {
        console.log('Ensure ingestion mapping captures mohan correctly.');
    }
    console.log('');

    console.log("Mock User 3: MEP User (someone_else@example.com)");
    const mepFilter = {
        role: 'User',
        email: 'someone_else@example.com',
        division: 'MEP Project'
    };
    const mepResults = await search(queryVector, 5, 0.0, mepFilter);
    console.log(`MEP User found ${mepResults.length} results.`);
    if (mepResults.length > 0) {
        console.log(`Sample source IDs: ${mepResults.map(r => r.payload.source_id).join(', ')}`);
    }

    console.log("\nTests completed.");
}

runTests().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
});
