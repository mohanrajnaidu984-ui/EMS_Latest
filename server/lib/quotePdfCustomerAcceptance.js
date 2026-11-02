/**
 * Customer Acceptance page for quote PDFs.
 *
 * Two acceptance paths:
 *  A) No digital certificate — fill Name / Company / Date, type full name as signature,
 *     and tick "I accept this quotation".
 *  B) Digital certificate — fill Name / Company / Date + I accept, then sign the Sig box.
 *     Typed full-name signature is NOT required for path B.
 *
 * After a digital certificate is applied, Lock seals all fields. Quote body stays
 * non-editable via restrictQuotePdf.
 */
const { PDFDocument, StandardFonts, rgb, PDFName, PDFNumber, PDFString } = require('pdf-lib');
const { PDFAcroSignature } = require('pdf-lib/cjs/core/acroform');
const { PDFWidgetAnnotation, AnnotationFlags } = require('pdf-lib/cjs/core/annotation');
const { PDFSignature } = require('pdf-lib/cjs/api/form');

/** Fields required before a digital certificate signature (typed name is optional). */
const REQUIRED_FOR_DIGITAL_SIGN = [
    { name: 'CustomerAcceptance.Name', label: 'Accepted by (Name)' },
    { name: 'CustomerAcceptance.Company', label: 'Company / Designation' },
    { name: 'CustomerAcceptance.AcceptanceDate', label: 'Acceptance Date' },
];

function buildAcceptanceFieldChecksJsArray() {
    return REQUIRED_FOR_DIGITAL_SIGN.map(
        (f) =>
            `{ name: ${JSON.stringify(f.name)}, label: ${JSON.stringify(f.label)} }`
    ).join(', ');
}

/**
 * Shared helpers for Acrobat. Safe on open: defines functions + refreshes Sig gate.
 * No app.alert on open. Typed signature is never required for digital cert path.
 */
function buildAcceptanceGateLibraryScript() {
    const checks = buildAcceptanceFieldChecksJsArray();
    return `
var __emsAcceptanceRequired = [${checks}];
var __emsAlertAt = 0;
function __emsFieldEmpty(f) {
  if (!f) return true;
  try {
    var v = f.value;
    if (v === undefined || v === null) return true;
    return String(v).replace(/^\\s+|\\s+$/g, '') === '';
  } catch (e) { return true; }
}
function __emsAcceptChecked() {
  try {
    var accept = this.getField('CustomerAcceptance.AcceptCheck');
    if (!accept) return false;
    try {
      if (accept.isBoxChecked(0) === true) return true;
    } catch (e0) {}
    try {
      var v = String(accept.value == null ? '' : accept.value);
      if (v && v !== 'Off' && v !== 'No' && v !== '0' && v.toLowerCase() !== 'false') return true;
    } catch (e1) {}
    return false;
  } catch (e2) { return false; }
}
function __emsAcceptanceMissingLabels() {
  var missing = [];
  for (var i = 0; i < __emsAcceptanceRequired.length; i++) {
    var item = __emsAcceptanceRequired[i];
    if (__emsFieldEmpty(this.getField(item.name))) missing.push(item.label);
  }
  if (!__emsAcceptChecked.call(this)) {
    missing.push('I accept this quotation (checkbox)');
  }
  return missing;
}
function __emsAcceptanceComplete() {
  return __emsAcceptanceMissingLabels.call(this).length === 0;
}
/** Single popup only — ignore duplicate triggers within 1s (A + mouse events, etc.). */
function emsShowAcceptanceFillAlert(doc) {
  var now = (new Date()).getTime();
  if (__emsAlertAt && (now - __emsAlertAt) < 1000) return;
  __emsAlertAt = now;
  var missing = [];
  try { missing = __emsAcceptanceMissingLabels.call(doc); } catch (e) {}
  var msg =
    'Please fill the required fields above before placing a digital certificate signature.\\n\\n' +
    'Complete:\\n' +
    '- Accepted by (Name)\\n' +
    '- Company / Designation\\n' +
    '- Acceptance Date\\n' +
    '- I accept this quotation (checkbox)\\n\\n' +
    'Signature (type full name) is only needed if you are not using a digital certificate.';
  if (missing && missing.length) {
    msg += '\\n\\nStill missing:\\n- ' + missing.join('\\n- ');
  }
  app.alert(msg, 3);
}
/**
 * When details incomplete: cover Sig with a button so click shows a popup.
 * When complete: hide cover and unlock Sig for certificate signing.
 */
function emsRefreshSignatureGate() {
  try {
    var complete = __emsAcceptanceComplete.call(this);
    var sig = this.getField('CustomerAcceptance.Signature');
    var cover = this.getField('CustomerAcceptance.SigClickGate');
    if (sig) sig.readonly = !complete;
    if (cover) {
      cover.display = complete ? display.hidden : display.visible;
      cover.readonly = !!complete;
    }
  } catch (e3) {}
}
emsRefreshSignatureGate();
`.trim();
}

/** WillSign AA — validate before certificate apply (fires when signing, not on open). */
function buildAcceptanceWillSignScript() {
    return `
(function () {
  if (typeof event === 'undefined' || !event) return;
  var missing = [];
  try {
    missing = __emsAcceptanceMissingLabels.call(this);
  } catch (e) {
    missing = ['Accepted by (Name)', 'Company / Designation', 'Acceptance Date', 'I accept this quotation (checkbox)'];
  }
  if (missing && missing.length) {
    try { emsShowAcceptanceFillAlert(this); } catch (eAlert) {
      app.alert('Please fill the required fields above before placing a digital certificate signature.', 3);
    }
    event.rc = false;
    try { emsRefreshSignatureGate.call(this); } catch (e4) {}
  }
})();
`.trim();
}

function attachFieldRefreshAction(pdfDoc, field) {
    if (!field?.acroField?.dict) return;
    const context = pdfDoc.context;
    const js = PDFString.of('try { emsRefreshSignatureGate.call(this); } catch (e) {}');
    const jsAction = context.obj({ Type: 'Action', S: 'JavaScript', JS: js });
    // Bl/V/C/K + U so checkbox ticks and typed values unlock the Sig box promptly
    const aa = context.obj({
        Bl: jsAction,
        V: jsAction,
        C: jsAction,
        K: jsAction,
        U: jsAction,
    });
    field.acroField.dict.set(PDFName.of('AA'), aa);
}

function attachAcceptanceWillSignAction(pdfDoc) {
    // Gate library on open (no alert) — keeps Sig field locked until details are filled.
    pdfDoc.addJavaScript('EMS_AcceptanceGate', buildAcceptanceGateLibraryScript());

    const script = buildAcceptanceWillSignScript();
    const context = pdfDoc.context;
    const jsAction = context.obj({
        Type: 'Action',
        S: 'JavaScript',
        JS: PDFString.of(script),
    });
    const existingAa = pdfDoc.catalog.dict.get(PDFName.of('AA'));
    let aaDict;
    if (existingAa) {
        try {
            aaDict = context.lookup(existingAa);
        } catch (_e) {
            aaDict = null;
        }
    }
    if (!aaDict || typeof aaDict.set !== 'function') {
        aaDict = context.obj({});
        pdfDoc.catalog.dict.set(PDFName.of('AA'), aaDict);
    }
    aaDict.set(PDFName.of('WillSign'), jsAction);
}

const ACCENT = rgb(0.125, 0.224, 0.427);
const MUTED = rgb(0.39, 0.45, 0.55);
const LINE = rgb(0.8, 0.84, 0.9);
const FIELD_BG = rgb(0.97, 0.98, 0.99);
const SIG_BG = rgb(0.9, 0.94, 0.98);
const BLACK = rgb(0.1, 0.12, 0.16);

function isCustomerAcceptanceEnabled() {
    const raw = String(process.env.QUOTE_PDF_CUSTOMER_ACCEPTANCE ?? '1').trim().toLowerCase();
    return raw !== '0' && raw !== 'false' && raw !== 'no';
}

function dash(v) {
    const s = String(v ?? '').trim();
    return s || '-';
}

function formatQuoteDateDisplay(raw) {
    const s = String(raw || '').trim();
    if (!s) return '-';
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
        const d = new Date(`${s.slice(0, 10)}T12:00:00`);
        if (!Number.isNaN(d.getTime())) {
            return d.toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
            });
        }
        return s.slice(0, 10);
    }
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
        return d.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        });
    }
    return s;
}

function drawVisibleSignatureBox(page, font, { x, y, width, height }) {
    page.drawRectangle({
        x,
        y,
        width,
        height,
        borderWidth: 2,
        borderColor: ACCENT,
        color: SIG_BG,
    });
    page.drawRectangle({
        x: x + 4,
        y: y + 4,
        width: width - 8,
        height: height - 8,
        borderWidth: 0.75,
        borderColor: rgb(0.45, 0.55, 0.7),
        borderDashArray: [4, 3],
    });
    const hint1 = 'Optional - click to sign with a digital certificate';
    const hint2 = '(Only if you have Adobe digital ID / certificate)';
    const w1 = font.widthOfTextAtSize(hint1, 10);
    const w2 = font.widthOfTextAtSize(hint2, 8);
    page.drawText(hint1, {
        x: x + Math.max(8, (width - w1) / 2),
        y: y + height / 2 + 4,
        size: 10,
        font,
        color: ACCENT,
    });
    page.drawText(hint2, {
        x: x + Math.max(8, (width - w2) / 2),
        y: y + height / 2 - 10,
        size: 8,
        font,
        color: MUTED,
    });
}

function createBlankSignatureField(pdfDoc, page, { name, x, y, width, height }) {
    const form = pdfDoc.getForm();
    const context = pdfDoc.context;

    const signatureDict = context.obj({
        FT: 'Sig',
        Kids: [],
    });
    const signatureDictRef = context.register(signatureDict);
    const acroSigField = PDFAcroSignature.fromDict(signatureDict, signatureDictRef);
    acroSigField.setPartialName(name);

    const lockDict = context.obj({
        Type: 'SigFieldLock',
        Action: 'All',
        P: 1,
    });
    acroSigField.dict.set(PDFName.of('Lock'), lockDict);

    form.acroForm.addField(acroSigField.ref);

    const sigField = PDFSignature.of(acroSigField, acroSigField.ref, pdfDoc);
    const sigWidget = PDFWidgetAnnotation.create(context, sigField.ref);
    sigWidget.setRectangle({ x, y, width, height });
    sigWidget.setP(page.ref);
    sigWidget.setFlagTo(AnnotationFlags.Print, true);
    sigWidget.setFlagTo(AnnotationFlags.Hidden, false);
    sigWidget.setFlagTo(AnnotationFlags.Invisible, false);
    sigWidget.setFlagTo(AnnotationFlags.NoView, false);
    // Start locked — Acrobat JS unlocks after Name/Company/Date + I accept (typed name not required).
    sigWidget.setFlagTo(AnnotationFlags.ReadOnly, true);
    try {
        sigField.enableReadOnly();
    } catch (_e) {
        /* older pdf-lib may lack enableReadOnly on PDFSignature */
    }

    const mk = context.obj({
        BC: [0.125, 0.224, 0.427],
        BG: [0.9, 0.94, 0.98],
    });
    sigWidget.dict.set(PDFName.of('MK'), mk);
    sigWidget.dict.set(PDFName.of('F'), PDFNumber.of(4)); // Print
    // No click alerts here — cover button shows one popup; WillSign blocks incomplete signing.

    const sigWidgetRef = context.register(sigWidget.dict);
    sigField.acroField.addWidget(sigWidgetRef);
    page.node.addAnnot(sigWidgetRef);

    form.acroForm.dict.set(PDFName.of('SigFlags'), PDFNumber.of(3));
    form.acroForm.dict.set(PDFName.of('NeedAppearances'), context.obj(true));

    return sigField;
}

/**
 * Button over the Sig box. Captures clicks while required fields are empty
 * and shows a fill-fields popup (readonly Sig fields often swallow clicks with no alert).
 */
function createSignatureClickGateButton(pdfDoc, page, { x, y, width, height, font }) {
    const form = pdfDoc.getForm();
    const btn = form.createButton('CustomerAcceptance.SigClickGate');
    // addToPage(caption, page, options) — caption keeps the blue box readable under the cover
    btn.addToPage('Fill Name, Company, Date + I accept, then click to sign', page, {
        x,
        y,
        width,
        height,
        borderWidth: 2,
        borderColor: ACCENT,
        backgroundColor: SIG_BG,
        textColor: ACCENT,
        font: font || undefined,
    });
    try {
        btn.setFontSize(10);
    } catch (_e) {
        /* ignore */
    }

    // Single activate action only (no mouse D/U) — avoids double popups.
    const clickJs = PDFString.of(`
try { emsRefreshSignatureGate.call(this); } catch (e0) {}
try {
  if (!__emsAcceptanceComplete.call(this)) {
    emsShowAcceptanceFillAlert(this);
  }
} catch (e1) {
  app.alert('Please fill the required fields above before placing a digital certificate signature.', 3);
}
`.trim());
    const context = pdfDoc.context;
    const clickAction = context.obj({ Type: 'Action', S: 'JavaScript', JS: clickJs });
    btn.acroField.dict.set(PDFName.of('A'), clickAction);

    return btn;
}

/**
 * @param {Buffer} pdfBuffer
 * @param {{ quoteRef?: string, quoteDate?: string }} [meta]
 * @returns {Promise<Buffer>}
 */
async function appendCustomerAcceptancePage(pdfBuffer, meta = {}) {
    if (!isCustomerAcceptanceEnabled()) return pdfBuffer;
    if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer) || pdfBuffer.length < 5) {
        return pdfBuffer;
    }

    const quoteRef = dash(meta.quoteRef || meta.quoteNumber || '');
    const quoteDate = formatQuoteDateDisplay(meta.quoteDate || '');

    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const page = pdfDoc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();
    const marginX = 48;
    const contentW = width - marginX * 2;
    let y = height - 56;

    page.drawText('Customer Acceptance of Quote', {
        x: marginX,
        y,
        size: 16,
        font: fontBold,
        color: ACCENT,
    });
    y -= 10;
    page.drawLine({
        start: { x: marginX, y },
        end: { x: marginX + contentW, y },
        thickness: 1.25,
        color: ACCENT,
    });
    y -= 26;

    page.drawText('Quote Ref', {
        x: marginX,
        y,
        size: 9,
        font: fontBold,
        color: ACCENT,
    });
    page.drawText('Quote Date', {
        x: marginX + contentW / 2,
        y,
        size: 9,
        font: fontBold,
        color: ACCENT,
    });
    y -= 16;
    page.drawText(quoteRef, {
        x: marginX,
        y,
        size: 11,
        font,
        color: BLACK,
        maxWidth: contentW / 2 - 12,
    });
    page.drawText(quoteDate, {
        x: marginX + contentW / 2,
        y,
        size: 11,
        font,
        color: BLACK,
        maxWidth: contentW / 2 - 12,
    });
    y -= 14;
    page.drawLine({
        start: { x: marginX, y },
        end: { x: marginX + contentW, y },
        thickness: 0.6,
        color: LINE,
    });
    y -= 22;

    const bodyLines = [
        'I / We hereby accept this quotation and confirm agreement to the scope,',
        'pricing, and commercial terms stated in this document.',
        'No digital certificate? Type your full name as signature and tick I accept.',
    ];
    for (const line of bodyLines) {
        page.drawText(line, {
            x: marginX,
            y,
            size: 10,
            font,
            color: MUTED,
        });
        y -= 14;
    }
    y -= 18;

    const form = pdfDoc.getForm();
    const labelSize = 9;
    const fieldH = 22;
    const labelGap = 6;
    const sectionGap = 16;

    const drawLabeledTextField = (label, fieldName, { required = true } = {}) => {
        page.drawText(label, {
            x: marginX,
            y,
            size: labelSize,
            font: fontBold,
            color: ACCENT,
        });
        y -= labelSize + labelGap;
        const fieldY = y - fieldH;
        const tf = form.createTextField(fieldName);
        tf.addToPage(page, {
            x: marginX,
            y: fieldY,
            width: contentW,
            height: fieldH,
            borderWidth: 1,
            borderColor: LINE,
            backgroundColor: FIELD_BG,
            textColor: BLACK,
            font,
        });
        tf.setFontSize(10);
        if (required) tf.enableRequired();
        attachFieldRefreshAction(pdfDoc, tf);
        y = fieldY - sectionGap;
        return tf;
    };

    drawLabeledTextField('Accepted by (Name) *', 'CustomerAcceptance.Name');
    drawLabeledTextField('Company / Designation *', 'CustomerAcceptance.Company');
    drawLabeledTextField('Acceptance Date *', 'CustomerAcceptance.AcceptanceDate');
    drawLabeledTextField(
        'Signature (type full name) - only if you do not use a digital certificate',
        'CustomerAcceptance.TypedSignature',
        { required: false }
    );

    // Accept checkbox
    page.drawText('Confirmation *', {
        x: marginX,
        y,
        size: labelSize,
        font: fontBold,
        color: ACCENT,
    });
    y -= 18;
    const checkSize = 14;
    const checkY = y - checkSize;
    const cb = form.createCheckBox('CustomerAcceptance.AcceptCheck');
    cb.addToPage(page, {
        x: marginX,
        y: checkY,
        width: checkSize,
        height: checkSize,
        borderWidth: 1,
        borderColor: ACCENT,
        backgroundColor: FIELD_BG,
    });
    cb.enableRequired();
    attachFieldRefreshAction(pdfDoc, cb);
    page.drawText('I accept this quotation and the terms stated herein', {
        x: marginX + checkSize + 8,
        y: checkY + 2,
        size: 10,
        font,
        color: BLACK,
        maxWidth: contentW - checkSize - 8,
    });
    y = checkY - 22;

    // Optional remarks (not required for typed or digital acceptance)
    const remarksH = 56;
    page.drawText('Remarks / Comments (optional)', {
        x: marginX,
        y,
        size: labelSize,
        font: fontBold,
        color: ACCENT,
    });
    y -= labelSize + labelGap;
    const remarksY = y - remarksH;
    const remarksField = form.createTextField('CustomerAcceptance.Remarks');
    remarksField.addToPage(page, {
        x: marginX,
        y: remarksY,
        width: contentW,
        height: remarksH,
        borderWidth: 1,
        borderColor: LINE,
        backgroundColor: FIELD_BG,
        textColor: BLACK,
        font,
    });
    remarksField.setFontSize(10);
    try {
        remarksField.enableMultiline();
    } catch (_e) {
        /* older pdf-lib */
    }
    attachFieldRefreshAction(pdfDoc, remarksField);
    y = remarksY - sectionGap;

    // Optional digital certificate
    const sigH = 72;
    page.drawText('Digital certificate signature (optional)', {
        x: marginX,
        y,
        size: labelSize,
        font: fontBold,
        color: ACCENT,
    });
    y -= 12;
    page.drawText(
        'Fill Name, Company, Date and tick I accept first. Typed full name is not needed when using a certificate.',
        {
            x: marginX,
            y,
            size: 8,
            font,
            color: MUTED,
            maxWidth: contentW,
        }
    );
    y -= 12;
    const sigY = y - sigH;

    drawVisibleSignatureBox(page, font, {
        x: marginX,
        y: sigY,
        width: contentW,
        height: sigH,
    });
    createBlankSignatureField(pdfDoc, page, {
        name: 'CustomerAcceptance.Signature',
        x: marginX,
        y: sigY,
        width: contentW,
        height: sigH,
    });
    // Cover Sig until required fields are filled — click shows fill-fields popup.
    createSignatureClickGateButton(pdfDoc, page, {
        x: marginX,
        y: sigY,
        width: contentW,
        height: sigH,
        font,
    });

    y = sigY - 26;
    page.drawText(
        'No certificate? Type your full name + tick I accept. With certificate: File > Save (same PDF) after signing.',
        {
            x: marginX,
            y: Math.max(36, y),
            size: 8,
            font,
            color: MUTED,
            maxWidth: contentW,
        }
    );

    attachAcceptanceWillSignAction(pdfDoc);

    const out = await pdfDoc.save({ updateFieldAppearances: true, useObjectStreams: false });
    return Buffer.from(out);
}

module.exports = {
    appendCustomerAcceptancePage,
    isCustomerAcceptanceEnabled,
    createBlankSignatureField,
    createSignatureClickGateButton,
};
