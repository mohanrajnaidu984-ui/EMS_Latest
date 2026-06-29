
async function test() {
    const params = new URLSearchParams({
        year: '2026',
        company: 'Almoayyed Air Conditioning',
        division: 'BMS'
    });

    const url = `http://localhost:5001/api/sales-report/summary?${params.toString()}`;
    console.log("Fetching:", url);
    try {
        const res = await fetch(url);
        console.log("Status:", res.status);
        const data = await res.json();

        console.log("Full Response:");
        console.log(JSON.stringify(data, null, 2));

        if (data.error) {
            console.log("\n=== ERROR ===");
            console.log(data.error);
        }

        if (data.topClients) {
            console.log("\n=== Top Clients ===");
            data.topClients.forEach(c => {
                if (c.name.toLowerCase().includes('ansari')) {
                    console.log('FOUND ANSARI:', c);
                }
            });
        }

    } catch (e) {
        console.error("Exception:", e);
    }
}

test();
