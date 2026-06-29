const { getEmbedding } = require('../services/openai');
const { initCollection, upsertPoints, search } = require('../services/vectorDb');
const { v4: uuidv4 } = require('uuid');

async function testStandalone() {
    console.log('--- Starting Standalone RAG Test ---');

    // 1. Initialize Vector Store
    await initCollection();

    // 2. Create Dummy Data
    const dummyText = "The Enquiry 999 is for Project Alpha with status Closed. Notes: Successfully delivered.";
    console.log(`Generating embedding for: "${dummyText}"...`);

    try {
        const embedding = await getEmbedding(dummyText);

        if (!embedding) {
            console.error('✘ Failed to get embedding from OpenAI.');
            return;
        }
        console.log('✔ Embedding generated successfully.');

        // 3. Upsert
        const point = {
            id: uuidv4(),
            vector: embedding,
            payload: {
                source_id: '999',
                text: dummyText,
                metadata: { project: 'Alpha' }
            }
        };

        await upsertPoints([point]);
        console.log('✔ Dummy point upserted to local store.');

        // 4. Search
        const query = "Project Alpha status";
        console.log(`Searching for: "${query}"...`);
        const queryVec = await getEmbedding(query);
        const results = await search(queryVec);

        console.log(`Found ${results.length} results.`);
        if (results.length > 0 && results[0].payload.source_id === '999') {
            console.log('✔ SUCCESS: Retrieved correct document.');
            console.log('Snippet:', results[0].payload.text);
        } else {
            console.error('✘ FAILURE: Did not retrieve the dummy document.');
        }

    } catch (e) {
        console.error('✘ Test Failed:', e.message);
    }
}

testStandalone();
