async function go() {
    try {
        console.log('Fetching...');
        const res = await fetch('http://localhost:5001/api/enquiry-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                enquiryId: 53,
                user: { name: 'Test', role: 'admin', scope: ['L1 - Civil Project'] }
            })
        });
        const data = await res.json();
        const values = data.values || {};
        const jobs = data.jobs || [];
        const options = data.options || [];

        console.log('JOBS:');
        jobs.forEach(j => console.log(`  [${j.id}] ${j.itemName} (Parent: ${j.parentId})`));

        console.log('VALUES > 0:');
        Object.keys(values).forEach(k => {
            const v = values[k];
            if (v && v.Price > 0) {
                // k is optionId_jobId
                const [optId, jobId] = k.split('_');
                const job = jobs.find(j => j.id == jobId);
                const opt = options.find(o => o.id == optId);
                console.log(`  Key ${k}: Price ${v.Price} (Job: ${job ? job.itemName : 'Unknown'}, Opt: ${opt ? opt.name : 'Unknown'})`);
            }
        });

    } catch (e) { console.error(e); }
}
go();
