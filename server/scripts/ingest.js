const { sql, connectDB } = require('../dbConfig');
const { initCollection, upsertPoints } = require('../services/vectorDb');
const { getEmbeddings } = require('../services/openai');
const { v4: uuidv4 } = require('uuid');

async function fetchEnquiries(since = null) {
    try {
        const pool = await sql.connect();
        let query = `
            SELECT
                EM.RequestNo,
                EM.EnquiryDate,
                EM.DueDate,
                EM.SourceOfEnquiry,
                EM.CustomerName,
                EM.ProjectName,
                EM.ClientName,
                EM.ConsultantName,
                EM.EnquiryDetails,
                EM.Remarks,
                EM.Status,
                EM.ReceivedFrom,
                EM.CreatedAt,
                EM.CreatedBy,
                (SELECT STUFF((SELECT '; ' + ItemName FROM EnquiryFor WHERE RequestNo = EM.RequestNo FOR XML PATH('')), 1, 2, '')) as EnquiryItems,
                (SELECT STUFF((SELECT ',' + ItemName FROM EnquiryFor WHERE RequestNo = EM.RequestNo FOR XML PATH('')), 1, 1, '')) as DivisionsRaw,
                (SELECT STUFF((SELECT ',' + SEName FROM ConcernedSE WHERE RequestNo = EM.RequestNo FOR XML PATH('')), 1, 1, '')) as ConcernedSERaw,
                (SELECT STUFF((SELECT ' | ' + NoteContent + ' (' + COALESCE(UserName, 'Unknown') + ')' FROM EnquiryNotes WHERE EnquiryID = EM.RequestNo FOR XML PATH(''), TYPE).value('.', 'NVARCHAR(MAX)'), 1, 3, '')) as Notes,
                (SELECT STUFF((SELECT '; ' + FileName FROM Attachments WHERE RequestNo = EM.RequestNo FOR XML PATH('')), 1, 2, '')) as AttachmentFiles
            FROM EnquiryMaster EM
        `;

        if (since) {
            query += ` WHERE EM.CreatedAt > @since`;
        }

        const request = pool.request();
        if (since) {
            request.input('since', sql.DateTime, since);
        }

        const result = await request.query(query);
        return result.recordset;
    } catch (error) {
        console.error('Error fetching enquiries:', error);
        throw error;
    }
}

function prepareText(record) {
    // Construct a rich context string for the LLM
    const parts = [
        `Enquiry Number: ${record.RequestNo}`,
        `Project: ${record.ProjectName || 'N/A'}`,
        `Customer: ${record.CustomerName || 'N/A'}`,
        `Client: ${record.ClientName || 'N/A'}`,
        `Consultant: ${record.ConsultantName || 'N/A'}`,
        `Date: ${record.EnquiryDate ? new Date(record.EnquiryDate).toISOString().split('T')[0] : 'N/A'}`,
        `Status: ${record.Status}`,
        `Details: ${record.EnquiryDetails || ''}`,
        `Remarks: ${record.Remarks || ''}`,
        `Items: ${record.EnquiryItems || ''}`,
        `Notes: ${record.Notes || ''}`,
        `Attachments: ${record.AttachmentFiles || ''}`
    ];
    return parts.filter(p => p).join('\n');
}

async function runIngestion(since = null) {
    console.log(`Starting ingestion... (Incremental: ${!!since})`);

    await connectDB();
    await initCollection();

    const records = await fetchEnquiries(since);
    console.log(`Fetched ${records.length} records.`);

    if (records.length === 0) {
        console.log('No new records to ingest.');
        return { count: 0 };
    }

    // Process in batches
    const BATCH_SIZE = 50;
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE);
        const texts = batch.map(prepareText);

        console.log(`Embedding batch ${i} to ${i + batch.length}...`);
        const embeddings = await getEmbeddings(texts);

        const points = batch.map((record, idx) => ({
            id: uuidv4(),
            vector: embeddings[idx],
            payload: {
                source_table: 'EnquiryMaster',
                source_id: record.RequestNo,
                text: texts[idx],
                metadata: {
                    project: record.ProjectName,
                    customer: record.CustomerName,
                    status: record.Status,
                    created_by: record.CreatedBy,
                    concerned_ses: record.ConcernedSERaw ? record.ConcernedSERaw.split(',') : [],
                    divisions: record.DivisionsRaw ? record.DivisionsRaw.split(',') : []
                }
            }
        }));

        await upsertPoints(points);
        console.log(`Upserted ${points.length} points.`);
    }

    console.log('Ingestion complete.');
    return { count: records.length };
}

// Allow standalone execution
if (require.main === module) {
    const isIncremental = process.argv.includes('--incremental');
    // For standalone, maybe read 'last_sync.json' for date? 
    // For now, simplify: if --incremental, require a date arg or default to 1 day ago?
    // User requested functional API. I'll focus on API logic mostly.
    runIngestion().then(() => process.exit(0)).catch(err => {
        console.error(err);
        process.exit(1);
    });
}

module.exports = { runIngestion };
