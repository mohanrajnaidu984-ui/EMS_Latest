/**
 * Shared service for Enquiry Job Hierarchy calculations
 * Stabilizes levels, customer resolution, and department visibility
 */

/**
 * Builds a map of JobID -> Job object
 */
function buildJobMap(jobs) {
    const jobMap = {};
    jobs.forEach(j => {
        if (j && j.ID) {
            jobMap[j.ID] = j;
        }
    });
    return jobMap;
}

/**
 * Calculates hierarchy metadata for all jobs in an enquiry
 * @param {Array} jobs - List of all jobs in the enquiry
 * @param {string} enquiryCustomer - Main customer name from EnquiryMaster
 * @returns {Object} Map of JobID -> { level, depth, rootCode, customer, rootAncestorId }
 */
function getHierarchyMetadata(jobs, enquiryCustomer) {
    const jobMap = buildJobMap(jobs);
    
    // Lead Jobs (Ancestors at the very top)
    const roots = jobs.filter(j => !j.ParentID || String(j.ParentID) === '0' || j.ParentID === 0)
        .sort((a, b) => a.ID - b.ID);
    
    const metaMap = {};

    jobs.forEach(job => {
        let current = job;
        let depth = 0;
        let visited = new Set();
        
        // Traverse upwards to find level and root ancestor
        while (current && current.ParentID && String(current.ParentID) !== '0' && !visited.has(String(current.ID))) {
            visited.add(String(current.ID));
            depth++;
            const parent = jobMap[current.ParentID];
            if (!parent) break;
            current = parent;
        }

        const level = depth + 1; // 1-based level
        const rootAncestor = current || job;
        
        // Determine Root Code (L1, L2, L3, L4 based on creation/ID order of Lead Jobs)
        let rootCode = rootAncestor.LeadJobCode;
        if (!rootCode) {
            const rootIdx = roots.findIndex(r => String(r.ID) === String(rootAncestor.ID));
            rootCode = rootIdx !== -1 ? `L${rootIdx + 1}` : 'L1';
        }

        // Determine Customer context using rule:
        // Rule A: If sub-job (has parent) -> Customer is the Parent Job name
        // Rule B: If lead-job (no parent) -> Customer is the Main Enquiry Customer
        const cleanOwnJob = (name) => name ? name.replace(/^(L\d+|Sub Job)\s*-?\s*/i, '').trim() : '';
        const normalize = str => str ? str.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
        
        const allJobNames = new Set(jobs.map(j => normalize(cleanOwnJob(j.ItemName))));
        const externalCustomerParts = (enquiryCustomer || '').split(',').map(c => c.trim()).filter(c => {
            if (!c) return false;
            // Filter out parts that match ANY job name in the enquiry
            return !allJobNames.has(normalize(cleanOwnJob(c)));
        });
        const fallbackCustomer = externalCustomerParts.join(', ') || enquiryCustomer || '';

        let customer = fallbackCustomer;
        let parentNode = job.ParentID ? jobMap[job.ParentID] : null;

        if (parentNode) {
            customer = parentNode.ItemName;
        }

        // Rule C: Validation - Own Job must never appear as Customer.
        // If they match, resolve from parent's parent (if any), otherwise fallback to the External Customer.
        while (normalize(cleanOwnJob(customer)) === normalize(cleanOwnJob(job.ItemName)) && parentNode) {
            parentNode = parentNode.ParentID ? jobMap[parentNode.ParentID] : null;
            if (parentNode) {
                customer = parentNode.ItemName;
            } else {
                customer = fallbackCustomer;
            }
        }

        metaMap[job.ID] = {
            level,
            depth,
            rootCode,
            customer,
            rootAncestorId: rootAncestor.ID,
            rootAncestorName: rootAncestor.ItemName
        };
    });

    return metaMap;
}

/**
 * Filters jobs based on Department and assigned emails
 */
function filterJobsByDepartment(jobs, userParams) {
    const { 
        userDepartment, 
        isAdmin, 
        isCreator, 
        isConcernedSE, 
        userEmail, 
        userFullName 
    } = userParams;

    return jobs.filter(job => {
        // Admins and owners see everything
        if (isAdmin) return true;
        // Creators see everything for their own enquiry, but assigned engineers (ConcernedSE)
        // must still be scoped by division / manager rules, so we do NOT short‑circuit on isConcernedSE.
        if (isCreator) return true;
        
        if (!userDepartment && !userEmail && !userFullName) return false;

        const emails = [job.CommonMailIds, job.CCMailIds].filter(Boolean).join(',').toLowerCase();
        const userEmailLower = userEmail ? userEmail.toLowerCase() : '';
        const userEmailUsername = userEmailLower.split('@')[0];
        
        const deptNorm = userDepartment ? userDepartment.toLowerCase().trim().replace(/\s+project\s*$/i, '').trim() : '';
        // Strip "L1 - ", "L2 - " etc. from job name so "L2 - HVAC Project" matches department "HVAC"
        const jobNameRaw = job.ItemName ? job.ItemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim() : '';
        const jobNameNorm = jobNameRaw.toLowerCase();

        // Manager Rule (Rule 1): direct email / username in CC/Common mails
        const isManager = (userEmailLower && emails.includes(userEmailLower)) ||
            (userEmailUsername && emails.split(',').some(e => e.trim() === userEmailUsername.trim()));

        // Division Rule (Rule 2): department keyword in Job Name (e.g. "HVAC" / "HVAC Project" in "L2 - HVAC Project")
        const isDivisionMatch = deptNorm && (jobNameNorm.includes(deptNorm) || jobNameNorm.replace(/\s+project\s*$/i, '').trim().includes(deptNorm));

        // Assignment Visibility (Rule 3): assigned engineers (isConcernedSE) must ALSO
        // satisfy division rule – they should not see unrelated divisions.
        if (isConcernedSE) {
            return isDivisionMatch || isManager;
        }

        // For regular users (non‑assigned), allow either manager or division match,
        // or legacy full‑name-in-email match for backwards compatibility.
        const isLegacyNameMatch = userFullName && emails.includes(userFullName.toLowerCase().trim());

        return isManager || isDivisionMatch || isLegacyNameMatch;
    });
}

module.exports = {
    buildJobMap,
    getHierarchyMetadata,
    filterJobsByDepartment
};
