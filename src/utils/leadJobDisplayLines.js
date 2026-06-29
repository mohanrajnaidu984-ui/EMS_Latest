import { inferAssignedSEsForEnquiryForItem } from './inferAssignedSEsForEnquiryForItem';
import { hydrateEnquiryForWithConcernedSEAssignments } from './concernedSeAssignments';

function buildSeMembers(assignees, accountableSE) {
    const names = (Array.isArray(assignees) ? assignees : [])
        .map((n) => String(n || '').trim())
        .filter(Boolean);
    const accountable = String(accountableSE || '').trim() || (names.length === 1 ? names[0] : '');
    const accountableNorm = accountable.toLowerCase();
    return names.map((name) => ({
        name,
        isAccountable: !!(accountableNorm && name.toLowerCase() === accountableNorm),
    }));
}

/** @param {{ ID?: any, id?: any, ParentID?: any, parentId?: any, ItemName?: string, itemName?: string, LeadJobCode?: string, assignedSEs?: string[] }[]} jobs */
export function buildLeadJobForest(jobs) {
    if (!Array.isArray(jobs) || jobs.length === 0) return [];
    const nodes = jobs.map((j) => ({
        id: Number(j.ID ?? j.id),
        parentId:
            (j.ParentID ?? j.parentId) != null &&
            String(j.ParentID ?? j.parentId).trim() !== '' &&
            String(j.ParentID ?? j.parentId) !== '0' &&
            Number.isFinite(Number(j.ParentID ?? j.parentId))
                ? Number(j.ParentID ?? j.parentId)
                : null,
        itemName: String(j.ItemName ?? j.itemName ?? '').trim(),
        assignedSEs: Array.isArray(j.assignedSEs) ? j.assignedSEs.filter(Boolean) : [],
        accountableSE: j.accountableSE,
        children: [],
    }));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const roots = [];
    for (const n of nodes) {
        if (n.parentId != null && byId.has(n.parentId)) {
            byId.get(n.parentId).children.push(n);
        } else {
            roots.push(n);
        }
    }
    const sortKids = (list) => {
        list.sort((a, b) => a.id - b.id);
        list.forEach((c) => sortKids(c.children));
    };
    sortKids(roots);
    return roots;
}

/**
 * Preorder tree with staff names assigned in ConcernedSE list order (legacy; last SE repeats when short).
 */
export function preorderDivisionAndSeLines(roots, seNames) {
    const lines = [];
    let si = 0;
    const pickSe = () => {
        if (!seNames.length) return '';
        if (si < seNames.length) {
            const v = seNames[si];
            si += 1;
            return v;
        }
        return seNames[seNames.length - 1];
    };
    const walk = (nodes, depth) => {
        for (const n of nodes) {
            const se = pickSe();
            lines.push({
                depth,
                label: n.itemName || '—',
                se,
                seMembers: se ? [{ name: se, isAccountable: true }] : [],
            });
            if (n.children?.length) walk(n.children, depth + 1);
        }
    };
    walk(roots, 0);
    return lines;
}

/** Preorder tree: SE per row from explicit assignedSEs or department/inference (matches EnquiryForm). */
function preorderDivisionAndSeLinesInferred(roots, seNames, users) {
    const lines = [];
    const walk = (nodes, depth) => {
        for (const n of nodes) {
            const item = {
                itemName: n.itemName,
                id: n.id,
                parentId: n.parentId,
                assignedSEs: n.assignedSEs || [],
                accountableSE: n.accountableSE,
            };
            const assignees = inferAssignedSEsForEnquiryForItem(item, seNames, users || []);
            const seMembers = buildSeMembers(assignees, item.accountableSE);
            const se = assignees.length ? assignees.join(', ') : '';
            lines.push({ depth, label: n.itemName || '—', se, seMembers });
            if (n.children?.length) walk(n.children, depth + 1);
        }
    };
    walk(roots, 0);
    return lines;
}

export function splitCsv(s) {
    return String(s || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
}

function getSeNameList(row) {
    if (Array.isArray(row.SelectedConcernedSEs) && row.SelectedConcernedSEs.length > 0) {
        return row.SelectedConcernedSEs.map((x) => String(x || '').trim()).filter(Boolean);
    }
    return splitCsv(row.ConcernedSE);
}

function normalizeJobsFromRow(row, users) {
    let jobs = [];
    if (Array.isArray(row.EnquiryForJobs) && row.EnquiryForJobs.length > 0) {
        jobs = row.EnquiryForJobs.map((j) => ({
            ...j,
            id: j.ID ?? j.id,
            parentId: j.ParentID ?? j.parentId,
            itemName: j.ItemName ?? j.itemName,
            leadJobCode: j.LeadJobCode ?? j.leadJobCode,
            assignedSEs: Array.isArray(j.assignedSEs) ? j.assignedSEs.filter(Boolean) : [],
        }));
    } else if (Array.isArray(row.SelectedEnquiryFor) && row.SelectedEnquiryFor.length > 0) {
        jobs = row.SelectedEnquiryFor.map((j) => ({
            ID: j.ID ?? j.id,
            ParentID: j.ParentID ?? j.parentId,
            ItemName: j.ItemName ?? j.itemName,
            LeadJobCode: j.LeadJobCode ?? j.leadJobCode,
            id: j.ID ?? j.id,
            parentId: j.ParentID ?? j.parentId,
            itemName: j.ItemName ?? j.itemName,
            leadJobCode: j.LeadJobCode ?? j.leadJobCode,
            assignedSEs: Array.isArray(j.assignedSEs) ? j.assignedSEs.filter(Boolean) : [],
        }));
    }
    const assignments = row.ConcernedSEAssignments;
    if (jobs.length > 0 && Array.isArray(assignments) && assignments.length > 0) {
        return hydrateEnquiryForWithConcernedSEAssignments(jobs, assignments, users || []);
    }
    return jobs;
}

/**
 * Structured jobs + optional `users` (Master_ConcernedSE list): SE per division via same rules as EnquiryForm.
 * Without `users`, falls back to legacy preorder / CSV zip.
 */
export function getLeadJobDisplayLines(row, options = {}) {
    const { users } = options;
    const seNames = getSeNameList(row);
    const hasAssignments = Array.isArray(row.ConcernedSEAssignments) && row.ConcernedSEAssignments.length > 0;
    const jobs = normalizeJobsFromRow(row, users);
    const useInfer =
        (Array.isArray(users) && users.length > 0 && seNames.length > 0) || hasAssignments;

    if (jobs.length > 0) {
        const roots = buildLeadJobForest(jobs);
        if (useInfer) {
            return preorderDivisionAndSeLinesInferred(roots, seNames, users || []);
        }
        return preorderDivisionAndSeLines(roots, seNames);
    }

    const divs = splitCsv(row.EnquiryFor);
    if (!divs.length) {
        const seMembers = buildSeMembers(seNames, '');
        return [{ depth: 0, label: '—', se: seNames.join(', '), seMembers }];
    }

    if (useInfer) {
        return divs.map((label) => {
            const names = inferAssignedSEsForEnquiryForItem({ itemName: label, assignedSEs: [] }, seNames, users);
            return { depth: 0, label, se: names.join(', '), seMembers: buildSeMembers(names, '') };
        });
    }

    return divs.map((label, i) => {
        const se = seNames[i] ?? seNames.join(', ') ?? '';
        return {
            depth: 0,
            label,
            se,
            seMembers: se ? buildSeMembers([se], se) : [],
        };
    });
}

/** Single-line text for CSV / alerts */
export function formatLeadJobLinesPlain(lines) {
    return lines
        .map((ln) => {
            const sePart = ln.se ? ` (${ln.se})` : '';
            const prefix = ln.depth > 0 ? '--> ' : '';
            return `${prefix}${ln.label}${sePart}`;
        })
        .join(' | ');
}
