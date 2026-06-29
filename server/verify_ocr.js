const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

async function testOCR() {
    try {
        // Path to the image the user uploaded
        const imagePath = 'C:/Users/Vignesh/.gemini/antigravity/brain/9c1e9acf-c32d-40ce-b05c-e8b59031bf69/uploaded_image_0_1766295238757.png';

        if (!fs.existsSync(imagePath)) {
            console.error('Test image not found at:', imagePath);
            return;
        }

        const form = new FormData();
        form.append('image', fs.createReadStream(imagePath));

        console.log('Sending OCR request...');
        const res = await axios.post('http://localhost:5000/api/extract-contact-ocr', form, {
            headers: {
                ...form.getHeaders()
            }
        });

        console.log('OCR Verification Result:');
        console.log(JSON.stringify(res.data, null, 2));

    } catch (err) {
        if (err.response) {
            console.error('Server Error:', err.response.data);
        } else {
            console.error('Request Error:', err.message);
        }
    }
}

testOCR();
