/**
 * Retired with the custom A4 packer. Paged.js CSS fragmentation owns page breaks.
 * Kept as a no-op so legacy PDF prep paths that still import it do not throw.
 */
export function peelQuoteSheetsThatOverflowFooter() {
    return 0;
}
