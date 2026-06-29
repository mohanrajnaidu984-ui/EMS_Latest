/**
 * Shared access rules for Pricing and Quote modules:
 * - CC coordinators: Master_EnquiryFor.CCMailIds contains login email (CommonMailIds alone does not).
 *   They may have no Master_ConcernedSE row — we still resolve a synthetic `user` so pricing list/divisions work.
 * - Assigned sales engineers: ConcernedSE.SEName = FullName, scoped by department ↔ EnquiryFor.ItemName (+ subjobs).
 */
const sql = require('mssql');
const { userIsAssignedQuoteApproverForEnquiry } = require('./quoteApprovalSteps');

function normalizePricingEmail(email) {
    return (email || '').trim().toLowerCase().replace(/@almcg\.com$/i, '@almoayyedcg.com');
}

async function resolvePricingAccessContext(userEmail) {
    const raw = (userEmail || '').trim();
    const normalizedEmail = normalizePricingEmail(raw);
    if (!normalizedEmail) {
        return {
            user: null,
            isAdmin: false,
            isCcUser: false,
            normalizedEmail: '',
            userFullName: '',
            userDepartment: '',
            ccCoordinatorDepartmentNames: null,
        };
    }
    const userRes = await sql.query`
        SELECT FullName, Roles, Department FROM Master_ConcernedSE
        WHERE LOWER(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(EmailId, N''))), N'@almcg.com', N'@almoayyedcg.com'), N'@ALMCG.COM', N'@almoayyedcg.com')) = ${normalizedEmail}`;
    let user = userRes.recordset[0];

    const localPart = (normalizedEmail.split('@')[0] || '').trim();
    const ccListPatFull = `%,${normalizedEmail},%`;
    const ccListPatLocal = localPart.length >= 2 ? `%,${localPart},%` : null;

    let isCcFromMaster = false;
    const ccResFull = await sql.query`
        SELECT TOP 1 1 AS ok
        FROM dbo.Master_EnquiryFor
        WHERE N',' + REPLACE(REPLACE(ISNULL(CCMailIds, N''), N' ', N''), N';', N',') + N','
            LIKE ${ccListPatFull}
    `;
    if ((ccResFull.recordset?.length || 0) > 0) {
        isCcFromMaster = true;
    } else if (ccListPatLocal) {
        const ccResLocal = await sql.query`
            SELECT TOP 1 1 AS ok
            FROM dbo.Master_EnquiryFor
            WHERE N',' + REPLACE(REPLACE(ISNULL(CCMailIds, N''), N' ', N''), N';', N',') + N','
                LIKE ${ccListPatLocal}
        `;
        isCcFromMaster = (ccResLocal.recordset?.length || 0) > 0;
    }

    if (!user) {
        if (!isCcFromMaster) {
            return {
                user: null,
                isAdmin: false,
                isCcUser: false,
                normalizedEmail,
                userFullName: '',
                userDepartment: '',
                ccCoordinatorDepartmentNames: null,
            };
        }
        /** CC-only coordinators often have no Master_ConcernedSE row; still need a session for pricing list / anchors. */
        user = {
            FullName: localPart || normalizedEmail,
            Roles: '',
            Department: '',
        };
    }

    const roleStr = String(user.Roles || '').toLowerCase();
    const isAdmin = roleStr.includes('admin') || roleStr.includes('system');
    const deptNorm = normalizePricingJobName(user.Department || '');
    const isManagementDept = deptNorm === 'management';
    // Management + Admin: CC-coordinator style access (all divisions, unlocked report filters, pricing division toolbar).
    // They may not appear in CCMailIds, so treat them as CC-like with global division coordinator permissions.
    const isCcUser = isCcFromMaster || isManagementDept || isAdmin;

    /** Departments where this user appears on any Master_EnquiryFor.CCMailIds (used to align list anchors with division dropdown). */
    let ccCoordinatorDepartmentNames = null;
    if (isCcUser) {
        // Management / Admin: allow selecting any division; treat as coordinator for all departments.
        if (isManagementDept || isAdmin) {
            const allDeptRes = await sql.query`
                SELECT DISTINCT LTRIM(RTRIM(ISNULL(DepartmentName, N''))) AS DepartmentName
                FROM dbo.Master_EnquiryFor
                WHERE LTRIM(RTRIM(ISNULL(DepartmentName, N''))) <> N''
            `;
            ccCoordinatorDepartmentNames = new Set(
                (allDeptRes.recordset || [])
                    .map((r) => String(r.DepartmentName || '').trim().toLowerCase())
                    .filter(Boolean)
            );
        } else {
        const deptRes = ccListPatLocal
            ? await sql.query`
                SELECT DISTINCT LTRIM(RTRIM(ISNULL(DepartmentName, N''))) AS DepartmentName
                FROM dbo.Master_EnquiryFor
                WHERE LTRIM(RTRIM(ISNULL(DepartmentName, N''))) <> N''
                  AND (
                    N',' + REPLACE(REPLACE(ISNULL(CCMailIds, N''), N' ', N''), N';', N',') + N','
                        LIKE ${ccListPatFull}
                    OR N',' + REPLACE(REPLACE(ISNULL(CCMailIds, N''), N' ', N''), N';', N',') + N','
                        LIKE ${ccListPatLocal}
                  )
            `
            : await sql.query`
                SELECT DISTINCT LTRIM(RTRIM(ISNULL(DepartmentName, N''))) AS DepartmentName
                FROM dbo.Master_EnquiryFor
                WHERE LTRIM(RTRIM(ISNULL(DepartmentName, N''))) <> N''
                  AND N',' + REPLACE(REPLACE(ISNULL(CCMailIds, N''), N' ', N''), N';', N',') + N','
                      LIKE ${ccListPatFull}
            `;
        ccCoordinatorDepartmentNames = new Set(
            (deptRes.recordset || [])
                .map((r) => String(r.DepartmentName || '').trim().toLowerCase())
                .filter(Boolean)
        );
        }
    }
    return {
        user,
        isAdmin,
        isCcUser,
        isManagementDept,
        normalizedEmail,
        userFullName: (user.FullName || '').trim(),
        userDepartment: (user.Department || '').trim(),
        ccCoordinatorDepartmentNames,
    };
}

function ccMailIdsContainsUser(ccMailIdsStr, userEmail) {
    const e = normalizePricingEmail(userEmail);
    if (!e) return false;
    const raw = String(ccMailIdsStr || '').replace(/@almcg\.com/gi, '@almoayyedcg.com');
    const list = ',' + raw.replace(/\s/g, '').replace(/;/g, ',').toLowerCase() + ',';
    if (list.includes(',' + e + ',')) return true;
    const local = e.split('@')[0];
    return local.length > 0 && list.includes(',' + local + ',');
}

function jobIdOfPricing(j) {
    return (j && (j.ID ?? j.id)) ?? null;
}

function normalizePricingJobName(s) {
    return (s || '').toString().replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim().toLowerCase();
}

function collapsePricingCompareKey(s) {
    return (s || '').toString().toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Jobs on this enquiry whose ItemName matches Master.Department (used for SE scoping and pending checks). */
function getDepartmentPricingAnchors(enqJobs, userDepartment) {
    const myJobs = [];
    const deptNorm = normalizePricingJobName(userDepartment);
    const deptKey = collapsePricingCompareKey(userDepartment);
    if (!deptNorm && !deptKey) return myJobs;
    enqJobs.forEach((job) => {
        const mefDeptKey = collapsePricingCompareKey(job.DepartmentName ?? job.departmentName ?? '');
        if (deptKey && mefDeptKey && mefDeptKey === deptKey) {
            const jId = jobIdOfPricing(job);
            if (jId != null && !myJobs.find((x) => String(jobIdOfPricing(x)) === String(jId))) {
                myJobs.push(job);
            }
            return;
        }
        const jNorm = normalizePricingJobName(job.ItemName);
        const deptAnchors =
            jNorm === deptNorm ||
            (deptNorm.length >= 3 && jNorm.includes(deptNorm)) ||
            (deptNorm.length >= 3 && deptNorm.includes(jNorm));
        if (deptAnchors) {
            const jId = jobIdOfPricing(job);
            if (jId != null && !myJobs.find((x) => String(jobIdOfPricing(x)) === String(jId))) {
                myJobs.push(job);
            }
        }
    });
    return myJobs;
}

function getPricingAnchorJobs(enqJobs, ctx, userEmail) {
    const { isAdmin, isCcUser, userDepartment } = ctx;
    if (isAdmin) return [...enqJobs];
    let myJobs = [];
    if (isCcUser) {
        enqJobs.forEach(job => {
            if (ccMailIdsContainsUser(job.CCMailIds, userEmail)) {
                const jId = jobIdOfPricing(job);
                if (jId != null && !myJobs.find(x => String(jobIdOfPricing(x)) === String(jId))) {
                    myJobs.push(job);
                }
            }
        });
    } else {
        myJobs = getDepartmentPricingAnchors(enqJobs, userDepartment);
    }
    return myJobs;
}

/**
 * True when a job row (EnquiryFor + MEF) belongs to a session "Division" filter (Master_EnquiryFor.DepartmentName
 * or fuzzy ItemName match, same as {@link getDepartmentPricingAnchors} when MEF has no DepartmentName on this row).
 */
function jobBelongsToSessionDivision(job, divTrim) {
    const d = (divTrim || '').trim();
    if (!d) return true;
    const divKey = collapsePricingCompareKey(d);
    const mefDeptKey = collapsePricingCompareKey(job.DepartmentName ?? job.departmentName ?? '');
    if (mefDeptKey && divKey && mefDeptKey === divKey) return true;

    const itemNorm = normalizePricingJobName(job.ItemName ?? job.itemName ?? '');
    const divNorm = normalizePricingJobName(d);
    if (itemNorm && divNorm) {
        if (itemNorm === divNorm) return true;
        if (divNorm.length >= 3 && itemNorm.includes(divNorm)) return true;
        if (divNorm.length >= 3 && divNorm.includes(itemNorm)) return true;
    }
    const rawItemKey = collapsePricingCompareKey(job.ItemName ?? job.itemName ?? '');
    if (rawItemKey && divKey) {
        if (rawItemKey === divKey) return true;
        if (divKey.length >= 3 && rawItemKey.includes(divKey)) return true;
        if (rawItemKey.length >= 3 && divKey.includes(rawItemKey)) return true;
    }
    return false;
}

/**
 * Like {@link getPricingAnchorJobs} but when `sessionDivision` is set, anchors are limited to that division
 * (Pricing module dropdown). Empty string keeps legacy behaviour.
 */
function getPricingAnchorJobsForDivision(enqJobs, ctx, userEmail, sessionDivision) {
    const d = (sessionDivision || '').trim();
    if (!d) {
        return getPricingAnchorJobs(enqJobs, ctx, userEmail);
    }
    const { isAdmin } = ctx;
    if (isAdmin) {
        return enqJobs.filter((job) => jobBelongsToSessionDivision(job, d));
    }
    /**
     * Session Division set: same own-job anchors for everyone (CC vs non-CC only differs in how many divisions
     * appear in the toolbar — not in job-tree / pricing tuple behaviour).
     */
    return getDepartmentPricingAnchors(enqJobs, d);
}

function expandVisibleJobIdsFromAnchors(anchorJobs, enqJobs) {
    const visibleJobs = new Set();
    const queue = [...anchorJobs];
    const processed = new Set();
    while (queue.length > 0) {
        const currentJob = queue.pop();
        const currIdStr = String(jobIdOfPricing(currentJob));
        if (!currIdStr || currIdStr === 'undefined') continue;
        if (processed.has(currIdStr)) continue;
        processed.add(currIdStr);
        visibleJobs.add(currIdStr);
        const children = enqJobs.filter(child => child.ParentID && String(child.ParentID) === currIdStr);
        children.forEach(c => {
            const cid = jobIdOfPricing(c);
            if (cid != null && !processed.has(String(cid))) queue.push(c);
        });
    }
    return visibleJobs;
}

/**
 * Downward expansion from anchors, plus every ancestor (parent chain to each root).
 * Required so GET /api/pricing/:requestNo still returns all lead roots / branches the user is involved in
 * — expandVisibleJobIdsFromAnchors alone drops parents and hides multiple "Select Lead Job" roots.
 */
function expandVisibleJobIdsWithAncestors(anchorJobs, enqJobs) {
    const down = expandVisibleJobIdsFromAnchors(anchorJobs, enqJobs);
    const byId = new Map();
    enqJobs.forEach((j) => {
        const id = jobIdOfPricing(j);
        if (id != null && id !== '') {
            byId.set(String(id), j);
            if (typeof id === 'number' || (typeof id === 'string' && /^\d+$/.test(id))) {
                byId.set(Number(id), j);
            }
        }
    });
    const out = new Set(down);
    down.forEach((idStr) => {
        let cur = byId.get(idStr) || byId.get(Number(idStr));
        let safety = 0;
        while (cur && safety < 50) {
            const pid = cur.ParentID;
            if (pid == null || pid === '' || pid === 0 || pid === '0') break;
            const ps = String(pid);
            out.add(ps);
            cur = byId.get(ps) || byId.get(pid) || byId.get(Number(pid));
            safety++;
        }
    });
    return out;
}

/** Assigned ConcernedSE on this enquiry (email join). */
async function userIsConcernedSeOnEnquiry(ctx, requestNo) {
    const rn = parseInt(String(requestNo), 10);
    if (Number.isNaN(rn) || !ctx?.normalizedEmail) return false;
    const concernedSeByEmailRes = await sql.query`
        SELECT TOP 1 1 AS ok
        FROM ConcernedSE cs
        INNER JOIN Master_ConcernedSE m ON UPPER(LTRIM(RTRIM(ISNULL(m.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(cs.SEName, N''))))
        WHERE LTRIM(RTRIM(ISNULL(cs.RequestNo, N''))) = LTRIM(RTRIM(CONVERT(NVARCHAR(50), ${rn})))
          AND LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(m.EmailId, N''), N'@almcg.com', N'@almoayyedcg.com'), N'@ALMCG.COM', N'@almoayyedcg.com')))) = ${ctx.normalizedEmail}
    `;
    return (concernedSeByEmailRes.recordset?.length || 0) > 0;
}

/**
 * Anchor jobs for pricing detail / quote (CC + ConcernedSE fallbacks when CCMailIds drift).
 */
function resolvePricingAnchorJobsWithFallbacks(enqJobs, ctx, userEmail, sessionDivision, allowedByConcernedSe = false) {
    const sessionDivTrim = (sessionDivision || '').toString().trim();
    if (ctx?.isAdmin && !sessionDivTrim) {
        return [...enqJobs];
    }
    let anchors = sessionDivTrim
        ? getPricingAnchorJobsForDivision(enqJobs, ctx, userEmail, sessionDivTrim)
        : getPricingAnchorJobs(enqJobs, ctx, userEmail);

    if (anchors.length === 0 && allowedByConcernedSe) {
        anchors = sessionDivTrim
            ? getDepartmentPricingAnchors(enqJobs, sessionDivTrim)
            : getDepartmentPricingAnchors(enqJobs, (ctx.userDepartment || '').trim());
    }
    if (anchors.length === 0 && ctx.isCcUser) {
        if (sessionDivTrim) {
            anchors = getDepartmentPricingAnchors(enqJobs, sessionDivTrim);
        }
        if (anchors.length === 0 && (ctx.userDepartment || '').trim()) {
            anchors = getDepartmentPricingAnchors(enqJobs, (ctx.userDepartment || '').trim());
        }
        if (anchors.length === 0 && enqJobs.length > 0) {
            anchors = [...enqJobs];
        }
    }
    return anchors;
}

/**
 * Enquiry-level gate + job anchors (matches pricing list/detail).
 */
async function userHasQuotePricingEnquiryAccess(userEmail, requestNo, sessionDivision = '', quoteId = null) {
    const normalizedEmail = normalizePricingEmail(userEmail);
    if (!normalizedEmail) return false;
    if (await userIsAssignedQuoteApproverForEnquiry(normalizedEmail, requestNo, quoteId)) {
        return true;
    }
    const ctx = await resolvePricingAccessContext(userEmail);
    if (!ctx.user) return false;
    if (ctx.isAdmin) return true;
    const rn = parseInt(String(requestNo), 10);
    if (Number.isNaN(rn)) return false;
    const sessionDivTrim = (sessionDivision || '').toString().trim();

    const allowedByConcernedSe = await userIsConcernedSeOnEnquiry(ctx, requestNo);

    if (!ctx.isCcUser) {
        if (!allowedByConcernedSe) return false;
    } else {
        const tdProfile = (ctx.userDepartment || '').trim();
        const deptNormProfile = normalizePricingJobName(tdProfile);
        const ccListPat = `%,${ctx.normalizedEmail},%`;
        let cc;
        if (sessionDivTrim) {
            cc = await sql.query`
                SELECT TOP 1 1 AS ok
                FROM EnquiryFor ef
                INNER JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE N'% - ' + mef.ItemName)
                WHERE ef.RequestNo = ${rn}
                  AND ',' + REPLACE(REPLACE(ISNULL(mef.CCMailIds, ''), ' ', ''), ';', ',') + ',' LIKE ${ccListPat}
                  AND LTRIM(RTRIM(ISNULL(mef.DepartmentName, N''))) = ${sessionDivTrim}
            `;
            if ((cc.recordset?.length || 0) === 0) {
                cc = await sql.query`
                    SELECT TOP 1 1 AS ok
                    FROM dbo.EnquiryFor efCcDiv
                    INNER JOIN dbo.Master_EnquiryFor mefCcDiv
                        ON (efCcDiv.ItemName = mefCcDiv.ItemName OR efCcDiv.ItemName LIKE N'% - ' + mefCcDiv.ItemName)
                    WHERE efCcDiv.RequestNo = ${rn}
                      AND LTRIM(RTRIM(ISNULL(mefCcDiv.DepartmentName, N''))) = ${sessionDivTrim}
                      AND EXISTS (
                          SELECT 1
                          FROM dbo.Master_EnquiryFor mefTpl
                          WHERE LTRIM(RTRIM(ISNULL(mefTpl.DepartmentName, N''))) = ${sessionDivTrim}
                            AND ',' + REPLACE(REPLACE(ISNULL(mefTpl.CCMailIds, ''), ' ', ''), ';', ',') + ',' LIKE ${ccListPat}
                      )
                `;
            }
        } else if (!tdProfile) {
            cc = await sql.query`
                SELECT TOP 1 1 AS ok
                FROM EnquiryFor ef
                INNER JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE N'% - ' + mef.ItemName)
                WHERE ef.RequestNo = ${rn}
                  AND ',' + REPLACE(REPLACE(ISNULL(mef.CCMailIds, ''), ' ', ''), ';', ',') + ',' LIKE ${ccListPat}
            `;
        } else {
            const deptLike = `%${tdProfile.toLowerCase()}%`;
            const normLike = `%${deptNormProfile}%`;
            cc = await sql.query`
                SELECT TOP 1 1 AS ok
                FROM EnquiryFor ef
                INNER JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE N'% - ' + mef.ItemName)
                WHERE ef.RequestNo = ${rn}
                  AND ',' + REPLACE(REPLACE(ISNULL(mef.CCMailIds, ''), ' ', ''), ';', ',') + ',' LIKE ${ccListPat}
                  AND (
                    LOWER(LTRIM(RTRIM(mef.ItemName))) LIKE ${deptLike}
                    OR LOWER(LTRIM(RTRIM(ef.ItemName))) LIKE ${deptLike}
                    OR LOWER(LTRIM(RTRIM(mef.ItemName))) LIKE ${normLike}
                    OR LOWER(LTRIM(RTRIM(ef.ItemName))) LIKE ${normLike}
                  )
            `;
        }
        let allowedByCc = (cc.recordset?.length || 0) > 0;
        /**
         * Profile-scoped CC query is easy to miss (e.g. Department "Management", or short "BMS" vs line text).
         * Fall back to "any CCMailIds hit on this enquiry" — same as `!tdProfile` branch — so coordinators match pricing list.
         */
        if (!allowedByCc && !sessionDivTrim && (ctx.userDepartment || '').trim()) {
            const ccBroad = await sql.query`
                SELECT TOP 1 1 AS ok
                FROM EnquiryFor ef
                INNER JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE N'% - ' + mef.ItemName)
                WHERE ef.RequestNo = ${rn}
                  AND ',' + REPLACE(REPLACE(ISNULL(mef.CCMailIds, ''), ' ', ''), ';', ',') + ',' LIKE ${ccListPat}
            `;
            allowedByCc = (ccBroad.recordset?.length || 0) > 0;
        }
        /**
         * Division toolbar + CC: instance MEF may omit DepartmentName / CCMailIds while coordinator is still
         * registered for that department on master — allow any CC line on the enquiry when dept is in their set.
         */
        if (!allowedByCc && sessionDivTrim && ctx.ccCoordinatorDepartmentNames?.has(sessionDivTrim.toLowerCase())) {
            const ccBroadDiv = await sql.query`
                SELECT TOP 1 1 AS ok
                FROM EnquiryFor ef
                INNER JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE N'% - ' + mef.ItemName)
                WHERE ef.RequestNo = ${rn}
                  AND ',' + REPLACE(REPLACE(ISNULL(mef.CCMailIds, ''), ' ', ''), ';', ',') + ',' LIKE ${ccListPat}
            `;
            allowedByCc = (ccBroadDiv.recordset?.length || 0) > 0;
        }
        /** Match pricing list: CC on master OR assigned SE — so Previous Quotes / by-enquiry are not blank for dual-role users. */
        if (!allowedByCc && !allowedByConcernedSe) return false;
    }

    const jobsRes = await sql.query`
        SELECT EF.ID, EF.ParentID, EF.ItemName, MEF.CCMailIds AS CCMailIds, MEF.DepartmentName AS DepartmentName
        FROM EnquiryFor EF
        LEFT JOIN Master_EnquiryFor MEF ON (
            EF.ItemName = MEF.ItemName OR
            EF.ItemName LIKE '% - ' + MEF.ItemName OR
            EF.ItemName LIKE '%- ' + MEF.ItemName OR
            EF.ItemName LIKE MEF.ItemName + ' %' OR
            (MEF.DepartmentName IS NOT NULL AND MEF.DepartmentName <> '' AND EF.ItemName LIKE '%' + MEF.DepartmentName + '%')
        )
        WHERE EF.RequestNo = ${rn}
    `;
    const seen = new Set();
    const enqJobs = [];
    for (const row of jobsRes.recordset || []) {
        const jid = row.ID;
        if (jid == null || seen.has(String(jid))) continue;
        seen.add(String(jid));
        enqJobs.push(row);
    }
    let anchors = sessionDivTrim
        ? getPricingAnchorJobsForDivision(enqJobs, ctx, userEmail, sessionDivTrim)
        : getPricingAnchorJobs(enqJobs, ctx, userEmail);
    /**
     * CC users who are also ConcernedSE often pass the gate via email join while instance MEF.CCMailIds
     * omits them — then CC-only anchor logic returns []. Use the same department anchors as a normal SE.
     */
    if (anchors.length === 0 && allowedByConcernedSe) {
        anchors = sessionDivTrim
            ? getDepartmentPricingAnchors(enqJobs, sessionDivTrim)
            : getDepartmentPricingAnchors(enqJobs, (ctx.userDepartment || '').trim());
    }
    /**
     * CC coordinators passed the enquiry gate but CCMailIds-based anchor pick is empty (common with template/instance drift).
     * Use session division anchors, then profile department, then all jobs on the enquiry for read access.
     */
    if (anchors.length === 0 && ctx.isCcUser) {
        if (sessionDivTrim) {
            anchors = getDepartmentPricingAnchors(enqJobs, sessionDivTrim);
        }
        if (anchors.length === 0 && (ctx.userDepartment || '').trim()) {
            anchors = getDepartmentPricingAnchors(enqJobs, (ctx.userDepartment || '').trim());
        }
        if (anchors.length === 0 && enqJobs.length > 0) {
            anchors = [...enqJobs];
        }
    }
    return anchors.length > 0;
}

/** Sales Report: Admin / Management see all companies and divisions (unrestricted filters). */
function userHasUnlockedReportFilters(ctx) {
    return !!(ctx && (ctx.isAdmin || ctx.isManagementDept));
}

/** CC-mail coordinator (in Master_EnquiryFor.CCMailIds, not Admin/Management): scoped company/division list, SE selectable. */
function userIsCcMailReportScoped(ctx) {
    if (!ctx) return false;
    return !!(ctx.isCcUser && !ctx.isAdmin && !ctx.isManagementDept);
}

async function fetchAllMasterDepartmentNames() {
    const allDeptRes = await sql.query`
        SELECT DISTINCT LTRIM(RTRIM(ISNULL(DepartmentName, N''))) AS DepartmentName
        FROM dbo.Master_EnquiryFor
        WHERE LTRIM(RTRIM(ISNULL(DepartmentName, N''))) <> N''
        ORDER BY DepartmentName
    `;
    return (allDeptRes.recordset || [])
        .map((r) => String(r.DepartmentName || '').trim())
        .filter(Boolean);
}

module.exports = {
    normalizePricingEmail,
    resolvePricingAccessContext,
    userHasUnlockedReportFilters,
    userIsCcMailReportScoped,
    fetchAllMasterDepartmentNames,
    ccMailIdsContainsUser,
    jobIdOfPricing,
    normalizePricingJobName,
    getDepartmentPricingAnchors,
    getPricingAnchorJobs,
    getPricingAnchorJobsForDivision,
    jobBelongsToSessionDivision,
    expandVisibleJobIdsFromAnchors,
    expandVisibleJobIdsWithAncestors,
    userIsConcernedSeOnEnquiry,
    resolvePricingAnchorJobsWithFallbacks,
    userHasQuotePricingEnquiryAccess,
};
