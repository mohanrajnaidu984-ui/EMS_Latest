const https = require('https');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const key = process.env.GEMINI_API_KEY;
const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;

console.log('Fetching models from:', url.replace(key, 'HIDDEN'));

const fs = require('fs');

https.get(url, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            if (json.models) {
                const lines = json.models.map(m => `${m.name} [${m.supportedGenerationMethods.join(', ')}]`);
                fs.writeFileSync(path.join(__dirname, 'models_full.log'), lines.join('\n'));
                console.log('Saved models to models_full.log');
            } else {
                console.log('No models found:', json);
            }
        } catch (e) {
            console.error('Error:', e);
        }
    });
}).on('error', err => {
    console.error('Network Error:', err.message);
});
