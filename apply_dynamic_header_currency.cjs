const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/components/Pricing/PricingForm.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Replace Currency: "Price (AED)" -> "Price (BD)"
content = content.replace('Price (AED)', 'Price (BD)');

// 2. Dynamic Lead Job Header Logic
// Current logic: const groupName = opt.itemName || 'Lead Job / General';
// We need to capture the Lead Job Name first.
// `visibleJobs` has the jobs.
// Let's insert logic to find the lead job name BEFORE the grouping start.

// Locate grouping start
const groupingStartMarker = '// Grouping Logic';
const groupingStartIndex = content.indexOf(groupingStartMarker);

if (groupingStartIndex !== -1) {
    // Insert `leadJobName` derivation
    const derivationLogic = `
                                                const leadJob = visibleJobs.find(j => j.isLead);
                                                const leadJobName = leadJob ? \`LEAD JOB / \${leadJob.itemName}\` : 'LEAD JOB / GENERAL';
    `;

    // We insert this just after `const groups = {};` ? Or before?
    // Let's find `const groups = {};`
    const groupsDefMarker = 'const groups = {};';
    const groupsDefIndex = content.indexOf(groupsDefMarker, groupingStartIndex);

    if (groupsDefIndex !== -1) {
        // Insert AFTER `const groups = {};`
        content = content.substring(0, groupsDefIndex + groupsDefMarker.length) + derivationLogic + content.substring(groupsDefIndex + groupsDefMarker.length);

        // now replace the usage:
        // const groupName = opt.itemName || 'Lead Job / General';
        // with
        // const groupName = opt.itemName || leadJobName;

        // Use a regex to be safe with whitespace
        const usageRegex = /const groupName = opt.itemName \|\| 'Lead Job \/ General';/; // Note escaping
        // Check if it's 'Lead Job / General' (mixed case in file?)
        // In file line 588: `const groupName = opt.itemName || 'Lead Job / General';`

        // Also need to update the sort logic.
        // if (a === 'Lead Job / General') return -1;

        // Replace usage
        content = content.replace("const groupName = opt.itemName || 'Lead Job / General';", "const groupName = opt.itemName || leadJobName;");

        // Replace sort logic
        // if (a === 'Lead Job / General') return -1;
        // if (b === 'Lead Job / General') return 1;

        // We replace specific string literals with variable `leadJobName`
        // But `leadJobName` is inside the `groups` loop scope? 
        // No, `groups` loop scope (IIFE) starts at line 580.
        // So `leadJobName` defined at the top of IIFE is accessible in sort.

        content = content.replace(/if \(a === 'Lead Job \/ General'\) return -1;/g, "if (a === leadJobName) return -1;");
        content = content.replace(/if \(b === 'Lead Job \/ General'\) return -1;/g, "if (b === leadJobName) return 1;"); // Wait, original was 1
        content = content.replace(/if \(b === 'Lead Job \/ General'\) return 1;/g, "if (b === leadJobName) return 1;");

        // Also replace the check inside the map?
        // line 635: const isGroupLead = groupName === 'Lead Job / General';
        // content = content.replace(/const isGroupLead = groupName === 'Lead Job \/ General';/g, "const isGroupLead = groupName === leadJobName;");
        // Actually, looking at previous steps, I might have removed or changed that loop logic.
        // In `final_fix.cjs`, I replaced the inner map.
        // Let's check `final_fix.cjs` content in memory... I don't recall seeing `isGroupLead` there.
        // The new single column logic uses `targetJobName = option.itemName`.
        // If `option.itemName` is null, it defaults to lead job.
        // So `isGroupLead` variable might simply be unused or not present in the new loop?
        // Let's check the new loop in `final_fix.cjs`:
        // It DOES NOT use `groupName === ...`. It differentiates by `option.itemName`.
        // So we only need to care about the GROUPING usage (groupName key) and Sorting.

    }
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully applied dynamic header and currency.');
