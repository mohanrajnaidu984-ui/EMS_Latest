const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const deployDir = path.join(rootDir, 'deployment_package');
const frontendDir = path.join(deployDir, 'frontend');
const backendDir = path.join(deployDir, 'backend');

console.log('--- Starting Deployment Preparation ---');

// 1. Clean Deployment Directory
if (fs.existsSync(deployDir)) {
    console.log('Cleaning existing deployment directory...');
    fs.rmSync(deployDir, { recursive: true, force: true });
}
fs.mkdirSync(deployDir);
fs.mkdirSync(frontendDir);
fs.mkdirSync(backendDir);

// 2. Build Frontend
console.log('Building Frontend...');
try {
    execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });
} catch (err) {
    console.error('Frontend build failed!');
    process.exit(1);
}

// 3. Copy Frontend Files
console.log('Copying Frontend files...');
const distDir = path.join(rootDir, 'dist');
fs.cpSync(distDir, frontendDir, { recursive: true });
// web.config is already in public, so it should be in dist now. 
// If not, we copy it manually just in case.
const webConfigSrc = path.join(rootDir, 'public', 'web.config');
const webConfigDest = path.join(frontendDir, 'web.config');
if (fs.existsSync(webConfigSrc)) {
    fs.copyFileSync(webConfigSrc, webConfigDest);
}

// 4. Copy Backend Files
console.log('Copying Backend files...');
const serverDir = path.join(rootDir, 'server');
// Exclude node_modules and other unnecessary files
const exclude = ['node_modules', '.env', 'uploads'];
// Note: We exclude .env because prod should have its own. 
// We exclude uploads because it's data.

fs.readdirSync(serverDir).forEach(file => {
    if (!exclude.includes(file)) {
        fs.cpSync(path.join(serverDir, file), path.join(backendDir, file), { recursive: true });
    }
});

// 5. Create Readme
const readmeContent = `
# Deployment Instructions

1. **Frontend**: Copy contents of 'frontend' to C:\\inetpub\\wwwroot\\EMS_Frontend
2. **Backend**: Copy contents of 'backend' to C:\\inetpub\\wwwroot\\EMS_Backend
3. **Database**: Run 'EMS_DB.sql' (found in root) on your SQL Server.
4. **Env**: Create a .env file in EMS_Backend with your production DB credentials.
5. **IIS**: Point a Site to EMS_Frontend.
6. **Node**: Install Node.js, run 'npm install' in EMS_Backend, and start with 'pm2 start index.js'.
`;
fs.writeFileSync(path.join(deployDir, 'README_DEPLOY.txt'), readmeContent);

console.log('--- Deployment Package Ready at: ' + deployDir + ' ---');
