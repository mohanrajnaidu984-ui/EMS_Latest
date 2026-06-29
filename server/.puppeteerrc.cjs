const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Changes the cache location for Puppeteer to be local to the server directory.
  // This ensures the Chrome browser is installed directly inside the app folder
  // and has correct permissions under IIS service accounts.
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
