const fs = require('fs');

fs.readFile('debug_out_lines.txt', 'utf8', (err, data) => {
    if (err) return console.error(err);
    console.log(data);
});
