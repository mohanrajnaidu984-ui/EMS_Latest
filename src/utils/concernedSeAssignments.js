import { inferAssignedSEsForEnquiryForItem } from './inferAssignedSEsForEnquiryForItem';

function divisionNameForEnquiryForItem(item) {
    return String(item?.itemName || item?.name || item?.ItemName || '').trim();
}

function itemKeyForEnquiryForItem(item, idx) {
    return String(item?.id ?? item?.ID ?? `idx-${idx}`);
}

/** Resolve hierarchical L-code (L1, L1-L2, …) for an Enquiry For row. */
export function resolveLeadJobCodeForEnquiryForItem(item, allItems) {
    if (!item || typeof item !== 'object') return null;

    const explicit = item.leadJobCode ?? item.LeadJobCode;
    if (explicit && /^L\d+(-L\d+)*$/i.test(String(explicit).trim())) {
        return String(explicit).trim().toUpperCase();
    }

    const items = Array.isArray(allItems) ? allItems : [];
    const byId = new Map(items.map((i) => [String(i.id ?? i.ID), i]));
    const chain = [];
    let current = item;
    let safety = 0;
    while (current && safety < 40) {
        chain.unshift(current);
        const parentId = current.parentId ?? current.ParentID;
        current = parentId ? byId.get(String(parentId)) : null;
        safety += 1;
    }

    const segments = [];
    for (const node of chain) {
        const parentId = node.parentId ?? node.ParentID;
        const siblings = parentId
            ? items.filter((i) => String(i.parentId ?? i.ParentID) === String(parentId))
            : items.filter((i) => !(i.parentId ?? i.ParentID));
        const idx = siblings.findIndex((s) => String(s.id ?? s.ID) === String(node.id ?? node.ID));
        if (idx === -1) return null;
        segments.push(`L${idx + 1}`);
    }

    if (segments.length === 0) return null;
    if (segments.length === 1) return segments[0];
    return segments.join('-');
}

/** One accountable SE per structure division row; ownJob stores that division label. */
function finalizeAccountability(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const winnerByScope = new Map();

    for (const row of list) {
        const code = String(row.leadJobCode || '').trim().toUpperCase();
        const own = String(row.ownJob || '').trim().toLowerCase();
        const scopeKey = own ? `${code}|${own}` : code;
        if (!scopeKey) continue;
        if (String(row.accountability || '').trim().toLowerCase() === 'yes') {
            winnerByScope.set(scopeKey, row.seName);
        }
    }

    return list.map((row) => {
        const code = String(row.leadJobCode || '').trim().toUpperCase();
        const own = String(row.ownJob || '').trim().toLowerCase();
        const scopeKey = own ? `${code}|${own}` : code;
        if (!scopeKey || !winnerByScope.has(scopeKey)) return row;
        const winner = winnerByScope.get(scopeKey);
        return {
            ...row,
            accountability: row.seName === winner ? 'Yes' : null,
            ownJob: row.seName === winner ? row.ownJob || null : null,
        };
    });
}

/** @deprecated use finalizeAccountability */
export function finalizeSingleAccountablePerLeadJob(rows) {
    return finalizeAccountability(rows);
}

/** Build ConcernedSE rows from per-item SE chips + accountable selection. */
export function buildConcernedSEAssignmentsFromEnquiryFor(enqForList) {
    const items = Array.isArray(enqForList) ? enqForList : [];
    const seen = new Map();

    for (let idx = 0; idx < items.length; idx++) {
        const rawItem = items[idx];
        if (!rawItem || typeof rawItem !== 'object') continue;

        const assignees = (Array.isArray(rawItem.assignedSEs) ? rawItem.assignedSEs : [])
            .map((n) => String(n || '').trim())
            .filter(Boolean);
        if (assignees.length === 0) continue;

        const divisionName = divisionNameForEnquiryForItem(rawItem);
        const leadJobCode = resolveLeadJobCodeForEnquiryForItem(rawItem, items);
        const explicitAccountable = String(rawItem.accountableSE || '').trim();
        const accountable =
            explicitAccountable && assignees.includes(explicitAccountable)
                ? explicitAccountable
                : assignees.length === 1
                  ? assignees[0]
                  : null;

        for (const seName of assignees) {
            const dedupeKey = `${itemKeyForEnquiryForItem(rawItem, idx)}|${seName}`;
            if (seen.has(dedupeKey)) continue;

            const isAccountable = Boolean(accountable && seName === accountable);
            seen.set(dedupeKey, {
                seName,
                leadJobCode: leadJobCode || null,
                accountability: isAccountable ? 'Yes' : null,
                ownJob: isAccountable && divisionName ? divisionName : null,
            });
        }
    }

    return finalizeAccountability([...seen.values()]);
}

function concernedRowsForEnquiryForItem(item, rows, allItems) {
    const division = divisionNameForEnquiryForItem(item);
    const code = resolveLeadJobCodeForEnquiryForItem(item, allItems);
    const codeNorm = code ? code.toUpperCase() : '';

    return (rows || []).filter((r) => {
        const ownJob = String(r.OwnJob || r.ownJob || '').trim();
        if (ownJob && division && ownJob.toLowerCase() === division.toLowerCase()) return true;

        const rc = String(r.LeadJobCode || r.leadJobCode || '')
            .trim()
            .toUpperCase();
        if (!codeNorm || !rc) return !ownJob;
        return rc === codeNorm && !ownJob;
    });
}

/** Map saved ConcernedSE rows back onto Enquiry For items for modify/recall. */
export function hydrateEnquiryForWithConcernedSEAssignments(items, concernedRows, users) {
    const list = Array.isArray(items) ? items : [];
    const rows = Array.isArray(concernedRows) ? concernedRows : [];
    const allSeNames = [
        ...new Set(rows.map((r) => String(r.SEName || r.seName || '').trim()).filter(Boolean)),
    ];

    return list.map((rawItem, idx) => {
        const item =
            typeof rawItem === 'string'
                ? {
                      itemName: rawItem,
                      id: `legacy-${idx}-${String(rawItem).slice(0, 40)}`,
                      parentId: null,
                      assignedSEs: [],
                  }
                : { ...rawItem };

        const rowsForItem = concernedRowsForEnquiryForItem(item, rows, list);

        const seNamesForItem = rowsForItem
            .map((r) => String(r.SEName || r.seName || '').trim())
            .filter(Boolean);

        const explicit = Array.isArray(item.assignedSEs) ? item.assignedSEs.filter(Boolean) : [];
        const assignedSEs =
            explicit.length > 0
                ? explicit
                : inferAssignedSEsForEnquiryForItem(
                      { ...item, assignedSEs: [] },
                      seNamesForItem.length > 0 ? seNamesForItem : allSeNames,
                      users
                  );

        const division = divisionNameForEnquiryForItem(item);
        const accountableRow = rowsForItem
            .filter((r) => {
                const acc = String(r.Accountability || r.accountability || '')
                    .trim()
                    .toLowerCase();
                const name = String(r.SEName || r.seName || '').trim();
                if (acc !== 'yes' || !assignedSEs.includes(name)) return false;
                const ownJob = String(r.OwnJob || r.ownJob || '').trim();
                if (ownJob && division) return ownJob.toLowerCase() === division.toLowerCase();
                return true;
            })
            .pop();

        const accountableSE =
            String(item.accountableSE || '').trim() ||
            accountableRow?.SEName ||
            accountableRow?.seName ||
            (assignedSEs.length === 1 ? assignedSEs[0] : '');

        return {
            ...item,
            assignedSEs,
            accountableSE,
        };
    });
}
