/**
 * One-shot Sales Report timing probe — run: node scripts/profile-sales-report.js
 * Soft-deletes itself after? No — keep as script.
 */
const http = require('http');

function timedGet(path) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const req = http.get(
      {
        hostname: 'localhost',
        port: 5002,
        path,
        timeout: 180000,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            ms: Date.now() - started,
            bytes: body.length,
            ok: res.statusCode >= 200 && res.statusCode < 300,
          });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

(async () => {
  const email = encodeURIComponent('mohan.naidu@almoayyedcg.com');
  const company = encodeURIComponent('Almoayyed Air Conditioning W.L.L.');
  const base = `/api/sales-report`;
  const common = `year=2026&company=${company}&division=All&email=${email}`;

  console.log('Warmup...');
  await timedGet(`${base}/filters?email=${email}&company=${company}`);

  const tests = [
    ['filters', `${base}/filters?email=${email}&company=${company}`],
    ['user-access', `${base}/user-access-details?email=${email}`],
    ['summary (SE=All)', `${base}/summary?${common}`],
    ['summary (SE=Arun)', `${base}/summary?${common}&role=${encodeURIComponent('Arun Venkatesh')}`],
    ['top-job Won', `${base}/top-job-booked?${common}&topJobStatus=Won`],
    ['top-job Quoted', `${base}/top-job-booked?${common}&topJobStatus=Quoted`],
    ['parallel summary+won', null],
  ];

  for (const [label, path] of tests) {
    if (label === 'parallel summary+won') {
      const t0 = Date.now();
      const [a, b] = await Promise.all([
        timedGet(`${base}/summary?${common}`),
        timedGet(`${base}/top-job-booked?${common}&topJobStatus=Won`),
      ]);
      console.log(
        `${label}: wall=${Date.now() - t0}ms (summary=${a.ms}ms, won=${b.ms}ms)`
      );
      continue;
    }
    const r = await timedGet(path);
    console.log(`${label}: ${r.ms}ms status=${r.status} bytes=${r.bytes}`);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
