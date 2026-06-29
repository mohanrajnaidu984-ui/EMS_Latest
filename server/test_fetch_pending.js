const run = async () => {
    try {
        const url = 'http://localhost:5000/api/pricing/list/pending?userEmail=mohan.naidu@almoayyedcg.com';
        const res = await fetch(url);
        const data = await res.json();
        console.log(JSON.stringify(data, null, 2));
    } catch (err) {
        console.error(err);
    }
};
run();
