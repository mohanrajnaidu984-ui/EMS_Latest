/**
 * Resolves SE/EE/QS names for one Enquiry For row: explicit assignedSEs first, then
 * Concerned SE list + Master users (department match), then fuzzy match, then trust saved seList.
 * Mirrors EnquiryForm.jsx logic so list views match the form.
 *
 * @param {object|string} item - EnquiryFor row or legacy string
 * @param {string[]} seList - Concerned SE names for the enquiry
 * @param {{ FullName?: string, Department?: string }[]} users - Master users (from /api/users)
 */
export function inferAssignedSEsForEnquiryForItem(item, seList, users) {
    if (!Array.isArray(seList) || seList.length === 0) return [];

    if (typeof item === 'string') {
        return seList.map((n) => String(n || '').trim()).filter(Boolean);
    }

    const assigned = Array.isArray(item?.assignedSEs)
        ? item.assignedSEs.filter(Boolean)
        : item?.assignedSE ? [item.assignedSE] : [];
    if (assigned.length > 0) return assigned.map((n) => String(n || '').trim()).filter(Boolean);

    const userList = Array.isArray(users) ? users : [];
    const normalize = (s) => String(s || '').trim().toLowerCase();
    const itemBase = (name) => {
        const raw = String(name || '').replace(/^L\d+\s*-\s*/i, '').trim();
        const parts = raw.split(' - ');
        return normalize(parts.length > 1 ? parts[parts.length - 1] : raw);
    };
    const selectedSet = new Set(seList.map((n) => normalize(n)).filter(Boolean));
    const dept = itemBase(item?.itemName || item?.name || '');

    const exact = userList
        .filter((u) => dept && normalize(u?.Department) === dept && selectedSet.has(normalize(u?.FullName)))
        .map((u) => String(u?.FullName || '').trim())
        .filter(Boolean);
    if (exact.length > 0) return [...new Set(exact)];

    const fuzzy = userList
        .filter((u) => {
            const d = normalize(u?.Department);
            const fn = normalize(u?.FullName);
            if (!d || !selectedSet.has(fn)) return false;
            return !!(dept && (dept.includes(d) || d.includes(dept)));
        })
        .map((u) => String(u?.FullName || '').trim())
        .filter(Boolean);
    if (fuzzy.length > 0) return [...new Set(fuzzy)];

    const verified = seList.filter((n) => userList.some((u) => normalize(u?.FullName) === normalize(n)));
    if (verified.length > 0) return verified;

    return seList.map((n) => String(n || '').trim()).filter(Boolean);
}
