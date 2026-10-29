/**
 * Option (a) offscreen Paged.js break engine (optional).
 *
 * The visible quote UI uses the original A4 sheets + ClauseEditor. This module is the
 * ONLY place Paged.js should run for pagination: in a hidden iframe, using the same
 * export CSS as the live preview, then mapping unit ids → page index groups that feed
 * `setClauseSegmentPageGroups`.
 *
 * Not wired by default — enabling must not replace the editor DOM or restyle cover/tables.
 * Call `computePagedBreakPageGroups(html, { assetOrigin })` from the pack effect when ready.
 */

/**
 * @param {string} continuousHtml — flow HTML with data-ems-unit-id markers + existing quote classes
 * @param {{ assetOrigin?: string, timeoutMs?: number }} [opts]
 * @returns {Promise<{ ok: boolean, pageCount: number, unitPages: Record<string, number>, error?: string }>}
 */
export async function computePagedBreakPageGroups(continuousHtml, opts = {}) {
    const assetOrigin = String(opts.assetOrigin || (typeof window !== 'undefined' ? window.location.origin : '')).replace(
        /\/?$/,
        ''
    );
    const timeoutMs = Math.max(3000, Number(opts.timeoutMs) || 20000);
    if (typeof document === 'undefined' || !continuousHtml) {
        return { ok: false, pageCount: 0, unitPages: {}, error: 'no-dom' };
    }

    const docHtml = `<!DOCTYPE html><html data-ems-paged-break="1"><head>
<meta charset="utf-8"/>
<base href="${assetOrigin}/"/>
</head><body>${continuousHtml}
<script src="${assetOrigin}/vendor/pagedjs/paged.polyfill.js"><\/script>
</body></html>`;

    return new Promise((resolve) => {
        const iframe = document.createElement('iframe');
        iframe.setAttribute('aria-hidden', 'true');
        iframe.style.cssText =
            'position:fixed;left:-10000px;top:0;width:210mm;height:297mm;opacity:0;pointer-events:none;border:0';
        const blob = new Blob([docHtml], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        let settled = false;
        const finish = (result) => {
            if (settled) return;
            settled = true;
            try {
                URL.revokeObjectURL(url);
            } catch {
                /* ignore */
            }
            try {
                iframe.remove();
            } catch {
                /* ignore */
            }
            resolve(result);
        };
        const timer = setTimeout(
            () => finish({ ok: false, pageCount: 0, unitPages: {}, error: 'timeout' }),
            timeoutMs
        );
        iframe.onload = () => {
            const idoc = iframe.contentDocument;
            if (!idoc) {
                clearTimeout(timer);
                finish({ ok: false, pageCount: 0, unitPages: {}, error: 'no-doc' });
                return;
            }
            let tries = 0;
            const poll = () => {
                const pages = [...idoc.querySelectorAll('.pagedjs_page')];
                if (pages.length > 0) {
                    clearTimeout(timer);
                    /** @type {Record<string, number>} */
                    const unitPages = {};
                    pages.forEach((page, pageIdx) => {
                        page.querySelectorAll('[data-ems-unit-id]').forEach((el) => {
                            const id = el.getAttribute('data-ems-unit-id');
                            if (id && unitPages[id] == null) unitPages[id] = pageIdx;
                        });
                    });
                    finish({ ok: true, pageCount: pages.length, unitPages });
                    return;
                }
                tries += 1;
                if (tries > 100) {
                    clearTimeout(timer);
                    finish({ ok: false, pageCount: 0, unitPages: {}, error: 'no-pages' });
                    return;
                }
                setTimeout(poll, 100);
            };
            poll();
        };
        document.body.appendChild(iframe);
        iframe.src = url;
    });
}
