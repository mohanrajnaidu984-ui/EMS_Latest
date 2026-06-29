const run = async () => {
    try {
        const url = 'http://localhost:5001/api/pricing/list/pending?userEmail=mohan.naidu@almoayyedcg.com';
        console.log(`Fetching: ${url}`);
        const res = await fetch(url);
        if (!res.ok) {
            console.error(`Status: ${res.status} ${res.statusText}`);
            const txt = await res.text();
            console.error("Response:", txt);
            return;
        }
        const data = await res.json();
        const found = data.find(d => d.RequestNo === "33");
        console.log("Found Enquiry 33:", !!found);
        if (found) console.log(JSON.stringify(found, null, 2));
        else console.log("First 3 items:", JSON.stringify(data.slice(0, 3), null, 2));
    } catch (err) {
        console.error("Fetch Error:", err);
    }
};
run();
