const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function testModel(modelName) {
    console.log(`\n--- Testing Model: ${modelName} ---`);
    try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent("Hello");
        console.log(`✔ Success! Response: ${result.response.text()}`);
        return true;
    } catch (e) {
        console.error(`✘ Failed: ${e.message}`);
        return false;
    }
}

async function runtests() {
    await testModel("gemini-2.0-flash-exp");
    await testModel("gemini-1.5-flash");
    await testModel("gemini-pro");
}

runtests();
