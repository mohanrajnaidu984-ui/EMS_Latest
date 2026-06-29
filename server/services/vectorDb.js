const fs = require('fs');
const path = require('path');

const VECTOR_FILE = path.join(__dirname, '../data/ems_vectors.json');
const DATA_DIR = path.join(__dirname, '../data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    try {
        fs.mkdirSync(DATA_DIR);
    } catch (e) {
        console.error('Error creating data dir:', e);
    }
}

// In-memory store
let vectorStore = [];

// Load data on startup
function loadVectors() {
    if (fs.existsSync(VECTOR_FILE)) {
        try {
            const raw = fs.readFileSync(VECTOR_FILE, 'utf-8');
            vectorStore = JSON.parse(raw);
            console.log(`Loaded ${vectorStore.length} vectors from local file.`);
        } catch (e) {
            console.error('Error loading vector file:', e);
            vectorStore = [];
        }
    } else {
        console.log('No local vector file found. Starting empty.');
        vectorStore = [];
    }
}

// Save data to disk
function saveVectors() {
    try {
        fs.writeFileSync(VECTOR_FILE, JSON.stringify(vectorStore, null, 2));
        console.log(`Saved ${vectorStore.length} vectors to local file.`);
    } catch (e) {
        console.error('Error saving vector file:', e);
    }
}

// Compute Cosine Similarity
function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Interface functions matching previous Qdrant implementation

async function initCollection() {
    console.log('Initializing Local Vector Store...');
    loadVectors();
    return true;
}

async function upsertPoints(points) {
    // points: [{ id, vector, payload }]

    // Remove existing points with same ID to allow updates
    const incomingIds = new Set(points.map(p => p.id));
    vectorStore = vectorStore.filter(p => !incomingIds.has(p.id));

    // Add new points
    vectorStore.push(...points);

    // Persist
    saveVectors();
    return true;
}

async function search(queryVector, limit = 5, scoreThreshold = 0.4, filter = null) {
    if (vectorStore.length === 0) loadVectors();

    let filteredStore = vectorStore;

    if (filter) {
        filteredStore = vectorStore.filter(point => {
            const meta = point.payload.metadata;

            // Check if user is creator
            const isCreator = meta.created_by && meta.created_by === filter.email;

            // Check if user is concerned SE
            const isConcerned = meta.concerned_ses && Array.isArray(meta.concerned_ses) &&
                meta.concerned_ses.some(se => se.trim().toLowerCase() === filter.email.toLowerCase());

            // Check if user's division is in enquiry's divisions
            const isDivision = meta.divisions && Array.isArray(meta.divisions) &&
                meta.divisions.some(div => div.trim().toLowerCase() === filter.division.toLowerCase());

            return isCreator || isConcerned || isDivision;
        });
    }

    // Calculate scores
    const scored = filteredStore.map(point => ({
        ...point,
        score: cosineSimilarity(queryVector, point.vector)
    }));

    // Filter and Sort
    const results = scored
        .filter(p => p.score >= scoreThreshold)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

    return results;
}

// Initialize on module load
loadVectors();

module.exports = {
    initCollection,
    upsertPoints,
    search
};
