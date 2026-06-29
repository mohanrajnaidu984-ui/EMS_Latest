/**
 * PM2 production config — run from site root:
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
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
