/**
 * Read a fetch Response body as JSON. Handles empty bodies and non-JSON (e.g. HTML error pages).
 * @returns {{ ok: boolean, status: number, data: object }}
 */
export async function readApiJson(res) {
    const text = await res.text();
    if (!text || !text.trim()) {
        return { ok: res.ok, status: res.status, data: {} };
    }
    try {
        return { ok: res.ok, status: res.status, data: JSON.parse(text) };
    } catch {
        return { ok: res.ok, status: res.status, data: {}, invalidJson: true };
    }
}
