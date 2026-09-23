/** Apple-style emoji images (WhatsApp Web look) via emoji-datasource-apple CDN */

const APPLE_EMOJI_CDN =
    'https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/64';

const segmenter =
    typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
        ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
        : null;

export function emojiToCodePoint(emoji) {
    const raw = String(emoji || '');
    if (!raw) return '';
    const cps = [];
    for (const char of raw) {
        const cp = char.codePointAt(0);
        if (cp == null) continue;
        // Keep FE0F / ZWJ — Apple CDN paths often include them (e.g. 2764-fe0f.png)
        cps.push(cp.toString(16));
    }
    return cps.join('-');
}

export function appleEmojiUrl(emoji) {
    const cp = emojiToCodePoint(emoji);
    if (!cp) return '';
    return `${APPLE_EMOJI_CDN}/${cp}.png`;
}

/** Fallback URL without variation selector-16 (some assets omit fe0f). */
export function appleEmojiUrlFallback(emoji) {
    const raw = String(emoji || '');
    if (!raw) return '';
    const cps = [];
    for (const char of raw) {
        const cp = char.codePointAt(0);
        if (cp == null || cp === 0xfe0f) continue;
        cps.push(cp.toString(16));
    }
    const joined = cps.join('-');
    if (!joined) return '';
    return `${APPLE_EMOJI_CDN}/${joined}.png`;
}

export function splitGraphemes(text) {
    const s = String(text ?? '');
    if (!s) return [];
    if (segmenter) {
        return [...segmenter.segment(s)].map((part) => part.segment);
    }
    return Array.from(s);
}

export function isEmojiGrapheme(g) {
    if (!g) return false;
    try {
        return /\p{Extended_Pictographic}/u.test(g) || /\p{Regional_Indicator}{2}/u.test(g);
    } catch {
        return /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(g);
    }
}
