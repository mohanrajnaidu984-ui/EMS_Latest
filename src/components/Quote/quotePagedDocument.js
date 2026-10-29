/**
 * Continuous quote HTML + Paged.js stylesheet — one source for preview iframe and PDF.
 */

import { buildQuotePackFontFaceCss, QUOTE_PACK_FONT_STACK } from './quotePackFonts.js';
import { sanitizeQuoteRichHtml } from './quoteSanitizeHtml.js';

function esc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function buildQuotePagedStylesheet(assetOrigin = '') {
    const fonts = buildQuotePackFontFaceCss(assetOrigin);
    return `
${fonts}
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  background: #fff;
  font-family: ${QUOTE_PACK_FONT_STACK};
  font-size: 13px;
  line-height: 1.45;
  color: #0f172a;
  -webkit-font-smoothing: antialiased;
}
@page {
  size: A4 portrait;
  margin: 36mm 15mm 41mm 15mm;
  @top-right {
    content: element(ems-running-logo);
    vertical-align: top;
    /* Margin box starts at page top; pad so logo top edge is 15 mm down. */
    padding-top: 15mm;
  }
  @bottom-center {
    content: element(ems-running-footer);
    vertical-align: top;
    padding-top: 0;
  }
}
@page :first {
  margin: 15mm;
  @top-right { content: none; }
  @bottom-center { content: none; }
}
.ems-running-logo {
  position: running(ems-running-logo);
  width: 180mm;
  text-align: right;
  height: 21mm;
  margin: 0;
  padding: 0;
}
.ems-running-logo img {
  height: 18mm;
  max-height: 18mm;
  width: auto;
  display: inline-block;
  margin-top: 0;
}
.ems-running-footer {
  position: running(ems-running-footer);
  width: 180mm;
  font-size: 10px;
  color: #64748b;
  text-align: left;
  line-height: 1.25;
  border-top: 0.35px solid #94a3b8;
  padding-top: 3px;
  margin: 0;
}
.ems-running-footer .ems-page-num::before {
  content: "Page " counter(page) " of " counter(pages);
  font-weight: 600;
  display: block;
  margin-bottom: 2px;
  color: #64748b;
}
.ems-quote-flow {
  max-width: 180mm;
  margin: 0 auto;
}
.ems-cover {
  break-after: page;
  page-break-after: always;
}
.ems-cover-logo {
  text-align: right;
  height: 21mm;
  margin: 0 0 6px;
}
.ems-cover-logo img {
  height: 18mm;
  max-height: 18mm;
  width: auto;
}
.ems-cover-header-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 10px;
}
.ems-cover-panel {
  border: 0.5px solid #cbd5e1;
  border-radius: 6px;
  overflow: hidden;
  font-size: 12px;
}
.ems-cover-panel-label {
  display: block;
  font-size: 11px;
  font-weight: 700;
  padding: 4px 8px;
  background: linear-gradient(90deg, #1e3a5f, #2c5282);
  color: #fff;
}
.ems-cover-panel-body { padding: 6px 8px; }
.ems-cover-panel-row {
  display: grid;
  grid-template-columns: 88px 1fr;
  gap: 4px;
  margin: 2px 0;
}
.ems-cover-panel-row .lbl { color: #64748b; font-weight: 600; }
.ems-cover-meta-table {
  width: 100%;
  border-collapse: collapse;
  margin: 8px 0 10px;
  font-size: 12px;
}
.ems-cover-meta-table td {
  padding: 5px 8px;
  border: 0.5px solid #cbd5e1;
  vertical-align: top;
}
.ems-cover-meta-table td:first-child {
  width: 120px;
  background: #e8eef7;
  font-weight: 600;
  color: #1e3a5f;
}
.ems-cover-letter p {
  margin: 0 0 0.7em;
  orphans: 2;
  widows: 2;
  text-align: left;
}
.ems-cover-sign-off {
  margin-top: 18px;
}
.ems-cover-sign-off-for {
  margin: 0 0 28px;
  font-weight: 600;
}
.ems-cover-signatory-line {
  border-top: 0.5px solid #94a3b8;
  padding-top: 4px;
  min-width: 160px;
  display: inline-block;
  font-weight: 600;
}
.ems-cover-signatory-designation {
  font-size: 12px;
  color: #64748b;
  margin-top: 2px;
}
.ems-section {
  margin: 0 0 10px;
}
.ems-section-title,
h2.section {
  font-size: 14px;
  font-weight: 700;
  margin: 12px 0 6px;
  padding: 4px 8px;
  background: #e8eef7;
  color: #1e3a5f;
  border-radius: 4px;
  break-after: avoid;
  break-inside: avoid;
  page-break-after: avoid;
  page-break-inside: avoid;
}
.ems-section-title:first-child { margin-top: 0; }
.ems-clause-body {
  font-size: 13px;
  line-height: 1.45;
}
.ems-clause-body p {
  margin: 0 0 0.55em;
  orphans: 2;
  widows: 2;
  text-align: left;
  text-align-last: left;
}
.ems-clause-body p:last-child { margin-bottom: 0; }
.ems-clause {
  position: relative;
  padding-left: var(--label-w, 0);
}
.ems-clause > .no {
  position: absolute;
  left: 0;
  top: 0;
  width: var(--label-w, 0);
}
.ems-clause-body table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  margin: 6px 0 10px;
  font-size: 12px;
}
.ems-clause-body th,
.ems-clause-body td {
  border: 0.5px solid #94a3b8;
  padding: 3px 5px;
  vertical-align: top;
  break-inside: avoid;
  page-break-inside: avoid;
}
.ems-clause-body thead { display: table-header-group; }
.ems-clause-body tfoot { display: table-row-group; }
.ems-clause-body tr {
  break-inside: avoid;
  page-break-inside: avoid;
}
.ems-boq-note-block {
  margin: 8px 0 12px;
  break-inside: avoid;
  page-break-inside: avoid;
}
.ems-boq-note-block p { margin: 0 0 0.4em; }
.pagedjs_page {
  background: #fff;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.12);
  margin: 0 auto 12px;
}
`.trim();
}

function buildCoverHtml(cover = {}) {
    const toName = esc(cover.toName);
    const toAddress = esc(cover.toAddress);
    const toAttention = esc(cover.toAttention);
    const projectName = esc(cover.projectName);
    const subject = esc(cover.subject);
    const quoteRef = esc(cover.quoteRef);
    const quoteDate = esc(cover.quoteDate);
    const validity = esc(cover.validity);
    const customerRef = esc(cover.customerRef);
    const quoteType = esc(cover.quoteType);
    const preparedBy = esc(cover.preparedBy);
    const preparedContact = esc(cover.preparedContact);
    const preparedEmail = esc(cover.preparedEmail);
    const company = esc(cover.companyName);
    const signatory = esc(cover.signatoryName);
    const designation = esc(cover.signatoryDesignation);
    const coSignatory = esc(cover.coSignatoryName);
    const coDesignation = esc(cover.coSignatoryDesignation);

    return `
<div class="ems-cover-header-grid">
  <div class="ems-cover-panel">
    <span class="ems-cover-panel-label">To</span>
    <div class="ems-cover-panel-body">
      <div><strong>${toName || '&nbsp;'}</strong></div>
      <div style="white-space:pre-line">${toAddress || ''}</div>
      ${toAttention ? `<div style="margin-top:4px">Attn: ${toAttention}</div>` : ''}
    </div>
  </div>
  <div class="ems-cover-panel">
    <span class="ems-cover-panel-label">Quote Details</span>
    <div class="ems-cover-panel-body">
      <div class="ems-cover-panel-row"><span class="lbl">Quote Ref:</span><span>${quoteRef}</span></div>
      <div class="ems-cover-panel-row"><span class="lbl">Quote Date:</span><span>${quoteDate}</span></div>
      <div class="ems-cover-panel-row"><span class="lbl">Validity:</span><span>${validity}</span></div>
      <div class="ems-cover-panel-row"><span class="lbl">Customer Ref:</span><span>${customerRef}</span></div>
      <div class="ems-cover-panel-row"><span class="lbl">Type:</span><span>${quoteType}</span></div>
      <div class="ems-cover-panel-row"><span class="lbl">Prepared By:</span><span>${preparedBy}</span></div>
      ${preparedContact ? `<div class="ems-cover-panel-row"><span class="lbl">Contact:</span><span>${preparedContact}</span></div>` : ''}
      ${preparedEmail ? `<div class="ems-cover-panel-row"><span class="lbl">E-mail:</span><span>${preparedEmail}</span></div>` : ''}
    </div>
  </div>
</div>
<table class="ems-cover-meta-table" role="presentation"><tbody>
  <tr><td>Project Name:</td><td>${projectName}</td></tr>
  <tr><td>Subject:</td><td>${subject}</td></tr>
  <tr><td>Attention of:</td><td>${toAttention}</td></tr>
</tbody></table>
<div class="ems-cover-letter">
  <p>Dear Sir/Madam,</p>
  <p>Thank you for providing us with this opportunity to submit our offer for the below-mentioned inclusions. We have carefully reviewed your requirements to ensure that our proposal aligns perfectly. We are pleased to submit our quotation as per the details mentioned below. It is our pleasure to serve you and we assure you that our best efforts will always be made to meet your needs.</p>
  <p>We hope you will find our offer competitive and kindly revert to us for any clarifications.</p>
</div>
<div class="ems-cover-sign-off">
  <p class="ems-cover-sign-off-for">For ${company || 'the Company'},</p>
  <div class="ems-cover-signatory-line">${signatory || '&nbsp;'}</div>
  <div class="ems-cover-signatory-designation">${designation || '&nbsp;'}</div>
  ${
      coSignatory
          ? `<div style="margin-top:16px"><p class="ems-cover-sign-off-for">For ${company || 'the Company'},</p>
  <div class="ems-cover-signatory-line">${coSignatory}</div>
  <div class="ems-cover-signatory-designation">${coDesignation || '&nbsp;'}</div></div>`
          : ''
  }
</div>`;
}

/**
 * @param {object} opts
 */
export function buildQuotePagedDocumentHtml(opts = {}) {
    /*
     * srcdoc iframes resolve as about:srcdoc — root-relative /fonts and /vendor URLs make
     * Paged.js throw: Failed to construct 'URL': Invalid URL. Always prefer an absolute origin.
     */
    let assetOrigin = String(opts.assetOrigin || '').replace(/\/?$/, '');
    if (!assetOrigin && typeof window !== 'undefined' && window.location?.origin) {
        assetOrigin = String(window.location.origin).replace(/\/?$/, '');
    }
    const css = buildQuotePagedStylesheet(assetOrigin);
    const logoSrc = String(opts.logoSrc || '').trim();
    const absLogo =
        logoSrc &&
        !/^https?:|^data:/i.test(logoSrc) &&
        assetOrigin
            ? `${assetOrigin}${logoSrc.startsWith('/') ? '' : '/'}${logoSrc}`
            : logoSrc;
    const logoHtml = absLogo
        ? `<img src="${esc(absLogo)}" alt="Logo" />`
        : String(opts.logoHtml || '').trim();
    const coverHtml = opts.coverHtml ? String(opts.coverHtml) : buildCoverHtml(opts.cover || {});
    const footerCompany = String(opts.footerCompanyHtml || '').trim();
    const pagedScriptSrc = opts.inlinePagedScript
        ? null
        : assetOrigin
          ? `${assetOrigin}/vendor/pagedjs/paged.polyfill.js`
          : '/vendor/pagedjs/paged.polyfill.js';

    /** @type {string[]} */
    const unitIds = ['cover'];
    const clauseHtml = (opts.clauses || [])
        .map((c) => {
            const major = c.displayMajor;
            const title = esc(c.title || '');
            const headingHtml = c.headingHtml
                ? sanitizeQuoteRichHtml(c.headingHtml)
                : `${major}. ${title}`;
            let body = sanitizeQuoteRichHtml(c.content || '');
            if (assetOrigin) {
                body = body
                    .replace(
                        /(\s(?:src|href)=["'])(\/(?:uploads|fonts|vendor)\/[^"']+)(["'])/gi,
                        `$1${assetOrigin}$2$3`
                    )
                    .replace(
                        /url\(\s*['"]?(\/(?:uploads|fonts|vendor)\/[^'")\s]+)['"]?\s*\)/gi,
                        `url('${assetOrigin}$1')`
                    );
            }
            const unitId = `clause-${c.listKey || major}`;
            unitIds.push(unitId, `${unitId}-heading`, `${unitId}-body`);
            return `
<section class="ems-section ems-unit" data-ems-unit-id="${unitId}" data-ems-clause="${esc(c.listKey || '')}">
  <h2 class="ems-section-title section" data-ems-unit-id="${unitId}-heading">${headingHtml}</h2>
  <div class="ems-clause-body" data-ems-unit-id="${unitId}-body">${body}</div>
</section>`;
        })
        .join('\n');

    const flowInner = `
    <section class="ems-cover ems-unit" data-ems-unit-id="cover">
      <div class="ems-cover-logo">${logoHtml || ''}</div>
      ${coverHtml}
    </section>
    ${clauseHtml}`;

    const sourceText = normalizeQuoteFlowText(
        flowInner
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
    );

    const bootScript = `
<script>
  window.__EMS_SOURCE_TEXT__ = ${JSON.stringify(sourceText)};
  window.__EMS_UNIT_IDS__ = ${JSON.stringify(unitIds)};
  (function () {
    function markReady(ok, detail) {
      document.documentElement.setAttribute('data-ems-paged-ready', ok ? '1' : '0');
      if (detail) document.documentElement.setAttribute('data-ems-paged-detail', String(detail));
      window.__EMS_PAGED_READY__ = !!ok;
      window.__EMS_PAGED_DETAIL__ = detail || '';
      try {
        if (document.fonts) {
          console.info('[EMS paged] fonts status',
            [...document.fonts].map(function (f) { return f.family + ':' + f.status; }).slice(0, 16));
        }
      } catch (e) {}
    }
    function watchPages() {
      var tries = 0;
      var t = setInterval(function () {
        tries += 1;
        var pages = document.querySelectorAll('.pagedjs_page');
        if (pages.length > 0) {
          clearInterval(t);
          markReady(true, 'pages=' + pages.length);
        } else if (tries > 120) {
          clearInterval(t);
          markReady(false, 'timeout');
        }
      }, 100);
    }
    function run() {
      watchPages();
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(run).catch(run);
    } else {
      run();
    }
  })();
</script>`;

    const pagedTag = pagedScriptSrc
        ? `<script src="${pagedScriptSrc}"></script>`
        : opts.inlinePagedScript
          ? `<script>${opts.inlinePagedScript}</script>`
          : `<script src="${assetOrigin || ''}/vendor/pagedjs/paged.polyfill.js"></script>`;

    const baseTag = assetOrigin
        ? `<base href="${esc(assetOrigin)}/" />`
        : '';

    /* Guard Paged.js replaceUrls — relative/empty url() in pasted CSS must not crash preview. */
    const urlGuard = `<script>
(function () {
  var Orig = window.URL;
  if (!Orig || Orig.__emsPagedPatched) return;
  function SafeURL(url, base) {
    try { return new Orig(url, base); } catch (e1) {
      try {
        var abs = String(url || '').replace(/^['"]|['"]$/g, '');
        if (/^(https?:|data:|blob:)/i.test(abs)) return new Orig(abs);
        var origin = ${JSON.stringify(assetOrigin || '')} || (location.origin && location.origin !== 'null' ? location.origin : '');
        if (origin && abs.charAt(0) === '/') return new Orig(origin + abs);
        if (origin) return new Orig(origin + '/' + abs.replace(/^\\.\\//, ''));
      } catch (e2) {}
      return new Orig('about:blank');
    }
  }
  SafeURL.prototype = Orig.prototype;
  SafeURL.createObjectURL = Orig.createObjectURL.bind(Orig);
  SafeURL.revokeObjectURL = Orig.revokeObjectURL.bind(Orig);
  SafeURL.canParse = Orig.canParse ? Orig.canParse.bind(Orig) : undefined;
  SafeURL.parse = Orig.parse ? Orig.parse.bind(Orig) : undefined;
  SafeURL.__emsPagedPatched = true;
  window.URL = SafeURL;
})();
</script>`;

    return `<!DOCTYPE html>
<html lang="en" data-ems-paged="1">
<head>
<meta charset="utf-8"/>
${baseTag}
<title>EMS Quote</title>
<style>${css}</style>
</head>
<body>
  <div class="ems-running-logo">${logoHtml || ''}</div>
  <div class="ems-running-footer">
    <div class="ems-page-num"></div>
    <div class="ems-footer-company">${footerCompany}</div>
  </div>
  <div class="ems-quote-flow" id="ems-quote-flow">
    ${flowInner}
  </div>
  ${urlGuard}
  ${pagedTag}
  ${bootScript}
</body>
</html>`;
}

export function normalizeQuoteFlowText(s) {
    return String(s || '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function extractFlowPlainText(html) {
    if (typeof DOMParser === 'undefined') {
        return normalizeQuoteFlowText(
            String(html || '')
                .replace(/<script[\s\S]*?<\/script>/gi, '')
                .replace(/<style[\s\S]*?<\/style>/gi, '')
                .replace(/<[^>]+>/g, ' ')
        );
    }
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    doc.querySelectorAll('script, style, .ems-running-logo, .ems-running-footer').forEach((el) => el.remove());
    return normalizeQuoteFlowText(doc.body?.innerText || doc.body?.textContent || '');
}
