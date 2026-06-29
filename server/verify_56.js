
const http = require('http');

http.get('http://localhost:5001/api/enquiries/56', (resp) => {
    let data = '';

    resp.on('data', (chunk) => {
        data += chunk;
    });

    resp.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log('Items for 56:', JSON.stringify(json.SelectedEnquiryFor, null, 2));
        } catch (e) {
            console.error(e.message);
        }
    });

}).on("error", (err) => {
    console.log("Error: " + err.message);
});
