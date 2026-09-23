/**
 * Shared HTML escaping for email templates.
 * Decodes common entities first so stored "&amp;" is not double-escaped to a visible "&amp;".
 */

function decodeBasicHtmlEntities(value) {
    return String(value ?? '')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#0*39;/g, "'")
        .replace(/&apos;/gi, "'");
}

function escapeHtml(value) {
    return decodeBasicHtmlEntities(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

module.exports = {
    decodeBasicHtmlEntities,
    escapeHtml,
};
