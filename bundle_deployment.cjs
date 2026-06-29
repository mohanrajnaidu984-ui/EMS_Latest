const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = __dirname;
const DEPLOY_DIR = path.join(PROJECT_ROOT, 'deployment_package');
const CLIENT_DIR = path.join(DEPLOY_DIR, 'client');
const SERVER_DIR = path.join(DEPLOY_DIR, 'server');
const DB_DIR = path.join(DEPLOY_DIR, 'database');

console.log('========================================================');
console.log('      Starting Complete IIS Deployment Package Builder  ');
console.log('========================================================');

// 1. Ensure the root deployment package directory exists
if (!fs.existsSync(DEPLOY_DIR)) {
    fs.mkdirSync(DEPLOY_DIR, { recursive: true });
}

// 2. Clean client and server target directories to start fresh
console.log('\n🧹 Cleaning previous client and server bundle directories...');
if (fs.existsSync(CLIENT_DIR)) {
    fs.rmSync(CLIENT_DIR, { recursive: true, force: true });
}
if (fs.existsSync(SERVER_DIR)) {
    fs.rmSync(SERVER_DIR, { recursive: true, force: true });
}
fs.mkdirSync(CLIENT_DIR, { recursive: true });
fs.mkdirSync(SERVER_DIR, { recursive: true });

// 3. Compile frontend React app
console.log('\n📦 Building Frontend React Application...');
try {
    execSync('npm run build', { cwd: PROJECT_ROOT, stdio: 'inherit' });
    console.log('✅ Frontend compiled successfully.');
} catch (err) {
    console.error('❌ Frontend build failed:', err.message);
    process.exit(1);
}

// 4. Copy Frontend static files to client/
console.log('\n📂 Copying Frontend distribution files...');
const distDir = path.join(PROJECT_ROOT, 'dist');
if (fs.existsSync(distDir)) {
    fs.cpSync(distDir, CLIENT_DIR, { recursive: true });
    console.log('✅ Frontend assets copied to deployment_package/client/.');
} else {
    console.error('❌ Dist directory not found! Ensure build succeeded.');
    process.exit(1);
}

// 5. Copy Backend server files
console.log('\n📂 Copying Backend Server API files...');
const sourceServerDir = path.join(PROJECT_ROOT, 'server');
fs.cpSync(sourceServerDir, SERVER_DIR, {
    recursive: true,
    filter: (src) => {
        const basename = path.basename(src);
        // Exclude node_modules, local secrets, logs, and massive temp dumps
        if (basename === 'node_modules') return false;
        if (src.includes('node_modules')) return false;
        if (basename === '.env') return false;
        if (basename.endsWith('.log')) return false;
        // Keep files, directories, and configuration assets
        return true;
    }
});
console.log('✅ Backend server files copied to deployment_package/server/.');

// 6. Create clean .env.example template for the user
console.log('\n📝 Generating .env.example configuration file...');
const envExampleContent = `# EMS Backend Environment Variables Configuration Template
# Duplicate this file as '.env' and fill in your actual production values.

# Database Connectivity
DB_USER=your_db_username
DB_PASSWORD="your_db_password"
DB_SERVER=your_mssql_server_ip
DB_DATABASE=EMS_DB

# Express Application Configuration
PORT=5002

# SMTP Configuration for Internal System Notifications
SMTP_HOST=your_smtp_server_address
SMTP_PORT=25
SMTP_USER=your_notification_email@domain.com
SMTP_PASS="your_smtp_password"
SMTP_ENCRYPTION=STARTTLS
SMTP_TEST_TO=your_admin_email@domain.com
SMTP_IPV4=1

# Enquiry Module: Attachment Storage Root (Network Shared UNC Path is supported)
# Ensure the Node process / IIS App Pool user has read/write permissions to this path
ENQUIRY_ATTACHMENTS_ROOT=\\\\your_file_server\\ems_attachments

# Notification settings
EMS_ENQUIRY_NOTIFY_VIA_SMTP=1
EMS_ENQUIRY_NOTIFY_SMTP_FALLBACK=1

# Quote PDF Generation (Puppeteer Configuration)
QUOTE_PDF_ASSET_ORIGIN=http://127.0.0.1:5002
PUPPETEER_EXECUTABLE_PATH=C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe
PUPPETEER_LAUNCH_TIMEOUT_MS=120000
QUOTE_PDF_PAGE_TIMEOUT_MS=120000
QUOTE_PDF_SINGLE_PROCESS=1
`;
fs.writeFileSync(path.join(SERVER_DIR, '.env.example'), envExampleContent);
console.log('✅ Generated server/.env.example template.');

// 7. Ensure Database setup folder exists and has SQL schemas
console.log('\n🗄️ Packaging Database schemas...');
if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
}

// Copy primary SQL script files from root to deployment database folder
const rootSqlFiles = ['EMS_DB.sql', 'EMS_DB_FULL_STRUCTURE.sql'];
rootSqlFiles.forEach(file => {
    const srcPath = path.join(PROJECT_ROOT, file);
    if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, path.join(DB_DIR, file));
        console.log(`✅ Copied database schema: ${file}`);
    }
});

// Copy database directory contents (except JS run scripts)
const sourceDbDir = path.join(PROJECT_ROOT, 'database');
if (fs.existsSync(sourceDbDir)) {
    fs.cpSync(sourceDbDir, DB_DIR, {
        recursive: true,
        filter: (src) => {
            const basename = path.basename(src);
            return !basename.endsWith('.js') && !basename.endsWith('.cjs');
        }
    });
    console.log('✅ Additional SQL scripts copied to database/.');
}

// 8. Generate automated Batch Helpers for easy environment setup and manual startup
console.log('\n⚙️ Generating helper scripts...');
const startServerBat = `@echo off
title EMS API Server Startup
cd server
echo ===================================================
echo   EMS Backend Express API Server Manual Startup    
echo ===================================================
echo Checking configuration...
if not exist .env (
    echo [WARNING] No '.env' file found! 
    echo Please configure your database credentials in 'server/.env' first.
    echo Creating temporary '.env' from '.env.example'...
    copy .env.example .env
)
echo Starting Express Server on port 5002...
node index.js
pause
`;
fs.writeFileSync(path.join(DEPLOY_DIR, 'start_server.bat'), startServerBat);

const installDepsBat = `@echo off
title EMS Production Dependencies Installer
cd server
echo ===================================================
echo   EMS Backend Node.js Production Dependencies      
echo ===================================================
echo Installing production node_modules...
npm install --production
echo Done!
pause
`;
fs.writeFileSync(path.join(DEPLOY_DIR, 'install_dependencies.bat'), installDepsBat);
console.log('✅ Created manual utility scripts start_server.bat and install_dependencies.bat.');

console.log('\n========================================================');
console.log('🎉 SUCCESS: Complete IIS Deployment Package created at:');
console.log(`📂 ${DEPLOY_DIR}`);
console.log('========================================================\n');
