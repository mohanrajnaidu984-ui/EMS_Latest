import { afterEach, expect, it, vi } from 'vitest';
import { readJsonInFlight } from '../../../utils/inflightApiJson.js';

afterEach(() => vi.unstubAllGlobals());

it('shares concurrent reads but fetches fresh data after completion and keeps users separate', async () => {
    const fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ['quote'] }));
    vi.stubGlobal('fetch', fetch);
    const first = readJsonInFlight('/quotes?userEmail=a');
    expect(readJsonInFlight('/quotes?userEmail=a')).toBe(first);
    await readJsonInFlight('/quotes?userEmail=b');
    await first;
    expect(fetch).toHaveBeenCalledTimes(2);
    await readJsonInFlight('/quotes?userEmail=a');
    expect(fetch).toHaveBeenCalledTimes(3);
});

it('allows retry after a failed read', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] });
    vi.stubGlobal('fetch', fetch);
    await expect(readJsonInFlight('/retry')).rejects.toThrow('offline');
    await expect(readJsonInFlight('/retry')).resolves.toMatchObject({ ok: true, data: [] });
});
