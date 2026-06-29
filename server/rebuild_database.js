const fs = require('fs');
const path = require('path');
const { connectDB, sql } = require('./dbConfig');

const rebuildDatabase = async () => {
    try {
        await connectDB();
        console.log('Connected to Database. Starting rebuild...');

        // 1. Drop all Foreign Keys
        console.log('Dropping Foreign Keys...');
        await sql.query(`
            DECLARE @sql NVARCHAR(MAX) = N'';
            SELECT @sql += 'ALTER TABLE ' + QUOTENAME(OBJECT_SCHEMA_NAME(parent_object_id))
                + '.' + QUOTENAME(OBJECT_NAME(parent_object_id)) 
                + ' DROP CONSTRAINT ' + QUOTENAME(name) + ';'
            FROM sys.foreign_keys;
            EXEC sp_executesql @sql;
        `);

        // 2. Drop all Tables
        console.log('Dropping Tables...');
        await sql.query(`
            DECLARE @sql NVARCHAR(MAX) = N'';
            SELECT @sql += 'DROP TABLE ' + QUOTENAME(SCHEMA_NAME(schema_id)) 
                + '.' + QUOTENAME(name) + ';'
            FROM sys.tables;
            EXEC sp_executesql @sql;
        `);

        // 3. Read and Execute EMS_DB.sql
        console.log('Executing EMS_DB.sql...');
        const sqlFilePath = path.join(__dirname, '..', 'EMS_DB.sql');
        const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');

        // Split by 'GO' if present, but the provided SQL doesn't use GO. 
        // However, it has multiple statements. mssql driver might handle them in one go or might need splitting.
        // The provided SQL uses IF NOT EXISTS ... CREATE TABLE ... which are separate batches usually.
        // But let's try executing it as a single batch first. If that fails, we might need to split.
        // Actually, 'GO' is not standard SQL, it's a tool command. The provided SQL doesn't have it.
        // We can try running the whole thing.

        await sql.query(sqlContent);

        console.log('Database rebuild completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Error rebuilding database:', err);
        process.exit(1);
    }
};

rebuildDatabase();
