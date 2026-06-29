const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Use 'text-embedding-004' for embeddings (768 dimensions usually, but check model)
const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
const chatModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Fast and cheap

async function getEmbedding(text) {
    if (!text) return null;
    try {
        const result = await embeddingModel.embedContent(text.replace(/\n/g, ' '));
        return result.embedding.values;
    } catch (error) {
        console.error('Error fetching Gemini embedding:', error);
        throw error;
    }
}

// Batch embedding (Sequential for Gemini as batch API might differ or hit limits)
async function getEmbeddings(texts) {
    try {
        // Parallelize requests (Gemini limits are generous on paid/tier 1, strict on free)
        // Adding a small delay or sequential if needed, but Promise.all is okay for small batches
        const promises = texts.map(t => getEmbedding(t));
        return await Promise.all(promises);
    } catch (error) {
        console.error('Error fetching embeddings batch:', error);
        throw error;
    }
}

async function getChatCompletion(messages, systemPrompt) {
    try {
        // Gemini handles system prompts via 'systemInstruction' in newer SDKs, 
        // or we just prepend it to the history. 
        // 1.5-flash supports systemInstruction.

        // Use gemini-2.0-flash-exp (Available to user)
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

        // Convert OpenAI-style "messages" to Gemini "contents"
        const history = messages.slice(0, -1).map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));

        // Prepend System Prompt to the start of history/context if possible, 
        // or just add it to the final message. 
        // Best practice for gemini-pro: Add it as the first User part.

        let instructions = "";
        if (systemPrompt) {
            instructions = `System Instructions: ${systemPrompt}\n\n`;
        }

        const lastMessage = messages[messages.length - 1].content;
        const finalPrompt = instructions + lastMessage;

        const chat = model.startChat({
            history: history,
            generationConfig: {
                maxOutputTokens: 1000,
                temperature: 0,
            },
        });

        const result = await chat.sendMessage(finalPrompt);
        return result.response.text();

    } catch (error) {
        console.error('Error fetching Gemini completion:', error);
        throw error;
    }
}

module.exports = {
    getEmbedding,
    getEmbeddings,
    getChatCompletion
};
