const { getEmbedding, getChatCompletion } = require('../services/openai');

async function testGemini() {
    console.log('--- Testing Gemini Integration ---');

    // 1. Test Embedding
    try {
        console.log('Testing Embedding...');
        const vec = await getEmbedding("Hello world");
        console.log('✔ Embedding success. Length:', vec.length);
    } catch (e) {
        console.error('✘ Embedding failed:', e);
    }

    // 2. Test Chat
    try {
        console.log('Testing Chat...');
        const systemPrompt = "You are a helpful assistant.";
        const messages = [{ role: 'user', content: "Hello, who are you?" }];

        const answer = await getChatCompletion(messages, systemPrompt);
        console.log('✔ Chat success. Answer:', answer);
    } catch (e) {
        console.error('✘ Chat failed:', e);
    }
}

testGemini();
