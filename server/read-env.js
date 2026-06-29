const fs = require('fs');
try {
    const content = fs.readFileSync('.env', 'utf8');
    console.log('--- START ENV ---');
    console.log(content);
    console.log('--- END ENV ---');
} catch (err) {
    console.error(err);
}
