
const fs = require('fs');

const options = JSON.parse(fs.readFileSync('options_17.json', 'utf8'));
const values = JSON.parse(fs.readFileSync('pricing_dump.json', 'utf8'));

const normalizeCust = (s) => (s || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

function simulate(activeQuoteTab, activeCustomer, activeLead) {
    console.log(`\n--- SIMULATION: Tab=${activeQuoteTab}, Customer=${activeCustomer}, Lead=${activeLead} ---`);

    // Group values by customer
    const allValues = {};
    values.forEach(v => {
        const cKey = normalizeCust(v.CustomerName);
        if (!allValues[cKey]) allValues[cKey] = {};
        allValues[cKey][`${v.OptionID}_${v.EnquiryForItem}`] = v;
    });

    const activeCustNorm = normalizeCust(activeCustomer);
    const dataValues = allValues[activeCustNorm] || {};

    const hasEffectivePrice = (optId) => {
        const checkVals = (vals) => {
            if (!vals) return false;
            return Object.values(vals).some(v => String(v.OptionID) === String(optId) && parseFloat(v.Price) > 0);
        };
        if (checkVals(dataValues)) return true;
        if (allValues[activeCustNorm] && checkVals(allValues[activeCustNorm])) return true;
        if (allValues['main'] && checkVals(allValues['main'])) return true;

        // internal check
        const jobNames = ['civilproject', 'electrical', 'bms'];
        for (const jn of jobNames) {
            if (allValues[jn] && checkVals(allValues[jn])) return true;
        }
        return false;
    };

    const sorted = [...options].sort((a, b) => {
        const aHasPrice = hasEffectivePrice(a.ID);
        const bHasPrice = hasEffectivePrice(b.ID);

        const aLeadMatch = activeLead && normalizeCust(a.LeadJobName) === activeLead;
        const bLeadMatch = activeLead && normalizeCust(b.LeadJobName) === activeLead;

        const aCustMatch = normalizeCust(a.CustomerName) === activeCustNorm;
        const bCustMatch = normalizeCust(b.CustomerName) === activeCustNorm;

        if (aHasPrice && !bHasPrice) return -1;
        if (!aHasPrice && bHasPrice) return 1;

        if (aLeadMatch && !bLeadMatch) return -1;
        if (!aLeadMatch && bLeadMatch) return 1;

        if (aCustMatch && !bCustMatch) return -1;
        if (!aCustMatch && bCustMatch) return 1;
        return 0;
    });

    const uniqueOptions = [];
    const seen = new Set();
    sorted.forEach(opt => {
        const key = `${normalizeCust(opt.OptionName)}_${normalizeCust(opt.ItemName)}`;
        if (!seen.has(key)) {
            uniqueOptions.push(opt);
            seen.add(key);
        }
    });

    const civilOption = uniqueOptions.find(o => normalizeCust(o.ItemName) === 'civilproject');
    console.log(`Winner for Civil Project: ID=${civilOption.ID}, Customer=${civilOption.CustomerName}`);

    // Look up price
    let val = dataValues[`${civilOption.ID}_Civil Project`];
    let price = val ? val.Price : 0;
    console.log(`Direct Price for Nass: ${price}`);

    if (price === 0) {
        // Fallback
        const fallbackCandidates = ['KARTEC SERVICES WLL', 'Main'];
        for (const cand of fallbackCandidates) {
            const cKey = normalizeCust(cand);
            const vals = allValues[cKey];
            if (vals) {
                const iOpt = options.find(o => o.OptionName === civilOption.OptionName && o.ItemName === civilOption.ItemName && normalizeCust(o.CustomerName) === cKey);
                if (iOpt) {
                    const iVal = vals[`${iOpt.ID}_Civil Project`];
                    if (iVal && iVal.Price > 0) {
                        price = iVal.Price;
                        console.log(`Fallback Price from ${cand}: ${price}`);
                        break;
                    }
                }
            }
        }
    }
}

simulate('electrical', 'Nass Contracting', 'civilproject');
simulate('self', 'Nass Contracting', 'civilproject');
