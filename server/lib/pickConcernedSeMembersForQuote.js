'use strict';

const {
    userHasDepartment,
    anyDepartmentTokenMatchesJobName,
} = require('./userDepartments');

function normJobKey(s) {
    return String(s || '')
        .trim()
        .toLowerCase()
        .replace(/^(l\d+|sub job)\s*-\s*/i, '')
        .replace(/\s+/g, ' ');
}

function extractLCode(s) {
    const t = String(s || '').trim();
    if (!t) return '';
    const mParen = t.match(/\(([lL]\d+)\)\s*$/);
    if (mParen) return mParen[1].toUpperCase();
    const mStart = t.match(/^\s*([lL]\d+)\b/);
    if (mStart) return mStart[1].toUpperCase();
    const mAny = t.match(/\b([lL]\d+)\b/);
    if (mAny) return mAny[1].toUpperCase();
    return '';
}

function rowLeadCode(r) {
    return String(r.leadjobcode ?? r.LeadJobCode ?? r.leadJobCode ?? '')
        .trim()
        .toUpperCase();
}

function rowIsAccountable(r) {
    return (
        String(r.accountability ?? r.Accountability ?? '')
            .trim()
            .toLowerCase() === 'yes'
    );
}

function rowDepartment(r) {
    return String(r.Department ?? r.department ?? r.SEDepartment ?? r.seDepartment ?? '').trim();
}

/**
 * Keep SEs whose Master department belongs to this OwnJob / division.
 * Accountable assignees always stay (even if Master dept differs).
 * Lead-job people from another division (e.g. Civil Maint on an HVAC OwnJob) are dropped.
 */
function seBelongsToOwnJobDivision(r, ownJobRaw, ownKey) {
    if (rowIsAccountable(r)) return true;
    const dept = rowDepartment(r);
    if (!dept) return true; /* legacy ConcernedSE row without Master dept */
    if (!ownKey) return true;
    if (userHasDepartment(dept, ownJobRaw) || userHasDepartment(dept, ownKey)) return true;
    if (anyDepartmentTokenMatchesJobName(dept, ownJobRaw) || anyDepartmentTokenMatchesJobName(dept, ownKey)) {
        return true;
    }
    return false;
}

/**
 * All ConcernedSE for a quote's OwnJob — same membership rule as Enquiry form hydrate
 * (`ownJob` match shows every assignee on that division, across L1/L2).
 * Lead code only decides who is accountable (bold) for this quote line.
 * Master department further restricts to that division's own SEs (not parent lead-job people).
 * @returns {{ name: string, isAccountable: boolean }[]}
 */
function pickConcernedSeMembersForQuote(qt, seRowsForReq) {
    const ownJobRaw = String(qt?.OwnJob ?? qt?.ownJob ?? '').trim();
    const ownKey = normJobKey(ownJobRaw);
    const qn = String(qt?.QuoteNumber || qt?.quoteNumber || '').trim();
    const leadCode =
        extractLCode(qt?.LeadJob ?? qt?.leadJob) || extractLCode(qn) || '';
    const rows = Array.isArray(seRowsForReq) ? seRowsForReq : [];

    let matched = rows.filter((r) => {
        const rowOwn = normJobKey(r.ownjob ?? r.OwnJob ?? r.ownJob);
        if (ownKey && rowOwn && rowOwn !== ownKey) return false;
        if (ownKey && !rowOwn) return false; /* lead-job-only row (no OwnJob) — not this division */
        return true;
    });

    /* Do not fall back to other divisions / null-OwnJob lead assignees when OwnJob is known. */
    if (!matched.length && !ownKey) {
        matched = rows;
    }

    if (ownKey && matched.length) {
        const divisionScoped = matched.filter((r) => seBelongsToOwnJobDivision(r, ownJobRaw, ownKey));
        if (divisionScoped.length) {
            matched = divisionScoped;
        }
    }

    /** Prefer accountability from the quote's lead code; fall back to any Yes on that person. */
    const accountableForName = (name) => {
        const nameKey = name.toLowerCase();
        const mine = matched.filter(
            (r) => String(r.SEName || r.seName || '').trim().toLowerCase() === nameKey
        );
        if (!mine.length) return false;
        if (leadCode) {
            const onLead = mine.filter((r) => {
                const code = rowLeadCode(r);
                return !code || code === leadCode;
            });
            if (onLead.length) return onLead.some(rowIsAccountable);
            return false;
        }
        return mine.some(rowIsAccountable);
    };

    const seen = new Set();
    const members = [];
    const sorted = [...matched].sort((a, b) => {
        const nameA = String(a.SEName || a.seName || '').trim();
        const nameB = String(b.SEName || b.seName || '').trim();
        const aAcc = accountableForName(nameA) ? 0 : 1;
        const bAcc = accountableForName(nameB) ? 0 : 1;
        if (aAcc !== bAcc) return aAcc - bAcc;
        return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    });
    for (const r of sorted) {
        const name = String(r.SEName || r.seName || '').trim();
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        members.push({ name, isAccountable: accountableForName(name) });
    }
    if (members.length === 1) members[0].isAccountable = true;
    return members;
}

module.exports = {
    pickConcernedSeMembersForQuote,
    normJobKey,
    seBelongsToOwnJobDivision,
};
