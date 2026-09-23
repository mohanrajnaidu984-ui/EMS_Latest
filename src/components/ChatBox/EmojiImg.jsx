import React, { useState } from 'react';
import { appleEmojiUrl, appleEmojiUrlFallback, isEmojiGrapheme, splitGraphemes } from './emojiUtils';

/**
 * Renders a single emoji as a crisp Apple-style image (WhatsApp look).
 * Falls back to native glyph if the CDN image is missing.
 */
export function EmojiImg({ emoji, size = 20, className = '', title }) {
    const primary = appleEmojiUrl(emoji);
    const fallback = appleEmojiUrlFallback(emoji);
    const [src, setSrc] = useState(primary);
    const [failed, setFailed] = useState(false);

    React.useEffect(() => {
        setSrc(primary);
        setFailed(false);
    }, [primary, emoji]);

    if (!emoji) return null;
    if (failed || !src) {
        return (
            <span className={`cb-emoji-native ${className}`} style={{ fontSize: size }} title={title}>
                {emoji}
            </span>
        );
    }

    return (
        <img
            className={`cb-emoji-img ${className}`}
            src={src}
            alt={emoji}
            title={title || emoji}
            width={size}
            height={size}
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => {
                if (fallback && src !== fallback) {
                    setSrc(fallback);
                } else {
                    setFailed(true);
                }
            }}
        />
    );
}

/** Replace emoji graphemes in plain text with Apple-style images. */
export function EmojiText({ text, size = 18, className = '', highlight }) {
    const value = String(text ?? '');
    if (!value) return null;

    const q = String(highlight || '').trim();
    if (q) {
        const parts = [];
        const lower = value.toLowerCase();
        const needle = q.toLowerCase();
        let start = 0;
        let idx = lower.indexOf(needle, start);
        let key = 0;
        while (idx !== -1) {
            if (idx > start) parts.push(value.slice(start, idx));
            parts.push(
                <mark key={`h-${key++}`} className="cb-search-mark">
                    {value.slice(idx, idx + needle.length)}
                </mark>
            );
            start = idx + needle.length;
            idx = lower.indexOf(needle, start);
        }
        if (start < value.length) parts.push(value.slice(start));
        return <span className={className}>{parts}</span>;
    }

    const parts = splitGraphemes(value);
    const hasEmoji = parts.some(isEmojiGrapheme);
    if (!hasEmoji) {
        return <span className={className}>{value}</span>;
    }

    return (
        <span className={`cb-emoji-text ${className}`}>
            {parts.map((part, i) =>
                isEmojiGrapheme(part) ? (
                    <EmojiImg key={`${part}-${i}`} emoji={part} size={size} />
                ) : (
                    <React.Fragment key={`t-${i}`}>{part}</React.Fragment>
                )
            )}
        </span>
    );
}

export default EmojiImg;
