const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');
db.all('SELECT * FROM PricingOptions WHERE EnquiryID = 42', [], (err, rows) => {
    if (err) {
        console.error(err);
        return;
    }
    console.log('OPTIONS:');
    console.log(JSON.stringify(rows, null, 2));

    db.all('SELECT * FROM PricingValues WHERE EnquiryID = 42', [], (err, vrows) => {
        if (err) {
            console.error(err);
            return;
        }
        console.log('VALUES:');
        console.log(JSON.stringify(vrows, null, 2));
        db.close();
    });
});
