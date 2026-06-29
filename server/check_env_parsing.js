require('dotenv').config();
console.log('DB_PASSWORD length:', process.env.DB_PASSWORD ? process.env.DB_PASSWORD.length : 0);
console.log('DB_PASSWORD value:', process.env.DB_PASSWORD);
