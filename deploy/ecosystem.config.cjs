/**
 * PM2 production config — run from site root on ACG-WEBSVR02 (151.50.1.38):
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 *
 * Attachments: process runs as SYSTEM → UNC identity is ACG-WEBSVR02$
 * (must have Modify on \\151.50.20.129\ems app share + NTFS). No app-level user mapping.
 */
module.exports = {
    apps: [
        {
            name: 'EMS-API',
            cwd: './backend',
            script: 'index.js',
            instances: 1,
            exec_mode: 'fork',
            autorestart: true,
            max_memory_restart: '2500M',
            node_args: '--no-watch',
            env: {
                NODE_ENV: 'production',
            },
            error_file: './logs/ems-api-error.log',
            out_file: './logs/ems-api-out.log',
            merge_logs: true,
            time: true,
        },
    ],
};
