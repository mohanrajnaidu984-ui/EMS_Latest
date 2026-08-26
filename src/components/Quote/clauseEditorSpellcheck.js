/**
 * Word-style spell check for clause edit mode:
 * - marks misspellings with blue wavy underline spans
 * - right-click suggestions from Hunspell (typo-js)
 */

import Typo from 'typo-js';
import { preserveClauseEditorSelectionDuring, withJoditHistoryBlocked } from './clauseEditorListPresets';
/**
 * Embed Hunspell dicts in the JS bundle (?raw).
 * Avoids production IIS 404 for /dictionaries/*.aff|*.dic (unknown MIME / missing files).
 */
import enUsAffText from '../../assets/dictionaries/en_US/en_US.aff?raw';
import enUsDicText from '../../assets/dictionaries/en_US/en_US.dic?raw';

const SPELL_MARK_CLASS = 'ems-spell-mark';
const WORD_RE = /[A-Za-z']+/g;
/** Full-document scan debounce (blur / idle). */
const SCAN_DEBOUNCE_MS = 900;
/** While focused, only re-check the caret block after the user pauses typing. */
const SCAN_DEBOUNCE_FOCUSED_MS = 1400;

let typoPromise = null;
let typoInstance = null;
const suggestionCache = new Map();
/** Suggestions keyed by data-spell-id — never put JSON in HTML attributes (breaks innerHTML). */
const markSuggestionsById = new Map();
const SUGGESTION_CACHE_MAX = 400;
let spellMarkSeq = 0;
let activeSpellMenuJodit = null;
const spellReadyListeners = new Set();

/** Quote/BHD terms Hunspell flags as misspellings — skip so clause 4.1 sync never wraps them. */
const DOMAIN_SPELL_IGNORE = new Set([
    'bahrain',
    'bahraini',
    'dinars',
    'dinar',
    'fils',
    'bhd',
    'vat',
    'ems',
    'dahua',
]);

function loadTypo() {
    if (!typoPromise) {
        typoPromise = Promise.resolve()
            .then(() => {
                typoInstance = new Typo('en_US', enUsAffText, enUsDicText);
                spellReadyListeners.forEach((fn) => {
                    try {
                        fn();
                    } catch {
                        /* ignore */
                    }
                });
                return typoInstance;
            })
            .catch((err) => {
                console.warn('[clauseEditorSpellcheck] dictionary load failed', err);
                typoPromise = null;
                typoInstance = null;
                return null;
            });
    }
    return typoPromise;
}

function cacheSuggestions(lower, suggestions) {
    if (!lower) return;
    if (suggestionCache.size >= SUGGESTION_CACHE_MAX) {
        const first = suggestionCache.keys().next().value;
        suggestionCache.delete(first);
    }
    suggestionCache.set(lower, suggestions);
}

export function isSpellDictionaryReady() {
    return Boolean(typoInstance);
}

export function subscribeSpellDictionaryReady(fn) {
    if (typeof fn !== 'function') return () => {};
    if (typoInstance) {
        fn();
        return () => {};
    }
    spellReadyListeners.add(fn);
    void loadTypo();
    return () => spellReadyListeners.delete(fn);
}

export function normalizeSpellToken(raw) {
    return String(raw || '')
        .replace(/^['\u2019]+|['\u2019]+$/g, '')
        .trim();
}

function isIgnorableToken(word) {
    const w = normalizeSpellToken(word);
    if (!w || w.length < 2) return true;
    if (/\d/.test(w)) return true;
    if (/^https?:\/\//i.test(w)) return true;
    if (w.includes('@')) return true;
    if (w.length <= 4 && w === w.toUpperCase()) return true;
    if (DOMAIN_SPELL_IGNORE.has(w.toLowerCase())) return true;
    return false;
}

function isWordCorrect(typo, word) {
    if (!typo) return true;
    const w = normalizeSpellToken(word);
    if (isIgnorableToken(w)) return true;
    if (typo.check(w)) return true;
    const lower = w.toLowerCase();
    if (lower !== w && typo.check(lower)) return true;
    if (w.endsWith("'s")) {
        const stem = w.slice(0, -2);
        if (typo.check(stem) || typo.check(stem.toLowerCase())) return true;
    }
    if (w.endsWith("s'") && typo.check(w.slice(0, -1))) return true;
    if (w.endsWith("'") && typo.check(w.slice(0, -1))) return true;
    return false;
}

function levenshtein(a, b) {
    const left = String(a || '');
    const right = String(b || '');
    if (left === right) return 0;
    if (!left.length) return right.length;
    if (!right.length) return left.length;

    const prev = new Array(right.length + 1);
    const curr = new Array(right.length + 1);
    for (let j = 0; j <= right.length; j++) prev[j] = j;

    for (let i = 1; i <= left.length; i++) {
        curr[0] = i;
        for (let j = 1; j <= right.length; j++) {
            const cost = left[i - 1] === right[j - 1] ? 0 : 1;
            curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
        }
        for (let j = 0; j <= right.length; j++) prev[j] = curr[j];
    }
    return prev[right.length];
}

/** Very short words where Hunspell suggestions are often poor. */
const COMMON_SHORT_TYPOS = {
    teh: 'the',
    hte: 'the',
    adn: 'and',
    nad: 'and',
    taht: 'that',
    thta: 'that',
    wiht: 'with',
    yuo: 'you',
    uyo: 'you',
    becuase: 'because',
    becasue: 'because',
    freind: 'friend',
    recieve: 'receive',
    recieved: 'received',
    recieving: 'receiving',
    seperate: 'separate',
    definately: 'definitely',
    occurence: 'occurrence',
    occurance: 'occurrence',
    quntity: 'quantity',
    quantitiy: 'quantity',
    provded: 'provided',
    provied: 'provided',
    goverment: 'government',
    enviroment: 'environment',
    accomodate: 'accommodate',
    occured: 'occurred',
    bussiness: 'business',
    liason: 'liaison',
    maintainance: 'maintenance',
    neccessary: 'necessary',
    recomend: 'recommend',
    refered: 'referred',
    succesful: 'successful',
    wich: 'which',
    thier: 'their',
};

function generateTypoVariants(word) {
    const base = String(word || '').toLowerCase();
    if (!base) return [];
    const out = new Set();

    for (let i = 0; i < base.length - 1; i++) {
        out.add(base.slice(0, i) + base[i + 1] + base[i] + base.slice(i + 2));
    }
    for (let i = 0; i < base.length; i++) {
        out.add(base.slice(0, i) + base.slice(i + 1));
    }
    for (let i = 0; i < base.length; i++) {
        out.add(base.slice(0, i + 1) + base[i] + base.slice(i + 1));
    }
    for (let i = 0; i < base.length - 1; i++) {
        if (base[i] === base[i + 1]) out.add(base.slice(0, i) + base.slice(i + 1));
    }
    if (base.includes('ie')) out.add(base.replace(/ie/g, 'ei'));
    if (base.includes('ei')) out.add(base.replace(/ei/g, 'ie'));

    out.delete(base);
    return [...out];
}

function applyOriginalCase(original, suggestion) {
    const src = String(original || '');
    const dst = String(suggestion || '');
    if (!dst) return dst;
    if (src === src.toUpperCase()) return dst.toUpperCase();
    if (src[0] === src[0]?.toUpperCase()) {
        return dst.charAt(0).toUpperCase() + dst.slice(1).toLowerCase();
    }
    return dst.toLowerCase();
}

function sharedAffixScore(original, suggestion) {
    let prefix = 0;
    for (let i = 0; i < Math.min(original.length, suggestion.length); i++) {
        if (original[i] === suggestion[i]) prefix++;
        else break;
    }
    let suffix = 0;
    for (let i = 1; i <= Math.min(original.length, suggestion.length); i++) {
        if (original[original.length - i] === suggestion[suggestion.length - i]) suffix++;
        else break;
    }
    return prefix * 5 + suffix * 3;
}

function scoreSuggestion(original, suggestion, sourceRank, fromCommonMap = false) {
    const dist = levenshtein(original, suggestion);
    const maxLen = Math.max(original.length, suggestion.length, 1);
    const lenDiff = Math.abs(original.length - suggestion.length);

    let score = (dist / maxLen) * 100 + lenDiff * 4 + sourceRank;
    score -= sharedAffixScore(original, suggestion);
    if (fromCommonMap) score -= 80;
    if (dist === 1) score -= 24;
    else if (dist === 2) score -= 12;
    else if (dist === 3) score -= 5;

    if (original[0] === suggestion[0]) score -= 6;
    if (original === original.toLowerCase() && suggestion[0] === suggestion[0].toUpperCase()) {
        score += 10;
    }
    if (suggestion.length < 2) score += 40;
    return score;
}

function isValidDictionaryWord(typo, word) {
    const w = String(word || '').trim();
    if (!w) return false;
    return typo.check(w) || typo.check(w.toLowerCase());
}

function rankSuggestionCandidates(typo, w, lower, scored, seen, { includeVariants = false } = {}) {
    const addCandidate = (candidate, sourceRank, fromCommonMap = false) => {
        const raw = String(candidate || '').trim();
        const key = raw.toLowerCase();
        if (!key || key === lower || seen.has(key)) return;
        if (!isValidDictionaryWord(typo, raw)) return;
        seen.add(key);
        scored.push({
            word: raw,
            score: scoreSuggestion(lower, key, sourceRank, fromCommonMap),
        });
    };

    const mapped = COMMON_SHORT_TYPOS[lower];
    if (mapped) addCandidate(mapped, 0, true);

    const primary = typo.suggest(lower) || (lower !== w ? typo.suggest(w) : []);
    (primary || []).slice(0, includeVariants ? 24 : 18).forEach((item, index) => addCandidate(item, 8 + index));

    if (includeVariants) {
        generateTypoVariants(w).forEach((variant) => {
            if (isValidDictionaryWord(typo, variant)) addCandidate(variant, 6);
            (typo.suggest(variant) || []).slice(0, 6).forEach((item, index) => addCandidate(item, 24 + index));
        });
    }

    if (w.endsWith("'s")) {
        const stem = w.slice(0, -2);
        (typo.suggest(stem) || []).slice(0, includeVariants ? 6 : 4).forEach((item, index) => {
            addCandidate(`${item}'s`, 20 + index);
        });
    }

    scored.sort(
        (a, b) =>
            a.score - b.score ||
            levenshtein(lower, a.word.toLowerCase()) - levenshtein(lower, b.word.toLowerCase()) ||
            a.word.localeCompare(b.word, undefined, { sensitivity: 'base' })
    );
}

/** Fast path for menus and prefetch — single Hunspell suggest call, no variant expansion. */
function rankSuggestionsFast(typo, word) {
    const w = normalizeSpellToken(word);
    if (!w || !typo) return [];
    const lower = w.toLowerCase();

    const cached = suggestionCache.get(lower);
    if (cached) return cached;

    const seen = new Set();
    const scored = [];
    rankSuggestionCandidates(typo, w, lower, scored, seen, { includeVariants: false });
    const result = scored.slice(0, 10).map((item) => applyOriginalCase(w, item.word));
    cacheSuggestions(lower, result);
    return result;
}

function rankSuggestions(typo, word) {
    const w = normalizeSpellToken(word);
    if (!w || !typo) return [];
    const lower = w.toLowerCase();
    const seen = new Set();
    const scored = [];
    rankSuggestionCandidates(typo, w, lower, scored, seen, { includeVariants: true });
    return scored.slice(0, 10).map((item) => applyOriginalCase(w, item.word));
}

function readCachedSuggestions(loc, word) {
    const id = loc?.mark?.getAttribute?.('data-spell-id') || loc?.spellMarkId;
    if (id && markSuggestionsById.has(id)) {
        return markSuggestionsById.get(id);
    }
    const lower = word.toLowerCase();
    if (suggestionCache.has(lower)) return suggestionCache.get(lower);
    return null;
}

function storeMarkSuggestions(mark, suggestions) {
    if (!mark || !Array.isArray(suggestions) || !suggestions.length) return;
    const id = mark.getAttribute('data-spell-id');
    if (!id) return;
    markSuggestionsById.set(id, suggestions);
}

function prefillSpellMarkSuggestions(typo, root) {
    if (!typo || !root?.querySelectorAll) return;
    const marks = [...root.querySelectorAll(`.${SPELL_MARK_CLASS}`)].filter(
        (mark) => !markSuggestionsById.has(mark.getAttribute('data-spell-id') || '')
    );
    if (!marks.length) return;

    let index = 0;
    const fillBatch = (deadline) => {
        while (index < marks.length) {
            if (deadline?.timeRemaining && deadline.timeRemaining() <= 1) {
                requestIdleCallback(fillBatch);
                return;
            }
            const mark = marks[index++];
            const word = mark.getAttribute('data-word') || mark.textContent;
            storeMarkSuggestions(mark, rankSuggestionsFast(typo, word));
        }
    };

    if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(fillBatch);
    } else {
        marks.forEach((mark) => {
            const word = mark.getAttribute('data-word') || mark.textContent;
            storeMarkSuggestions(mark, rankSuggestionsFast(typo, word));
        });
    }
}

function unwrapSpellMarks(root) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll(`.${SPELL_MARK_CLASS}`).forEach((span) => {
        const id = span.getAttribute('data-spell-id');
        if (id) markSuggestionsById.delete(id);
        const parent = span.parentNode;
        if (!parent) return;
        while (span.firstChild) parent.insertBefore(span.firstChild, span);
        parent.removeChild(span);
    });
    root.normalize?.();
}

/** True when HTML may contain spell-check spans or broken span tails from export. */
function htmlMayContainSpellExportArtifacts(raw) {
    return (
        /ems-spell-mark|data-spell-id|data-suggestions|background-repeat:repeat-x !important;background-position:0 100%/i.test(
            raw
        )
    );
}

/**
 * Remove spell-mark span tails that leaked into text when clause 4.1 regex matched the
 * `)` inside `linear-gradient(...)` on spell-mark inline styles (or legacy data-suggestions JSON).
 */
function stripSpellMarkExportDebrisFromHtmlString(html) {
    let s = String(html || '');
    if (!s) return s;
    if (!htmlMayContainSpellExportArtifacts(s) && !/data-suggestions=/i.test(s)) return s;

    // Whole spell-mark spans (well-formed).
    s = s.replace(/<span\b[^>]*\bclass="[^"]*\bems-spell-mark\b[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, '$1');
    s = s.replace(/<span\b[^>]*\bdata-spell-id\b[^>]*>([\s\S]*?)<\/span>/gi, '$1');

    // Broken opening-tag tails (cut mid-style at linear-gradient's closing paren).
    s = s.replace(
        /!?important;background-repeat:repeat-x !important;background-position:0 100% !important;background-size:100% 2px !important;padding-bottom:1px !important;text-decoration:none !important;[\s"'=A-Za-z0-9\[\]\\;:\-/%#,()]*?(?:&gt;|>)/gi,
        ''
    );
    s = s.replace(
        /background-repeat:repeat-x !important;background-position:0 100% !important;background-size:100% 2px !important;padding-bottom:1px !important;text-decoration:none !important;[\s"'=A-Za-z0-9\[\]\\;:\-/%#,()]*?(?:&gt;|>)/gi,
        ''
    );

    // Orphan attributes / partial spans.
    s = s.replace(/<span\b[^>]*\bems-spell-mark\b[^>]*>/gi, '');
    s = s.replace(/\s*data-suggestions=(?:"[^"]*"|\[[^\]]*\]|&quot;\[[^\]]*\]&quot;)\s*/gi, ' ');
    s = s.replace(/\s*data-suggestions="\[[^\]]*$/gi, '');
    s = s.replace(/\s*data-spell-id="[^"]*"\s*/gi, ' ');
    s = s.replace(/\s*data-word="[^"]*"\s*/gi, ' ');

    // Collapse duplicated lump-sum tails left after debris (same BD words clause repeated).
    s = s.replace(
        /(\(Bahraini Dinars[^)]{0,240}?only\.\))(?:\s*(?:\(?Bahraini Dinars[^)]{0,240}?only\.\)))+/gi,
        '$1'
    );

    return s;
}

/** Remove spell-check decoration spans from persisted/export HTML. */
export function stripSpellMarksFromHtml(html) {
    const raw = String(html || '');
    if (!raw || !htmlMayContainSpellExportArtifacts(raw)) return raw;
    try {
        const doc = new DOMParser().parseFromString(`<div id="__ems_spell_root">${raw}</div>`, 'text/html');
        const root = doc.getElementById('__ems_spell_root');
        if (!root) return stripSpellMarkExportDebrisFromHtmlString(raw);
        unwrapSpellMarks(root);
        return stripSpellMarkExportDebrisFromHtmlString(root.innerHTML.trim());
    } catch {
        return stripSpellMarkExportDebrisFromHtmlString(raw);
    }
}

function shouldScanNode(node) {
    if (!node?.textContent?.trim()) return false;
    const parent = node.parentElement;
    if (!parent) return false;
    if (parent.closest('table')) return false;
    if (parent.closest(`.${SPELL_MARK_CLASS}`)) return false;
    if (parent.closest('script, style')) return false;
    return true;
}

function wrapMisspelling(textNode, start, end, word, typo, storeSuggestions = true) {
    const doc = textNode.ownerDocument;
    const range = doc.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, end);
    const span = doc.createElement('span');
    span.className = SPELL_MARK_CLASS;
    span.setAttribute('data-word', word);
    span.setAttribute('data-spell-id', String(++spellMarkSeq));
    span.setAttribute('spellcheck', 'false');
    // Underline via CSS class only — never inline style with linear-gradient(...) (`)` breaks clause 4.1 sync).
    try {
        range.surroundContents(span);
        if (storeSuggestions && typo) {
            storeMarkSuggestions(span, rankSuggestionsFast(typo, word));
        }
    } catch {
        /* range may cross element boundaries — skip */
    }
}

function scanTextNode(typo, textNode, storeSuggestions = true) {
    const text = textNode.textContent || '';
    if (!text.trim()) return;
    const misses = [];
    let match;
    WORD_RE.lastIndex = 0;
    while ((match = WORD_RE.exec(text))) {
        const word = match[0];
        if (!isWordCorrect(typo, word)) {
            misses.push({ start: match.index, end: match.index + word.length, word });
        }
    }
    for (let i = misses.length - 1; i >= 0; i--) {
        wrapMisspelling(textNode, misses[i].start, misses[i].end, misses[i].word, typo, storeSuggestions);
    }
}

/** Prefer the block containing the caret so typing does not re-scan the whole clause. */
function resolveSpellScanScope(root, { full = false } = {}) {
    if (!root || full) return root;
    try {
        const sel = root.ownerDocument?.getSelection?.();
        const anchor = sel?.anchorNode;
        if (!anchor || !root.contains(anchor)) return root;
        const el = anchor.nodeType === 3 ? anchor.parentElement : anchor;
        const block = el?.closest?.('p, div, li, td, th, h1, h2, h3, h4, h5, h6');
        if (block && root.contains(block) && block !== root) return block;
    } catch {
        /* fall through */
    }
    return root;
}

function scanRootForSpellMarks(root, typo, { storeSuggestions = true, scope = null } = {}) {
    if (!root || !typo) return;
    const target = scope && root.contains(scope) ? scope : root;
    unwrapSpellMarks(target);
    const walker = root.ownerDocument.createTreeWalker(target, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
        if (shouldScanNode(walker.currentNode)) nodes.push(walker.currentNode);
    }
    nodes.forEach((node) => scanTextNode(typo, node, storeSuggestions));
}

const decorateHtmlCache = new Map();
const DECORATE_HTML_CACHE_MAX = 40;

/** Preview HTML — wrap misspellings so underlines show outside the editor. */
export function decorateHtmlWithSpellMarks(html) {
    const raw = String(html || '');
    if (!raw || !typoInstance) {
        void loadTypo();
        return raw;
    }
    const cached = decorateHtmlCache.get(raw);
    if (cached != null) return cached;
    try {
        const doc = new DOMParser().parseFromString(`<div id="__ems_spell_root">${raw}</div>`, 'text/html');
        const root = doc.getElementById('__ems_spell_root');
        if (!root) return raw;
        scanRootForSpellMarks(root, typoInstance, { storeSuggestions: false });
        const out = root.innerHTML;
        if (decorateHtmlCache.size >= DECORATE_HTML_CACHE_MAX) {
            const first = decorateHtmlCache.keys().next().value;
            decorateHtmlCache.delete(first);
        }
        decorateHtmlCache.set(raw, out);
        return out;
    } catch {
        return raw;
    }
}

/** Remove spell-check decoration from a live DOM subtree (PDF/print clone). */
export function stripSpellMarksFromDom(root) {
    if (!root) return;
    unwrapSpellMarks(root);
    root.querySelectorAll?.(`.${SPELL_MARK_CLASS}, [data-spell-id]`).forEach((span) => {
        const id = span.getAttribute?.('data-spell-id');
        if (id) markSuggestionsById.delete(id);
        const parent = span.parentNode;
        if (!parent) return;
        while (span.firstChild) parent.insertBefore(span.firstChild, span);
        parent.removeChild(span);
    });
    const targets = new Set();
    if (typeof root.innerHTML === 'string') targets.add(root);
    root.querySelectorAll?.('.clause-content, .jodit-wysiwyg, .clause-editor-wrapper').forEach((el) => {
        targets.add(el);
    });
    targets.forEach((el) => {
        const cleaned = stripSpellMarkExportDebrisFromHtmlString(el.innerHTML || '');
        if (cleaned !== el.innerHTML) el.innerHTML = cleaned;
    });
}

async function scanEditorSpellings(jodit, getEditorBody, { force = false, full = false } = {}) {
    if (!jodit || jodit.__emsSpellScanSuspended) return;
    if (jodit.__emsSpellMenuOpen) return;
    if (jodit.__emsApplyingClauseHistory) return;
    /* Never rewrite the DOM mid-keystroke — even force scans must wait (caret jumps to start otherwise). */
    if (jodit.__emsTypingLock || jodit.__emsDeleteKeyLock || jodit.__emsListApplyLock) {
        scheduleSpellScan(jodit, getEditorBody, { force: false, full });
        return;
    }
    if (!force && jodit.__emsSpellScanRunning) return;
    const root = (typeof getEditorBody === 'function' && getEditorBody())
        || jodit.editor
        || jodit.container?.querySelector?.('.jodit-wysiwyg')
        || null;
    if (!root) return;
    const typo = await loadTypo();
    if (!typo || !root.isConnected) return;
    if (jodit.__emsSpellScanSuspended || jodit.__emsSpellMenuOpen) return;
    if (jodit.__emsTypingLock || jodit.__emsDeleteKeyLock || jodit.__emsListApplyLock) {
        scheduleSpellScan(jodit, getEditorBody, { force: false, full });
        return;
    }

    const focused = isSpellEditorFocused(jodit, getEditorBody);
    const runFull = Boolean(full || force || !focused);
    const scope = resolveSpellScanScope(root, { full: runFull });
    /* Live typing: skip suggestion prefill (Hunspell suggest is expensive). */
    const storeSuggestions = runFull;

    jodit.__emsSpellScanRunning = true;
    try {
        preserveClauseEditorSelectionDuring(jodit, () => {
            withJoditHistoryBlocked(jodit, () => {
                scanRootForSpellMarks(root, typo, { storeSuggestions, scope });
            });
        });
        if (storeSuggestions) {
            prefillSpellMarkSuggestions(typo, scope === root ? root : scope);
        }
    } finally {
        jodit.__emsSpellScanRunning = false;
    }
}

/** Re-run spell check after clause HTML is loaded into the editor. */
export function rescanClauseEditorSpellcheck(jodit, getEditorBody) {
    scheduleSpellScan(jodit, getEditorBody || jodit?.__emsClauseEditorBody, {
        immediate: true,
        force: true,
        full: true,
    });
}

function isSpellEditorFocused(jodit, getEditorBody) {
    const root = (typeof getEditorBody === 'function' && getEditorBody()) || jodit?.editor;
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    return Boolean(root && active && (active === root || root.contains(active)));
}

function shouldDeferSpellScan(jodit) {
    return Boolean(
        jodit?.__emsSpellScanSuspended ||
            jodit?.__emsSpellMenuOpen ||
            jodit?.__emsApplyingClauseHistory ||
            jodit?.__emsListApplyLock ||
            jodit?.__emsDeleteKeyLock ||
            jodit?.__emsTypingLock ||
            jodit?.__emsSpellScanRunning
    );
}

function unwrapSpellMarksInEditor(jodit, getEditorBody) {
    const root = (typeof getEditorBody === 'function' && getEditorBody()) || jodit?.editor;
    if (!root?.querySelector?.(`.${SPELL_MARK_CLASS}`)) return;
    try {
        preserveClauseEditorSelectionDuring(jodit, () => unwrapSpellMarks(root));
    } catch {
        unwrapSpellMarks(root);
    }
}

function scheduleSpellScan(jodit, getEditorBody, options = {}) {
    if (!jodit) return;
    if (jodit.__emsSpellScanTimer) clearTimeout(jodit.__emsSpellScanTimer);
    const focused = isSpellEditorFocused(jodit, getEditorBody);
    const delay = options.immediate
        ? 80
        : focused
          ? SCAN_DEBOUNCE_FOCUSED_MS
          : SCAN_DEBOUNCE_MS;
    jodit.__emsSpellScanTimer = setTimeout(() => {
        jodit.__emsSpellScanTimer = null;
        if (!options.force && shouldDeferSpellScan(jodit)) {
            /* Typing / locks still active — retry after another debounce instead of dropping the scan. */
            scheduleSpellScan(jodit, getEditorBody, { force: false, full: options.full });
            return;
        }
        void scanEditorSpellings(jodit, getEditorBody, {
            force: options.force,
            full: options.full,
        });
    }, delay);
}

function getWordFromSpellMark(root, clientX, clientY) {
    const doc = root.ownerDocument || document;
    const el = doc.elementFromPoint(clientX, clientY);
    const mark = el?.closest?.(`.${SPELL_MARK_CLASS}`);
    if (!mark || !root.contains(mark)) return null;
    const word = normalizeSpellToken(mark.getAttribute('data-word') || mark.textContent);
    if (!word) return null;
    return { word, mark };
}

function getWordAtPoint(root, clientX, clientY) {
    const fromMark = getWordFromSpellMark(root, clientX, clientY);
    if (fromMark) return fromMark;

    const doc = root.ownerDocument || document;
    let range = null;
    if (typeof doc.caretRangeFromPoint === 'function') {
        range = doc.caretRangeFromPoint(clientX, clientY);
    } else if (typeof doc.caretPositionFromPoint === 'function') {
        const pos = doc.caretPositionFromPoint(clientX, clientY);
        if (pos) {
            range = doc.createRange();
            range.setStart(pos.offsetNode, pos.offset);
            range.collapse(true);
        }
    }
    if (!range || !root.contains(range.startContainer)) return null;

    const sel = doc.getSelection();
    if (!sel) return null;
    const saved = [];
    for (let i = 0; i < sel.rangeCount; i++) saved.push(sel.getRangeAt(i).cloneRange());

    sel.removeAllRanges();
    sel.addRange(range);
    try {
        if (typeof sel.modify === 'function') {
            sel.modify('move', 'backward', 'word');
            sel.modify('extend', 'forward', 'word');
        }
        const wordRange = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
        const word = normalizeSpellToken(wordRange?.toString?.() || '');
        if (!word || !/[A-Za-z]/.test(word)) return null;
        if (!wordRange || !root.contains(wordRange.startContainer)) return null;
        return { word, range: wordRange };
    } finally {
        sel.removeAllRanges();
        saved.forEach((r) => sel.addRange(r));
    }
}

function freezeSpellLoc(loc) {
    const frozen = {
        word: loc.word,
        mark: loc.mark || null,
        spellMarkId: loc.mark?.getAttribute?.('data-spell-id') || null,
        range: null,
    };

    if (loc.mark?.isConnected) {
        try {
            const range = loc.mark.ownerDocument.createRange();
            range.selectNode(loc.mark);
            frozen.range = range.cloneRange();
        } catch {
            /* ignore range errors */
        }
    } else if (loc.range?.cloneRange) {
        frozen.range = loc.range.cloneRange();
    }

    return frozen;
}

function resolveSpellMark(root, loc) {
    if (loc?.mark?.isConnected) return loc.mark;
    const id = loc?.spellMarkId;
    if (id && root?.querySelector) {
        const found = root.querySelector(`.${SPELL_MARK_CLASS}[data-spell-id="${id}"]`);
        if (found) return found;
    }
    return null;
}

function replaceWord(jodit, loc, replacement, getEditorBody) {
    const root = (typeof getEditorBody === 'function' && getEditorBody()) || jodit.editor;
    jodit.__emsSpellScanSuspended = true;
    try {
        const mark = resolveSpellMark(root, loc);
        if (mark?.isConnected) {
            const textNode = mark.ownerDocument.createTextNode(replacement);
            mark.parentNode?.replaceChild(textNode, mark);
            root?.normalize?.();
        } else if (loc.range?.cloneRange) {
            const range = loc.range.cloneRange();
            if (root?.contains?.(range.startContainer)) {
                range.deleteContents();
                range.insertNode(range.startContainer.ownerDocument.createTextNode(replacement));
                root.normalize?.();
            } else {
                jodit.s.selectRange(loc.range);
                jodit.s.focus();
                jodit.execCommand('insertText', false, replacement);
            }
        } else if (loc.textNode != null) {
            const doc = loc.textNode.ownerDocument;
            const range = doc.createRange();
            range.setStart(loc.textNode, loc.start);
            range.setEnd(loc.textNode, loc.end);
            jodit.s.selectRange(range);
            jodit.s.focus();
            jodit.execCommand('insertText', false, replacement);
        }
        jodit.e?.fire?.('change');
        jodit.e?.fire?.('updateToolbar');
    } finally {
        jodit.__emsSpellScanSuspended = false;
        scheduleSpellScan(jodit, getEditorBody);
    }
}

function closeSpellContextMenu() {
    document.querySelectorAll('.ems-spell-context-menu-host').forEach((el) => el.remove());
    if (activeSpellMenuJodit) {
        activeSpellMenuJodit.__emsSpellMenuOpen = false;
        activeSpellMenuJodit = null;
    }
}

function setSpellMenuBody(menu, suggestions, { loading = false, emptyText = 'No suggestions' } = {}) {
    menu.querySelectorAll('.ems-spell-context-menu__item, .ems-spell-context-menu__empty, .ems-spell-context-menu__loading').forEach((el) => el.remove());

    if (loading) {
        const row = menu.ownerDocument.createElement('div');
        row.className = 'ems-spell-context-menu__loading';
        row.textContent = 'Loading suggestions…';
        menu.appendChild(row);
        return;
    }

    if (!suggestions?.length) {
        const empty = menu.ownerDocument.createElement('div');
        empty.className = 'ems-spell-context-menu__empty';
        empty.textContent = emptyText;
        menu.appendChild(empty);
        return;
    }

    suggestions.forEach((suggestion) => {
        const btn = menu.ownerDocument.createElement('button');
        btn.type = 'button';
        btn.className = 'ems-spell-context-menu__item';
        btn.setAttribute('role', 'menuitem');
        btn.textContent = suggestion;
        btn.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            const host = menu.closest('.ems-spell-context-menu-host');
            const onPick = host?.__emsSpellOnPick;
            if (typeof onPick === 'function') onPick(suggestion);
        });
        menu.appendChild(btn);
    });
}

function openSpellContextMenu(jodit, loc, clientX, clientY, getEditorBody, options = {}) {
    closeSpellContextMenu();
    jodit.__emsSpellMenuOpen = true;
    activeSpellMenuJodit = jodit;

    const word = normalizeSpellToken(loc.word);
    const frozenLoc = freezeSpellLoc(loc);
    const cachedSuggestions = readCachedSuggestions(loc, word);
    const hasCachedSuggestions = cachedSuggestions !== null;
    const doc = jodit.editor?.ownerDocument || document;
    const host = doc.createElement('div');
    host.className = 'ems-spell-context-menu-host';
    host.style.cssText = 'position:fixed;z-index:20050;left:0;top:0;';

    const menu = doc.createElement('div');
    menu.className = 'ems-spell-context-menu';
    menu.setAttribute('role', 'menu');

    const title = doc.createElement('div');
    title.className = 'ems-spell-context-menu__title';
    title.textContent = `Suggestions for “${word}”`;
    menu.appendChild(title);

    host.__emsSpellOnPick = (replacement) => {
        replaceWord(jodit, frozenLoc, replacement, getEditorBody);
        closeSpellContextMenu();
    };

    setSpellMenuBody(menu, cachedSuggestions, {
        loading: !hasCachedSuggestions,
    });

    host.appendChild(menu);
    doc.body.appendChild(host);

    const pad = 6;
    const positionMenu = () => {
        const rect = menu.getBoundingClientRect();
        let left = clientX;
        let top = clientY;
        if (left + rect.width > window.innerWidth - pad) {
            left = Math.max(pad, window.innerWidth - rect.width - pad);
        }
        if (top + rect.height > window.innerHeight - pad) {
            top = Math.max(pad, clientY - rect.height - 4);
        }
        host.style.left = `${left}px`;
        host.style.top = `${top}px`;
    };
    positionMenu();

    const onDismiss = (e) => {
        if (host.contains(e.target)) return;
        closeSpellContextMenu();
        doc.removeEventListener('mousedown', onDismiss, true);
        doc.removeEventListener('scroll', onDismiss, true);
        window.removeEventListener('resize', onDismiss, true);
    };
    requestAnimationFrame(() => {
        doc.addEventListener('mousedown', onDismiss, true);
        doc.addEventListener('scroll', onDismiss, true);
        window.addEventListener('resize', onDismiss, true);
    });

    if (hasCachedSuggestions) return;

    void (async () => {
        const typo = typoInstance || (await loadTypo());
        if (!host.isConnected) return;
        if (!typo) {
            setSpellMenuBody(menu, [], { emptyText: 'Dictionary unavailable' });
            positionMenu();
            return;
        }
        if (options.validate && isWordCorrect(typo, word)) {
            closeSpellContextMenu();
            return;
        }
        const suggestions = rankSuggestionsFast(typo, word);
        if (!host.isConnected) return;
        if (loc.mark) storeMarkSuggestions(loc.mark, suggestions);
        setSpellMenuBody(menu, suggestions);
        positionMenu();
    })();
}

function isInsideTable(node, root) {
    let el = node;
    while (el && el !== root) {
        if (el.nodeType === Node.ELEMENT_NODE && el.tagName === 'TABLE') return true;
        el = el.parentNode;
    }
    return false;
}

/** Enable spell check + right-click suggestions on a Jodit clause editor instance. */
export function registerClauseEditorSpellcheck(jodit, getEditorBody) {
    if (!jodit || jodit.__emsSpellcheckBound) return;
    jodit.__emsSpellcheckBound = true;

    const SPELL_STYLE_ID = 'ems-spell-check-style';
    if (typeof document !== 'undefined' && !document.getElementById(SPELL_STYLE_ID)) {
        const style = document.createElement('style');
        style.id = SPELL_STYLE_ID;
        style.textContent = `
            #quote-preview span.ems-spell-mark,
            .clause-editor-wrapper span.ems-spell-mark,
            .jodit-wysiwyg span.ems-spell-mark {
                border-bottom: 2px wavy #0078d4 !important;
                background-image: linear-gradient(#0078d4, #0078d4) !important;
                background-repeat: repeat-x !important;
                background-position: 0 100% !important;
                background-size: 100% 2px !important;
                padding-bottom: 1px !important;
                text-decoration: none !important;
            }
        `;
        document.head.appendChild(style);
    }

    const resolveRoot = () =>
        (typeof getEditorBody === 'function' && getEditorBody()) ||
        jodit.editor ||
        jodit.container?.querySelector?.('.jodit-wysiwyg') ||
        null;

    const requestScan = (immediate = false) => {
        if (jodit.__emsSpellScanRunning || jodit.__emsSpellScanSuspended) return;
        if (jodit.__emsTypingLock || jodit.__emsDeleteKeyLock) {
            scheduleSpellScan(jodit, getEditorBody, { immediate: false, force: false });
            return;
        }
        scheduleSpellScan(jodit, getEditorBody, { immediate, force: true, full: true });
    };

    void loadTypo().then(() => requestScan(true));

    jodit.e.on('afterSetValue.emsSpell afterInit.emsSpell afterAddPlace.emsSpell', () => {
        requestScan(true);
    });

    const host = jodit.container || jodit.editor;
    if (host && !host.__emsSpellDelegateBound) {
        host.__emsSpellDelegateBound = true;
        let nativeTimer = null;
        const onNative = (delay) => {
            if (nativeTimer) clearTimeout(nativeTimer);
            nativeTimer = setTimeout(() => {
                nativeTimer = null;
                /* force:false — respect typing lock; scanEditorSpellings also preserves caret */
                void scanEditorSpellings(jodit, getEditorBody, { force: false });
            }, delay);
        };
        host.addEventListener('input', () => onNative(SCAN_DEBOUNCE_FOCUSED_MS), true);
        host.addEventListener('focusout', () => {
            /* Leaving the editor — full document scan so underlines catch up. */
            if (nativeTimer) clearTimeout(nativeTimer);
            nativeTimer = setTimeout(() => {
                nativeTimer = null;
                void scanEditorSpellings(jodit, getEditorBody, { force: true, full: true });
            }, 220);
        }, true);
        host.addEventListener('contextmenu', (e) => {
            if (e.defaultPrevented) return;
            const root = resolveRoot();
            if (!root || !root.contains(e.target)) return;
            if (isInsideTable(e.target, root)) return;
            const loc = getWordAtPoint(root, e.clientX, e.clientY);
            if (!loc?.word) return;
            if (!loc.mark && typoInstance && isWordCorrect(typoInstance, loc.word)) return;
            e.preventDefault();
            e.stopPropagation();
            openSpellContextMenu(jodit, loc, e.clientX, e.clientY, getEditorBody, {
                validate: !loc.mark,
            });
        }, true);
        jodit.__emsSpellNativeTimerClear = () => {
            if (nativeTimer) {
                clearTimeout(nativeTimer);
                nativeTimer = null;
            }
        };
    }

    let kickAttempts = 0;
    const kickUntilContent = () => {
        if (!isJoditAliveSafe(jodit) || kickAttempts > 4) return;
        kickAttempts += 1;
        requestScan(true);
        const root = resolveRoot();
        const hasText = Boolean(root?.textContent?.trim());
        if (hasText && kickAttempts >= 1) return;
        jodit.__emsSpellKickTimer = setTimeout(kickUntilContent, 400);
    };
    kickUntilContent();

    jodit.e.on('beforeDestruct', () => {
        if (jodit.__emsSpellKickTimer) {
            clearTimeout(jodit.__emsSpellKickTimer);
            jodit.__emsSpellKickTimer = null;
        }
        if (jodit.__emsSpellBlurTimer) {
            clearTimeout(jodit.__emsSpellBlurTimer);
            jodit.__emsSpellBlurTimer = null;
        }
        if (jodit.__emsSpellScanTimer) {
            clearTimeout(jodit.__emsSpellScanTimer);
            jodit.__emsSpellScanTimer = null;
        }
        jodit.__emsSpellNativeTimerClear?.();
        closeSpellContextMenu();
        const root = resolveRoot();
        if (root) unwrapSpellMarks(root);
    });
}

function isJoditAliveSafe(jodit) {
    try {
        return Boolean(jodit && !jodit.isInDestruct && jodit.editor);
    } catch {
        return false;
    }
}

if (typeof window !== 'undefined') {
    void loadTypo();
}
