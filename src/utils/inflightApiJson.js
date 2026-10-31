// Coalesce concurrent reads only. Once a request completes, the next read is
// fresh. Identity/scope parameters remain part of the full URL key.
const pending = new Map();

export function readJsonInFlight(url) {
    if (!pending.has(url)) {
        const request = fetch(url)
            .then(async response => ({
                ok: response.ok, status: response.status,
                data: response.ok ? await response.json() : null,
            }))
            .finally(() => pending.delete(url));
        pending.set(url, request);
    }
    return pending.get(url);
}
