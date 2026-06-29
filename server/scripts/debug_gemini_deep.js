const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function test(modelName) {
    console.log(`\nTesting ${modelName}...`);
    try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent("Hello there");
        const response = await result.response;
        console.log(`✔ SUCCESS provided by ${modelName}:`, response.text());
    } catch (error) {
        console.error(`✘ ERROR with ${modelName}:`, error.message);
        // console.error(JSON.stringify(error, null, 2));
    }
}

async function run() {
    await test("gemini-pro");
    await test("gemini-1.5-flash");
    await test("gemini-1.0-pro");
    await test("gemini-1.5-flash-latest");
}

run();
