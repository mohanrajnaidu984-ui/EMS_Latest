const fs = require('node:fs');
const path = 'src/components/Quote/quoteRealDomFitPack.js';
let source = fs.readFileSync(path, 'utf8');
const start = source.indexOf('    let ii = 0;\n    while (ii < indices.length)');
const end = source.indexOf('    let groups = ensureSegmentPageGroupsCoverAll(', start);
if (start < 0 || end < start) throw new Error('Packer boundaries changed');
source = source.slice(0, start) + `    // Search whole candidate pages instead of rebuilding the DOM for every
    // additional row. Existing fit, keep-with, verification and fill rules remain
    // authoritative; exponential bounds avoid measuring an entire long BOQ first.
    let ii = 0;
    while (ii < indices.length) {
        const pageIdx = pages.length;
        const first = buildChain(ii);
        let firstEnd = first.nextIi;
        if (!fitOf(first.chain, pageIdx).ok) {
            firstEnd = ii + 1;
            if (!fitOf([indices[ii]], pageIdx).ok) {
                // Preserve the oversized atomic unit. The live integrity gate
                // blocks export until it can fit; never discard its content.
                pages.push([indices[ii++]]);
                continue;
            }
        }
        const ends = [ii, firstEnd];
        for (let cursor = firstEnd; cursor < indices.length;) {
            cursor = buildChain(cursor).nextIi;
            ends.push(cursor);
        }
        const count = ends.length - 1;
        let best = 1;
        let failed = count + 1;
        let probe = Math.min(2, count);
        while (probe > best) {
            if (fitOf(indices.slice(ii, ends[probe]), pageIdx).ok) {
                best = probe;
                if (probe === count) break;
                probe = Math.min(count, probe * 2);
            } else {
                failed = probe;
                break;
            }
        }
        let lo = best + 1;
        let hi = Math.min(count, failed - 1);
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (fitOf(indices.slice(ii, ends[mid]), pageIdx).ok) {
                best = mid;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        pages.push(indices.slice(ii, ends[best]));
        ii = ends[best];
    }

` + source.slice(end);
source = source.replace('    let cur = [];\n', '');
fs.writeFileSync(path, source);
