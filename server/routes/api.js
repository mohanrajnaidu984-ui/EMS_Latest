const express = require('express');
const router = express.Router();
const { runIngestion } = require('../scripts/ingest');
const { getEmbedding, getChatCompletion } = require('../services/openai');
const { search } = require('../services/vectorDb');

// Ingestion Routes
router.post('/ingest/full', async (req, res) => {
    try {
        // Retrieve secret token if needed, for now open but maybe require header
        const result = await runIngestion(null);
        res.json({ success: true, message: 'Full ingestion completed', result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/ingest/incremental', async (req, res) => {
    try {
        const { since } = req.body; // Expect ISO string
        const result = await runIngestion(since ? new Date(since) : null);
        res.json({ success: true, message: 'Incremental ingestion completed', result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

const { handleLocalQuery } = require('../services/localAi');

// Chat Route
router.post('/chat', async (req, res) => {
    try {
        const { message, user } = req.body;
        if (!message) return res.status(400).json({ error: 'Message is required' });

        console.log('Received chat message:', message, 'User:', user?.email || user?.EmailId);

        // Check for API Key
        if (!process.env.GEMINI_API_KEY) {
            console.warn('GEMINI_API_KEY missing. Switching to Local AI.');
            const localResponse = await handleLocalQuery(message);
            return res.json(localResponse);
        }

        // 1. Generate Embedding for User Query
        console.log('Generating embedding...');
        const queryVector = await getEmbedding(message);

        // 2. Search Vector DB
        console.log('Searching vector DB...');
        let filter = null;
        if (user) {
            const roleString = user.role || user.Roles || '';
            const userRoles = typeof roleString === 'string'
                ? roleString.split(',').map(r => r.trim().toLowerCase())
                : (Array.isArray(roleString) ? roleString.map(r => r.trim().toLowerCase()) : []);
            const isAdmin = userRoles.includes('admin') || userRoles.includes('system');

            if (!isAdmin) {
                filter = {
                    role: 'User',
                    email: (user.email || user.EmailId || '').trim().toLowerCase(),
                    division: (user.DivisionName || '').trim().toLowerCase()
                };
            }
        }

        const searchResults = await search(queryVector, 5, 0.4, filter); // Top 5, 0.4 threshold

        console.log(`Found ${searchResults.length} relevant chunks`);

        if (searchResults.length === 0) {
            return res.json({
                answer: "I don't know. Please check the enquiry details in EMS.",
                sources: []
            });
        }

        // 3. Construct Context
        const context = searchResults.map(r => `[Source: ${r.payload.source_id}]\n${r.payload.text}`).join('\n\n');

        // 4. Send to LLM with Strict System Prompt
        const systemPrompt = `You are an EMS Assistant. Answer the user's question using ONLY the provided context. 
If the answer is not in the context, reply exactly: "I don't know. Please check the enquiry details in EMS."
When referring to specific enquiries, cite the source ID like this: [Enquiry: <RequestNo>].
Do NOT hallucinate. Do NOT use outside knowledge.
        
Context:
${context}`;

        const answer = await getChatCompletion([{ role: 'user', content: message }], systemPrompt);

        // 5. Extract Sources for Metadata
        const sources = searchResults.map(r => ({
            id: r.payload.source_id,
            score: r.score,
            metadata: r.payload.metadata
        }));

        res.json({ answer, sources });

    } catch (error) {
        console.error('Chat API Error:', error);

        // Handle Google Gemini 429 Rate Limiting
        if (error.status === 429 ||
            (error && error.message && (error.message.includes('Too Many Requests') || error.message.includes('quota')))) {
            return res.json({
                answer: "I am currently overloaded (Rate Limit Exceeded). Please try again in 1 minute.",
                sources: []
            });
        }

        res.status(500).json({ error: `Internal Server Error: ${error.message}` });
    }
});

// Sources implementation (Optional: List known sources or similar - for now just return empty or recent)
router.get('/chat/sources', (req, res) => {
    res.json({ message: 'Not implemented yet' });
});

module.exports = router;
