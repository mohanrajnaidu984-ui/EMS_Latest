import { inferAssignedSEsForEnquiryForItem } from './inferAssignedSEsForEnquiryForItem';

/** Resolve L-code (L1, L2, …) for an Enquiry For row — matches HierarchyBuilder root prefix logic. */
export function resolveLeadJobCodeForEnquiryForItem(item, allItems) {
    if (!item || typeof item !== 'object') return null;

    let code = item.leadJobCode ?? item.LeadJobCode;
    if (code && /^L\d+$/i.test(String(code).trim())) {
        return String(code).trim().toUpperCase();
    }

    const items = Array.isArray(allItems) ? allItems : [];
    const byId = new Map(items.map((i) => [String(i.id), i]));
    let current = item;
    let safety = 0;
    while (current?.parentId && safety < 40) {
        const parent = byId.get(String(current.parentId));
        if (!parent) break;
        current = parent;
        safety += 1;
    }

    const roots = items.filter((i) => !i.parentId);
    const rootIndex = roots.findIndex((r) => String(r.id) === String(current?.id));
    if (rootIndex === -1) return null;
    return `L${rootIndex + 1}`;
}

/** Only one SE may be accountable per lead job (L-code); last marked Yes wins in payload order. */
export function finalizeSingleAccountablePerLeadJob(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const winnerByCode = new Map();

    for (const row of list) {
        const code = String(row.leadJobCode || '').trim().toUpperCase();
        if (!code) continue;
        if (String(row.accountability || '').trim().toLowerCase() === 'yes') {
            winnerByCode.set(code, row.seName);
        }
    }

    return list.map((row) => {
        const code = String(row.leadJobCode || '').trim().toUpperCase();
        if (!code || !winnerByCode.has(code)) return row;
        const winner = winnerByCode.get(code);
        return {
            ...row,
            accountability: row.seName === winner ? 'Yes' : null,
        };
    });
}

/** Build ConcernedSE rows from per-item SE chips + accountable selection. */
export function buildConcernedSEAssignmentsFromEnquiryFor(enqForList) {
    const items = Array.isArray(enqForList) ? enqForList : [];
    const accountableByCode = new Map();
    const seen = new Map();

    for (const rawItem of items) {
        if (!rawItem || typeof rawItem !== 'object') continue;

        const assignees = (Array.isArray(rawItem.assignedSEs) ? rawItem.assignedSEs : [])
            .map((n) => String(n || '').trim())
            .filter(Boolean);
        if (assignees.length === 0) continue;

        const leadJobCode = resolveLeadJobCodeForEnquiryForItem(rawItem, items);
        const codeKey = leadJobCode ? String(leadJobCode).trim().toUpperCase() : '';
        const explicitAccountable = String(rawItem.accountableSE || '').trim();

        if (codeKey) {
            if (explicitAccountable && assignees.includes(explicitAccountable)) {
                accountableByCode.set(codeKey, explicitAccountable);
            } else if (assignees.length === 1) {
                accountableByCode.set(codeKey, assignees[0]);
            }
        }

        for (const seName of assignees) {
            const key = `${codeKey}|${seName}`;
            if (!seen.has(key)) {
                seen.set(key, {
                    seName,
                    leadJobCode: leadJobCode || null,
                    accountability: null,
                });
            }
        }
    }

    return [...seen.values()].map((row) => {
        const codeKey = String(row.leadJobCode || '').trim().toUpperCase();
        const winner = codeKey ? accountableByCode.get(codeKey) : null;
        return {
            ...row,
            accountability: winner && row.seName === winner ? 'Yes' : null,
        };
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

        const code = resolveLeadJobCodeForEnquiryForItem(item, list);
        const codeNorm = code ? code.toUpperCase() : '';

        const rowsForCode = rows.filter((r) => {
            const rc = String(r.LeadJobCode || r.leadJobCode || '')
                .trim()
                .toUpperCase();
            if (!codeNorm || !rc) return true;
            return rc === codeNorm;
        });

        const seNamesForCode = rowsForCode
            .map((r) => String(r.SEName || r.seName || '').trim())
            .filter(Boolean);

        const explicit = Array.isArray(item.assignedSEs) ? item.assignedSEs.filter(Boolean) : [];
        const assignedSEs =
            explicit.length > 0
                ? explicit
                : inferAssignedSEsForEnquiryForItem(
                      { ...item, assignedSEs: [] },
                      seNamesForCode.length > 0 ? seNamesForCode : allSeNames,
                      users
                  );

        const accountableRow = rowsForCode
            .filter((r) => {
                const acc = String(r.Accountability || r.accountability || '')
                    .trim()
                    .toLowerCase();
                const name = String(r.SEName || r.seName || '').trim();
                return acc === 'yes' && assignedSEs.includes(name);
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
