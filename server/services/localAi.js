const { sql } = require('../dbConfig');

const handleLocalQuery = async (userMessage) => {
    const msg = userMessage.toLowerCase();

    try {
        // --- Intent 1: Specific Enquiry Status/Details ---
        // Regex to find "enquiry X" or "request X" or just number if clear
        const enqMatch = msg.match(/(?:enquiry|request|number|no\.?)\s*:?\s*(\d+)/i) || msg.match(/(\d{4,})/);

        if (enqMatch) {
            const requestNo = enqMatch[1];

            // Check if user is asking for status specifically
            const isStatus = msg.includes('status') || msg.includes('state');

            const result = await sql.query`
                SELECT * FROM EnquiryMaster WHERE RequestNo = ${requestNo}
            `;

            if (result.recordset.length === 0) {
                return {
                    answer: `I could not find any enquiry with Number ${requestNo} in the database.`,
                    sources: []
                };
            }

            const enq = result.recordset[0];

            // Fetch status if available (assuming Status column or similar logic)
            // If EnquiryMaster doesn't have explicit Status column, we derive it or look at related tables.
            // Based on previous files, there is a 'Status' in EnquiryMaster or we use logic.
            // Let's assume generic fields for now.

            const client = enq.ClientName || "Unknown Client";
            const project = enq.ProjectName || "Unknown Project";
            const date = new Date(enq.EnquiryDate).toLocaleDateString();
            const status = enq.Status || "Submitted"; // Default if null

            if (isStatus) {
                return {
                    answer: `Enquiry ${requestNo} is currently **${status}**.\n\nIt was received on ${date} for the project "${project}".`,
                    sources: [{ id: requestNo, metadata: { type: 'Enquiry', valid: true } }]
                };
            } else {
                return {
                    answer: `Here are the details for **Enquiry ${requestNo}**:\n\n` +
                        `**Project**: ${project}\n` +
                        `**Client**: ${client}\n` +
                        `**Date**: ${date}\n` +
                        `**Subject**: ${enq.DetailsOfEnquiry || 'No details provided'}\n\n` +
                        `Current Status: **${status}**`,
                    sources: [{ id: requestNo, metadata: { type: 'Enquiry', valid: true } }]
                };
            }
        }

        // --- Intent 2: Count / Overview ---
        if (msg.includes('how many') || msg.includes('count') || msg.includes('total')) {
            const result = await sql.query`SELECT COUNT(*) as Count FROM EnquiryMaster`;
            const count = result.recordset[0].Count;
            return {
                answer: `There are currently **${count}** enquiries in the system.`,
                sources: []
            };
        }

        // --- Intent 3: Latest Enquiries ---
        if (msg.includes('latest') || msg.includes('recent') || msg.includes('new')) {
            const result = await sql.query`SELECT TOP 5 RequestNo, ProjectName, EnquiryDate FROM EnquiryMaster ORDER BY EnquiryDate DESC`;
            const list = result.recordset.map(e => `- **${e.RequestNo}**: ${e.ProjectName} (${new Date(e.EnquiryDate).toLocaleDateString()})`).join('\n');

            return {
                answer: `Here are the 5 most recent enquiries:\n\n${list}`,
                sources: []
            };
        }

        // --- Fallback ---
        return {
            answer: "I am operating in **Local Mode** (No API Key). I can answer questions about:\n" +
                "- Specific Enquiries (e.g., 'Status of enquiry 13')\n" +
                "- Total counts (e.g., 'How many enquiries?')\n" +
                "- Recent items (e.g., 'Show latest enquiries')\n\n" +
                "For more complex AI reasoning, please configure a Gemini API Key.",
            sources: []
        };

    } catch (error) {
        console.error('Local AI Error:', error);
        return {
            answer: "I encountered a database error while trying to answer your question locally.",
            sources: []
        };
    }
};

module.exports = { handleLocalQuery };
