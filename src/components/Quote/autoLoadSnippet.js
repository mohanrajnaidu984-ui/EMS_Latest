
// Auto-load Quote or Clear Form when Active Tab Changes
useEffect(() => {
    if (!activeQuoteTab || !calculatedTabs) return;

    // Ensure data is loaded
    if (!pricingData && !enquiryData) return;

    const activeTabObj = calculatedTabs.find(t => t.id === activeQuoteTab);
    if (!activeTabObj) return;

    const activeTabRealId = activeTabObj.realId;
    const jobsPool = (pricingData?.jobs && pricingData.jobs.length > 0) ? pricingData.jobs : (enquiryData?.divisionsHierarchy || []);

    console.log('[AutoLoad] Checking quotes for tab:', activeTabObj.label, 'ID:', activeTabRealId);

    // Filter quotes for this tab (Replicating render logic)
    const tabQuotes = existingQuotes.filter(q => {
        // 1. Customer Context Match
        const normalizedQuoteTo = normalize(q.ToName);
        const normalizedCurrentTo = normalize(toName);
        const isMainOrGeneric = !normalizedQuoteTo || normalizedQuoteTo === 'main' || normalizedQuoteTo === 'generic';

        const mJobs = (enquiryData?.divisionsHierarchy || []).map(d => normalize(d.itemName || d.DivisionName));
        const currentIsInternal = mJobs.includes(normalizedCurrentTo);
        const quoteIsInternal = mJobs.includes(normalizedQuoteTo) || isMainOrGeneric;

        if (currentIsInternal) {
            if (!quoteIsInternal && normalizedQuoteTo !== normalizedCurrentTo) return false;
        } else {
            if (!isMainOrGeneric &&
                normalizedQuoteTo !== normalizedCurrentTo &&
                !normalizedQuoteTo.startsWith(normalizedCurrentTo + '-') &&
                !normalizedCurrentTo.startsWith(normalizedQuoteTo + '-')) return false;
        }

        // 2. Hierarchy Match
        const qDivCode = q.QuoteNumber?.split('/')[1]?.toUpperCase();
        const qJob = jobsPool.find(j => {
            const jName = (j.itemName || j.DivisionName || '').toUpperCase();
            return (qDivCode === 'ELE' && jName.includes('ELECTRICAL')) ||
                (qDivCode === 'BMS' && jName.includes('BMS')) ||
                (qDivCode === 'PLFF' && jName.includes('PLUMBING')) ||
                (qDivCode === 'CVLP' && jName.includes('CIVIL')) ||
                (qDivCode === 'FPE' && jName.includes('FIRE')) ||
                (qDivCode === 'AAC' && jName.includes('AIR'));
        });

        if (!qJob) return activeTabObj.isSelf; // Fallback mapping
        const qJobId = qJob.id || qJob.ItemID;
        return String(qJobId) == String(activeTabRealId);
    });

    if (tabQuotes.length > 0) {
        // Found quotes: Sort by Revision (Desc) and Load Latest
        const sorted = tabQuotes.sort((a, b) => b.RevisionNo - a.RevisionNo);
        const latest = sorted[0];

        if (latest.ID !== quoteId) {
            console.log('[AutoLoad] Loading latest quote:', latest.QuoteNumber);
            loadQuote(latest);
        }
    } else {
        // No quotes found: Clear Form / Blank State
        // Only reset if we currently define a quoteId (meaning we were viewing something else)
        // OR if the form is dirty? (Tricky).
        // Safer: If quoteId is set, clear it.
        if (quoteId !== null) {
            console.log('[AutoLoad] No quotes found for tab. Resetting to blank form.');
            setQuoteId(null);
            setQuoteNumber(''); // Clear displayed number
            setClauseContent(defaultClauses); // Reset clauses to default template
            setQuoteDate(new Date().toISOString().split('T')[0]); // Reset date
            setValidityDays(30);
            // We keep 'toName' (Customer) as that is global context
            setSubject('');
            setCustomerReference('');
            // Note: Pricing data remains loaded (pricingData state), but values in quote won't be from DB
        }
    }
}, [activeQuoteTab, calculatedTabs, existingQuotes, toName, pricingData, enquiryData, quoteId]);
